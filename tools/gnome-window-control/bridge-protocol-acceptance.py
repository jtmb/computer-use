#!/usr/bin/env python3
"""Live bridge-protocol acceptance for the chunked capture transport.

Drives Begin/Chunk/End/Abort directly over one D-Bus sender, so the ordering,
replay, abort and release rules are exercised against the running Shell bridge
instead of a controller double. It reads pixels in memory and writes no files.

    python3 tools/gnome-window-control/bridge-protocol-acceptance.py --window-id <id>

Exit 0 when every rule holds, 1 on a failed rule, 2 on a usage/dependency error.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import time

DEST = "org.gnome.Shell.Extensions.OpenCodeWindowControl"
PATH = "/org/gnome/Shell/Extensions/OpenCodeWindowControl"
IFACE = "org.gnome.Shell.Extensions.OpenCodeWindowControl"

failures = 0


def report(ok: bool, message: str) -> None:
    global failures
    print(("PASS " if ok else "FAIL ") + message)
    if not ok:
        failures += 1


class Bus:
    """One sender-bound connection: observations and handles are sender-scoped."""

    def __init__(self) -> None:
        try:
            import gi
        except ImportError:  # pragma: no cover - dependency guard
            print("FAIL PyGObject is unavailable", file=sys.stderr)
            raise SystemExit(2)
        gi.require_version("Gio", "2.0")
        gi.require_version("GLib", "2.0")
        from gi.repository import Gio, GLib

        self._gio = Gio
        self._glib = GLib
        self.connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        if self.connection is None:
            print("FAIL no session bus", file=sys.stderr)
            raise SystemExit(2)

    def call(self, method: str, arguments: tuple, timeout_ms: int = 20_000) -> str:
        reply = self.connection.call_sync(
            DEST, PATH, IFACE, method,
            self._glib.Variant(self._signature(method), arguments),
            None, self._gio.DBusCallFlags.NONE, timeout_ms, None,
        )
        value = reply.unpack()
        return value[0] if value else ""

    @staticmethod
    def _signature(method: str) -> str:
        return {"Begin": "(s)", "Chunk": "(su)", "End": "(s)", "Abort": "(s)"}[method]

    def refuses(self, method: str, arguments: tuple, code: str) -> bool:
        try:
            self.call(method, arguments)
        except Exception as error:  # GLib.Error carries the D-Bus error name
            return code in str(error)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--window-id", required=True)
    parser.add_argument("--require-chunks", type=int, default=1,
                        help="fail when the capture has fewer chunks than this")
    parser.add_argument("--deadline", action="store_true",
                        help="also hold a capture open past the 15 s deadline and prove the "
                             "buffer is released and a fresh Begin works")
    args = parser.parse_args()

    bus = Bus()
    request = json.dumps({"windowId": args.window_id}, separators=(",", ":"))

    begin = json.loads(bus.call("Begin", (request,)))
    handle = begin.get("handle")
    size = begin.get("size")
    count = begin.get("chunkCount")
    if not (isinstance(handle, str) and handle and isinstance(size, int) and size > 0
            and isinstance(count, int) and count >= 1):
        report(False, f"Begin returned an unusable record: {str(begin)[:160]}")
        return 1
    report(True, f"Begin returned a handle, {size} bytes and {count} chunk(s)")
    if count < args.require_chunks:
        report(False, f"expected at least {args.require_chunks} chunks to exercise ordering,"
                      f" got {count}; use a larger or less compressible window")

    report(bus.refuses("Begin", (request,), "Error.BUSY"),
           "a second Begin from the same sender is refused BUSY")

    report(bus.refuses("Chunk", (handle, count), "Error.INVALID_CHUNK"),
           "a chunk index past the end is refused INVALID_CHUNK")

    if count >= 2:
        report(bus.refuses("Chunk", (handle, 1), "Error.INVALID_CHUNK"),
               "chunk 1 before chunk 0 is refused INVALID_CHUNK (ordering)")

    report(bus.refuses("End", (handle,), "Error.INVALID_CHUNK"),
           "End before the last chunk is refused INVALID_CHUNK")

    first = bus.call("Chunk", (handle, 0))
    decoded = base64.b64decode(first, validate=True)
    report(len(decoded) > 0, f"chunk 0 still works after the refused End ({len(decoded)} bytes)")
    report(bus.refuses("Chunk", (handle, 0), "Error.INVALID_CHUNK"),
           "replaying chunk 0 is refused INVALID_CHUNK (no rewind)")

    aborted = json.loads(bus.call("Abort", (handle,)))
    report(aborted.get("aborted") is True, "Abort released the active capture")
    report(bus.refuses("Chunk", (handle, 0), "Error.INVALID_HANDLE"),
           "Chunk after Abort is refused INVALID_HANDLE")
    report(bus.refuses("End", (handle,), "Error.INVALID_HANDLE"),
           "End after Abort is refused INVALID_HANDLE")

    second = json.loads(bus.call("Begin", (request,)))
    handle2 = second.get("handle")
    report(isinstance(handle2, str) and handle2 != handle,
           "Begin succeeds again after Abort (the buffer was released)")
    if not isinstance(handle2, str):
        return 1

    report(bus.refuses("Chunk", (handle2 + "-foreign", 0), "Error.INVALID_HANDLE"),
           "a foreign handle is refused INVALID_HANDLE")

    assembled = bytearray()
    for index in range(second["chunkCount"]):
        assembled.extend(base64.b64decode(bus.call("Chunk", (handle2, index)), validate=True))
    end = json.loads(bus.call("End", (handle2,)))
    digest = hashlib.sha256(bytes(assembled)).hexdigest()
    report(len(assembled) == second["size"] and end.get("sha256") == digest,
           f"a full transfer verifies: {len(assembled)} bytes, digest matches")
    report(end.get("width") == second.get("width") and end.get("height") == second.get("height")
           and end.get("windowId") == args.window_id,
           f"End metadata matches Begin ({end.get('width')}x{end.get('height')})")

    third = json.loads(bus.call("Begin", (request,)))
    report(isinstance(third.get("handle"), str),
           "a further Begin succeeds after a completed capture (no lingering capture)")
    if isinstance(third.get("handle"), str):
        bus.call("Abort", (third["handle"],))

    if args.deadline:
        # Begin, then wait past CAPTURE_DEADLINE_MS (15 s) without fetching a chunk.
        held = json.loads(bus.call("Begin", (request,)))
        held_handle = held.get("handle")
        report(isinstance(held_handle, str), "Begin for the deadline probe returned a handle")
        if isinstance(held_handle, str):
            time.sleep(16)
            report(bus.refuses("Chunk", (held_handle, 0), "Error.INVALID_HANDLE"),
                   "an abandoned capture is reclaimed after the deadline (INVALID_HANDLE)")
            report(bus.refuses("End", (held_handle,), "Error.INVALID_HANDLE"),
                   "End on the expired handle is refused INVALID_HANDLE")
            fresh = json.loads(bus.call("Begin", (request,)))
            report(isinstance(fresh.get("handle"), str),
                   "a fresh Begin succeeds right after the deadline (buffer released)")
            if isinstance(fresh.get("handle"), str):
                bus.call("Abort", (fresh["handle"],))

    if failures:
        print(f"SUMMARY: failures={failures}")
        return 1
    print("SUMMARY: failures=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
