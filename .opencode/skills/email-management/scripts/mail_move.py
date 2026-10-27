#!/usr/bin/env python3
"""Plan application for IMAP mailboxes. Dry-run by default.

UIDs ARE NOT PORTABLE
---------------------
A UID identifies a message only inside one mailbox, and a move assigns a new
UID in the destination. A pre-move UID is therefore useless for verification
and unsafe for rollback. This tool records each message's Message-ID before it
moves and verifies/rolls back by provider search:

  Gmail:  UID SEARCH X-GM-RAW "rfc822msgid:<...>"
  Other:  UID SEARCH HEADER Message-ID "<...>"

Every verification checks that the message is present in the destination label
and absent from the source folder. It never reuses the old UID.

Safety model
------------
- No --apply: print the exact planned UIDs, subjects, counts, transport, and
  the rollback path. Nothing is created, moved, flagged, copied, or expunged.
- --apply: create the destination label only if it is missing, then move in
  bounded chunks. Record a private (0600) rollback file before the first
  mutation and update it after every chunk.
- MOVE capability: one atomic UID MOVE per chunk.
- No MOVE, Gmail: UID COPY then remove the source label with -X-GM-LABELS.
- No MOVE, classic IMAP: UID COPY + \\Deleted + targeted UID EXPUNGE only when
  the operator passes --delete-source and UIDPLUS is advertised. A bare
  EXPUNGE is never run. Without --delete-source the tool refuses rather than
  silently leaving duplicates.
- Destinations named Spam, Junk, Trash, Deleted, or Bin are refused, including
  localized names that carry provider \\Spam, \\Junk, or \\Trash special-use
  flags. INBOX is not a valid move destination.
- A move requires source_folder and uidvalidity from the plan, or both
  --source-folder and --uidvalidity explicitly; it never defaults to INBOX.
- Server count deltas must agree with the planned movement or the run exits
  non-zero. Account addresses are masked in output.
- The tool never deletes a message except in the explicit --delete-source
  fallback, and it never targets a provider spam/trash folder.
- --verify confirms each message by Message-ID with provider search. It can
  run after --apply, after --rollback, or standalone against a rollback file.

Counts come from server STATUS after NOOP. Gmail can lag behind a mutation; the
Message-ID verification is authoritative, not the delta. This tool is not
idempotent on classic IMAP: applying the same plan twice can create duplicate
copies. Always take a fresh dry-run and keep the rollback file.

Rollback file shape
-------------------
{
  "schema": "email-management/mail-move/1",
  "created": "2026-01-01T00:00:00Z",
  "server": "IMAP_HOST",
  "account": "USER@example.com",
  "action": "move",
  "destination": "LABEL_NAME",
  "source_folder": "INBOX",
  "source_uidvalidity": 1,
  "transport": "MOVE",
  "items": [
    {"message_id": "<id@example.com>", "from_mailbox": "INBOX",
     "from_uidvalidity": 1, "from_uid": 100, "to_uid": 200,
     "subject": "...", "status": "moved"}
  ]
}

--rollback moves items from `destination` back to `source_folder`, locating
each one by Message-ID (falling back to to_uid only when no Message-ID exists).
It writes a reversed rollback file so the rollback itself can be redone. The
file contains private headers; keep it in a private temporary directory and
delete it when the user accepts the result.
"""

from __future__ import annotations

import argparse
import imaplib
import json
import os
import re
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mail_common import (
    MailError,
    MailSession,
    add_connection_arguments,
    chunked,
    chunked_uid_fetch,
    connect_from_args,
    encode_modified_utf7,
    find_folder,
    folder_status,
    list_folders,
    mask_account,
    noop,
    parse_header_block,
    quote_imap_string,
    quote_mailbox,
    select_folder,
    shorten,
    write_json_atomic,
)

SCHEMA = "email-management/mail-move/1"
DEFAULT_CHUNK_SIZE = 100

UNSAFE_DESTINATION_SEGMENTS = frozenset(
    {
        "spam",
        "junk",
        "junk e-mail",
        "junk email",
        "bulk mail",
        "trash",
        "deleted",
        "deleted items",
        "deleted messages",
        "bin",
    }
)

GMAIL_SYSTEM_LABELS = {
    "\\inbox": "\\Inbox",
    "\\all": "\\All",
    "\\sent": "\\Sent",
    "\\drafts": "\\Drafts",
    "\\spam": "\\Spam",
    "\\trash": "\\Trash",
    "\\flagged": "\\Flagged",
    "\\important": "\\Important",
}


@dataclass
class MoveItem:
    """One message in a move or rollback record."""

    from_uid: int
    message_id: str = ""
    subject: str = ""
    to_uid: int | None = None
    status: str = "pending"


@dataclass
class RollbackData:
    path: str
    destination: str
    source_folder: str
    items: list[MoveItem]
    server: str = ""
    account: str = ""
    source_uidvalidity: int | None = None
    transport: str = ""


def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _unsafe_segments(name: str) -> list[str]:
    segments = [segment.strip().casefold() for segment in name.split("/")]
    return [
        segment
        for segment in segments
        if segment in UNSAFE_DESTINATION_SEGMENTS
    ]


def validate_destination_label(label: str) -> str:
    label = label.strip()
    if not label:
        raise MailError("--label must not be empty")
    if len(label) > 255:
        raise MailError("destination label is longer than 255 characters")
    if any(ord(character) < 32 for character in label):
        raise MailError("destination label contains a control character")
    if label.casefold() == "inbox":
        raise MailError("INBOX is a source folder, not a move destination")
    unsafe = _unsafe_segments(label)
    if unsafe:
        raise MailError(
            f"refusing to use a spam/trash folder as the destination: {label!r}; "
            "choose a user label instead"
        )
    return label


def validate_rollback_source(name: str) -> str:
    """Validate a rollback target. INBOX is allowed; spam/trash/bin is not."""
    name = validate_folder(name)
    unsafe = _unsafe_segments(name)
    if unsafe:
        raise MailError(
            f"refusing to roll back into a spam/trash/bin folder: {name!r}"
        )
    return name


def validate_folder(name: str) -> str:
    name = name.strip()
    if not name:
        raise MailError("folder name must not be empty")
    if any(ord(character) < 32 for character in name):
        raise MailError("folder name contains a control character")
    return name


def folder_flags(
    session: MailSession, name: str, *, casefold: bool = False
) -> list[str]:
    for folder in list_folders(session.connection):
        if folder["name"] == name or (
            casefold and folder["name"].casefold() == name.casefold()
        ):
            return [str(flag) for flag in folder["flags"]]
    return []


def unsafe_special_use_flags(flags: Iterable[str]) -> list[str]:
    """Return provider special-use flags that mean spam/trash/bin."""
    unsafe_flags = {
        "\\spam",
        "\\junk",
        "\\trash",
        "\\bin",
        "\\deleted",
        "\\deleteditems",
    }
    return sorted({str(flag).casefold() for flag in flags} & unsafe_flags)


def refuse_unsafe_special_use(
    session: MailSession, name: str, role: str, *, casefold: bool = False
) -> None:
    matched = unsafe_special_use_flags(
        folder_flags(session, name, casefold=casefold)
    )
    if matched:
        raise MailError(
            f"refusing {role} {name!r}: provider special-use flag(s) "
            f"{', '.join(matched)} mark it as spam/trash/bin"
        )


def expand_uid_set(value: str) -> list[int]:
    """Expand an IMAP sequence set such as 1,3:5 into integers."""
    result: list[int] = []
    for part in value.split(","):
        if not part:
            continue
        if ":" in part:
            start_text, end_text = part.split(":", 1)
            start, end = int(start_text), int(end_text)
            step = 1 if start <= end else -1
            result.extend(range(start, end + step, step))
        else:
            result.append(int(part))
    return result


def parse_copyuid(data: Iterable[Any] | None) -> dict[int, int]:
    """Best-effort parse of a UIDPLUS COPYUID response code."""
    for item in data or []:
        if isinstance(item, tuple):
            item = item[0]
        if not isinstance(item, bytes):
            continue
        text = item.decode("ascii", "replace")
        match = re.search(
            r"\[COPYUID\s+\d+\s+([0-9,:]+)\s+([0-9,:]+)\]", text
        )
        if not match:
            continue
        try:
            source_uids = expand_uid_set(match.group(1))
            destination_uids = expand_uid_set(match.group(2))
        except ValueError:
            continue
        if len(source_uids) != len(destination_uids):
            continue
        return dict(zip(source_uids, destination_uids))
    return {}


def parse_uid_json(value: Any, context: str) -> list[int]:
    if not isinstance(value, list):
        raise MailError(f"{context}: uids must be a JSON array")
    uids: set[int] = set()
    for item in value:
        if isinstance(item, bool) or not isinstance(item, int) or item <= 0:
            raise MailError(f"{context}: every uid must be a positive integer")
        uids.add(item)
    return sorted(uids)


def load_uid_file(path: str) -> tuple[list[int], dict[str, Any]]:
    """Load a JSON array, or an object with uids/source_folder/uidvalidity."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except OSError as exc:
        raise MailError(f"cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise MailError(f"{path}: invalid JSON: {exc}") from exc

    if isinstance(payload, list):
        return parse_uid_json(payload, path), {}
    if not isinstance(payload, dict):
        raise MailError(f"{path}: expected a JSON array or object")
    if "uids" not in payload:
        raise MailError(f"{path}: object must contain a 'uids' array")
    uids = parse_uid_json(payload["uids"], path)
    metadata: dict[str, Any] = {}
    source_folder = payload.get("source_folder")
    if source_folder is not None:
        if not isinstance(source_folder, str):
            raise MailError(f"{path}: source_folder must be a string")
        metadata["source_folder"] = validate_folder(source_folder)
    uidvalidity = payload.get("uidvalidity")
    if uidvalidity is not None:
        if (
            isinstance(uidvalidity, bool)
            or not isinstance(uidvalidity, int)
            or uidvalidity < 1
        ):
            raise MailError(f"{path}: uidvalidity must be a positive integer")
        metadata["uidvalidity"] = uidvalidity
    return uids, metadata


def load_rollback(path: str) -> RollbackData:
    if path == "-":
        raise MailError("--rollback needs a file path, not stdin")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except OSError as exc:
        raise MailError(f"cannot read rollback file {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise MailError(f"{path}: invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise MailError(f"{path}: rollback file must be a JSON object")

    destination = payload.get("destination")
    if not isinstance(destination, str) or not destination.strip():
        raise MailError(f"{path}: missing destination label")
    destination = validate_folder(destination)

    raw_items = payload.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise MailError(f"{path}: rollback file has no items")

    source_folder = payload.get("source_folder")
    if source_folder is None:
        first = raw_items[0] if isinstance(raw_items[0], dict) else {}
        source_folder = first.get("from_mailbox")
    if not isinstance(source_folder, str) or not source_folder.strip():
        raise MailError(f"{path}: missing source_folder/from_mailbox")
    source_folder = validate_rollback_source(source_folder)

    source_uidvalidity = payload.get("source_uidvalidity")
    if (
        isinstance(source_uidvalidity, bool)
        or not isinstance(source_uidvalidity, int)
        or source_uidvalidity < 1
    ):
        raise MailError(
            f"{path}: source_uidvalidity is required and must be a positive "
            "integer"
        )

    items: list[MoveItem] = []
    for index, raw in enumerate(raw_items, 1):
        if not isinstance(raw, dict):
            raise MailError(f"{path}: item {index} must be an object")
        message_id = str(raw.get("message_id") or "").strip()
        to_uid = raw.get("to_uid")
        from_uid = raw.get("from_uid")
        if to_uid is not None and (
            isinstance(to_uid, bool) or not isinstance(to_uid, int) or to_uid <= 0
        ):
            raise MailError(f"{path}: item {index} has an invalid to_uid")
        if from_uid is not None and (
            isinstance(from_uid, bool)
            or not isinstance(from_uid, int)
            or from_uid <= 0
        ):
            raise MailError(f"{path}: item {index} has an invalid from_uid")
        if not message_id and to_uid is None:
            raise MailError(
                f"{path}: item {index} has neither message_id nor to_uid; "
                "it cannot be located after the move"
            )
        items.append(
            MoveItem(
                from_uid=from_uid or 0,
                message_id=message_id,
                subject=str(raw.get("subject") or ""),
                to_uid=to_uid,
                status=str(raw.get("status") or "moved"),
            )
        )

    return RollbackData(
        path=path,
        destination=destination,
        source_folder=source_folder,
        items=items,
        server=str(payload.get("server") or ""),
        account=str(payload.get("account") or ""),
        source_uidvalidity=source_uidvalidity,
        transport=str(payload.get("transport") or ""),
    )


def check_same_account(session: MailSession, data: RollbackData) -> None:
    if data.account and data.account.casefold() != session.user.casefold():
        raise MailError(
            f"rollback file belongs to account {mask_account(data.account)!r}, "
            f"not {mask_account(session.user)!r}; refusing to cross accounts"
        )
    if data.server and data.server.casefold() != session.host.casefold():
        raise MailError(
            f"rollback file belongs to server {data.server!r}, "
            f"not {session.host!r}; refusing to cross servers"
        )


def gmail_label_for_folder(session: MailSession, folder: str) -> str:
    """Map a selected Gmail folder to the X-GM-LABELS system label."""
    if folder.casefold() == "inbox":
        return "\\Inbox"
    for candidate in list_folders(session.connection):
        if candidate["name"] != folder:
            continue
        for flag in candidate["flags"]:
            mapped = GMAIL_SYSTEM_LABELS.get(flag.casefold())
            if mapped:
                return mapped
    return folder


def transport_description(session: MailSession, delete_source: bool) -> str:
    if session.supports_move:
        return "UID MOVE"
    if session.is_gmail:
        return "UID COPY + remove source X-GM-LABELS"
    if delete_source:
        return "UID COPY + \\Deleted + targeted UID EXPUNGE"
    return "unavailable"


def preflight_transport(session: MailSession, delete_source: bool) -> None:
    if session.supports_move or session.is_gmail:
        return
    if not delete_source:
        raise MailError(
            "this server does not advertise MOVE and is not Gmail. A move would "
            "need COPY + \\Deleted. Re-run with --delete-source if you explicitly "
            "accept that fallback, or use a server that supports MOVE."
        )
    if not session.supports_uidplus:
        raise MailError(
            "this server lacks UIDPLUS, so a targeted UID EXPUNGE is impossible. "
            "Refusing to run a bare EXPUNGE, which could remove unrelated mail."
        )


def ensure_label(
    session: MailSession, label: str, *, apply: bool
) -> tuple[str, bool]:
    """Return (server label name, existed). Create only when apply is true."""
    existing = find_folder(
        session.connection, label, casefold=session.is_gmail
    )
    if existing:
        return existing, True
    if not apply:
        return label, False
    try:
        status, data = session.connection.create(quote_mailbox(label))
    except imaplib.IMAP4.error as exc:
        raise MailError(f"cannot create label {label!r}: {exc}") from exc
    if status != "OK":
        existing = find_folder(
            session.connection, label, casefold=session.is_gmail
        )
        if existing:
            return existing, True
        detail = " ".join(
            item.decode("ascii", "replace") if isinstance(item, bytes) else str(item)
            for item in (data or [])
        )
        raise MailError(f"cannot create label {label!r}: {status} {detail}".strip())
    print(f"mail_move: created label {label!r}", file=sys.stderr)
    return label, True


def safe_count(session: MailSession, folder: str) -> int | None:
    """Read server MESSAGES, returning None if STATUS/EXAMINE fails."""
    try:
        return folder_status(session.connection, folder).get("MESSAGES")
    except MailError:
        return None


def fetch_identities(
    session: MailSession, uids: Sequence[int], chunk_size: int
) -> dict[int, tuple[str, str]]:
    """Fetch Message-ID and Subject headers only (BODY.PEEK)."""
    identities: dict[int, tuple[str, str]] = {}
    items = "(UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT)])"
    for _batch, parsed in chunked_uid_fetch(
        session.connection, list(uids), items, chunk_size
    ):
        for record in parsed:
            headers = parse_header_block(record["headers"])
            identities[record["uid"]] = (
                headers.get("message-id", "").strip(),
                headers.get("subject", ""),
            )
    return identities


def perform_chunk(
    session: MailSession,
    uids: Sequence[int],
    source: str,
    destination: str,
    *,
    delete_source: bool,
    gmail_source_label: str,
) -> dict[int, int]:
    """Move one chunk. The source folder must already be selected read-write."""
    connection = session.connection
    uid_set = ",".join(str(uid) for uid in uids)

    if session.supports_move:
        try:
            status, data = connection.uid(
                "MOVE", uid_set, quote_mailbox(destination)
            )
        except imaplib.IMAP4.error as exc:
            raise MailError(f"UID MOVE failed for {uid_set}: {exc}") from exc
        if status != "OK":
            raise MailError(f"UID MOVE returned {status} for {uid_set}")
        return parse_copyuid(data)

    if session.is_gmail:
        try:
            status, data = connection.uid(
                "COPY", uid_set, quote_mailbox(destination)
            )
        except imaplib.IMAP4.error as exc:
            raise MailError(f"UID COPY failed for {uid_set}: {exc}") from exc
        if status != "OK":
            raise MailError(f"UID COPY returned {status} for {uid_set}")
        copyuid = parse_copyuid(data)
        encoded_label = encode_modified_utf7(gmail_source_label)
        label_list = "(" + quote_imap_string(encoded_label) + ")"
        try:
            status, _ = connection.uid(
                "STORE", uid_set, "-X-GM-LABELS", label_list
            )
        except imaplib.IMAP4.error as exc:
            raise MailError(
                "COPY succeeded but removing the source label failed; messages "
                f"may be in both folders. Inspect before retrying: {exc}"
            ) from exc
        if status != "OK":
            raise MailError(
                "COPY succeeded but removing the source X-GM-LABELS failed; "
                "messages may be in both folders. Inspect before retrying."
            )
        return copyuid

    if not delete_source:
        raise MailError(
            "server has no MOVE; refusing to leave duplicate copies without "
            "--delete-source"
        )
    if not session.supports_uidplus:
        raise MailError(
            "server has no UIDPLUS; refusing a bare EXPUNGE that could remove "
            "unrelated deleted mail"
        )

    try:
        status, data = connection.uid(
            "COPY", uid_set, quote_mailbox(destination)
        )
    except imaplib.IMAP4.error as exc:
        raise MailError(f"UID COPY failed for {uid_set}: {exc}") from exc
    if status != "OK":
        raise MailError(f"UID COPY returned {status} for {uid_set}")
    copyuid = parse_copyuid(data)

    try:
        status, _ = connection.uid(
            "STORE", uid_set, "+FLAGS.SILENT", "(\\Deleted)"
        )
    except imaplib.IMAP4.error as exc:
        raise MailError(
            "COPY succeeded but marking the source \\Deleted failed; inspect "
            f"before retrying: {exc}"
        ) from exc
    if status != "OK":
        raise MailError(
            "COPY succeeded but marking the source \\Deleted failed; inspect "
            "before retrying"
        )

    try:
        status, _ = connection.uid("EXPUNGE", uid_set)
    except imaplib.IMAP4.error as exc:
        raise MailError(
            "source messages are marked \\Deleted but targeted UID EXPUNGE "
            f"failed; they remain recoverable until expunged: {exc}"
        ) from exc
    if status != "OK":
        raise MailError(
            "source messages are marked \\Deleted but targeted UID EXPUNGE "
            "failed; they remain recoverable until expunged"
        )
    return copyuid


def rollback_payload(
    session: MailSession,
    *,
    destination: str,
    source_folder: str,
    source_uidvalidity: int | None,
    items: Sequence[MoveItem],
    transport: str,
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "created": utc_now(),
        "server": session.host,
        "account": session.user,
        "action": "move",
        "destination": destination,
        "source_folder": source_folder,
        "source_uidvalidity": source_uidvalidity,
        "transport": transport,
        "items": [
            {
                "message_id": item.message_id,
                "from_mailbox": source_folder,
                "from_uidvalidity": source_uidvalidity,
                "from_uid": item.from_uid,
                "to_uid": item.to_uid,
                "subject": item.subject,
                "status": item.status,
            }
            for item in items
        ],
    }


def save_rollback(path: str, payload: Mapping[str, Any]) -> Path:
    return write_json_atomic(path, payload, mode=0o600)


def default_rollback_path(label: str, *, create: bool = False) -> str:
    safe_label = re.sub(r"[^A-Za-z0-9._-]+", "-", label).strip("-") or "label"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    state_home = Path(
        os.environ.get("XDG_STATE_HOME", "~/.local/state")
    ).expanduser()
    directory = state_home / "email-management" / "rollbacks"
    if create:
        try:
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            os.chmod(directory, 0o700)
        except OSError as exc:
            raise MailError(
                f"cannot create private rollback directory {directory}: {exc}; "
                "pass --rollback-out"
            ) from exc
    return str(directory / f"mail-move-rollback-{safe_label}-{stamp}.json")


def reverse_rollback_path(input_path: str, requested: str | None) -> str:
    if requested:
        return requested
    path = Path(input_path).expanduser()
    return str(path.with_name(path.stem + ".reversed.json"))


def find_message_uids(
    session: MailSession, folder: str, message_id: str
) -> list[int]:
    """Locate a message by Message-ID in a folder, using provider search."""
    select_folder(session.connection, folder, readonly=True)
    try:
        if session.is_gmail:
            criteria = f"rfc822msgid:{message_id}"
            status, data = session.connection.uid(
                "search", None, "X-GM-RAW", quote_imap_string(criteria)
            )
        else:
            criteria = f"HEADER Message-ID {quote_imap_string(message_id)}"
            status, data = session.connection.uid("search", None, criteria)
    except (imaplib.IMAP4.error, OSError, UnicodeEncodeError) as exc:
        raise MailError(
            f"search for {message_id!r} in {folder!r} failed: {exc}"
        ) from exc
    if status != "OK":
        raise MailError(
            f"search for {message_id!r} in {folder!r} returned {status}"
        )
    uids: set[int] = set()
    for item in data or []:
        if not isinstance(item, bytes):
            continue
        for token in item.split():
            try:
                uids.add(int(token))
            except ValueError:
                continue
    return sorted(uids)


def verify_items(
    session: MailSession,
    items: Sequence[MoveItem],
    *,
    source: str,
    destination: str,
) -> bool:
    """Verify each message is in destination and absent from source."""
    print(
        f"mail_move: verify by Message-ID: destination={destination!r} "
        f"source={source!r}",
        file=sys.stderr,
    )
    passed = 0
    failed = 0
    for item in items:
        label = f"uid {item.from_uid or '?'}"
        if not item.message_id:
            print(
                f"mail_move: verify {label}: FAIL no Message-ID recorded",
                file=sys.stderr,
            )
            failed += 1
            continue
        try:
            in_destination = find_message_uids(
                session, destination, item.message_id
            )
            in_source = find_message_uids(session, source, item.message_id)
        except MailError as exc:
            print(
                f"mail_move: verify {label}: FAIL search error: {exc}",
                file=sys.stderr,
            )
            failed += 1
            continue
        ok = bool(in_destination) and not in_source
        print(
            f"mail_move: verify {label}: "
            f"destination={'present' if in_destination else 'absent'} "
            f"source={'absent' if not in_source else 'present'} "
            f"{'PASS' if ok else 'FAIL'}",
            file=sys.stderr,
        )
        if ok:
            passed += 1
        else:
            failed += 1
    print(
        f"mail_move: verify summary: {passed} passed, {failed} failed, "
        f"{len(items)} total",
        file=sys.stderr,
    )
    return failed == 0


def print_counts(
    *,
    source: str,
    destination: str,
    source_before: int | None,
    destination_before: int | None,
    source_after: int | None,
    destination_after: int | None,
    moved: int,
) -> bool:
    def show(value: int | None) -> str:
        return "?" if value is None else str(value)

    def delta(before: int | None, after: int | None) -> str:
        if before is None or after is None:
            return "?"
        return f"{after - before:+d}"

    print(
        f"mail_move: counts (server STATUS): "
        f"{source} {show(source_before)} -> {show(source_after)} "
        f"({delta(source_before, source_after)}, expected {-moved:+d}); "
        f"{destination} {show(destination_before)} -> {show(destination_after)} "
        f"({delta(destination_before, destination_after)}, expected {moved:+d})",
        file=sys.stderr,
    )
    ok = True
    if (
        source_before is not None
        and source_after is not None
        and source_after - source_before != -moved
    ):
        ok = False
        print(
            "mail_move: ERROR: source count delta disagrees with the planned "
            "count; the server is authoritative and the result is not trusted",
            file=sys.stderr,
        )
    if (
        destination_before is not None
        and destination_after is not None
        and destination_after - destination_before != moved
    ):
        ok = False
        print(
            "mail_move: ERROR: destination count delta disagrees with the "
            "planned count; the server is authoritative and the result is not "
            "trusted",
            file=sys.stderr,
        )
    return ok


def resolve_move_scope(
    metadata: Mapping[str, Any], args: argparse.Namespace
) -> tuple[str, int]:
    """Require a complete plan scope or both explicit scope flags."""
    plan_source = metadata.get("source_folder")
    plan_uidvalidity = metadata.get("uidvalidity")
    cli_source = getattr(args, "source_folder", None)
    cli_uidvalidity = getattr(args, "uidvalidity", None)

    if cli_source and plan_source and cli_source != plan_source:
        raise MailError(
            f"--source-folder {cli_source!r} does not match the input file's "
            f"source_folder {plan_source!r}"
        )
    if (
        cli_uidvalidity is not None
        and plan_uidvalidity is not None
        and cli_uidvalidity != plan_uidvalidity
    ):
        raise MailError(
            f"--uidvalidity {cli_uidvalidity} does not match the input file's "
            f"uidvalidity {plan_uidvalidity}"
        )

    plan_complete = plan_source is not None and plan_uidvalidity is not None
    cli_complete = cli_source is not None and cli_uidvalidity is not None
    if not plan_complete and not cli_complete:
        raise MailError(
            "a move requires source_folder and uidvalidity from the plan, or "
            "BOTH --source-folder and --uidvalidity explicitly; refusing to "
            "default a mutation to INBOX"
        )

    if plan_complete:
        source = cli_source or plan_source
        uidvalidity = (
            cli_uidvalidity
            if cli_uidvalidity is not None
            else plan_uidvalidity
        )
    else:
        source = cli_source
        uidvalidity = cli_uidvalidity

    if (
        isinstance(uidvalidity, bool)
        or not isinstance(uidvalidity, int)
        or uidvalidity < 1
    ):
        raise MailError(
            "a move requires a positive uidvalidity; refusing to mutate "
            "without a UIDVALIDITY check"
        )
    return validate_folder(source), uidvalidity


def run_move(session: MailSession, args: argparse.Namespace) -> int:
    input_path = args.uids or args.from_plan
    uids, metadata = load_uid_file(input_path)
    source, expected_uidvalidity = resolve_move_scope(metadata, args)
    label = validate_destination_label(args.label)
    if not uids:
        print(
            "mail_move: nothing to move; the plan contains no MOVE uids",
            file=sys.stderr,
        )
        return 0
    preflight_transport(session, args.delete_source)

    print(
        f"mail_move: {'APPLY' if args.apply else 'DRY RUN - no changes will be made'}",
        file=sys.stderr,
    )
    print(
        f"mail_move: account {mask_account(session.user)} at {session.host}; "
        f"capabilities: {session.describe_capabilities()}",
        file=sys.stderr,
    )

    count, uidvalidity = select_folder(
        session.connection, source, readonly=not args.apply
    )
    if expected_uidvalidity is not None and uidvalidity != expected_uidvalidity:
        raise MailError(
            f"UIDVALIDITY for {source} is {uidvalidity}, but the input file "
            f"expects {expected_uidvalidity}; UIDs are stale, rescan the folder"
        )

    destination, existed = ensure_label(session, label, apply=args.apply)
    if destination != label:
        print(
            f"mail_move: using the server's existing label {destination!r} "
            f"for requested {label!r}",
            file=sys.stderr,
        )
    refuse_unsafe_special_use(
        session, destination, "destination", casefold=session.is_gmail
    )
    destination_before = safe_count(session, destination) if existed else None
    if not existed:
        print(
            f"mail_move: destination {destination!r} is missing; "
            + ("creating it" if args.apply else "would create it"),
            file=sys.stderr,
        )

    # Counts may have changed the selected mailbox if STATUS fell back to EXAMINE.
    select_folder(session.connection, source, readonly=not args.apply)
    identities = fetch_identities(session, uids, args.chunk_size)
    missing = [uid for uid in uids if uid not in identities]
    present = [uid for uid in uids if uid in identities]
    if not present:
        raise MailError(
            f"none of the {len(uids)} requested UIDs exist in {source}; "
            "the scan or source folder may be stale"
        )
    if missing:
        preview = ", ".join(str(uid) for uid in missing[:20])
        more = "" if len(missing) <= 20 else f" (+{len(missing) - 20} more)"
        print(
            f"mail_move: warning: {len(missing)} UIDs were not found in "
            f"{source}: {preview}{more}",
            file=sys.stderr,
        )

    items = []
    unverifiable: list[int] = []
    for uid in present:
        message_id, subject = identities[uid]
        if not message_id:
            unverifiable.append(uid)
            continue
        items.append(
            MoveItem(
                from_uid=uid,
                message_id=message_id,
                subject=subject,
            )
        )
    if unverifiable:
        preview = ", ".join(str(uid) for uid in unverifiable[:20])
        print(
            f"mail_move: warning: {len(unverifiable)} messages have no "
            f"Message-ID and will be skipped because they cannot be verified "
            f"or rolled back: {preview}",
            file=sys.stderr,
        )
    if not items:
        raise MailError(
            "none of the requested messages have a Message-ID; refusing to "
            "move mail that cannot be verified or rolled back"
        )

    print(
        f"mail_move: source {source!r} (UIDVALIDITY {uidvalidity}, "
        f"{count} messages)",
        file=sys.stderr,
    )
    print(
        f"mail_move: destination {destination!r} "
        f"({'exists' if existed else 'missing'}, "
        f"{destination_before if destination_before is not None else '?'} messages)",
        file=sys.stderr,
    )
    print(
        f"mail_move: transport: {transport_description(session, args.delete_source)}",
        file=sys.stderr,
    )
    if args.delete_source and (session.supports_move or session.is_gmail):
        print(
            "mail_move: note: --delete-source is ignored because this path "
            "does not need COPY + \\Deleted",
            file=sys.stderr,
        )
    print(f"mail_move: planned: {len(items)} messages", file=sys.stderr)
    for item in items:
        print(
            f"  uid {item.from_uid}  {item.message_id or '(no Message-ID)'}  "
            f"{shorten(item.subject, 68)}",
            file=sys.stderr,
        )

    rollback_path = args.rollback_out or default_rollback_path(
        destination, create=args.apply
    )
    if os.path.abspath(rollback_path) == os.path.abspath(input_path):
        raise MailError(
            "--rollback-out must not overwrite the input plan or UID file"
        )
    if not args.apply:
        print(
            f"mail_move: rollback file would be written to {rollback_path} "
            "(not written in dry-run)",
            file=sys.stderr,
        )
        print_counts(
            source=source,
            destination=destination,
            source_before=count,
            destination_before=destination_before,
            source_after=count,
            destination_after=destination_before,
            moved=0,
        )
        print(
            "mail_move: dry-run complete; nothing was created, moved, or deleted",
            file=sys.stderr,
        )
        return 0

    # Re-read state immediately before the first mutation.
    count, uidvalidity_now = select_folder(
        session.connection, source, readonly=False
    )
    if uidvalidity_now != uidvalidity:
        raise MailError(
            f"UIDVALIDITY for {source} changed from {uidvalidity} to "
            f"{uidvalidity_now}; aborting before any mutation"
        )
    if existed:
        destination_before = safe_count(session, destination)
        select_folder(session.connection, source, readonly=False)

    transport = transport_description(session, args.delete_source)
    rollback = rollback_payload(
        session,
        destination=destination,
        source_folder=source,
        source_uidvalidity=uidvalidity,
        items=items,
        transport=transport,
    )
    saved = save_rollback(rollback_path, rollback)
    print(
        f"mail_move: rollback file -> {saved} (mode 0600, written before the "
        "first mutation)",
        file=sys.stderr,
    )

    gmail_source_label = (
        gmail_label_for_folder(session, source) if session.is_gmail else source
    )
    moved = 0
    for batch in chunked([item.from_uid for item in items], args.chunk_size):
        count_now, uidvalidity_now = select_folder(
            session.connection, source, readonly=False
        )
        if uidvalidity_now != uidvalidity:
            raise MailError(
                f"UIDVALIDITY for {source} changed during the run; stopped "
                f"after {moved} messages. Rollback file: {saved}"
            )
        try:
            copyuid = perform_chunk(
                session,
                batch,
                source,
                destination,
                delete_source=args.delete_source,
                gmail_source_label=gmail_source_label,
            )
        except MailError as exc:
            for item in items:
                if item.from_uid in batch and item.status == "pending":
                    item.status = "unknown"
            save_rollback(
                rollback_path,
                rollback_payload(
                    session,
                    destination=destination,
                    source_folder=source,
                    source_uidvalidity=uidvalidity,
                    items=items,
                    transport=transport,
                ),
            )
            raise MailError(
                f"stopped after {moved} messages in this run; rollback file: "
                f"{saved}. {exc}"
            ) from exc
        for item in items:
            if item.from_uid in batch:
                item.status = "moved"
                item.to_uid = copyuid.get(item.from_uid)
        moved += len(batch)
        save_rollback(
            rollback_path,
            rollback_payload(
                session,
                destination=destination,
                source_folder=source,
                source_uidvalidity=uidvalidity,
                items=items,
                transport=transport,
            ),
        )
        print(
            f"mail_move: moved {moved}/{len(items)} "
            f"(source reported {count_now} before this batch)",
            file=sys.stderr,
        )

    noop(session.connection)
    source_after = safe_count(session, source)
    destination_after = safe_count(session, destination)
    counts_ok = print_counts(
        source=source,
        destination=destination,
        source_before=count,
        destination_before=destination_before if existed else 0,
        source_after=source_after,
        destination_after=destination_after,
        moved=moved,
    )
    print(
        f"mail_move: moved {moved} messages; rollback file: {saved}",
        file=sys.stderr,
    )

    verified_ok = True
    if args.verify == "":
        verified_ok = verify_items(
            session, items, source=source, destination=destination
        )
        if not verified_ok:
            print(
                "mail_move: verification failed; keep the rollback file and "
                "inspect before retrying",
                file=sys.stderr,
            )
    if not counts_ok:
        print(
            "mail_move: ERROR: server count delta mismatch; not reporting "
            f"success. Keep the rollback file: {saved}",
            file=sys.stderr,
        )
        return 1
    if not verified_ok:
        return 1
    return 0


def resolve_rollback_uids(
    session: MailSession, data: RollbackData
) -> tuple[list[MoveItem], list[MoveItem]]:
    """Locate rollback items in the destination label."""
    found: list[MoveItem] = []
    missing: list[MoveItem] = []
    for item in data.items:
        current_uid: int | None = None
        if item.message_id:
            try:
                matches = find_message_uids(
                    session, data.destination, item.message_id
                )
            except MailError as exc:
                print(
                    f"mail_move: cannot search for {item.message_id}: {exc}",
                    file=sys.stderr,
                )
                matches = []
            if len(matches) == 1:
                current_uid = matches[0]
            elif len(matches) > 1:
                print(
                    f"mail_move: ambiguous Message-ID {item.message_id}: "
                    f"{len(matches)} matches in {data.destination!r}; skipping",
                    file=sys.stderr,
                )
        elif item.to_uid is not None:
            current_uid = item.to_uid
        if current_uid is None:
            missing.append(item)
            continue
        found.append(
            MoveItem(
                from_uid=current_uid,
                message_id=item.message_id,
                subject=item.subject,
                status="pending",
            )
        )
    return found, missing


def run_rollback(session: MailSession, args: argparse.Namespace) -> int:
    data = load_rollback(args.rollback)
    check_same_account(session, data)
    preflight_transport(session, args.delete_source)
    connection = session.connection

    print(
        f"mail_move: {'APPLY' if args.apply else 'DRY RUN - no changes will be made'} "
        f"(rollback {data.path})",
        file=sys.stderr,
    )
    print(
        f"mail_move: account {mask_account(session.user)} at {session.host}; "
        f"capabilities: {session.describe_capabilities()}",
        file=sys.stderr,
    )
    print(
        f"mail_move: from {data.destination!r} back to {data.source_folder!r}",
        file=sys.stderr,
    )

    if not find_folder(connection, data.destination, casefold=session.is_gmail):
        raise MailError(
            f"destination label {data.destination!r} no longer exists; "
            "there is nothing to roll back there"
        )
    if not find_folder(connection, data.source_folder, casefold=session.is_gmail):
        raise MailError(
            f"source folder {data.source_folder!r} no longer exists; "
            "cannot roll back into it"
        )
    refuse_unsafe_special_use(
        session,
        data.source_folder,
        "rollback source",
        casefold=session.is_gmail,
    )
    _, source_uidvalidity_now = select_folder(
        connection, data.source_folder, readonly=True
    )
    if source_uidvalidity_now != data.source_uidvalidity:
        raise MailError(
            f"rollback source {data.source_folder!r} has UIDVALIDITY "
            f"{source_uidvalidity_now}, but the file records "
            f"{data.source_uidvalidity}; refusing to act on stale UIDs"
        )

    destination_before = safe_count(session, data.destination)
    source_before = safe_count(session, data.source_folder)
    found, missing = resolve_rollback_uids(session, data)
    if not found:
        raise MailError(
            f"none of the {len(data.items)} rollback items were found by "
            f"Message-ID in {data.destination!r}"
        )
    if missing:
        print(
            f"mail_move: warning: {len(missing)} items were not found or were "
            "ambiguous; they will be skipped and reported",
            file=sys.stderr,
        )

    print(
        f"mail_move: planned rollback: {len(found)} of {len(data.items)} messages",
        file=sys.stderr,
    )
    for item in found:
        print(
            f"  current uid {item.from_uid}  "
            f"{item.message_id or '(no Message-ID)'}  "
            f"{shorten(item.subject, 68)}",
            file=sys.stderr,
        )

    reversed_path = reverse_rollback_path(data.path, args.rollback_out)
    if os.path.abspath(reversed_path) == os.path.abspath(data.path):
        raise MailError(
            "--rollback-out must not overwrite the rollback file being read"
        )
    if not args.apply:
        print(
            f"mail_move: reversed rollback file would be written to "
            f"{reversed_path} (not written in dry-run)",
            file=sys.stderr,
        )
        print_counts(
            source=data.destination,
            destination=data.source_folder,
            source_before=destination_before,
            destination_before=source_before,
            source_after=destination_before,
            destination_after=source_before,
            moved=0,
        )
        print(
            "mail_move: dry-run complete; nothing was moved or deleted",
            file=sys.stderr,
        )
        return 0

    # Re-read state immediately before the first mutation and record the source
    # UIDVALIDITY of the reversed operation (the label we are leaving).
    _, uidvalidity = select_folder(
        connection, data.destination, readonly=False
    )
    if uidvalidity is None:
        raise MailError(
            f"server did not report UIDVALIDITY for {data.destination!r}; "
            "refusing to write an unverifiable rollback record"
        )
    destination_before = safe_count(session, data.destination)
    source_before = safe_count(session, data.source_folder)
    select_folder(connection, data.destination, readonly=False)
    transport = transport_description(session, args.delete_source)
    reversed_payload = rollback_payload(
        session,
        destination=data.source_folder,
        source_folder=data.destination,
        source_uidvalidity=uidvalidity,
        items=found,
        transport=transport,
    )
    saved = save_rollback(reversed_path, reversed_payload)
    print(
        f"mail_move: reversed rollback file -> {saved} (mode 0600, written "
        "before the first mutation)",
        file=sys.stderr,
    )

    gmail_source_label = (
        gmail_label_for_folder(session, data.destination)
        if session.is_gmail
        else data.destination
    )
    moved = 0
    for batch in chunked([item.from_uid for item in found], args.chunk_size):
        _, uidvalidity_now = select_folder(
            connection, data.destination, readonly=False
        )
        if uidvalidity_now != uidvalidity:
            raise MailError(
                f"UIDVALIDITY for {data.destination} changed during the "
                f"rollback; stopped after {moved} messages. Reversed rollback "
                f"file: {saved}"
            )
        try:
            copyuid = perform_chunk(
                session,
                batch,
                data.destination,
                data.source_folder,
                delete_source=args.delete_source,
                gmail_source_label=gmail_source_label,
            )
        except MailError as exc:
            for item in found:
                if item.from_uid in batch and item.status == "pending":
                    item.status = "unknown"
            save_rollback(
                reversed_path,
                rollback_payload(
                    session,
                    destination=data.source_folder,
                    source_folder=data.destination,
                    source_uidvalidity=uidvalidity,
                    items=found,
                    transport=transport,
                ),
            )
            raise MailError(
                f"rollback stopped after {moved} messages; reversed rollback "
                f"file: {saved}. {exc}"
            ) from exc
        for item in found:
            if item.from_uid in batch:
                item.status = "moved"
                item.to_uid = copyuid.get(item.from_uid)
        moved += len(batch)
        save_rollback(
            reversed_path,
            rollback_payload(
                session,
                destination=data.source_folder,
                source_folder=data.destination,
                source_uidvalidity=uidvalidity,
                items=found,
                transport=transport,
            ),
        )
        print(
            f"mail_move: rolled back {moved}/{len(found)}",
            file=sys.stderr,
        )

    noop(connection)
    destination_after = safe_count(session, data.destination)
    source_after = safe_count(session, data.source_folder)
    counts_ok = print_counts(
        source=data.destination,
        destination=data.source_folder,
        source_before=destination_before,
        destination_before=source_before,
        source_after=destination_after,
        destination_after=source_after,
        moved=moved,
    )
    print(
        f"mail_move: rolled back {moved} messages; reversed rollback file: {saved}",
        file=sys.stderr,
    )

    verified_ok = True
    if args.verify == "":
        verified_ok = verify_items(
            session,
            found,
            source=data.destination,
            destination=data.source_folder,
        )
        if not verified_ok:
            print(
                "mail_move: rollback verification failed; keep both rollback "
                "files and inspect before retrying",
                file=sys.stderr,
            )
    if not counts_ok:
        print(
            "mail_move: ERROR: server count delta mismatch after rollback; not "
            f"reporting success. Keep the rollback files: {saved}",
            file=sys.stderr,
        )
        return 1
    if not verified_ok:
        return 1
    if missing:
        return 1
    return 0


def run_verify_file(session: MailSession, path: str) -> int:
    data = load_rollback(path)
    check_same_account(session, data)
    print(
        f"mail_move: verify-only {data.path}: destination={data.destination!r} "
        f"source={data.source_folder!r}",
        file=sys.stderr,
    )
    ok = verify_items(
        session, data.items, source=data.source_folder, destination=data.destination
    )
    return 0 if ok else 1


# ---------------------------------------------------------------------------
# Self-test (pure helpers only; no network, no mailbox)
# ---------------------------------------------------------------------------


def _check(condition: bool, message: str, checks: list[str]) -> None:
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def self_test() -> int:
    checks: list[str] = []
    try:
        _check(
            validate_destination_label("Filed/2026") == "Filed/2026",
            "accepts an ordinary label",
            checks,
        )
        for unsafe in ("Spam", "Junk", "[Gmail]/Trash", "Deleted Items", "INBOX"):
            rejected = False
            try:
                validate_destination_label(unsafe)
            except MailError:
                rejected = True
            _check(rejected, f"rejects unsafe destination {unsafe!r}", checks)

        _check(
            expand_uid_set("1,3:5") == [1, 3, 4, 5],
            "expands UID sequence sets",
            checks,
        )
        _check(
            parse_copyuid([b"OK [COPYUID 1 10:11 20:21] done"])
            == {10: 20, 11: 21},
            "parses COPYUID mappings",
            checks,
        )
        _check(
            parse_copyuid([None, b"no code here"]) == {},
            "ignores missing COPYUID",
            checks,
        )

        uids = parse_uid_json([3, 1, 3, 2], "fixture")
        _check(uids == [1, 2, 3], "deduplicates and sorts UIDs", checks)

        rejected = False
        try:
            parse_uid_json([0, 1], "fixture")
        except MailError:
            rejected = True
        _check(rejected, "rejects non-positive UIDs", checks)

        _check(
            reverse_rollback_path("mail-move-rollback-example.json", None)
            == "mail-move-rollback-example.reversed.json",
            "derives the reversed rollback path",
            checks,
        )
        _check(
            validate_rollback_source("INBOX") == "INBOX",
            "permits INBOX as a rollback source",
            checks,
        )
        for unsafe in ("Spam", "Junk", "[Gmail]/Trash", "Deleted Items"):
            rejected = False
            try:
                validate_rollback_source(unsafe)
            except MailError:
                rejected = True
            _check(
                rejected,
                f"rejects unsafe rollback source {unsafe!r}",
                checks,
            )

        _check(
            unsafe_special_use_flags(["\\HasNoChildren"]) == [],
            "ordinary special-use flags are safe",
            checks,
        )
        _check(
            unsafe_special_use_flags(["\\Junk"]) == ["\\junk"],
            "localized/provider Junk flag is refused",
            checks,
        )
        _check(
            unsafe_special_use_flags(["\\Trash"]) == ["\\trash"],
            "provider Trash flag is refused",
            checks,
        )

        missing_scope = ""
        try:
            resolve_move_scope(
                {},
                argparse.Namespace(source_folder=None, uidvalidity=None),
            )
        except MailError as exc:
            missing_scope = str(exc)
        _check(
            "refusing to default" in missing_scope,
            "refuses a move without an explicit source folder",
            checks,
        )

        mixed_scope = ""
        try:
            resolve_move_scope(
                {"source_folder": "INBOX"},
                argparse.Namespace(source_folder=None, uidvalidity=7),
            )
        except MailError as exc:
            mixed_scope = str(exc)
        _check(
            "BOTH --source-folder and --uidvalidity" in mixed_scope,
            "refuses a mixed plan/flag scope",
            checks,
        )

        scope = resolve_move_scope(
            {"source_folder": "INBOX", "uidvalidity": 7},
            argparse.Namespace(source_folder=None, uidvalidity=None),
        )
        _check(
            scope == ("INBOX", 7),
            "accepts source_folder and uidvalidity from a plan",
            checks,
        )
        scope = resolve_move_scope(
            {},
            argparse.Namespace(source_folder="Archive", uidvalidity=9),
        )
        _check(
            scope == ("Archive", 9),
            "accepts explicit source_folder and uidvalidity",
            checks,
        )
    except AssertionError as exc:
        print(f"mail_move self-test: FAIL: {exc}", file=sys.stderr)
        return 1
    except MailError as exc:
        print(f"mail_move self-test: FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"mail_move self-test: PASS ({len(checks)} checks)")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Apply a reviewed move plan. Dry-run by default; only --apply "
            "mutates. Verifies by Message-ID because UIDs change on move."
        )
    )
    add_connection_arguments(parser)
    parser.add_argument(
        "--label",
        metavar="NAME",
        help="destination label/folder (created only with --apply)",
    )
    source_group = parser.add_mutually_exclusive_group()
    source_group.add_argument(
        "--uids",
        metavar="PATH.json",
        help="JSON array of UIDs, or an object with uids/source_folder/uidvalidity",
    )
    source_group.add_argument(
        "--from-plan",
        metavar="PATH.json",
        help="mail_triage.py plan JSON; acts on its MOVE-only 'uids' array",
    )
    source_group.add_argument(
        "--rollback",
        metavar="PATH.json",
        help="rollback file from a previous --apply; dry-run unless --apply",
    )
    parser.add_argument(
        "--source-folder",
        metavar="NAME",
        help=(
            "source mailbox; required with --uidvalidity unless the plan "
            "supplies both (never defaults a move to INBOX)"
        ),
    )
    parser.add_argument(
        "--uidvalidity",
        type=int,
        metavar="N",
        help=(
            "expected source UIDVALIDITY; required with --source-folder unless "
            "the plan supplies both"
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="perform the move/rollback; without it nothing changes",
    )
    parser.add_argument(
        "--verify",
        nargs="?",
        const="",
        default=None,
        metavar="ROLLBACK_JSON",
        help=(
            "Verify present-in-destination and absent-from-source by "
            "Message-ID. With no value, verify this run and require --apply. "
            "With a path, verify that rollback file read-only."
        ),
    )
    parser.add_argument(
        "--rollback-out",
        metavar="PATH.json",
        help=(
            "where to write the rollback record (default: a private 0600 file "
            "under a 0700 directory in $XDG_STATE_HOME/email-management/"
            "rollbacks; rollback writes a .reversed.json file)"
        ),
    )
    parser.add_argument(
        "--delete-source",
        action="store_true",
        help=(
            "allow the non-Gmail COPY + \\Deleted + UID EXPUNGE fallback when "
            "MOVE is unavailable; never enabled by default"
        ),
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=DEFAULT_CHUNK_SIZE,
        metavar="N",
        help=f"messages per mutation batch (default: {DEFAULT_CHUNK_SIZE})",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run offline helper assertions and exit",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    if args.chunk_size < 1:
        parser.error("--chunk-size must be at least 1")
    if args.chunk_size > 1000:
        parser.error("--chunk-size above 1000 is not supported")
    if args.uidvalidity is not None and args.uidvalidity < 1:
        parser.error("--uidvalidity must be at least 1")

    verify_path = args.verify if args.verify not in (None, "") else None
    verify_requested = args.verify is not None
    move_requested = bool(args.uids or args.from_plan)

    if verify_path:
        if (
            args.apply
            or move_requested
            or args.rollback
            or args.label
            or args.source_folder
            or args.uidvalidity is not None
            or args.rollback_out
            or args.delete_source
        ):
            parser.error(
                "--verify PATH is a standalone read-only mode; do not combine "
                "it with a move, rollback, --apply, --label, --delete-source, "
                "or output flags"
            )
    elif args.rollback:
        if args.label:
            parser.error("--label is not used with --rollback; the file names it")
        if args.source_folder:
            parser.error(
                "--source-folder is not used with --rollback; the file names it"
            )
        if args.uidvalidity is not None:
            parser.error(
                "--uidvalidity is not used with --rollback; the file names it"
            )
        if verify_requested and not args.apply:
            parser.error("--verify without a path requires --apply")
    else:
        if not args.label:
            parser.error("--label is required for a move")
        if not move_requested:
            parser.error("pass --uids or --from-plan (or --rollback, or --verify PATH)")
        if args.verify is not None and verify_path is None and not args.apply:
            parser.error("--verify without a path requires --apply")

    try:
        if args.label and not args.rollback and not verify_path:
            validate_destination_label(args.label)
        if move_requested and not args.rollback and not verify_path:
            _, metadata = load_uid_file(args.uids or args.from_plan)
            resolve_move_scope(metadata, args)
        if args.rollback:
            load_rollback(args.rollback)
        if verify_path:
            load_rollback(verify_path)
        with connect_from_args(args) as session:
            if verify_path:
                return run_verify_file(session, verify_path)
            if args.rollback:
                return run_rollback(session, args)
            return run_move(session, args)
    except MailError as exc:
        print(f"mail_move: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("mail_move: interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
