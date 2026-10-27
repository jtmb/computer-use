"""Tests for the local-only secret setup helper."""

from __future__ import annotations

import contextlib
import io
import os
import stat
import sys
import tempfile
import unittest
from collections.abc import Callable
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).absolute().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import secret_setup  # noqa: E402

TEMP_ROOT = Path("/tmp/opencode")


class SecretSetupTests(unittest.TestCase):
    """Exercise prompts, filesystem protections, and non-secret output."""

    def setUp(self) -> None:
        """Create a private throwaway repository beneath the approved temp root."""
        if not TEMP_ROOT.is_dir():
            self.fail("/tmp/opencode must exist for isolated secret-helper tests")
        self.temporary_directory = tempfile.TemporaryDirectory(dir=TEMP_ROOT)
        self.addCleanup(self.temporary_directory.cleanup)
        self.base = Path(self.temporary_directory.name)
        self.repository = self.base / "repo"
        self.repository.mkdir()
        self.repository.chmod(0o700)

    def run_main(
        self,
        arguments: list[str],
        *,
        secret_prompt: Callable[[str], str] | None = None,
        value_prompt: Callable[[str], str] | None = None,
    ) -> tuple[int, str, str]:
        """Capture helper output while directing all file access to the fixture."""
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = secret_setup.main(
                arguments,
                repository_root=self.repository,
                secret_prompt=secret_prompt,
                value_prompt=value_prompt,
            )
        return result, stdout.getvalue(), stderr.getvalue()

    def write_environment(self, contents: str, mode: int = 0o600) -> Path:
        """Create a synthetic local environment file with an explicit mode."""
        path = self.repository / ".env"
        path.write_text(contents, encoding="utf-8")
        path.chmod(mode)
        return path

    def test_apply_prompts_without_echo_and_preserves_unselected_keys(self) -> None:
        """Apply selected values privately and retain unrelated environment entries."""
        environment = self.write_environment(
            "# local values\nCUSTOM_FLAG=keep-me\nTS_CLIENT_ID=old-client\n"
        )
        result, stdout, stderr = self.run_main(
            ["--apply", "--key", "TS_AUTHKEY", "--key", "TS_CLIENT_ID"],
            secret_prompt=lambda _prompt: "fake-authkey-test-only",
            value_prompt=lambda _prompt: "new-client-123",
        )

        self.assertEqual(result, 0, stderr)
        self.assertEqual(stderr, "")
        self.assertNotIn("fake-authkey-test-only", stdout + stderr)
        self.assertNotIn("new-client-123", stdout + stderr)
        self.assertEqual(
            environment.read_text(encoding="utf-8"),
            "# local values\nCUSTOM_FLAG=keep-me\nTS_CLIENT_ID=new-client-123\n"
            "TS_AUTHKEY=fake-authkey-test-only\n",
        )
        self.assertEqual(stat.S_IMODE(environment.stat().st_mode), 0o600)
        self.assertEqual(environment.stat().st_uid, os.getuid())
        self.assertEqual(stat.S_IMODE((self.repository / ".env.lock").stat().st_mode), 0o600)

    def test_nonsecret_access_metadata_accepts_paths_and_valid_port(self) -> None:
        """Store only safe nonsecret SSH and Kubernetes access metadata."""
        metadata = {
            "SSH_HOST": "node-4.example",
            "SSH_USER": "tailscale-admin",
            "SSH_PORT": "65535",
            "SSH_PRIVATE_KEY_FILE": "/tmp/opencode/fake-ssh/id_ed25519",
            "KUBE_CONFIG_FILE": "/tmp/opencode/fake-kube/config",
            "KUBE_CA_FILE": "/tmp/opencode/fake-kube/ca.crt",
        }
        arguments = ["--apply"]
        for key in metadata:
            arguments.extend(["--key", key])

        result, stdout, stderr = self.run_main(
            arguments,
            value_prompt=lambda prompt: metadata[prompt.removesuffix(": ")],
        )

        self.assertEqual(result, 0, stderr)
        self.assertEqual(stderr, "")
        self.assertNotIn("/tmp/opencode/fake-ssh/id_ed25519", stdout)
        environment = (self.repository / ".env").read_text(encoding="utf-8")
        for key, value in metadata.items():
            self.assertIn(f"{key}={value}\n", environment)
        self.assertEqual(
            stat.S_IMODE((self.repository / ".env").stat().st_mode),
            0o600,
        )

        result, _stdout, stderr = self.run_main(
            ["--apply", "--key", "SSH_PORT"],
            value_prompt=lambda _prompt: "1",
        )
        self.assertEqual(result, 0, stderr)
        self.assertIn("SSH_PORT=1\n", (self.repository / ".env").read_text(encoding="utf-8"))

    def test_invalid_ssh_ports_are_rejected_without_writes(self) -> None:
        """Reject nonnumeric, zero, and out-of-range SSH port metadata."""
        invalid_ports = ("0", "65536", "22/tcp", "-1", "not-a-port")
        for index, port in enumerate(invalid_ports):
            with self.subTest(port=port):
                self.repository = self.base / f"invalid-port-{index}"
                self.repository.mkdir()
                self.repository.chmod(0o700)
                result, _stdout, stderr = self.run_main(
                    ["--apply", "--key", "SSH_PORT"],
                    value_prompt=lambda _prompt, port=port: port,
                )

                self.assertEqual(result, 2)
                self.assertIn("1 through 65535", stderr)
                self.assertNotIn(port, stderr)
                self.assertFalse((self.repository / ".env").exists())
                self.assertFalse((self.repository / ".env.lock").exists())

    def test_path_metadata_requires_absolute_control_free_paths(self) -> None:
        """Reject relative paths and line controls without touching referenced files."""
        invalid_paths = (".local/ssh/id_ed25519", "/tmp/opencode/fake\nkey")
        for index, path in enumerate(invalid_paths):
            with self.subTest(path_kind=index):
                self.repository = self.base / f"invalid-path-{index}"
                self.repository.mkdir()
                self.repository.chmod(0o700)
                result, _stdout, stderr = self.run_main(
                    ["--apply", "--key", "SSH_PRIVATE_KEY_FILE"],
                    value_prompt=lambda _prompt, path=path: path,
                )

                self.assertEqual(result, 2)
                self.assertNotIn(path, stderr)
                self.assertFalse((self.repository / ".env").exists())
                self.assertFalse((self.repository / ".env.lock").exists())

    def test_default_preview_does_not_prompt_or_create_files(self) -> None:
        """Preview is non-interactive and has no filesystem side effects."""
        def unexpected_prompt(_prompt: str) -> str:
            self.fail("preview must not prompt")

        result, stdout, stderr = self.run_main(
            ["--key", "TS_AUTHKEY"],
            secret_prompt=unexpected_prompt,
            value_prompt=unexpected_prompt,
        )

        self.assertEqual(result, 0)
        self.assertIn("Preview only", stdout)
        self.assertNotIn("unexpected", stdout + stderr)
        self.assertEqual(stderr, "")
        self.assertFalse((self.repository / ".env").exists())
        self.assertFalse((self.repository / ".env.lock").exists())

    def test_help_does_not_prompt_or_create_files(self) -> None:
        """Help exits before accessing the repository or invoking prompts."""
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertRaises(SystemExit) as raised:
                secret_setup.main(["--help"], repository_root=self.repository)

        self.assertEqual(raised.exception.code, 0)
        self.assertIn("--apply", stdout.getvalue())
        self.assertFalse((self.repository / ".env").exists())
        self.assertFalse((self.repository / ".env.lock").exists())

    def test_injection_and_newline_values_are_rejected_without_writes(self) -> None:
        """Reject shell syntax, line breaks, and NUL without echoing user input."""
        rejected_values = (
            "$(touch /tmp/opencode/should-not-exist)",
            "first-line\nINJECTED=second-line",
            "contains\x00nul",
        )
        for index, value in enumerate(rejected_values):
            with self.subTest(value_kind=repr(value[:12])):
                self.repository = self.base / f"invalid-{index}"
                self.repository.mkdir()
                self.repository.chmod(0o700)
                result, _stdout, stderr = self.run_main(
                    ["--apply", "--key", "TS_AUTHKEY"],
                    secret_prompt=lambda _prompt, value=value: value,
                )
                self.assertEqual(result, 2)
                self.assertNotIn(value, stderr)
                self.assertFalse((self.repository / ".env").exists())
                self.assertFalse((self.repository / ".env.lock").exists())

        self.assertFalse((TEMP_ROOT / "should-not-exist").exists())

    def test_invalid_allowlisted_key_is_redacted_and_preserves_existing_file(self) -> None:
        """Reject unallowlisted key arguments without echoing or modifying data."""
        environment = self.write_environment("CUSTOM_FLAG=keep-this-value\n")
        original = environment.read_bytes()

        result, stdout, stderr = self.run_main(
            ["--apply", "--key", "BORTUS_DEPLOY_TOKEN"],
            secret_prompt=lambda _prompt: self.fail("invalid key must not prompt"),
        )

        self.assertEqual(result, 2)
        self.assertEqual(stdout, "")
        self.assertNotIn("BORTUS_DEPLOY_TOKEN", stderr)
        self.assertNotIn("keep-this-value", stderr)
        self.assertNotIn("BORTUS_DEPLOY_TOKEN", secret_setup.ALLOWED_KEYS)
        self.assertEqual(environment.read_bytes(), original)
        self.assertFalse((self.repository / ".env.lock").exists())

    def test_symlinked_repository_ancestor_is_rejected_before_prompt(self) -> None:
        """Refuse a symlink anywhere in the repository directory path."""
        actual_parent = self.base / "actual"
        actual_parent.mkdir()
        actual_repository = actual_parent / "repo"
        actual_repository.mkdir()
        alias = self.base / "alias"
        alias.symlink_to(actual_parent, target_is_directory=True)

        def unexpected_prompt(_prompt: str) -> str:
            self.fail("unsafe repository path must be rejected before prompting")

        stdout = io.StringIO()
        error_output = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(error_output):
            result = secret_setup.main(
                ["--apply", "--key", "TS_AUTHKEY"],
                repository_root=alias / "repo",
                secret_prompt=unexpected_prompt,
            )

        self.assertEqual(result, 2)
        self.assertIn("symlink", error_output.getvalue())
        self.assertFalse((actual_repository / ".env").exists())

    def test_symlinked_env_file_is_rejected(self) -> None:
        """Do not follow or replace an existing .env symlink."""
        outside_file = self.base / "outside"
        outside_file.write_text("", encoding="utf-8")
        (self.repository / ".env").symlink_to(outside_file)

        def unexpected_prompt(_prompt: str) -> str:
            self.fail("unsafe .env must be rejected before prompting")

        result, _stdout, stderr = self.run_main(
            ["--apply", "--key", "TS_AUTHKEY"],
            secret_prompt=unexpected_prompt,
        )

        self.assertEqual(result, 2)
        self.assertIn(".env", stderr)
        self.assertEqual(outside_file.read_text(encoding="utf-8"), "")

    def test_insecure_env_mode_is_rejected_without_modification(self) -> None:
        """Refuse an existing environment file not owned with mode 0600."""
        environment = self.write_environment("CUSTOM_FLAG=preserve\n", mode=0o644)
        original = environment.read_bytes()

        def unexpected_prompt(_prompt: str) -> str:
            self.fail("unsafe .env permissions must be rejected before prompting")

        result, _stdout, stderr = self.run_main(
            ["--apply", "--key", "TS_AUTHKEY"],
            secret_prompt=unexpected_prompt,
        )

        self.assertEqual(result, 2)
        self.assertIn("0600", stderr)
        self.assertEqual(environment.read_bytes(), original)
        self.assertFalse((self.repository / ".env.lock").exists())

    def test_atomic_replace_failure_leaves_no_partial_env_or_temp_file(self) -> None:
        """Keep the target absent if atomic publication fails and clean the temp."""
        with patch.object(secret_setup.os, "replace", side_effect=OSError("injected")):
            result, _stdout, stderr = self.run_main(
                ["--apply", "--key", "TS_AUTHKEY"],
                secret_prompt=lambda _prompt: "fake-atomic-test-only",
            )

        self.assertEqual(result, 2)
        self.assertNotIn("fake-atomic-test-only", stderr)
        self.assertFalse((self.repository / ".env").exists())
        self.assertEqual(list(self.repository.glob(".env.tmp.*")), [])


if __name__ == "__main__":
    unittest.main()
