#!/usr/bin/env python3
"""Preview or explicitly enable the source ChatGPT connector configuration."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import errno
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess
import sys
from typing import Callable, Mapping


MAX_CONFIG_BYTES = 2 * 1024 * 1024
TEST_FIXTURES_ROOT = Path("/tmp/opencode/testfixtures")
VERIFY_ENVIRONMENT_KEYS = (
    "HOME",
    "LANG",
    "OPENCODE_MCP_PROFILE",
    "OPENCODE_MCP_PROFILE_ROOT",
    "OPENCODE_WSL2_PILOT_DIR",
)


class SetupError(Exception):
    """Raised when source configuration cannot be safely previewed or applied."""


class DuplicateJSONKeyError(SetupError):
    """Raised when strict JSON contains a repeated key in any object."""


class BackupError(SetupError):
    """Raised when a backup exists but could not be confirmed as durable."""

    def __init__(self, backup_name: str, message: str) -> None:
        """Retain the adjacent backup name for an accurate failure report."""
        super().__init__(message)
        self.backup_name = backup_name


@dataclass(frozen=True)
class Snapshot:
    """A bounded config read and filesystem identity captured without following links."""

    content: bytes
    file_identity: tuple[int, ...]
    directory_identity: tuple[int, int]
    mode: int


@dataclass(frozen=True)
class Plan:
    """The complete source-config change previewed before any optional work."""

    root: Path
    target: Path
    snapshot: Snapshot
    current: dict[str, object]
    desired: dict[str, object]
    plugin_uri: str
    server: dict[str, object]
    plugin_added: bool
    server_added: bool

    @property
    def changed(self) -> bool:
        """Return whether applying the plan would change semantic config values."""
        return not exact_json_equal(self.current, self.desired)


@dataclass(frozen=True)
class SetupResult:
    """Report verified setup effects without implying unrelated runtime activity."""

    changed: bool
    backup: Path | None
    dependencies_installed: bool
    preflight_verified: bool


CommandRunner = Callable[[list[str], Path, Mapping[str, str] | None, int], int]
GitRootRunner = Callable[[Path], Path]


def file_identity(metadata: os.stat_result) -> tuple[int, ...]:
    """Return fields that reveal replacement or mutation during a guarded write."""
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
        metadata.st_uid,
        metadata.st_gid,
    )


def open_directory(path: Path) -> int:
    """Open an absolute directory by walking each component without following links."""
    if not path.is_absolute() or ".." in path.parts:
        raise SetupError(f"directory path is not a normalized absolute path: {path}")
    nofollow = getattr(os, "O_NOFOLLOW", None)
    directory = getattr(os, "O_DIRECTORY", None)
    if nofollow is None or directory is None:
        raise SetupError("this platform lacks safe no-follow directory opens")

    flags = os.O_RDONLY | directory | nofollow | getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(path.anchor, flags)
    except OSError as error:
        raise SetupError(f"cannot safely open directory root {path.anchor}: {error.strerror}") from error

    try:
        for component in path.parts[1:]:
            try:
                metadata = os.stat(component, dir_fd=descriptor, follow_symlinks=False)
            except OSError as error:
                raise SetupError(f"directory component is unavailable: {path}") from error
            if stat.S_ISLNK(metadata.st_mode):
                raise SetupError(f"symlink path components are not allowed: {path}")
            if not stat.S_ISDIR(metadata.st_mode):
                raise SetupError(f"path component is not a directory: {path}")
            try:
                child = os.open(component, flags, dir_fd=descriptor)
            except OSError as error:
                if error.errno in (errno.ELOOP, errno.ENOTDIR):
                    raise SetupError(f"symlink or non-directory path component: {path}") from error
                raise SetupError(f"cannot safely open directory {path}: {error.strerror}") from error
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def open_parent(path: Path) -> tuple[int, str]:
    """Open a target's parent directory without following any path component."""
    if not path.is_absolute() or ".." in path.parts or path.name in ("", "."):
        raise SetupError(f"target path is not a normalized absolute file path: {path}")
    return open_directory(path.parent), path.name


def require_regular_file(path: Path, *, executable: bool = False) -> None:
    """Require a non-symlink regular file reached only through non-symlink directories."""
    descriptor, name = open_parent(path)
    try:
        try:
            metadata = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
        except OSError as error:
            raise SetupError(f"required source file is unavailable: {path}") from error
        if stat.S_ISLNK(metadata.st_mode):
            raise SetupError(f"required source file is symlinked: {path}")
        if not stat.S_ISREG(metadata.st_mode):
            raise SetupError(f"required source path is not a regular file: {path}")
        if executable and not metadata.st_mode & 0o111:
            raise SetupError(f"required launcher is not executable: {path}")
    finally:
        os.close(descriptor)


def require_directory(path: Path) -> None:
    """Require a directory whose path contains no symlink components."""
    descriptor = open_directory(path)
    os.close(descriptor)


def git_checkout_root(root: Path) -> Path:
    """Ask Git for the selected checkout root using a read-only command."""
    environment = {"PATH": "/usr/bin:/bin", "GIT_OPTIONAL_LOCKS": "0"}
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
            env=environment,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SetupError("could not verify the source checkout with Git") from error
    output = result.stdout.rstrip("\r\n")
    if result.returncode != 0 or not output or any(ord(character) < 32 for character in output):
        raise SetupError("the helper is not inside a Git checkout")
    return Path(os.path.abspath(output))


def resolve_checkout(
    script_path: Path | None = None,
    git_root_runner: GitRootRunner = git_checkout_root,
) -> Path:
    """Resolve and verify the Git checkout containing this helper's source file."""
    source = Path(os.path.abspath(script_path or Path(__file__)))
    require_regular_file(source)
    if source.name != "setup-chatgpt.py" or source.parent.name != "scripts":
        raise SetupError("the helper must remain at scripts/setup-chatgpt.py in its checkout")
    root = source.parent.parent
    require_directory(root)
    actual = git_root_runner(root)
    if Path(os.path.abspath(actual)) != root:
        raise SetupError(f"helper path does not match the Git checkout root: {root}")
    return root


def resolve_config_target(argument: str | None, root: Path) -> Path:
    """Resolve an existing source config confined to this checkout or testfixtures."""
    if argument is None:
        candidate = root / "global" / "opencode.jsonc"
    else:
        candidate = Path(argument)
        if ".." in candidate.parts:
            raise SetupError("--config must not contain parent-directory components")
        if not candidate.is_absolute():
            candidate = Path.cwd() / candidate

    if ".." in candidate.parts:
        raise SetupError("config path must not contain parent-directory components")
    target = Path(os.path.abspath(candidate))
    allowed_roots = (root, TEST_FIXTURES_ROOT)
    if not any(target.is_relative_to(allowed_root) for allowed_root in allowed_roots):
        raise SetupError("--config must stay inside this checkout or /tmp/opencode/testfixtures")

    snapshot = read_snapshot(target)
    del snapshot
    return target


def read_snapshot_at(directory_fd: int, name: str, path: Path) -> Snapshot:
    """Read one bounded regular file through a pinned parent directory descriptor."""
    try:
        before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except OSError as error:
        raise SetupError(f"config file is unavailable: {path}") from error
    if stat.S_ISLNK(before.st_mode):
        raise SetupError(f"config file must not be a symlink: {path}")
    if not stat.S_ISREG(before.st_mode):
        raise SetupError(f"config path must be a regular file: {path}")
    if before.st_size > MAX_CONFIG_BYTES:
        raise SetupError(f"config exceeds the {MAX_CONFIG_BYTES}-byte read limit: {path}")

    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
    try:
        file_fd = os.open(name, flags, dir_fd=directory_fd)
    except OSError as error:
        raise SetupError(f"config file changed or cannot be opened safely: {path}") from error
    try:
        opened = os.fstat(file_fd)
        if not stat.S_ISREG(opened.st_mode):
            raise SetupError(f"config path must be a regular file: {path}")
        if file_identity(opened) != file_identity(before):
            raise SetupError(f"config changed while being read: {path}")
        try:
            chunks: list[bytes] = []
            remaining = MAX_CONFIG_BYTES + 1
            while remaining:
                chunk = os.read(file_fd, min(65536, remaining))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            content = b"".join(chunks)
            after = os.fstat(file_fd)
            current_path = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except OSError as error:
            raise SetupError(f"config could not be read safely: {path}") from error
        if file_identity(after) != file_identity(opened) or file_identity(current_path) != file_identity(opened):
            raise SetupError(f"config changed while being read: {path}")
        if len(content) > MAX_CONFIG_BYTES:
            raise SetupError(f"config exceeds the {MAX_CONFIG_BYTES}-byte read limit: {path}")
        directory_metadata = os.fstat(directory_fd)
        return Snapshot(
            content=content,
            file_identity=file_identity(after),
            directory_identity=(directory_metadata.st_dev, directory_metadata.st_ino),
            mode=stat.S_IMODE(after.st_mode),
        )
    finally:
        os.close(file_fd)


def read_snapshot(path: Path) -> Snapshot:
    """Open and capture a config file without following symlinks."""
    directory_fd, name = open_parent(path)
    try:
        return read_snapshot_at(directory_fd, name, path)
    finally:
        os.close(directory_fd)


def reject_duplicate_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Build a JSON object while refusing duplicate names at every nesting level."""
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateJSONKeyError(f"duplicate JSON key: {key!r}")
        result[key] = value
    return result


def reject_non_json_constant(value: str) -> object:
    """Reject Python's non-standard NaN and Infinity JSON extensions."""
    raise SetupError(f"non-standard JSON constant is not supported: {value}")


def parse_strict_json(content: bytes, path: Path) -> dict[str, object]:
    """Parse bounded UTF-8 strict JSON and report JSONC syntax explicitly."""
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SetupError(f"source config is not valid UTF-8: {path}") from error
    try:
        parsed = json.loads(
            text,
            object_pairs_hook=reject_duplicate_pairs,
            parse_constant=reject_non_json_constant,
        )
    except DuplicateJSONKeyError:
        raise
    except SetupError:
        raise
    except json.JSONDecodeError as error:
        raise SetupError(
            f"source config must be strict JSON; JSONC comments and trailing commas are unsupported "
            f"(line {error.lineno}, column {error.colno}): {path}"
        ) from error
    if not isinstance(parsed, dict):
        raise SetupError(f"source config root must be a JSON object: {path}")
    return parsed


def exact_json_equal(left: object, right: object) -> bool:
    """Compare JSON values without treating booleans as integers."""
    if type(left) is not type(right):
        return False
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(exact_json_equal(left[key], right[key]) for key in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(exact_json_equal(a, b) for a, b in zip(left, right))
    return left == right


def plugin_source_path(specifier: str, config_path: Path) -> Path | None:
    """Return the lexical filesystem path for a local plugin reference, if any."""
    if specifier.startswith("file://"):
        from urllib.parse import unquote, urlsplit

        parsed = urlsplit(specifier)
        if parsed.scheme != "file" or parsed.netloc not in ("", "localhost") or parsed.query or parsed.fragment:
            return None
        candidate = Path(unquote(parsed.path))
        if not candidate.is_absolute():
            return None
    elif specifier.startswith(("/", "./", "../")):
        candidate = Path(specifier)
        if not candidate.is_absolute():
            candidate = config_path.parent / candidate
    else:
        return None
    if ".." in candidate.parts:
        candidate = Path(os.path.normpath(candidate))
    return Path(os.path.abspath(candidate))


def build_server(root: Path) -> dict[str, object]:
    """Return the sole canonical local MCP server object for this checkout."""
    return {
        "type": "local",
        "command": [str(root / "scripts" / "chatgpt-mcp.sh")],
        "timeout": {"startup": 30000},
        "codemode": False,
        "disabled": False,
    }


def merge_config(
    current: dict[str, object], root: Path, config_path: Path
) -> tuple[dict[str, object], str, dict[str, object], bool, bool]:
    """Merge only the explicitly requested ChatGPT plugin and MCP entries."""
    package_root = root / "tools" / "chatgpt-connector"
    plugin_path = package_root / "server.ts"
    plugin_uri = package_root.as_uri()
    server = build_server(root)
    desired = json.loads(json.dumps(current))

    plugins_value = desired.get("plugins", [])
    if not isinstance(plugins_value, list):
        raise SetupError('top-level "plugins" must be an array to merge safely')
    matching_plugins: list[object] = []
    local_targets = {str(package_root), str(plugin_path)}
    for entry in plugins_value:
        if isinstance(entry, str):
            specifier = entry
        elif isinstance(entry, dict) and isinstance(entry.get("package"), str):
            specifier = entry["package"]
        else:
            raise SetupError("existing plugin entries must be strings or objects with a string package")
        local_path = plugin_source_path(specifier, config_path)
        if local_path is not None and str(local_path) in local_targets:
            matching_plugins.append(entry)

    if len(matching_plugins) > 1:
        raise SetupError("multiple ChatGPT plugin entries already target this connector; refusing to duplicate")
    if matching_plugins and matching_plugins[0] != plugin_uri:
        raise SetupError("a conflicting ChatGPT plugin entry already targets this connector; refusing to overwrite")
    plugin_added = not matching_plugins
    if plugin_added:
        plugins_value.append(plugin_uri)
        desired["plugins"] = plugins_value

    mcp_value = desired.get("mcp", {})
    if not isinstance(mcp_value, dict):
        raise SetupError('top-level "mcp" must be an object to merge safely')
    servers_value = mcp_value.get("servers", {})
    if not isinstance(servers_value, dict):
        raise SetupError('"mcp.servers" must be an object to merge safely')
    if "chatgpt" in servers_value:
        if not exact_json_equal(servers_value["chatgpt"], server):
            raise SetupError(
                'existing "mcp.servers.chatgpt" differs from the canonical source entry; refusing to overwrite'
            )
        server_added = False
    else:
        servers_value["chatgpt"] = server
        server_added = True
    mcp_value["servers"] = servers_value
    desired["mcp"] = mcp_value
    return desired, plugin_uri, server, plugin_added, server_added


def validate_source_paths(root: Path) -> tuple[Path, Path]:
    """Require the connector package and launcher sources used by the config."""
    require_directory(root)
    package_root = root / "tools" / "chatgpt-connector"
    require_directory(package_root)
    require_regular_file(package_root / "package.json")
    require_regular_file(package_root / "package-lock.json")
    require_regular_file(package_root / "server.ts")
    launcher = root / "scripts" / "chatgpt-mcp.sh"
    require_regular_file(launcher, executable=True)
    return package_root, launcher


def prepare(root: Path, config_argument: str | None) -> Plan:
    """Validate paths and strict JSON, then prepare an entirely read-only plan."""
    root = Path(os.path.abspath(root))
    package_root, _ = validate_source_paths(root)
    target = resolve_config_target(config_argument, root)
    snapshot = read_snapshot(target)
    current = parse_strict_json(snapshot.content, target)
    desired, plugin_uri, server, plugin_added, server_added = merge_config(current, root, target)
    if not exact_json_equal(current, desired):
        serialized = (json.dumps(desired, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
        if len(serialized) > MAX_CONFIG_BYTES:
            raise SetupError(f"updated config would exceed the {MAX_CONFIG_BYTES}-byte write limit")
    if package_root != root / "tools" / "chatgpt-connector":
        raise SetupError("connector package path does not match the verified checkout")
    return Plan(
        root=root,
        target=target,
        snapshot=snapshot,
        current=current,
        desired=desired,
        plugin_uri=plugin_uri,
        server=server,
        plugin_added=plugin_added,
        server_added=server_added,
    )


def default_command_runner(
    command: list[str],
    cwd: Path,
    environment: Mapping[str, str] | None,
    timeout: int,
) -> int:
    """Run one bounded, non-shell command and return only its status code."""
    result = subprocess.run(
        command,
        cwd=cwd,
        env=dict(environment) if environment is not None else None,
        capture_output=True,
        text=True,
        check=False,
        timeout=timeout,
    )
    return result.returncode


def write_all(file_fd: int, content: bytes) -> None:
    """Write all bytes even when the operating system performs a short write."""
    remaining = memoryview(content)
    while remaining:
        written = os.write(file_fd, remaining)
        if written <= 0:
            raise OSError("short write while saving config")
        remaining = remaining[written:]


def create_backup(directory_fd: int, filename: str, content: bytes, mode: int) -> str:
    """Create a complete exclusive backup beside the selected source config."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    for attempt in range(100):
        backup_name = f"{filename}.backup.{timestamp}.{attempt:02d}"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
        try:
            backup_fd = os.open(backup_name, flags, mode, dir_fd=directory_fd)
        except FileExistsError:
            continue
        created_metadata = os.fstat(backup_fd)
        try:
            os.fchmod(backup_fd, mode)
            write_all(backup_fd, content)
            os.fsync(backup_fd)
        except OSError:
            try:
                os.close(backup_fd)
            except OSError:
                pass
            try:
                current = os.stat(backup_name, dir_fd=directory_fd, follow_symlinks=False)
                if (current.st_dev, current.st_ino) == (created_metadata.st_dev, created_metadata.st_ino):
                    os.unlink(backup_name, dir_fd=directory_fd)
            except FileNotFoundError:
                pass
            except OSError as cleanup_error:
                raise BackupError(backup_name, f"partial backup may remain at {backup_name}") from cleanup_error
            raise
        else:
            try:
                os.close(backup_fd)
            except OSError as error:
                raise BackupError(
                    backup_name,
                    f"backup exists but could not be closed cleanly: {backup_name}",
                ) from error
            try:
                os.fsync(directory_fd)
            except OSError as error:
                raise BackupError(backup_name, f"backup exists but directory sync failed: {backup_name}") from error
            return backup_name
    raise SetupError("could not allocate a unique config backup name")


def atomic_replace(
    directory_fd: int,
    filename: str,
    content: bytes,
    mode: int,
    path: Path,
    expected: Snapshot,
) -> None:
    """Replace a file atomically after a final content and identity comparison."""
    temp_name = f".{filename}.tmp.{os.getpid()}.{secrets.token_hex(8)}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
    created = False
    try:
        temp_fd = os.open(temp_name, flags, mode, dir_fd=directory_fd)
        created = True
        try:
            os.fchmod(temp_fd, mode)
            write_all(temp_fd, content)
            os.fsync(temp_fd)
        finally:
            os.close(temp_fd)
        current = read_snapshot_at(directory_fd, filename, path)
        ensure_unchanged(current, expected, stage="immediately before atomic replacement")
        os.replace(temp_name, filename, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
        os.fsync(directory_fd)
    finally:
        if created:
            try:
                os.unlink(temp_name, dir_fd=directory_fd)
            except FileNotFoundError:
                pass


def ensure_unchanged(actual: Snapshot, expected: Snapshot, *, stage: str) -> None:
    """Refuse to overwrite a config whose bytes or filesystem identity changed."""
    if (
        actual.content != expected.content
        or actual.file_identity != expected.file_identity
        or actual.directory_identity != expected.directory_identity
    ):
        raise SetupError(f"source config changed concurrently {stage}; refusing to overwrite")


def verification_environment() -> dict[str, str]:
    """Pass only launcher profile selection and basic process environment values."""
    environment = {"PATH": "/usr/bin:/bin"}
    for key in VERIFY_ENVIRONMENT_KEYS:
        value = os.environ.get(key)
        if value is not None:
            environment[key] = value
    return environment


def dependency_note(installed: bool) -> str:
    """Describe the optional package install when a later phase fails."""
    return "dependencies were installed; " if installed else ""


def apply_plan(
    plan: Plan,
    *,
    install_dependencies: bool,
    command_runner: CommandRunner = default_command_runner,
) -> SetupResult:
    """Optionally install, verify the pinned launcher path, then write with backup/CAS guards."""
    package_root, launcher = validate_source_paths(plan.root)
    installed = False
    if install_dependencies:
        npm_command = [
            "npm",
            "--prefix",
            str(package_root),
            "ci",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
        ]
        try:
            npm_status = command_runner(npm_command, plan.root, None, 300)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise SetupError(
                "package-local npm ci could not complete; dependencies may be partially changed; "
                "source config was not edited"
            ) from error
        if npm_status != 0:
            raise SetupError(
                f"package-local npm ci failed with status {npm_status}; dependencies may be partially changed; "
                "source config was not edited"
            )
        installed = True

    try:
        verify_status = command_runner(
            [str(launcher), "--verify-only"],
            plan.root,
            verification_environment(),
            60,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        installed_note = "dependencies were installed; " if installed else ""
        raise SetupError(
            f"{installed_note}launcher --verify-only could not complete; source config was not edited"
        ) from error
    if verify_status != 0:
        installed_note = "dependencies were installed; " if installed else ""
        raise SetupError(
            f"{installed_note}launcher --verify-only failed with status {verify_status}; source config was not edited"
        )

    if not plan.changed:
        try:
            current = read_snapshot(plan.target)
            ensure_unchanged(current, plan.snapshot, stage="during runtime preflight")
        except (OSError, SetupError) as error:
            raise SetupError(f"{dependency_note(installed)}{error}; no config write was attempted") from error
        return SetupResult(False, None, installed, True)

    serialized = (json.dumps(plan.desired, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    try:
        directory_fd, filename = open_parent(plan.target)
    except (OSError, SetupError) as error:
        raise SetupError(
            f"{dependency_note(installed)}cannot safely open the source config directory; "
            "no config write was attempted"
        ) from error
    backup_path: Path | None = None
    try:
        try:
            directory_metadata = os.fstat(directory_fd)
        except OSError as error:
            raise SetupError(
                f"{dependency_note(installed)}cannot verify the config directory; no config write was attempted"
            ) from error
        if (directory_metadata.st_dev, directory_metadata.st_ino) != plan.snapshot.directory_identity:
            raise SetupError(
                f"{dependency_note(installed)}source config directory changed during preflight; "
                "refusing to overwrite"
            )
        try:
            current = read_snapshot_at(directory_fd, filename, plan.target)
            ensure_unchanged(current, plan.snapshot, stage="during runtime preflight")
        except (OSError, SetupError) as error:
            raise SetupError(f"{dependency_note(installed)}{error}; no config write was attempted") from error
        try:
            backup_name = create_backup(directory_fd, filename, plan.snapshot.content, plan.snapshot.mode)
        except BackupError as error:
            backup_path = plan.target.with_name(error.backup_name)
            raise SetupError(
                f"{dependency_note(installed)}backup exists but durability was not confirmed at {backup_path}; "
                "source config was not edited"
            ) from error
        except OSError as error:
            raise SetupError(
                f"{dependency_note(installed)}could not create the required adjacent source-config backup; "
                "config was not edited"
            ) from error
        except SetupError as error:
            raise SetupError(
                f"{dependency_note(installed)}could not create the required adjacent source-config backup; "
                f"config was not edited: {error}"
            ) from error
        backup_path = plan.target.with_name(backup_name)

        try:
            current = read_snapshot_at(directory_fd, filename, plan.target)
            ensure_unchanged(current, plan.snapshot, stage="after backup creation")
            atomic_replace(
                directory_fd,
                filename,
                serialized,
                plan.snapshot.mode,
                plan.target,
                plan.snapshot,
            )
            readback = read_snapshot_at(directory_fd, filename, plan.target)
            verified = parse_strict_json(readback.content, plan.target)
            if not exact_json_equal(verified, plan.desired):
                raise SetupError("source config readback did not match the requested merge")
        except (OSError, SetupError) as error:
            raise SetupError(
                f"{dependency_note(installed)}config write/readback failed; backup preserved at {backup_path}; "
                "inspect the source config before retrying"
            ) from error
    finally:
        try:
            os.close(directory_fd)
        except OSError as error:
            backup_status = f"backup preserved at {backup_path}" if backup_path is not None else "no backup was created"
            raise SetupError(
                f"{dependency_note(installed)}config operation ended with an uncertain readback; "
                f"{backup_status}"
            ) from error
    return SetupResult(True, backup_path, installed, True)


def build_parser() -> argparse.ArgumentParser:
    """Create the preview-first command-line interface."""
    parser = argparse.ArgumentParser(
        description="Preview and optionally enable the source ChatGPT connector configuration.",
        epilog=(
            "The default target is this checkout's global/opencode.jsonc; "
            "deployed runtime configs are never writable targets."
        ),
    )
    parser.add_argument(
        "--config",
        metavar="FILE",
        help="existing source config inside this checkout or /tmp/opencode/testfixtures",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="after launcher preflight, back up and atomically apply the source config merge",
    )
    parser.add_argument(
        "--install-dependencies",
        action="store_true",
        help="with --apply only, run package-local npm ci with lifecycle scripts disabled",
    )
    return parser


def print_plan(plan: Plan, *, applying: bool) -> None:
    """Print only the selected target and connector changes, never existing config contents."""
    print(f"config={plan.target}")
    print(f"plugin={plan.plugin_uri}")
    print(f"mcp.chatgpt.command={plan.server['command'][0]}")
    if not plan.changed:
        print("change=already canonical; no config rewrite planned")
    else:
        print(f"plugin_change={'would add' if plan.plugin_added else 'already present'}")
        print(f"mcp_change={'would add' if plan.server_added else 'already present'}")
    if not applying:
        print("mode=preview; no install, runtime check, directory creation, or config write performed")


def main(argv: list[str] | None = None) -> int:
    """Run the preview or explicitly authorized source-config application."""
    parser = build_parser()
    arguments = parser.parse_args(argv)
    if arguments.install_dependencies and not arguments.apply:
        parser.error("--install-dependencies requires --apply")
    try:
        root = resolve_checkout()
        plan = prepare(root, arguments.config)
        print_plan(plan, applying=arguments.apply)
        if not arguments.apply:
            return 0
        result = apply_plan(plan, install_dependencies=arguments.install_dependencies)
        if result.dependencies_installed:
            print("dependencies=installed")
        print("runtime_preflight=verified (--verify-only; no service or authentication started)")
        if result.changed:
            print(f"config=applied and read back successfully; backup={result.backup}")
        else:
            print("config=already canonical; no backup or rewrite needed")
        return 0
    except (OSError, SetupError) as error:
        print(f"setup-chatgpt: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
