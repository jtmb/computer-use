"""Test personality-only deployment with disposable configuration files."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("deploy_personality", Path(__file__).with_name("deploy-personality.py"))
assert spec and spec.loader
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
ENTRY = {"package": str(deploy.PACKAGE), "options": {"defaultID": deploy.DEFAULT_ID}}
SOURCE = json.dumps({"plugins": [ENTRY], "model": "not-selected"}).encode()


class PersonalityDeploymentTests(unittest.TestCase):
    """Exercise preservation, exact identity, stale refusal and idempotence."""

    def test_merge_preserves_settings_and_comments(self) -> None:
        """Only the plugin list may change."""
        current = b'// keep me\n{"model":"chosen","permissions":[{"effect":"deny"}],"plugins":["voice"],}'
        result = deploy.merged_config(current, SOURCE)
        self.assertIn(b"// keep me", result)
        parsed = deploy.jsonc.parse_jsonc(result.decode())
        self.assertEqual(parsed["model"], "chosen")
        self.assertEqual(parsed["permissions"], [{"effect": "deny"}])
        self.assertEqual(parsed["plugins"], ["voice", ENTRY])
        self.assertEqual(deploy.merged_config(result, SOURCE), result)

    def test_duplicate_custom_and_unreviewed_defaults_refuse(self) -> None:
        """Do not silently replace a different personality selection."""
        for entries in [[ENTRY, ENTRY], [{"package": str(deploy.PACKAGE), "options": {"defaultID": "personality-other"}}]]:
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                deploy.merged_config(json.dumps({"plugins": entries}).encode(), SOURCE)
        with self.assertRaises(ValueError):
            deploy.merged_config(b"{}", b'{"plugins":[]}')

    def test_missing_plugin_array_is_added_without_changing_other_fields(self) -> None:
        """A minimal profile can opt in without acquiring the whole template."""
        result = deploy.merged_config(b'{"instructions":["keep.md"]}', SOURCE)
        self.assertEqual(json.loads(result), {"instructions": ["keep.md"], "plugins": [ENTRY]})

    def test_preview_apply_backup_and_stale_refusal(self) -> None:
        """An actual scratch transaction preserves originals and evidence."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            source, target = root / "source.json", root / "target.json"
            source.write_bytes(SOURCE)
            original = b'{"plugins":["voice"],"instructions":["my-rules.md"]}'
            target.write_bytes(original)
            preview = deploy.deploy(source, target)
            self.assertFalse(preview["applied"])
            self.assertEqual(target.read_bytes(), original)
            result = deploy.deploy(source, target, expected_sha256=hashlib.sha256(original).hexdigest())
            self.assertTrue(result["applied"])
            self.assertEqual(json.loads(target.read_text())["instructions"], ["my-rules.md"])
            self.assertTrue(any("backup" in p.name for p in root.iterdir()))
            with self.assertRaises(deploy.transaction.ConfigTransactionError):
                deploy.deploy(source, target, expected_sha256="0" * 64)

    def test_symlink_target_refuses(self) -> None:
        """No target alias may redirect a deployment."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            source, target = root / "source.json", root / "target.json"
            source.write_bytes(SOURCE)
            target.symlink_to(source)
            with self.assertRaisesRegex(ValueError, "symlinked"):
                deploy.deploy(source, target)

    def test_scratch_rollout_has_preview_bound_reversible_restore(self) -> None:
        """Verify restoration with the actual transaction receipt, not a copy."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            source, target = root / "source.json", root / "target.json"
            source.write_bytes(SOURCE)
            original = b'// preserve exactly\n{"plugins":["voice"],"model":"chosen"}'
            target.write_bytes(original)
            applied = deploy.deploy(source, target, expected_sha256=hashlib.sha256(original).hexdigest())
            receipt = Path(str(applied["receipt"]))
            post_write = target.read_bytes()
            digest = hashlib.sha256(post_write).hexdigest()
            preview = deploy.transaction.restore(target, receipt, expected_sha256=digest)
            self.assertFalse(preview["applied"])
            self.assertEqual(target.read_bytes(), post_write)
            with self.assertRaises(deploy.transaction.ConfigTransactionError):
                deploy.transaction.restore(target, receipt, expected_sha256="0" * 64, apply=True)
            restored = deploy.transaction.restore(target, receipt, expected_sha256=digest, apply=True)
            self.assertTrue(restored["applied"])
            self.assertEqual(target.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
