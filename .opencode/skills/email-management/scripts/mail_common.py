#!/usr/bin/env python3
"""Shared IMAP helpers for the email-management scripts.

This module is imported by mail_scan.py, mail_triage.py, and mail_move.py. It
owns the parts that are easy to get subtly wrong:

- Credential resolution. A secret is read from stdin, one named environment
  variable, EMAIL_APP_PASSWORD, or the OS keyring, in that order. The secret is
  never printed, logged, or passed on a command line. App-password whitespace
  is removed because providers display those passwords in groups.
- Account and endpoint resolution. --user wins over EMAIL_USER. The default is
  imap.gmail.com:993 with implicit TLS; --starttls uses port 143 by default and
  refuses plaintext login or a server that does not advertise STARTTLS.
- Account addresses are masked in reports and errors with mask_account().
- Connection and capability detection: X-GM-EXT-1 (Gmail), MOVE, UIDPLUS.
- Defensive header decoding. Real mail declares charsets such as
  "unknown-8bit" or contains undecodable bytes. Every decode fallback ends in
  replacement characters; one bad byte must never abort a scan.
- Mailbox listing, safe name quoting (including modified UTF-7), UID searching,
  chunked UID FETCH, private JSONL output, and atomic JSON writes.

Run `python3 mail_common.py --self-test` for offline assertions. No self-test
touches the network or the keyring.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import email.errors
import email.policy
import imaplib
import io
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import unicodedata
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from email.header import decode_header
from email.parser import BytesHeaderParser
from email.utils import getaddresses
from pathlib import Path
from typing import Any, TextIO

DEFAULT_HOST = "imap.gmail.com"
DEFAULT_PORT = 993
DEFAULT_STARTTLS_PORT = 143
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_CHUNK_SIZE = 300

USER_ENV = "EMAIL_USER"
HOST_ENV = "EMAIL_HOST"
PORT_ENV = "EMAIL_PORT"
CREDENTIAL_ENV = "EMAIL_APP_PASSWORD"
KEYRING_SERVICE = "imap"

HEADER_FIELD_NAMES = (
    "from",
    "subject",
    "date",
    "list-unsubscribe",
    "message-id",
)


class MailError(RuntimeError):
    """A user-facing failure whose message contains no secret material."""


def redact_secret(text: str, secret: str | None) -> str:
    """Replace a secret and its whitespace-stripped variant in text."""
    if not secret:
        return text
    variants = {secret, "".join(secret.split())}
    for variant in variants:
        if variant:
            text = text.replace(variant, "[redacted]")
    return text


def strip_secret(value: str) -> str:
    """Remove whitespace from a provider password without echoing it."""
    return "".join(value.split())


def mask_account(user: str) -> str:
    """Redact an account address for reports and command output."""
    if "@" not in user:
        return "***"
    local, domain = user.rsplit("@", 1)
    return f"{local[:1] or '*'}***@{domain or '***'}"


def _clean_text(value: str) -> str:
    text = value.encode("utf-8", "replace").decode("utf-8")
    text = unicodedata.normalize("NFC", text)
    return " ".join(text.split())


def _decode_bytes(value: bytes, charset: str | None) -> str:
    candidates: list[str] = []
    if charset:
        candidates.append(charset)
        candidates.append(charset.split("*", 1)[0])
    candidates.extend(("utf-8", "cp1252", "latin-1"))
    for candidate in candidates:
        if not candidate:
            continue
        try:
            return value.decode(candidate)
        except (LookupError, UnicodeDecodeError):
            continue
    return value.decode("utf-8", "replace")


def decode_header_value(value: object) -> str:
    """Decode an RFC 2047 header without aborting on bad charsets or bytes.

    "unknown-8bit" and other non-Python charset names raise LookupError from
    the codec registry. Raw 8-bit bytes raise UnicodeDecodeError. Both are
    expected in real mail; fall back through UTF-8, cp1252, and Latin-1, then
    use replacement characters. The result is NFC-normalized and its
    whitespace is collapsed so subject matching is stable.
    """
    if value is None:
        return ""
    if isinstance(value, bytes):
        try:
            header_text = value.decode("ascii")
        except UnicodeDecodeError:
            header_text = _decode_bytes(value, None)
    elif isinstance(value, str):
        header_text = value
    else:
        header_text = str(value)
    try:
        parts = decode_header(header_text)
    except (LookupError, UnicodeDecodeError, UnicodeEncodeError, ValueError, TypeError):
        return _clean_text(header_text)
    decoded: list[str] = []
    for chunk, charset in parts:
        if isinstance(chunk, bytes):
            decoded.append(_decode_bytes(chunk, charset))
        else:
            decoded.append(chunk)
    return _clean_text("".join(decoded))


def parse_header_block(raw: bytes) -> dict[str, str]:
    """Parse a header block from BODY.PEEK[HEADER.FIELDS ...] into a dict."""
    if not raw:
        return {}
    try:
        message = BytesHeaderParser(policy=email.policy.compat32).parsebytes(raw)
    except (ValueError, TypeError, email.errors.MessageError):
        return {}
    headers: dict[str, str] = {}
    for name in HEADER_FIELD_NAMES:
        value = message.get(name)
        if value is not None:
            headers[name] = decode_header_value(value)
    return headers


def extract_addresses(value: str) -> list[tuple[str, str]]:
    """Return (address, display_name) pairs from a decoded address header."""
    if not value:
        return []
    try:
        pairs = getaddresses([value])
    except (ValueError, TypeError):
        return []
    result: list[tuple[str, str]] = []
    seen: set[str] = set()
    for name, address in pairs:
        address = address.strip().strip("<>").strip().lower()
        if not address or "@" not in address or address in seen:
            continue
        seen.add(address)
        result.append((address, name.strip()))
    return result


def first_sender(value: str) -> tuple[str, str]:
    """Return the first (address, display_name), or empty strings."""
    addresses = extract_addresses(value)
    return addresses[0] if addresses else ("", "")


# ---------------------------------------------------------------------------
# Modified UTF-7 (RFC 3501 mailbox names). imaplib does not encode these.
# ---------------------------------------------------------------------------


def encode_modified_utf7(text: str) -> str:
    """Encode a mailbox/label name for the IMAP wire."""
    output: list[str] = []
    pending: list[str] = []

    def flush_pending() -> None:
        if not pending:
            return
        data = "".join(pending).encode("utf-16-be")
        encoded = base64.b64encode(data).decode("ascii").rstrip("=")
        output.append("&" + encoded.replace("/", ",") + "-")
        pending.clear()

    for character in text:
        if 0x20 <= ord(character) <= 0x7E:
            flush_pending()
            output.append("&-" if character == "&" else character)
        else:
            pending.append(character)
    flush_pending()
    return "".join(output)


def decode_modified_utf7(text: str) -> str:
    """Decode an IMAP mailbox/label name for display."""
    output: list[str] = []
    index = 0
    while index < len(text):
        if text[index] != "&":
            output.append(text[index])
            index += 1
            continue
        end = text.find("-", index + 1)
        if end == -1:
            output.append(text[index:])
            break
        chunk = text[index + 1 : end]
        if not chunk:
            output.append("&")
        else:
            padded = chunk.replace(",", "/")
            padded += "=" * ((-len(padded)) % 4)
            try:
                output.append(base64.b64decode(padded).decode("utf-16-be"))
            except (binascii.Error, UnicodeDecodeError, ValueError):
                output.append(text[index : end + 1])
        index = end + 1
    return "".join(output)


def quote_imap_string(value: str) -> str:
    """Quote an IMAP string/atom and reject protocol-breaking controls."""
    if any(character in value for character in "\r\n\0"):
        raise MailError("IMAP argument contains a CR, LF, or NUL byte")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def quote_mailbox(name: str) -> str:
    """Quote any mailbox name, encoding non-ASCII as modified UTF-7."""
    if not name:
        raise MailError("mailbox name is empty")
    if any(character in name for character in "\r\n\0"):
        raise MailError("mailbox name contains a CR, LF, or NUL byte")
    encoded = encode_modified_utf7(name)
    return quote_imap_string(encoded)


# ---------------------------------------------------------------------------
# Credentials, account, and connection
# ---------------------------------------------------------------------------


def keyring_lookup(user: str) -> str | None:
    """Read `secret-tool lookup service imap user <USER>` without logging it."""
    tool = shutil.which("secret-tool")
    if not tool:
        return None
    try:
        result = subprocess.run(
            [tool, "lookup", "service", KEYRING_SERVICE, "user", user],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return value or None


def _take_secret(value: str, source: str) -> str:
    secret = strip_secret(value)
    if not secret:
        raise MailError(f"{source} contained an empty password")
    return secret


def resolve_password(
    args: argparse.Namespace,
    user: str,
    *,
    environ: Mapping[str, str] | None = None,
    stdin: TextIO | None = None,
    keyring_lookup_fn: Callable[[str], str | None] | None = None,
) -> str:
    """Resolve a secret in documented precedence order.

    Explicit methods are not silently skipped: if --password-stdin is named,
    stdin must contain a value; if --password-env is named, that variable must
    be set. Otherwise EMAIL_APP_PASSWORD is used, then the keyring.
    """
    environments = os.environ if environ is None else environ
    stream = sys.stdin if stdin is None else stdin
    lookup = keyring_lookup if keyring_lookup_fn is None else keyring_lookup_fn

    if getattr(args, "password_stdin", False):
        line = stream.readline()
        if not line:
            raise MailError("--password-stdin was given but stdin was empty")
        return _take_secret(line, "--password-stdin")

    env_name = getattr(args, "password_env", None)
    if env_name:
        if env_name not in environments:
            raise MailError(
                f"--password-env {env_name} was given but that variable is not set"
            )
        return _take_secret(environments[env_name], f"--password-env {env_name}")

    if CREDENTIAL_ENV in environments:
        return _take_secret(environments[CREDENTIAL_ENV], CREDENTIAL_ENV)

    from_keyring = lookup(user)
    if from_keyring:
        return _take_secret(from_keyring, "secret-tool keyring")

    raise MailError(
        f"No IMAP password available for {mask_account(user)}. Provide one of:\n"
        "  --password-stdin            read the secret from stdin\n"
        "  --password-env VAR          read it from environment variable VAR\n"
        f"  {CREDENTIAL_ENV}          export the secret in the environment\n"
        '  secret-tool store --label="IMAP" service imap user <USER>'
    )


def resolve_user(
    args: argparse.Namespace, *, environ: Mapping[str, str] | None = None
) -> str:
    environments = os.environ if environ is None else environ
    user = (getattr(args, "user", None) or environments.get(USER_ENV) or "").strip()
    if not user:
        raise MailError(
            f"No IMAP account. Pass --user USER@example.com or set {USER_ENV}."
        )
    if any(character in user for character in "\r\n\0"):
        raise MailError("the account name contains a control character")
    return user


def resolve_host_port(
    args: argparse.Namespace, *, environ: Mapping[str, str] | None = None
) -> tuple[str, int]:
    environments = os.environ if environ is None else environ
    starttls = bool(getattr(args, "starttls", False))
    host = (
        getattr(args, "host", None)
        or environments.get(HOST_ENV)
        or DEFAULT_HOST
    ).strip()
    if not host or any(character in host for character in "\r\n\0 /"):
        raise MailError(f"invalid IMAP host: {host!r}")
    default_port = DEFAULT_STARTTLS_PORT if starttls else DEFAULT_PORT
    raw_port = (
        getattr(args, "port", None)
        or environments.get(PORT_ENV)
        or default_port
    )
    try:
        port = int(raw_port)
    except (TypeError, ValueError) as exc:
        raise MailError(f"invalid IMAP port: {raw_port!r}") from exc
    if not 1 <= port <= 65535:
        raise MailError(f"IMAP port must be between 1 and 65535, got {port}")
    validate_transport(port, starttls)
    return host, port


def validate_transport(port: int, starttls: bool) -> None:
    """Refuse ambiguous or plaintext transports."""
    if starttls and port == DEFAULT_PORT:
        raise MailError(
            "--starttls cannot be used on port 993; port 993 already uses "
            "implicit TLS. Omit --starttls or use port 143."
        )
    if not starttls and port == DEFAULT_STARTTLS_PORT:
        raise MailError(
            "port 143 requires --starttls; implicit TLS is 993. "
            "Re-run with --starttls (recommended) or use port 993."
        )


def add_connection_arguments(parser: argparse.ArgumentParser) -> None:
    """Add the shared account, endpoint, and credential flags."""
    group = parser.add_argument_group("account and credentials")
    group.add_argument(
        "--user",
        metavar="USER",
        help=f"IMAP account (default: ${USER_ENV})",
    )
    group.add_argument(
        "--host",
        metavar="HOST",
        help=f"IMAP server (default: ${HOST_ENV} or {DEFAULT_HOST})",
    )
    group.add_argument(
        "--port",
        type=int,
        metavar="PORT",
        help=(
            f"port (default: ${PORT_ENV}, else {DEFAULT_STARTTLS_PORT} with "
            f"--starttls or {DEFAULT_PORT} for implicit TLS)"
        ),
    )
    group.add_argument(
        "--starttls",
        action="store_true",
        help=(
            "use STARTTLS (normally port 143); refuses if the server does not "
            "advertise STARTTLS"
        ),
    )
    credentials = group.add_mutually_exclusive_group()
    credentials.add_argument(
        "--password-stdin",
        action="store_true",
        help="read the password from one line on stdin (never a command argument)",
    )
    credentials.add_argument(
        "--password-env",
        metavar="VAR",
        help="read the password from environment variable VAR",
    )
    group.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        metavar="SECONDS",
        help=f"network timeout (default: {DEFAULT_TIMEOUT_SECONDS})",
    )


@dataclass
class MailSession:
    """A logged-in IMAP connection plus parsed capabilities."""

    connection: imaplib.IMAP4
    host: str
    port: int
    user: str
    capabilities: frozenset[str]
    is_gmail: bool
    supports_move: bool
    supports_uidplus: bool

    def close(self) -> None:
        try:
            self.connection.logout()
        except (imaplib.IMAP4.error, OSError):
            try:
                self.connection.shutdown()
            except (imaplib.IMAP4.error, OSError):
                pass

    def __enter__(self) -> MailSession:
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> bool:
        self.close()
        return False

    def describe_capabilities(self) -> str:
        return " ".join(sorted(self.capabilities)) or "(none advertised)"


def connect(
    host: str,
    port: int,
    user: str,
    password: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    starttls: bool = False,
) -> MailSession:
    """Open a verified-TLS IMAP connection and log in.

    Implicit TLS is used unless ``starttls`` is true. STARTTLS is only attempted
    when the server advertises it; plaintext login is never attempted. Certificate
    and hostname verification stay at the standard-library default.

    The returned MailSession exposes the logged-in ``imaplib.IMAP4`` as
    ``.connection`` and the parsed capabilities as ``.is_gmail``,
    ``.supports_move``, ``.supports_uidplus``, and ``.capabilities``.
    """
    validate_transport(port, starttls)
    try:
        if starttls:
            connection: imaplib.IMAP4 = imaplib.IMAP4(
                host, port, timeout=timeout
            )
            advertised = {
                item.decode("ascii", "replace").upper()
                for item in (getattr(connection, "capabilities", ()) or ())
                if isinstance(item, bytes)
            }
            if "STARTTLS" not in advertised:
                try:
                    connection.shutdown()
                except (imaplib.IMAP4.error, OSError):
                    pass
                raise MailError(
                    "server does not advertise STARTTLS; refusing plaintext "
                    "login. Use port 993 with implicit TLS or a server that "
                    "supports STARTTLS."
                )
            try:
                connection.starttls(ssl_context=ssl.create_default_context())
            except (imaplib.IMAP4.error, OSError, ssl.SSLError) as exc:
                try:
                    connection.shutdown()
                except (imaplib.IMAP4.error, OSError):
                    pass
                raise MailError(
                    f"STARTTLS failed for {host}:{port}; refusing plaintext "
                    f"login: {exc}"
                ) from exc
        else:
            connection = imaplib.IMAP4_SSL(host, port, timeout=timeout)
    except MailError:
        raise
    except ssl.SSLCertVerificationError as exc:
        raise MailError(
            f"TLS verification failed for {host}:{port}; fix the certificate "
            "chain or host name instead of disabling verification"
        ) from exc
    except (OSError, ssl.SSLError, imaplib.IMAP4.error) as exc:
        raise MailError(f"cannot connect to {host}:{port}: {exc}") from exc

    try:
        connection.login(user, password)
    except (imaplib.IMAP4.error, OSError, UnicodeEncodeError) as exc:
        message = redact_secret(str(exc), password)
        try:
            connection.logout()
        except (imaplib.IMAP4.error, OSError):
            pass
        raise MailError(
            f"IMAP login failed for {mask_account(user)} at {host}:{port}: "
            f"{message}"
        ) from exc

    try:
        status, data = connection.capability()
    except (imaplib.IMAP4.error, OSError) as exc:
        message = redact_secret(str(exc), password)
        try:
            connection.logout()
        except (imaplib.IMAP4.error, OSError):
            pass
        raise MailError(f"cannot read IMAP capabilities: {message}") from exc

    capabilities: set[str] = set()
    if status == "OK" and data and data[0]:
        capabilities = {
            item.decode("ascii", "replace").upper() for item in data[0].split()
        }
    if not capabilities:
        capabilities = {
            item.decode("ascii", "replace").upper()
            for item in getattr(connection, "capabilities", ())
            if isinstance(item, bytes)
        }

    return MailSession(
        connection=connection,
        host=host,
        port=port,
        user=user,
        capabilities=frozenset(capabilities),
        is_gmail="X-GM-EXT-1" in capabilities,
        supports_move="MOVE" in capabilities,
        supports_uidplus="UIDPLUS" in capabilities,
    )


def connect_from_args(args: argparse.Namespace) -> MailSession:
    """Resolve account and secret, then connect. The secret stays local."""
    user = resolve_user(args)
    host, port = resolve_host_port(args)
    password = resolve_password(args, user)
    timeout = getattr(args, "timeout", DEFAULT_TIMEOUT_SECONDS)
    return connect(
        host,
        port,
        user,
        password,
        timeout=timeout,
        starttls=bool(getattr(args, "starttls", False)),
    )


# ---------------------------------------------------------------------------
# Mailbox and search helpers
# ---------------------------------------------------------------------------


def _parse_parenthesized_strings(text: str, start: int) -> list[str]:
    """Read IMAP atoms/quoted strings until the closing parenthesis."""
    values: list[str] = []
    index = start
    while index < len(text):
        character = text[index]
        if character in " \t":
            index += 1
            continue
        if character == ")":
            break
        if character == '"':
            index += 1
            buffer: list[str] = []
            while index < len(text):
                current = text[index]
                if current == "\\" and index + 1 < len(text):
                    buffer.append(text[index + 1])
                    index += 2
                    continue
                if current == '"':
                    index += 1
                    break
                buffer.append(current)
                index += 1
            values.append("".join(buffer))
            continue
        end = index
        while end < len(text) and text[end] not in " )":
            end += 1
        values.append(text[index:end])
        index = end
    return values


def parse_fetch_response(data: Iterable[Any]) -> list[dict[str, Any]]:
    """Parse UID FETCH output into uid/flags/labels/raw-header records."""
    records: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, tuple) or len(item) < 2:
            continue
        metadata, payload = item[0], item[1]
        if not isinstance(metadata, bytes):
            continue
        text = metadata.decode("ascii", "replace")
        uid_match = re.search(r"\bUID\s+(\d+)", text)
        if not uid_match:
            continue
        record: dict[str, Any] = {
            "uid": int(uid_match.group(1)),
            "flags": [],
            "labels": [],
            "headers": payload if isinstance(payload, bytes) else b"",
        }
        flags_match = re.search(r"\bFLAGS\s+\(", text)
        if flags_match:
            record["flags"] = _parse_parenthesized_strings(text, flags_match.end())
        labels_match = re.search(r"\bX-GM-LABELS\s+\(", text)
        if labels_match:
            labels = _parse_parenthesized_strings(text, labels_match.end())
            record["labels"] = [decode_modified_utf7(label) for label in labels]
        records.append(record)
    return records


def chunked(items: Iterable[int], size: int = DEFAULT_CHUNK_SIZE) -> Iterator[list[int]]:
    if size < 1:
        raise ValueError("chunk size must be at least 1")
    batch: list[int] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def chunked_uid_fetch(
    connection: imaplib.IMAP4,
    uids: Sequence[int],
    items: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> Iterator[tuple[list[int], list[dict[str, Any]]]]:
    """Run UID FETCH in bounded chunks against the selected mailbox."""
    for batch in chunked(uids, chunk_size):
        uid_set = ",".join(str(uid) for uid in batch)
        try:
            status, data = connection.uid("fetch", uid_set, items)
        except imaplib.IMAP4.error as exc:
            raise MailError(
                f"UID FETCH failed for UIDs {batch[0]}..{batch[-1]}: {exc}"
            ) from exc
        if status != "OK":
            raise MailError(f"UID FETCH returned {status} for UIDs {uid_set}")
        yield batch, parse_fetch_response(data or [])


def list_folders(connection: imaplib.IMAP4) -> list[dict[str, Any]]:
    """Return [{'name', 'flags', 'delimiter'}] from LIST "" *."""
    try:
        status, data = connection.list()
    except imaplib.IMAP4.error as exc:
        raise MailError(f"LIST failed: {exc}") from exc
    if status != "OK":
        raise MailError(f"LIST returned {status}")
    folders: list[dict[str, Any]] = []
    pattern = re.compile(
        r'^\((?P<flags>[^)]*)\)\s+(?P<delimiter>NIL|"(?:\\.|[^"])*")\s+(?P<name>.+)$'
    )
    for raw in data or []:
        if not isinstance(raw, bytes):
            continue
        text = raw.decode("ascii", "replace")
        match = pattern.match(text)
        if not match:
            continue
        name = match.group("name").strip()
        if name.startswith('"') and name.endswith('"'):
            name = _parse_parenthesized_strings(name, 0)[0] if name else ""
        elif name.startswith("{") and "}" in name:
            name = name.split("}", 1)[1].lstrip("\r\n")
        delimiter = match.group("delimiter")
        if delimiter != "NIL":
            delimiter = delimiter[1:-1]
        folders.append(
            {
                "name": decode_modified_utf7(name),
                "flags": match.group("flags").split(),
                "delimiter": None if delimiter == "NIL" else delimiter,
            }
        )
    return folders


def find_folder(
    connection: imaplib.IMAP4, name: str, *, casefold: bool = False
) -> str | None:
    """Return the server's exact mailbox name, or None."""
    folders = list_folders(connection)
    for folder in folders:
        if folder["name"] == name:
            return folder["name"]
    if name.casefold() == "inbox":
        for folder in folders:
            if folder["name"].casefold() == "inbox":
                return folder["name"]
    if casefold:
        for folder in folders:
            if folder["name"].casefold() == name.casefold():
                return folder["name"]
    return None


def list_labels(session: MailSession) -> list[str]:
    """List mailbox/label names. On Gmail these are the labels."""
    return [folder["name"] for folder in list_folders(session.connection)]


def select_folder(
    connection: imaplib.IMAP4, folder: str, *, readonly: bool = True
) -> tuple[int, int | None]:
    """Select/EXAMINE a folder and return (MESSAGES, UIDVALIDITY)."""
    try:
        status, data = connection.select(quote_mailbox(folder), readonly=readonly)
    except imaplib.IMAP4.error as exc:
        raise MailError(f"cannot select {folder}: {exc}") from exc
    if status != "OK":
        detail = " ".join(
            item.decode("ascii", "replace") if isinstance(item, bytes) else str(item)
            for item in (data or [])
        )
        raise MailError(f"cannot select {folder}: {status} {detail}".strip())
    count = int(data[0]) if data and data[0] else 0
    return count, response_int(connection, "UIDVALIDITY")


def response_int(connection: imaplib.IMAP4, key: str) -> int | None:
    try:
        status, data = connection.response(key)
    except imaplib.IMAP4.error:
        return None
    if status != key or not data:
        return None
    for item in data:
        if isinstance(item, bytes):
            match = re.search(rb"\d+", item)
            if match:
                return int(match.group(0))
        elif item:
            match = re.search(r"\d+", str(item))
            if match:
                return int(match.group(0))
    return None


def folder_status(
    connection: imaplib.IMAP4, folder: str
) -> dict[str, int]:
    """Read MESSAGES/UNSEEN/UIDVALIDITY with STATUS, falling back to EXAMINE.

    The fallback changes the selected mailbox, so callers must reselect before
    performing UID work. STATUS is the preferred path and does not select.
    """
    quoted = quote_mailbox(folder)
    try:
        status, data = connection.status(quoted, "(MESSAGES UNSEEN UIDVALIDITY)")
        if status == "OK":
            text = " ".join(
                item.decode("ascii", "replace") if isinstance(item, bytes) else str(item)
                for item in (data or [])
                if item is not None
            )
            values = {
                key.upper(): int(value)
                for key, value in re.findall(
                    r"(MESSAGES|UNSEEN|UIDVALIDITY)\s+(\d+)", text, re.IGNORECASE
                )
            }
            if "MESSAGES" in values:
                return values
    except (imaplib.IMAP4.error, OSError, ValueError):
        pass
    count, uidvalidity = select_folder(connection, folder, readonly=True)
    fallback = {"MESSAGES": count}
    if uidvalidity is not None:
        fallback["UIDVALIDITY"] = uidvalidity
    return fallback


def noop(connection: imaplib.IMAP4) -> None:
    try:
        connection.noop()
    except imaplib.IMAP4.error as exc:
        raise MailError(f"NOOP failed: {exc}") from exc


def search_uids(
    connection: imaplib.IMAP4,
    criteria: str = "ALL",
    *,
    gmail_raw: bool = False,
) -> list[int]:
    """Run UID SEARCH and return sorted integer UIDs."""
    criteria = criteria.strip() or "ALL"
    if any(character in criteria for character in "\r\n\0"):
        raise MailError("search criteria contains a CR, LF, or NUL byte")
    try:
        if gmail_raw:
            status, data = connection.uid(
                "search", None, "X-GM-RAW", quote_imap_string(criteria)
            )
        else:
            status, data = connection.uid("search", None, criteria)
    except (imaplib.IMAP4.error, UnicodeEncodeError) as exc:
        raise MailError(
            f"UID SEARCH failed (use ASCII/IMAP criteria or a Gmail X-GM-RAW "
            f"query): {exc}"
        ) from exc
    if status != "OK":
        raise MailError(f"UID SEARCH returned {status}")
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


# ---------------------------------------------------------------------------
# Private output helpers
# ---------------------------------------------------------------------------


class JsonlWriter:
    """Write one JSON object per line with private (0600) file permissions."""

    def __init__(self, path: str):
        self.path = path
        self._handle: TextIO | None = None
        self._owns_handle = False

    def __enter__(self) -> JsonlWriter:
        if self.path in ("", "-"):
            self._handle = sys.stdout
        else:
            try:
                descriptor = os.open(
                    self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600
                )
                self._handle = os.fdopen(
                    descriptor, "w", encoding="utf-8", errors="replace"
                )
            except OSError as exc:
                raise MailError(f"cannot write {self.path}: {exc}") from exc
            self._owns_handle = True
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                pass
        return self

    def write(self, record: Mapping[str, Any]) -> None:
        if self._handle is None:
            raise MailError("JSONL writer is not open")
        self._handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    def flush(self) -> None:
        if self._handle is not None:
            self._handle.flush()

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> bool:
        if self._handle is not None:
            self._handle.flush()
            if self._owns_handle:
                self._handle.close()
            self._handle = None
        return False


def read_jsonl(path: str) -> Iterator[dict[str, Any]]:
    """Yield JSON objects from a JSONL file or stdin ('-')."""
    if path == "-":
        stream = sys.stdin
        owns_stream = False
    else:
        try:
            stream = open(path, "r", encoding="utf-8", errors="replace")
        except OSError as exc:
            raise MailError(f"cannot read {path}: {exc}") from exc
        owns_stream = True
    try:
        for number, line in enumerate(stream, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise MailError(f"{path}:{number}: invalid JSON: {exc}") from exc
            if not isinstance(record, dict):
                raise MailError(f"{path}:{number}: expected a JSON object")
            yield record
    finally:
        if owns_stream:
            stream.close()


def write_json_atomic(path: str, payload: Any, *, mode: int = 0o600) -> Path:
    """Write JSON via a same-directory temp file and os.replace."""
    target = Path(path).expanduser()
    parent = target.parent
    if not parent.is_dir():
        raise MailError(f"directory does not exist: {parent}")
    descriptor = -1
    temporary = ""
    try:
        descriptor, temporary = tempfile.mkstemp(
            prefix=f".{target.name}.", dir=str(parent)
        )
        with os.fdopen(descriptor, "w", encoding="utf-8", errors="replace") as handle:
            descriptor = -1
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, target)
    except (OSError, TypeError, ValueError) as exc:
        if descriptor >= 0:
            try:
                os.close(descriptor)
            except OSError:
                pass
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass
        raise MailError(f"cannot write {path}: {exc}") from exc
    return target


def shorten(value: str, limit: int = 72) -> str:
    value = " ".join(value.split())
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)] + "\u2026"


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------


def _check(condition: bool, message: str, checks: list[str]) -> None:
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def self_test() -> int:
    checks: list[str] = []
    try:
        encoded = decode_header_value("=?utf-8?B?U2VlIHlvdSBvbiBib2FyZA==?=")
        _check(encoded == "See you on board", "decodes RFC 2047 UTF-8 words", checks)

        unknown = decode_header_value(b"=?unknown-8bit?Q?caf=E9?=")
        _check(unknown == "caf\u00e9", "survives charset unknown-8bit", checks)

        emoji = decode_header_value(b"\xf0\x9f\x98\x80")
        _check(emoji == "\U0001f600", "survives raw 8-bit UTF-8 bytes", checks)

        decomposed = decode_header_value("e\u0301")
        _check(decomposed == "\u00e9", "NFC-normalizes decoded text", checks)

        malformed = decode_header_value(b"=?utf-8?B?!!!?=")
        _check(isinstance(malformed, str), "survives malformed encoded words", checks)

        headers = parse_header_block(
            b"From: Alice Example <Alice@Example.COM>\r\n"
            b"Subject: =?utf-8?Q?Hi_there?=\r\n\r\n"
        )
        _check(headers.get("subject") == "Hi there", "parses a folded header block", checks)

        addresses = extract_addresses('"Example, Alice" <Alice@Example.COM>')
        _check(
            addresses == [("alice@example.com", "Example, Alice")],
            "extracts quoted display names and lowercase addresses",
            checks,
        )
        _check(
            extract_addresses("not an address") == [],
            "drops malformed address headers",
            checks,
        )

        for original in ("Archive/2026 & notes", "&", "\u65e5\u672c\u8a9e"):
            round_trip = decode_modified_utf7(encode_modified_utf7(original))
            _check(
                round_trip == original,
                f"round-trips modified UTF-7 for {original!r}",
                checks,
            )
        _check(
            quote_mailbox('A "B"\\C').startswith('"'),
            "quotes mailbox names with quotes and backslashes",
            checks,
        )

        batches = list(chunked(range(7), 3))
        _check(batches == [[0, 1, 2], [3, 4, 5], [6]], "chunks UIDs at the boundary", checks)
        _check(list(chunked([], 3)) == [], "chunking an empty sequence is empty", checks)

        _check(
            quote_imap_string('a"b\\c') == '"a\\"b\\\\c"',
            "escapes quotes and backslashes in IMAP strings",
            checks,
        )
        rejected = False
        try:
            quote_imap_string("a\r\nb")
        except MailError:
            rejected = True
        _check(rejected, "rejects CR/LF in IMAP strings", checks)

        metadata = (
            b'1 (UID 42 FLAGS (\\Seen) X-GM-LABELS ("\\\\Inbox" "Work/2026") '
            b"BODY[HEADER.FIELDS (SUBJECT)] {20}"
        )
        parsed = parse_fetch_response([(metadata, b"Subject: Hello\r\n\r\n")])
        _check(len(parsed) == 1 and parsed[0]["uid"] == 42, "parses UID from FETCH", checks)
        _check(
            parsed[0]["flags"] == ["\\Seen"],
            "parses FLAGS from FETCH",
            checks,
        )
        _check(
            parsed[0]["labels"] == ["\\Inbox", "Work/2026"],
            "parses and unescapes X-GM-LABELS",
            checks,
        )

        empty_keyring: Callable[[str], str | None] = lambda _user: None
        with_sentinel: Callable[[str], str | None] = (
            lambda _user: "self-test-secret-do-not-print"
        )
        standard = argparse.Namespace(password_stdin=False, password_env=None)

        value = resolve_password(
            standard,
            "user@example.com",
            environ={CREDENTIAL_ENV: "env pass"},
            stdin=None,
            keyring_lookup_fn=with_sentinel,
        )
        _check(value == "envpass", "EMAIL_APP_PASSWORD wins over the keyring", checks)

        value = resolve_password(
            argparse.Namespace(password_stdin=True, password_env=None),
            "user@example.com",
            environ={CREDENTIAL_ENV: "env pass"},
            stdin=io.StringIO("stdin pass\n"),
            keyring_lookup_fn=with_sentinel,
        )
        _check(value == "stdinpass", "--password-stdin wins over the environment", checks)

        value = resolve_password(
            argparse.Namespace(password_stdin=False, password_env="CUSTOM"),
            "user@example.com",
            environ={"CUSTOM": "custom pass"},
            keyring_lookup_fn=with_sentinel,
        )
        _check(value == "custompass", "--password-env reads the named variable", checks)

        value = resolve_password(
            standard,
            "user@example.com",
            environ={},
            keyring_lookup_fn=lambda _user: "key ring pass",
        )
        _check(value == "keyringpass", "falls back to the keyring", checks)

        missing_message = ""
        try:
            resolve_password(
                standard,
                "user@example.com",
                environ={},
                keyring_lookup_fn=empty_keyring,
            )
        except MailError as exc:
            missing_message = str(exc)
        _check(
            "--password-stdin" in missing_message and CREDENTIAL_ENV in missing_message,
            "missing-password error explains every option",
            checks,
        )
        _check(
            "self-test-secret-do-not-print" not in missing_message,
            "missing-password error never echoes a secret",
            checks,
        )
        _check(
            "user@example.com" not in missing_message
            and "u***@example.com" in missing_message,
            "missing-password error redacts the account address",
            checks,
        )

        _check(
            mask_account("alice@example.com") == "a***@example.com",
            "masks the account local part for reports",
            checks,
        )

        missing_env = ""
        try:
            resolve_password(
                argparse.Namespace(password_stdin=False, password_env="ABSENT"),
                "user@example.com",
                environ={},
                keyring_lookup_fn=with_sentinel,
            )
        except MailError as exc:
            missing_env = str(exc)
        _check("ABSENT" in missing_env, "missing --password-env names the variable", checks)

        redacted = redact_secret("failed with key ring pass", "key ring pass")
        _check(
            "keyringpass" not in redacted and "key ring pass" not in redacted,
            "redacts both secret spellings",
            checks,
        )

        user = resolve_user(
            argparse.Namespace(user=None),
            environ={USER_ENV: "person@example.com"},
        )
        _check(user == "person@example.com", "EMAIL_USER resolves the account", checks)

        host, port = resolve_host_port(argparse.Namespace(host=None, port=None), environ={})
        _check(
            (host, port) == (DEFAULT_HOST, DEFAULT_PORT),
            "defaults to imap.gmail.com:993",
            checks,
        )
        host, port = resolve_host_port(
            argparse.Namespace(host=None, port=None, starttls=True), environ={}
        )
        _check(
            (host, port) == (DEFAULT_HOST, DEFAULT_STARTTLS_PORT),
            "STARTTLS defaults to port 143",
            checks,
        )
        host, port = resolve_host_port(
            argparse.Namespace(host="mail.example.net", port=1993),
            environ={},
        )
        _check(
            (host, port) == ("mail.example.net", 1993),
            "accepts a non-Gmail host and custom port",
            checks,
        )

        plaintext_143 = ""
        try:
            validate_transport(143, False)
        except MailError as exc:
            plaintext_143 = str(exc)
        _check(
            "requires --starttls" in plaintext_143,
            "refuses plaintext port 143 with an explicit STARTTLS error",
            checks,
        )
        starttls_993 = ""
        try:
            validate_transport(993, True)
        except MailError as exc:
            starttls_993 = str(exc)
        _check(
            "port 993" in starttls_993,
            "refuses --starttls on implicit-TLS port 993",
            checks,
        )
    except AssertionError as exc:
        print(f"mail_common self-test: FAIL: {exc}", file=sys.stderr)
        return 1
    except MailError as exc:
        print(f"mail_common self-test: FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"mail_common self-test: PASS ({len(checks)} checks)")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Shared IMAP, credential, decoding, and output helpers for the "
            "email-management scripts. This module mutates nothing."
        )
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run offline assertions (no network, no keyring access)",
    )
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    parser.print_help(sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
