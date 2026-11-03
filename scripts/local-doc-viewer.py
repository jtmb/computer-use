#!/usr/bin/env python3
"""Serve explicitly selected UTF-8 documents as a short-lived local HTML view."""

from __future__ import annotations

import argparse
import html
import http.server
import ipaddress
import json
import os
import re
import secrets
import socket
import socketserver
import stat
import sys
import threading
import time
from dataclasses import dataclass
from typing import Sequence
from urllib.parse import unquote_to_bytes

MAX_FILE_BYTES = 256 * 1024
MAX_FILES = 4
DEFAULT_TTL_SECONDS = 8 * 60 * 60
MAX_TTL_SECONDS = 24 * 60 * 60
REQUEST_TIMEOUT_SECONDS = 5.0
SERVER_POLL_SECONDS = 0.25

TABLE_SEPARATOR = re.compile(r"^:?-{3,}:?$")
HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")
LIST_ITEM = re.compile(r"^\s*([-+*]|[0-9]+[.)])\s+(.+)$")
FENCE = re.compile(r"^\s*```")
INLINE_CODE = re.compile(r"`([^`]+)`")
INLINE_BOLD = re.compile(r"\*\*(.+?)\*\*")


@dataclass(frozen=True)
class Document:
    """An explicitly selected UTF-8 document and its display label."""

    label: str
    text: str


def read_explicit_file(file_path: str) -> Document:
    """Read one regular, non-symlink, single-link UTF-8 file with a strict size cap.

    Args:
        file_path: A file path explicitly supplied on the command line.

    Returns:
        The file's basename and decoded UTF-8 text.

    Raises:
        OSError: If the path cannot be traversed safely or read.
        ValueError: If the path is unsafe, oversized, or not a regular file.
        UnicodeError: If the filename or contents are not valid UTF-8.
    """
    if not file_path or "\x00" in file_path:
        raise ValueError("file path must be non-empty and contain no NUL")

    is_absolute = os.path.isabs(file_path)
    path_parts = file_path.split(os.sep)
    if not path_parts[-1] or path_parts[-1] in (".", ".."):
        raise ValueError("file path must name a file")

    components = path_parts
    if not is_absolute:
        components = os.getcwd().split(os.sep) + path_parts

    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
    directory_fd = os.open(os.sep, directory_flags)
    try:
        for component in components[:-1]:
            if component in ("", "."):
                continue
            next_fd = os.open(
                component,
                directory_flags | os.O_NOFOLLOW,
                dir_fd=directory_fd,
            )
            os.close(directory_fd)
            directory_fd = next_fd

        filename = components[-1]
        before_open = os.stat(filename, dir_fd=directory_fd, follow_symlinks=False)
        _validate_file_stat(before_open)
        file_fd = os.open(
            filename,
            os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=directory_fd,
        )
        try:
            opened_stat = os.fstat(file_fd)
            _validate_file_stat(opened_stat)
            if (opened_stat.st_dev, opened_stat.st_ino) != (
                before_open.st_dev,
                before_open.st_ino,
            ):
                raise ValueError("file changed while being opened")
            contents = _read_bounded(file_fd)
        finally:
            os.close(file_fd)
    finally:
        os.close(directory_fd)

    basename = os.fsencode(filename).decode("utf-8", "strict")
    return Document(basename, contents.decode("utf-8", "strict"))


def _validate_file_stat(file_stat: os.stat_result) -> None:
    """Reject non-regular files, hard links, and files already over the cap."""
    if not stat.S_ISREG(file_stat.st_mode):
        raise ValueError("selected path is not a regular file")
    if file_stat.st_nlink != 1:
        raise ValueError("selected file must not have hard links")
    if file_stat.st_size > MAX_FILE_BYTES:
        raise ValueError(f"selected file exceeds {MAX_FILE_BYTES} bytes")


def _read_bounded(file_fd: int) -> bytes:
    """Read no more than the configured limit plus one detection byte."""
    chunks: list[bytes] = []
    total = 0
    while total <= MAX_FILE_BYTES:
        chunk = os.read(file_fd, MAX_FILE_BYTES + 1 - total)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    if total > MAX_FILE_BYTES:
        raise ValueError(f"selected file exceeds {MAX_FILE_BYTES} bytes")
    return b"".join(chunks)


def _inline_markup(text: str) -> str:
    """Escape source text before applying a tiny, non-linking Markdown subset."""
    escaped = html.escape(text, quote=False)
    escaped = INLINE_CODE.sub(r"<code>\1</code>", escaped)
    escaped = INLINE_BOLD.sub(r"<strong>\1</strong>", escaped)
    return escaped


def _table_cells(line: str) -> list[str]:
    """Split a simple Markdown table row into trimmed cells."""
    row = line.strip()
    if row.startswith("|"):
        row = row[1:]
    if row.endswith("|"):
        row = row[:-1]
    return [cell.strip() for cell in row.split("|")]


def _is_table_separator(line: str) -> bool:
    """Return whether a pipe-delimited row is a Markdown table separator."""
    cells = _table_cells(line)
    return bool(cells) and all(TABLE_SEPARATOR.fullmatch(cell) for cell in cells)


def _render_markdown(text: str) -> str:
    """Render readable Markdown blocks while treating all source as untrusted text."""
    lines = text.splitlines()
    output: list[str] = []
    paragraph: list[str] = []
    list_tag: str | None = None
    code_lines: list[str] = []
    in_code = False

    def flush_paragraph() -> None:
        if paragraph:
            output.append(f"<p>{_inline_markup(chr(10).join(paragraph))}</p>")
            paragraph.clear()

    def close_list() -> None:
        nonlocal list_tag
        if list_tag is not None:
            output.append(f"</{list_tag}>")
            list_tag = None

    index = 0
    while index < len(lines):
        line = lines[index]
        if in_code:
            if FENCE.match(line):
                output.append(f"<pre><code>{html.escape(chr(10).join(code_lines), quote=False)}</code></pre>")
                code_lines.clear()
                in_code = False
            else:
                code_lines.append(line)
            index += 1
            continue

        if FENCE.match(line):
            flush_paragraph()
            close_list()
            in_code = True
            index += 1
            continue

        heading = HEADING.match(line)
        if heading:
            flush_paragraph()
            close_list()
            level = len(heading.group(1))
            output.append(
                f"<h{level}>{_inline_markup(heading.group(2))}</h{level}>"
            )
            index += 1
            continue

        if index + 1 < len(lines) and "|" in line and _is_table_separator(lines[index + 1]):
            flush_paragraph()
            close_list()
            headers = _table_cells(line)
            output.append("<table><thead><tr>")
            output.extend(f"<th>{_inline_markup(cell)}</th>" for cell in headers)
            output.append("</tr></thead><tbody>")
            index += 2
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                cells = _table_cells(lines[index])
                output.append("<tr>")
                for cell_index in range(len(headers)):
                    cell = cells[cell_index] if cell_index < len(cells) else ""
                    output.append(f"<td>{_inline_markup(cell)}</td>")
                output.append("</tr>")
                index += 1
            output.append("</tbody></table>")
            continue

        item = LIST_ITEM.match(line)
        if item:
            flush_paragraph()
            next_tag = "ol" if item.group(1)[0].isdigit() else "ul"
            if list_tag != next_tag:
                close_list()
                output.append(f"<{next_tag}>")
                list_tag = next_tag
            output.append(f"<li>{_inline_markup(item.group(2))}</li>")
            index += 1
            continue

        if not line.strip():
            flush_paragraph()
            close_list()
            index += 1
            continue

        close_list()
        paragraph.append(line)
        index += 1

    if in_code:
        output.append(f"<pre><code>{html.escape(chr(10).join(code_lines), quote=False)}</code></pre>")
    flush_paragraph()
    close_list()
    return "\n".join(output)


def _render_document(document: Document, document_links: Sequence[tuple[str, str]]) -> bytes:
    """Return a standalone HTML page with only links to explicitly served files."""
    navigation = ""
    if len(document_links) > 1:
        links = "".join(
            '<li><a rel="noreferrer" href="{}">{}</a></li>'.format(
                html.escape(path, quote=True),
                html.escape(label, quote=False),
            )
            for label, path in document_links
        )
        navigation = f'<nav aria-label="Documents"><ul>{links}</ul></nav>'
    page = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
body {{ font: 16px/1.55 system-ui, sans-serif; margin: 2rem auto; max-width: 76rem; padding: 0 1rem; color: #17202a; }}
nav, table {{ margin: 1.5rem 0; }}
nav ul {{ display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; padding: 0; }}
table {{ border-collapse: collapse; display: block; max-width: 100%; overflow-x: auto; }}
th, td {{ border: 1px solid #8a969f; padding: .4rem .65rem; text-align: left; vertical-align: top; }}
pre, p {{ overflow-wrap: anywhere; white-space: pre-wrap; }}
pre {{ background: #f2f4f5; padding: 1rem; }}
code {{ background: #f2f4f5; }}
</style>
</head>
<body>
<header><h1>{title}</h1>{navigation}</header>
<main>{content}</main>
</body>
</html>
""".format(
        title=html.escape(document.label, quote=False),
        navigation=navigation,
        content=_render_markdown(document.text),
    )
    return page.encode("utf-8")


class LocalDocServer(http.server.HTTPServer):
    """A single-threaded loopback server with exact capability routes."""

    request_queue_size = 5

    def __init__(
        self,
        documents: Sequence[Document],
        port: int,
        ttl_seconds: int,
        capability: str | None = None,
    ) -> None:
        """Preload the allowlist and bind the capability server on loopback."""
        if not documents or len(documents) > MAX_FILES:
            raise ValueError(f"provide between 1 and {MAX_FILES} documents")
        if not 1 <= ttl_seconds <= MAX_TTL_SECONDS:
            raise ValueError(f"TTL must be between 1 and {MAX_TTL_SECONDS} seconds")
        self.capability = capability or secrets.token_urlsafe(32)
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,64}", self.capability):
            raise ValueError("invalid capability token")
        self.expires_at = time.monotonic() + ttl_seconds
        self.stop_event = threading.Event()
        self.file_labels = [document.label for document in documents]
        route_paths = [
            f"/{self.capability}" if index == 0 else f"/{self.capability}/{index}"
            for index in range(len(documents))
        ]
        document_links = list(zip(self.file_labels, route_paths, strict=True))
        self.routes = {
            path: _render_document(document, document_links)
            for path, document in zip(route_paths, documents, strict=True)
        }
        self.file_urls: list[str] = []
        super().__init__(("127.0.0.1", port), _make_handler(), bind_and_activate=False)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        self.server_bind()
        self.server_activate()
        self.file_urls = [f"http://127.0.0.1:{self.server_port}{path}" for path in route_paths]

    def server_bind(self) -> None:
        """Bind without hostname lookup so startup stays strictly loopback-only."""
        socketserver.TCPServer.server_bind(self)
        self.server_name = "127.0.0.1"
        self.server_port = int(self.socket.getsockname()[1])

    def get_request(self) -> tuple[socket.socket, tuple[str, int]]:
        """Apply a bounded idle timeout to each accepted connection."""
        request, client_address = super().get_request()
        request.settimeout(REQUEST_TIMEOUT_SECONDS)
        return request, client_address


def _make_handler() -> type[http.server.BaseHTTPRequestHandler]:
    """Create a handler whose only successful routes are preloaded documents."""

    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "LocalDocViewer"
        sys_version = ""

        def log_message(self, format_string: str, *args: object) -> None:
            """Suppress access logs so capability URLs are never written to logs."""
            return

        def log_error(self, format_string: str, *args: object) -> None:
            """Suppress request logs, which may contain capability URLs."""
            return

        def parse_request(self) -> bool:
            """Require loopback clients, an exact Host header, and a live TTL."""
            if not super().parse_request():
                return False
            try:
                client_is_loopback = ipaddress.ip_address(self.client_address[0]).is_loopback
            except ValueError:
                client_is_loopback = False
            expected_host = f"127.0.0.1:{self.server.server_port}"
            host_headers = self.headers.get_all("Host", [])
            if (
                not client_is_loopback
                or host_headers != [expected_host]
                or time.monotonic() >= self.server.expires_at
            ):
                self._respond(404, b"Not Found\n", "text/plain; charset=utf-8")
                return False
            return True

        def _respond(
            self,
            status: int,
            body: bytes,
            content_type: str,
            allow_methods: bool = False,
        ) -> None:
            """Write a closed-connection response with the viewer's security headers."""
            self.close_connection = True
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; "
                "form-action 'none'; frame-ancestors 'none'",
            )
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Options", "DENY")
            if allow_methods:
                self.send_header("Allow", "GET, HEAD")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _not_found(self) -> None:
            """Return the same generic 404 for every unavailable route."""
            self._respond(404, b"Not Found\n", "text/plain; charset=utf-8")

        def _method_not_allowed(self) -> None:
            """Reject a request method outside the read-only GET/HEAD pair."""
            self._respond(
                405,
                b"Method Not Allowed\n",
                "text/plain; charset=utf-8",
                allow_methods=True,
            )

        def send_error(
            self,
            code: int,
            message: str | None = None,
            explain: str | None = None,
        ) -> None:
            """Map parser errors to short generic responses without request details."""
            if code == 501:
                self._method_not_allowed()
                return
            status = code if 400 <= code < 500 else 400
            self._respond(status, b"Bad Request\n", "text/plain; charset=utf-8")

        def handle_expect_100(self) -> bool:
            """Refuse request bodies before a client can send an Expect payload."""
            self._method_not_allowed()
            return False

        def _route_body(self) -> bytes | None:
            """Decode a path once and return only an exact preloaded route match."""
            raw_path = self.path
            if (
                not raw_path.startswith("/")
                or raw_path.startswith("//")
                or "?" in raw_path
                or "#" in raw_path
            ):
                return None
            try:
                decoded_path = unquote_to_bytes(raw_path).decode("ascii", "strict")
            except UnicodeError:
                return None
            return self.server.routes.get(decoded_path)

        def do_GET(self) -> None:
            """Serve one preloaded document for an exact capability path."""
            body = self._route_body()
            if body is None:
                self._not_found()
                return
            self._respond(200, body, "text/html; charset=utf-8")

        def do_HEAD(self) -> None:
            """Return the document headers without a response body."""
            body = self._route_body()
            if body is None:
                self._not_found()
                return
            self._respond(200, body, "text/html; charset=utf-8")

        def do_POST(self) -> None:
            """Refuse POST requests without reading or modifying any file."""
            self._method_not_allowed()

        def do_PUT(self) -> None:
            """Refuse PUT requests without reading or modifying any file."""
            self._method_not_allowed()

        def do_PATCH(self) -> None:
            """Refuse PATCH requests without reading or modifying any file."""
            self._method_not_allowed()

        def do_DELETE(self) -> None:
            """Refuse DELETE requests without reading or modifying any file."""
            self._method_not_allowed()

        def do_OPTIONS(self) -> None:
            """Refuse OPTIONS instead of exposing a discovery endpoint."""
            self._method_not_allowed()

        def do_TRACE(self) -> None:
            """Refuse TRACE requests to keep the interface strictly read-only."""
            self._method_not_allowed()

        def do_CONNECT(self) -> None:
            """Refuse CONNECT requests rather than creating a tunnel."""
            self._method_not_allowed()

    return Handler


def create_server(
    documents: Sequence[Document], port: int = 0, ttl_seconds: int = DEFAULT_TTL_SECONDS
) -> LocalDocServer:
    """Bind an ephemeral or explicitly selected TCP port on IPv4 loopback only."""
    if not 0 <= port <= 65535:
        raise ValueError("port must be between 0 and 65535")
    return LocalDocServer(documents, port, ttl_seconds)


def serve_until_expired(server: LocalDocServer) -> None:
    """Handle one request at a time until its TTL expires or stop is requested."""
    while not server.stop_event.is_set():
        remaining = server.expires_at - time.monotonic()
        if remaining <= 0:
            break
        server.timeout = min(SERVER_POLL_SECONDS, remaining)
        server.handle_request()


def _bounded_ttl(value: str) -> int:
    """Parse a TTL in the inclusive range of one second to one day."""
    try:
        ttl_seconds = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("TTL must be an integer") from error
    if not 1 <= ttl_seconds <= MAX_TTL_SECONDS:
        raise argparse.ArgumentTypeError(f"TTL must be between 1 and {MAX_TTL_SECONDS}")
    return ttl_seconds


def _port(value: str) -> int:
    """Parse a TCP port, allowing zero to request an ephemeral port."""
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("port must be an integer") from error
    if not 0 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 0 and 65535")
    return port


def main(argv: Sequence[str] | None = None) -> int:
    """Load selected documents, print readiness JSON, and serve until expiry."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", action="append", required=True, metavar="PATH")
    parser.add_argument("--port", type=_port, default=0)
    parser.add_argument("--ttl-seconds", type=_bounded_ttl, default=DEFAULT_TTL_SECONDS)
    arguments = parser.parse_args(argv)
    if len(arguments.file) > MAX_FILES:
        parser.error(f"at most {MAX_FILES} --file arguments are allowed")

    try:
        documents = [read_explicit_file(file_path) for file_path in arguments.file]
        server = create_server(documents, arguments.port, arguments.ttl_seconds)
    except (OSError, UnicodeError, ValueError) as error:
        print(f"local-doc-viewer: {error}", file=sys.stderr)
        return 2

    ready = {
        "event": "ready",
        "url": server.file_urls[0],
        "port": server.server_port,
        "pid": os.getpid(),
        "filelabels": server.file_labels,
        "fileurls": server.file_urls,
    }
    try:
        print(json.dumps(ready, ensure_ascii=True), flush=True)
        serve_until_expired(server)
    except KeyboardInterrupt:
        return 0
    finally:
        server.stop_event.set()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
