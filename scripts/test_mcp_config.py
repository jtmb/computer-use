#!/usr/bin/env python3
"""Exercise MCP file configuration with synthetic JSONC and no live profile."""

from __future__ import annotations

import importlib.util
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from types import ModuleType
from typing import Any
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / "scripts/mcp_runtime.py"


def load_runtime() -> ModuleType:
    """Load the actual source without invoking provisioning or the CLI."""
    spec = importlib.util.spec_from_file_location("mcp_config_tests", RUNTIME)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class McpConfigTests(unittest.TestCase):
    """Keep all files, mutations and CLI inputs in task-owned scratch."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="mcp-config-", dir="/tmp/opencode")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.config = self.root / "opencode.jsonc"
        self.runtime = load_runtime()

    def write(self, text: str) -> None:
        """Replace only this test's synthetic input."""
        self.config.write_text(text, encoding="utf-8")

    def cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        """Run the real CLI on this test's synthetic file, never a live profile."""
        return subprocess.run(
            [sys.executable, "-B", str(RUNTIME), "config", "--config", str(self.config), *arguments],
            capture_output=True, text=True, timeout=5,
            env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"},
        )

    def test_jsonc_comments_trailing_commas_and_string_literals(self) -> None:
        self.write(r'''{
          // literal comment markers and escaped quotes must remain strings
          "url": "https://example.invalid/a//b/*literal*/",
          "quoted": "before \" // after",
          "nested": {"items": [1, true, null, /* gap */],},
          "unicode": "λ雪",
        } // end''')
        self.assertEqual(self.runtime.load_config(self.config), {
            "url": "https://example.invalid/a//b/*literal*/",
            "quoted": 'before " // after', "nested": {"items": [1, True, None]}, "unicode": "λ雪",
        })

    def test_strict_json_and_empty_containers(self) -> None:
        for text in ['{"a": {}, "b": []}', '{"a": 1/* gap */, "b": 2,}', '{"a": 1, //CR\r"b": 2}']:
            with self.subTest(text=text):
                self.write(text)
                self.assertIsInstance(self.runtime.load_config(self.config), dict)

    def test_ambiguous_or_invalid_jsonc_is_rejected_without_body_echo(self) -> None:
        inputs = [
            '{"privateFixture": 1, "privateFixture": 2}',
            '{"x":{"a":1,"\\u0061":2}}',
            '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}',
            '{"x":1/* unterminated}', '{"x":"unterminated}',
            '{"x": 1/* gap */2}', '{"x": tru/* gap */e}',
            '{,}', '{"x":[,]}', '{"x":[1,,]}', '{"x":,}',
            '{"x":1,,}', '{"x":1} {"y":2}', '{"x": "bad\\q"}',
            '{"x": [1,}', '{"x":1}\v', '[1,2,]', 'null',
        ]
        for text in inputs:
            with self.subTest(text=text):
                self.write(text)
                with self.assertRaises(self.runtime.McpRuntimeError) as caught:
                    self.runtime.load_config(self.config)
                self.assertNotIn("privateFixture", str(caught.exception))

    def test_invalid_utf8_and_depth_are_controlled_errors(self) -> None:
        for data in [b'{"x":"\xff"}', ('{"x":' + '[' * 150 + '0' + ']' * 150 + '}').encode()]:
            self.config.write_bytes(data)
            with self.assertRaises(self.runtime.McpRuntimeError):
                self.runtime.load_config(self.config)

    def test_actual_global_cli_verifies_without_writing_or_adding_chatgpt(self) -> None:
        data = {"model": "fixture/model", "mcp": {"servers": self.runtime.global_mcp_servers()}}
        data["mcp"]["servers"]["unrelated"] = {"type": "remote", "url": "https://example.invalid/mcp"}
        self.write("// retained synthetic comment\n" + json.dumps(data)[:-1] + ',}\n')
        before = self.config.read_bytes(), self.config.stat()
        result = self.cli("--scope", "global")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.config.read_bytes(), before[0])
        self.assertEqual(self.config.stat().st_ino, before[1].st_ino)
        self.assertEqual(self.config.stat().st_mtime_ns, before[1].st_mtime_ns)
        self.assertEqual(list(self.root.iterdir()), [self.config])
        self.assertNotIn("chatgpt", self.runtime.load_config(self.config)["mcp"]["servers"])

    def test_project_cli_is_verification_only_and_strict(self) -> None:
        data = {"mcp": {"servers": self.runtime.mcp_servers("native")}}
        self.write(json.dumps(data))
        before = self.config.read_bytes()
        self.assertEqual(self.cli("--scope", "project").returncode, 0)
        result = self.cli("--scope", "project", "--apply")
        self.assertEqual(result.returncode, 1)
        self.assertIn("verification-only", result.stderr)
        self.assertEqual(self.config.read_bytes(), before)
        data["mcp"]["servers"]["unexpected"] = {"type": "local", "command": ["false"]}
        self.write(json.dumps(data))
        self.assertEqual(self.cli("--scope", "project").returncode, 1)

    def test_cli_malformed_input_has_no_traceback_or_content_echo(self) -> None:
        self.write('{"privateFixture":')
        result = self.cli("--scope", "global")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("Traceback", result.stderr)
        self.assertNotIn("privateFixture", result.stdout + result.stderr)

    def test_global_preview_is_nonsecret_and_has_no_file_effects(self) -> None:
        original = b'// fixture\n{"model":"fixture/model", "mcp":{"servers":{}}}\n'
        self.config.write_bytes(original)
        before = self.config.stat()
        result = self.cli("--scope", "global", "--preview")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["current_sha256"], hashlib.sha256(original).hexdigest())
        self.assertTrue(report["changed"])
        self.assertFalse(report["applied"])
        self.assertNotIn("fixture/model", result.stdout)
        self.assertEqual(self.config.read_bytes(), original)
        self.assertEqual(self.config.stat().st_ino, before.st_ino)
        self.assertEqual(list(self.root.iterdir()), [self.config])

    def test_global_apply_requires_a_matching_preview_digest(self) -> None:
        self.write('{"mcp":{"servers":{}}}')
        original = self.config.read_bytes()
        for arguments in [("--apply",), ("--apply", "--expect-sha256", "0" * 64)]:
            result = self.cli("--scope", "global", *arguments)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertEqual(self.config.read_bytes(), original)
            self.assertEqual(list(self.root.iterdir()), [self.config])

    def test_global_apply_preserves_unrelated_text_and_supports_exact_restore(self) -> None:
        prefix = '// preserve top comment\n{\n  "model" : "fixture/model",\n  "mcp" : '
        suffix = ',\n  "skills": ["./fixture-skills",], // preserve tail\n}\n'
        mcp = {"servers": {"basic-memory": {"command": ["retired-fixture"]},
                           "chatgpt": {"disabled": True, "command": ["explicit-fixture"]},
                           "custom": {"type": "remote", "url": "https://example.invalid/mcp"}}}
        original = (prefix + json.dumps(mcp) + suffix).encode()
        self.config.write_bytes(original)
        self.config.chmod(0o640)
        digest = hashlib.sha256(original).hexdigest()
        result = self.cli("--scope", "global", "--apply", "--expect-sha256", digest)
        self.assertEqual(result.returncode, 0, result.stderr)
        applied = json.loads(result.stdout)
        self.assertTrue(applied["applied"])
        self.assertEqual(Path(applied["backup"]).read_bytes(), original)
        self.assertTrue(Path(applied["receipt"]).is_file())
        updated = self.config.read_bytes()
        self.assertTrue(updated.startswith(prefix.encode()))
        self.assertTrue(updated.endswith(suffix.encode()))
        self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o640)
        value = self.runtime.load_config(self.config)
        self.assertEqual(value["mcp"]["servers"]["chatgpt"], mcp["servers"]["chatgpt"])
        self.assertEqual(value["mcp"]["servers"]["custom"], mcp["servers"]["custom"])
        self.assertNotIn("basic-memory", value["mcp"]["servers"])
        self.runtime.verify_global_mcp_servers(value)
        current_digest = hashlib.sha256(updated).hexdigest()
        args = ("--scope", "global", "--restore-receipt", applied["receipt"], "--expect-sha256", current_digest)
        preview = self.cli(*args)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertFalse(json.loads(preview.stdout)["applied"])
        self.assertEqual(self.config.read_bytes(), updated)
        restored = self.cli(*args, "--apply")
        self.assertEqual(restored.returncode, 0, restored.stderr)
        restored_report = json.loads(restored.stdout)
        self.assertTrue(restored_report["applied"])
        self.assertEqual(self.config.read_bytes(), original)
        self.assertEqual(Path(restored_report["backup"]).read_bytes(), updated)

    def test_canonical_global_apply_is_an_exact_noop(self) -> None:
        data = {"mcp": {"servers": self.runtime.global_mcp_servers()}, "model": "fixture/model"}
        original = ("// exact no-op\n" + json.dumps(data)[:-1] + ",}\n").encode()
        self.config.write_bytes(original)
        before = self.config.stat()
        result = self.cli("--scope", "global", "--apply", "--expect-sha256", hashlib.sha256(original).hexdigest())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)["changed"])
        self.assertEqual(self.config.read_bytes(), original)
        self.assertEqual(self.config.stat().st_ino, before.st_ino)
        self.assertEqual(self.config.stat().st_mtime_ns, before.st_mtime_ns)
        self.assertEqual(list(self.root.iterdir()), [self.config])

    def test_project_preview_or_restore_cannot_acquire_write_authority(self) -> None:
        self.write(json.dumps({"mcp": {"servers": self.runtime.mcp_servers("native")}}))
        before = self.config.read_bytes()
        for args in [("--preview",), ("--restore-receipt", str(self.root / "missing-receipt"))]:
            result = self.cli("--scope", "project", *args)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(self.config.read_bytes(), before)
        self.assertEqual(list(self.root.iterdir()), [self.config])

    def test_apply_refuses_an_edit_between_normalization_and_transaction(self) -> None:
        self.write('{"model":"original-fixture","mcp":{"servers":{}}}')
        expected = hashlib.sha256(self.config.read_bytes()).hexdigest()
        changed = b'{"model":"concurrent-fixture","mcp":{"servers":{}}}'
        original_normalize = self.runtime.ensure_global_mcp_servers

        def normalize_then_edit(data: dict[str, Any]) -> None:
            original_normalize(data)
            self.config.write_bytes(changed)

        with patch.object(self.runtime, "ensure_global_mcp_servers", normalize_then_edit):
            with self.assertRaisesRegex(self.runtime.McpRuntimeError, "changed since preview"):
                self.runtime.configure_mcp_file(self.config, scope="global", apply=True, expected_sha256=expected)
        self.assertEqual(self.config.read_bytes(), changed)
        self.assertEqual(list(self.root.iterdir()), [self.config])

    def test_mcp_writer_cannot_change_a_different_top_level_setting(self) -> None:
        self.write('{"model":"fixture/model","mcp":{"servers":{}}}')
        original = self.config.read_bytes()
        value = self.runtime.load_config(self.config)
        value["model"] = "unexpected/change"
        with self.assertRaisesRegex(self.runtime.McpRuntimeError, "unrelated settings"):
            self.runtime.write_config(self.config, value, expected_sha256=hashlib.sha256(original).hexdigest())
        self.assertEqual(self.config.read_bytes(), original)
        self.assertEqual(list(self.root.iterdir()), [self.config])

    def test_conflicting_or_misrouted_preview_flags_cannot_enable_a_write(self) -> None:
        self.write('{"mcp":{"servers":{}}}')
        original = self.config.read_bytes()
        result = self.cli("--scope", "global", "--preview", "--apply")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(self.config.read_bytes(), original)
        target = self.root / "never-created-profile"
        result = subprocess.run([sys.executable, "-B", str(RUNTIME), "prepare", "--profile", "wsl2",
                                 "--profile-root", str(target), "--preview", "--apply"],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertFalse(target.exists())
        self.assertEqual(list(self.root.iterdir()), [self.config])

    def test_symlinked_file_and_ancestor_are_refused(self) -> None:
        self.write('{}')
        link = self.root / "linked.json"
        link.symlink_to(self.config)
        directory_link = self.root / "linked-directory"
        directory_link.symlink_to(self.root)
        for target in [link, directory_link / self.config.name]:
            with self.subTest(target=target), self.assertRaises(self.runtime.McpRuntimeError):
                self.runtime.load_config(target)

    def test_oversize_input_is_rejected_before_read(self) -> None:
        self.config.write_bytes(b' ' * (self.runtime.MAX_CONFIG_BYTES + 1))
        with self.assertRaises(self.runtime.McpRuntimeError):
            self.runtime.load_config(self.config)

    def test_growth_acquisition_is_capped_and_refused(self) -> None:
        self.write('{}')
        original_read = os.read
        acquired = 0
        grew = False

        def counted(descriptor: int, count: int) -> bytes:
            nonlocal acquired, grew
            if not grew:
                grew = True
                with self.config.open('ab') as output:
                    output.write(b' ' * (self.runtime.MAX_CONFIG_BYTES * 2))
            chunk = original_read(descriptor, count)
            acquired += len(chunk)
            return chunk

        with patch.object(self.runtime.os, "read", counted):
            with self.assertRaises(self.runtime.McpRuntimeError):
                self.runtime.load_config(self.config)
        self.assertTrue(grew, "the production descriptor read must exercise the growth boundary")
        self.assertGreater(acquired, self.runtime.MAX_CONFIG_BYTES)
        self.assertLessEqual(acquired, self.runtime.MAX_CONFIG_BYTES + 1)

    def test_same_byte_inode_replacement_during_read_is_refused(self) -> None:
        self.write('{}')
        original_read = os.read
        swapped = False

        def replaced(descriptor: int, count: int) -> bytes:
            nonlocal swapped
            content = original_read(descriptor, count)
            if not swapped:
                swapped = True
                temporary = self.root / "replacement"
                temporary.write_bytes(b'{}')
                temporary.replace(self.config)
            return content

        with patch.object(self.runtime.os, "read", replaced):
            with self.assertRaises(self.runtime.McpRuntimeError):
                self.runtime.load_config(self.config)
        self.assertTrue(swapped)

    def test_ancestor_swap_to_symlink_is_refused_before_reading(self) -> None:
        directory = self.root / "selected"
        directory.mkdir()
        selected = directory / "opencode.jsonc"
        selected.write_bytes(b'{}')
        moved = self.root / "moved"
        original_open, original_read = os.open, os.read
        swapped = False
        acquired = 0

        def opened(filename: Any, flags: int, *args: Any, **kwargs: Any) -> int:
            nonlocal swapped
            if not swapped and Path(filename) in (selected, Path(selected.name)):
                directory.rename(moved)
                directory.symlink_to(moved)
                swapped = True
            return original_open(filename, flags, *args, **kwargs)

        def counted(descriptor: int, count: int) -> bytes:
            nonlocal acquired
            content = original_read(descriptor, count)
            acquired += len(content)
            return content

        with patch.object(self.runtime.os, "open", opened), patch.object(self.runtime.os, "read", counted):
            with self.assertRaises(self.runtime.McpRuntimeError):
                self.runtime.load_config(selected)
        self.assertTrue(swapped)
        self.assertEqual(acquired, 0, "a parent symlink must not be followed before the final refusal")

    def test_missing_helper_is_a_controlled_runtime_error(self) -> None:
        self.write('{}')
        with patch.object(self.runtime, "SCRIPT_ROOT", self.root):
            with self.assertRaisesRegex(self.runtime.McpRuntimeError, "helper is unavailable"):
                self.runtime.load_config(self.config)

    def test_fifo_swap_does_not_wait_for_a_writer(self) -> None:
        self.write('{}')
        program = '''
import importlib.util, os, pathlib, sys
spec = importlib.util.spec_from_file_location("runtime_fifo", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
target = pathlib.Path(sys.argv[2])
original = pathlib.Path.lstat
swapped = False
def swap(path, *args, **kwargs):
    global swapped
    result = original(path, *args, **kwargs)
    if path == target and not swapped:
        swapped = True
        path.unlink()
        os.mkfifo(path)
    return result
pathlib.Path.lstat = swap
try:
    m.load_config(target)
except m.McpRuntimeError:
    sys.exit(0)
sys.exit(3)
'''
        result = subprocess.run([sys.executable, "-B", "-c", program, str(RUNTIME), str(self.config)],
                                capture_output=True, text=True, timeout=2)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(stat.S_ISFIFO(self.config.lstat().st_mode))


if __name__ == "__main__":
    unittest.main()
