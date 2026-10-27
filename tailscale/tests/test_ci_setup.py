"""Cover fresh-runner scratch preparation with synthetic isolated paths."""

from __future__ import annotations

import importlib.util
import os
import stat
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).absolute().parents[1]
SPEC = importlib.util.spec_from_file_location("prepare_test_scratch", ROOT / "scripts/prepare_test_scratch.py")
assert SPEC is not None and SPEC.loader is not None
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)


class CiSetupTests(unittest.TestCase):
    """Ensure CI creates its missing prerequisite rather than skipping checks."""

    def setUp(self) -> None:
        """Use the harness scratch root when present, as in the other tests."""
        self.temporary = tempfile.TemporaryDirectory(dir="/tmp/opencode")
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.path = self.parent / "new-runner-scratch"

    def test_missing_directory_is_created_private(self) -> None:
        """Reproduce the missing scratch root observed in the first hosted run."""
        self.assertFalse(self.path.exists())
        PREPARE.prepare_scratch(self.path)
        self.assertTrue(self.path.is_dir())
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o700)
        self.assertEqual(self.path.stat().st_uid, os.getuid())

    def test_existing_harness_directory_is_preserved(self) -> None:
        """Do not chmod or discard a pre-existing approved harness scratch root."""
        self.path.mkdir(mode=0o775)
        self.path.chmod(0o775)
        marker = self.path / "synthetic-marker"
        marker.write_text("preserve", encoding="utf-8")
        PREPARE.prepare_scratch(self.path)
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o775)
        self.assertEqual(marker.read_text(), "preserve")

    def test_symlink_and_world_writable_targets_are_refused(self) -> None:
        """Refuse unsafe existing paths instead of silently repairing them."""
        target = self.parent / "target"
        target.mkdir()
        self.path.symlink_to(target, target_is_directory=True)
        with self.assertRaises(PREPARE.ScratchError):
            PREPARE.prepare_scratch(self.path)
        self.assertTrue(self.path.is_symlink())
        unsafe = self.parent / "unsafe"
        unsafe.mkdir()
        unsafe.chmod(0o777)
        with self.assertRaises(PREPARE.ScratchError):
            PREPARE.prepare_scratch(unsafe)
        self.assertEqual(stat.S_IMODE(unsafe.stat().st_mode), 0o777)

    def test_symlinked_ancestor_is_refused(self) -> None:
        """Do not create a scratch directory through a redirected ancestor."""
        target = self.parent / "actual"
        target.mkdir()
        alias = self.parent / "alias"
        alias.symlink_to(target, target_is_directory=True)
        with self.assertRaises(PREPARE.ScratchError):
            PREPARE.prepare_scratch(alias / "scratch")
        self.assertFalse((target / "scratch").exists())

    def test_ci_prepares_scratch_before_running_tests(self) -> None:
        """Assert the actual workflow invokes setup before its first test suite."""
        workflow = (ROOT / ".github/workflows/docker.yml").read_text()
        setup = workflow.index("python3 scripts/prepare_test_scratch.py")
        tests = workflow.index("python3 -m unittest discover")
        self.assertLess(setup, tests)
        self.assertIn("/tmp/opencode", str(PREPARE.SCRATCH_ROOT))


if __name__ == "__main__":
    unittest.main()
