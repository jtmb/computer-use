"""Unit tests for launch-target selection and guarded workflow cleanup."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import os
from pathlib import Path
import signal
import sys
import unittest
from unittest import mock

SCRIPT = Path(__file__).with_name("desktop-workflow-acceptance.py")
SPEC = importlib.util.spec_from_file_location("desktop_workflow_acceptance", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
workflow = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = workflow
SPEC.loader.exec_module(workflow)

DESKTOP_ID = "org.example.Editor"
PID = 4242
IDENTITY = workflow.ProcessIdentity(PID, 12345, os.getuid(), os.getuid(), "/usr/bin/editor")
NO_RELEASE_OVERRIDE = object()


def window(window_id: str, app_id: str, pid: int = PID) -> dict[str, object]:
    """Build the minimal inventory record used by the acceptance helper."""
    return {"id": window_id, "appId": app_id, "pid": pid, "title": window_id}


class FakeBridge:
    """Provide ordered fake replies without creating the real subprocess bridge."""

    def __init__(
        self,
        replies: dict[str, list[dict[str, object]]],
        *,
        release_reply: object = NO_RELEASE_OVERRIDE,
        release_error: Exception | None = None,
        close_error: Exception | None = None,
    ) -> None:
        self.replies = {command: list(values) for command, values in replies.items()}
        self.release_reply = release_reply
        self.release_error = release_error
        self.close_error = close_error
        self.calls: list[tuple[str, dict[str, object]]] = []
        self.closed = False

    def call(self, command: str, request: dict | None = None) -> object:
        """Return the next scripted reply for one command."""
        self.calls.append((command, request or {}))
        if command == "release" and self.release_error is not None:
            raise self.release_error
        if command == "release" and self.release_reply is not NO_RELEASE_OVERRIDE:
            return self.release_reply
        queued = self.replies.get(command, [])
        if not queued:
            raise AssertionError(f"unexpected bridge command: {command}")
        return queued.pop(0)

    def close(self) -> None:
        """Record closure of the fake persistent bridge."""
        self.closed = True
        if self.close_error is not None:
            raise self.close_error


class FakeProcessBoundary:
    """Provide process snapshots and record any attempted target termination."""

    def __init__(self, before_pids: set[int] | None = None) -> None:
        self.before_pids = set(before_pids or set())
        self.snapshots = 0
        self.identified: list[int] = []
        self.terminated: list[tuple[int, workflow.ProcessIdentity]] = []

    def snapshot_pids(self) -> set[int]:
        """Return a deterministic pre-launch process set."""
        self.snapshots += 1
        return set(self.before_pids)

    def identify(self, pid: int) -> workflow.ProcessIdentity:
        """Return the fixture identity only for its selected process."""
        self.identified.append(pid)
        if pid != IDENTITY.pid:
            raise workflow.ProcessSafetyError("unexpected fixture PID")
        return IDENTITY

    def terminate_if_same(self, pid: int, expected: workflow.ProcessIdentity) -> None:
        """Record the one verified process signal requested by the helper."""
        if pid != IDENTITY.pid or expected != IDENTITY:
            raise workflow.ProcessSafetyError("fixture process identity mismatch")
        self.terminated.append((pid, expected))


def initial_inventory() -> dict[str, object]:
    """Return the pre-launch inventory."""
    return {"ok": True, "windows": [window("old", "org.example.Other", 5151)]}


def fresh_inventory(windows: list[dict[str, object]]) -> dict[str, object]:
    """Return a post-launch inventory with the supplied window order."""
    return {"ok": True, "windows": windows}


def standard_replies(
    fresh_windows: list[dict[str, object]],
    cleanup_windows: list[dict[str, object]] | None = None,
    *,
    confirmation: dict[str, object] | None = None,
    input_reply: dict[str, object] | None = None,
) -> dict[str, list[dict[str, object]]]:
    """Build the successful single-bridge workflow replies with optional failures."""
    return {
        "list": [
            initial_inventory(),
            fresh_inventory(fresh_windows),
            fresh_inventory(cleanup_windows if cleanup_windows is not None else fresh_windows),
        ],
        "launch": [{"ok": True, "launchToken": "one-use-token"}],
        "confirm": [confirmation or {"ok": True, "appeared": True, "windowIds": ["target"]}],
        "capture": [
            {"ok": True, "observationId": "observation-1", "width": 100, "height": 80, "sha256": "a" * 64},
            {"ok": True, "width": 100, "height": 80, "sha256": "b" * 64},
        ],
        "input": [input_reply or {"ok": True}],
        "release": [{"ok": True}],
    }


class DesktopWorkflowAcceptanceTests(unittest.TestCase):
    """Exercise all workflow decisions through fake bridge and process boundaries."""

    def run_helper(
        self,
        replies: dict[str, list[dict[str, object]]],
        *,
        before_pids: set[int] | None = None,
        arguments: list[str] | None = None,
        release_reply: object = NO_RELEASE_OVERRIDE,
        release_error: Exception | None = None,
        close_error: Exception | None = None,
    ) -> tuple[int, FakeBridge, FakeProcessBoundary, str, str, int]:
        """Run main with no real application, subprocess bridge, or process signal."""
        bridge = FakeBridge(
            replies,
            release_reply=release_reply,
            release_error=release_error,
            close_error=close_error,
        )
        processes = FakeProcessBoundary(before_pids)
        created: list[FakeBridge] = []
        stdout = io.StringIO()
        stderr = io.StringIO()

        def bridge_factory() -> FakeBridge:
            created.append(bridge)
            return bridge

        with (
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
            mock.patch.object(workflow.time, "sleep"),
        ):
            code = workflow.main(
                arguments if arguments is not None else ["--yes", "--desktop-id", DESKTOP_ID],
                bridge_factory=bridge_factory,
                process_boundary=processes,
            )
        self.assertEqual(len(created), 1, "one persistent bridge must serve the workflow")
        self.assertTrue(bridge.closed)
        return code, bridge, processes, stdout.getvalue(), stderr.getvalue(), len(created)

    def test_unrelated_window_first_is_ignored_for_confirmed_target(self) -> None:
        """Capture, type into, and clean only the exact confirmed matching window."""
        unrelated = window("unrelated", "org.example.Other", 5151)
        target = window("target", DESKTOP_ID)
        replies = standard_replies([unrelated, target])

        code, bridge, processes, stdout, stderr, _ = self.run_helper(replies)

        self.assertEqual(code, 0, stderr)
        self.assertEqual([request.get("windowId") for command, request in bridge.calls if command == "capture"],
                         ["target", "target"])
        self.assertEqual(sum(command == "input" for command, _ in bridge.calls), 1)
        self.assertEqual(processes.terminated, [(PID, IDENTITY)])
        self.assertIn("PASS sent SIGTERM through a verified process handle", stdout)
        self.assertNotIn("unrelated", stdout)

    def test_confirmation_without_a_matching_window_fails_without_cleanup(self) -> None:
        """Do not infer a target from any fresh window when confirmation is empty."""
        replies = standard_replies(
            [window("unrelated", "org.example.Other", 5151)],
            confirmation={"ok": True, "appeared": False, "windowIds": []},
        )

        code, bridge, processes, _stdout, stderr, _ = self.run_helper(replies)

        self.assertEqual(code, 1)
        self.assertIn("no matching window appeared", stderr)
        self.assertEqual([command for command, _ in bridge.calls], ["list", "launch", "confirm", "release"])
        self.assertEqual(processes.terminated, [])

    def test_ambiguous_confirmation_is_refused_before_target_selection(self) -> None:
        """Refuse multiple launch-confirmed IDs instead of selecting one arbitrarily."""
        replies = standard_replies(
            [],
            confirmation={"ok": True, "appeared": True, "windowIds": ["target", "target-2"]},
        )

        code, bridge, processes, _stdout, stderr, _ = self.run_helper(replies)

        self.assertEqual(code, 1)
        self.assertIn("ambiguous (2 matching window IDs)", stderr)
        self.assertEqual([command for command, _ in bridge.calls], ["list", "launch", "confirm", "release"])
        self.assertEqual(processes.terminated, [])

    def test_confirmed_id_with_mismatched_app_id_is_refused(self) -> None:
        """A confirmed ID is not enough if fresh inventory names another app."""
        replies = standard_replies([window("target", "org.example.Other", PID)])

        code, bridge, processes, _stdout, stderr, _ = self.run_helper(replies)

        self.assertEqual(code, 1)
        self.assertIn("does not match the requested desktop ID", stderr)
        self.assertFalse(any(command == "capture" for command, _ in bridge.calls))
        self.assertEqual(processes.terminated, [])

    def test_existing_target_process_is_preserved_during_cleanup(self) -> None:
        """Never terminate a PID that was present before the requested launch."""
        target = window("target", DESKTOP_ID)
        replies = standard_replies([target])

        code, _bridge, processes, _stdout, stderr, _ = self.run_helper(replies, before_pids={PID})

        self.assertEqual(code, 1)
        self.assertIn("existed before launch; preserving it", stderr)
        self.assertEqual(processes.terminated, [])

    def test_cleanup_refuses_when_target_process_changed(self) -> None:
        """A changed fresh PID cannot be substituted for the selected process."""
        target = window("target", DESKTOP_ID)
        replies = standard_replies([target], cleanup_windows=[window("target", DESKTOP_ID, 9090)])

        code, _bridge, processes, _stdout, stderr, _ = self.run_helper(replies)

        self.assertEqual(code, 1)
        self.assertIn("confirmed window process identity changed", stderr)
        self.assertEqual(processes.terminated, [])

    def test_workflow_failure_cleans_verified_target_without_retrying_input(self) -> None:
        """Input refusal stays a single attempt while verified failure cleanup runs."""
        target = window("target", DESKTOP_ID)
        replies = standard_replies(
            [target],
            input_reply={"ok": False, "error": "bridge-rejected", "detail": "INPUT_FAILED"},
        )
        release_refusal = {"ok": False, "error": "release-refused", "detail": "fixture refusal"}

        code, bridge, processes, stdout, stderr, _ = self.run_helper(
            replies,
            arguments=["--yes", "--desktop-id", DESKTOP_ID, "--tolerate-missing-seat"],
            release_reply=release_refusal,
        )

        self.assertEqual(code, 3)
        self.assertIn("visible-change half of this workflow is unproven", stdout)
        self.assertEqual(sum(command == "input" for command, _ in bridge.calls), 1)
        self.assertEqual(processes.terminated, [(PID, IDENTITY)])
        self.assertIn("PASS sent SIGTERM", stdout)
        self.assertIn("WARNING input release was refused: release-refused fixture refusal", stderr)

    def test_release_refusal_prevents_success_exit(self) -> None:
        """A visible change is not full success when input release is refused."""
        target = window("target", DESKTOP_ID)
        replies = standard_replies([target])
        refusal = {"ok": False, "error": "release-refused", "detail": "fixture refusal"}

        code, _bridge, processes, _stdout, stderr, _ = self.run_helper(replies, release_reply=refusal)

        self.assertEqual(code, 1)
        self.assertIn("WARNING input release was refused", stderr)
        self.assertEqual(processes.terminated, [(PID, IDENTITY)])

    def test_malformed_release_reply_prevents_success_exit(self) -> None:
        """A non-object release reply is reported and cannot leave a success status."""
        target = window("target", DESKTOP_ID)
        replies = standard_replies([target])

        code, _bridge, processes, _stdout, stderr, _ = self.run_helper(replies, release_reply=["malformed"])

        self.assertEqual(code, 1)
        self.assertIn("WARNING input release returned an invalid bridge reply", stderr)
        self.assertEqual(processes.terminated, [(PID, IDENTITY)])

    def test_raised_release_prevents_success_exit(self) -> None:
        """An exception from the release boundary is surfaced as incomplete cleanup."""
        target = window("target", DESKTOP_ID)
        replies = standard_replies([target])

        code, _bridge, processes, _stdout, stderr, _ = self.run_helper(
            replies,
            release_error=RuntimeError("fixture release exception"),
        )

        self.assertEqual(code, 1)
        self.assertIn("WARNING input release could not be confirmed: fixture release exception", stderr)
        self.assertEqual(processes.terminated, [(PID, IDENTITY)])

    def test_bridge_close_failure_prevents_success_exit(self) -> None:
        """A bridge client that fails to close cannot leave a success status."""
        target = window("target", DESKTOP_ID)
        replies = standard_replies([target])

        code, bridge, processes, _stdout, stderr, _ = self.run_helper(
            replies,
            close_error=OSError("fixture close exception"),
        )

        self.assertEqual(code, 1)
        self.assertIn("WARNING bridge client close was incomplete: fixture close exception", stderr)
        self.assertTrue(bridge.closed)
        self.assertEqual(processes.terminated, [(PID, IDENTITY)])

    def test_yes_remains_required_before_any_boundary_is_opened(self) -> None:
        """Missing explicit approval neither creates the bridge nor snapshots processes."""
        processes = FakeProcessBoundary()
        created: list[bool] = []
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = workflow.main([], bridge_factory=lambda: created.append(True), process_boundary=processes)

        self.assertEqual(code, 2)
        self.assertEqual(created, [])
        self.assertEqual(processes.snapshots, 0)
        self.assertEqual(processes.identified, [])
        self.assertIn("Refused", stderr.getvalue())


class ProcessBoundaryTests(unittest.TestCase):
    """Verify pidfd signaling rechecks identity without sending real process signals."""

    def test_pidfd_signal_requires_identity_to_match_after_open(self) -> None:
        """A stable opened process handle receives exactly one SIGTERM."""
        boundary = workflow.ProcessBoundary()
        with (
            mock.patch.object(boundary, "identify", return_value=IDENTITY),
            mock.patch.object(os, "pidfd_open", return_value=17, create=True) as pidfd_open,
            mock.patch.object(signal, "pidfd_send_signal", create=True) as send_signal,
            mock.patch.object(os, "close") as close_fd,
        ):
            boundary.terminate_if_same(PID, IDENTITY)

        pidfd_open.assert_called_once_with(PID, 0)
        send_signal.assert_called_once_with(17, signal.SIGTERM, None, 0)
        close_fd.assert_called_once_with(17)

    def test_pidfd_does_not_signal_if_identity_changed(self) -> None:
        """A PID reused between selection and cleanup is refused without signaling."""
        boundary = workflow.ProcessBoundary()
        replacement = workflow.ProcessIdentity(PID, 98765, os.getuid(), os.getuid(), "/usr/bin/other")
        with (
            mock.patch.object(boundary, "identify", return_value=replacement),
            mock.patch.object(os, "pidfd_open", return_value=17, create=True),
            mock.patch.object(signal, "pidfd_send_signal", create=True) as send_signal,
            mock.patch.object(os, "close") as close_fd,
        ):
            with self.assertRaises(workflow.ProcessSafetyError):
                boundary.terminate_if_same(PID, IDENTITY)

        send_signal.assert_not_called()
        close_fd.assert_called_once_with(17)


if __name__ == "__main__":
    unittest.main()
