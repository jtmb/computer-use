#!/usr/bin/env python3
"""One-command check of the live desktop capture path (read-only, no input).

Answers one question against the operator's real GNOME Shell: does a window capture
produce a validated PNG right now, and if not, is the reason that the running Shell still
holds the pre-fix extension module (which only a logout fixes)?

    python3 tools/gnome-window-control/live-capture-check.py [--window-id <id>]

Exit codes:
    0  capture works: validated PNG with an observation id
    1  capture failed for some other reason (the error is printed)
    2  usage or environment problem (bridge unavailable, no window to capture)
    3  the running Shell still holds the pre-fix module; log out and back in
    4  the extension is disabled or not active in this Shell (the bridge cannot exist)

It never sends input, launches an application or writes an image file.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import struct
import subprocess
import sys
from pathlib import Path

CLIENT = Path(__file__).resolve().parents[2] / "scripts" / "desktop-windows.py"
UUID = "opencode-window-control@computer-use.local"


def extension_state() -> tuple[bool | None, str | None]:
    """Return (enabled, state) from the Extensions D-Bus service, or (None, None)."""
    try:
        completed = subprocess.run(
            ["gnome-extensions", "info", UUID],
            capture_output=True, text=True, timeout=20, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None, None
    text = completed.stdout or ""
    enabled = None
    state = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("Enabled:"):
            value = stripped.split(":", 1)[1].strip().lower()
            enabled = value.startswith("y")
        elif stripped.startswith("State:"):
            state = stripped.split(":", 1)[1].strip()
    return enabled, state


def recent_extension_log(limit: int = 6) -> list[str]:
    """Recent journal lines about the extension, for a failure report."""
    try:
        completed = subprocess.run(
            ["journalctl", "--user", "--since", "-30 min", "--no-pager"],
            capture_output=True, text=True, timeout=30, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    interesting = []
    for line in (completed.stdout or "").splitlines():
        low = line.lower()
        if "opencode-window-control" not in low and "js error" not in low:
            continue
        # Skip the activation chatter caused by this very check.
        if "activating service" in low or "requested by" in low:
            continue
        interesting.append(line)
    return interesting[-limit:]


def run(*arguments: str, timeout: int = 60) -> tuple[int, str]:
    completed = subprocess.run(
        [sys.executable, str(CLIENT), *arguments],
        capture_output=True, text=True, timeout=timeout, check=False,
    )
    return completed.returncode, completed.stdout or completed.stderr


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--window-id")
    args = parser.parse_args()

    if not CLIENT.is_file():
        print(f"FAIL client not found: {CLIENT}", file=sys.stderr)
        return 2

    enabled, state = extension_state()
    if enabled is False:
        print("EXTENSION DISABLED: the Shell will not export the bridge.")
        print(f"  Re-enable it: gnome-extensions enable {UUID}")
        return 4
    if state is not None and state.upper() != "ACTIVE":
        print(f"EXTENSION NOT ACTIVE: Enabled={enabled}, State={state}.")
        print("  The bridge cannot exist in this state. A logout/login reloads the")
        print("  extension with fresh code; `gnome-extensions disable/enable` re-runs it but")
        print("  GNOME caches modules by URL, so the fixed module still would not load.")
        for line in recent_extension_log():
            print("  journal:", line[-160:])
        return 4

    list_status, output = run("list")
    try:
        inventory = json.loads(output)
    except json.JSONDecodeError:
        print("FAIL inventory is not JSON:", output[:200], file=sys.stderr)
        return 2
    if list_status != 0:
        print("FAIL the inventory command exited", list_status, file=sys.stderr)
        return 2
    if not inventory.get("available") or not inventory.get("ok"):
        print("FAIL the bridge is unavailable:", inventory.get("error"),
              str(inventory.get("detail"))[:160], file=sys.stderr)
        return 2
    windows = inventory.get("windows") or []
    if not windows:
        print("FAIL no NORMAL window is open, so there is nothing to capture", file=sys.stderr)
        return 2

    window_id = args.window_id
    if not window_id:
        focused = inventory.get("focusedWindowId")
        window_id = next((w["id"] for w in windows if w["id"] == focused), windows[0]["id"])
    title = next((w.get("title") for w in windows if w["id"] == window_id), None)
    if title is None:
        print(f"FAIL window {window_id} is not in the inventory", file=sys.stderr)
        return 2

    capture_status, output = run("capture", "--request", json.dumps({"windowId": window_id}))
    try:
        result = json.loads(output)
    except json.JSONDecodeError:
        print("FAIL capture output is not JSON:", output[:200], file=sys.stderr)
        return 1
    if capture_status != 0 and result.get("ok"):
        print("FAIL capture reported success but the command exited", capture_status, file=sys.stderr)
        return 1

    if not result.get("ok"):
        detail = str(result.get("detail"))
        if "bytes.get_data" in detail:
            print("STALE MODULE: the running Shell still holds the pre-fix extension.")
            print("  A logout/login is required: GNOME caches extension modules by URL, so")
            print("  disabling/enabling the extension cannot load the fixed code.")
            print("  detail:", detail[:160])
            return 3
        print("FAIL capture refused:", result.get("error"), detail[:200], file=sys.stderr)
        return 1

    try:
        raw = base64.b64decode(result["pngBase64"], validate=True)
    except Exception:
        print("FAIL the returned image is not valid base64", file=sys.stderr)
        return 1
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        print("FAIL the returned bytes are not a PNG", file=sys.stderr)
        return 1
    width, height = struct.unpack(">II", raw[16:24])
    observation = result.get("observationId")
    if width < 1 or height < 1 or not isinstance(observation, str) or not observation:
        print("FAIL the PNG or observation id is unusable:", width, height, bool(observation),
              file=sys.stderr)
        return 1

    print(f"PASS live capture: {len(raw)} bytes, {width}x{height}, PNG signature,"
          f" observationId present")
    print("  window:", window_id, "|", title)
    print("  sha256:", hashlib.sha256(raw).hexdigest()[:16])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
