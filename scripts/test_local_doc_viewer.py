"""Tests for the bounded loopback-only local document viewer."""

from __future__ import annotations

import http.client
import importlib.util
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

_MODULE_SPEC = importlib.util.spec_from_file_location(
    "local_doc_viewer", Path(__file__).with_name("local-doc-viewer.py")
)
if _MODULE_SPEC is None or _MODULE_SPEC.loader is None:
    raise ImportError("could not load local-doc-viewer.py")
local_doc_viewer = importlib.util.module_from_spec(_MODULE_SPEC)
sys.modules[_MODULE_SPEC.name] = local_doc_viewer
_MODULE_SPEC.loader.exec_module(local_doc_viewer)


class LocalDocViewerTests(unittest.TestCase):
    """Exercise safe acquisition, exact routes, and real loopback HTTP behavior."""

    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory(
            prefix="local-doc-viewer-test-", dir="/tmp/opencode"
        )
        self.directory = Path(self.temp_directory.name)
        self.document_path = self.directory / "request-coverage.md"
        self.document_path.write_text(
            "# Request coverage\n\n| Method | Result |\n| --- | --- |\n| GET | read only |\n",
            encoding="utf-8",
        )
        document = local_doc_viewer.read_explicit_file(str(self.document_path))
        self.server = local_doc_viewer.create_server([document], ttl_seconds=30)
        self.server_thread = threading.Thread(
            target=local_doc_viewer.serve_until_expired,
            args=(self.server,),
            daemon=True,
        )
        self.server_thread.start()

    def tearDown(self) -> None:
        self.stop_server()
        self.temp_directory.cleanup()

    def stop_server(self) -> None:
        """Stop and close the current test server before replacing it."""
        self.server.stop_event.set()
        self.server_thread.join(timeout=2)
        self.server.server_close()

    def request(
        self,
        method: str,
        path: str,
        host: str | None = None,
        body: bytes | None = None,
    ) -> tuple[int, http.client.HTTPMessage, bytes]:
        """Issue a direct loopback request without consulting proxy settings."""
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        headers = {} if host is None else {"Host": host}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = (response.status, response.headers, response.read())
        connection.close()
        return result

    def test_get_and_head_serve_the_preloaded_document(self) -> None:
        """GET returns rendered content and HEAD returns matching headers only."""
        path = f"/{self.server.capability}"
        get_status, get_headers, get_body = self.request("GET", path)
        head_status, head_headers, head_body = self.request("HEAD", path)

        self.assertEqual(get_status, 200)
        self.assertIn(b"Request coverage", get_body)
        self.assertIn(b"<table>", get_body)
        self.assertEqual(head_status, 200)
        self.assertEqual(head_body, b"")
        self.assertEqual(get_headers["Content-Length"], head_headers["Content-Length"])

    def test_capability_traversal_query_and_host_mismatch_are_generic_404(self) -> None:
        """Only the exact unqueried capability route and expected Host are served."""
        paths = (
            f"/{self.server.capability}-wrong",
            f"/{self.server.capability}?file=/etc/passwd",
            f"/{self.server.capability}/../etc/passwd",
            f"/{self.server.capability}/%2e%2e/etc/passwd",
            f"/%2f{self.server.capability}",
        )
        for path in paths:
            with self.subTest(path=path):
                status, _, body = self.request("GET", path)
                self.assertEqual(status, 404)
                self.assertEqual(body, b"Not Found\n")

        status, _, body = self.request("GET", f"/{self.server.capability}", "attacker.test")
        self.assertEqual(status, 404)
        self.assertEqual(body, b"Not Found\n")

    def test_arbitrary_paths_never_read_files(self) -> None:
        """An unlisted path cannot select a filesystem object such as passwd."""
        status, _, body = self.request("GET", "/etc/passwd")
        self.assertEqual(status, 404)
        self.assertNotIn(b"root:", body)

    def test_mutating_and_discovery_methods_are_refused(self) -> None:
        """POST and other methods receive 405 with the narrow Allow header."""
        status, headers, body = self.request("POST", f"/{self.server.capability}", body=b"x")
        self.assertEqual(status, 405)
        self.assertEqual(headers["Allow"], "GET, HEAD")
        self.assertEqual(body, b"Method Not Allowed\n")

    def test_html_is_escaped_and_security_headers_are_present(self) -> None:
        """Raw HTML stays text, and browser features/caching remain constrained."""
        self.stop_server()
        escaped_document = local_doc_viewer.Document(
            "unsafe <title>.md", "<script>alert(1)</script>\n\n# Safe heading\n"
        )
        self.server = local_doc_viewer.create_server([escaped_document], ttl_seconds=30)
        self.server_thread = threading.Thread(
            target=local_doc_viewer.serve_until_expired,
            args=(self.server,),
            daemon=True,
        )
        self.server_thread.start()

        status, headers, body = self.request("GET", f"/{self.server.capability}")
        self.assertEqual(status, 200)
        self.assertIn(b"&lt;script&gt;alert(1)&lt;/script&gt;", body)
        self.assertNotIn(b"<script>", body)
        self.assertIn(b"&lt;title&gt;", body)
        self.assertIn("default-src 'none'", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["Referrer-Policy"], "no-referrer")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    def test_multiple_explicit_files_link_only_to_allowlisted_routes(self) -> None:
        """A second explicit document is reachable only through its fixed route."""
        second_path = self.directory / "plan.md"
        second_path.write_text("# Current plan\n", encoding="utf-8")
        documents = [
            local_doc_viewer.read_explicit_file(str(self.document_path)),
            local_doc_viewer.read_explicit_file(str(second_path)),
        ]
        self.stop_server()
        self.server = local_doc_viewer.create_server(documents, ttl_seconds=30)
        self.server_thread = threading.Thread(
            target=local_doc_viewer.serve_until_expired,
            args=(self.server,),
            daemon=True,
        )
        self.server_thread.start()

        status, _, body = self.request("GET", f"/{self.server.capability}")
        self.assertEqual(status, 200)
        self.assertIn(f"/{self.server.capability}/1".encode(), body)
        status, _, second_body = self.request("GET", f"/{self.server.capability}/1")
        self.assertEqual(status, 200)
        self.assertIn(b"Current plan", second_body)
        status, _, _ = self.request("GET", f"/{self.server.capability}/2")
        self.assertEqual(status, 404)


class SafeFileAcquisitionTests(unittest.TestCase):
    """Verify path safety and bounded reads without launching a server."""

    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory(
            prefix="local-doc-viewer-files-", dir="/tmp/opencode"
        )
        self.directory = Path(self.temp_directory.name)

    def tearDown(self) -> None:
        self.temp_directory.cleanup()

    def test_oversized_files_are_rejected_before_contents_are_served(self) -> None:
        """Oversize checks reject the file and the streaming reader stops at limit+1."""
        path = self.directory / "too-large.md"
        path.write_bytes(b"x" * (local_doc_viewer.MAX_FILE_BYTES + 1))
        with self.assertRaisesRegex(ValueError, "exceeds"):
            local_doc_viewer.read_explicit_file(str(path))

        file_fd = os.open(path, os.O_RDONLY)
        try:
            original_read = os.read
            bytes_read = 0

            def count_read(descriptor: int, size: int) -> bytes:
                nonlocal bytes_read
                chunk = original_read(descriptor, size)
                bytes_read += len(chunk)
                return chunk

            with patch.object(local_doc_viewer.os, "read", side_effect=count_read):
                with self.assertRaisesRegex(ValueError, "exceeds"):
                    local_doc_viewer._read_bounded(file_fd)
            self.assertEqual(bytes_read, local_doc_viewer.MAX_FILE_BYTES + 1)
        finally:
            os.close(file_fd)

    def test_symlink_file_and_symlink_ancestor_are_rejected(self) -> None:
        """Neither a final symlink nor a symlinked parent is followed."""
        real_directory = self.directory / "real"
        real_directory.mkdir()
        target = real_directory / "safe.md"
        target.write_text("private source", encoding="utf-8")
        final_link = self.directory / "file-link.md"
        final_link.symlink_to(target)
        ancestor_link = self.directory / "directory-link"
        ancestor_link.symlink_to(real_directory, target_is_directory=True)

        with patch.object(local_doc_viewer.os, "read", wraps=os.read) as read_file:
            with self.assertRaises((OSError, ValueError)):
                local_doc_viewer.read_explicit_file(str(final_link))
            with self.assertRaises((OSError, ValueError)):
                local_doc_viewer.read_explicit_file(str(ancestor_link / "safe.md"))
            read_file.assert_not_called()

    def test_hardlinked_and_non_utf8_files_are_rejected(self) -> None:
        """Hard links and invalid UTF-8 cannot enter the rendered document set."""
        source = self.directory / "source.md"
        source.write_bytes(b"\xff")
        linked = self.directory / "linked.md"
        os.link(source, linked)
        with self.assertRaisesRegex(ValueError, "hard links"):
            local_doc_viewer.read_explicit_file(str(source))

        source.unlink()
        with self.assertRaises(UnicodeError):
            local_doc_viewer.read_explicit_file(str(linked))


class ExpiryTests(unittest.TestCase):
    """Verify a server stops accepting work when its bounded TTL elapses."""

    def test_server_loop_exits_after_ttl(self) -> None:
        """The serving loop terminates automatically at its monotonic deadline."""
        server = local_doc_viewer.create_server(
            [local_doc_viewer.Document("short.md", "short-lived")], ttl_seconds=1
        )
        server_thread = threading.Thread(
            target=local_doc_viewer.serve_until_expired,
            args=(server,),
            daemon=True,
        )
        server_thread.start()
        server_thread.join(timeout=2.5)
        try:
            self.assertFalse(server_thread.is_alive())
            self.assertLessEqual(server.expires_at, time.monotonic())
        finally:
            server.stop_event.set()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
