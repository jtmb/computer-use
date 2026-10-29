#!/usr/bin/env python3
"""Read-only IMAP header scan.

The scan never changes mailbox state:

- The source folder is opened with EXAMINE (read-only).
- Headers are fetched with BODY.PEEK[...], never BODY[...], so messages are not
  marked \\Seen.
- FLAGS and, on Gmail, X-GM-LABELS are fetched alongside the headers.
- No body part is ever requested.

Output is JSONL, one object per message. By default it goes to stdout; use
--out for a private (0600) file. A compact human summary always goes to stderr.
With --json, a machine summary is written to stdout and --out is required so
records and summary never share a stream.

Newest N means the N highest UIDs in the search result, processed in descending
order so a small calibration batch really is the newest messages. A full
mailbox scan is deliberately opt-in: --limit 0 requires --yes. A --search that
returns every message in the mailbox is treated as suspicious and refused
unless --allow-suspicious-search is given.
"""

from __future__ import annotations

import argparse
import imaplib
import json
import sys
import time
from collections.abc import Sequence
from typing import Any

import mail_common
from mail_common import (
    JsonlWriter,
    MailError,
    MailSession,
    add_connection_arguments,
    chunked_uid_fetch,
    connect_from_args,
    first_sender,
    folder_status,
    parse_header_block,
    search_uids,
    select_folder,
)

DEFAULT_LIMIT = 200

ALL_FIELDS = (
    "uid",
    "from",
    "from_name",
    "subject",
    "date",
    "unread",
    "labels",
    "list_unsubscribe",
    "folder",
    "uidvalidity",
    "message_id",
)
DEFAULT_FIELDS = ",".join(ALL_FIELDS)


def parse_fields(value: str) -> tuple[str, ...]:
    requested = [item.strip() for item in value.split(",") if item.strip()]
    if not requested:
        raise ValueError("--fields must name at least one field")
    unknown = [item for item in requested if item not in ALL_FIELDS]
    if unknown:
        raise ValueError(
            f"unknown --fields value(s): {', '.join(unknown)}; "
            f"choose from {', '.join(ALL_FIELDS)}"
        )
    return tuple(field for field in ALL_FIELDS if field in set(requested))


def build_fetch_items(is_gmail: bool) -> str:
    """Build a header-only FETCH. PEEK is mandatory here."""
    items = (
        "(UID FLAGS "
        "BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE LIST-UNSUBSCRIBE MESSAGE-ID)]"
    )
    if is_gmail:
        items += " X-GM-LABELS"
    return items + ")"


def select_newest_uids(all_uids: Sequence[int], limit: int) -> list[int]:
    """Return UIDs newest-first. limit<=0 means the whole result."""
    ordered = sorted(set(all_uids), reverse=True)
    return ordered[:limit] if limit > 0 else ordered


def build_record(
    uid: int,
    headers: dict[str, str],
    flags: Sequence[str],
    labels: Sequence[str],
    folder: str,
    uidvalidity: int | None,
    is_gmail: bool,
) -> dict[str, Any]:
    """Build one JSONL record from already-parsed headers and FETCH flags."""
    sender, sender_name = first_sender(headers.get("from", ""))
    flag_set = {str(flag).lower() for flag in flags}
    return {
        "uid": uid,
        "from": sender,
        "from_name": sender_name,
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "unread": "\\seen" not in flag_set,
        "labels": [str(label) for label in labels] if is_gmail else [],
        "list_unsubscribe": bool(
            headers.get("list-unsubscribe", "").strip()
        ),
        "folder": folder,
        "uidvalidity": uidvalidity,
        "message_id": headers.get("message-id", "").strip(),
    }


class SummaryAccumulator:
    """Pure count/unread/distinct-sender accumulator for scan records."""

    def __init__(self) -> None:
        self.count = 0
        self.unread = 0
        self.senders: set[str] = set()

    def add(self, record: dict[str, Any]) -> None:
        self.count += 1
        if record.get("unread"):
            self.unread += 1
        sender = record.get("from")
        if sender:
            self.senders.add(str(sender))

    def as_dict(self) -> dict[str, int]:
        return {
            "count": self.count,
            "unread": self.unread,
            "distinct_senders": len(self.senders),
        }


def is_suspicious_search(
    searched: int,
    mailbox_messages: int | None,
    criteria: str,
    gmail_raw: bool,
) -> bool:
    """Detect a search that looks ignored because it returned the whole mailbox."""
    if not criteria or mailbox_messages is None or mailbox_messages <= 0:
        return False
    if not gmail_raw and criteria.strip().upper() == "ALL":
        return False
    return searched == mailbox_messages or searched > mailbox_messages


def scan(
    session: MailSession,
    args: argparse.Namespace,
    selected_fields: Sequence[str],
) -> dict[str, Any]:
    connection = session.connection
    folder = args.folder
    started = time.monotonic()

    count, uidvalidity = select_folder(connection, folder, readonly=True)
    status = folder_status(connection, folder)
    mailbox_messages = status.get("MESSAGES", count)
    # STATUS may fall back to EXAMINE, which changes the selection.
    select_folder(connection, folder, readonly=True)

    if args.search:
        criteria = args.search
        gmail_raw = session.is_gmail and not args.imap_search
    else:
        criteria = "ALL"
        gmail_raw = False

    all_uids = search_uids(connection, criteria, gmail_raw=gmail_raw)
    suspicious_search = False
    if args.search:
        suspicious_search = is_suspicious_search(
            len(all_uids), mailbox_messages, criteria, gmail_raw
        )
        if suspicious_search:
            detail = (
                f"search criteria {criteria!r} returned {len(all_uids)} UIDs "
                f"but STATUS MESSAGES is {mailbox_messages}; the server may "
                "have ignored the criteria"
            )
            if not getattr(args, "allow_suspicious_search", False):
                raise MailError(
                    "WARNING: suspicious search result: "
                    + detail
                    + ". Refusing to export. Re-run with "
                    "--allow-suspicious-search only if this is expected."
                )
            print(
                "mail_scan: WARNING: suspicious search result: "
                + detail
                + " (continuing because --allow-suspicious-search was given)",
                file=sys.stderr,
            )
    elif mailbox_messages != len(all_uids):
        print(
            f"mail_scan: warning: STATUS MESSAGES is {mailbox_messages} but "
            f"UID SEARCH ALL returned {len(all_uids)}; the mailbox may be changing",
            file=sys.stderr,
        )

    selected_uids = select_newest_uids(all_uids, args.limit)
    fetch_items = build_fetch_items(session.is_gmail)

    accumulator = SummaryAccumulator()
    out_path = args.out or "-"

    with JsonlWriter(out_path) as writer:
        total = len(selected_uids)
        processed = 0
        try:
            for batch, parsed in chunked_uid_fetch(
                connection, selected_uids, fetch_items, args.chunk_size
            ):
                by_uid = {item["uid"]: item for item in parsed}
                for uid in batch:
                    item = by_uid.get(uid)
                    if item is None:
                        print(
                            f"mail_scan: warning: UID {uid} vanished during the scan",
                            file=sys.stderr,
                        )
                        continue
                    headers = parse_header_block(item["headers"])
                    record = build_record(
                        uid,
                        headers,
                        item["flags"],
                        item["labels"],
                        folder,
                        uidvalidity,
                        session.is_gmail,
                    )
                    writer.write(
                        {field: record[field] for field in selected_fields}
                    )
                    accumulator.add(record)
                processed += len(batch)
                print(
                    f"mail_scan: {processed}/{total} fetched from {folder}",
                    file=sys.stderr,
                )
        except imaplib.IMAP4.error as exc:
            raise MailError(f"IMAP error during scan: {exc}") from exc

    elapsed = time.monotonic() - started
    counts = accumulator.as_dict()
    return {
        "folder": folder,
        "uidvalidity": uidvalidity,
        "mailbox_messages": mailbox_messages,
        "search": criteria,
        "search_mode": "gmail-x-gm-raw" if gmail_raw else "imap",
        "searched": len(all_uids),
        "suspicious_search": suspicious_search,
        "limit": args.limit,
        "count": counts["count"],
        "unread": counts["unread"],
        "distinct_senders": counts["distinct_senders"],
        "elapsed_seconds": round(elapsed, 3),
        "out": None if out_path == "-" else out_path,
    }


def self_test() -> int:
    checks: list[str] = []

    def check(condition: bool, message: str) -> None:
        if not condition:
            raise AssertionError(message)
        checks.append(message)

    try:
        check(
            select_newest_uids([5, 10, 20, 30], 3) == [30, 20, 10],
            "selects newest UIDs in descending order",
        )
        check(
            select_newest_uids([5, 10, 20, 30], 0) == [30, 20, 10, 5],
            "limit 0 returns all UIDs descending",
        )
        check(select_newest_uids([], 3) == [], "empty UID set stays empty")

        gmail_items = build_fetch_items(True)
        imap_items = build_fetch_items(False)
        check("BODY.PEEK[" in gmail_items, "Gmail fetch uses BODY.PEEK")
        check("X-GM-LABELS" in gmail_items, "Gmail fetch requests labels")
        check("X-GM-LABELS" not in imap_items, "non-Gmail fetch omits labels")
        check("BODY[" not in gmail_items, "fetch never uses BODY[]")

        fields = parse_fields("uid,subject,unread")
        check(fields == ("uid", "subject", "unread"), "parses selected fields")
        try:
            parse_fields("uid,bogus")
        except ValueError:
            check(True, "rejects unknown output fields")
        else:
            check(False, "rejects unknown output fields")

        record = build_record(
            10,
            {
                "from": "Alice <Alice@Example.COM>",
                "subject": "Hi",
                "date": "Mon, 26 Oct 2026 10:00:00 +0000",
                "list-unsubscribe": "<mailto:unsub@example.com>",
                "message-id": "<id@example.com>",
            },
            ["\\Seen"],
            ["\\Inbox", "Work"],
            "INBOX",
            7,
            True,
        )
        check(record["from"] == "alice@example.com", "normalizes sender address")
        check(record["unread"] is False, "reads Seen flag")
        check(record["labels"] == ["\\Inbox", "Work"], "keeps Gmail labels")
        check(record["list_unsubscribe"] is True, "detects List-Unsubscribe")
        check(record["message_id"] == "<id@example.com>", "keeps Message-ID")

        plain = build_record(
            11,
            {"from": "b@example.com", "subject": "S"},
            [],
            ["Work"],
            "INBOX",
            7,
            False,
        )
        check(plain["unread"] is True, "missing Seen flag means unread")
        check(plain["labels"] == [], "non-Gmail labels are empty")
        check(plain["list_unsubscribe"] is False, "missing List-Unsubscribe is false")

        accumulator = SummaryAccumulator()
        accumulator.add(record)
        accumulator.add(plain)
        counts = accumulator.as_dict()
        check(counts["count"] == 2, "summarizes message count")
        check(counts["unread"] == 1, "summarizes unread count")
        check(counts["distinct_senders"] == 2, "summarizes distinct senders")

        check(
            is_suspicious_search(10, 10, "UNSEEN", False),
            "flags a search that returned the whole mailbox",
        )
        check(
            not is_suspicious_search(3, 10, "UNSEEN", False),
            "does not flag a narrower search",
        )
        check(
            not is_suspicious_search(10, 10, "ALL", False),
            "literal IMAP ALL is not suspicious",
        )
        check(
            not is_suspicious_search(0, 0, "UNSEEN", False),
            "empty mailbox is not suspicious",
        )
    except AssertionError as exc:
        print(f"mail_scan self-test: FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"mail_scan self-test: PASS ({len(checks)} checks)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only IMAP header scan. Uses EXAMINE and BODY.PEEK; never "
            "marks mail read and never fetches a body."
        )
    )
    add_connection_arguments(parser)
    parser.add_argument(
        "--folder",
        default="INBOX",
        metavar="NAME",
        help="mailbox/label to scan (default: INBOX)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        metavar="N",
        help=(
            f"newest N messages; 0 means the whole mailbox and requires --yes "
            f"(default: {DEFAULT_LIMIT})"
        ),
    )
    parser.add_argument(
        "--search",
        metavar="TEXT",
        help=(
            "On Gmail (X-GM-EXT-1) this is Gmail query syntax sent as X-GM-RAW, "
            "e.g. 'from:example.com newer_than:30d'. Elsewhere it is IMAP SEARCH "
            "criteria, e.g. 'UNSEEN SINCE 01-Jan-2026'. Default: ALL."
        ),
    )
    parser.add_argument(
        "--imap-search",
        action="store_true",
        help="force --search to be interpreted as IMAP SEARCH criteria even on Gmail",
    )
    parser.add_argument(
        "--fields",
        default=DEFAULT_FIELDS,
        metavar="LIST",
        help=(
            "comma-separated output fields (default: all). Available: "
            + ", ".join(ALL_FIELDS)
        ),
    )
    parser.add_argument(
        "--out",
        metavar="PATH.jsonl",
        help="write JSONL to this private 0600 file instead of stdout",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="write a machine-readable summary to stdout (requires --out)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm an unbounded scan (required with --limit 0)",
    )
    parser.add_argument(
        "--allow-suspicious-search",
        action="store_true",
        help=(
            "continue when --search returns every message in the mailbox; "
            "without this flag a suspicious search is refused"
        ),
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run offline parsing/summary assertions and exit",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=mail_common.DEFAULT_CHUNK_SIZE,
        metavar="N",
        help=f"UID FETCH batch size (default: {mail_common.DEFAULT_CHUNK_SIZE})",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    if args.limit < 0:
        parser.error("--limit must be 0 (all) or a positive number")
    if args.limit == 0 and not args.yes:
        parser.error("--limit 0 scans the entire mailbox; add --yes to confirm")
    if args.chunk_size < 1:
        parser.error("--chunk-size must be at least 1")
    if any(character in args.folder for character in "\r\n\0"):
        parser.error("--folder contains a control character")
    if args.json and (not args.out or args.out == "-"):
        parser.error("--json requires --out so records and summary stay separate")
    try:
        selected_fields = parse_fields(args.fields)
    except ValueError as exc:
        parser.error(str(exc))

    try:
        with connect_from_args(args) as session:
            summary = scan(session, args, selected_fields)
    except MailError as exc:
        print(f"mail_scan: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("mail_scan: interrupted", file=sys.stderr)
        return 130

    destination = f" -> {summary['out']}" if summary["out"] else ""
    print(
        f"mail_scan: {summary['count']} messages "
        f"({summary['unread']} unread, {summary['distinct_senders']} senders) "
        f"from {summary['folder']} in {summary['elapsed_seconds']:.2f}s"
        f"{destination}",
        file=sys.stderr,
    )
    if args.json:
        print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
