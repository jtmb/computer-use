"""Negative controls for the actual import/provenance and inventory verifier."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import verify_audit as audit


class AuditTests(unittest.TestCase):
    """Protect immutable-source checks and distinguish examples from real links."""

    def test_real_bundle_still_has_all_pinned_files(self) -> None:
        """Run the actual Git-backed scanner, not a handwritten manifest fixture."""
        index = audit.build_index()
        self.assertEqual(index["summary"]["files"], 494)
        self.assertEqual(index["summary"]["unchanged"], 493)
        self.assertEqual(index["summary"]["localDeltas"], [audit.REDACTOR])
        self.assertEqual(index["deliverables"]["reviewSections"], 30)
        self.assertEqual(index["deliverables"]["closureFiles"], 494)
        self.assertEqual(index["deliverables"]["brokenLocalDocumentLinks"], 0)

    def test_modified_or_missing_import_is_rejected(self) -> None:
        """An unrelated changed byte cannot be disguised as a local fix."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            path = root / "SKILL.md"
            original = b"original\n"
            expected = audit.blob_hash(original)
            path.write_bytes(original)
            self.assertTrue(
                audit.inspect_file(root, "SKILL.md", expected)["matchesPin"]
            )
            path.write_bytes(b"changed\n")
            with self.assertRaisesRegex(ValueError, "Undocumented"):
                audit.inspect_file(root, "SKILL.md", expected)
            path.unlink()
            with self.assertRaisesRegex(ValueError, "missing"):
                audit.inspect_file(root, "SKILL.md", expected)

    def test_symlinked_import_is_rejected(self) -> None:
        """The correct target bytes do not make a symlink an original regular file."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            target = root / "target"
            target.write_bytes(b"fixture")
            (root / "SKILL.md").symlink_to(target)
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                audit.inspect_file(root, "SKILL.md", audit.blob_hash(b"fixture"))

    def test_fenced_examples_are_not_missing_dependencies(self) -> None:
        """Keep real absent links visible without counting illustrative code blocks."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            (root / "real.md").write_text("fixture")
            (root / "folder").mkdir()
            text = "[real](real.md#part)\n[folder](folder/)\n```markdown\n[example](absent-example.md)\n```\n[missing](absent.md)\n[web](https://example.test)\n"
            links = audit.relative_links(root / "SKILL.md", text, root)
            self.assertEqual(
                [link["target"] for link in links],
                ["real.md#part", "folder/", "absent.md"],
            )
            self.assertEqual([link["exists"] for link in links], [True, True, False])

    def test_frontmatter_casing_is_not_normalized_away(self) -> None:
        """Record the real upstream display name separately from its folder."""
        values = audit.metadata(
            '---\nname: "Spreadsheets"\ndescription: "Local files"\n---\n'
        )
        self.assertEqual(values["name"], "Spreadsheets")
        with self.assertRaisesRegex(ValueError, "Missing"):
            audit.metadata("---\nname: missing-description\n---\n")

    def test_inventory_duplicates_and_missing_decisions_fail(self) -> None:
        """Counting lines alone cannot establish inventory correctness."""
        header = "## Complete skill inventory and decisions\n"
        row = "| `skill` | Purpose | **Exclude.** Concrete reason. |\n"
        self.assertEqual(set(audit.inventory_rows(header + row)), {"skill"})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            audit.inventory_rows(header + row + row)
        with self.assertRaisesRegex(ValueError, "Malformed"):
            audit.inventory_rows(header + "| `skill` | Purpose | |\n")

    def test_decision_requires_a_known_label_and_reason(self) -> None:
        """A new vague label or unexplained exclusion must not pass coverage."""
        self.assertEqual(audit.decision("**Adapt.** Use local tools."), "adapt")
        for text in [
            "**Exclude.**",
            "**Maybe.** Unsupported.",
            "Exclude because absent",
        ]:
            with (
                self.subTest(text=text),
                self.assertRaisesRegex(ValueError, "Malformed"),
            ):
                audit.decision(text)

    def test_reviews_require_evidence_risks_license_and_unique_directory(self) -> None:
        """A heading count alone cannot certify the recursive human assessment."""
        text = (
            "## `fixture` — 2 files\n\n"
            "- **Decision:** defer until tools exist.\n"
            "- **Evidence:** SKILL.md and helper.\n"
            "- **Fit and risks:** Missing native tool.\n"
            "- **License:** L0.\n"
        )
        self.assertEqual(audit.review_rows(text), {"fixture": (2, "defer")})
        with self.assertRaisesRegex(ValueError, "Duplicate review"):
            audit.review_rows(text + text)
        with self.assertRaisesRegex(ValueError, "Missing review License"):
            audit.review_rows(text.replace("- **License:** L0.\n", ""))

    def test_cross_report_mismatch_and_broken_links_are_rejected(self) -> None:
        """Exercise real report parsing and filesystem reads with changed evidence."""
        bundle = audit.REPOSITORY / "codex-skills"
        index = audit.build_index()
        inventory = audit.inventory_rows((bundle / "AUDIT.md").read_text())
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            root = Path(directory)
            for name in ["AUDIT.md", "SKILL-REVIEW.md", "ADOPTION-PLAN.md"]:
                (root / name).write_text((bundle / name).read_text())
            path = root / "SKILL-REVIEW.md"
            path.write_text(
                path.read_text().replace(
                    "`computer-use` — 1 file", "`computer-use` — 2 files"
                )
            )
            with self.assertRaisesRegex(ValueError, "count/decision mismatch"):
                audit.verify_deliverables(root, index["skills"], inventory)
            path.write_text((bundle / "SKILL-REVIEW.md").read_text())
            with self.assertRaisesRegex(ValueError, "Missing report link"):
                audit.verify_deliverables(root, index["skills"], inventory)


if __name__ == "__main__":
    unittest.main()
