#!/usr/bin/env python3
"""Safely prompt for allowlisted values and update a local repository .env."""

from __future__ import annotations

import argparse
import fcntl
import getpass
import os
import re
import secrets
import stat
import sys
import warnings
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path

ENV_FILE = ".env"
LOCK_FILE = ".env.lock"
MAX_ENV_SIZE = 1024 * 1024
SECRET_KEYS = frozenset(
    {"TS_AUTHKEY", "TS_CLIENT_SECRET", "OPENCODE_PASSWORD", "KUBE_TOKEN"}
)
FILE_PATH_KEYS = frozenset(
    {"KUBE_CA_FILE", "KUBE_CONFIG_FILE", "SSH_PRIVATE_KEY_FILE"}
)
ALLOWED_KEYS = (
    "TS_AUTHKEY",
    "TS_CLIENT_ID",
    "TS_CLIENT_SECRET",
    "OPENCODE_PASSWORD",
    "KUBE_API_SERVER",
    "KUBE_CA_FILE",
    "KUBE_TOKEN",
    "KUBE_NAMESPACE",
    "KUBE_CONFIG_FILE",
    "SSH_HOST",
    "SSH_USER",
    "SSH_PORT",
    "SSH_PRIVATE_KEY_FILE",
)
ENV_LINE_PATTERN = re.compile(r"(?P<key>[A-Z][A-Z0-9_]*)=(?P<value>[^\r\n\x00]*)\Z")
SAFE_VALUE_PATTERN = re.compile(r"[A-Za-z0-9._/:@+-]+\Z", re.ASCII)
DECIMAL_PORT_PATTERN = re.compile(r"[0-9]+\Z", re.ASCII)


class SecretSetupError(Exception):
    """Raised when a local secret setup operation cannot proceed safely."""


class UsageError(Exception):
    """Raised for invalid command-line options without echoing their values."""


class SafeArgumentParser(argparse.ArgumentParser):
    """Parse options without printing potentially sensitive invalid arguments."""

    def error(self, message: str) -> None:
        """Raise a redacted usage error instead of echoing parser input."""
        del message
        raise UsageError


def _absolute_path(path: Path) -> Path:
    """Return a normalized absolute path while refusing parent traversal."""
    candidate = path if path.is_absolute() else Path.cwd() / path
    if ".." in candidate.parts:
        raise SecretSetupError("Repository paths must not contain parent traversal.")
    return Path(os.path.normpath(os.fspath(candidate)))


def _open_directory_chain(path: Path) -> int:
    """Open a real, current-user-owned repository directory without symlinks."""
    absolute_path = _absolute_path(path)
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        raise SecretSetupError("This platform cannot safely validate repository paths.")

    descriptor = -1
    try:
        descriptor = os.open(
            absolute_path.anchor,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
        )
        for component in absolute_path.parts[1:]:
            next_descriptor = os.open(
                component,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=descriptor,
            )
            os.close(descriptor)
            descriptor = next_descriptor

        info = os.fstat(descriptor)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
            raise SecretSetupError("Repository directory must be owned by the current user.")
        if stat.S_IMODE(info.st_mode) & 0o022:
            raise SecretSetupError("Repository directory must not be group- or world-writable.")
        return descriptor
    except SecretSetupError:
        if descriptor >= 0:
            os.close(descriptor)
        raise
    except OSError:
        if descriptor >= 0:
            os.close(descriptor)
        raise SecretSetupError(
            "Repository path must exist and contain no symlinked directories."
        ) from None


def _default_repository_root() -> Path:
    """Find the repository containing this regular, non-symlinked script."""
    script_path = _absolute_path(Path(__file__))
    parent_descriptor = _open_directory_chain(script_path.parent)
    try:
        script_descriptor = os.open(
            script_path.name,
            os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0),
            dir_fd=parent_descriptor,
        )
        try:
            if not stat.S_ISREG(os.fstat(script_descriptor).st_mode):
                raise SecretSetupError("The helper must be a regular, non-symlinked file.")
        finally:
            os.close(script_descriptor)
    except SecretSetupError:
        raise
    except OSError:
        raise SecretSetupError("The helper path must not contain symlinks.") from None
    finally:
        os.close(parent_descriptor)
    return script_path.parent.parent


def _validate_private_file(descriptor: int, description: str) -> None:
    """Require a regular file owned by this user with mode 0600 and one link."""
    info = os.fstat(descriptor)
    if not stat.S_ISREG(info.st_mode):
        raise SecretSetupError(f"{description} must be a regular file.")
    if info.st_uid != os.getuid():
        raise SecretSetupError(f"{description} must be owned by the current user.")
    if stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        raise SecretSetupError(f"{description} must have mode 0600 and exactly one link.")


def _read_environment(repository_descriptor: int) -> tuple[list[str], dict[str, str]]:
    """Read and validate the small, non-interpolating local environment format."""
    try:
        descriptor = os.open(
            ENV_FILE,
            os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0),
            dir_fd=repository_descriptor,
        )
    except FileNotFoundError:
        return [], {}
    except OSError:
        raise SecretSetupError("The existing .env cannot be opened safely.") from None

    try:
        _validate_private_file(descriptor, ".env")
        with os.fdopen(descriptor, "rb") as environment_file:
            data = environment_file.read(MAX_ENV_SIZE + 1)
    except SecretSetupError:
        os.close(descriptor)
        raise
    except OSError:
        raise SecretSetupError("The existing .env cannot be read safely.") from None

    if len(data) > MAX_ENV_SIZE:
        raise SecretSetupError("The existing .env exceeds the supported size limit.")
    try:
        text = data.decode("utf-8")
    except UnicodeError:
        raise SecretSetupError("The existing .env must contain valid UTF-8 text.") from None
    if "\r" in text or "\x00" in text:
        raise SecretSetupError("The existing .env contains unsupported control characters.")

    lines = [] if not text else text.split("\n")
    if text.endswith("\n") and lines:
        lines.pop()
    entries: dict[str, str] = {}
    for line_number, line in enumerate(lines, start=1):
        if not line or line.startswith("#"):
            continue
        match = ENV_LINE_PATTERN.fullmatch(line)
        if match is None:
            raise SecretSetupError(
                f"The existing .env has an unsupported entry at line {line_number}."
            )
        key = match.group("key")
        value = match.group("value")
        if key in entries:
            raise SecretSetupError(
                f"The existing .env has a duplicate or unsupported entry at line {line_number}."
            )
        try:
            _validate_value(key, value, allow_empty=True)
        except SecretSetupError:
            raise SecretSetupError(
                f"The existing .env has a duplicate or unsupported entry at line {line_number}."
            ) from None
        entries[key] = value
    return lines, entries


def _validate_value(key: str, value: str, *, allow_empty: bool = False) -> None:
    """Validate safe dotenv values and the constraints for local access metadata."""
    if not value and allow_empty:
        return
    if not value:
        raise SecretSetupError(
            f"{key} must be non-empty and use only ASCII letters, digits, . _ / : @ + or -."
        )
    if key in FILE_PATH_KEYS:
        if any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in value):
            raise SecretSetupError(f"{key} must not contain control characters.")
        if not Path(value).is_absolute():
            raise SecretSetupError(f"{key} must be an absolute file path.")
    if SAFE_VALUE_PATTERN.fullmatch(value) is None:
        raise SecretSetupError(
            f"{key} must use only ASCII letters, digits, . _ / : @ + or -."
        )
    if key == "SSH_PORT":
        if DECIMAL_PORT_PATTERN.fullmatch(value) is None:
            raise SecretSetupError("SSH_PORT must be a decimal port from 1 through 65535.")
        normalized_port = value.lstrip("0") or "0"
        if len(normalized_port) > 5:
            raise SecretSetupError("SSH_PORT must be a decimal port from 1 through 65535.")
        port = int(normalized_port)
        if not 1 <= port <= 65535:
            raise SecretSetupError("SSH_PORT must be a decimal port from 1 through 65535.")


def _merge_environment(lines: list[str], updates: dict[str, str]) -> bytes:
    """Replace only selected keys while retaining unrelated entries and comments."""
    output: list[str] = []
    replaced: set[str] = set()
    for line in lines:
        match = ENV_LINE_PATTERN.fullmatch(line) if line else None
        if match is None:
            output.append(line)
            continue
        key = match.group("key")
        if key in updates:
            output.append(f"{key}={updates[key]}")
            replaced.add(key)
        else:
            output.append(line)
    for key, value in updates.items():
        if key not in replaced:
            output.append(f"{key}={value}")
    return ("\n".join(output) + "\n").encode("utf-8")


def _open_lock_file(repository_descriptor: int) -> int:
    """Open or create the private lock file without following symlinks."""
    created = False
    try:
        descriptor = os.open(
            LOCK_FILE,
            os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=repository_descriptor,
        )
        created = True
    except FileExistsError:
        try:
            descriptor = os.open(
                LOCK_FILE,
                os.O_RDWR | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0),
                dir_fd=repository_descriptor,
            )
        except OSError:
            raise SecretSetupError("The local lock file cannot be opened safely.") from None
    except OSError:
        raise SecretSetupError("The local lock file cannot be created safely.") from None

    try:
        if created:
            os.fchmod(descriptor, 0o600)
        _validate_private_file(descriptor, "The local lock file")
    except SecretSetupError:
        os.close(descriptor)
        if created:
            try:
                os.unlink(LOCK_FILE, dir_fd=repository_descriptor)
            except OSError:
                pass
        raise
    except OSError:
        os.close(descriptor)
        if created:
            try:
                os.unlink(LOCK_FILE, dir_fd=repository_descriptor)
            except OSError:
                pass
        raise SecretSetupError("The local lock file has unsafe permissions.") from None
    return descriptor


@contextmanager
def _exclusive_environment_lock(repository_descriptor: int) -> Iterator[None]:
    """Serialize helper updates using a private repository-local advisory lock."""
    descriptor = _open_lock_file(repository_descriptor)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX)
        except OSError:
            raise SecretSetupError("The local lock file could not be locked safely.") from None
        yield
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)


def _atomic_write_environment(repository_descriptor: int, data: bytes) -> None:
    """Atomically replace .env with a private file and no backup copy."""
    temporary_name = f".env.tmp.{secrets.token_hex(12)}"
    descriptor = -1
    try:
        descriptor = os.open(
            temporary_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=repository_descriptor,
        )
        os.fchmod(descriptor, 0o600)
        _validate_private_file(descriptor, "The temporary environment file")
        with os.fdopen(descriptor, "wb") as temporary_file:
            descriptor = -1
            temporary_file.write(data)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())

        current_descriptor = None
        try:
            current_descriptor = os.open(
                ENV_FILE,
                os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0),
                dir_fd=repository_descriptor,
            )
        except FileNotFoundError:
            pass
        except OSError:
            raise SecretSetupError("The existing .env changed to an unsafe file type.") from None
        if current_descriptor is not None:
            try:
                _validate_private_file(current_descriptor, ".env")
            finally:
                os.close(current_descriptor)

        os.replace(
            temporary_name,
            ENV_FILE,
            src_dir_fd=repository_descriptor,
            dst_dir_fd=repository_descriptor,
        )
        os.fsync(repository_descriptor)
    except SecretSetupError:
        raise
    except OSError:
        raise SecretSetupError("The local .env update failed; no backup was made.") from None
    finally:
        try:
            if descriptor >= 0:
                os.close(descriptor)
        finally:
            try:
                os.unlink(temporary_name, dir_fd=repository_descriptor)
            except FileNotFoundError:
                pass
            except OSError:
                pass


def _get_secret(prompt: str) -> str:
    """Prompt without echo, failing instead of falling back to echoed input."""
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        return getpass.getpass(prompt)


def _apply_values(
    repository_root: Path,
    keys: Sequence[str],
    secret_prompt: Callable[[str], str] | None,
    value_prompt: Callable[[str], str] | None,
) -> None:
    """Prompt, validate, and atomically merge selected values into local .env."""
    repository_descriptor = _open_directory_chain(repository_root)
    try:
        _read_environment(repository_descriptor)
        updates: dict[str, str] = {}
        for key in keys:
            prompt = f"{key}: "
            if key in SECRET_KEYS:
                value = (secret_prompt or _get_secret)(prompt)
            else:
                value = (value_prompt or input)(prompt)
            _validate_value(key, value)
            updates[key] = value

        with _exclusive_environment_lock(repository_descriptor):
            lines, _ = _read_environment(repository_descriptor)
            _atomic_write_environment(
                repository_descriptor,
                _merge_environment(lines, updates),
            )
    finally:
        os.close(repository_descriptor)


def _build_parser() -> SafeArgumentParser:
    """Create the CLI parser for preview-only and explicitly applied updates."""
    parser = SafeArgumentParser(
        description=(
            "Preview allowlisted local environment keys; values are prompted only with --apply."
        )
    )
    parser.add_argument(
        "--key",
        action="append",
        choices=ALLOWED_KEYS,
        metavar="KEY",
        help="allowlisted key to prompt for; repeat to set multiple keys",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write selected values to repository-local .env after interactive prompts",
    )
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    repository_root: Path | None = None,
    secret_prompt: Callable[[str], str] | None = None,
    value_prompt: Callable[[str], str] | None = None,
) -> int:
    """Run the preview or explicitly approved local secret setup operation."""
    parser = _build_parser()
    try:
        arguments = parser.parse_args(argv)
    except UsageError:
        print("secret_setup: invalid command-line options", file=sys.stderr)
        return 2

    keys = arguments.key or []
    if len(set(keys)) != len(keys) or (arguments.apply and not keys):
        print("secret_setup: select one or more distinct allowlisted keys", file=sys.stderr)
        return 2

    if not arguments.apply:
        print("Preview only: no values requested and no files changed.")
        if keys:
            print(f"Would prompt for and update: {', '.join(keys)}")
        else:
            print("Select keys with --key KEY; writes require the explicit --apply option.")
        return 0

    try:
        root = repository_root if repository_root is not None else _default_repository_root()
        _apply_values(root, keys, secret_prompt, value_prompt)
    except SecretSetupError as error:
        print(f"secret_setup: {error}", file=sys.stderr)
        return 2
    except getpass.GetPassWarning:
        print("secret_setup: terminal cannot safely disable echo; no changes made.", file=sys.stderr)
        return 2
    except (EOFError, KeyboardInterrupt):
        print("secret_setup: input canceled; no changes made.", file=sys.stderr)
        return 130
    except OSError:
        print("secret_setup: filesystem operation failed; no values were displayed.", file=sys.stderr)
        return 2

    print(f"Updated repository-local .env keys: {', '.join(keys)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
