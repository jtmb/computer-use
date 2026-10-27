"""Validate the project-owned Tailscale deployment skill bundle."""

from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).parent.parent
SKILLS = ROOT / ".opencode" / "skills"
BUNDLE = SKILLS / "tailscale-deployment"
SKILL = BUNDLE / "SKILL.md"
GUIDE = BUNDLE / "README.md"
OPERATIONS = BUNDLE / "references" / "operations.md"
CATALOG = SKILLS / "README.md"
EXPECTED_TAGS = {
    "docker",
    "kubernetes",
    "tailscale",
    "ingress",
    "serve",
    "opencode",
    "security",
}


def read_frontmatter(path: Path) -> tuple[dict[str, str], dict[str, str], str]:
    """Read the deliberately small string-only frontmatter used by this skill."""
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(?P<frontmatter>.*?)\n---\n", text, re.DOTALL)
    if match is None:
        raise AssertionError(f"{path} must start with YAML frontmatter")

    fields: dict[str, str] = {}
    metadata: dict[str, str] = {}
    in_metadata = False
    for line in match.group("frontmatter").splitlines():
        if line.startswith("  "):
            if not in_metadata:
                raise AssertionError("Indented frontmatter is only valid in metadata")
            key, separator, value = line.strip().partition(":")
            if not separator:
                raise AssertionError(f"Invalid metadata entry: {line}")
            metadata[key] = value.strip().strip('"')
            continue

        key, separator, value = line.partition(":")
        if not separator:
            raise AssertionError(f"Invalid frontmatter entry: {line}")
        in_metadata = key == "metadata"
        fields[key] = value.strip()

    return fields, metadata, text[match.end() :]


class TailscaleSkillTests(unittest.TestCase):
    def test_frontmatter_matches_skill_name_and_metadata_schema(self) -> None:
        fields, metadata, _ = read_frontmatter(SKILL)

        self.assertEqual(set(fields), {"name", "description", "metadata"})
        self.assertEqual(fields["name"], BUNDLE.name)
        self.assertRegex(fields["name"], r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
        self.assertGreater(len(fields["description"]), 0)
        self.assertLessEqual(len(fields["description"]), 1024)
        self.assertIn("Use when", fields["description"])
        self.assertEqual(
            set(metadata), {"schema-version", "category", "tags"}
        )
        self.assertEqual(metadata["schema-version"], "1")
        self.assertRegex(metadata["category"], r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

        tags = metadata["tags"].split(",")
        self.assertEqual(len(tags), len(set(tags)))
        self.assertGreaterEqual(len(tags), 3)
        self.assertLessEqual(len(tags), 8)
        for tag in tags:
            self.assertRegex(tag, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
        self.assertEqual(set(tags), EXPECTED_TAGS)

    def test_catalog_defines_category_and_matches_metadata(self) -> None:
        fields, metadata, _ = read_frontmatter(SKILL)
        catalog = CATALOG.read_text(encoding="utf-8")
        category_section = re.search(
            r"^## Categories\s+(?P<body>.*?)(?=^## |\Z)",
            catalog,
            re.MULTILINE | re.DOTALL,
        )
        self.assertIsNotNone(category_section)
        assert category_section is not None
        self.assertRegex(
            category_section.group("body"),
            rf"(?m)^- `{re.escape(metadata['category'])}`\s+-\s+",
        )

        rows = [
            line
            for line in catalog.splitlines()
            if line.startswith("|") and "tailscale-deployment" in line
        ]
        self.assertEqual(len(rows), 1)
        cells = [cell.strip() for cell in rows[0].strip("|").split("|")]
        self.assertEqual(cells[1], metadata["category"])
        self.assertEqual(cells[2], metadata["tags"])
        self.assertIn("./tailscale-deployment/SKILL.md", cells[0])
        self.assertIn("./tailscale-deployment/README.md", cells[4])
        self.assertIn(fields["name"], cells[0])

    def test_bundle_relative_markdown_links_resolve(self) -> None:
        for source in (
            ROOT,
            ROOT / ".opencode",
            SKILLS,
            BUNDLE,
            BUNDLE / "references",
            SKILL,
            GUIDE,
            OPERATIONS,
        ):
            self.assertFalse(source.is_symlink(), f"Symlink source is not allowed: {source}")

        for markdown_file in (SKILL, GUIDE, OPERATIONS):
            text = markdown_file.read_text(encoding="utf-8")
            for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
                parsed = urlsplit(target)
                if parsed.scheme or parsed.netloc or not parsed.path:
                    continue
                link_path = markdown_file.parent / parsed.path
                self.assertFalse(link_path.is_symlink(), f"Symlink link target: {target}")
                resolved = link_path.resolve()
                self.assertTrue(
                    resolved.is_relative_to(BUNDLE.resolve()),
                    f"Relative link escapes the bundle: {markdown_file}: {target}",
                )
                self.assertTrue(resolved.is_file(), f"Broken link: {target}")

    def test_user_guide_covers_usage_and_rollback_sections(self) -> None:
        guide = GUIDE.read_text(encoding="utf-8")
        for heading in (
            "## How to request it",
            "## Prerequisites",
            "## Worked workflow",
            "## Verification and limitations",
            "## Troubleshooting",
            "## Rollback",
            "## Safety and approval",
        ):
            with self.subTest(heading=heading):
                self.assertIn(heading, guide)

        for phrase in (
            "not loaded automatically",
            "not executed",
            "config --quiet",
            "second tailnet device",
            "unauthorized tailnet identity",
            "previously reviewed",
            "bootstrap administrator",
            "application deploy identity",
            "literal `/web` route",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), guide.lower())

    def test_security_boundaries_are_documented(self) -> None:
        content = "\n".join(
            path.read_text(encoding="utf-8") for path in (SKILL, GUIDE, OPERATIONS)
        )
        required_phrases = (
            "tailnet-only",
            "Funnel",
            "OpenTunnel",
            "127.0.0.1",
            "loopback is not the host",
            "hostNetwork",
            "NET_ADMIN",
            "0600",
            "--apply",
            "transcripts",
            "config --quiet",
            "do not source",
            "bootstrap administrator",
            "application deploy identity",
            "redacted diff",
            "second tailnet device",
            "unauthorized",
            "Google",
            "pause",
            "Bortus MCP",
        )
        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), content.lower())

        self.assertIn(
            "Preserve OpenCode's application authentication", content
        )
        self.assertIn("never enable tailscale funnel or opentunnel", content.lower())
        self.assertNotIn("docker run", content.lower())
        self.assertNotIn("opencode pair --remote", content.lower())


if __name__ == "__main__":
    unittest.main()
