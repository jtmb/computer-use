"""Exercise plugin-only deployment without touching the active user profile."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("deploy_goal_plugin", Path(__file__).with_name("deploy-goal-plugin.py"))
assert spec and spec.loader
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class GoalDeploymentTests(unittest.TestCase):
    """Verify narrow selection, preservation, safe refusal and rollback evidence."""

    def test_merge_preserves_unrelated_settings_and_plugins(self) -> None:
        """The deployment must not replace the full global template."""
        current = b'// retained\n{"plugins":["voice","@prevalentware/opencode-goal-plugin@0.1.67"],"model":"private-local","permissions":{"x":"deny"},}'
        source = json.dumps({"plugins": [str(deploy.LOCAL_PACKAGE), "-opencode.goal"], "model": "different"}).encode()
        result = deploy.merged_config(current, source)
        self.assertIn(b"// retained", result)
        parsed = deploy.jsonc.parse_jsonc(result.decode())
        self.assertEqual(parsed["model"], "private-local")
        self.assertEqual(parsed["permissions"], {"x": "deny"})
        self.assertEqual(parsed["plugins"], ["voice", str(deploy.LOCAL_PACKAGE), "-opencode.goal"])

    def test_refuses_ambiguous_or_builtin_selection(self) -> None:
        """No declaration or explicit engine switch may be guessed."""
        source = json.dumps({"plugins": [str(deploy.LOCAL_PACKAGE)]}).encode()
        for plugins in [[], [deploy.PACKAGE, deploy.PACKAGE + "@1"], [deploy.PACKAGE, "opencode.goal"]]:
            with self.subTest(plugins=plugins), self.assertRaises(ValueError):
                deploy.merged_config(json.dumps({"plugins": plugins}).encode(), source)

    def test_real_file_preview_apply_and_stale_refusal(self) -> None:
        """Real transactions must preserve backups and reject stale writes."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            source, target = root / "source.json", root / "target.json"
            source.write_text(json.dumps({"plugins": [str(deploy.LOCAL_PACKAGE)]}))
            original = json.dumps({"plugins": [deploy.PACKAGE], "session": {"permissions": "auto"}}).encode()
            target.write_bytes(original)
            preview = deploy.deploy(source, target)
            self.assertEqual(target.read_bytes(), original)
            self.assertFalse(preview["applied"])
            report = deploy.deploy(source, target, expected_sha256=hashlib.sha256(original).hexdigest())
            self.assertTrue(report["applied"])
            self.assertEqual(json.loads(target.read_text())["session"], {"permissions": "auto"})
            self.assertTrue(any("backup" in item.name for item in root.iterdir()))
            with self.assertRaises(deploy.transaction.ConfigTransactionError):
                deploy.deploy(source, target, expected_sha256="0" * 64)

    def test_symlink_target_is_refused(self) -> None:
        """Deployment may not follow target aliases."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            source, target = root / "source.json", root / "target.json"
            source.write_text(json.dumps({"plugins": [str(deploy.LOCAL_PACKAGE)]}))
            target.symlink_to(source)
            with self.assertRaisesRegex(ValueError, "symlinked"):
                deploy.deploy(source, target)

    def test_special_and_oversized_files_are_refused(self) -> None:
        """A pending deployment cannot block on a FIFO or read unbounded data."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            filename = Path(directory) / "config"
            os.mkfifo(filename)
            with self.assertRaisesRegex(ValueError, "regular file"):
                deploy.read_config_bytes(filename)
            filename.unlink()
            filename.write_bytes(b" " * (deploy.transaction.MAX_CONFIG_BYTES + 1))
            with self.assertRaisesRegex(ValueError, "byte limit"):
                deploy.read_config_bytes(filename)


if __name__ == "__main__":
    unittest.main()
