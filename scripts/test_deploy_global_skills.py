"""Exercise skills-only deployment against isolated real configuration files."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("deploy_skills", Path(__file__).with_name("deploy-global-skills.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DeploymentTests(unittest.TestCase):
    """Keep source, backups and unrelated configuration intact across deployment."""

    def setUp(self) -> None:
        """Create a bounded fixture with a complete split skill bundle."""
        temporary = tempfile.TemporaryDirectory(prefix="skills-deploy-", dir="/tmp/opencode")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.skills = self.root / "source"
        reference = self.skills / "cross-session-coordination/references/protocol.md"
        reference.parent.mkdir(parents=True)
        reference.write_text("reference retained\n")
        (reference.parent.parent / "SKILL.md").write_text("---\nname: cross-session-coordination\ndescription: fixture\n---\n")
        self.config = self.root / "opencode.jsonc"
        self.original = {"model": "keep/model", "plugins": ["keep"], "agents": {"build": {"permissions": ["unchanged"]}}, "skills": ["~/other-skills"]}
        self.config.write_text(json.dumps(self.original))

    def test_preview_has_no_writes(self) -> None:
        """Preview neither edits settings nor creates a backup."""
        before = self.config.read_bytes()
        receipt = MODULE.deploy(self.config, self.skills)
        self.assertTrue(receipt["changed"])
        self.assertFalse(receipt["applied"])
        self.assertEqual(before, self.config.read_bytes())
        self.assertEqual(list(self.root.glob("*backup*")), [])

    def test_apply_preserves_all_unrelated_settings_and_is_idempotent(self) -> None:
        """Global source registration keeps every bundle file accessible and unchanged."""
        before = self.config.read_bytes()
        receipt = MODULE.deploy(self.config, self.skills, apply=True)
        self.assertEqual(Path(receipt["backup"]).read_bytes(), before)
        observed = json.loads(self.config.read_text())
        self.assertEqual(observed, {**self.original, "skills": ["~/other-skills", str(self.skills)]})
        self.assertEqual((Path(observed["skills"][-1]) / "cross-session-coordination/references/protocol.md").read_text(), "reference retained\n")
        saved = self.config.read_bytes()
        self.assertFalse(MODULE.deploy(self.config, self.skills, apply=True)["changed"])
        self.assertEqual(saved, self.config.read_bytes())
        self.assertEqual(len(list(self.root.glob("*backup*"))), 1)

    def test_missing_skills_array_is_added_without_replacing_config(self) -> None:
        """Reproduce the live missing-source configuration."""
        original = {key: value for key, value in self.original.items() if key != "skills"}
        self.config.write_text(json.dumps(original))
        MODULE.deploy(self.config, self.skills, apply=True)
        self.assertEqual(json.loads(self.config.read_text()), {**original, "skills": [str(self.skills)]})

    def test_symlink_hardlink_comment_and_invalid_sources_refuse(self) -> None:
        """Never follow alternate config paths or rewrite unparsed JSONC."""
        alias = self.root / "alias.jsonc"
        alias.symlink_to(self.config)
        with self.assertRaisesRegex(ValueError, "symlink"):
            MODULE.deploy(alias, self.skills, apply=True)
        self.config.write_text("// comment\n{}")
        before = self.config.read_bytes()
        with self.assertRaisesRegex(ValueError, "strict JSON"):
            MODULE.deploy(self.config, self.skills, apply=True)
        self.assertEqual(before, self.config.read_bytes())
        self.config.write_text(json.dumps({"skills": "not-an-array"}))
        with self.assertRaisesRegex(ValueError, "list of sources"):
            MODULE.deploy(self.config, self.skills, apply=True)
        self.config.write_text("{}")
        hardlink = self.root / "hardlink"
        hardlink.hardlink_to(self.config)
        with self.assertRaisesRegex(ValueError, "unsafe"):
            MODULE.deploy(self.config, self.skills, apply=True)

    def test_duplicate_keys_and_oversized_config_are_retained(self) -> None:
        """Avoid silently replacing ambiguous or out-of-budget settings."""
        for content, message in [(' {"model":"one","model":"two"}', "duplicate"),
                                 (" " * (MODULE.MAX_CONFIG_BYTES + 1), "oversized")]:
            self.config.write_text(content)
            with self.assertRaisesRegex(ValueError, message):
                MODULE.deploy(self.config, self.skills, apply=True)
            self.assertEqual(self.config.read_text(), content)
        self.assertEqual(list(self.root.glob("*backup*")), [])

    def test_concurrent_change_refuses_replacement_and_keeps_backup(self) -> None:
        """An unrelated editor update detected before replace is never overwritten."""
        reader = MODULE.read_config
        reads = 0

        def changed_reader(filename: Path) -> tuple[bytes, dict[str, object], object]:
            """Inject an external edit exactly at the last compare-before-write."""
            nonlocal reads
            reads += 1
            if reads == 3:
                filename.write_text('{"model":"external-edit"}')
            return reader(filename)

        with mock.patch.object(MODULE, "read_config", changed_reader):
            with self.assertRaisesRegex(ValueError, "changed before replacement"):
                MODULE.deploy(self.config, self.skills, apply=True)
        self.assertEqual(json.loads(self.config.read_text()), {"model": "external-edit"})
        backups = list(self.root.glob("*backup*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(json.loads(backups[0].read_text()), self.original)
        self.assertEqual(list(self.root.glob(".skills-deploy-*")), [])

    def test_source_symlink_and_missing_bundle_refuse_before_target_change(self) -> None:
        """Register the whole valid source, never a partial or escaped bundle."""
        before = self.config.read_bytes()
        link = self.skills / "escaped"
        link.symlink_to(self.config)
        with self.assertRaisesRegex(ValueError, "symlink"):
            MODULE.deploy(self.config, self.skills, apply=True)
        link.unlink()
        (self.skills / "cross-session-coordination/SKILL.md").unlink()
        with self.assertRaisesRegex(ValueError, "incomplete"):
            MODULE.deploy(self.config, self.skills, apply=True)
        self.assertEqual(before, self.config.read_bytes())


if __name__ == "__main__":
    unittest.main()
