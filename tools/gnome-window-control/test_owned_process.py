"""Exercise real disposable Linux children, never desktop processes or saved PIDs."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

HELPER = Path(__file__).with_name("owned-process.py")
SPEC = importlib.util.spec_from_file_location("owned_process", HELPER)
assert SPEC is not None and SPEC.loader is not None
owned = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(owned)


class OwnedProcessTests(unittest.TestCase):
    """Bind signaling to retained kernel handles instead of mutable receipt PIDs."""

    def setUp(self) -> None:
        """Create a fresh private fixture directory."""
        self.temporary = tempfile.TemporaryDirectory(
            prefix="owned-process-test-", dir="/tmp/opencode"
        )
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def wait_file(self, target: Path) -> None:
        """Wait only for this fixture's condition under a bounded deadline."""
        deadline = time.monotonic() + 5
        while not target.exists():
            if time.monotonic() >= deadline:
                self.fail("owned fixture did not publish its readiness file")
            time.sleep(0.01)

    def launch(self, code: str, timeout: str = "10") -> subprocess.Popen[bytes]:
        """Start one test-owned supervisor process and retain its child handle."""
        process = subprocess.Popen(
            [
                sys.executable,
                str(HELPER),
                "run",
                "--job-dir",
                str(self.directory),
                "--timeout-seconds",
                timeout,
                "--",
                sys.executable,
                "-c",
                code,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        self.addCleanup(self.cleanup_supervisor, process)
        return process

    def cleanup_supervisor(self, process: subprocess.Popen[bytes]) -> None:
        """On assertion failure, ask only this direct test child to stop its child."""
        if process.poll() is None:
            process.terminate()
        process.communicate(timeout=5)

    def finish(
        self, process: subprocess.Popen[bytes], expected: int
    ) -> dict[str, object]:
        """Reap a test-owned supervisor and inspect its bounded final receipt."""
        output, errors = process.communicate(timeout=8)
        self.assertEqual(process.returncode, expected, errors.decode())
        self.assertEqual(output, b"")
        value: object = json.loads((self.directory / "receipt.json").read_text())
        if not isinstance(value, dict):
            raise TypeError("receipt must be an object")
        return value

    def test_successful_owned_child_reaps_and_preserves_receipt(self) -> None:
        """A real successful child has explicit final process identity/outcome."""
        result = self.finish(self.launch("pass"), 0)
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["childExitCode"], 0)
        self.assertTrue(result["reaped"])
        self.assertTrue(result["pidfdHeld"])

    def test_stop_ignores_a_forged_receipt_pid_and_preserves_unrelated_child(
        self,
    ) -> None:
        """Receipt tampering cannot redirect a retained pidfd to another process."""
        unrelated = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(30)"]
        )
        try:
            process = self.launch("import time; time.sleep(30)")
            self.wait_file(self.directory / "receipt.json")
            record = json.loads((self.directory / "receipt.json").read_text())
            actual_pid = record["processId"]
            record["processId"] = unrelated.pid
            (self.directory / "receipt.json").write_text(json.dumps(record))
            (self.directory / "stop.request").mkdir()
            result = self.finish(process, 0)
            self.assertEqual(result["processId"], actual_pid)
            self.assertTrue(result["reaped"])
            self.assertIsNone(unrelated.poll())
        finally:
            unrelated.terminate()
            unrelated.wait(timeout=5)

    def test_deadline_is_a_failure_not_a_successful_cleanup_result(self) -> None:
        """A timed-out child is reaped through its pidfd but exits nonzero overall."""
        result = self.finish(self.launch("import time; time.sleep(30)", "0.1"), 124)
        self.assertEqual(result["reason"], "deadline")
        self.assertTrue(result["reaped"])

    def test_supervisor_interruption_is_not_reported_as_an_authorized_stop(
        self,
    ) -> None:
        """A real SIGTERM stops the child safely but cannot produce a passing run."""
        process = self.launch("import time; time.sleep(30)")
        self.wait_file(self.directory / "receipt.json")
        process.terminate()
        result = self.finish(process, 143)
        self.assertEqual(result["reason"], "interrupted")
        self.assertTrue(result["reaped"])

    def test_ignored_sigterm_escalates_only_the_owned_child(self) -> None:
        """A genuinely uncooperative new child requires bounded pidfd SIGKILL."""
        ready = self.directory / "child-ready"
        code = f"import signal,time; from pathlib import Path; signal.signal(signal.SIGTERM,signal.SIG_IGN); Path({str(ready)!r}).write_text('ready'); time.sleep(30)"
        process = self.launch(code)
        self.wait_file(ready)
        (self.directory / "stop.request").mkdir()
        result = self.finish(process, 0)
        self.assertEqual(result["childExitCode"], -9)
        self.assertEqual(result["reason"], "stop-requested")

    def test_cancel_before_launch_never_executes_the_target(self) -> None:
        """Cleanup racing supervisor startup cannot accidentally launch an app."""
        marker = self.directory / "must-not-exist"
        (self.directory / "stop.request").mkdir()
        result = self.finish(
            self.launch(f"from pathlib import Path; Path({str(marker)!r}).touch()"), 0
        )
        self.assertEqual(result["status"], "cancelled")
        self.assertFalse(marker.exists())

    def test_pidfd_acquisition_failure_never_executes_or_uses_a_pid_fallback(
        self,
    ) -> None:
        """The exec gate stays closed when obtaining the kernel handle fails."""
        marker = self.directory / "must-not-exist"
        with (
            patch.object(
                owned.os, "pidfd_open", side_effect=OSError("synthetic unavailable")
            ),
            self.assertRaises(owned.OwnershipError),
        ):
            owned.OwnedChild(
                [
                    sys.executable,
                    "-c",
                    f"from pathlib import Path; Path({str(marker)!r}).touch()",
                ]
            )
        self.assertFalse(marker.exists())

    def test_public_or_linked_job_directory_and_reused_receipt_refuse(self) -> None:
        """A saved receipt is not a reusable process capability."""
        self.directory.chmod(0o755)
        with self.assertRaises(owned.OwnershipError):
            owned.job_directory(str(self.directory))
        self.directory.chmod(0o700)
        linked = self.directory / "linked"
        linked.symlink_to(self.directory, target_is_directory=True)
        with self.assertRaises(owned.OwnershipError):
            owned.job_directory(str(linked))
        (self.directory / "receipt.json").write_text("{}")
        with self.assertRaises(owned.OwnershipError):
            owned.run_owned(self.directory, [sys.executable, "-c", "pass"], 1)

    def test_cli_cannot_launch_or_signal_a_caller_supplied_pid(self) -> None:
        """The CLI rejects a raw PID as run authority before any child exists."""
        result = subprocess.run(
            [
                sys.executable,
                str(HELPER),
                "run",
                "--job-dir",
                str(self.directory),
                "--pid",
                str(os.getpid()),
                "--",
                sys.executable,
                "-c",
                "pass",
            ],
            capture_output=True,
            timeout=5,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"never accepts a caller-supplied PID", result.stderr)
        self.assertFalse((self.directory / "receipt.json").exists())


if __name__ == "__main__":
    unittest.main()
