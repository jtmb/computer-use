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
RUNTIME_PATH = REPOSITORY / "scripts" / "mcp_runtime.py"
POLICY = {
    "schemaVersion": 2,
    "nodeVersion": "22.22.2",
    "nodeArchive": "node-v22.22.2-linux-x64.tar.xz",
    "nodeSha256": "88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a",
    "nodeUrl": "https://nodejs.org/dist/v22.22.2/node-v22.22.2-linux-x64.tar.xz",
    "githubVersion": "1.12.1",
    "githubArchive": "github-mcp-server_Linux_x86_64.tar.gz",
    "githubSha256": "e45c73a26a3c4cd643b40360db06f442de1e73a60d4eaf9e8639204ec3b95d3b",
    "githubUrl": (
        "https://github.com/github/github-mcp-server/releases/download/v1.12.1/"
        "github-mcp-server_Linux_x86_64.tar.gz"
    ),
}


def load_runtime() -> ModuleType:
    """Load the runtime helper directly so tests can replace its file inputs."""
    spec = importlib.util.spec_from_file_location("mcp_runtime_retirement_test", RUNTIME_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load mcp_runtime.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_memory_cli() -> ModuleType:
    """Load the legacy CLI without executing its command entry point."""
    spec = importlib.util.spec_from_file_location("assistant_memory_retirement_test", MEMORY_CLI)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load assistant-memory.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runtime = load_runtime()
memory_cli = load_memory_cli()


class MemoryRetirementTests(unittest.TestCase):
    """Exercise the actual helpers against isolated files and Git worktrees."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="memory-retirement-", dir="/tmp/opencode")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.policy_file = self.root / "mcp-versions.json"
        self.write_policy()
        scripts = self.root / "scripts"
        scripts.mkdir()
        for name in ("github-mcp.sh", "chatgpt-mcp.sh"):
            wrapper = scripts / name
            wrapper.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            wrapper.chmod(0o700)
        self.policy_patcher = patch.object(runtime, "POLICY_PATH", self.policy_file)
        self.scripts_patcher = patch.object(runtime, "SCRIPT_ROOT", scripts)
        self.policy_patcher.start()
        self.scripts_patcher.start()
        self.addCleanup(self.scripts_patcher.stop)
        self.addCleanup(self.policy_patcher.stop)

    def write_policy(self, **overrides: str) -> dict[str, object]:
        """Write a synthetic canonical policy and return its decoded contents."""
        policy: dict[str, object] = {**POLICY, **overrides}
        self.policy_file.write_text(json.dumps(policy), encoding="utf-8")
        return policy

    def test_policy_paths_and_cli_keep_only_pinned_supported_runtimes(self) -> None:
        policy = runtime.load_policy()
        self.assertNotIn("basicMemory", policy)
        self.assertEqual(policy["githubVersion"], "1.12.1")
        self.assertEqual(policy["githubSha256"], POLICY["githubSha256"])
        self.assertEqual(runtime.expected_marker("wsl2")["githubSha256"], POLICY["githubSha256"])

        profile_root = self.root / "profile"
        paths = runtime.profile_paths(profile_root)
        self.assertEqual(
            runtime.github_binary("wsl2", profile_root),
            profile_root / "mcp" / "github" / "github-mcp-server",
        )
        self.assertEqual(paths["github_binary"], runtime.github_binary("wsl2", profile_root))
        self.assertFalse(any("basic" in key for key in paths))
        self.assertNotIn("basicMemory", runtime.expected_marker("wsl2"))

        with patch.object(runtime, "POLICY_PATH", REPOSITORY / "config" / "mcp-versions.json"):
            checked_in_policy = runtime.load_policy()
        self.assertNotIn("basicMemory", checked_in_policy)
        self.assertEqual(checked_in_policy["githubSha256"], POLICY["githubSha256"])

        output = io.StringIO()
        with (
            patch.object(sys, "argv", [str(RUNTIME_PATH), "policy"]),
            contextlib.redirect_stdout(output),
        ):
            self.assertEqual(runtime.main(), 0)
        self.assertEqual(json.loads(output.getvalue()), policy)
        self.assertFalse(hasattr(runtime, "_has_basic_memory_runtime"))
        for command in (
            [str(RUNTIME_PATH), "basic-project"],
            [str(RUNTIME_PATH), "runner", "--kind", "uvx"],
        ):
            with (
                patch.object(sys, "argv", command),
                contextlib.redirect_stderr(io.StringIO()),
                self.assertRaises(SystemExit) as raised,
            ):
                runtime.main()
            self.assertEqual(raised.exception.code, 2)

    def test_retired_server_is_removed_and_other_global_entries_are_preserved(self) -> None:
        self.assertNotIn("basic-memory", runtime.MCP_NAMES)
        data = {
            "mcp": {
                "basic-memory": {"type": "local"},
                "timeout": {},
                "servers": {
                    "basic-memory": {"type": "local"},
                    "playwright": {"type": "local"},
                    "unrelated": {"type": "remote", "url": "https://example.invalid/mcp"},
                },
            },
            "preserved": True,
        }
        runtime.ensure_global_mcp_servers(data)
        servers = data["mcp"]["servers"]
        self.assertNotIn("basic-memory", data["mcp"])
        self.assertNotIn("basic-memory", servers)
        self.assertNotIn("playwright", servers)
        self.assertEqual(set(runtime.MCP_NAMES), {"github"})
        self.assertIn("unrelated", servers)
        self.assertTrue(data["preserved"])
        runtime.verify_global_mcp_servers(data)

        project = {"mcp": {"basic-memory": {}, "servers": {"basic-memory": {}}}}
        runtime.ensure_mcp_servers(project, profile="native")
        self.assertNotIn("basic-memory", project["mcp"])
        self.assertEqual(set(project["mcp"]["servers"]), {"github"})
        runtime.verify_mcp_servers(project, profile="native")

    def test_retired_memory_runtime_preserves_existing_legacy_json_data(self) -> None:
        """Removing the retired MCP entry never archives, rewrites, or deletes legacy data."""
        fake_home = self.root / "retirement-home"
        legacy_directory = fake_home / "Documents" / "computer-assistant"
        legacy_directory.mkdir(parents=True)
        legacy_store = legacy_directory / "memory.json"
        original = (
            b'{"version":1,"entries":[{"id":"synthetic-preserved",'
            b'"category":"decision","text":"fixture data survives retirement",'
            b'"source":"verified","created_at":"2025-01-01T00:00:00+00:00",'
            b'"updated_at":"2025-01-01T00:00:00+00:00","expires":null}]}\n'
        )
        legacy_store.write_bytes(original)
        legacy_store.chmod(0o600)
        original_stat = legacy_store.stat()
        original_mode = original_stat.st_mode & 0o777
        original_mtime_ns = original_stat.st_mtime_ns

        global_config = {
            "mcp": {
                "basic-memory": {"type": "local"},
                "servers": {
                    "basic-memory": {"type": "local"},
                    "unrelated": {"type": "remote", "url": "https://example.invalid/mcp"},
                },
            },
            "preserved": True,
        }
        runtime.ensure_global_mcp_servers(global_config)
        runtime.verify_global_mcp_servers(global_config)
        self.assertNotIn("basic-memory", global_config["mcp"]["servers"])
        self.assertIn("unrelated", global_config["mcp"]["servers"])
        self.assertTrue(global_config["preserved"])

        project_config = {"mcp": {"basic-memory": {}, "servers": {"basic-memory": {}}}}
        runtime.ensure_mcp_servers(project_config, profile="native")
        runtime.verify_mcp_servers(project_config, profile="native")

        native_root = fake_home / ".local" / "share" / "opencode" / "mcp"
        with (
            patch.dict(os.environ, {"OPENCODE_MCP_NATIVE_ROOT": str(native_root)}),
            patch.object(runtime.Path, "home", return_value=fake_home),
        ):
            runtime.prepare_native(apply=True)

        self.assertEqual(legacy_store.read_bytes(), original)
        self.assertEqual(legacy_store.stat().st_mode & 0o777, original_mode)
        self.assertEqual(legacy_store.stat().st_mtime_ns, original_mtime_ns)

    def test_default_mcp_generation_does_not_require_or_enable_chatgpt(self) -> None:
        """Default runtime setup excludes optional ChatGPT and preserves an existing selection."""
        (runtime.SCRIPT_ROOT / "chatgpt-mcp.sh").unlink()
        self.assertEqual(set(runtime.mcp_servers("native")), {"github"})
        self.assertEqual(set(runtime.global_mcp_servers()), {"github"})
        existing = {"type": "local", "command": ["/user/optional-chatgpt.sh"], "disabled": True}
        data = {"mcp": {"servers": {"chatgpt": existing.copy()}}}
        runtime.ensure_global_mcp_servers(data)
        self.assertEqual(data["mcp"]["servers"]["chatgpt"], existing)
        runtime.verify_global_mcp_servers(data)

    def test_marker_ignores_obsolete_extra_fields_without_rewriting(self) -> None:
        profile_root = self.root / "profile"
        marker_path = runtime.profile_paths(profile_root)["marker"]
        marker_path.parent.mkdir(parents=True)
        marker = {
            **runtime.expected_marker("wsl2"),
            "basicMemory": "obsolete-version",
            "retiredProviderMetadata": {"old": True},
        }
        marker_path.write_text(json.dumps(marker), encoding="utf-8")
        original = marker_path.read_bytes()
        with (
            patch.object(runtime, "_has_node_runtime", return_value=True),
            patch.object(runtime, "_has_github_runtime", return_value=True),
        ):
            runtime.mcp_provisioning(profile_root, profile="wsl2", apply=False, quiet=True)
        self.assertEqual(marker_path.read_bytes(), original)

    def test_prepare_native_does_not_create_a_global_notes_directory(self) -> None:
        fake_home = self.root / "home"
        native_root = fake_home / ".local" / "share" / "opencode" / "mcp"
        with (
            patch.dict(os.environ, {"OPENCODE_MCP_NATIVE_ROOT": str(native_root)}),
            patch.object(runtime.Path, "home", return_value=fake_home),
        ):
            paths = runtime.native_paths()
            runtime.prepare_native(apply=True)
        self.assertTrue(paths["github"].is_dir())
        self.assertFalse((fake_home / "Documents").exists())
        self.assertFalse(any("basic" in key for key in paths))

    def test_native_prepare_preview_does_not_modify_fixture_directories(self) -> None:
        fake_home = self.root / "preview-home"
        native_root = fake_home / ".local" / "share" / "opencode" / "mcp"
        github = native_root / "github"
        node_parent = native_root / "node"
        github.mkdir(parents=True)
        node_parent.mkdir()
        before = {
            path: (path.stat().st_mode, path.stat().st_mtime_ns)
            for path in (native_root, github, node_parent)
        }
        with (
            patch.dict(os.environ, {"OPENCODE_MCP_NATIVE_ROOT": str(native_root)}),
            patch.object(runtime.Path, "home", return_value=fake_home),
        ):
            runtime.prepare_native(apply=False)
        after = {
            path: (path.stat().st_mode, path.stat().st_mtime_ns)
            for path in (native_root, github, node_parent)
        }
        self.assertEqual(after, before)
        self.assertFalse((fake_home / "Documents").exists())

    def test_github_installer_checks_archive_checksum_and_fixed_target(self) -> None:
        binary = b"#!/bin/sh\nprintf 'Version: 1.12.1\\n'\n"
        archive_bytes = io.BytesIO()
        with tarfile.open(fileobj=archive_bytes, mode="w:gz") as archive:
            for name, content in (
                ("LICENSE", b"fixture license\n"),
                ("README.md", b"fixture metadata\n"),
                ("github-mcp-server", binary),
            ):
                member = tarfile.TarInfo(name)
                member.size = len(content)
                member.mode = 0o700 if name == "github-mcp-server" else 0o600
                archive.addfile(member, io.BytesIO(content))
        payload = archive_bytes.getvalue()
        checksum = hashlib.sha256(payload).hexdigest()
        self.write_policy(githubSha256=checksum)

        class Response:
            def __init__(self, data: bytes) -> None:
                self.stream = io.BytesIO(data)

            def __enter__(self) -> Response:
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def read(self, size: int = -1) -> bytes:
                return self.stream.read(size)

        profile_root = self.root / "github-profile"
        with patch.object(runtime, "urlopen", return_value=Response(payload)):
            installed = runtime.ensure_github(profile="wsl2", profile_root=profile_root, apply=True)
        expected = profile_root / "mcp" / "github" / "github-mcp-server"
        self.assertEqual(installed, expected)
        self.assertTrue(runtime._has_github_runtime(installed, "1.12.1"))

        failed_root = self.root / "checksum-failure"
        self.write_policy(githubSha256="0" * 64)
        with (
            patch.object(runtime, "urlopen", return_value=Response(payload)),
            self.assertRaises(runtime.McpRuntimeError),
        ):
            runtime.ensure_github(profile="wsl2", profile_root=failed_root, apply=True)
        self.assertFalse(runtime.github_binary("wsl2", failed_root).exists())

    def test_mcp_path_validation_still_rejects_repository_and_symlink_paths(self) -> None:
        with self.assertRaises(runtime.McpRuntimeError):
            runtime.ensure_safe_path(REPOSITORY / "scripts")
        target = self.root / "target"
        target.mkdir()
        link = self.root / "link"
        link.symlink_to(target, target_is_directory=True)
        with self.assertRaises(runtime.McpRuntimeError):
            runtime.ensure_safe_path(link / "state")


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
