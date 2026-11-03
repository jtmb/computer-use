#!/usr/bin/env python3
"""Visible-outcome desktop workflow acceptance (consequential: use with approval).

Runs one real GUI workflow end to end on the operator's desktop: launch an application by
desktop ID, wait for its confirmed window, photograph it, type into it, photograph it again
and check that the pixels changed. Everything happens over ONE bridge connection because
launch tokens and observations are sender-bound.

    python3 tools/gnome-window-control/desktop-workflow-acceptance.py --yes \
        [--desktop-id org.gnome.Calculator.desktop] [--text "1+1="]

It launches an application, sends keystrokes to the confirmed matching window and requests
cleanup only when the process identity is verified as new and still owns that window. Do not
run it while someone is working in that application.

Exit codes:
    0  the workflow produced a visible change and any cleanup signal was identity-verified
    1  a step failed or process cleanup could not be performed safely
    2  usage, missing approval, or the bridge/process baseline is not usable
    3  launch and capture worked but the keystroke was refused for lack of a seat
       (only with --tolerate-missing-seat): the visible-change half is unproven
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
from dataclasses import dataclass
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

# Repository root derived from this file, so the tool is checkout-independent.
CLIENT = Path(__file__).resolve().parents[2] / "scripts" / "desktop-windows.py"
UUID = "opencode-window-control@computer-use.local"


class Bridge:
    """One persistent client process: one D-Bus sender for the whole workflow."""

    def __init__(self) -> None:
        self.process = subprocess.Popen(
            [sys.executable, str(CLIENT), "serve"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
        )
        self.sequence = 0

    def call(self, command: str, request: dict | None = None) -> dict:
        """Send one JSON command over the persistent, sender-bound bridge."""
        self.sequence += 1
        self.process.stdin.write(json.dumps(
            {"id": self.sequence, "command": command, "request": request or {}},
            separators=(",", ":"),
        ) + "\n")
        self.process.stdin.flush()
        reply = json.loads(self.process.stdout.readline())
        result = reply.get("result") if isinstance(reply.get("result"), dict) else reply
        return result

    def close(self) -> None:
        """Close the one bridge client process owned by this helper."""
        try:
            self.process.stdin.close()
            self.process.wait(timeout=10)
        except (OSError, subprocess.SubprocessError, ValueError):
            self.process.kill()


class AcceptanceFailure(Exception):
    """Carry the exact user-facing failure and exit code for one workflow step."""

    def __init__(self, message: str, code: int = 1) -> None:
        super().__init__(message)
        self.code = code


class ProcessSafetyError(Exception):
    """Raised when process ownership or identity cannot be established safely."""


@dataclass(frozen=True)
class ProcessIdentity:
    """Stable process metadata used to prevent signaling a reused PID."""

    pid: int
    start_time: int
    real_uid: int
    effective_uid: int
    executable: str


@dataclass(frozen=True)
class WorkflowOutcome:
    """Workflow result and the exact selected process eligible for cleanup."""

    code: int
    before_pids: frozenset[int]
    target: dict | None = None
    process_identity: ProcessIdentity | None = None


class ProcessBoundary:
    """Inspect local process identity and signal only through a process file descriptor."""

    def snapshot_pids(self) -> set[int]:
        """Return every numeric PID present before the application launch."""
        try:
            with os.scandir("/proc") as entries:
                return {int(entry.name) for entry in entries if entry.name.isdecimal()}
        except OSError as error:
            raise ProcessSafetyError(f"cannot snapshot /proc process IDs: {error}") from error

    def identify(self, pid: int) -> ProcessIdentity:
        """Read the PID's start time, owner, and executable or fail closed."""
        if isinstance(pid, bool) or not isinstance(pid, int) or pid <= 1:
            raise ProcessSafetyError("target PID is invalid")
        process_dir = Path("/proc") / str(pid)
        try:
            stat_text = (process_dir / "stat").read_text()
            closing_paren = stat_text.rfind(")")
            if closing_paren < 0:
                raise ValueError("process stat has no command boundary")
            stat_fields = stat_text[closing_paren + 2:].split()
            start_time = int(stat_fields[19])
            status_lines = (process_dir / "status").read_text().splitlines()
            uid_line = next(line for line in status_lines if line.startswith("Uid:"))
            uids = [int(value) for value in uid_line.split()[1:5]]
            executable = os.readlink(process_dir / "exe")
        except (OSError, ValueError, UnicodeError, StopIteration, IndexError) as error:
            raise ProcessSafetyError(f"cannot verify process {pid}: {error}") from error
        if start_time <= 0 or len(uids) != 4 or any(uid != os.getuid() for uid in uids):
            raise ProcessSafetyError(f"process {pid} is not owned by this user")
        if not executable:
            raise ProcessSafetyError(f"process {pid} has no verifiable executable")
        return ProcessIdentity(pid, start_time, uids[0], uids[1], executable)

    def terminate_if_same(self, pid: int, expected: ProcessIdentity) -> None:
        """Send one SIGTERM only if a pidfd still refers to the selected process."""
        pidfd_open = getattr(os, "pidfd_open", None)
        pidfd_send_signal = getattr(signal, "pidfd_send_signal", None)
        if not callable(pidfd_open) or not callable(pidfd_send_signal):
            raise ProcessSafetyError("pidfd signaling is unavailable; refusing PID-based cleanup")
        if expected.pid != pid or expected.real_uid != os.getuid() or expected.effective_uid != os.getuid():
            raise ProcessSafetyError("saved process identity does not match the selected user and PID")
        try:
            pidfd = pidfd_open(pid, 0)
        except OSError as error:
            raise ProcessSafetyError(f"cannot open a process identity handle for {pid}: {error}") from error
        try:
            if self.identify(pid) != expected:
                raise ProcessSafetyError(f"process {pid} changed identity before cleanup")
            try:
                pidfd_send_signal(pidfd, signal.SIGTERM, None, 0)
            except (OSError, TypeError) as error:
                raise ProcessSafetyError(f"cannot signal verified process {pid}: {error}") from error
        finally:
            try:
                os.close(pidfd)
            except OSError:
                pass


def _windows(inventory: dict, *, label: str, code: int) -> list[dict]:
    """Validate an inventory's window records and reject duplicate compositor IDs."""
    records = inventory.get("windows")
    if not isinstance(records, list):
        raise AcceptanceFailure(f"{label} returned no valid window inventory", code)
    ids: list[str] = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not record["id"]:
            raise AcceptanceFailure(f"{label} returned a malformed window record", code)
        ids.append(record["id"])
    if len(ids) != len(set(ids)):
        raise AcceptanceFailure(f"{label} returned duplicate window IDs", code)
    return records


def _run_steps(args: argparse.Namespace, bridge: Bridge, processes: ProcessBoundary) -> WorkflowOutcome:
    """Run the confirmed-window workflow and retain only its verified cleanup target."""
    before_pids: frozenset[int] = frozenset()
    target: dict | None = None
    process_identity: ProcessIdentity | None = None
    try:
        inventory = bridge.call("list")
        if not isinstance(inventory, dict) or not inventory.get("ok"):
            raise AcceptanceFailure(
                "the bridge is unusable: "
                f"{inventory.get('error') if isinstance(inventory, dict) else 'invalid reply'} "
                f"{str(inventory.get('detail') if isinstance(inventory, dict) else '')[:200]}",
                2,
            )
        before_windows = _windows(inventory, label="initial inventory", code=2)
        before = {window["id"] for window in before_windows}
        print(f"PASS inventory before launch: {len(before)} window(s)")

        try:
            before_pids = frozenset(processes.snapshot_pids())
        except ProcessSafetyError as error:
            raise AcceptanceFailure(f"process baseline is unusable: {error}", 2) from error

        launch = bridge.call("launch", {"desktopId": args.desktop_id})
        if not launch.get("ok"):
            raise AcceptanceFailure(
                f"launch was refused: {launch.get('error')} {str(launch.get('detail'))[:200]}"
            )
        token = launch.get("launchToken")
        if not isinstance(token, str) or not token:
            raise AcceptanceFailure("launch returned no launch token")
        print(f"PASS launch accepted for {args.desktop_id}")

        confirm = bridge.call("confirm", {"launchToken": token, "timeoutMs": 5000})
        if not confirm.get("ok"):
            raise AcceptanceFailure(
                f"launch could not be confirmed: {confirm.get('error')} "
                f"{str(confirm.get('detail'))[:200]}"
            )
        if confirm.get("appeared") is not True:
            raise AcceptanceFailure("launch confirmation reported that no matching window appeared")
        confirmed_ids = confirm.get("windowIds")
        if not isinstance(confirmed_ids, list) or any(
            not isinstance(window_id, str) or not window_id for window_id in confirmed_ids
        ):
            raise AcceptanceFailure("launch confirmation returned invalid window IDs")
        if not confirmed_ids:
            raise AcceptanceFailure("launch confirmation returned no matching window IDs")
        if len(confirmed_ids) != 1 or len(set(confirmed_ids)) != 1:
            raise AcceptanceFailure(
                f"launch confirmation was ambiguous ({len(confirmed_ids)} matching window IDs)"
            )
        confirmed_id = confirmed_ids[0]
        if confirmed_id in before:
            raise AcceptanceFailure("launch confirmation named a window that existed before launch")
        print(f"PASS confirmation: matching window {confirmed_id} appeared")

        for _ in range(10):
            inventory = bridge.call("list")
            if not isinstance(inventory, dict) or not inventory.get("ok"):
                raise AcceptanceFailure(
                    "fresh inventory failed after launch confirmation: "
                    f"{inventory.get('error') if isinstance(inventory, dict) else 'invalid reply'} "
                    f"{str(inventory.get('detail') if isinstance(inventory, dict) else '')[:200]}"
                )
            fresh = _windows(inventory, label="fresh inventory", code=1)
            confirmed_records = [window for window in fresh if window["id"] == confirmed_id]
            if confirmed_records:
                if len(confirmed_records) != 1:
                    raise AcceptanceFailure("confirmed window ID is ambiguous in fresh inventory")
                candidate = confirmed_records[0]
                if candidate["id"] in before or candidate.get("appId") != args.desktop_id:
                    raise AcceptanceFailure(
                        "confirmed window does not match the requested desktop ID in fresh inventory"
                    )
                target = dict(candidate)
                break
            time.sleep(1)
        if target is None:
            raise AcceptanceFailure("confirmed matching window did not appear in fresh inventory")

        pid = target.get("pid")
        if isinstance(pid, bool) or not isinstance(pid, int) or pid <= 1:
            raise AcceptanceFailure("confirmed window has no valid process ID")
        try:
            process_identity = processes.identify(pid)
        except ProcessSafetyError as error:
            raise AcceptanceFailure(f"confirmed window process identity is unsafe: {error}") from error
        if process_identity.pid != pid:
            raise AcceptanceFailure("confirmed window process identity does not match its PID")
        print(f"PASS new window: {target['id']} | {target.get('appId')} | {target.get('title')}")

        first: dict = {}
        for _ in range(5):
            first = bridge.call("capture", {"windowId": target["id"]})
            if first.get("ok"):
                break
            time.sleep(0.4)
        if not first.get("ok"):
            state = bridge.call("list")
            print("  desktop state: locked=", state.get("locked"),
                  "blockedReason=", state.get("blockedReason"),
                  "focused=", state.get("focusedWindowId"), file=sys.stderr)
            state_windows = state.get("windows") if isinstance(state, dict) else None
            current = next((window for window in (state_windows or [])
                            if isinstance(window, dict) and window.get("id") == target["id"]), None)
            print("  target record:", {key: current.get(key) for key in ("protected", "minimized", "fullscreen")}
                  if current else "not in inventory", file=sys.stderr)
            raise AcceptanceFailure(
                f"capture before typing failed: {first.get('error')} {str(first.get('detail'))[:160]}"
            )
        observation = first.get("observationId")
        print(f"PASS captured before typing: {first.get('width')}x{first.get('height')},"
              f" sha256 {str(first.get('sha256'))[:16]}")

        typed = bridge.call("input", {"observationId": observation, "action": "type_text",
                                      "text": args.text})
        if not typed.get("ok"):
            detail = str(typed.get("detail"))
            if args.tolerate_missing_seat and "INPUT_FAILED" in detail:
                raise AcceptanceFailure(
                    "INCOMPLETE typing refused with INPUT_FAILED: this Shell has no seat to"
                    " drive, so the visible-change half of this workflow is unproven",
                    3,
                )
            raise AcceptanceFailure(
                f"typing was refused: {typed.get('error')} {detail[:200]}"
            )
        print(f"PASS typed {args.text!r} into the window")

        time.sleep(1)
        second = bridge.call("capture", {"windowId": target["id"]})
        if not second.get("ok"):
            raise AcceptanceFailure(
                f"capture after typing failed: {second.get('error')} {str(second.get('detail'))[:200]}"
            )
        changed = first.get("sha256") != second.get("sha256")
        print(("PASS" if changed else "FAIL"),
              f"visible change after typing: {changed}"
              f" (sha256 {str(second.get('sha256'))[:16]})")
        if not changed:
            raise AcceptanceFailure("visible content did not change after typing")
        return WorkflowOutcome(0, before_pids, target, process_identity)
    except AcceptanceFailure as error:
        stream = sys.stdout if error.code == 3 else sys.stderr
        print(f"{'INCOMPLETE' if error.code == 3 else 'FAIL'} {error}", file=stream)
        return WorkflowOutcome(error.code, before_pids, target, process_identity)
    except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError) as error:
        print(f"FAIL bridge workflow stopped: {error}", file=sys.stderr)
        return WorkflowOutcome(1, before_pids, target, process_identity)


def _cleanup_target(
    bridge: Bridge,
    processes: ProcessBoundary,
    target: dict,
    expected: ProcessIdentity,
    before_pids: frozenset[int],
) -> bool:
    """Signal only a newly observed process still owning the exact confirmed window."""
    pid = target["pid"]
    if pid in before_pids:
        print(f"REFUSED cleanup: process {pid} existed before launch; preserving it", file=sys.stderr)
        return False
    try:
        inventory = bridge.call("list")
        if not isinstance(inventory, dict) or not inventory.get("ok"):
            raise AcceptanceFailure("fresh desktop inventory is unavailable")
        current_windows = _windows(inventory, label="cleanup inventory", code=1)
        matches = [window for window in current_windows if window["id"] == target["id"]]
        if len(matches) != 1:
            raise AcceptanceFailure("confirmed window is no longer uniquely present")
        current = matches[0]
        if current.get("appId") != target.get("appId"):
            raise AcceptanceFailure("confirmed window application identity changed")
        if current.get("pid") != pid:
            raise AcceptanceFailure("confirmed window process identity changed")
        if processes.identify(pid) != expected:
            raise AcceptanceFailure("process identity changed after the confirmed window was selected")
        processes.terminate_if_same(pid, expected)
    except (
        AcceptanceFailure, ProcessSafetyError, OSError, ValueError, TypeError, AttributeError,
        subprocess.SubprocessError,
    ) as error:
        print(f"REFUSED cleanup: {error}; no process was signaled", file=sys.stderr)
        return False
    print(f"PASS sent SIGTERM through a verified process handle for {pid}")
    return True


def main(
    argv: Sequence[str] | None = None,
    *,
    bridge_factory: Callable[[], Bridge] | None = None,
    process_boundary: ProcessBoundary | None = None,
) -> int:
    """Run the explicitly approved workflow with injectable bridge/process boundaries."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desktop-id", default="org.gnome.Calculator.desktop")
    parser.add_argument("--text", default="1+1=")
    parser.add_argument("--yes", action="store_true",
                        help="required: this launches an application and types into it")
    parser.add_argument("--tolerate-missing-seat", action="store_true",
                        help="a headless Shell cannot create virtual devices: report a refused "
                             "keystroke as a note instead of a failure")
    args = parser.parse_args(argv)
    if not args.yes:
        print("Refused: this workflow launches an application and sends keystrokes.", file=sys.stderr)
        print("Re-run with --yes when that is intended and approved.", file=sys.stderr)
        return 2

    bridge = (bridge_factory or Bridge)()
    processes = process_boundary or ProcessBoundary()
    outcome = WorkflowOutcome(1, frozenset())
    cleanup_failed = False
    try:
        outcome = _run_steps(args, bridge, processes)
    finally:
        try:
            release = bridge.call("release")
            if not isinstance(release, dict):
                cleanup_failed = True
                print("WARNING input release returned an invalid bridge reply", file=sys.stderr)
            elif not release.get("ok"):
                cleanup_failed = True
                print(f"WARNING input release was refused: {release.get('error')} {release.get('detail')}",
                      file=sys.stderr)
        except (OSError, ValueError, TypeError, AttributeError, RuntimeError, subprocess.SubprocessError) as error:
            cleanup_failed = True
            print(f"WARNING input release could not be confirmed: {error}", file=sys.stderr)

        if outcome.target is not None and outcome.process_identity is not None:
            if not _cleanup_target(
                bridge, processes, outcome.target, outcome.process_identity, outcome.before_pids,
            ):
                cleanup_failed = True
        try:
            bridge.close()
        except (OSError, subprocess.SubprocessError, ValueError, RuntimeError) as error:
            cleanup_failed = True
            print(f"WARNING bridge client close was incomplete: {error}", file=sys.stderr)
        if cleanup_failed and outcome.code == 0:
            outcome = WorkflowOutcome(1, outcome.before_pids, outcome.target, outcome.process_identity)
    return outcome.code


if __name__ == "__main__":
    raise SystemExit(main())
