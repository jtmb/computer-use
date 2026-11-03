#!/usr/bin/env python3
"""Behavioral tests for the private one-use secret staging flow."""

from __future__ import annotations

import contextlib
import concurrent.futures
import importlib.util
import io
import json
import os
import signal
import stat
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True


SCRIPT = Path(__file__).with_name("private-secret-stage.py")
SPEC = Path(__file__).with_name("browser-auth-dialog.py")
MODULE_SPEC = importlib.util.spec_from_file_location("private_secret_stage", SCRIPT)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
stage = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(stage)


MARKER = b"marker-secret"
ORIGINAL_TEMPFILE_CACHE = tempfile.tempdir


class PrivateSecretStageTests(unittest.TestCase):
    """Exercise safe staging with synthetic fd-3 dialog helpers."""

    def setUp(self) -> None:
        """Create isolated target and temporary-spec directories."""
        self.temporary_directory = tempfile.TemporaryDirectory(dir="/tmp/opencode")
        self.root = Path(self.temporary_directory.name)
        self.dialog_directory = self.root / "dialog"
        self.dialog_directory.mkdir(mode=0o700)
        self.original_tmpdir = os.environ.get("TMPDIR")
        os.environ["TMPDIR"] = str(self.dialog_directory)
        tempfile.tempdir = None

    def tearDown(self) -> None:
        """Restore process environment and remove this test's temporary data."""
        if self.original_tmpdir is None:
            os.environ.pop("TMPDIR", None)
        else:
            os.environ["TMPDIR"] = self.original_tmpdir
        tempfile.tempdir = ORIGINAL_TEMPFILE_CACHE
        self.temporary_directory.cleanup()

    def write_helper(self, source: str) -> Path:
        """Write a synthetic child that uses only the inherited fd-3 protocol."""
        helper = self.root / "fake-dialog.py"
        helper.write_text(source, encoding="utf-8")
        helper.chmod(0o600)
        return helper

    def run_stage(self, target: Path, *options: str, helper: Path | None = None) -> tuple[int, str, str]:
        """Invoke the CLI with an injected helper while capturing safe output."""
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch.object(stage, "DIALOG_HELPER", helper or self.write_helper("")):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                result = stage.main(["--target", str(target), *options])
        return result, stdout.getvalue(), stderr.getvalue()

    def test_fd_three_success_writes_private_file_without_echo(self) -> None:
        """Stage exact fake bytes with private mode and redacted status output."""
        helper = self.write_helper(
            "import os, stat, struct, sys\n"
            "spec = os.stat(sys.argv[1], follow_symlinks=False)\n"
            "assert stat.S_ISREG(spec.st_mode) and stat.S_IMODE(spec.st_mode) == 0o600\n"
            "assert stat.S_IMODE(os.stat(os.path.dirname(sys.argv[1])).st_mode) == 0o700\n"
            "assert stat.S_ISFIFO(os.fstat(3).st_mode) and os.get_inheritable(3)\n"
            "unexpected = []\n"
            "for descriptor in range(4, 128):\n"
            "    try: os.fstat(descriptor)\n"
            "    except OSError: continue\n"
            "    unexpected.append(descriptor)\n"
            "assert not unexpected, f'unexpected inherited descriptors: {unexpected}'\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        target = self.root / "one-use-key"
        code, stdout, stderr = self.run_stage(target, helper=helper)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(target.read_bytes(), MARKER)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        lines = stdout.splitlines()
        status = json.loads(lines[0])
        self.assertEqual(status, {"status": "staged", "path": str(target), "bytes": len(MARKER)})
        self.assertIn("responsible for deleting", lines[1])
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_exact_4096_byte_utf8_frame_is_accepted(self) -> None:
        """Accept the inclusive byte cap while enforcing character bounds."""
        helper = self.write_helper(
            "import os, struct\n"
            "value = ('λ' * 2048).encode('utf-8')\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        target = self.root / "exact-byte-cap"
        code, stdout, stderr = self.run_stage(target, "--max-length", "2048", helper=helper)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(target.read_bytes(), "λ".encode("utf-8") * 2048)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(stdout.splitlines()[0])["bytes"], 4_096)
        self.assertNotIn(MARKER.decode(), stdout + stderr)

    def test_truncated_trailing_and_invalid_utf8_frames_are_refused(self) -> None:
        """Reject malformed frames without writing or echoing synthetic bytes."""
        frames = {
            "short-header": b"\x00\x00",
            "truncated-body": struct.pack(">I", 3) + b"ab",
            "trailing-byte": struct.pack(">I", 1) + b"a!",
            "invalid-utf8": struct.pack(">I", 1) + b"\xff",
            "over-cap-length": struct.pack(">I", stage.MAX_SECRET_BYTES + 1),
        }
        for name, payload in frames.items():
            with self.subTest(frame=name):
                helper = self.write_helper(
                    "import os\n"
                    f"payload = bytes.fromhex({payload.hex()!r})\n"
                    "os.write(3, payload)\n"
                    "os.close(3)\n"
                    "print('ok')\n"
                )
                target = self.root / name
                code, stdout, stderr = self.run_stage(target, helper=helper)
                self.assertEqual(code, 1)
                self.assertFalse(target.exists())
                self.assertNotIn(MARKER.decode(), stdout + stderr)
                self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_large_fd_three_writer_is_refused_without_deadlock(self) -> None:
        """Reject a maliciously large synthetic frame without hanging."""
        helper = self.write_helper(
            "import os\n"
            "chunk = b'x' * 8192\n"
            "for _ in range(128): os.write(3, chunk)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        target = self.root / "too-large-to-buffer"
        runner = (
            "import importlib.util, pathlib, sys\n"
            "spec = importlib.util.spec_from_file_location('stage', sys.argv[1])\n"
            "module = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(module)\n"
            "module.DIALOG_HELPER = pathlib.Path(sys.argv[2])\n"
            "raise SystemExit(0 if module.main(['--target', sys.argv[3]]) == 1 else 1)\n"
        )
        environment = os.environ.copy()
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        process = subprocess.Popen(
            [sys.executable, "-B", "-c", runner, str(SCRIPT), str(helper), str(target)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=environment,
            start_new_session=True,
        )
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
            self.fail(f"oversized helper hung: {stdout!r} {stderr!r}")
        self.assertEqual(process.returncode, 0, stderr.decode("utf-8", errors="replace"))
        self.assertFalse(target.exists())
        self.assertNotIn(MARKER, stdout + stderr)
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_launch_restores_existing_parent_fd_three_and_cloexec_flag(self) -> None:
        """Restore an unrelated parent's fd 3 after both inheritable modes."""
        helper = self.write_helper("print('cancelled')\nraise SystemExit(2)\n")
        runner = (
            "import fcntl, importlib.util, os, pathlib, sys\n"
            "spec = importlib.util.spec_from_file_location('stage', sys.argv[1])\n"
            "module = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(module)\n"
            "module.DIALOG_HELPER = pathlib.Path(sys.argv[2])\n"
            "for cloexec in (False, True):\n"
            "    read_fd, write_fd = os.pipe()\n"
            "    if read_fd != 3:\n"
            "        os.dup2(read_fd, 3, inheritable=not cloexec)\n"
            "        os.close(read_fd)\n"
            "    os.set_inheritable(3, not cloexec)\n"
            "    before = fcntl.fcntl(3, fcntl.F_GETFD)\n"
            "    code, status, payload, _stderr = module.launch_dialog('synthetic-spec')\n"
            "    after = fcntl.fcntl(3, fcntl.F_GETFD)\n"
            "    assert bool(before & fcntl.FD_CLOEXEC) == cloexec\n"
            "    assert bool(after & fcntl.FD_CLOEXEC) == cloexec\n"
            "    assert (code, status.strip(), payload) == (2, 'cancelled', b'')\n"
            "    os.write(write_fd, b'parent-fd')\n"
            "    assert os.read(3, 9) == b'parent-fd'\n"
            "    os.close(3)\n"
            "    os.close(write_fd)\n"
        )
        environment = os.environ.copy()
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        result = subprocess.run(
            [sys.executable, "-B", "-c", runner, str(SCRIPT), str(helper)],
            env=environment,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_helper_status_output_has_a_fixed_byte_budget(self) -> None:
        """Refuse excessive status output before retaining its whole stream."""
        helper = self.write_helper("import os\nos.write(1, b'ok' + b' ' * 1022)\n")
        with patch.object(stage, "DIALOG_HELPER", helper):
            self.assertEqual(stage.launch_dialog("synthetic-spec")[:2], (0, "ok" + " " * 1022))
        helper = self.write_helper("import os\nos.write(1, b'x' * (1024 * 1024))\n")
        with patch.object(stage, "DIALOG_HELPER", helper):
            with self.assertRaisesRegex(stage.StageError, "status.*byte budget"):
                stage.launch_dialog("synthetic-spec")

    def test_helper_stderr_is_discarded_before_capture(self) -> None:
        """Keep even internal return values free of untrusted diagnostic text."""
        helper = self.write_helper(
            "import os\nassert os.readlink('/proc/self/fd/2') == '/dev/null'\n"
            f"os.write(2, {MARKER!r} * 8192)\n"
            "print('cancelled')\nraise SystemExit(2)\n"
        )
        with patch.object(stage, "DIALOG_HELPER", helper):
            code, status, payload, stderr = stage.launch_dialog("synthetic-spec")
        self.assertEqual((code, status.strip(), payload), (2, "cancelled", b""))
        self.assertTrue(stderr == "", "raw helper stderr must not be acquired")

    def deadline_probe(self, *, descendant: bool, closed_pipes: bool = False) -> None:
        """Bound a real synthetic helper with an independent outer watchdog."""
        group_file = self.root / "owned-helper-group"
        helper = self.write_helper(
            "import os, signal, time\n"
            "from pathlib import Path\n"
            f"Path({str(group_file)!r}).write_text(str(os.getpgrp()))\n"
            "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
            + ("if os.fork():\n    print('ok', flush=True)\n    os._exit(0)\n" if descendant else "")
            + ("os.close(1)\nos.close(3)\n" if closed_pipes else "")
            + "time.sleep(30)\n"
        )
        target = self.root / "deadline-target"
        runner = (
            "import ctypes, importlib.util, pathlib, sys, time, os\n"
            "assert ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) == 0\n"
            "spec = importlib.util.spec_from_file_location('stage', sys.argv[1])\n"
            "module = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(module)\n"
            "module.DIALOG_HELPER = pathlib.Path(sys.argv[2])\n"
            "module.DIALOG_TIMEOUT_SECONDS = 0.2\n"
            "result = module.main(['--target', sys.argv[3]])\n"
            "assert result == 1\n"
            "until = time.monotonic() + 1\n"
            "while True:\n"
            "    try: pid, status = os.waitpid(-1, os.WNOHANG)\n"
            "    except ChildProcessError: break\n"
            "    if pid: continue\n"
            "    assert time.monotonic() < until, 'owned descendant survived cleanup'\n"
            "    time.sleep(0.01)\n"
        )
        environment = os.environ.copy()
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        process = subprocess.Popen(
            [sys.executable, "-B", "-c", runner, str(SCRIPT), str(helper), str(target)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment,
            start_new_session=True,
        )
        try:
            stdout, stderr = process.communicate(timeout=4)
        except subprocess.TimeoutExpired:
            if group_file.exists():
                group = int(group_file.read_text())
                self.assertGreater(group, 1)
                self.assertNotEqual(group, os.getpgrp())
                if group != process.pid:
                    try:
                        os.killpg(group, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            self.fail("production dialog acquisition ignored its deadline")
        self.assertEqual(process.returncode, 0, stderr.decode("utf-8", errors="replace"))
        self.assertIn(b"deadline", stderr)
        self.assertFalse(target.exists())
        self.assertNotIn(MARKER, stdout + stderr)
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_helper_deadline_kills_an_unresponsive_owned_process(self) -> None:
        """Terminate a fake helper even when it ignores graceful signals."""
        self.deadline_probe(descendant=False)

    def test_helper_deadline_covers_inherited_pipes_after_direct_child_exit(self) -> None:
        """Do not hang when an exited helper leaves a descendant holding fd 3."""
        self.deadline_probe(descendant=True)

    def test_helper_deadline_covers_exit_after_both_pipes_close(self) -> None:
        """Keep the deadline on the process wait after its streams reach EOF."""
        self.deadline_probe(descendant=False, closed_pipes=True)

    def test_existing_target_is_refused_before_dialog_without_overwrite(self) -> None:
        """Refuse an occupied destination before launching the dialog."""
        target = self.root / "existing"
        target.write_bytes(b"preserve")
        code, stdout, stderr = self.run_stage(target)
        self.assertEqual(code, 1)
        self.assertEqual(target.read_bytes(), b"preserve")
        self.assertEqual(stdout, "")
        self.assertIn("already exists", stderr)

    def test_explicit_overwrite_replaces_user_owned_regular_file(self) -> None:
        """Replace an existing user-owned file only after explicit opt-in."""
        helper = self.write_helper(
            "import os, struct\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        target = self.root / "existing"
        target.write_bytes(b"old")
        code, _stdout, stderr = self.run_stage(target, "--allow-overwrite", helper=helper)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(target.read_bytes(), MARKER)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_unchanged_target_is_replaced_after_the_dialog(self) -> None:
        """Keep explicit overwrite working when the sampled file is unchanged."""
        helper = self.write_helper(
            "import os, struct\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        target = self.root / "unchanged"
        target.write_bytes(b"old-content")
        before = target.stat()
        code, stdout, stderr = self.run_stage(target, "--allow-overwrite", helper=helper)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(stderr, "")
        self.assertEqual(target.read_bytes(), MARKER)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(stdout.splitlines()[0])["status"], "staged")
        self.assertNotEqual(
            (before.st_dev, before.st_ino),
            (target.stat().st_dev, target.stat().st_ino),
        )
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertEqual(list(self.root.glob(".secret-stage-*")), [])

    def test_allow_overwrite_initially_absent_creates_private_file(self) -> None:
        """Allow explicit overwrite consent to still create an absent target."""
        helper = self.write_helper(
            "import os, struct\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        target = self.root / "absent-with-consent"
        code, stdout, stderr = self.run_stage(target, "--allow-overwrite", helper=helper)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(stderr, "")
        self.assertEqual(target.read_bytes(), MARKER)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(stdout.splitlines()[0])["status"], "staged")
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertEqual(list(self.root.glob(".secret-stage-*")), [])
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_direct_overwrite_also_binds_the_sampled_target(self) -> None:
        """Do not leave an unchecked publication branch for a direct caller."""
        target = self.root / "direct-overwrite"
        target.write_bytes(b"before")
        directory_fd, name = stage.validate_target(str(target))
        sync = os.fsync
        changed = False

        def replace_on_sync(descriptor: int) -> None:
            nonlocal changed
            sync(descriptor)
            if not changed and stat.S_ISREG(os.fstat(descriptor).st_mode):
                changed = True
                replacement = self.root / "direct-replacement"
                replacement.write_bytes(b"concurrent")
                os.replace(replacement, target)

        try:
            with patch.object(stage.os, "fsync", side_effect=replace_on_sync):
                with self.assertRaises(stage.StageError):
                    stage.write_secret(directory_fd, name, MARKER, True)
        finally:
            os.close(directory_fd)
        self.assertTrue(changed)
        self.assertEqual(target.read_bytes(), b"concurrent")
        self.assertEqual(list(self.root.glob(".secret-stage-*")), [])

    def test_created_target_replaced_during_write_does_not_report_success(self) -> None:
        """Refuse stale status without unlinking a concurrent replacement."""
        target = self.root / "new-target-publication"
        sync = os.fsync
        changed = False

        def replace_on_sync(descriptor: int) -> None:
            nonlocal changed
            sync(descriptor)
            if not changed and os.readlink(f"/proc/self/fd/{descriptor}") == str(target):
                changed = True
                replacement = self.root / "new-target-replacement"
                replacement.write_bytes(b"concurrent")
                os.replace(replacement, target)

        with patch.object(stage, "launch_dialog", return_value=(
            0, "ok", struct.pack(">I", len(MARKER)) + MARKER, "",
        )), patch.object(stage.os, "fsync", side_effect=replace_on_sync):
            code, stdout, stderr = self.run_stage(target)
        self.assertTrue(changed)
        self.assertEqual(code, 1)
        self.assertEqual(target.read_bytes(), b"concurrent")
        self.assertEqual(stdout, "")
        self.assertNotIn(MARKER.decode(), stderr)

    def test_nonprogressing_private_write_refuses_and_cleans_its_owned_file(self) -> None:
        """A zero-byte write must not loop or be accepted as successful progress."""
        target = self.root / "nonprogress"
        directory_fd, name = stage.validate_target(str(target))
        write = os.write
        calls = 0

        def zero_then_write(descriptor: int, payload: bytes) -> int:
            nonlocal calls
            calls += 1
            return 0 if calls == 1 else write(descriptor, payload)

        try:
            with patch.object(stage.os, "write", side_effect=zero_then_write):
                with self.assertRaises(stage.StageError):
                    stage.write_secret(directory_fd, name, MARKER, False)
        finally:
            os.close(directory_fd)
        self.assertEqual(calls, 1)
        self.assertFalse(target.exists())

    def test_target_snapshot_detects_changes_without_reading_content(self) -> None:
        """Bind consent to sampled identity, mode, link count and timestamps."""
        target = self.root / "snapshot-control"
        target.write_bytes(b"stable")
        directory_fd, name = stage.validate_target(str(target))
        try:
            snapshot = stage.preflight_target(directory_fd, name, True)
            before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            self.assertTrue(snapshot.matches(before))
            snapshot.require_unchanged(directory_fd, name)
            target.write_bytes(b"edited-content")
            with self.assertRaisesRegex(stage.StageError, "changed"):
                snapshot.require_unchanged(directory_fd, name)
            snapshot = stage._sample_target(directory_fd, name)
            os.link(target, self.root / "snapshot-link")
            self.assertFalse(
                snapshot.matches(stage._sample_target(directory_fd, name).info)
            )
            snapshot = stage._sample_target(directory_fd, name)
            target.chmod(0o600)
            self.assertFalse(
                snapshot.matches(stage._sample_target(directory_fd, name).info)
            )
            absent = stage.TargetSnapshot(None)
            present = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            self.assertFalse(absent.matches(present))
            target.unlink()
            self.assertTrue(absent.matches(stage._sample_target(directory_fd, name).info))
        finally:
            os.close(directory_fd)

    def test_overwrite_preserves_target_changes_during_dialog(self) -> None:
        """Bind overwrite consent to the inspected file, not a later owned file."""
        for change in ("replace", "edit", "create", "remove"):
            with self.subTest(change=change):
                target = self.root / f"consent-{change}"
                if change != "create":
                    target.write_bytes(b"before-dialog")

                def collect(_spec_path: str) -> tuple[int, str, bytes, str]:
                    if change == "replace":
                        replacement = self.root / "replacement"
                        replacement.write_bytes(b"concurrent-change")
                        os.replace(replacement, target)
                    elif change in ("edit", "create"):
                        target.write_bytes(b"concurrent-change")
                    else:
                        target.unlink()
                    return 0, "ok", struct.pack(">I", len(MARKER)) + MARKER, ""

                with patch.object(stage, "launch_dialog", side_effect=collect):
                    code, stdout, stderr = self.run_stage(target, "--allow-overwrite")
                self.assertEqual(code, 1, "concurrent target changes must refuse")
                if change == "remove":
                    self.assertFalse(target.exists())
                else:
                    self.assertEqual(target.read_bytes(), b"concurrent-change")
                self.assertNotIn(MARKER.decode(), stdout + stderr)
                self.assertEqual(stdout, "")
                self.assertEqual(list(self.dialog_directory.iterdir()), [])
                self.assertEqual(list(self.root.glob(".secret-stage-*")), [])

    def test_overwrite_preserves_target_replaced_during_private_write(self) -> None:
        """Check the original target again after writing the temporary payload."""
        target = self.root / "publication-race"
        target.write_bytes(b"original")
        helper = self.write_helper(
            "import os, struct\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        sync = os.fsync
        raced = False

        def replace_on_sync(descriptor: int) -> None:
            nonlocal raced
            sync(descriptor)
            if not raced and stat.S_ISREG(os.fstat(descriptor).st_mode):
                descriptor_path = os.readlink(f"/proc/self/fd/{descriptor}")
                if Path(descriptor_path).name.startswith(".secret-stage-"):
                    raced = True
                    replacement = self.root / "publication-replacement"
                    replacement.write_bytes(b"concurrent-publication")
                    os.replace(replacement, target)

        with patch.object(stage.os, "fsync", side_effect=replace_on_sync):
            code, stdout, stderr = self.run_stage(target, "--allow-overwrite", helper=helper)
        self.assertTrue(raced, "the final publication race must be exercised")
        self.assertEqual(code, 1, "publication must refuse a replaced target")
        self.assertEqual(target.read_bytes(), b"concurrent-publication")
        self.assertEqual(stdout, "")
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertEqual(list(self.root.glob(".secret-stage-*")), [])

    def test_relative_target_is_refused(self) -> None:
        """Reject destinations that are not absolute filesystem paths."""
        code, _stdout, stderr = self.run_stage(Path("relative-key"))
        self.assertEqual(code, 1)
        self.assertIn("absolute path", stderr)

    def test_symlinked_parent_is_refused(self) -> None:
        """Reject any symlink in the destination parent path."""
        real_parent = self.root / "real"
        real_parent.mkdir()
        link_parent = self.root / "linked"
        link_parent.symlink_to(real_parent, target_is_directory=True)
        code, _stdout, _stderr = self.run_stage(link_parent / "key")
        self.assertEqual(code, 1)
        self.assertFalse((real_parent / "key").exists())

    def test_existing_target_symlink_is_refused_without_following_it(self) -> None:
        """Refuse a symlink at the final component and preserve its referent."""
        referent = self.root / "referent"
        referent.write_bytes(b"preserve")
        target = self.root / "linked-target"
        target.symlink_to(referent)
        code, stdout, stderr = self.run_stage(target)
        self.assertEqual(code, 1)
        self.assertEqual(referent.read_bytes(), b"preserve")
        self.assertTrue(target.is_symlink())
        self.assertEqual(stdout, "")
        self.assertNotIn(MARKER.decode(), stderr)

    def test_target_created_as_symlink_during_dialog_is_not_followed(self) -> None:
        """Keep a target race from redirecting the private payload to a referent."""
        referent = self.root / "raced-referent"
        referent.write_bytes(b"preserve")
        target = self.root / "raced-target"
        helper = self.write_helper(
            "import os, struct\n"
            f"os.symlink({str(referent)!r}, {str(target)!r})\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        code, stdout, stderr = self.run_stage(target, helper=helper)
        self.assertEqual(code, 1)
        self.assertTrue(target.is_symlink())
        self.assertEqual(referent.read_bytes(), b"preserve")
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_overwrite_target_changed_to_symlink_is_refused(self) -> None:
        """Recheck an explicitly overwriteable target after the helper returns."""
        referent = self.root / "overwrite-referent"
        referent.write_bytes(b"preserve")
        target = self.root / "overwrite-race"
        target.write_bytes(b"old")
        helper = self.write_helper(
            "import os, struct\n"
            f"os.unlink({str(target)!r})\n"
            f"os.symlink({str(referent)!r}, {str(target)!r})\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        code, stdout, stderr = self.run_stage(target, "--allow-overwrite", helper=helper)
        self.assertEqual(code, 1)
        self.assertTrue(target.is_symlink())
        self.assertEqual(referent.read_bytes(), b"preserve")
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_parent_swapped_during_dialog_is_rejected(self) -> None:
        """Do not publish into a replacement parent path after fd validation."""
        parent = self.root / "staging-parent"
        replacement = self.root / "replacement-parent"
        moved_parent = self.root / "original-parent"
        parent.mkdir(mode=0o700)
        replacement.mkdir(mode=0o700)
        target = parent / "key"
        helper = self.write_helper(
            "import os, struct\n"
            f"os.rename({str(parent)!r}, {str(moved_parent)!r})\n"
            f"os.symlink({str(replacement)!r}, {str(parent)!r})\n"
            f"value = {MARKER!r}\n"
            "os.write(3, struct.pack('>I', len(value)) + value)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        code, stdout, stderr = self.run_stage(target, helper=helper)
        self.assertEqual(code, 1)
        self.assertTrue(parent.is_symlink())
        self.assertFalse((replacement / "key").exists())
        self.assertFalse((moved_parent / "key").exists())
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_concurrent_exclusive_writers_publish_exactly_one_complete_file(self) -> None:
        """Make concurrent --forbid-existing writes mutually exclusive."""
        target = self.root / "contended-target"
        directory_fd, name = stage.validate_target(str(target))
        barrier = threading.Barrier(2)

        def write(value: bytes) -> str:
            barrier.wait(timeout=2)
            try:
                stage.write_secret(directory_fd, name, value, allow_overwrite=False)
            except (FileExistsError, stage.StageError):
                return "refused"
            return "staged"

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                outcomes = list(executor.map(write, (b"synthetic-a", b"synthetic-b")))
        finally:
            os.close(directory_fd)
        self.assertCountEqual(outcomes, ["staged", "refused"])
        self.assertIn(target.read_bytes(), (b"synthetic-a", b"synthetic-b"))
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_world_writable_parent_is_refused(self) -> None:
        """Reject a destination parent writable by other users."""
        parent = self.root / "writable"
        parent.mkdir()
        parent.chmod(0o777)
        try:
            code, _stdout, stderr = self.run_stage(parent / "key")
            self.assertEqual(code, 1)
            self.assertIn("writable", stderr)
        finally:
            parent.chmod(0o700)

    def test_missing_gtk_a11y_none_is_refused(self) -> None:
        """Refuse to import GTK unless accessibility is disabled."""
        spec_path = self.root / "spec.json"
        spec_path.write_text(json.dumps({"title": "T", "label": "L"}), encoding="utf-8")
        environment = {"PATH": os.environ.get("PATH", os.defpath), "HOME": str(self.root)}
        environment.pop("GTK_A11Y", None)
        result = subprocess.run(
            ["python3", str(SPEC), str(spec_path)],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 3)
        self.assertIn("GTK_A11Y=none is required", result.stderr)

    def test_dialog_rejects_missing_and_unknown_spec_fields(self) -> None:
        """Reject incomplete and unexpected fields in the dialog specification."""
        for specification in (
            {"title": "Title"},
            {"title": "Title", "label": "Label", "unexpected": "field"},
        ):
            with self.subTest(specification=specification):
                spec_path = self.root / "invalid-spec.json"
                spec_path.write_text(json.dumps(specification), encoding="utf-8")
                result = subprocess.run(
                    ["python3", str(SPEC), str(spec_path)],
                    env={"GTK_A11Y": "none", "PATH": os.environ.get("PATH", os.defpath)},
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 1)
                self.assertIn("invalid dialog specification", result.stderr)

    def test_cancel_leaves_no_file(self) -> None:
        """Treat cancellation as non-success and leave the target absent."""
        helper = self.write_helper("print('cancelled')\nraise SystemExit(2)\n")
        target = self.root / "cancelled"
        code, stdout, stderr = self.run_stage(target, helper=helper)
        self.assertEqual(code, 2, stderr)
        self.assertEqual(stdout.strip(), "cancelled")
        self.assertFalse(target.exists())
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_oversized_payload_is_refused(self) -> None:
        """Reject payloads above the transport byte cap without writing a file."""
        helper = self.write_helper(
            "import os, struct\n"
            "os.write(3, struct.pack('>I', 4097) + b'x' * 4097)\n"
            "os.close(3)\n"
            "print('ok')\n"
        )
        target = self.root / "oversized"
        code, stdout, stderr = self.run_stage(target, helper=helper)
        self.assertEqual(code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("oversized", stderr)
        self.assertFalse(target.exists())

    def test_helper_failure_code_propagates_without_output_leak(self) -> None:
        """Preserve helper failure status while discarding its output streams."""
        helper = self.write_helper(
            f"print({MARKER.decode()!r})\n"
            f"import sys; print({MARKER.decode()!r}, file=sys.stderr)\n"
            "raise SystemExit(7)\n"
        )
        target = self.root / "failure"
        code, stdout, stderr = self.run_stage(target, helper=helper)
        self.assertEqual(code, 7)
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertFalse(target.exists())
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_helper_failure_category_is_reported_without_output_leak(self) -> None:
        """Map an explicit failure category to a fixed message, never raw output."""
        helper = self.write_helper(
            f"print({MARKER.decode()!r})\n"
            f"import sys; print({MARKER.decode()!r}, file=sys.stderr)\n"
            "print('failed:internal')\n"
            "raise SystemExit(9)\n"
        )
        target = self.root / "categorised"
        code, stdout, stderr = self.run_stage(target, helper=helper)
        self.assertEqual(code, 9)
        self.assertIn("internal error", stderr)
        self.assertNotIn(MARKER.decode(), stdout + stderr)
        self.assertFalse(target.exists())
        self.assertEqual(list(self.dialog_directory.iterdir()), [])

    def test_dialog_helper_exits_on_parent_death_before_gtk_import(self) -> None:
        """Exercise PR_SET_PDEATHSIG with a fake import that never creates a window."""
        spec_path = self.root / "parent-death-spec.json"
        spec_path.write_text(json.dumps({"title": "Synthetic", "label": "Synthetic"}), encoding="utf-8")
        spec_path.chmod(0o600)
        fake_site = self.root / "fake-site"
        fake_gtk = fake_site / "gi"
        fake_gtk.mkdir(parents=True)
        started = self.root / "fake-gtk-import-started"
        signalled = self.root / "fake-gtk-import-signalled"
        (fake_gtk / "__init__.py").write_text(
            "import os, signal, time\n"
            "from pathlib import Path\n"
            "def on_parent_death(_signum, _frame):\n"
            "    Path(os.environ['SYNTHETIC_SIGNAL_FILE']).write_text('received')\n"
            "    os._exit(0)\n"
            "signal.signal(signal.SIGTERM, on_parent_death)\n"
            "Path(os.environ['SYNTHETIC_START_FILE']).write_text('blocked-before-GTK')\n"
            "while True: time.sleep(0.1)\n",
            encoding="utf-8",
        )
        environment = {
            "GTK_A11Y": "none",
            "PATH": os.environ.get("PATH", os.defpath),
            "PYTHONPATH": str(fake_site),
            "SYNTHETIC_START_FILE": str(started),
            "SYNTHETIC_SIGNAL_FILE": str(signalled),
        }
        launcher = (
            "import os, subprocess, sys, time\n"
            "child = subprocess.Popen([sys.executable, '-B', sys.argv[1], sys.argv[2]], "
            "stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n"
            "print(child.pid, flush=True)\n"
            "while True: time.sleep(1)\n"
        )
        owner = subprocess.Popen(
            [sys.executable, "-B", "-c", launcher, str(SPEC), str(spec_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=environment,
        )
        child_pid: int | None = None
        try:
            assert owner.stdout is not None
            child_pid = int(owner.stdout.readline().decode("ascii").strip())
            deadline = time.monotonic() + 3
            while not started.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(started.exists(), "dialog helper did not reach the fake GTK import")
            owner.terminate()
            owner.wait(timeout=3)
            deadline = time.monotonic() + 3
            while not signalled.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(signalled.exists(), "parent-death SIGTERM did not reach the helper")
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                try:
                    os.kill(child_pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.01)
            else:
                self.fail("dialog helper survived its parent's death")
        finally:
            if owner.poll() is None:
                owner.kill()
                owner.wait(timeout=3)
            if owner.stdout is not None:
                owner.stdout.close()
            if owner.stderr is not None:
                owner.stderr.close()
            if child_pid is not None:
                try:
                    command_line = Path(f"/proc/{child_pid}/cmdline").read_bytes()
                except FileNotFoundError:
                    command_line = b""
                if str(SPEC).encode() in command_line and str(spec_path).encode() in command_line:
                    try:
                        os.kill(child_pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass


if __name__ == "__main__":
    unittest.main(verbosity=2)
