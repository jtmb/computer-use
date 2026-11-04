"""Exercise the private TUI runner's output bounds and process cleanup."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "onboarding_tui_probe", Path(__file__).with_name("onboarding-tui-probe.py")
)
assert SPEC is not None and SPEC.loader is not None
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class TuiProbeTests(unittest.TestCase):
    """Use controlled executables, not an OpenCode service or model."""

    def setUp(self) -> None:
        """Create one test-owned scratch directory."""
        self.temporary = tempfile.TemporaryDirectory(
            prefix="tui-probe-", dir="/tmp/opencode"
        )
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def executable(self, code: str) -> Path:
        """Write a controlled process with normal SIGTERM cleanup."""
        target = self.root / "controlled-cli"
        target.write_text(
            "#!/usr/bin/python3\nimport signal, sys, time\nfrom pathlib import Path\n"
            "signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))\n" + code
        )
        target.chmod(0o700)
        return target

    def test_observer_success_and_owned_shutdown(self) -> None:
        """A real PTY process may publish observation and is then stopped."""
        observation = self.root / "observed.json"
        binary = self.executable(
            f"Path({str(observation)!r}).write_text('{{}}')\nwhile True: time.sleep(.05)\n"
        )
        result = probe.probe(
            str(binary),
            "ses_fixture",
            observation,
            self.root / "terminal.log",
            timeout=2,
        )
        self.assertTrue(result["observation_seen"])
        self.assertFalse(result["forced_kill"])
        self.assertEqual(result["exit_code"], 0)

    def test_no_observation_is_not_success(self) -> None:
        """An alive process alone cannot establish TUI activation."""
        binary = self.executable("while True: time.sleep(.05)\n")
        result = probe.probe(
            str(binary),
            "ses_fixture",
            self.root / "absent.json",
            self.root / "terminal.log",
            timeout=0.2,
        )
        self.assertFalse(result["observation_seen"])
        self.assertFalse(result["forced_kill"])

    def test_output_is_bounded_before_reading_an_extra_chunk(self) -> None:
        """Overflow refusal keeps the file at or below the original allowance."""
        binary = self.executable("while True: print('x' * 4096, flush=True)\n")
        output = self.root / "terminal.log"
        with self.assertRaisesRegex(RuntimeError, "byte allowance"):
            probe.probe(
                str(binary),
                "ses_fixture",
                self.root / "absent.json",
                output,
                timeout=2,
                byte_limit=128,
            )
        self.assertLessEqual(output.stat().st_size, 128)

    def test_error_exit_or_forced_cleanup_cannot_pass_after_observation(self) -> None:
        """An observer file does not make a crashed application healthy."""
        self.assertFalse(
            probe.successful(
                {"observation_seen": True, "forced_kill": False, "exit_code": 7}
            )
        )
        self.assertFalse(
            probe.successful(
                {"observation_seen": True, "forced_kill": True, "exit_code": 0}
            )
        )
        self.assertTrue(
            probe.successful(
                {"observation_seen": True, "forced_kill": False, "exit_code": 130}
            )
        )


if __name__ == "__main__":
    unittest.main()
