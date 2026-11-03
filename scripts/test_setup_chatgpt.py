"""Exercise ChatGPT config setup with isolated files and fake command runners."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shlex
import stat
import subprocess
import sys
import tempfile
import unittest
from typing import Mapping


SPEC = importlib.util.spec_from_file_location("setup_chatgpt", Path(__file__).with_name("setup-chatgpt.py"))
assert SPEC is not None and SPEC.loader is not None
setup = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = setup
SPEC.loader.exec_module(setup)

TEST_FIXTURES = Path("/tmp/opencode/testfixtures")
RecordedCall = tuple[list[str], Path, Mapping[str, str] | None, int]


class ChatGPTSetupTests(unittest.TestCase):
    """Guard preview, preservation, opt-in, path safety, and apply failure behavior."""

    @classmethod
    def setUpClass(cls) -> None:
        """Provide the explicitly approved root for ephemeral test fixtures."""
        TEST_FIXTURES.mkdir(parents=True, exist_ok=True)

    def fixture(self, config_text: str | None = None) -> tuple[Path, Path, bytes]:
        """Create a synthetic checkout and strict-JSON source config in testfixtures."""
        temporary = tempfile.TemporaryDirectory(prefix="setup-chatgpt-", dir=TEST_FIXTURES)
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "global").mkdir()
        (root / "tools" / "chatgpt-connector").mkdir(parents=True)
        (root / "scripts").mkdir()
        (root / "tools" / "chatgpt-connector" / "package.json").write_text("{}\n", encoding="utf-8")
        (root / "tools" / "chatgpt-connector" / "package-lock.json").write_text("{}\n", encoding="utf-8")
        (root / "tools" / "chatgpt-connector" / "server.ts").write_text("export default {}\n", encoding="utf-8")
        launcher = root / "scripts" / "chatgpt-mcp.sh"
        launcher.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        launcher.chmod(0o755)
        target = root / "global" / "opencode.jsonc"
        if config_text is None:
            config_text = json.dumps(
                {
                    "$schema": "https://opencode.ai/config.json",
                    "model": "example/model",
                    "plugins": ["unrelated-plugin"],
                    "mcp": {
                        "servers": {
                            "github": {
                                "type": "local",
                                "command": ["/fixture/github-mcp.sh"],
                                "disabled": False,
                            }
                        }
                    },
                    "agents": {"build": {"permissions": [{"action": "shell", "effect": "ask"}]}},
                },
                indent=2,
            ) + "\n"
        target.write_text(config_text, encoding="utf-8")
        return root, target, target.read_bytes()

    def fake_runner(self, calls: list[RecordedCall], status: int = 0) -> setup.CommandRunner:
        """Return a fake command runner that records calls without launching processes."""

        def run(
            command: list[str],
            cwd: Path,
            environment: Mapping[str, str] | None,
            timeout: int,
        ) -> int:
            """Record the attempted executable and return its synthetic status."""
            calls.append((command, cwd, environment, timeout))
            return status

        return run

    def test_preview_has_no_filesystem_or_command_side_effects(self) -> None:
        """Preview keeps bytes and filesystem entries unchanged and invokes no helpers."""
        root, target, original = self.fixture()
        before_names = sorted(path.name for path in target.parent.iterdir())

        self.assertEqual(setup.resolve_config_target(None, root), target)
        plan = setup.prepare(root, str(target))
        setup.print_plan(plan, applying=False)

        self.assertTrue(plan.changed)
        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(sorted(path.name for path in target.parent.iterdir()), before_names)
        self.assertFalse(list(target.parent.glob("*.backup.*")))

    def test_opt_in_merge_preserves_unrelated_values_and_is_idempotent(self) -> None:
        """Apply adds only canonical entries, backs up exact bytes, and skips a second rewrite."""
        root, target, original = self.fixture()
        calls: list[RecordedCall] = []
        plan = setup.prepare(root, str(target))
        result = setup.apply_plan(plan, install_dependencies=False, command_runner=self.fake_runner(calls))

        self.assertTrue(result.changed)
        self.assertTrue(result.preflight_verified)
        self.assertFalse(result.dependencies_installed)
        self.assertIsNotNone(result.backup)
        assert result.backup is not None
        self.assertEqual(result.backup.read_bytes(), original)
        readback = setup.parse_strict_json(target.read_bytes(), target)
        self.assertEqual(readback["$schema"], "https://opencode.ai/config.json")
        self.assertEqual(readback["model"], "example/model")
        self.assertEqual(readback["agents"], {"build": {"permissions": [{"action": "shell", "effect": "ask"}]}})
        self.assertEqual(readback["plugins"][:1], ["unrelated-plugin"])
        self.assertEqual(readback["plugins"][1], (root / "tools" / "chatgpt-connector").as_uri())
        self.assertEqual(readback["mcp"]["servers"]["github"]["command"], ["/fixture/github-mcp.sh"])
        self.assertEqual(
            readback["mcp"]["servers"]["chatgpt"],
            {
                "type": "local",
                "command": [str(root / "scripts" / "chatgpt-mcp.sh")],
                "timeout": {"startup": 30000},
                "codemode": False,
                "disabled": False,
            },
        )
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], [str(root / "scripts" / "chatgpt-mcp.sh"), "--verify-only"])
        self.assertNotIn("OPENAI_API_KEY", calls[0][2])

        changed_content = target.read_bytes()
        changed_identity = target.stat().st_ino, target.stat().st_mtime_ns
        backup_count = len(list(target.parent.glob("*.backup.*")))
        second = setup.apply_plan(
            setup.prepare(root, str(target)),
            install_dependencies=False,
            command_runner=self.fake_runner(calls),
        )
        self.assertFalse(second.changed)
        self.assertIsNone(second.backup)
        self.assertEqual(target.read_bytes(), changed_content)
        self.assertEqual((target.stat().st_ino, target.stat().st_mtime_ns), changed_identity)
        self.assertEqual(len(list(target.parent.glob("*.backup.*"))), backup_count)

    def test_conflicting_existing_chatgpt_server_is_never_overwritten(self) -> None:
        """A noncanonical server entry stops before install, preflight, or backup."""
        root, target, _ = self.fixture(
            '{"mcp":{"servers":{"chatgpt":{"type":"local","command":["/other.sh"]}}}}\n'
        )
        calls: list[RecordedCall] = []
        original = target.read_bytes()
        with self.assertRaisesRegex(setup.SetupError, "differs from the canonical"):
            setup.prepare(root, str(target))
        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(calls, [])
        self.assertFalse(list(target.parent.glob("*.backup.*")))

    def test_duplicate_or_conflicting_plugin_entry_is_refused(self) -> None:
        """Equivalent local paths are not silently normalized into duplicate plugins."""
        root, target, _ = self.fixture()
        plugin_uri = (root / "tools" / "chatgpt-connector" / "server.ts").as_uri()
        current = setup.parse_strict_json(target.read_bytes(), target)
        current["plugins"].extend([plugin_uri, plugin_uri])
        target.write_text(json.dumps(current), encoding="utf-8")
        with self.assertRaisesRegex(setup.SetupError, "multiple ChatGPT plugin entries"):
            setup.prepare(root, str(target))

        current["plugins"] = ["unrelated-plugin", {"package": plugin_uri, "options": {"enabled": True}}]
        target.write_text(json.dumps(current), encoding="utf-8")
        with self.assertRaisesRegex(setup.SetupError, "conflicting ChatGPT plugin entry"):
            setup.prepare(root, str(target))

    def test_jsonc_comments_trailing_commas_and_duplicate_keys_fail_closed(self) -> None:
        """Comments, trailing commas, and duplicate keys are never stripped or accepted."""
        for contents, message in (
            ('{"model":"x" // comment\n}', "strict JSON; JSONC comments"),
            ('{"model":"x",}', "strict JSON; JSONC comments"),
            ('{"model":"x","model":"y"}', "duplicate JSON key"),
            ('{"mcp":{"servers":{"chatgpt":{},"chatgpt":{}}}}', "duplicate JSON key"),
        ):
            with self.subTest(contents=contents):
                root, target, _ = self.fixture(contents)
                with self.assertRaisesRegex(setup.SetupError, message):
                    setup.prepare(root, str(target))

    def test_oversized_and_nonregular_config_targets_are_rejected(self) -> None:
        """The bounded reader refuses oversized files and directories as config files."""
        root, target, _ = self.fixture(" " * (setup.MAX_CONFIG_BYTES + 1))
        with self.assertRaisesRegex(setup.SetupError, "read limit"):
            setup.prepare(root, str(target))

        root, target, _ = self.fixture()
        with self.assertRaisesRegex(setup.SetupError, "regular file"):
            setup.resolve_config_target(str(target.parent), root)

    def test_symlink_and_out_of_scope_config_paths_are_rejected(self) -> None:
        """Config selection rejects symlink leaves, symlink directories, and path escapes."""
        root, target, _ = self.fixture()
        outside = Path("/tmp/opencode")
        leaf_link = root / "global" / "linked.jsonc"
        leaf_link.symlink_to(outside)
        with self.assertRaisesRegex(setup.SetupError, "symlink"):
            setup.resolve_config_target(str(leaf_link), root)

        linked_dir = root / "linked-global"
        linked_dir.symlink_to(root / "global", target_is_directory=True)
        with self.assertRaisesRegex(setup.SetupError, "symlink"):
            setup.resolve_config_target(str(linked_dir / target.name), root)

        with self.assertRaisesRegex(setup.SetupError, "inside this checkout"):
            setup.resolve_config_target(str(outside), root)
        with self.assertRaisesRegex(setup.SetupError, "parent-directory components"):
            setup.resolve_config_target(str(root / "global" / ".." / target.name), root)

    def test_explicit_testfixture_config_outside_checkout_is_allowed(self) -> None:
        """The alternate safe root remains available for disposable config fixtures."""
        root, _, _ = self.fixture()
        target = root.parent / f"alternate-{root.name}.json"
        target.write_text('{"model":"fixture/model"}\n', encoding="utf-8")
        self.addCleanup(target.unlink)
        self.assertEqual(setup.resolve_config_target(str(target), root), target)
        self.assertTrue(setup.prepare(root, str(target)).changed)

    def test_runtime_preflight_failure_never_backs_up_or_writes_config(self) -> None:
        """A missing pinned runtime blocks config mutation after read-only preflight."""
        root, target, original = self.fixture()
        calls: list[RecordedCall] = []
        plan = setup.prepare(root, str(target))
        with self.assertRaisesRegex(setup.SetupError, "launcher --verify-only failed"):
            setup.apply_plan(plan, install_dependencies=False, command_runner=self.fake_runner(calls, status=19))
        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(len(calls), 1)
        self.assertFalse(list(target.parent.glob("*.backup.*")))

    def test_injected_dependency_install_failure_never_runs_preflight_or_writes(self) -> None:
        """Install is attempted only by explicit apply and failure leaves source config intact."""
        root, target, original = self.fixture()
        calls: list[RecordedCall] = []
        plan = setup.prepare(root, str(target))
        with self.assertRaisesRegex(setup.SetupError, "npm ci failed with status 23"):
            setup.apply_plan(plan, install_dependencies=True, command_runner=self.fake_runner(calls, status=23))
        self.assertEqual(calls[0][0][0], "npm")
        self.assertIn("--ignore-scripts", calls[0][0])
        self.assertEqual(len(calls), 1)
        self.assertEqual(target.read_bytes(), original)
        self.assertFalse(list(target.parent.glob("*.backup.*")))

    def test_explicit_install_runs_npm_ci_before_launcher_preflight(self) -> None:
        """Only apply plus the install flag runs package-local npm ci before verification."""
        from unittest.mock import patch

        root, target, _ = self.fixture()
        calls: list[RecordedCall] = []
        plan = setup.prepare(root, str(target))
        with patch.dict(os.environ, {"OPENAI_API_KEY": "synthetic-not-a-credential"}):
            result = setup.apply_plan(plan, install_dependencies=True, command_runner=self.fake_runner(calls))
        package_root = root / "tools" / "chatgpt-connector"
        self.assertTrue(result.dependencies_installed)
        self.assertTrue(result.preflight_verified)
        self.assertEqual(
            calls[0][0],
            ["npm", "--prefix", str(package_root), "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
        )
        self.assertEqual(calls[1][0], [str(root / "scripts" / "chatgpt-mcp.sh"), "--verify-only"])
        self.assertIsNone(calls[0][2])
        assert calls[1][2] is not None
        self.assertNotIn("OPENAI_API_KEY", calls[1][2])

    def test_default_runner_uses_only_synthetic_npm_and_launcher_executables(self) -> None:
        """The real subprocess boundary stays inside fake executables and a temp checkout."""
        from unittest.mock import patch

        root, target, _ = self.fixture()
        fake_bin = root / "fake-bin"
        fake_bin.mkdir()
        log = root / "command-order.log"
        npm = fake_bin / "npm"
        npm.write_text(
            "#!/bin/sh\nprintf '%s\\n' npm \"$@\" >> \"$CHATGPT_TEST_LOG\"\nexit 0\n",
            encoding="utf-8",
        )
        npm.chmod(0o755)
        launcher = root / "scripts" / "chatgpt-mcp.sh"
        launcher.write_text(
            "#!/bin/sh\nprintf '%s\\n' launcher \"$@\" >> " + shlex.quote(str(log)) + "\nexit 0\n",
            encoding="utf-8",
        )
        launcher.chmod(0o755)

        with patch.dict(
            os.environ,
            {"PATH": str(fake_bin), "CHATGPT_TEST_LOG": str(log)},
        ):
            result = setup.apply_plan(
                setup.prepare(root, str(target)),
                install_dependencies=True,
            )

        self.assertTrue(result.dependencies_installed)
        self.assertTrue(result.preflight_verified)
        lines = log.read_text(encoding="utf-8").splitlines()
        self.assertEqual(lines[0], "npm")
        self.assertEqual(lines[1:8], [
            "--prefix",
            str(root / "tools" / "chatgpt-connector"),
            "ci",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "launcher",
        ])
        self.assertEqual(lines[8:], ["--verify-only"])

    def test_concurrent_config_change_during_preflight_is_refused(self) -> None:
        """A concurrent edit after planning is detected before backup or atomic replace."""
        root, target, original = self.fixture()
        plan = setup.prepare(root, str(target))
        concurrent = original.replace(b'"example/model"', b'"someone/else"')

        def change_during_preflight(
            command: list[str], cwd: Path, environment: Mapping[str, str] | None, timeout: int
        ) -> int:
            """Simulate a user edit while the launcher preflight is in progress."""
            target.write_bytes(concurrent)
            return 0

        with self.assertRaisesRegex(setup.SetupError, "changed concurrently"):
            setup.apply_plan(plan, install_dependencies=False, command_runner=change_during_preflight)
        self.assertEqual(target.read_bytes(), concurrent)
        self.assertFalse(list(target.parent.glob("*.backup.*")))

    def test_concurrent_change_after_backup_is_refused_and_backup_is_preserved(self) -> None:
        """The last pre-replace comparison catches edits made while the temp is staged."""
        from unittest.mock import patch

        root, target, original = self.fixture()
        plan = setup.prepare(root, str(target))
        concurrent = original.replace(b'"example/model"', b'"someone/else"')
        real_atomic_replace = setup.atomic_replace

        def edit_then_replace(
            directory_fd: int,
            filename: str,
            content: bytes,
            mode: int,
            path: Path,
            expected: setup.Snapshot,
        ) -> None:
            """Inject a concurrent edit after backup but before the replacement guard."""
            target.write_bytes(concurrent)
            real_atomic_replace(directory_fd, filename, content, mode, path, expected)

        with patch.object(setup, "atomic_replace", side_effect=edit_then_replace):
            with self.assertRaisesRegex(setup.SetupError, "backup preserved"):
                setup.apply_plan(
                    plan,
                    install_dependencies=False,
                    command_runner=self.fake_runner([]),
                )
        backup_paths = list(target.parent.glob("*.backup.*"))
        self.assertEqual(len(backup_paths), 1)
        self.assertEqual(backup_paths[0].read_bytes(), original)
        self.assertEqual(target.read_bytes(), concurrent)

    def test_successful_readback_matches_merge_and_backup_is_adjacent(self) -> None:
        """The applied file is reparsed from disk and its adjacent backup is byte-exact."""
        root, target, original = self.fixture()
        plan = setup.prepare(root, str(target))
        result = setup.apply_plan(plan, install_dependencies=False, command_runner=self.fake_runner([]))
        self.assertTrue(result.changed)
        assert result.backup is not None
        self.assertEqual(result.backup.parent, target.parent)
        self.assertEqual(result.backup.read_bytes(), original)
        self.assertTrue(stat.S_ISREG(result.backup.lstat().st_mode))
        self.assertEqual(setup.parse_strict_json(target.read_bytes(), target), plan.desired)

    def test_checkout_identity_uses_script_location_and_git_root(self) -> None:
        """The default checkout comes from the helper's verified source location."""
        temporary = tempfile.TemporaryDirectory(prefix="setup-chatgpt-identity-", dir=TEST_FIXTURES)
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        scripts = root / "scripts"
        scripts.mkdir()
        helper = scripts / "setup-chatgpt.py"
        helper.write_text("", encoding="utf-8")
        self.assertEqual(setup.resolve_checkout(helper, lambda _root: root), root)
        with self.assertRaisesRegex(setup.SetupError, "does not match the Git checkout root"):
            setup.resolve_checkout(helper, lambda _root: root.parent)

    def test_cli_help_does_not_resolve_or_mutate_any_config(self) -> None:
        """Help is available without touching the actual checkout config or runtime."""
        target = Path(__file__).parent.parent / "global" / "opencode.jsonc"
        original = target.read_bytes()
        result = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("setup-chatgpt.py")), "--help"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("--apply", result.stdout)
        self.assertIn("--install-dependencies", result.stdout)
        self.assertEqual(target.read_bytes(), original)

        no_apply_install = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("setup-chatgpt.py")),
                "--install-dependencies",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        self.assertEqual(no_apply_install.returncode, 2)
        self.assertIn("requires --apply", no_apply_install.stderr)
        self.assertEqual(target.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
