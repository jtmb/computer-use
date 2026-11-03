#!/usr/bin/env python3
"""Canonical MCP policy, profile state, and runtime verification helpers."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from typing import Any
from urllib.request import urlopen


CANONICAL_ROOT = Path(__file__).resolve().parent.parent
POLICY_PATH = CANONICAL_ROOT / "config" / "mcp-versions.json"
SCRIPT_ROOT = CANONICAL_ROOT / "scripts"
# Optional ChatGPT source selection belongs to setup-chatgpt.py, not provisioning defaults.
MCP_NAMES = ("github",)
GLOBAL_MCP_NAMES = MCP_NAMES
MCP_PROFILES = ("native", "wsl2")
MAX_POLICY_BYTES = 64 * 1024
MAX_CONFIG_BYTES = 1024 * 1024
MAX_NODE_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_GITHUB_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_GITHUB_BINARY_BYTES = 64 * 1024 * 1024
MAX_GITHUB_METADATA_BYTES = 2 * 1024 * 1024
NATIVE_ROOT = Path.home() / ".local" / "share" / "opencode" / "mcp"
NATIVE_GITHUB_COMMAND = "./scripts/github-mcp.sh"


class McpRuntimeError(RuntimeError):
    """Raised when the canonical MCP policy or runtime is unsafe."""


def validate_profile(profile: str) -> None:
    """Reject profile names that could accidentally select another state root."""
    if profile not in MCP_PROFILES:
        raise McpRuntimeError(f"unsupported MCP profile: {profile}")


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise McpRuntimeError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _absolute(path: Path) -> Path:
    return Path(os.path.abspath(path.expanduser()))


def ensure_safe_path(path: Path, *, allow_missing: bool = True) -> Path:
    """Reject mounted/repository paths and symlinked ancestors."""
    absolute = _absolute(path)
    if absolute == Path("/mnt") or Path("/mnt") in absolute.parents:
        raise McpRuntimeError(f"refusing Windows-mounted MCP state: {absolute}")
    repository = _absolute(CANONICAL_ROOT)
    if absolute == repository or repository in absolute.parents:
        raise McpRuntimeError(f"refusing MCP state beneath the repository workspace: {absolute}")
    current = Path("/")
    for index, part in enumerate(absolute.parts[1:]):
        current /= part
        try:
            metadata = current.lstat()
        except FileNotFoundError:
            if not allow_missing:
                raise McpRuntimeError(f"required MCP path is missing: {current}") from None
            return absolute
        if stat.S_ISLNK(metadata.st_mode):
            raise McpRuntimeError(f"refusing symlinked MCP path or ancestor: {current}")
        if index < len(absolute.parts) - 2 and not stat.S_ISDIR(metadata.st_mode):
            raise McpRuntimeError(f"MCP path ancestor is not a directory: {current}")
    return absolute


def _open_regular_source(path: Path) -> int:
    """Pin no-follow directory descriptors before opening a selected file."""
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_DIRECTORY | os.O_CLOEXEC
    parent = os.open(path.anchor, flags)
    try:
        for part in path.parts[1:-1]:
            child = os.open(part, flags, dir_fd=parent)
            os.close(parent)
            parent = child
        return os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                       dir_fd=parent)
    finally:
        os.close(parent)


def _read_regular(path: Path, *, limit: int = MAX_POLICY_BYTES) -> bytes:
    """Read bounded bytes without following links or waiting on a swapped FIFO."""
    absolute = _absolute(path)
    try:
        current = Path("/")
        for part in absolute.parts[1:-1]:
            current /= part
            ancestor = current.lstat()
            if not stat.S_ISDIR(ancestor.st_mode) or stat.S_ISLNK(ancestor.st_mode):
                raise McpRuntimeError(f"unsafe canonical MCP file ancestor: {current}")
        if absolute.resolve() != absolute:
            raise McpRuntimeError(f"symlinked canonical MCP path: {absolute}")
        metadata = absolute.lstat()
    except OSError as error:
        raise McpRuntimeError(f"unavailable canonical MCP file: {absolute}") from error
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise McpRuntimeError(f"canonical MCP file is not a regular file: {absolute}")
    if metadata.st_size > limit:
        raise McpRuntimeError(f"canonical MCP file exceeds {limit} bytes: {absolute}")
    try:
        descriptor = _open_regular_source(absolute)
        try:
            opened = os.fstat(descriptor)
            if (not stat.S_ISREG(opened.st_mode) or _file_identity(opened) != _file_identity(metadata)
                    or absolute.resolve() != absolute):
                raise McpRuntimeError(f"canonical MCP file changed while opening: {absolute}")
            chunks: list[bytes] = []
            remaining = limit + 1
            while remaining:
                chunk = os.read(descriptor, min(65536, remaining))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            content = b"".join(chunks)
            if len(content) > limit:
                raise McpRuntimeError(f"canonical MCP file exceeds {limit} bytes: {absolute}")
            if (_file_identity(os.fstat(descriptor)) != _file_identity(opened)
                    or _file_identity(absolute.lstat()) != _file_identity(opened)
                    or absolute.resolve() != absolute):
                raise McpRuntimeError(f"canonical MCP file changed while reading: {absolute}")
            return content
        finally:
            os.close(descriptor)
    except OSError as error:
        raise McpRuntimeError(f"cannot read canonical MCP file: {absolute}") from error


def _file_identity(metadata: os.stat_result) -> tuple[int, ...]:
    """Compare sampled file identity and mutation metadata, not just byte length."""
    return (metadata.st_dev, metadata.st_ino, metadata.st_mode, metadata.st_size,
            metadata.st_mtime_ns, metadata.st_ctime_ns, metadata.st_uid, metadata.st_gid)


def load_policy() -> dict[str, Any]:
    """Load the one checked-in MCP version and endpoint policy."""
    try:
        value = json.loads(_read_regular(POLICY_PATH).decode("utf-8"), object_pairs_hook=_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise McpRuntimeError(f"cannot parse canonical MCP policy: {error}") from error
    if not isinstance(value, dict) or value.get("schemaVersion") != 2:
        raise McpRuntimeError("unsupported canonical MCP policy")
    retired_browser_fields = {"playwright", "playwrightBrowser", "playwrightBrowserRevision"}
    if retired_browser_fields.intersection(value):
        raise McpRuntimeError("retired Playwright MCP policy fields are forbidden")
    if "githubRemote" in value:
        raise McpRuntimeError("obsolete hosted GitHub MCP policy is forbidden")
    node_version = value.get("nodeVersion")
    node_archive = value.get("nodeArchive")
    node_sha256 = value.get("nodeSha256")
    node_url = value.get("nodeUrl")
    if (
        not isinstance(node_version, str)
        or not isinstance(node_archive, str)
        or not isinstance(node_sha256, str)
        or len(node_sha256) != 64
        or any(character not in "0123456789abcdef" for character in node_sha256.lower())
        or not isinstance(node_url, str)
        or not node_url.startswith("https://nodejs.org/dist/")
    ):
        raise McpRuntimeError("canonical Node.js runtime pin is invalid")
    expected_archive = f"node-v{node_version}-linux-x64.tar.xz"
    expected_url = f"https://nodejs.org/dist/v{node_version}/{expected_archive}"
    if node_archive != expected_archive or node_url != expected_url:
        raise McpRuntimeError("canonical Node.js archive and URL do not match the pinned version")
    github_version = value.get("githubVersion")
    github_archive = value.get("githubArchive")
    github_sha256 = value.get("githubSha256")
    github_url = value.get("githubUrl")
    if (
        not isinstance(github_version, str)
        or not github_version
        or not isinstance(github_archive, str)
        or not isinstance(github_sha256, str)
        or len(github_sha256) != 64
        or any(character not in "0123456789abcdef" for character in github_sha256.lower())
        or not isinstance(github_url, str)
    ):
        raise McpRuntimeError("canonical GitHub MCP runtime pin is invalid")
    expected_github_archive = "github-mcp-server_Linux_x86_64.tar.gz"
    expected_github_url = (
        "https://github.com/github/github-mcp-server/releases/download/"
        f"v{github_version}/{expected_github_archive}"
    )
    if github_archive != expected_github_archive or github_url != expected_github_url:
        raise McpRuntimeError("canonical GitHub MCP archive and URL do not match the pinned version")
    return value


def expected_marker(profile: str) -> dict[str, Any]:
    """Return the exact marker payload for one isolated runtime profile."""
    validate_profile(profile)
    policy = load_policy()
    marker = {
        "schemaVersion": 2,
        "profile": profile,
        "githubVersion": policy["githubVersion"],
        "githubSha256": policy["githubSha256"],
        "nodeVersion": policy["nodeVersion"],
    }
    return marker


def profile_paths(profile_root: Path) -> dict[str, Path]:
    """Return private state paths for a profile without creating them."""
    root = ensure_safe_path(profile_root)
    policy = load_policy()
    return {
        "root": root,
        "github": root / "mcp" / "github",
        "github_binary": root / "mcp" / "github" / "github-mcp-server",
        "node_root": root / "mcp" / "node" / f"node-v{policy['nodeVersion']}-linux-x64",
        "marker": root / "mcp" / "provisioned.json",
    }


def native_paths() -> dict[str, Path]:
    """Return native user-local MCP state without borrowing WSL profile state."""
    root = ensure_safe_path(Path(os.environ.get("OPENCODE_MCP_NATIVE_ROOT", str(NATIVE_ROOT))))
    policy = load_policy()
    node_root = root / "node" / f"node-v{policy['nodeVersion']}-linux-x64"
    return {
        "root": root,
        "github": root / "github",
        "github_binary": root / "github" / "github-mcp-server",
        "node_root": node_root,
        "marker": root / "provisioned.json",
    }


def prepare_profile(profile_root: Path, *, apply: bool) -> None:
    """Create or validate only the private directories owned by a profile."""
    mcp_servers("wsl2", profile_root)
    paths = profile_paths(profile_root)
    directories = (
        paths["root"],
        paths["root"] / "workspace",
        paths["root"] / "config",
        paths["root"] / "xdg" / "opencode",
        paths["root"] / "data",
        paths["root"] / "state",
        paths["root"] / "cache",
        paths["github"],
        paths["node_root"].parent,
    )
    for directory in directories:
        ensure_safe_path(directory)
        if not apply:
            if not directory.is_dir() or directory.is_symlink():
                raise McpRuntimeError(f"missing MCP profile directory: {directory}")
            continue
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        metadata = directory.lstat()
        if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
            raise McpRuntimeError(f"MCP profile path is not a real directory: {directory}")
        directory.chmod(0o700)


def prepare_native(*, apply: bool) -> None:
    """Create or validate native user-local MCP runtime state."""
    mcp_servers("native")
    paths = native_paths()
    directories = (
        paths["root"],
        paths["github"],
        paths["node_root"].parent,
    )
    for directory in directories:
        ensure_safe_path(directory)
        if not apply:
            if not directory.is_dir() or directory.is_symlink():
                raise McpRuntimeError(f"missing native MCP directory: {directory}")
            continue
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        metadata = directory.lstat()
        if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
            raise McpRuntimeError(f"native MCP path is not a real directory: {directory}")
        directory.chmod(0o700)


def _has_node_runtime(version: str, *, profile: str, profile_root: Path | None = None) -> bool:
    """Require the selected profile's trusted Node and npm at the pinned version."""
    try:
        node = resolve_runner(
            "node", os.environ.get("OPENCODE_MCP_NODE_BIN"), profile=profile, profile_root=profile_root
        )
        npm = resolve_runner(
            "npm", os.environ.get("OPENCODE_MCP_NPM_BIN"), profile=profile, profile_root=profile_root
        )
        # The version probe needs no inherited credentials; pass only the
        # minimum a Node/npm self-check requires.
        environment = {
            "HOME": os.environ.get("HOME", ""),
            "PATH": f"{node.parent}:/usr/bin:/bin",
            "LANG": os.environ.get("LANG", "C.UTF-8"),
        }
        node_result = subprocess.run(
            [str(node), "--version"], check=False, capture_output=True, text=True, env=environment, timeout=10
        )
        npm_result = subprocess.run(
            [str(npm), "--version"], check=False, capture_output=True, text=True, env=environment, timeout=10
        )
    except (McpRuntimeError, OSError, subprocess.TimeoutExpired):
        return False
    return node_result.returncode == 0 and node_result.stdout.strip() == f"v{version}" and npm_result.returncode == 0


def github_binary(profile: str, profile_root: Path | None = None) -> Path:
    """Return the selected profile's fixed GitHub MCP binary path."""
    validate_profile(profile)
    if profile == "native":
        if profile_root is not None:
            raise McpRuntimeError("native GitHub MCP resolution does not accept an isolated profile root")
        return native_paths()["github_binary"]
    if profile_root is None:
        raise McpRuntimeError("WSL2 GitHub MCP resolution requires an isolated profile root")
    return profile_paths(profile_root)["github_binary"]


def _has_github_runtime(path: Path, version: str) -> bool:
    """Require a trusted executable whose embedded CLI version matches policy."""
    try:
        ensure_safe_path(path, allow_missing=False)
        metadata = path.lstat()
        if (
            not stat.S_ISREG(metadata.st_mode)
            or stat.S_ISLNK(metadata.st_mode)
            or not os.access(path, os.X_OK)
            or metadata.st_uid not in (0, os.getuid())
            or stat.S_IMODE(metadata.st_mode) & 0o022
        ):
            return False
        result = subprocess.run(
            [str(path), "--version"],
            check=False,
            capture_output=True,
            text=True,
            env={"HOME": str(Path.home()), "PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"},
            timeout=10,
        )
    except (McpRuntimeError, FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False
    lines = result.stdout.splitlines()
    return result.returncode == 0 and f"Version: {version}" in lines


def ensure_github(*, profile: str, profile_root: Path | None = None, apply: bool) -> Path:
    """Return or install the selected profile's checksum-pinned GitHub MCP binary."""
    validate_profile(profile)
    policy = load_policy()
    target = github_binary(profile, profile_root)
    version = str(policy["githubVersion"])
    if _has_github_runtime(target, version):
        return target
    if not apply:
        raise McpRuntimeError(
            f"trusted GitHub MCP {version} is unavailable; rerun setup-mcps.sh --apply"
        )
    if target.exists() or target.is_symlink():
        raise McpRuntimeError(f"pinned GitHub MCP target exists but is not usable: {target}")
    ensure_safe_path(target)
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    target.parent.chmod(0o700)
    temporary_root = Path(tempfile.mkdtemp(prefix="github-mcp-runtime-", dir=str(target.parent)))
    archive_path = temporary_root / str(policy["githubArchive"])
    extracted_path = temporary_root / "github-mcp-server"
    try:
        with urlopen(str(policy["githubUrl"]), timeout=90) as response, archive_path.open("wb") as handle:
            digest = hashlib.sha256()
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_GITHUB_ARCHIVE_BYTES:
                    raise McpRuntimeError("pinned GitHub MCP archive exceeds the bounded download size")
                digest.update(chunk)
                handle.write(chunk)
        if digest.hexdigest() != str(policy["githubSha256"]):
            raise McpRuntimeError("pinned GitHub MCP archive checksum does not match the published policy")
        with tarfile.open(archive_path, mode="r:gz") as archive:
            members = archive.getmembers()
            expected_names = {"LICENSE", "README.md", "github-mcp-server"}
            if len(members) != len(expected_names) or {member.name for member in members} != expected_names:
                raise McpRuntimeError("pinned GitHub MCP archive has unexpected contents")
            if any(not member.isfile() for member in members):
                raise McpRuntimeError("pinned GitHub MCP archive contains an unsafe member")
            binary_member = archive.getmember("github-mcp-server")
            if binary_member.size <= 0 or binary_member.size > MAX_GITHUB_BINARY_BYTES:
                raise McpRuntimeError("pinned GitHub MCP archive binary exceeds its bounded size")
            if any(
                archive.getmember(name).size > MAX_GITHUB_METADATA_BYTES
                for name in ("LICENSE", "README.md")
            ):
                raise McpRuntimeError("pinned GitHub MCP archive metadata exceeds its bounded size")
            source = archive.extractfile(binary_member)
            if source is None:
                raise McpRuntimeError("pinned GitHub MCP archive binary cannot be read")
            with source, extracted_path.open("xb") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)
            extracted_path.chmod(0o700)
        os.replace(extracted_path, target)
    except (OSError, EOFError, tarfile.TarError, ValueError) as error:
        raise McpRuntimeError(f"cannot install pinned GitHub MCP {version}: {error}") from error
    finally:
        shutil.rmtree(temporary_root, ignore_errors=True)
    if not _has_github_runtime(target, version):
        try:
            target.unlink()
        except FileNotFoundError:
            pass
        raise McpRuntimeError("installed GitHub MCP runtime failed its executable/version verification")
    return target


def _load_marker(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(_read_regular(path).decode("utf-8"), object_pairs_hook=_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise McpRuntimeError(f"cannot parse MCP provisioning marker: {error}") from error
    if not isinstance(value, dict):
        raise McpRuntimeError("MCP provisioning marker is not an object")
    return value


def _marker_matches(marker: dict[str, Any], expected: dict[str, Any]) -> bool:
    """Match required runtime fields while ignoring harmless legacy metadata."""
    return all(marker.get(key) == value for key, value in expected.items())


def _write_marker(path: Path, value: dict[str, Any]) -> None:
    ensure_safe_path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists() or path.is_symlink():
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
            raise McpRuntimeError(f"MCP marker is not a regular file: {path}")
        mode = stat.S_IMODE(metadata.st_mode)
    else:
        mode = 0o600
    temporary = path.parent / f".{path.name}.{secrets.token_hex(12)}.tmp"
    try:
        with temporary.open("x", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
        temporary.chmod(mode)
        os.replace(temporary, path)
    except OSError as error:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise McpRuntimeError(f"cannot write MCP provisioning marker: {error}") from error


def mcp_provisioning(
    profile_root: Path | None = None,
    *,
    profile: str = "native",
    apply: bool,
    quiet: bool = False,
) -> None:
    """Verify or record the exact local runtimes for one selected profile."""
    validate_profile(profile)
    mcp_servers(profile, profile_root)
    expected = expected_marker(profile)
    marker_matches = False
    if profile == "native":
        paths = native_paths()
        if profile_root is not None:
            raise McpRuntimeError("native MCP provisioning does not accept an isolated profile root")
        if apply:
            prepare_native(apply=True)
        try:
            marker_matches = _marker_matches(_load_marker(paths["marker"]), expected)
        except McpRuntimeError:
            pass
        if not apply and not marker_matches:
            raise McpRuntimeError("native MCP provisioning marker is missing or stale; rerun setup-mcps.sh --apply")
        if not _has_node_runtime(str(expected["nodeVersion"]), profile="native"):
            raise McpRuntimeError("the canonical pinned native Node.js runtime is missing")
        if not _has_github_runtime(paths["github_binary"], str(expected["githubVersion"])):
            raise McpRuntimeError("the canonical pinned native GitHub MCP runtime is missing")
    else:
        if profile_root is None:
            raise McpRuntimeError("wsl2 MCP provisioning requires an isolated profile root")
        paths = profile_paths(profile_root)
        if apply:
            prepare_profile(profile_root, apply=True)
        try:
            marker_matches = _marker_matches(_load_marker(paths["marker"]), expected)
        except McpRuntimeError:
            pass
        if not apply and not marker_matches:
            raise McpRuntimeError("WSL2 MCP provisioning marker is missing or stale; rerun setup-mcps.sh --apply")
        if not _has_node_runtime(str(expected["nodeVersion"]), profile="wsl2", profile_root=profile_root):
            raise McpRuntimeError("the canonical pinned WSL2 Node.js runtime is missing")
        if not _has_github_runtime(paths["github_binary"], str(expected["githubVersion"])):
            raise McpRuntimeError("the canonical pinned WSL2 GitHub MCP runtime is missing")
    if apply and not marker_matches:
        _write_marker(paths["marker"], expected)
    if not quiet:
        print(f"OK: canonical {profile} MCP runtimes are provisioned: {paths['marker']}")


def _wrapper(name: str) -> Path:
    path = SCRIPT_ROOT / name
    try:
        metadata = path.lstat()
    except FileNotFoundError as error:
        raise McpRuntimeError(f"missing canonical MCP launcher: {path}") from error
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode) or not os.access(path, os.X_OK):
        raise McpRuntimeError(f"canonical MCP launcher is not a regular executable: {path}")
    return path


def mcp_servers(profile: str = "native", profile_root: Path | None = None) -> dict[str, dict[str, Any]]:
    """Return the one shared MCP declaration set for a native or WSL profile."""
    validate_profile(profile)
    names = MCP_NAMES if profile == "native" else GLOBAL_MCP_NAMES
    wrappers = {name: _wrapper(f"{name}-mcp.sh") for name in names}
    timeout = {"startup": 30_000}
    commands = {
        "github": NATIVE_GITHUB_COMMAND,
    }
    entries: dict[str, dict[str, Any]] = {
        name: {
            "type": "local",
            "command": [commands[name]],
            "disabled": False,
            "timeout": timeout.copy(),
        }
        for name in names
    }
    if profile == "native":
        if profile_root is not None:
            raise McpRuntimeError("native MCP declarations do not accept an isolated profile root")
        return entries
    if profile != "wsl2" or profile_root is None:
        raise McpRuntimeError(f"unsupported MCP profile: {profile}")
    root = ensure_safe_path(profile_root)
    environment = {
        "OPENCODE_MCP_PROFILE": "wsl2",
        "OPENCODE_MCP_PROFILE_ROOT": str(root),
    }
    for name in names:
        entries[name]["command"] = [str(wrappers[name])]
        entries[name]["cwd"] = str(root / "workspace")
        entries[name]["environment"] = environment.copy()
    return entries


def ensure_mcp_servers(data: dict[str, Any], *, profile: str, profile_root: Path | None = None) -> None:
    """Merge only the canonical MCP entries into one server config."""
    mcp = data.setdefault("mcp", {})
    if not isinstance(mcp, dict):
        raise McpRuntimeError("mcp must be an object")
    mcp.pop("basic-memory", None)
    timeout = mcp.setdefault("timeout", {})
    if not isinstance(timeout, dict):
        raise McpRuntimeError("mcp.timeout must be an object")
    timeout.update({"startup": 90_000, "catalog": 30_000, "execution": 600_000})
    servers = mcp.setdefault("servers", {})
    if not isinstance(servers, dict):
        raise McpRuntimeError("mcp.servers must be an object")
    servers.pop("basic-memory", None)
    if profile == "wsl2":
        mcp.pop("playwright", None)
        servers.pop("playwright", None)
    servers.update(mcp_servers(profile, profile_root))


def verify_mcp_servers(data: dict[str, Any], *, profile: str, profile_root: Path | None = None) -> None:
    """Require the exact shared declarations and reject credential fields."""
    mcp = data.get("mcp")
    servers = mcp.get("servers") if isinstance(mcp, dict) else None
    if not isinstance(servers, dict):
        raise McpRuntimeError("mcp.servers must be configured")
    if isinstance(mcp, dict) and "playwright" in mcp:
        raise McpRuntimeError("project MCP configuration contains a retired flat Playwright declaration")
    expected = mcp_servers(profile, profile_root)
    if set(servers) != set(expected):
        raise McpRuntimeError(f"MCP server set is not exactly canonical: {sorted(servers)}")
    for name in expected:
        if servers.get(name) != expected[name]:
            raise McpRuntimeError(f"MCP server {name} is not exactly canonical")
    serialized = json.dumps({name: servers[name] for name in expected}).lower()
    for marker in ("authorization", "personal_access_token", "api_key", "client_secret", "bearer", "token"):
        if marker in serialized:
            raise McpRuntimeError(f"credential field is forbidden in canonical MCP configuration: {marker}")


def global_mcp_servers() -> dict[str, dict[str, Any]]:
    """Return native global declarations for every canonical MCP."""
    entries = mcp_servers("native")
    for name in GLOBAL_MCP_NAMES:
        entries[name]["command"] = [str(_wrapper(f"{name}-mcp.sh"))]
    return {name: entries[name] for name in GLOBAL_MCP_NAMES}


def ensure_global_mcp_servers(data: dict[str, Any]) -> None:
    """Normalize only shared native global MCP entries and preserve unrelated servers."""
    mcp = data.setdefault("mcp", {})
    if not isinstance(mcp, dict):
        raise McpRuntimeError("mcp must be an object")
    mcp.pop("basic-memory", None)
    for name in MCP_NAMES:
        mcp.pop(name, None)
    mcp.pop("playwright", None)
    servers = mcp.setdefault("servers", {})
    if not isinstance(servers, dict):
        raise McpRuntimeError("mcp.servers must be an object")
    servers.pop("basic-memory", None)
    servers.pop("playwright", None)
    servers.update(global_mcp_servers())


def verify_global_mcp_servers(data: dict[str, Any]) -> None:
    """Require canonical global MCP entries without retired providers."""
    mcp = data.get("mcp")
    servers = mcp.get("servers") if isinstance(mcp, dict) else None
    if not isinstance(servers, dict):
        raise McpRuntimeError("mcp.servers must be configured")
    if "playwright" in servers:
        raise McpRuntimeError("global MCP configuration contains the retired project-only Playwright server")
    if "basic-memory" in servers:
        raise McpRuntimeError("global MCP configuration contains the retired Basic Memory server")
    expected = global_mcp_servers()
    for name, entry in expected.items():
        if servers.get(name) != entry:
            raise McpRuntimeError(f"global MCP server {name} is not exactly canonical")
    if any(name in mcp for name in (*MCP_NAMES, "playwright", "basic-memory")):
        raise McpRuntimeError("legacy flat MCP declarations remain in global configuration")
    serialized = json.dumps({name: servers[name] for name in expected}).lower()
    for marker in ("authorization", "personal_access_token", "api_key", "client_secret", "bearer", "token"):
        if marker in serialized:
            raise McpRuntimeError(f"credential field is forbidden in canonical MCP configuration: {marker}")


def _config_helper() -> Any:
    """Load the pure strict JSONC helper shared by file-config verification."""
    helper_path = SCRIPT_ROOT / "setup-opencode-jsonc.py"
    spec = importlib.util.spec_from_file_location("mcp_runtime_jsonc", helper_path)
    if spec is None or spec.loader is None:
        raise McpRuntimeError("cannot load strict JSONC helper")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except OSError as error:
        raise McpRuntimeError("strict JSONC helper is unavailable") from error
    return module


def load_config(path: Path) -> dict[str, Any]:
    """Load one bounded regular OpenCode JSON/JSONC configuration object."""
    return _parse_config_bytes(_read_regular(path, limit=MAX_CONFIG_BYTES), path)


def _parse_config_bytes(content: bytes, path: Path) -> dict[str, Any]:
    """Decode one already-bounded source snapshot without echoing config values."""
    try:
        text = content.decode("utf-8")
        value = _config_helper().parse_jsonc(text)
    except (UnicodeDecodeError, ValueError, RecursionError) as error:
        raise McpRuntimeError(f"cannot parse OpenCode configuration {path}: invalid or ambiguous JSONC") from error
    if not isinstance(value, dict):
        raise McpRuntimeError(f"OpenCode configuration is not an object: {path}")
    return value


def _config_transaction_helper() -> Any:
    """Load the source-only file transaction engine, never an installed profile."""
    spec = importlib.util.spec_from_file_location("mcp_config_transaction", SCRIPT_ROOT / "mcp_config_transaction.py")
    if spec is None or spec.loader is None:
        raise McpRuntimeError("cannot load config transaction helper")
    module = importlib.util.module_from_spec(spec)
    previous = sys.modules.get(spec.name)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except OSError as error:
        raise McpRuntimeError("config transaction helper is unavailable") from error
    finally:
        if previous is None:
            sys.modules.pop(spec.name, None)
        else:
            sys.modules[spec.name] = previous
    return module


def _render_mcp_config(original: bytes, value: dict[str, Any], path: Path) -> bytes:
    """Replace only the owned top-level MCP value, retaining all unrelated text."""
    current = _parse_config_bytes(original, path)
    other_current = {key: item for key, item in current.items() if key != "mcp"}
    other_desired = {key: item for key, item in value.items() if key != "mcp"}
    if (json.dumps(other_current, sort_keys=True, allow_nan=False)
            != json.dumps(other_desired, sort_keys=True, allow_nan=False)):
        raise McpRuntimeError("MCP configuration write would change unrelated settings")
    if not isinstance(value.get("mcp"), dict):
        raise McpRuntimeError("MCP configuration write requires one MCP object")
    try:
        rendered = _config_helper().replace_top_level(original.decode("utf-8"), "mcp", value["mcp"])
        encoded = rendered.encode("utf-8")
    except (UnicodeError, ValueError, RecursionError) as error:
        raise McpRuntimeError("cannot render bounded MCP configuration") from error
    if len(encoded) > MAX_CONFIG_BYTES:
        raise McpRuntimeError("canonical MCP configuration exceeds the bounded size")
    return encoded


def _require_config_digest(value: str | None) -> str:
    """Require an explicit lowercase SHA-256 from the selected preview."""
    if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise McpRuntimeError("global config writes/restore require --expect-sha256 from an exact preview")
    return value


def write_config(path: Path, value: dict[str, Any], *, expected_sha256: str | None = None) -> dict[str, Any]:
    """Publish one preview-bound MCP change through reversible source handling."""
    expected = _require_config_digest(expected_sha256)
    original = _read_regular(path, limit=MAX_CONFIG_BYTES)
    if hashlib.sha256(original).hexdigest() != expected:
        raise McpRuntimeError("configuration changed since preview")
    encoded = _render_mcp_config(original, value, path)
    transaction = _config_transaction_helper()
    try:
        return transaction.apply(_absolute(path), encoded, expected_sha256=expected)
    except transaction.ConfigTransactionError as error:
        raise McpRuntimeError(str(error)) from error


def configure_mcp_file(
    path: Path, *, scope: str, apply: bool, preview: bool = False,
    expected_sha256: str | None = None, restore_receipt: Path | None = None,
) -> dict[str, Any] | None:
    """Verify by default; preview, guarded apply or explicit restore are separate."""
    if preview and apply:
        raise McpRuntimeError("--preview and --apply are mutually exclusive")
    if scope == "project":
        if apply or preview or expected_sha256 is not None or restore_receipt is not None:
            raise McpRuntimeError("the portable project configuration is verification-only")
        verify_mcp_servers(load_config(path), profile="native")
        return
    if scope != "global":
        raise McpRuntimeError(f"unsupported MCP configuration scope: {scope}")
    if restore_receipt is not None:
        expected = _require_config_digest(expected_sha256)
        transaction = _config_transaction_helper()
        try:
            return transaction.restore(_absolute(path), _absolute(restore_receipt),
                                       expected_sha256=expected, apply=apply)
        except transaction.ConfigTransactionError as error:
            raise McpRuntimeError(str(error)) from error
    if expected_sha256 is not None and not apply:
        raise McpRuntimeError("--expect-sha256 is only used with --apply or --restore-receipt")
    if apply:
        _require_config_digest(expected_sha256)
    original = _read_regular(path, limit=MAX_CONFIG_BYTES)
    if apply and hashlib.sha256(original).hexdigest() != expected_sha256:
        raise McpRuntimeError("configuration changed since preview")
    data = _parse_config_bytes(original, path)
    if apply or preview:
        ensure_global_mcp_servers(data)
        verify_global_mcp_servers(data)
    if apply:
        return write_config(path, data, expected_sha256=expected_sha256)
    if preview:
        transaction = _config_transaction_helper()
        try:
            report = transaction.preview(_absolute(path), _render_mcp_config(original, data, path))
        except transaction.ConfigTransactionError as error:
            raise McpRuntimeError(str(error)) from error
        if report["current_sha256"] != hashlib.sha256(original).hexdigest():
            raise McpRuntimeError("configuration changed while preparing preview")
        return report
    verify_global_mcp_servers(data)


def _runner_candidates(kind: str, *, profile: str, profile_root: Path | None = None) -> list[Path]:
    """Return runners owned by the selected profile without cross-profile fallback."""
    validate_profile(profile)
    home = Path.home()
    if profile == "native":
        node_bin = native_paths()["node_root"] / "bin"
    else:
        if profile_root is None:
            raise McpRuntimeError("WSL2 runner resolution requires an isolated profile root")
        node_bin = profile_paths(profile_root)["node_root"] / "bin"
    values = {
        "gh": (home / ".local/bin/gh", Path("/usr/local/bin/gh"), Path("/usr/bin/gh")),
        "npx": (node_bin / "npx",),
        "npm": (node_bin / "npm",),
        "node": (node_bin / "node",),
    }
    if kind not in values:
        raise McpRuntimeError(f"unsupported trusted MCP runner: {kind}")
    return list(values[kind])


def resolve_runner(
    kind: str,
    override: str | None = None,
    *,
    profile: str = "native",
    profile_root: Path | None = None,
) -> Path:
    """Select an absolute executable owned by root/current user and not writable."""
    canonical = _runner_candidates(kind, profile=profile, profile_root=profile_root)
    candidates = [Path(override)] if override else canonical
    user_id = os.getuid()
    for candidate in candidates:
        if not candidate.is_absolute():
            continue
        try:
            resolved = candidate.resolve(strict=True)
            metadata = resolved.lstat()
        except (FileNotFoundError, OSError, RuntimeError):
            continue
        if not stat.S_ISREG(metadata.st_mode) or not os.access(resolved, os.X_OK):
            continue
        if metadata.st_uid not in (0, user_id) or stat.S_IMODE(metadata.st_mode) & 0o022:
            continue
        if kind in ("node", "npm", "npx"):
            try:
                expected = canonical[0].resolve(strict=False)
            except (OSError, RuntimeError):
                continue
            if resolved != expected:
                continue
        return resolved
    raise McpRuntimeError(f"{kind} is required at an absolute regular executable path owned by root or the current user")


def ensure_node(*, profile: str, profile_root: Path | None = None, apply: bool) -> Path:
    """Return or install the selected profile's checksum-pinned Node release."""
    validate_profile(profile)
    if profile == "native":
        if profile_root is not None:
            raise McpRuntimeError("native Node.js provisioning does not accept an isolated profile root")
        paths = native_paths()
    else:
        if profile_root is None:
            raise McpRuntimeError("WSL2 Node.js provisioning requires an isolated profile root")
        paths = profile_paths(profile_root)
    policy = load_policy()
    try:
        node = resolve_runner(
            "node",
            os.environ.get("OPENCODE_MCP_NODE_BIN"),
            profile=profile,
            profile_root=profile_root,
        )
        if _has_node_runtime(str(policy["nodeVersion"]), profile=profile, profile_root=profile_root):
            return node
    except McpRuntimeError:
        node = None
    if not apply:
        raise McpRuntimeError(
            f"trusted Node.js {policy['nodeVersion']} is unavailable; rerun setup-mcps.sh --apply"
        )
    root = paths["node_root"]
    ensure_safe_path(root)
    if root.exists() or root.is_symlink():
        raise McpRuntimeError(f"pinned Node.js target exists but is not usable: {root}")
    root.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    archive_name = str(policy["nodeArchive"])
    temporary_root = Path(tempfile.mkdtemp(prefix="node-runtime-", dir=str(root.parent)))
    archive_path = temporary_root / archive_name
    extract_root = temporary_root / "extract"
    try:
        with urlopen(str(policy["nodeUrl"]), timeout=90) as response, archive_path.open("wb") as handle:
            digest = hashlib.sha256()
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_NODE_ARCHIVE_BYTES:
                    raise McpRuntimeError("pinned Node.js archive exceeds the bounded download size")
                digest.update(chunk)
                handle.write(chunk)
        if digest.hexdigest() != str(policy["nodeSha256"]):
            raise McpRuntimeError("pinned Node.js archive checksum does not match the published policy")
        extract_root.mkdir(mode=0o700)
        with tarfile.open(archive_path, mode="r:*") as archive:
            members = archive.getmembers()
            for member in members:
                name = Path(member.name)
                if name.is_absolute() or ".." in name.parts:
                    raise McpRuntimeError("pinned Node.js archive contains an unsafe member")
            archive.extractall(extract_root, filter="data")
        extracted = extract_root / f"node-v{policy['nodeVersion']}-linux-x64"
        if not extracted.is_dir() or extracted.is_symlink():
            raise McpRuntimeError("pinned Node.js archive has an unexpected top-level directory")
        os.replace(extracted, root)
    except (OSError, EOFError, tarfile.TarError, ValueError) as error:
        raise McpRuntimeError(f"cannot install pinned Node.js {policy['nodeVersion']}: {error}") from error
    finally:
        shutil.rmtree(temporary_root, ignore_errors=True)
    node = resolve_runner(
        "node", str(root / "bin" / "node"), profile=profile, profile_root=profile_root
    )
    if not _has_node_runtime(str(policy["nodeVersion"]), profile=profile, profile_root=profile_root):
        raise McpRuntimeError("installed Node.js runtime failed its executable/version verification")
    return node


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action",
        choices=("policy", "prepare", "mcp-runtime", "runner", "node-runtime", "github-runtime", "config"),
    )
    parser.add_argument("--profile", default="native")
    parser.add_argument("--profile-root", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--kind", choices=("gh", "npx", "npm", "node"))
    parser.add_argument("--override")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--scope", choices=("global", "project"))
    parser.add_argument("--preview", action="store_true", help="preview a global config normalization without writes")
    parser.add_argument("--expect-sha256", help="exact current config SHA-256 required for apply/restore")
    parser.add_argument("--restore-receipt", type=Path, help="preview or explicitly apply one bound config restore")
    args = parser.parse_args()
    try:
        validate_profile(args.profile)
        if args.action != "config" and (args.preview or args.expect_sha256 is not None or args.restore_receipt is not None):
            raise McpRuntimeError("config preview/restore options are only valid for the config action")
        if args.action == "policy":
            policy = load_policy()
            if args.kind:
                keys = {"npm": "nodeVersion", "node": "nodeVersion"}
                if args.kind not in keys:
                    raise McpRuntimeError(f"policy has no package version for runner: {args.kind}")
                key = keys[args.kind]
                print(policy[key])
            else:
                print(json.dumps(policy, sort_keys=True))
        elif args.action == "runner":
            if args.kind is None:
                raise McpRuntimeError("--kind is required for runner resolution")
            print(
                resolve_runner(
                    args.kind,
                    args.override,
                    profile=args.profile,
                    profile_root=args.profile_root,
                )
            )
        elif args.action == "prepare":
            if args.profile == "native":
                if args.profile_root is not None:
                    raise McpRuntimeError("native MCP preparation does not accept an isolated profile root")
                prepare_native(apply=args.apply)
                target = native_paths()["root"]
            else:
                if args.profile_root is None:
                    raise McpRuntimeError("--profile-root is required for the WSL2 profile")
                prepare_profile(args.profile_root, apply=args.apply)
                target = _absolute(args.profile_root)
            if not args.quiet:
                print(f"OK: canonical {args.profile} MCP profile path is ready: {target}")
        elif args.action == "node-runtime":
            node = ensure_node(profile=args.profile, profile_root=args.profile_root, apply=args.apply)
            if not args.quiet:
                print(f"OK: trusted Node.js runtime: {node}")
        elif args.action == "github-runtime":
            github = ensure_github(profile=args.profile, profile_root=args.profile_root, apply=args.apply)
            if not args.quiet:
                print(github)
        elif args.action == "config":
            if args.config is None or args.scope is None:
                raise McpRuntimeError("config requires --config and --scope")
            receipt = configure_mcp_file(args.config, scope=args.scope, apply=args.apply,
                                         preview=args.preview, expected_sha256=args.expect_sha256,
                                         restore_receipt=args.restore_receipt)
            if receipt is not None and not args.quiet:
                print(json.dumps(receipt, indent=2))
            elif not args.quiet:
                print(f"OK: canonical {args.scope} MCP configuration: {_absolute(args.config)}")
        else:
            mcp_provisioning(
                args.profile_root,
                profile=args.profile,
                apply=args.apply,
                quiet=args.quiet,
            )
    except McpRuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
