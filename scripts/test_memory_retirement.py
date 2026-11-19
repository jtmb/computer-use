#!/usr/bin/env python3
"""Regression tests for retired MCP memory and repository-scoped legacy storage."""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch


REPOSITORY = Path(__file__).resolve().parent.parent
MEMORY_CLI = REPOSITORY / "scripts" / "assistant-memory.py"
def load_memory_cli() -> ModuleType:
    """Load the legacy CLI without executing its command entry point."""
    spec = importlib.util.spec_from_file_location("assistant_memory_retirement_test", MEMORY_CLI)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load assistant-memory.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


memory_cli = load_memory_cli()


class LegacyMemoryCliTests(unittest.TestCase):
    """Verify explicit repository selection, read safety, and preview behavior."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="legacy-memory-cli-", dir="/tmp/opencode")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.fake_home = self.root / "home"
        self.fake_home.mkdir()
        self.environment = os.environ.copy()
        for name in (
            "GH_TOKEN",
            "GITHUB_TOKEN",
            "GH_ENTERPRISE_TOKEN",
            "GITHUB_ENTERPRISE_TOKEN",
            "GITHUB_PERSONAL_ACCESS_TOKEN",
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_COMMON_DIR",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        ):
            self.environment.pop(name, None)
        self.environment.update(
            {
                "HOME": str(self.fake_home),
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_TERMINAL_PROMPT": "0",
            }
        )
        self.project = self.root / "active-project"
        self.initialize_repository(self.project)

    def initialize_repository(self, path: Path) -> None:
        """Initialize an empty repository entirely inside this test fixture."""
        path.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "init", "-q", str(path)],
            check=True,
            capture_output=True,
            text=True,
            env=self.environment,
        )

    def run_git(self, *arguments: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        """Run Git against synthetic fixture repositories only."""
        return subprocess.run(
            ["git", *arguments],
            cwd=cwd or self.root,
            env=self.environment,
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )

    def run_cli(
        self,
        *arguments: str,
        cwd: Path | None = None,
        script: Path = MEMORY_CLI,
    ) -> subprocess.CompletedProcess[str]:
        """Run the real legacy CLI with isolated environment and captured output."""
        return subprocess.run(
            [sys.executable, str(script), *arguments],
            cwd=cwd or self.project,
            env=self.environment,
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )

    def test_remember_preview_creates_no_store_directory_or_lock(self) -> None:
        result = self.run_cli(
            "--path",
            "docs/memory/legacy.json",
            "remember",
            "Keep memory in the active repository",
            "--category",
            "decision",
            "--source",
            "user",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)["dry_run"])
        self.assertFalse((self.project / "docs").exists())

    def test_read_of_missing_store_does_not_initialize_anything(self) -> None:
        selected = self.project / "docs" / "memory.json"
        result = self.run_cli("--path", str(selected), "list")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("store not initialized", result.stderr)
        self.assertFalse(selected.parent.exists())

    def test_existing_store_read_preserves_data_without_creating_lock(self) -> None:
        directory = self.project / "docs"
        directory.mkdir(mode=0o700)
        store = directory / "memory.json"
        original = b'{"version":1,"entries":[]}\n'
        store.write_bytes(original)
        store.chmod(0o600)
        result = self.run_cli("--path", str(store), "list", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), [])
        self.assertEqual(store.read_bytes(), original)
        self.assertFalse((directory / ".memory.lock").exists())

    def test_path_is_required_and_rejects_home_other_repo_and_symlinks(self) -> None:
        missing_selection = self.run_cli("list")
        self.assertNotEqual(missing_selection.returncode, 0)

        home_path = self.fake_home / "Documents" / "memory.json"
        outside_selection = self.run_cli("--path", str(home_path), "list")
        self.assertNotEqual(outside_selection.returncode, 0)
        self.assertFalse(home_path.parent.exists())

        other_project = self.root / "other-project"
        self.initialize_repository(other_project)
        other_path = other_project / "docs" / "memory.json"
        other_selection = self.run_cli("--path", str(other_path), "list")
        self.assertNotEqual(other_selection.returncode, 0)
        self.assertFalse(other_path.parent.exists())

        outside = self.root / "outside"
        outside.mkdir()
        link = self.project / "linked"
        link.symlink_to(outside, target_is_directory=True)
        symlink_selection = self.run_cli("--path", "linked/memory.json", "list")
        self.assertNotEqual(symlink_selection.returncode, 0)
        self.assertEqual(list(outside.iterdir()), [])

    def test_explicit_provider_checkout_lifecycle_from_nested_cwd(self) -> None:
        provider = self.root / "provider-checkout"
        provider_cli = provider / "scripts" / "assistant-memory.py"
        provider_cli.parent.mkdir(parents=True)
        shutil.copy2(MEMORY_CLI, provider_cli)
        self.initialize_repository(provider)
        nested = provider / "packages" / "component"
        nested.mkdir(parents=True)
        selected = "../../docs/memory.json"

        implicit = self.run_cli("init", cwd=nested, script=provider_cli)
        self.assertNotEqual(implicit.returncode, 0)
        self.assertFalse((provider / "docs").exists())
        implicit_path = provider / "implicit-memory.json"
        with patch.dict(self.environment, {"ASSISTANT_MEMORY_PATH": str(implicit_path)}):
            environment_fallback = self.run_cli("init", cwd=nested, script=provider_cli)
        self.assertNotEqual(environment_fallback.returncode, 0)
        self.assertFalse(implicit_path.exists())

        initialized = self.run_cli("--path", selected, "init", cwd=nested, script=provider_cli)
        self.assertEqual(initialized.returncode, 0, initialized.stderr)
        stored = provider / "docs" / "memory.json"
        self.assertEqual(
            json.loads(stored.read_text(encoding="utf-8")),
            {"version": 1, "entries": []},
        )

        remembered = self.run_cli(
            "--path",
            selected,
            "remember",
            "Provider checkout is a valid explicit active repository",
            "--category",
            "decision",
            "--source",
            "user",
            "--apply",
            cwd=nested,
            script=provider_cli,
        )
        self.assertEqual(remembered.returncode, 0, remembered.stderr)
        self.assertTrue(json.loads(remembered.stdout)["applied"])
        readback = self.run_cli(
            "--path", selected, "list", "--json", cwd=nested, script=provider_cli
        )
        self.assertEqual(readback.returncode, 0, readback.stderr)
        self.assertEqual(
            json.loads(readback.stdout)[0]["text"],
            "Provider checkout is a valid explicit active repository",
        )

        common_result = self.run_git(
            "rev-parse", "--git-common-dir", cwd=nested
        )
        self.assertEqual(common_result.returncode, 0, common_result.stderr)
        reported_common = Path(common_result.stdout.strip())
        expected_common = (
            reported_common if reported_common.is_absolute() else nested / reported_common
        )
        with patch.dict(os.environ, self.environment, clear=True):
            identity = memory_cli._git_identity(nested)
        self.assertEqual(identity, (provider.resolve(), expected_common.resolve()))

    def test_linked_worktree_is_its_own_explicit_memory_boundary(self) -> None:
        provider = self.root / "worktree-provider"
        provider_cli = provider / "scripts" / "assistant-memory.py"
        provider_cli.parent.mkdir(parents=True)
        shutil.copy2(MEMORY_CLI, provider_cli)
        self.initialize_repository(provider)

        linked = self.root / "linked-worktree"
        worktree_result = self.run_git(
            "worktree",
            "add",
            "--orphan",
            "-b",
            "fixture-linked",
            str(linked),
            cwd=provider,
        )
        self.assertEqual(worktree_result.returncode, 0, worktree_result.stderr)
        linked_cli = linked / "scripts" / "assistant-memory.py"
        linked_cli.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(MEMORY_CLI, linked_cli)
        nested = linked / "packages" / "component"
        nested.mkdir(parents=True)
        selected = "../../docs/linked-memory.json"

        initialized = self.run_cli("--path", selected, "init", cwd=nested, script=linked_cli)
        self.assertEqual(initialized.returncode, 0, initialized.stderr)
        linked_store = linked / "docs" / "linked-memory.json"
        self.assertTrue(linked_store.is_file())

        common_result = self.run_git("rev-parse", "--git-common-dir", cwd=nested)
        self.assertEqual(common_result.returncode, 0, common_result.stderr)
        reported_common = Path(common_result.stdout.strip())
        expected_common = (
            reported_common if reported_common.is_absolute() else nested / reported_common
        )
        with patch.dict(os.environ, self.environment, clear=True):
            worktree_root, common_dir = memory_cli._git_identity(nested)
        self.assertEqual(worktree_root, linked.resolve())
        self.assertEqual(common_dir, expected_common.resolve())
        self.assertEqual(common_dir, (provider / ".git").resolve())

        cross_worktree = self.run_cli(
            "--path", str(linked_store), "list", cwd=provider, script=provider_cli
        )
        self.assertNotEqual(cross_worktree.returncode, 0)
        main_store = provider / "docs" / "should-not-be-created.json"
        reverse_cross_worktree = self.run_cli(
            "--path", str(main_store), "list", cwd=nested, script=linked_cli
        )
        self.assertNotEqual(reverse_cross_worktree.returncode, 0)
        self.assertFalse(main_store.exists())

    def test_actual_provider_checkout_explicit_preview_is_read_only(self) -> None:
        name = f".memory-preview-{os.getpid()}"
        selected = REPOSITORY / "scripts" / f"{name}.json"
        suffix = 0
        while True:
            try:
                selected.lstat()
            except FileNotFoundError:
                break
            suffix += 1
            selected = selected.with_name(f"{name}-{suffix}.json")
        preview = self.run_cli(
            "--path",
            str(selected),
            "remember",
            "Explicit provider checkout preview stays read only",
            "--category",
            "decision",
            "--source",
            "user",
            cwd=REPOSITORY,
        )
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertTrue(json.loads(preview.stdout)["dry_run"])
        self.assertFalse(selected.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
