"""Exercise bridge deployment only inside retained approved scratch directories."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("deploy_windows", Path(__file__).with_name("deploy-window-control.py"))
deployment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deployment)


class DeploymentTests(unittest.TestCase):
    """Protect unmanaged files, manual edits, and the activation approval boundary."""

    def fixture(self) -> tuple[Path, Path]:
        """Make an isolated source and an unused extension target."""
        root = Path(tempfile.mkdtemp(prefix="window-deploy-test-", dir="/tmp/opencode"))
        source = root / "source"
        source.mkdir()
        for name in deployment.FILES:
            origin = deployment.source_file(name) if name == "runtime-contract.mjs" else deployment.SOURCE / name
            (source / name).write_bytes(origin.read_bytes())
        return source, root / "extensions" / deployment.UUID

    def test_preview_does_not_write_apply_is_verified_and_idempotent(self) -> None:
        """First deploy installs only managed entries; a second run writes nothing."""
        source, target = self.fixture()
        plan = deployment.deploy(source, target)
        self.assertEqual(len(plan["changes"]), len(deployment.FILES))
        self.assertFalse(target.exists())
        target.mkdir(parents=True)
        unrelated = target / "unrelated.txt"
        unrelated.write_text("preserve me")
        result = deployment.deploy(source, target, True)
        self.assertTrue(result["verified"])
        self.assertEqual(result["enablement"], "not performed")
        before = {p.name: p.stat().st_mtime_ns for p in target.iterdir()}
        again = deployment.deploy(source, target, True)
        self.assertEqual(again["changes"], [])
        self.assertEqual(before, {p.name: p.stat().st_mtime_ns for p in target.iterdir()})
        self.assertEqual(unrelated.read_text(), "preserve me")

    def test_updates_back_up_only_owned_files_and_marker(self) -> None:
        """Canonical updates keep the previous deployed content beside the target."""
        source, target = self.fixture()
        deployment.deploy(source, target, True)
        original = (target / "policy.mjs").read_bytes()
        (source / "policy.mjs").write_bytes(original + b"\n// canonical update\n")
        updated = deployment.deploy(source, target, True)
        backup = Path(updated["backup"])
        self.assertEqual((backup / "policy.mjs").read_bytes(), original)
        self.assertTrue((backup / deployment.MARKER).is_file())
        self.assertFalse((backup / "extension.js").exists())

    def test_unmanaged_and_manually_edited_files_are_preserved(self) -> None:
        """No force flag silently takes over user work or deployed manual changes."""
        source, target = self.fixture()
        target.mkdir(parents=True)
        existing = target / "extension.js"
        existing.write_text("manual unmanaged source")
        with self.assertRaisesRegex(ValueError, "unmanaged"):
            deployment.deploy(source, target, True)
        self.assertEqual(existing.read_text(), "manual unmanaged source")
        source2, target2 = self.fixture()
        deployment.deploy(source2, target2, True)
        (target2 / "extension.js").write_text("manual edit")
        with self.assertRaisesRegex(ValueError, "changed outside"):
            deployment.deploy(source2, target2, True)
        self.assertEqual((target2 / "extension.js").read_text(), "manual edit")

    def test_symlinks_wrong_targets_and_invalid_markers_are_rejected(self) -> None:
        """Do not follow a link into unrelated filesystem locations."""
        source, target = self.fixture()
        target.parent.mkdir()
        actual = target.parent / "actual"
        actual.mkdir()
        target.symlink_to(actual, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            deployment.deploy(source, target, True)
        with self.assertRaisesRegex(ValueError, "must be named"):
            deployment.deploy(source, actual)
        source2, target2 = self.fixture()
        deployment.deploy(source2, target2, True)
        (target2 / deployment.MARKER).write_text(json.dumps({"uuid": "someone-else"}))
        with self.assertRaisesRegex(ValueError, "marker"):
            deployment.deploy(source2, target2, True)

    def test_every_dynamic_import_of_the_extension_is_managed(self) -> None:
        """A lazily imported module must be deployed, or that capability dies at call time."""
        import re

        source = (deployment.SOURCE / "extension.js").read_text(encoding="utf-8")
        pattern = "import\\(\\s*['\"]\\./([A-Za-z0-9_.-]+\\.mjs)['\"]\\s*\\)"
        imported = set(re.findall(pattern, source))
        self.assertTrue(imported, "extension.js should import at least one module")
        missing = sorted(name for name in imported if name not in deployment.FILES)
        self.assertEqual(missing, [], "lazily imported modules missing from the managed set")

    def test_cli_never_guesses_a_target_from_the_agent_xdg_directory(self) -> None:
        """Both preview and apply require the explicitly selected Shell target."""
        for extra in ([], ["--apply"]):
            result = subprocess.run([
                sys.executable, str(Path(__file__).with_name("deploy-window-control.py")), *extra,
            ], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--extension-dir", result.stderr)


if __name__ == "__main__":
    unittest.main()
