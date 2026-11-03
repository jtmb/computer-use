#!/usr/bin/env python3
"""Exercise reversible MCP config transactions with synthetic /tmp files only."""

from __future__ import annotations

import errno
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).with_name("mcp_config_transaction.py")
SPEC = importlib.util.spec_from_file_location("mcp_config_transaction_tests", SOURCE)
assert SPEC is not None and SPEC.loader is not None
transaction = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(transaction)


class ConfigTransactionTests(unittest.TestCase):
    """Verify byte preservation, compare-and-swap, restore, and adversarial paths."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="mcp-transaction-", dir="/tmp/opencode")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.target = self.root / "opencode.jsonc"
        self.original = b'{\n  "model": "fixture/original"\n}\n'
        self.desired = b'{\n  "model": "fixture/desired"\n}\n'
        self.target.write_bytes(self.original)
        self.target.chmod(0o640)

    @staticmethod
    def digest(content: bytes) -> str:
        """Return a fixture digest using the public algorithm."""
        return hashlib.sha256(content).hexdigest()

    def apply(self, desired: bytes | None = None) -> dict[str, object]:
        """Apply fixture bytes with the exact observed current digest."""
        replacement = self.desired if desired is None else desired
        return transaction.apply(
            self.target,
            replacement,
            expected_sha256=self.digest(self.target.read_bytes()),
        )

    def test_preview_is_read_only_and_returns_exact_hash_report(self) -> None:
        """Preview hashes exact bytes and leaves inode, mode, and directory untouched."""
        before = self.target.stat()
        entries = sorted(path.name for path in self.root.iterdir())

        result = transaction.preview(self.target, self.desired)

        self.assertEqual(
            result,
            {
                "current_sha256": self.digest(self.original),
                "desired_sha256": self.digest(self.desired),
                "changed": True,
                "applied": False,
            },
        )
        after = self.target.stat()
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertEqual((after.st_ino, after.st_mode, after.st_mtime_ns),
                         (before.st_ino, before.st_mode, before.st_mtime_ns))
        self.assertEqual(sorted(path.name for path in self.root.iterdir()), entries)

    def test_apply_preserves_exact_backup_and_canonical_private_receipt(self) -> None:
        """Apply preserves bytes before replace and returns adjacent receipt evidence."""
        result = self.apply()

        self.assertEqual(result["changed"], True)
        self.assertEqual(result["applied"], True)
        backup = Path(str(result["backup"]))
        receipt = Path(str(result["receipt"]))
        self.assertEqual(backup.parent, self.target.parent)
        self.assertEqual(receipt.parent, self.target.parent)
        self.assertEqual(backup.read_bytes(), self.original)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(receipt.stat().st_mode), 0o400)
        record = json.loads(receipt.read_text(encoding="ascii"))
        self.assertEqual(record["schema"], transaction.RECEIPT_SCHEMA)
        self.assertEqual(record["target"], str(self.target))
        self.assertEqual(record["backup"], str(backup))
        self.assertEqual(record["before_sha256"], self.digest(self.original))
        self.assertEqual(record["desired_sha256"], self.digest(self.desired))
        self.assertEqual(record["backup_sha256"], self.digest(self.original))
        self.assertEqual(record["original_mode"], 0o640)
        self.assertEqual(record["desired_mode"], 0o640)
        self.assertEqual(self.target.read_bytes(), self.desired)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o640)

    def test_apply_noop_preserves_inode_mode_bytes_and_creates_no_artifacts(self) -> None:
        """A no-op apply has no lock, backup, receipt, or replacement side effect."""
        before = self.target.stat()
        entries = sorted(path.name for path in self.root.iterdir())

        result = transaction.apply(
            self.target,
            self.original,
            expected_sha256=self.digest(self.original),
        )

        after = self.target.stat()
        self.assertEqual(result["changed"], False)
        self.assertEqual(result["applied"], False)
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertEqual((after.st_ino, after.st_mode, after.st_mtime_ns),
                         (before.st_ino, before.st_mode, before.st_mtime_ns))
        self.assertEqual(sorted(path.name for path in self.root.iterdir()), entries)

    def test_stale_or_noncanonical_digest_fails_before_creating_lock(self) -> None:
        """CAS failures and uppercase digests cause no filesystem effects."""
        entries = sorted(path.name for path in self.root.iterdir())
        for expected in ("0" * 64, self.digest(self.original).upper()):
            with self.subTest(expected=expected[:8]):
                with self.assertRaises(transaction.ConfigTransactionError):
                    transaction.apply(self.target, self.desired, expected_sha256=expected)
                self.assertEqual(self.target.read_bytes(), self.original)
                self.assertEqual(sorted(path.name for path in self.root.iterdir()), entries)

    def test_restore_defaults_to_preview_then_creates_a_reversible_restore_receipt(self) -> None:
        """Restore is read-only by default and its applied result can be reversed."""
        applied = self.apply()
        first_receipt = Path(str(applied["receipt"]))
        post_stat = self.target.stat()
        entries = sorted(path.name for path in self.root.iterdir())
        post_digest = self.digest(self.desired)

        preview = transaction.restore(self.target, first_receipt, expected_sha256=post_digest)

        self.assertEqual(preview["changed"], True)
        self.assertEqual(preview["applied"], False)
        self.assertEqual(preview["desired_sha256"], self.digest(self.original))
        self.assertEqual(self.target.read_bytes(), self.desired)
        self.assertEqual(self.target.stat().st_ino, post_stat.st_ino)
        self.assertEqual(sorted(path.name for path in self.root.iterdir()), entries)

        restored = transaction.restore(
            self.target,
            first_receipt,
            expected_sha256=post_digest,
            apply=True,
        )
        reverse_receipt = Path(str(restored["receipt"]))
        self.assertEqual(restored["applied"], True)
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o640)
        self.assertEqual(Path(str(restored["backup"])).read_bytes(), self.desired)

        reversed_again = transaction.restore(
            self.target,
            reverse_receipt,
            expected_sha256=self.digest(self.original),
            apply=True,
        )
        self.assertEqual(reversed_again["applied"], True)
        self.assertEqual(self.target.read_bytes(), self.desired)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o640)

    def test_restore_refuses_changed_target_even_with_a_matching_new_digest(self) -> None:
        """A receipt cannot overwrite edits made after its recorded publication."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        changed = b'{"model":"fixture/concurrent"}\n'
        self.target.write_bytes(changed)

        with self.assertRaisesRegex(transaction.ConfigTransactionError, "post-transaction"):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(changed),
                apply=True,
            )
        self.assertEqual(self.target.read_bytes(), changed)

    def test_restore_rejects_same_bytes_replaced_by_a_different_inode(self) -> None:
        """Matching bytes alone cannot substitute a different published file identity."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        replacement = self.root / "same-bytes-replacement"
        replacement.write_bytes(self.desired)
        replacement.chmod(0o640)
        os.replace(replacement, self.target)

        with self.assertRaisesRegex(transaction.ConfigTransactionError, "file identity"):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(self.desired),
                apply=True,
            )
        self.assertEqual(self.target.read_bytes(), self.desired)

    def test_restore_rejects_tampered_receipt_and_outside_backup_path(self) -> None:
        """Receipt allowlists prevent modified target and attacker-selected backup paths."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        outside = self.root / "outside-backup"
        outside.write_bytes(b"must remain untouched")
        record = json.loads(receipt.read_text(encoding="ascii"))
        record["backup"] = str(outside)
        receipt.chmod(0o600)
        receipt.write_text(
            json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n",
            encoding="ascii",
        )
        receipt.chmod(0o400)

        with self.assertRaisesRegex(transaction.ConfigTransactionError, "adjacent transaction file"):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(self.desired),
            )
        self.assertEqual(self.target.read_bytes(), self.desired)
        self.assertEqual(outside.read_bytes(), b"must remain untouched")

    def test_restore_rejects_tampered_backup_bytes(self) -> None:
        """A backup hash mismatch blocks restore before target mutation."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        backup = Path(str(applied["backup"]))
        backup.write_bytes(b"tampered backup")

        with self.assertRaisesRegex(transaction.ConfigTransactionError, "digest"):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(self.desired),
                apply=True,
            )
        self.assertEqual(self.target.read_bytes(), self.desired)

    def test_restore_rejects_exact_bytes_at_a_replaced_backup_inode(self) -> None:
        """A copied backup with equal content is not the receipt-bound artifact."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        backup = Path(str(applied["backup"]))
        replacement = self.root / "replacement-backup"
        replacement.write_bytes(self.original)
        replacement.chmod(0o600)
        os.replace(replacement, backup)

        with self.assertRaisesRegex(transaction.ConfigTransactionError, "backup file identity"):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(self.desired),
                apply=True,
            )
        self.assertEqual(self.target.read_bytes(), self.desired)

    def test_restore_rejects_backup_symlink_without_following_it(self) -> None:
        """A receipt backup replaced by a symlink cannot redirect reads or writes."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        backup = Path(str(applied["backup"]))
        moved_backup = self.root / "moved-private-backup"
        backup.rename(moved_backup)
        backup.symlink_to(moved_backup)

        with self.assertRaises(transaction.ConfigTransactionError):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(self.desired),
                apply=True,
            )
        self.assertEqual(self.target.read_bytes(), self.desired)
        self.assertEqual(moved_backup.read_bytes(), self.original)

    def test_restore_rejects_boolean_parent_identity_values(self) -> None:
        """JSON booleans cannot masquerade as integer filesystem identities."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        record = json.loads(receipt.read_text(encoding="ascii"))
        record["parent_identity"]["device"] = True
        receipt.chmod(0o600)
        receipt.write_text(
            json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n",
            encoding="ascii",
        )
        receipt.chmod(0o400)

        with self.assertRaisesRegex(transaction.ConfigTransactionError, "parent identity"):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(self.desired),
            )
        self.assertEqual(self.target.read_bytes(), self.desired)

    def test_restore_bounds_untrusted_receipt_reads(self) -> None:
        """An oversized receipt is rejected before parsing or target mutation."""
        applied = self.apply()
        receipt = Path(str(applied["receipt"]))
        receipt.chmod(0o600)
        receipt.write_bytes(b"x" * (transaction.MAX_RECEIPT_BYTES + 1))
        receipt.chmod(0o400)

        with self.assertRaisesRegex(transaction.ConfigTransactionError, "exceeds"):
            transaction.restore(
                self.target,
                receipt,
                expected_sha256=self.digest(self.desired),
            )
        self.assertEqual(self.target.read_bytes(), self.desired)

    def test_restore_rejects_foreign_receipt_name_and_symlink_receipt(self) -> None:
        """Receipt path names are token-bound and opened without following links."""
        applied = self.apply()
        real_receipt = Path(str(applied["receipt"]))
        foreign = self.root / "foreign.receipt"
        foreign.write_bytes(real_receipt.read_bytes())
        foreign.chmod(0o400)
        with self.assertRaisesRegex(transaction.ConfigTransactionError, "foreign or ambiguous"):
            transaction.restore(
                self.target,
                foreign,
                expected_sha256=self.digest(self.desired),
            )

        symlink = self.root / f".mcp-config-transaction-{'0' * 32}.receipt"
        symlink.symlink_to(real_receipt)
        with self.assertRaises(transaction.ConfigTransactionError):
            transaction.restore(
                self.target,
                symlink,
                expected_sha256=self.digest(self.desired),
            )
        self.assertEqual(self.target.read_bytes(), self.desired)

    def test_growth_during_bounded_read_is_detected(self) -> None:
        """A deterministic append between read and metadata checks is rejected."""
        original_read = os.read
        grew = False

        def append_after_read(descriptor: int, size: int) -> bytes:
            nonlocal grew
            content = original_read(descriptor, size)
            if not grew:
                grew = True
                with self.target.open("ab") as stream:
                    stream.write(b"concurrent growth")
            return content

        with patch.object(transaction.os, "read", side_effect=append_after_read):
            with self.assertRaisesRegex(transaction.ConfigTransactionError, "changed while it was read"):
                transaction.preview(self.target, self.desired)
        self.assertTrue(grew)

    def test_oversized_target_and_desired_bytes_are_bounded(self) -> None:
        """Both target reads and requested writes enforce the fixed one-MiB cap."""
        oversized = b"x" * (transaction.MAX_CONFIG_BYTES + 1)
        self.target.write_bytes(oversized)
        with self.assertRaisesRegex(transaction.ConfigTransactionError, "exceeds"):
            transaction.preview(self.target, self.desired)

        self.target.write_bytes(self.original)
        with self.assertRaisesRegex(transaction.ConfigTransactionError, "no larger"):
            transaction.preview(self.target, oversized)

    def test_symlink_target_ancestor_hardlink_and_fifo_are_refused(self) -> None:
        """No-follow and regular-single-link checks reject ambiguous file types."""
        target_link = self.root / "target-link"
        target_link.symlink_to(self.target)
        with self.assertRaises(transaction.ConfigTransactionError):
            transaction.preview(target_link, self.desired)

        real_dir = self.root / "real-dir"
        real_dir.mkdir()
        nested = real_dir / "config"
        nested.write_bytes(self.original)
        ancestor_link = self.root / "ancestor-link"
        ancestor_link.symlink_to(real_dir, target_is_directory=True)
        with self.assertRaises(transaction.ConfigTransactionError):
            transaction.preview(ancestor_link / "config", self.desired)

        hardlink = self.root / "hardlink"
        os.link(self.target, hardlink)
        with self.assertRaisesRegex(transaction.ConfigTransactionError, "hard link"):
            transaction.preview(self.target, self.desired)
        hardlink.unlink()

        fifo = self.root / "named-pipe"
        os.mkfifo(fifo)
        started = time.monotonic()
        with self.assertRaisesRegex(transaction.ConfigTransactionError, "regular file"):
            transaction.preview(fifo, self.desired)
        self.assertLess(time.monotonic() - started, 1.0)

    def test_persistent_lock_inode_survives_multiple_transactions(self) -> None:
        """The cooperative lock is persistent and never unlinked between applies."""
        first = self.apply()
        lock = self.root / transaction._lock_filename(self.target)
        first_identity = lock.stat().st_ino
        second_bytes = b'{"model":"fixture/second"}\n'

        second = transaction.apply(
            self.target,
            second_bytes,
            expected_sha256=self.digest(self.target.read_bytes()),
        )

        self.assertTrue(first["applied"])
        self.assertTrue(second["applied"])
        self.assertEqual(lock.stat().st_ino, first_identity)
        self.assertEqual(self.target.read_bytes(), second_bytes)

    def test_lock_contention_is_bounded_and_does_not_publish(self) -> None:
        """An occupied persistent lock fails quickly without changing target bytes."""
        self.apply()
        lock = self.root / transaction._lock_filename(self.target)
        descriptor = os.open(lock, os.O_RDWR)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current = self.target.read_bytes()
        entries = sorted(path.name for path in self.root.iterdir())
        started = time.monotonic()
        try:
            with self.assertRaisesRegex(transaction.ConfigTransactionError, "lock is busy"):
                transaction.apply(
                    self.target,
                    b'{"model":"fixture/blocked"}\n',
                    expected_sha256=self.digest(current),
                )
        finally:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(self.target.read_bytes(), current)
        self.assertEqual(sorted(path.name for path in self.root.iterdir()), entries)

    def test_lock_symlink_is_not_followed_or_used(self) -> None:
        """An attacker-controlled lock symlink cannot redirect writes."""
        nested = self.root / "nested"
        nested.mkdir()
        target = nested / "config"
        target.write_bytes(self.original)
        sentinel = self.root / "sentinel"
        sentinel.write_bytes(b"outside target parent")
        lock = nested / transaction._lock_filename(target)
        lock.symlink_to(sentinel)

        with self.assertRaises(transaction.ConfigTransactionError):
            transaction.apply(target, self.desired, expected_sha256=self.digest(self.original))
        self.assertEqual(target.read_bytes(), self.original)
        self.assertEqual(sentinel.read_bytes(), b"outside target parent")

    def test_concurrent_edit_after_preservation_is_not_overwritten(self) -> None:
        """A post-receipt concurrent edit blocks publish and keeps recovery evidence."""
        concurrent = b'{"model":"fixture/concurrent"}\n'
        real_write = transaction._write_private_at

        def write_then_edit(*args: object, **kwargs: object) -> tuple[int, ...]:
            result = real_write(*args, **kwargs)
            if kwargs.get("label") == "transaction receipt":
                self.target.write_bytes(concurrent)
            return result

        with patch.object(transaction, "_write_private_at", side_effect=write_then_edit):
            with self.assertRaisesRegex(transaction.ConfigTransactionError, "immediately before publication"):
                self.apply()

        self.assertEqual(self.target.read_bytes(), concurrent)
        backups = list(self.root.glob(".mcp-config-transaction-*.backup"))
        receipts = list(self.root.glob(".mcp-config-transaction-*.receipt"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), self.original)
        self.assertEqual(len(receipts), 1)
        self.assertEqual(stat.S_IMODE(receipts[0].stat().st_mode), 0o400)

    def test_replace_error_after_publication_reports_uncertainty_and_keeps_evidence(self) -> None:
        """An ambiguous replace failure never auto-restores or discards receipt evidence."""
        real_replace = os.replace

        def replace_then_interrupt(*args: object, **kwargs: object) -> None:
            real_replace(*args, **kwargs)
            raise OSError(errno.EIO, "synthetic interruption after rename")

        with patch.object(transaction.os, "replace", side_effect=replace_then_interrupt):
            with self.assertRaisesRegex(transaction.ConfigTransactionError, "publication outcome is uncertain"):
                self.apply()

        self.assertEqual(self.target.read_bytes(), self.desired)
        backups = list(self.root.glob(".mcp-config-transaction-*.backup"))
        receipts = list(self.root.glob(".mcp-config-transaction-*.receipt"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), self.original)
        self.assertEqual(len(receipts), 1)
        self.assertTrue((self.root / transaction._lock_filename(self.target)).exists())

    def test_target_edit_during_final_stage_check_is_preserved(self) -> None:
        """A final stage check must not create an unchecked target-write window."""
        real_verify = transaction._verify_stage
        changed = b'{"model":"fixture/late-editor"}\n'

        def verify_then_edit(*args: object, **kwargs: object) -> tuple[int, ...]:
            result = real_verify(*args, **kwargs)
            if args[-1] == 0o640:
                self.target.write_bytes(changed)
            return result

        with patch.object(transaction, "_verify_stage", side_effect=verify_then_edit):
            with self.assertRaises(transaction.ConfigTransactionError):
                self.apply()
        self.assertEqual(self.target.read_bytes(), changed)
        backups = list(self.root.glob(".mcp-config-transaction-*.backup"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), self.original)

    def test_backup_edit_during_final_stage_check_blocks_publication(self) -> None:
        """Never publish after the exact preservation artifact has changed."""
        real_verify = transaction._verify_stage

        def verify_then_edit(*args: object, **kwargs: object) -> tuple[int, ...]:
            result = real_verify(*args, **kwargs)
            if args[-1] == 0o640:
                backups = list(self.root.glob(".mcp-config-transaction-*.backup"))
                self.assertEqual(len(backups), 1)
                backups[0].write_bytes(b"fixture late backup corruption")
            return result

        with patch.object(transaction, "_verify_stage", side_effect=verify_then_edit):
            with self.assertRaises(transaction.ConfigTransactionError):
                self.apply()
        self.assertEqual(self.target.read_bytes(), self.original)

    def test_lock_replacement_during_final_stage_check_blocks_publication(self) -> None:
        """A held old inode is not a valid lock after its directory entry changes."""
        real_verify = transaction._verify_stage

        def verify_then_replace(*args: object, **kwargs: object) -> tuple[int, ...]:
            result = real_verify(*args, **kwargs)
            if args[-1] == 0o640:
                lock = self.root / transaction._lock_filename(self.target)
                lock.rename(self.root / "preserved-old-lock")
                descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                os.close(descriptor)
            return result

        with patch.object(transaction, "_verify_stage", side_effect=verify_then_replace):
            with self.assertRaises(transaction.ConfigTransactionError):
                self.apply()
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertTrue((self.root / "preserved-old-lock").exists())


if __name__ == "__main__":
    unittest.main()
