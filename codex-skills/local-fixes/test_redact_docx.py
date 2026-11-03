"""Exercise the imported redactor without requiring document-rendering packages."""

from __future__ import annotations

import importlib.util
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from contextlib import nullcontext
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "documents/scripts/redact_docx.py"
HAS_LXML = importlib.util.find_spec("lxml") is not None


def load_redactor() -> ModuleType:
    """Import real production functions, stubbing only an unavailable XML dependency."""
    spec = importlib.util.spec_from_file_location("codex_redaction_under_test", SOURCE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    lxml = ModuleType("lxml")
    lxml.etree = ModuleType("lxml.etree")
    dependencies = nullcontext() if HAS_LXML else patch.dict(sys.modules, {"lxml": lxml})
    with dependencies:
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    return module


redactor = load_redactor()


class Paragraph:
    """Provide the redactor's XPath boundary using real standard-library XML nodes."""

    def __init__(self, segments: list[str]) -> None:
        self.element = ET.Element(redactor.qn("p"))
        for segment in segments:
            run = ET.SubElement(self.element, redactor.qn("r"))
            ET.SubElement(run, redactor.qn("t")).text = segment

    def xpath(self, expression: str, namespaces: dict[str, str]) -> list[ET.Element]:
        """Select text nodes without replacing any redaction or redistribution logic."""
        return self.element.findall(expression, namespaces)

    @property
    def nodes(self) -> list[ET.Element]:
        """Return the original text nodes, including empty runs."""
        return self.xpath(".//w:t", redactor.NS)

    @property
    def segments(self) -> list[str]:
        """Expose output segmentation as well as the combined text."""
        return [node.text or "" for node in self.nodes]


class RedactionTests(unittest.TestCase):
    """Protect paragraph content and unchanged length-preserving behavior."""

    def redact(
        self,
        segments: list[str],
        replacement: str | None = "[REDACTED]",
        *,
        preserve_length: bool = False,
        pattern: str = "Alice",
    ) -> tuple[Paragraph, int]:
        """Call the production paragraph implementation at the XML-node boundary."""
        paragraph = Paragraph(segments)
        rules = [redactor.RedactionRule(re.compile(pattern), "fixture")]
        count = redactor._apply_rules_to_paragraph(
            paragraph, rules, "█", replacement, preserve_length
        )
        return paragraph, count

    def test_expanded_single_run_keeps_unrelated_suffix(self) -> None:
        """Reproduce the reported loss of the debt amount."""
        paragraph, count = self.redact(["Alice owes 100"])
        self.assertEqual(paragraph.segments, ["[REDACTED] owes 100"])
        self.assertEqual(count, 1)

    def test_expanded_cross_run_match_keeps_every_character(self) -> None:
        """A match may span differently formatted Word runs."""
        paragraph, count = self.redact(["Al", "ice owes ", "100"])
        self.assertEqual("".join(paragraph.segments), "[REDACTED] owes 100")
        self.assertEqual(len(paragraph.nodes), 3)
        self.assertEqual(count, 1)

    def test_expansion_can_exceed_the_original_paragraph(self) -> None:
        """The final node must retain expansion even when originally empty."""
        paragraph, _ = self.redact(["Alice", ""], replacement="R" * 200)
        self.assertEqual("".join(paragraph.segments), "R" * 200)
        self.assertEqual(len(paragraph.nodes), 2)

    def test_multiple_unicode_expansions_keep_suffix_and_match_count(self) -> None:
        """Growth is measured as text characters, not encoded bytes."""
        paragraph, count = self.redact(
            ["Alice met ", "Alice — 金額 100"], replacement="[匿名化済み]"
        )
        self.assertEqual("".join(paragraph.segments), "[匿名化済み] met [匿名化済み] — 金額 100")
        self.assertEqual(count, 2)

    def test_shorter_replacement_clears_surplus_runs(self) -> None:
        """Shrinking and deleting matches must not leave original text behind."""
        for replacement in ["X", ""]:
            with self.subTest(replacement=replacement):
                paragraph, count = self.redact(["Ali", "ce", " owes 100"], replacement)
                self.assertEqual("".join(paragraph.segments), replacement + " owes 100")
                self.assertEqual(count, 1)
                paragraph, _ = self.redact(["Ali", "ce"], replacement)
                self.assertEqual(paragraph.segments, [replacement, ""])

    def test_equal_length_replacement_preserves_segmentation(self) -> None:
        """The existing run boundaries remain stable when text length is unchanged."""
        paragraph, _ = self.redact(["Ali", "ce owes 100"], replacement="XXXXX")
        self.assertEqual(paragraph.segments, ["XXX", "XX owes 100"])

    def test_default_mask_preserves_length_and_run_boundaries(self) -> None:
        """The default layout-preserving route must remain unchanged."""
        paragraph, _ = self.redact(["Ali", "ce owes 100"], None, preserve_length=True)
        self.assertEqual(paragraph.segments, ["███", "██ owes 100"])

    def test_custom_length_preserving_replacement_still_repeats(self) -> None:
        """Custom labels continue to repeat or truncate to match length."""
        paragraph, _ = self.redact(["Alice owes 100"], "XY", preserve_length=True)
        self.assertEqual(paragraph.segments, ["XYXYX owes 100"])

    def test_no_match_does_not_modify_nodes(self) -> None:
        """Unrelated paragraphs retain text and attributes exactly."""
        paragraph = Paragraph(["Bob owes 100", ""])
        before = ET.tostring(paragraph.element)
        count = redactor._apply_rules_to_paragraph(
            paragraph, [redactor.RedactionRule(re.compile("Alice"), "fixture")],
            "█", "[REDACTED]", False,
        )
        self.assertEqual(count, 0)
        self.assertEqual(ET.tostring(paragraph.element), before)

    def test_empty_paragraphs_are_unchanged(self) -> None:
        """Absent and empty text nodes remain valid inputs."""
        for segments in [[], [""], ["", ""]]:
            with self.subTest(segments=segments):
                paragraph, count = self.redact(segments)
                self.assertEqual(paragraph.segments, segments)
                self.assertEqual(count, 0)

    def test_expansion_preserves_word_whitespace_attributes(self) -> None:
        """Leading and trailing spaces must survive Word's XML whitespace handling."""
        paragraph, _ = self.redact(["Alice", " owes 100 "], " [REDACTED] ")
        self.assertEqual("".join(paragraph.segments), " [REDACTED]  owes 100 ")
        self.assertEqual(paragraph.nodes[0].get(redactor.XML_SPACE), "preserve")
        self.assertEqual(paragraph.nodes[-1].get(redactor.XML_SPACE), "preserve")

    @unittest.skipUnless(HAS_LXML, "lxml unavailable; full ZIP/XML execution not tested")
    def test_docx_round_trip_keeps_source_and_expanded_document_text(self) -> None:
        """Exercise actual lxml and ZIP processing when the dependency is installed."""
        with tempfile.TemporaryDirectory(prefix="redaction-test-", dir="/tmp/opencode") as directory:
            source = Path(directory) / "input.docx"
            output = Path(directory) / "output.docx"
            document = (
                f'<w:document xmlns:w="{redactor.W_NS}"><w:body><w:p>'
                '<w:r><w:t>Alice owes 100</w:t></w:r>'
                '</w:p></w:body></w:document>'
            )
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("word/document.xml", document)
                archive.writestr("unchanged.bin", b"synthetic unrelated content")
            original = source.read_bytes()
            stats = redactor.redact_docx(
                source, output, [redactor.RedactionRule(re.compile("Alice"), "fixture")],
                "█", "[REDACTED]", False, False,
            )
            self.assertEqual(source.read_bytes(), original)
            with zipfile.ZipFile(output) as archive:
                root = ET.fromstring(archive.read("word/document.xml"))
                self.assertEqual(
                    "".join(node.text or "" for node in root.findall(".//w:t", redactor.NS)),
                    "[REDACTED] owes 100",
                )
                self.assertEqual(archive.read("unchanged.bin"), b"synthetic unrelated content")
            self.assertEqual(stats["matches_redacted"], 1)


if __name__ == "__main__":
    unittest.main()
