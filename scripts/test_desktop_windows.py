"""Test the window client boundary without desktop mutation or extension activation."""

import importlib.util
import base64
import io
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import unittest
from unittest import mock
import zlib

SPEC = importlib.util.spec_from_file_location("desktop_windows", Path(__file__).with_name("desktop-windows.py"))
client = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(client)


class WindowClientTests(unittest.TestCase):
    """Guard request encoding, apply intent, and untrusted response limits."""

    def test_read_preview_apply_are_distinct_and_json_encoded(self) -> None:
        """Only the explicit paired apply/token form can request Apply."""
        self.assertEqual(client.build_call("list", None, False, None), ("GetState", ()))
        request = '{"action":"focus","windowId":"epoch:1"}'
        self.assertEqual(client.build_call("act", request, False, None), ("Preview", (request,)))
        self.assertEqual(client.build_call("act", request, True, "unique-preview-token"), ("Apply", (request, "unique-preview-token")))
        for command, data, apply, token in [
            ("list", request, False, None), ("act", request, True, None),
            ("act", request, False, "unique-preview-token"), ("act", "[]", False, None),
            ("act", "x" * 20000, False, None), ("act", request, True, "short"),
            ("anything", None, False, None),
        ]:
            with self.assertRaises(ValueError):
                client.build_call(command, data, apply, token)

    def test_reply_limits_and_fixed_method_allowlist(self) -> None:
        """Treat JSON as data and reject arbitrary bus methods before connecting."""
        self.assertEqual(client.decode_reply('{"version":1}'), {"version": 1})
        for text in ("[]", "not JSON", '{"text":"' + "x" * client.MAX_REPLY_BYTES + '"}'):
            with self.assertRaises(ValueError):
                client.decode_reply(text)
        with self.assertRaises(ValueError):
            client.call_bridge("Eval", ("anything",))

    def test_serve_passes_one_sender_to_sequential_commands(self) -> None:
        """Sequential capture and input requests share their retained bus sender."""
        connection = type("Connection", (), {"unique_name": ":1.42"})()
        previous = client._SESSION_BUS_CONNECTION
        client._SESSION_BUS_CONNECTION = connection
        source = io.BytesIO(
            b'{"id":1,"command":"capture","request":{}}\n'
            b'{"id":2,"command":"input","request":{}}\n'
        )
        output = io.BytesIO()

        def reply(_request: str, selected: object | None = None) -> dict[str, object]:
            return {"available": True, "ok": True, "sender": selected.unique_name}

        try:
            with (
                mock.patch.object(client, "call_capture_bridge", side_effect=reply),
                mock.patch.object(client, "call_input_bridge", side_effect=reply),
            ):
                self.assertEqual(client.serve_stream(source, output), 0)
        finally:
            client._SESSION_BUS_CONNECTION = previous

        responses = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([response["id"] for response in responses], [1, 2])
        self.assertEqual([response["sender"] for response in responses], [":1.42", ":1.42"])

    def test_serve_bad_frame_is_structured_and_does_not_stop_later_requests(self) -> None:
        result = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("desktop-windows.py")), "serve"],
            input=b'{"private":"DO_NOT_ECHO",invalid}\n{"id":2,"command":"unknown","request":{}}\n',
            capture_output=True,
            check=False,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, b"")
        self.assertNotIn(b"DO_NOT_ECHO", result.stdout)
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(len(responses), 2)
        self.assertIsNone(responses[0]["id"])
        self.assertEqual(responses[0]["error"], "invalid-request-or-missing-dependency")
        self.assertEqual(responses[1]["id"], 2)
        self.assertEqual(responses[1]["detail"], "unsupported command")

    def test_serve_enforces_request_cap_and_preserves_request_id(self) -> None:
        request = {"value": "x" * client.MAX_REQUEST_BYTES}
        frame = json.dumps({"id": 99, "command": "input", "request": request}).encode() + b"\n"
        source = io.BytesIO(frame)
        output = io.BytesIO()
        self.assertEqual(client.serve_stream(source, output), 0)
        response = json.loads(output.getvalue())
        self.assertEqual(response["id"], 99)
        self.assertFalse(response["ok"])
        self.assertEqual(response["detail"], "request exceeds 16 KiB")

    def test_serve_eof_exits_cleanly(self) -> None:
        result = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("desktop-windows.py")), "serve"],
            input=b"",
            capture_output=True,
            check=False,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(result.stderr, b"")

    def test_cli_rejects_tokenless_apply_before_bus_access(self) -> None:
        """A malformed mutation fails even when no session bus is available."""
        result = subprocess.run([
            sys.executable, str(Path(__file__).with_name("desktop-windows.py")),
            "act", "--request", '{"action":"focus","windowId":"one"}', "--apply",
        ], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(json.loads(result.stdout)["ok"])
        self.assertIn("must be supplied together", result.stdout)

    def test_missing_session_bus_is_a_structured_refusal_not_a_fallback(self) -> None:
        """A failed transport never falls back to another desktop-control route."""
        environment = {**os.environ, "DBUS_SESSION_BUS_ADDRESS": "unix:path=/tmp/opencode/nonexistent-window-test-bus"}
        result = subprocess.run([
            sys.executable, str(Path(__file__).with_name("desktop-windows.py")), "list",
        ], env=environment, capture_output=True, text=True, check=False, timeout=10)
        self.assertEqual(result.returncode, 1)
        reply = json.loads(result.stdout)
        self.assertEqual(reply["error"], "bridge-unavailable")
        self.assertFalse(reply["available"])
        self.assertNotIn("Traceback", result.stderr)

    def test_capture_request_is_target_only_and_bounded(self) -> None:
        request = '{"windowId":"12345678-1234-1234-1234-123456789abc:42"}'
        self.assertEqual(client.build_capture_request(request), request)
        with_limit = '{"windowId":"12345678-1234-1234-1234-123456789abc:42","maxBytes":1024}'
        self.assertEqual(client.build_capture_request(with_limit), request)
        for invalid in (
            None,
            "[]",
            '{"windowId":"epoch:42"}',
            '{"windowId":"12345678-1234-1234-1234-123456789abc:42","other":true}',
            '{"windowId":"12345678-1234-1234-1234-123456789abc:42","maxBytes":0}',
            "x" * (client.MAX_REQUEST_BYTES + 1),
        ):
            with self.subTest(invalid=invalid if len(str(invalid)) < 100 else "oversized"):
                with self.assertRaises((ValueError, TypeError, json.JSONDecodeError)):
                    client.build_capture_request(invalid)

    def test_input_begins_with_observation_and_dispatches_only_the_named_action(self) -> None:
        events: list[tuple[str, tuple[object, ...]]] = []

        def call(method: str, arguments: tuple[object, ...]) -> str:
            events.append((method, arguments))
            if method == "InputBegin":
                return json.dumps({"observationId": "observation-1", "operationId": "operation-1"})
            if method == "InputClick":
                return '{"action":"click","windowId":"window-1"}'
            raise AssertionError(f"Unexpected method: {method}")

        result = client.input_via_bridge(
            json.dumps({"observationId": "observation-1", "action": "click", "x": 3, "y": 4}),
            call,
        )
        self.assertEqual(result, {"action": "click", "windowId": "window-1"})
        self.assertEqual([method for method, _ in events], ["InputBegin", "InputClick"])
        self.assertEqual(json.loads(events[0][1][0]), {"observationId": "observation-1"})
        self.assertEqual(events[1][0], "InputClick")
        self.assertEqual(events[1][1][0], "operation-1")
        self.assertEqual(json.loads(events[1][1][1]), {"x": 3, "y": 4})

    def test_input_actions_map_to_the_fixed_bridge_allowlist(self) -> None:
        samples = [
            ("click", {"x": 1, "y": 2}, "InputClick"),
            ("drag", {"fromX": 1, "fromY": 2, "toX": 3, "toY": 4}, "InputDrag"),
            ("scroll", {"x": 1, "y": 2, "direction": "down"}, "InputScroll"),
            ("press_key", {"key": "Enter"}, "InputPressKey"),
            ("type_text", {"text": "ok"}, "InputTypeText"),
        ]
        for action, fields, expected_method in samples:
            with self.subTest(action=action):
                events: list[str] = []

                def call(method: str, arguments: tuple[object, ...]) -> str:
                    events.append(method)
                    if method == "InputBegin":
                        return '{"observationId":"obs","operationId":"operation-1"}'
                    return '{"status":"ok"}'

                result = client.input_via_bridge(
                    json.dumps({"observationId": "obs", "action": action, **fields}),
                    call,
                )
                self.assertEqual(result, {"status": "ok"})
                self.assertEqual(events, ["InputBegin", expected_method])

    def test_input_releases_held_controls_after_action_failure(self) -> None:
        events: list[str] = []

        def call(method: str, arguments: tuple[object, ...]) -> str:
            events.append(method)
            if method == "InputBegin":
                return '{"observationId":"observation-1","operationId":"operation-1"}'
            if method == "InputClick":
                raise RuntimeError("input action failed")
            if method == "InputReleaseAll":
                return '{"released":true}'
            raise AssertionError(f"Unexpected method: {method}")

        with self.assertRaisesRegex(RuntimeError, "input action failed"):
            client.input_via_bridge(
                '{"observationId":"observation-1","action":"click","x":3,"y":4}',
                call,
            )
        self.assertEqual(events, ["InputBegin", "InputClick", "InputReleaseAll"])

    def test_input_and_launch_requests_are_strict_and_bounded(self) -> None:
        valid = '{"observationId":"obs","action":"press_key","key":"Enter"}'
        self.assertEqual(client.build_input_request(valid)["action"], "press_key")
        for invalid in (
            '{"observationId":"obs","action":"eval"}',
            '{"observationId":"obs","action":"click","x":1,"y":2,"method":"Eval"}',
            '{"observationId":"obs","action":"type_text","text":"bad\\ntext"}',
            "x" * (client.MAX_REQUEST_BYTES + 1),
        ):
            with self.subTest(invalid="oversized" if len(invalid) > 100 else invalid):
                with self.assertRaises((ValueError, TypeError, json.JSONDecodeError)):
                    client.build_input_request(invalid)
        self.assertEqual(
            client.build_launch_request('{"desktopId":"org.example.Editor"}'),
            {"desktopId": "org.example.Editor"},
        )
        with self.assertRaises(ValueError):
            client.build_launch_request('{"desktopId":"org.gnome.Shell"}')

    def test_confirm_sends_the_capability_once_and_caps_its_wait(self) -> None:
        events: list[tuple[str, tuple[object, ...]]] = []

        def call(method: str, arguments: tuple[object, ...]) -> str:
            events.append((method, arguments))
            return json.dumps({"appeared": True, "windowIds": ["new-window"]})

        result = client.confirm_via_bridge(
            '{"launchToken":"capability-1","timeoutMs":9000}',
            call,
        )
        self.assertEqual(result, {"appeared": True, "windowIds": ["new-window"]})
        # Exactly one call: the token is single-use, so polling here would consume it.
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0][0], "ConfirmLaunch")
        self.assertEqual(events[0][1][0], "capability-1")
        self.assertEqual(json.loads(events[0][1][1])["timeoutMs"], 5000)

    def test_confirm_requires_a_launch_token(self) -> None:
        for request in ('{}', '{"beforeWindowIds":["old"],"desktopId":"org.example.Editor","timeoutMs":10}',
                        '{"launchToken":""}', '{"launchToken":"x","extra":1}',
                        '{"launchToken":"x","timeoutMs":-1}'):
            with self.assertRaises(ValueError, msg=request):
                client.build_confirm_request(request)

    def test_capture_rejects_truncated_png_and_attempts_no_disk_fallback(self) -> None:
        png = tiny_png()[:-4]
        bridge = FakeCaptureBridge(png)
        with self.assertRaisesRegex(ValueError, "PNG"):
            client.capture_via_bridge(CAPTURE_REQUEST, bridge.call)
        self.assertEqual(bridge.events[-1], ("End", ("capture-handle-0001",)))
        self.assertNotIn("Abort", [method for method, _ in bridge.events])

    def test_capture_rejects_sha256_mismatch(self) -> None:
        bridge = FakeCaptureBridge(tiny_png(), end_sha256="0" * 64)
        with self.assertRaisesRegex(ValueError, "digest"):
            client.capture_via_bridge(CAPTURE_REQUEST, bridge.call)

    def test_capture_rejects_oversized_begin_before_chunk_transfer(self) -> None:
        bridge = FakeCaptureBridge(tiny_png(), begin_size=client.PNG_MAX_BYTES + 1)
        with self.assertRaisesRegex(ValueError, "limits"):
            client.capture_via_bridge(CAPTURE_REQUEST, bridge.call)
        self.assertEqual([method for method, _ in bridge.events], ["Begin", "Abort"])

    def test_capture_honors_requested_byte_limit_before_chunk_transfer(self) -> None:
        bridge = FakeCaptureBridge(tiny_png())
        request = json.dumps({"windowId": WINDOW_ID, "maxBytes": 8}, separators=(",", ":"))
        with self.assertRaisesRegex(ValueError, "maxBytes"):
            client.capture_via_bridge(request, bridge.call)
        self.assertEqual([method for method, _ in bridge.events], ["Begin", "Abort"])

    def test_capture_rejects_missing_chunk_and_aborts_handle(self) -> None:
        bridge = FakeCaptureBridge(tiny_png(), missing_chunk=0)
        with self.assertRaisesRegex(ValueError, "missing"):
            client.capture_via_bridge(CAPTURE_REQUEST, bridge.call)
        self.assertEqual(bridge.events[-1], ("Abort", ("capture-handle-0001",)))

    def test_capture_assembles_and_validates_an_in_memory_png(self) -> None:
        png = tiny_png()
        bridge = FakeCaptureBridge(png)
        result = client.capture_via_bridge(CAPTURE_REQUEST, bridge.call)
        self.assertEqual(base64.b64decode(result["pngBase64"], validate=True), png)
        self.assertEqual(result["sha256"], hashlib.sha256(png).hexdigest())
        self.assertEqual((result["width"], result["height"]), (1, 1))
        self.assertEqual(result["windowId"], WINDOW_ID)
        self.assertEqual(result["observationId"], "observation-1")
        self.assertEqual(result["bufferRect"], BUFFER_RECT)
        self.assertEqual([method for method, _ in bridge.events], ["Begin", "Chunk", "End"])


WINDOW_ID = "12345678-1234-1234-1234-123456789abc:42"
CAPTURE_REQUEST = json.dumps({"windowId": WINDOW_ID}, separators=(",", ":"))
BUFFER_RECT = {"x": 0, "y": 0, "width": 1, "height": 1}


def png_chunk(name: bytes, data: bytes) -> bytes:
    """Encode one PNG chunk and its CRC for a self-contained test fixture."""
    checksum = zlib.crc32(name + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", checksum)


def tiny_png() -> bytes:
    """Build a valid 1×1 RGBA PNG without creating a file."""
    header = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    compressed = zlib.compress(b"\x00\xff\x00\x00\xff")
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", compressed)
        + png_chunk(b"IEND", b"")
    )


class FakeCaptureBridge:
    """Reply to fixed capture calls while recording ordering and cleanup."""

    def __init__(
        self,
        png: bytes,
        *,
        end_sha256: str | None = None,
        begin_size: int | None = None,
        missing_chunk: int | None = None,
    ) -> None:
        self.png = png
        self.end_sha256 = end_sha256 or hashlib.sha256(png).hexdigest()
        self.begin_size = len(png) if begin_size is None else begin_size
        self.missing_chunk = missing_chunk
        self.events: list[tuple[str, tuple[object, ...]]] = []

    def call(self, method: str, arguments: tuple[object, ...], timeout_ms: int) -> str:
        self.events.append((method, arguments))
        if timeout_ms <= 0:
            raise ValueError("deadline exceeded")
        if method == "Begin":
            chunk_count = (self.begin_size + client.CAPTURE_CHUNK_DATA_BYTES - 1) // client.CAPTURE_CHUNK_DATA_BYTES
            return json.dumps({
                "handle": "capture-handle-0001",
                "size": self.begin_size,
                "chunkCount": chunk_count,
                "width": 1,
                "height": 1,
                "resourceScale": 1,
                "bufferRect": BUFFER_RECT,
                "frameRect": BUFFER_RECT,
                "windowId": WINDOW_ID,
                "epoch": WINDOW_ID.split(":", maxsplit=1)[0],
            })
        if method == "Chunk":
            index = int(arguments[1])
            if index == self.missing_chunk:
                raise ValueError("missing chunk")
            start = index * client.CAPTURE_CHUNK_DATA_BYTES
            return base64.b64encode(self.png[start:start + client.CAPTURE_CHUNK_DATA_BYTES]).decode("ascii")
        if method == "End":
            return json.dumps({
                "sha256": self.end_sha256,
                "size": len(self.png),
                "width": 1,
                "height": 1,
                "resourceScale": 1,
                "bufferRect": BUFFER_RECT,
                "frameRect": BUFFER_RECT,
                "windowId": WINDOW_ID,
                "observationId": "observation-1",
                "epoch": WINDOW_ID.split(":", maxsplit=1)[0],
            })
        if method == "Abort":
            return '{"aborted":true}'
        raise AssertionError(f"Unexpected fake bridge method: {method}")


if __name__ == "__main__":
    unittest.main()
