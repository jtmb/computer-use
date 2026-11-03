"""Test installed-byte restore against real original-deployer stdout and backups."""

from __future__ import annotations

from contextlib import redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import window_control_lock as locking

sys.dont_write_bytecode = True
SCRIPTS = Path(__file__).resolve().parent


def load_module(name: str, filename: str) -> object:
    """Import canonical source read-only, including dataclass module registration."""
    specification = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


forward = load_module("original_forward_restore_tests", "deploy-window-control.py")
restore = load_module("installed_restore_tests", "restore-window-control.py")


class RestoreTests(unittest.TestCase):
    """Exercise real file, receipt, backup, journal and kernel-lock boundaries."""

    def fixture(self, legacy: bool = False, partial: bool = False) -> tuple[Path, Path, Path, dict[str, bytes | None]]:
        """Own an isolated source/target tree and always clean up just that fixture."""
        temporary = tempfile.TemporaryDirectory(prefix="window-restore-test-", dir="/tmp/opencode")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        source = root / "source"
        source.mkdir()
        for name in forward.FILES:
            (source / name).write_bytes(forward.source_file(name).read_bytes())
        target = root / "extensions" / forward.UUID
        if legacy:
            target.mkdir(parents=True)
            selected = forward.FILES[:3]
            for name in selected:
                (target / name).write_bytes((source / name).read_bytes())
            marker = {"uuid": forward.UUID, "version": 1,
                      "files": {name: forward.digest(target / name) for name in selected}}
            (target / forward.MARKER).write_text(json.dumps(marker, separators=(",", ":")) + "\n")
            if partial:
                (target / "launch.mjs").write_bytes(b"// unlisted, preexisting launch bytes\n")
        else:
            self.forward_stdout(source, target)
        old = {name: (target / name).read_bytes() if (target / name).exists() else None
               for name in (*forward.FILES, forward.MARKER)}
        for name in ("extension.js", "policy.mjs"):
            with (source / name).open("ab") as stream:
                stream.write(b"\n// isolated canonical update\n")
        receipt = root / "forward-stdout.json"
        receipt.write_bytes(self.forward_stdout(source, target))
        return source, target, receipt, old

    def forward_stdout(self, source: Path, target: Path) -> bytes:
        """Run the unchanged original CLI entry point with fixture-only configuration."""
        output = io.StringIO()
        with (mock.patch.object(forward, "SOURCE", source),
              mock.patch.dict(forward.SOURCE_OVERRIDES, {"runtime-contract.mjs": source / "runtime-contract.mjs"}),
              mock.patch.object(sys, "argv", ["deploy-window-control.py", "--extension-dir", str(target), "--apply"]),
              redirect_stdout(output)):
            self.assertEqual(forward.main(), 0)
        result = json.loads(output.getvalue())
        self.assertTrue(result["verified"])
        self.assertFalse(result["dry_run"])
        self.assertNotIn("receipt", result)
        return output.getvalue().encode()

    def installed(self, target: Path) -> dict[str, bytes | None]:
        """Observe all managed installed bytes, including explicit absence."""
        return {name: (target / name).read_bytes() if (target / name).exists() else None
                for name in (*restore.FILES, restore.MARKER)}

    def tree_state(self, root: Path) -> dict[str, tuple[object, ...]]:
        """Detect preview writes or hidden lock/directory creation, excluding read atime."""
        result = {}
        for path in (root, *sorted(root.rglob("*"))):
            info = path.lstat()
            result[str(path)] = (info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns,
                                 info.st_ctime_ns, path.read_bytes() if path.is_file() else None)
        return result

    def assert_old(self, target: Path, old: dict[str, bytes | None]) -> None:
        """Assert exact old hashes and marker bytes rather than a success flag alone."""
        self.assertEqual(self.installed(target), old)
        for name, data in old.items():
            expected = None if data is None else restore.sha256(data)
            self.assertEqual(restore.read_snapshot(target / name).digest, expected)

    def test_original_stdout_update_preview_apply_exact_bytes_and_preservation(self) -> None:
        """Restore from installed backup, retaining every pre-restore byte and all inputs."""
        source, target, receipt, old = self.fixture()
        record = json.loads(receipt.read_bytes())
        original_backup = Path(record["backup"])
        unrelated = target / "operator-notes.txt"
        unrelated.write_text("keep unrelated bytes")
        extra_lock = target / "another.lock"
        extra_lock.write_bytes(b"unrelated lock")
        receipt_bytes = receipt.read_bytes()
        backup_state = self.tree_state(original_backup)
        source_state = self.tree_state(source)
        current = self.installed(target)
        before = self.tree_state(target.parent.parent)
        plan = restore.restore_plan(target, receipt)
        self.assertEqual(before, self.tree_state(target.parent.parent))
        self.assertTrue((target / locking.LOCK_NAME).is_file())
        for name in restore.FILES:
            (source / name).write_bytes(b"Source is no restore authority")
        changed_source_state = self.tree_state(source)
        with mock.patch.object(subprocess, "run", side_effect=AssertionError("No activation or subprocess")):
            result = restore.apply_restore(plan)
        self.assertTrue(result["verified"])
        self.assertEqual(result["enablement"], "not performed")
        self.assertEqual(result["restart"], "not performed")
        self.assert_old(target, old)
        recovery = Path(result["recovery"])
        self.assertEqual(recovery.parent, target.parent)
        self.assertEqual(recovery.stat().st_mode & 0o777, 0o700)
        for name, data in current.items():
            self.assertEqual((recovery / "current" / name).read_bytes(), data)
        self.assertEqual((recovery / "receipt.json").read_bytes(), receipt_bytes)
        self.assertEqual((recovery / "plan.json").read_bytes(), restore.encoded(plan.document()))
        events = [json.loads(line) for line in (recovery / "journal.jsonl").read_bytes().splitlines()]
        self.assertEqual(events[0]["stage"], "preparing")
        self.assertEqual(events[1]["stage"], "prepared")
        self.assertEqual(events[-1], {"stage": "complete", "verified": True})
        self.assertEqual(self.tree_state(original_backup), backup_state)
        self.assertEqual(receipt.read_bytes(), receipt_bytes)
        self.assertEqual(self.tree_state(source), changed_source_state)
        self.assertNotEqual(changed_source_state, source_state)
        self.assertEqual(unrelated.read_text(), "keep unrelated bytes")
        self.assertEqual(extra_lock.read_bytes(), b"unrelated lock")

    def test_legacy_three_file_upgrade_restores_only_explicit_absences(self) -> None:
        """An actual subset marker is restored byte-exactly; only before:null paths go."""
        _, target, receipt, old = self.fixture(legacy=True)
        plan = restore.restore_plan(target, receipt)
        self.assertEqual(set(plan.old_managed), set(restore.FILES[:3]))
        self.assertEqual({name for name in restore.FILES if plan.desired[name] is None},
                         set(restore.FILES[3:]))
        restore.apply_restore(plan)
        self.assert_old(target, old)

    def test_partial_marker_does_not_infer_absence_of_unlisted_old_file(self) -> None:
        """Preserve a preexisting unlisted file from actual saved bytes, not marker scope."""
        _, target, receipt, old = self.fixture(legacy=True, partial=True)
        restore.apply_restore(restore.restore_plan(target, receipt))
        self.assert_old(target, old)
        self.assertEqual((target / "launch.mjs").read_bytes(), b"// unlisted, preexisting launch bytes\n")

    def test_incomplete_ambiguous_receipts_are_refused_without_writes(self) -> None:
        """Missing proofs, version assumptions and fabricated absent hashes are not repaired."""
        mutations = (
            lambda record: record.pop("before"),
            lambda record: record["before"].pop("input.mjs"),
            lambda record: record["files"].update({"../extra.mjs": "a" * 64}),
            lambda record: record.update(verified=False),
            lambda record: record.update(dry_run=True),
            lambda record: record.update(marker_sha256=None),
            lambda record: record.update(backup=None),
            lambda record: record.update(changes=[]),
            lambda record: record["before"].update({"extension.js": None}),
            lambda record: record.update(target="/wrong/" + restore.UUID),
            lambda record: record.update(backup=str(Path(record["backup"]).parent / ".." / "other")),
        )
        for change in mutations:
            with self.subTest(change=change):
                _, target, receipt, _ = self.fixture()
                record = json.loads(receipt.read_bytes())
                change(record)
                receipt.write_text(json.dumps(record))
                before = self.tree_state(target.parent.parent)
                with self.assertRaises((ValueError, OSError)):
                    restore.restore_plan(target, receipt)
                self.assertEqual(self.tree_state(target.parent.parent), before)

    def test_first_install_receipt_has_no_proven_saved_marker_and_is_refused(self) -> None:
        """Do not reinterpret absent backup or null marker as old-file absence proof."""
        source, target, receipt, _ = self.fixture()
        other = target.parent.parent / "first-install" / restore.UUID
        receipt.write_bytes(self.forward_stdout(source, other))
        with self.assertRaisesRegex(ValueError, "saved old marker"):
            restore.restore_plan(other, receipt)

    def test_missing_changed_backup_and_mutated_old_marker_are_refused(self) -> None:
        """An unchanged installed byte is usable, but a missing changed old byte is not."""
        for name in ("extension.js", restore.MARKER):
            with self.subTest(name=name):
                _, target, receipt, _ = self.fixture()
                backup = Path(json.loads(receipt.read_bytes())["backup"])
                (backup / name).unlink()
                current = self.installed(target)
                with self.assertRaises(ValueError):
                    restore.restore_plan(target, receipt)
                self.assertEqual(self.installed(target), current)

    def test_actual_manual_marker_and_backup_byte_changes_are_refused(self) -> None:
        """Valid JSON is not proof when either marker or actual saved hashes differ."""
        for location in ("current-marker", "current-marker-whitespace", "old-marker", "old-bytes"):
            with self.subTest(location=location):
                _, target, receipt, _ = self.fixture()
                record = json.loads(receipt.read_bytes())
                backup = Path(record["backup"])
                if location == "old-bytes":
                    path = backup / "extension.js"
                    path.write_bytes(b"manually edited saved bytes")
                else:
                    path = (target if location.startswith("current-marker") else backup) / restore.MARKER
                    marker = json.loads(path.read_bytes())
                    if location != "current-marker-whitespace":
                        marker["files"]["extension.js"] = "a" * 64
                    path.write_text(json.dumps(marker))
                current = self.installed(target)
                with self.assertRaises(ValueError):
                    restore.restore_plan(target, receipt)
                self.assertEqual(self.installed(target), current)

    def test_manual_target_backup_and_receipt_mutation_invalidates_saved_plan(self) -> None:
        """Compare content and identity under lock, including the immutable input proofs."""
        for location in ("target", "backup", "receipt"):
            with self.subTest(location=location):
                _, target, receipt, _ = self.fixture()
                plan = restore.restore_plan(target, receipt)
                backup = Path(json.loads(receipt.read_bytes())["backup"])
                path = {"target": target / "policy.mjs", "backup": backup / "policy.mjs",
                        "receipt": receipt}[location]
                path.write_bytes(path.read_bytes() + b"\nmanual edit\n")
                current = self.installed(target)
                with self.assertRaisesRegex(ValueError, "changed"):
                    restore.apply_restore(plan)
                self.assertEqual(self.installed(target), current)
                self.assertTrue(path.read_bytes().endswith(b"manual edit\n"))

    def test_identical_content_replacement_invalidates_file_identity(self) -> None:
        """A stale preview cannot accept a replacement inode just because hashes match."""
        _, target, receipt, _ = self.fixture()
        plan = restore.restore_plan(target, receipt)
        path = target / "extension.js"
        replacement = target / "replacement"
        replacement.write_bytes(path.read_bytes())
        os.replace(replacement, path)
        with self.assertRaisesRegex(ValueError, "changed"):
            restore.apply_restore(plan)

    def test_replaced_target_directory_invalidates_saved_plan(self) -> None:
        """Even byte-identical copies cannot substitute a different target directory."""
        _, target, receipt, _ = self.fixture()
        plan = restore.restore_plan(target, receipt)
        moved = target.with_name("retained-original-target")
        target.rename(moved)
        shutil.copytree(moved, target)
        current = self.installed(target)
        with self.assertRaisesRegex(ValueError, "Directory identity changed"):
            restore.apply_restore(plan)
        self.assertEqual(self.installed(target), current)

    def test_replaced_backup_identity_and_outside_backup_are_refused(self) -> None:
        """An exact selected backup is not a basename search or a content-only match."""
        for outside in (False, True):
            with self.subTest(outside=outside):
                _, target, receipt, _ = self.fixture()
                plan = restore.restore_plan(target, receipt)
                record = json.loads(receipt.read_bytes())
                backup = Path(record["backup"])
                moved = backup.with_name(backup.name + ".retained")
                if outside:
                    copied = target.parent / "outside-backup"
                    shutil.copytree(backup, copied)
                    record["backup"] = str(copied)
                    receipt.write_text(json.dumps(record))
                    with self.assertRaisesRegex(ValueError, "under target/.backups"):
                        restore.restore_plan(target, receipt)
                else:
                    backup.rename(moved)
                    shutil.copytree(moved, backup)
                    with self.assertRaisesRegex(ValueError, "Directory identity changed"):
                        restore.apply_restore(plan)

    def test_symlink_hardlink_fifo_and_oversize_inputs_fail_closed(self) -> None:
        """Validate the actual opened file type and bounds for all proof locations."""
        for location in ("target", "marker", "backup", "old-marker", "receipt"):
            for kind in ("symlink", "hardlink", "fifo", "oversize"):
                with self.subTest(location=location, kind=kind):
                    _, target, receipt, _ = self.fixture()
                    backup = Path(json.loads(receipt.read_bytes())["backup"])
                    path = {"target": target / "extension.js", "marker": target / restore.MARKER,
                            "backup": backup / "extension.js", "old-marker": backup / restore.MARKER,
                            "receipt": receipt}[location]
                    saved = path.with_name(path.name + ".unrelated")
                    saved.write_bytes(path.read_bytes())
                    path.unlink()
                    if kind == "symlink":
                        path.symlink_to(saved)
                    elif kind == "hardlink":
                        os.link(saved, path)
                    elif kind == "fifo":
                        os.mkfifo(path, 0o600)
                    else:
                        with path.open("wb") as stream:
                            stream.truncate(restore.MAX_FILE + 1)
                    with self.assertRaises((ValueError, OSError)):
                        restore.restore_plan(target, receipt)
                    self.assertTrue(saved.exists())

    def test_symlinked_target_backup_and_receipt_ancestors_are_refused(self) -> None:
        """Secure directory traversal refuses ancestor links, not just final-file links."""
        for location in ("target", "backup", "receipt-parent"):
            with self.subTest(location=location):
                _, target, receipt, _ = self.fixture()
                if location == "receipt-parent":
                    real = receipt.parent / "real-receipts"
                    real.mkdir()
                    shutil.copy2(receipt, real / receipt.name)
                    alias = receipt.parent / "receipt-alias"
                    alias.symlink_to(real, target_is_directory=True)
                    receipt = alias / receipt.name
                else:
                    path = target if location == "target" else Path(json.loads(receipt.read_bytes())["backup"])
                    moved = path.with_name(path.name + ".retained")
                    path.rename(moved)
                    path.symlink_to(moved, target_is_directory=True)
                with self.assertRaises((ValueError, OSError)):
                    restore.restore_plan(target, receipt)

    def test_bound_before_read_and_growth_during_read(self) -> None:
        """Oversize files are not read; growth during an actual read invalidates proof."""
        _, target, _, _ = self.fixture()
        path = target / "probe"
        path.write_bytes(b"small")
        with mock.patch.object(os, "read", side_effect=AssertionError("Oversize must be rejected before read")):
            with self.assertRaisesRegex(ValueError, "oversized"):
                restore.read_snapshot(path, 4)
        original_read = os.read
        grew = False

        def grow_after_read(descriptor: int, count: int) -> bytes:
            """Inject growth at the OS read boundary without replacing the reader."""
            nonlocal grew
            chunk = original_read(descriptor, count)
            if not grew:
                grew = True
                with path.open("ab") as stream:
                    stream.write(b"x" * 16)
            return chunk

        with mock.patch.object(os, "read", side_effect=grow_after_read):
            with self.assertRaisesRegex(ValueError, "grew|changed"):
                restore.read_snapshot(path, 8)
        self.assertTrue(grew)

    def test_bad_json_duplicate_keys_and_extra_managed_paths_are_refused(self) -> None:
        """Reject ambiguous JSON and markers extending beyond the original seven paths."""
        for payload in (b"[", b"[]", b'{"uuid":"x","uuid":"y"}', b'{"number":NaN}'):
            with self.subTest(payload=payload):
                _, target, receipt, _ = self.fixture()
                receipt.write_bytes(payload)
                with self.assertRaises(ValueError):
                    restore.restore_plan(target, receipt)
        for old_marker in (False, True):
            with self.subTest(old_marker=old_marker):
                _, target, receipt, _ = self.fixture()
                record = json.loads(receipt.read_bytes())
                path = (Path(record["backup"]) if old_marker else target) / restore.MARKER
                marker = json.loads(path.read_bytes())
                marker["files"]["extra.mjs"] = "a" * 64
                path.write_text(json.dumps(marker))
                if old_marker:
                    record["marker_sha256"] = forward.digest(path)
                    receipt.write_text(json.dumps(record))
                with self.assertRaisesRegex(ValueError, "managed paths"):
                    restore.restore_plan(target, receipt)

    def test_actual_competing_process_flock_and_persistent_inode(self) -> None:
        """A separate process blocks apply; releasing it keeps the same lock inode."""
        source, target, receipt, _ = self.fixture()
        plan = restore.restore_plan(target, receipt)
        code = ("import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); "
                "from window_control_lock import target_lock; "
                "lock = target_lock(Path(sys.argv[2])); lock.__enter__(); "
                "print('locked', flush=True); sys.stdin.readline(); lock.__exit__(None, None, None)")
        process = subprocess.Popen([sys.executable, "-B", "-c", code, str(SCRIPTS), str(target)],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.assertEqual(process.stdout.readline().strip(), "locked")
            inode = (target / locking.LOCK_NAME).stat().st_ino
            current = self.installed(target)
            with (source / "policy.mjs").open("ab") as stream:
                stream.write(b"\n// competing forward update\n")
            with self.assertRaisesRegex(ValueError, "locked by another writer"):
                forward.deploy(source, target, True)
            with self.assertRaisesRegex(ValueError, "locked by another writer"):
                restore.apply_restore(plan)
            self.assertEqual(self.installed(target), current)
            process.communicate("release\n", timeout=10)
            self.assertEqual(process.returncode, 0)
            restore.apply_restore(plan)
            self.assertEqual((target / locking.LOCK_NAME).stat().st_ino, inode)
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=10)

    def test_existing_lock_bytes_preserved_and_unsafe_locks_refused(self) -> None:
        """Locking does not truncate or unlink existing locks or follow special entries."""
        for kind in ("regular", "symlink", "hardlink", "fifo", "oversize"):
            with self.subTest(kind=kind):
                _, target, receipt, _ = self.fixture()
                path = target / locking.LOCK_NAME
                other = target / "unrelated-lock-copy"
                other.write_bytes(b"operator lock bytes")
                path.unlink()
                if kind == "symlink":
                    path.symlink_to(other)
                elif kind == "hardlink":
                    os.link(other, path)
                elif kind == "fifo":
                    os.mkfifo(path, 0o600)
                else:
                    path.write_bytes(b"x" * 4097 if kind == "oversize" else b"operator lock bytes")
                plan = restore.restore_plan(target, receipt)
                if kind == "regular":
                    inode = path.stat().st_ino
                    restore.apply_restore(plan)
                    self.assertEqual(path.stat().st_ino, inode)
                    self.assertEqual(path.read_bytes(), b"operator lock bytes")
                else:
                    with self.assertRaises((ValueError, OSError)):
                        restore.apply_restore(plan)
                self.assertEqual(other.read_bytes(), b"operator lock bytes")

    def test_edit_injected_immediately_before_cas_retains_every_current_byte(self) -> None:
        """A fresh manual edit after recovery preparation is preserved, never overwritten."""
        _, target, receipt, _ = self.fixture()
        plan = restore.restore_plan(target, receipt)
        current = self.installed(target)
        original_event = restore.journal_event
        injected = False

        def edit_on_intent(path: Path, event: dict[str, object]) -> None:
            """Inject an unknown writer at the journal filesystem boundary."""
            nonlocal injected
            original_event(path, event)
            if event["stage"] == "intent" and not injected:
                injected = True
                (target / "extension.js").write_bytes(b"manual racing edit")

        with mock.patch.object(restore, "journal_event", side_effect=edit_on_intent):
            with self.assertRaisesRegex(restore.RestoreError, "Compare-and-swap") as caught:
                restore.apply_restore(plan)
        self.assertTrue(injected)
        self.assertEqual((target / "extension.js").read_bytes(), b"manual racing edit")
        recovery = caught.exception.recovery
        for name, data in current.items():
            self.assertEqual((recovery / "current" / name).read_bytes(), data)
        terminal = json.loads((recovery / "journal.jsonl").read_bytes().splitlines()[-1])
        self.assertEqual(terminal["stage"], "interrupted")

    def test_changed_staging_file_is_refused_before_publication(self) -> None:
        """Do not replace valid installed bytes with a changed temporary payload."""
        _, target, receipt, _ = self.fixture()
        plan = restore.restore_plan(target, receipt)
        current = self.installed(target)
        original_event = restore.journal_event

        def edit_staging(path: Path, event: dict[str, object]) -> None:
            """Inject a staging edit at the durable intent I/O boundary."""
            original_event(path, event)
            if event["stage"] == "intent" and event.get("temporary"):
                (target / event["temporary"]).write_bytes(b"changed staging payload")

        with mock.patch.object(restore, "journal_event", side_effect=edit_staging):
            with self.assertRaises(restore.RestoreError):
                restore.apply_restore(plan)
        self.assertEqual(self.installed(target), current)

    def test_forward_writer_refuses_restore_lock_without_changing_managed_bytes(self) -> None:
        """The actual forward deployer must share the restore writer protocol."""
        source, target, _, _ = self.fixture()
        with (source / "policy.mjs").open("ab") as stream:
            stream.write(b"\n// another forward update\n")
        current = self.installed(target)
        with locking.target_lock(target):
            with self.assertRaisesRegex(ValueError, "locked by another writer"):
                forward.deploy(source, target, True)
        self.assertEqual(self.installed(target), current)

    def test_interruption_after_publication_fails_closed_with_retained_journal(self) -> None:
        """Do not claim transaction rollback or resume a partly restored installed tree."""
        _, target, receipt, old = self.fixture()
        plan = restore.restore_plan(target, receipt)
        current = self.installed(target)
        notified = []
        original_replace = os.replace

        def interrupt_after_replace(source: str, destination: str, **options: object) -> None:
            """Interrupt after the kernel publication, before the caller can acknowledge it."""
            original_replace(source, destination, **options)
            raise KeyboardInterrupt("injected after one publication")

        with mock.patch.object(os, "replace", side_effect=interrupt_after_replace):
            with self.assertRaises(restore.RestoreError) as caught:
                restore.apply_restore(plan, notified.append)
        recovery = caught.exception.recovery
        self.assertEqual(notified, [recovery])
        self.assertEqual((target / "extension.js").read_bytes(), old["extension.js"])
        self.assertEqual((target / restore.MARKER).read_bytes(), current[restore.MARKER])
        for name, data in current.items():
            self.assertEqual((recovery / "current" / name).read_bytes(), data)
        journal = [json.loads(line) for line in (recovery / "journal.jsonl").read_bytes().splitlines()]
        self.assertFalse(any(event["stage"] == "complete" for event in journal))
        self.assertEqual(journal[-1]["stage"], "interrupted")
        with self.assertRaisesRegex(ValueError, "Current installed"):
            restore.restore_plan(target, receipt)

    def test_introduced_file_deletion_checks_cas_and_retains_interrupted_bytes(self) -> None:
        """Deletion requires exact current proof and keeps a copy even if unlink interrupts."""
        for inject_edit in (True, False):
            with self.subTest(inject_edit=inject_edit):
                _, target, receipt, _ = self.fixture(legacy=True)
                plan = restore.restore_plan(target, receipt)
                current = self.installed(target)
                original_event = restore.journal_event
                original_unlink = os.unlink
                injected = False

                def edit_before_delete(path: Path, event: dict[str, object]) -> None:
                    """Change the introduced path at the durable intent boundary."""
                    nonlocal injected
                    original_event(path, event)
                    if event["stage"] == "intent" and event.get("file") == "capture.mjs":
                        injected = True
                        if inject_edit:
                            (target / "capture.mjs").write_bytes(b"manual introduced-file edit")

                def interrupt_unlink(path: str, **options: object) -> None:
                    """Interrupt after the actual descriptor-relative kernel removal."""
                    original_unlink(path, **options)
                    if path == "capture.mjs" and not inject_edit:
                        raise KeyboardInterrupt("injected after introduced-file unlink")

                with (mock.patch.object(restore, "journal_event", side_effect=edit_before_delete),
                      mock.patch.object(os, "unlink", side_effect=interrupt_unlink)):
                    with self.assertRaises(restore.RestoreError) as caught:
                        restore.apply_restore(plan)
                self.assertTrue(injected)
                if inject_edit:
                    self.assertEqual((target / "capture.mjs").read_bytes(), b"manual introduced-file edit")
                else:
                    self.assertFalse((target / "capture.mjs").exists())
                recovery = caught.exception.recovery
                for name, data in current.items():
                    self.assertEqual((recovery / "current" / name).read_bytes(), data)
                self.assertNotIn(b'"stage": "complete"', (recovery / "journal.jsonl").read_bytes())

    def test_receipt_change_after_durable_preparation_prevents_first_publication(self) -> None:
        """Recovery creation does not substitute for a fresh proof check under the lock."""
        _, target, receipt, _ = self.fixture()
        plan = restore.restore_plan(target, receipt)
        current = self.installed(target)
        before_receipt = receipt.read_bytes()

        def edit_after_prepare(path: Path) -> None:
            """Simulate an operator changing input after seeing the retained path."""
            self.assertIn(b'"stage": "prepared"', (path / "journal.jsonl").read_bytes())
            receipt.write_bytes(before_receipt + b"\n")

        with self.assertRaisesRegex(restore.RestoreError, "Compare-and-swap") as caught:
            restore.apply_restore(plan, edit_after_prepare)
        self.assertEqual(self.installed(target), current)
        self.assertEqual((caught.exception.recovery / "receipt.json").read_bytes(), before_receipt)

    def test_recovery_copy_failure_prevents_all_managed_mutations(self) -> None:
        """An incomplete recovery bundle is retained, never treated as prepared."""
        _, target, receipt, _ = self.fixture()
        plan = restore.restore_plan(target, receipt)
        current = self.installed(target)
        original_open = os.open

        def fail_receipt_copy(path: str, flags: int, *args: object, **options: object) -> int:
            """Inject a failed exclusive copy at the actual OS open boundary."""
            if path == "receipt.json" and flags & os.O_EXCL:
                raise OSError("injected receipt copy failure")
            return original_open(path, flags, *args, **options)

        with mock.patch.object(os, "open", side_effect=fail_receipt_copy):
            with self.assertRaises(restore.RestoreError) as caught:
                restore.apply_restore(plan)
        self.assertEqual(self.installed(target), current)
        recovery = caught.exception.recovery
        self.assertTrue(recovery.is_dir())
        self.assertNotIn(b'"stage": "prepared"', (recovery / "journal.jsonl").read_bytes())

    def test_no_success_when_completion_journal_readback_is_wrong(self) -> None:
        """Even a completed byte restore needs durable terminal journal readback."""
        for terminal in (b'{"stage":"not-complete"}\n', b'{"stage":"complete","verified":false}\n',
                         b'{"stage":"complete","verified":1}\n'):
            with self.subTest(terminal=terminal):
                _, target, receipt, old = self.fixture()
                original_event = restore.journal_event

                def corrupt_terminal_record(path: Path, event: dict[str, object]) -> None:
                    """Inject a bad disk readback at the journal write boundary."""
                    original_event(path, event)
                    if event["stage"] == "complete":
                        with path.open("ab") as stream:
                            stream.write(terminal)

                with mock.patch.object(restore, "journal_event", side_effect=corrupt_terminal_record):
                    with self.assertRaisesRegex(restore.RestoreError, "journal readback"):
                        restore.apply_restore(restore.restore_plan(target, receipt))
                self.assert_old(target, old)

    def test_cli_requires_explicit_paths_and_defaults_to_zero_write_preview(self) -> None:
        """Use the real CLI without assuming an XDG profile or performing activation."""
        script = SCRIPTS / "restore-window-control.py"
        for options in ([], ["--apply"], ["--extension-dir", "/nonexistent"]):
            result = subprocess.run([sys.executable, "-B", str(script), *options],
                                    capture_output=True, text=True, check=False, timeout=10)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--receipt", result.stderr)
        _, target, receipt, old = self.fixture()
        before = self.tree_state(target.parent.parent)
        command = [sys.executable, "-B", str(script), "--extension-dir", str(target), "--receipt", str(receipt)]
        result = subprocess.run(command, capture_output=True, text=True, check=False, timeout=10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        preview = json.loads(result.stdout)
        self.assertTrue(preview["dry_run"])
        self.assertEqual(self.tree_state(target.parent.parent), before)
        stale = subprocess.run([*command, "--apply", "--expect-plan", "0" * 64],
                               capture_output=True, text=True, check=False, timeout=10)
        self.assertNotEqual(stale.returncode, 0)
        self.assertIn("Preview plan changed", stale.stdout)
        self.assertEqual(self.tree_state(target.parent.parent), before)
        applied = subprocess.run([*command, "--apply", "--expect-plan", preview["plan_sha256"]],
                                 capture_output=True, text=True, check=False, timeout=10)
        self.assertEqual(applied.returncode, 0, applied.stdout + applied.stderr)
        self.assertTrue(json.loads(applied.stdout)["verified"])
        self.assertIn("Retained restore recovery:", applied.stderr)
        self.assert_old(target, old)


if __name__ == "__main__":
    unittest.main()
