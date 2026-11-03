#!/usr/bin/env python3
"""Verify bounded, byte-preserving edits to synthetic JSONC strings."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


HELPER = Path(__file__).resolve().with_name("setup-opencode-jsonc.py")
SPEC = importlib.util.spec_from_file_location("jsonc_config_edit", HELPER)
assert SPEC is not None and SPEC.loader is not None
JSONC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(JSONC)


class JsoncConfigEditTests(unittest.TestCase):
    """Exercise the pure edit API without touching profile or config files."""

    def test_replacement_changes_only_decoded_top_level_value_span(self) -> None:
        source = (
            "// preface\r\n"
            "{\r\n"
            '  "before": {"mcp": 0}, /* preserve before */\r\n'
            '  "m\\u0063p" /* preserve key comment */ : /* preserve boundary */ '
            '{"old": 1, /* owned comment */ "nested": {"x": "/* literal */ } ] //"}}, '
            "// preserve suffix\r\n"
            '  "after": [1, {"mcp": 2}],\r\n'
            "} // preserve tail\r\n"
        )
        original_value = '{"old": 1, /* owned comment */ "nested": {"x": "/* literal */ } ] //"}}'
        replacement = {"servers": [{"type": "local"}]}
        replacement_text = '{"servers":[{"type":"local"}]}'

        updated = JSONC.replace_top_level(source, "mcp", replacement)

        self.assertEqual(updated, source.replace(original_value, replacement_text))
        self.assertEqual(JSONC.parse_jsonc(updated)["mcp"], replacement)
        self.assertEqual(JSONC.parse_jsonc(updated)["before"]["mcp"], 0)
        self.assertEqual(JSONC.parse_jsonc(updated)["after"][1]["mcp"], 2)

    def test_semantic_noop_preserves_all_source_bytes_and_booleans_are_distinct(self) -> None:
        source = '{"mcp": /* keep */ {"a": 1, "b": [true]}, // outer\n "other": 0,}'

        unchanged = JSONC.replace_top_level(source, "mcp", {"b": [True], "a": 1.0})
        changed = JSONC.replace_top_level(source, "mcp", {"a": 1, "b": [1]})

        self.assertIs(unchanged, source)
        self.assertNotEqual(changed, source)
        self.assertIs(type(JSONC.parse_jsonc(changed)["mcp"]["b"][0]), int)
        self.assertIn("// outer\n", changed)

    def test_missing_property_insertion_preserves_comments_and_trailing_comma(self) -> None:
        cases = [
            (
                '{"existing": 1 /* keep block */}',
                '{"existing": 1, "added": [2,3] /* keep block */}',
                [2, 3],
            ),
            (
                '{"existing": 1, // keep line\r\n}',
                '{"existing": 1, "added": true, // keep line\r\n}',
                True,
            ),
            ('{/* empty */}', '{/* empty */ "added": "λ"}', "λ"),
            ('{// empty\r\n}', '{// empty\r\n "added": 4}', 4),
        ]
        for source, expected, value in cases:
            with self.subTest(source=source):
                updated = JSONC.replace_top_level(source, "added", value)
                self.assertEqual(updated, expected)
                self.assertEqual(JSONC.parse_jsonc(updated)["added"], value)

    def test_full_source_validation_rejects_ambiguous_or_unbounded_input(self) -> None:
        invalid_inputs = [
            '{"mcp": 1, "mcp": 2}',
            '{"mcp": {"x": 1, "\\u0078": 2}}',
            '{"mcp": NaN}',
            '{"mcp": 1e999}',
            '{"mcp": 1/* unterminated}',
            '{"mcp": 1,,}',
            " " * (JSONC.MAX_CHARACTERS + 1),
            '{"mcp":' + "[" * JSONC.MAX_DEPTH + "0" + "]" * JSONC.MAX_DEPTH + "}",
        ]
        for source in invalid_inputs:
            with self.subTest(prefix=source[:32]), self.assertRaises(ValueError):
                JSONC.replace_top_level(source, "mcp", {"servers": {}})

    def test_generated_value_obeys_finite_size_and_depth_limits(self) -> None:
        deeply_nested: object = None
        for _ in range(JSONC.MAX_DEPTH):
            deeply_nested = [deeply_nested]
        excessively_nested: object = None
        for _ in range(2 * JSONC.MAX_DEPTH):
            excessively_nested = [excessively_nested]

        invalid_values = [
            float("inf"), "x" * JSONC.MAX_CHARACTERS, deeply_nested, excessively_nested,
        ]
        for value in invalid_values:
            with self.subTest(value_type=type(value).__name__), self.assertRaises(ValueError):
                JSONC.replace_top_level("{}", "mcp", value)

    def test_root_must_be_an_object_and_key_must_be_a_string(self) -> None:
        with self.assertRaisesRegex(ValueError, "root must be an object"):
            JSONC.replace_top_level("[]", "mcp", {})
        with self.assertRaisesRegex(TypeError, "key must be a string"):
            JSONC.replace_top_level("{}", 1, {})


if __name__ == "__main__":
    unittest.main()
