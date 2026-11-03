"""Provide bounded, read-only Git preservation and archive audits."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import selectors
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence


SCHEMA = "delivery-preservation/v1"
MAX_STATUS_BYTES = 32 * 1024 * 1024
MAX_GIT_OUTPUT_BYTES = 128 * 1024 * 1024
MAX_STDERR_BYTES = 1024 * 1024
MAX_STATUS_RECORDS = 10_000
MAX_PATH_BYTES = 4096
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_WORKTREE_BYTES = 128 * 1024 * 1024
MAX_ARCHIVE_FILE_BYTES = 2 * 1024 * 1024
MAX_ARCHIVE_BYTES = 16 * 1024 * 1024
MAX_ARCHIVE_FILES = 256
MAX_ARCHIVE_GOALS = 64
MAX_REPORT_ITEMS = 1000
GIT_OVERRIDE_ENV = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
)
README_START = b"<!-- goal-docs:managed:start -->"
README_END = b"<!-- goal-docs:managed:end -->"


class AuditError(Exception):
    """Represent an unsafe, incomplete, or invalid audit input."""


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Reject duplicate JSON keys so evidence cannot be parser-dependent."""
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise AuditError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _reject_json_constant(value: str) -> None:
    """Reject non-standard JSON numeric constants."""
    raise AuditError(f"invalid JSON constant: {value}")


def _decode_json(data: bytes, label: str) -> object:
    """Decode bounded JSON while rejecting duplicate keys and NaN values."""
    try:
        return json.loads(
            data,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_json_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AuditError(f"invalid {label} JSON: {error}") from error


def _run_git(
    root: Path,
    arguments: Sequence[str],
    *,
    stdout_limit: int = MAX_STATUS_BYTES,
    check: bool = True,
) -> tuple[int, bytes, bytes]:
    """Run a read-only Git command with optional locks disabled and bounded output."""
    overrides = [name for name in GIT_OVERRIDE_ENV if os.environ.get(name)]
    if overrides:
        raise AuditError(
            "refusing ambiguous Git environment overrides: " + ", ".join(overrides)
        )

    environment = os.environ.copy()
    environment.update(
        {
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_PAGER": "cat",
            "PAGER": "cat",
        }
    )
    command = [
        "git",
        "--no-optional-locks",
        "--no-pager",
        "-c",
        "core.fsmonitor=false",
        "-C",
        str(root),
        *arguments,
    ]
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=environment,
        )
    except OSError as error:
        raise AuditError(f"could not start Git: {error}") from error

    if process.stdout is None or process.stderr is None:
        process.kill()
        raise AuditError("Git output pipes could not be opened")

    selector = selectors.DefaultSelector()
    output = {"stdout": bytearray(), "stderr": bytearray()}
    selector.register(process.stdout, selectors.EVENT_READ, "stdout")
    selector.register(process.stderr, selectors.EVENT_READ, "stderr")
    deadline = time.monotonic() + 60
    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                process.kill()
                process.wait()
                raise AuditError(f"Git command exceeded the 60-second limit: {arguments[0]}")
            events = selector.select(min(remaining, 1.0))
            for key, _ in events:
                chunk = os.read(key.fileobj.fileno(), 64 * 1024)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                stream = key.data
                output[stream].extend(chunk)
                stream_limit = stdout_limit if stream == "stdout" else MAX_STDERR_BYTES
                if len(output[stream]) > stream_limit:
                    process.kill()
                    process.wait()
                    raise AuditError(f"Git command output exceeded its bound: {arguments[0]}")
        returncode = process.wait(timeout=5)
    except subprocess.TimeoutExpired as error:
        process.kill()
        process.wait()
        raise AuditError(f"Git command did not exit: {arguments[0]}") from error
    finally:
        selector.close()
        process.stdout.close()
        process.stderr.close()

    stdout = bytes(output["stdout"])
    stderr = bytes(output["stderr"])
    if check and returncode != 0:
        detail = stderr.decode("utf-8", errors="replace").strip()
        raise AuditError(f"Git {arguments[0]} failed ({returncode}): {detail or 'no diagnostic'}")
    return returncode, stdout, stderr


def _git_text(root: Path, arguments: Sequence[str], *, check: bool = True) -> tuple[int, str]:
    """Run Git and decode its one-line textual output."""
    returncode, output, _ = _run_git(root, arguments, check=check, stdout_limit=1024 * 1024)
    return returncode, output.decode("utf-8", errors="surrogateescape").rstrip("\n")


def _hash(data: bytes) -> str:
    """Return the lowercase SHA-256 digest of bytes."""
    return hashlib.sha256(data).hexdigest()


def _safe_relative(path: str, *, archive: bool = False) -> bool:
    """Return whether a slash-separated path cannot escape its selected root."""
    if not path or path.startswith("/") or "\x00" in path:
        return False
    if archive and "\\" in path:
        return False
    parts = path.split("/")
    return all(part not in ("", ".", "..") for part in parts)


def _open_parent(root: Path, relative: str) -> tuple[int, str]:
    """Open a path's parent beneath root without following directory symlinks."""
    if not _safe_relative(relative):
        raise AuditError(f"unsafe relative path: {relative!r}")
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    current_fd = os.open(root, directory_flags)
    parts = relative.split("/")
    try:
        for part in parts[:-1]:
            next_fd = os.open(part, directory_flags, dir_fd=current_fd)
            os.close(current_fd)
            current_fd = next_fd
        return current_fd, parts[-1]
    except OSError:
        os.close(current_fd)
        raise


def _read_regular_at(parent_fd: int, name: str, limit: int) -> tuple[bytes, os.stat_result]:
    """Read one regular file without following a symlink and detect concurrent edits."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    file_fd = os.open(name, flags, dir_fd=parent_fd)
    try:
        before = os.fstat(file_fd)
        if not stat.S_ISREG(before.st_mode):
            raise AuditError(f"non-regular file refused: {name}")
        if before.st_size > limit:
            raise AuditError(f"file exceeds {limit}-byte audit limit: {name}")
        data = bytearray()
        while True:
            chunk = os.read(file_fd, min(64 * 1024, limit + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > limit:
                raise AuditError(f"file grew beyond {limit}-byte audit limit: {name}")
        after = os.fstat(file_fd)
        before_identity = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_mode)
        after_identity = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_mode)
        if before_identity != after_identity or len(data) != after.st_size:
            raise AuditError(f"file changed while being read: {name}")
        return bytes(data), after
    finally:
        os.close(file_fd)


def _snapshot_worktree_path(root: Path, relative: str) -> dict[str, object]:
    """Hash one dirty or untracked worktree path without following symlinks."""
    try:
        parent_fd, name = _open_parent(root, relative)
    except FileNotFoundError:
        return {"kind": "missing"}
    try:
        try:
            before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            return {"kind": "missing"}

        if stat.S_ISLNK(before.st_mode):
            target = os.readlink(name, dir_fd=parent_fd)
            target_bytes = os.fsencode(target) if isinstance(target, str) else target
            after = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            before_identity = (before.st_dev, before.st_ino, before.st_mtime_ns)
            after_identity = (after.st_dev, after.st_ino, after.st_mtime_ns)
            if before_identity != after_identity or not stat.S_ISLNK(after.st_mode):
                raise AuditError(f"symlink changed while being read: {relative}")
            return {
                "kind": "symlink",
                "mode": stat.S_IMODE(after.st_mode),
                "target_sha256": _hash(target_bytes),
                "target_size": len(target_bytes),
            }

        if not stat.S_ISREG(before.st_mode):
            raise AuditError(f"non-regular dirty path cannot be snapshotted: {relative}")
        data, after = _read_regular_at(parent_fd, name, MAX_FILE_BYTES)
        return {
            "kind": "file",
            "mode": stat.S_IMODE(after.st_mode),
            "sha256": _hash(data),
            "size": len(data),
        }
    finally:
        os.close(parent_fd)


def _parse_status(data: bytes) -> list[dict[str, object]]:
    """Parse bounded NUL-delimited porcelain-v2 status records."""
    records: list[dict[str, object]] = []
    fields = data.split(b"\x00")
    index = 0
    while index < len(fields):
        raw = fields[index]
        index += 1
        if not raw:
            continue
        if len(raw) > MAX_PATH_BYTES + 1024:
            raise AuditError("Git status record exceeds path-length bound")

        if raw.startswith(b"? "):
            path = os.fsdecode(raw[2:])
            record: dict[str, object] = {"kind": "untracked", "path": path}
        elif raw.startswith(b"! "):
            path = os.fsdecode(raw[2:])
            record = {"kind": "ignored", "path": path}
        elif raw.startswith(b"1 "):
            parts = raw.split(b" ", 8)
            if len(parts) != 9:
                raise AuditError("malformed porcelain-v2 ordinary status record")
            _, xy, submodule, head_mode, index_mode, worktree_mode, head_oid, index_oid, path_bytes = parts
            path = os.fsdecode(path_bytes)
            record = {
                "kind": "ordinary",
                "xy": xy.decode("ascii", errors="replace"),
                "submodule": submodule.decode("ascii", errors="replace"),
                "head_mode": head_mode.decode("ascii", errors="replace"),
                "index_mode": index_mode.decode("ascii", errors="replace"),
                "worktree_mode": worktree_mode.decode("ascii", errors="replace"),
                "head_oid": head_oid.decode("ascii", errors="replace"),
                "index_oid": index_oid.decode("ascii", errors="replace"),
                "path": path,
            }
        elif raw.startswith(b"2 "):
            parts = raw.split(b" ", 9)
            if len(parts) != 10 or index >= len(fields):
                raise AuditError("malformed porcelain-v2 rename status record")
            _, xy, submodule, head_mode, index_mode, worktree_mode, head_oid, index_oid, score, path_bytes = parts
            path = os.fsdecode(path_bytes)
            original_path = os.fsdecode(fields[index])
            index += 1
            record = {
                "kind": "rename",
                "xy": xy.decode("ascii", errors="replace"),
                "submodule": submodule.decode("ascii", errors="replace"),
                "head_mode": head_mode.decode("ascii", errors="replace"),
                "index_mode": index_mode.decode("ascii", errors="replace"),
                "worktree_mode": worktree_mode.decode("ascii", errors="replace"),
                "head_oid": head_oid.decode("ascii", errors="replace"),
                "index_oid": index_oid.decode("ascii", errors="replace"),
                "score": score.decode("ascii", errors="replace"),
                "path": path,
                "original_path": original_path,
            }
        elif raw.startswith(b"u "):
            parts = raw.split(b" ", 10)
            if len(parts) != 11:
                raise AuditError("malformed porcelain-v2 unmerged status record")
            record = {
                "kind": "unmerged",
                "xy": parts[1].decode("ascii", errors="replace"),
                "submodule": parts[2].decode("ascii", errors="replace"),
                "path": os.fsdecode(parts[10]),
            }
        else:
            raise AuditError("unsupported porcelain-v2 status record")

        if not _safe_relative(str(record["path"])):
            raise AuditError(f"unsafe Git status path: {record['path']!r}")
        if "original_path" in record and not _safe_relative(str(record["original_path"])):
            raise AuditError(f"unsafe Git rename source: {record['original_path']!r}")
        records.append(record)
        if len(records) > MAX_STATUS_RECORDS:
            raise AuditError(f"Git status exceeds {MAX_STATUS_RECORDS}-record limit")

    return sorted(
        records,
        key=lambda item: (
            str(item.get("path", "")),
            str(item.get("kind", "")),
            str(item.get("original_path", "")),
        ),
    )


def _status_paths(records: list[dict[str, object]]) -> list[str]:
    """Return unique paths mentioned in status records, including rename sources."""
    paths: set[str] = set()
    for record in records:
        paths.add(str(record["path"]))
        original = record.get("original_path")
        if isinstance(original, str):
            paths.add(original)
    return sorted(paths)


def _identity(root_argument: Path) -> tuple[Path, dict[str, object], Path]:
    """Resolve the selected worktree and report its exact Git directory identity."""
    try:
        requested_root = root_argument.expanduser().resolve(strict=True)
    except OSError as error:
        raise AuditError(f"repository path is unavailable: {error}") from error
    if not requested_root.is_dir():
        raise AuditError("repository path is not a directory")

    _, top_text = _git_text(requested_root, ["rev-parse", "--show-toplevel"])
    root = Path(top_text).resolve(strict=True)
    _, git_dir_text = _git_text(requested_root, ["rev-parse", "--absolute-git-dir"])
    git_dir = Path(git_dir_text).resolve(strict=True)
    _, common_text = _git_text(requested_root, ["rev-parse", "--git-common-dir"])
    common_path = Path(common_text)
    if not common_path.is_absolute():
        common_path = root / common_path
    common_dir = common_path.resolve(strict=True)

    _, head = _git_text(root, ["rev-parse", "--verify", "HEAD^{commit}"])
    branch_code, branch = _git_text(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], check=False)
    if branch_code not in (0, 1):
        raise AuditError("could not determine the current branch")
    _, index_text = _git_text(root, ["rev-parse", "--git-path", "index"])
    index_path = Path(index_text)
    if not index_path.is_absolute():
        index_path = root / index_path
    index_path = Path(os.path.abspath(index_path))

    return root, {
        "root": str(root),
        "git_dir": str(git_dir),
        "common_dir": str(common_dir),
        "branch": branch if branch_code == 0 else None,
        "head": head.lower(),
        "head_is_git_commit": True,
    }, index_path


def _read_external_file(path: Path, limit: int) -> bytes:
    """Read a regular file with a final-component no-follow guard."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        file_fd = os.open(path, flags)
    except OSError as error:
        raise AuditError(f"cannot safely read {path}: {error}") from error
    try:
        before = os.fstat(file_fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
            raise AuditError(f"non-regular or oversize audit input: {path}")
        data = bytearray()
        while True:
            chunk = os.read(file_fd, min(64 * 1024, limit + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > limit:
                raise AuditError(f"audit input grew beyond its limit: {path}")
        after = os.fstat(file_fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
        ) or len(data) != after.st_size:
            raise AuditError(f"audit input changed while being read: {path}")
        return bytes(data)
    finally:
        os.close(file_fd)


def _staged_patch_sha256(root: Path) -> str:
    """Hash deterministic staged binary-patch bytes without invoking diff drivers."""
    _, patch, _ = _run_git(
        root,
        [
            "diff",
            "--cached",
            "--binary",
            "--full-index",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            "--no-color",
        ],
        stdout_limit=MAX_GIT_OUTPUT_BYTES,
    )
    return _hash(patch)


def _current_status_records(root: Path) -> list[dict[str, object]]:
    """Read the bounded porcelain-v2 worktree/index scope."""
    _, status_bytes, _ = _run_git(
        root,
        [
            "status",
            "--porcelain=v2",
            "-z",
            "--untracked-files=all",
            "--ignore-submodules=none",
            "--no-ahead-behind",
        ],
        stdout_limit=MAX_STATUS_BYTES,
    )
    records = _parse_status(status_bytes)
    if len(records) > MAX_STATUS_RECORDS:
        raise AuditError("Git status exceeds record limit")
    return records


def _snapshot_status_paths(root: Path, records: list[dict[str, object]]) -> tuple[dict[str, dict[str, object]], int]:
    """Hash all reported dirty/untracked paths within the aggregate limit."""
    worktree_files: dict[str, dict[str, object]] = {}
    total_bytes = 0
    for relative in _status_paths(records):
        snapshot = _snapshot_worktree_path(root, relative)
        size = snapshot.get("size", snapshot.get("target_size", 0))
        if isinstance(size, int):
            total_bytes += size
        if total_bytes > MAX_WORKTREE_BYTES:
            raise AuditError(f"dirty-path snapshot exceeds {MAX_WORKTREE_BYTES}-byte limit")
        worktree_files[relative] = snapshot
    return worktree_files, total_bytes


def capture_state(root_argument: Path) -> dict[str, object]:
    """Capture Git identity, index, staged patch, status, and dirty-path hashes."""
    root, identity, index_path = _identity(root_argument)
    index_hash = _hash(_read_external_file(index_path, MAX_FILE_BYTES))
    patch_hash = _staged_patch_sha256(root)
    status_records = _current_status_records(root)
    worktree_files, total_bytes = _snapshot_status_paths(root, status_records)

    second_root, second_identity, second_index_path = _identity(root)
    second_index_hash = _hash(_read_external_file(second_index_path, MAX_FILE_BYTES))
    second_patch_hash = _staged_patch_sha256(second_root)
    second_status_records = _current_status_records(second_root)
    second_worktree_files, _ = _snapshot_status_paths(second_root, second_status_records)
    if (
        second_identity != identity
        or second_index_path != index_path
        or second_index_hash != index_hash
        or second_patch_hash != patch_hash
        or second_status_records != status_records
        or second_worktree_files != worktree_files
    ):
        raise AuditError("worktree changed during capture; no stable baseline was emitted")

    return {
        "schema": SCHEMA,
        "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        "read_only": True,
        "repository": identity,
        "git": {
            "index_path": str(index_path),
            "index_sha256": index_hash,
            "staged_patch_sha256": patch_hash,
            "status_records": status_records,
            "worktree_files": worktree_files,
            "status_count": len(status_records),
            "snapshot_bytes": total_bytes,
            "consistency": "two matching read-only samples; no repository lock was taken",
        },
        "limits": {
            "status_records": MAX_STATUS_RECORDS,
            "status_bytes": MAX_STATUS_BYTES,
            "per_file_bytes": MAX_FILE_BYTES,
            "aggregate_worktree_bytes": MAX_WORKTREE_BYTES,
            "staged_patch_bytes": MAX_GIT_OUTPUT_BYTES,
        },
        "writes_performed": [],
    }


def _is_hex_digest(value: object, lengths: tuple[int, ...]) -> bool:
    """Validate a lowercase hexadecimal object or content digest."""
    return (
        isinstance(value, str)
        and len(value) in lengths
        and all(character in "0123456789abcdef" for character in value)
    )


def _validate_baseline(value: dict[str, object]) -> None:
    """Reject malformed or unsafe baseline fields before comparing them."""
    repository = value.get("repository")
    git_state = value.get("git")
    if not isinstance(repository, dict) or not isinstance(git_state, dict):
        raise AuditError("baseline is missing repository or Git evidence")
    for field in ("root", "git_dir", "common_dir"):
        if not isinstance(repository.get(field), str) or not Path(repository[field]).is_absolute():
            raise AuditError(f"baseline repository.{field} is invalid")
    branch = repository.get("branch")
    if branch is not None and not isinstance(branch, str):
        raise AuditError("baseline branch is invalid")
    if repository.get("head_is_git_commit") is not True or not _is_hex_digest(repository.get("head"), (40, 64)):
        raise AuditError("baseline HEAD is not a verified Git commit ID")
    if not isinstance(git_state.get("index_path"), str):
        raise AuditError("baseline index path is invalid")
    for field in ("index_sha256", "staged_patch_sha256"):
        if not _is_hex_digest(git_state.get(field), (64,)):
            raise AuditError(f"baseline {field} is invalid")

    records = git_state.get("status_records")
    files = git_state.get("worktree_files")
    if (
        not isinstance(records, list)
        or len(records) > MAX_STATUS_RECORDS
        or not isinstance(files, dict)
        or len(files) > MAX_STATUS_RECORDS * 2
        or type(git_state.get("status_count")) is not int
        or git_state.get("status_count") != len(records)
    ):
        raise AuditError("baseline status or dirty-path evidence is invalid")
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("path"), str):
            raise AuditError("baseline status record is malformed")
        if not _safe_relative(record["path"]) or not isinstance(record.get("kind"), str):
            raise AuditError("baseline status path or kind is unsafe")
        original = record.get("original_path")
        if original is not None and (not isinstance(original, str) or not _safe_relative(original)):
            raise AuditError("baseline rename source is unsafe")
    for path, snapshot in files.items():
        if not isinstance(path, str) or not _safe_relative(path) or not isinstance(snapshot, dict):
            raise AuditError("baseline dirty-path snapshot is malformed")
        kind = snapshot.get("kind")
        if kind == "missing":
            continue
        if kind == "file":
            if (
                not _is_hex_digest(snapshot.get("sha256"), (64,))
                or type(snapshot.get("size")) is not int
                or snapshot["size"] < 0
                or type(snapshot.get("mode")) is not int
            ):
                raise AuditError(f"baseline file snapshot is invalid: {path}")
        elif kind == "symlink":
            if (
                not _is_hex_digest(snapshot.get("target_sha256"), (64,))
                or type(snapshot.get("target_size")) is not int
                or snapshot["target_size"] < 0
                or type(snapshot.get("mode")) is not int
            ):
                raise AuditError(f"baseline symlink snapshot is invalid: {path}")
        else:
            raise AuditError(f"baseline dirty-path kind is invalid: {path}")


def _load_baseline(path_argument: Path, root: Path) -> dict[str, object]:
    """Load an external snapshot baseline without following its final symlink."""
    supplied_path = path_argument.expanduser()
    try:
        if stat.S_ISLNK(os.lstat(supplied_path).st_mode):
            raise AuditError("baseline symlink refused")
    except FileNotFoundError as error:
        raise AuditError("baseline is unavailable") from error
    try:
        baseline_path = supplied_path.resolve(strict=True)
    except OSError as error:
        raise AuditError(f"baseline is unavailable: {error}") from error
    try:
        baseline_path.relative_to(root)
    except ValueError:
        pass
    else:
        raise AuditError("baseline must be outside the worktree so it cannot dirty the audit target")
    decoded = _decode_json(_read_external_file(baseline_path, MAX_WORKTREE_BYTES), "baseline")
    if not isinstance(decoded, dict) or decoded.get("schema") != SCHEMA:
        raise AuditError("baseline schema is unsupported")
    _validate_baseline(decoded)
    return decoded


def _limited(values: list[object]) -> dict[str, object]:
    """Bound a potentially large report list while preserving the omitted count."""
    return {"items": values[:MAX_REPORT_ITEMS], "omitted": max(0, len(values) - MAX_REPORT_ITEMS)}


def _compare_baseline(
    baseline: dict[str, object],
    current: dict[str, object],
    allowed_paths: set[str],
) -> dict[str, object]:
    """Compare exact repository, Git, status, and dirty-file evidence."""
    baseline_repo = baseline["repository"]
    baseline_git = baseline["git"]
    current_repo = current["repository"]
    current_git = current["git"]
    if not isinstance(baseline_repo, dict) or not isinstance(baseline_git, dict):
        raise AuditError("baseline repository or Git evidence is malformed")
    if not isinstance(current_repo, dict) or not isinstance(current_git, dict):
        raise AuditError("current repository or Git evidence is malformed")

    checks: list[dict[str, object]] = []

    def check(name: str, expected: object, actual: object) -> None:
        checks.append({"name": name, "passed": expected == actual, "expected": expected, "actual": actual})

    for field in ("root", "git_dir", "common_dir"):
        check(f"repository.{field}", baseline_repo.get(field), current_repo.get(field))
    for field in ("branch", "head"):
        check(f"repository.{field}", baseline_repo.get(field), current_repo.get(field))
    for field in ("index_sha256", "staged_patch_sha256"):
        check(f"git.{field}", baseline_git.get(field), current_git.get(field))

    baseline_records = baseline_git.get("status_records")
    current_records = current_git.get("status_records")
    baseline_files = baseline_git.get("worktree_files")
    current_files = current_git.get("worktree_files")
    if not isinstance(baseline_records, list) or not isinstance(current_records, list):
        raise AuditError("baseline or current status records are malformed")
    if not isinstance(baseline_files, dict) or not isinstance(current_files, dict):
        raise AuditError("baseline or current dirty-path evidence is malformed")
    if any(not isinstance(record, dict) for record in [*baseline_records, *current_records]):
        raise AuditError("baseline or current status record is malformed")

    baseline_paths = set(str(path) for path in baseline_files)
    baseline_paths.update(_status_paths(baseline_records))

    filtered_current_records = [
        item
        for item in current_records
        if not (item.get("path") in allowed_paths and item.get("path") not in baseline_paths)
    ]
    filtered_current_records.sort(
        key=lambda item: (
            str(item.get("path", "")),
            str(item.get("kind", "")),
            str(item.get("original_path", "")),
        )
    )
    check("git.status_records", baseline_records, filtered_current_records)

    file_changes: list[dict[str, object]] = []
    for path, expected_snapshot in sorted(baseline_files.items()):
        actual_snapshot = current_files.get(path)
        if expected_snapshot != actual_snapshot:
            file_changes.append({"path": path, "expected": expected_snapshot, "actual": actual_snapshot})
    checks.append(
        {
            "name": "git.dirty_path_content_and_mode",
            "passed": not file_changes,
            "changed_paths": _limited(file_changes),
        }
    )

    allowed_present = sorted(
        path
        for path in allowed_paths
        if path not in baseline_paths and path in current_files
    )
    passed = all(bool(item.get("passed")) for item in checks)
    return {
        "passed": passed,
        "checks": checks,
        "allowed_new_paths": allowed_present,
        "allow_list_does_not_exempt_baseline_paths": True,
    }


def _read_archive_file(root: Path, relative: str) -> bytes:
    """Read a bounded regular archive file beneath root without symlink traversal."""
    if not _safe_relative(relative, archive=True):
        raise AuditError(f"unsafe archive path: {relative!r}")
    try:
        parent_fd, name = _open_parent(root, relative)
    except FileNotFoundError as error:
        raise AuditError(f"missing archive file: {relative}") from error
    try:
        try:
            metadata = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError as error:
            raise AuditError(f"missing archive file: {relative}") from error
        if not stat.S_ISREG(metadata.st_mode):
            raise AuditError(f"non-regular archive file: {relative}")
        data, _ = _read_regular_at(parent_fd, name, MAX_ARCHIVE_FILE_BYTES)
        return data
    finally:
        os.close(parent_fd)


def audit_archive(root_argument: Path) -> dict[str, object]:
    """Verify a goal-docs ownership manifest without repairing or querying live goals."""
    try:
        root = root_argument.expanduser().resolve(strict=True)
    except OSError as error:
        raise AuditError(f"archive root is unavailable: {error}") from error
    if not root.is_dir():
        raise AuditError("archive root is not a directory")

    manifest_bytes = _read_archive_file(root, ".goal-docs-manifest.json")
    manifest_value = _decode_json(manifest_bytes, "archive manifest")
    if not isinstance(manifest_value, dict):
        raise AuditError("archive manifest must be an object")
    manifest = manifest_value
    files = manifest.get("files")
    goals = manifest.get("goals")
    transfers = manifest.get("transfers")
    errors: list[str] = []
    if (
        type(manifest.get("version")) is not int
        or manifest.get("version") != 1
        or manifest.get("owner") != "goal-docs"
        or not isinstance(files, dict)
        or not isinstance(goals, dict)
        or not isinstance(transfers, dict)
        or len(files) > MAX_ARCHIVE_FILES
        or len(goals) > MAX_ARCHIVE_GOALS
        or len(transfers) > 200
    ):
        raise AuditError("invalid or over-budget goal-docs archive manifest")

    for name, digest in files.items():
        if not isinstance(name, str) or not _safe_relative(name, archive=True):
            errors.append(f"unsafe archive manifest path: {name!r}")
        if not isinstance(digest, str) or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            errors.append(f"invalid archive digest: {name!r}")

    payload = {
        "version": manifest["version"],
        "owner": manifest["owner"],
        "files": files,
        "goals": goals,
        "transfers": transfers,
    }
    try:
        integrity_bytes = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise AuditError(f"archive manifest cannot be serialized: {error}") from error
    integrity_actual = _hash(integrity_bytes)
    if manifest.get("integrity") != integrity_actual:
        errors.append("archive manifest integrity mismatch")

    total_bytes = len(manifest_bytes)
    loaded: dict[str, bytes] = {}
    mismatches: list[dict[str, object]] = []
    for name, expected in files.items():
        if not isinstance(name, str) or not _safe_relative(name, archive=True):
            continue
        try:
            content = _read_archive_file(root, name)
        except AuditError as error:
            errors.append(str(error))
            continue
        total_bytes += len(content)
        if total_bytes > MAX_ARCHIVE_BYTES:
            raise AuditError(f"archive exceeds {MAX_ARCHIVE_BYTES}-byte aggregate limit")
        loaded[name] = content
        owned_content = content
        if name == "README.md":
            if content.count(README_START) != 1 or content.count(README_END) != 1:
                errors.append("invalid README managed ownership block")
                continue
            start = content.index(README_START)
            end = content.index(README_END)
            if end < start:
                errors.append("invalid README managed ownership block ordering")
                continue
            owned_content = content[start : end + len(README_END)]
        actual = _hash(owned_content)
        if actual != expected:
            mismatch = {"path": name, "expected_sha256": expected, "actual_sha256": actual}
            mismatches.append(mismatch)
            errors.append(f"archive hash mismatch: {name}")

    for directory, record in goals.items():
        if not isinstance(directory, str) or not _safe_relative(directory, archive=True) or "/" in directory:
            errors.append(f"unsafe goal archive directory: {directory!r}")
            continue
        if not isinstance(record, dict):
            errors.append(f"invalid goal archive record: {directory}")
            continue
        if (
            not isinstance(record.get("goalID"), str)
            or not isinstance(record.get("sourceSessionID"), str)
            or not isinstance(record.get("sourceDirectory"), str)
            or not isinstance(record.get("status"), str)
            or type(record.get("planRevision")) is not int
        ):
            errors.append(f"incomplete goal archive record: {directory}")
            continue
        for filename in ("plan.md", "HANDOFF.md", "work-history.md", "snapshot.json"):
            relative = f"{directory}/{filename}"
            if relative not in files or relative not in loaded:
                errors.append(f"missing mandatory archive file: {relative}")
        snapshot_bytes = loaded.get(f"{directory}/snapshot.json")
        if snapshot_bytes is None:
            continue
        snapshot_value = _decode_json(snapshot_bytes, f"snapshot {directory}")
        if not isinstance(snapshot_value, dict):
            errors.append(f"invalid snapshot object: {directory}")
            continue
        goal = snapshot_value.get("goal")
        source = snapshot_value.get("source")
        if not isinstance(goal, dict) or not isinstance(source, dict):
            errors.append(f"archive source identity missing: {directory}")
            continue
        expected_identity = (
            goal.get("id") == record.get("goalID") == directory
            and goal.get("sessionID") == record.get("sourceSessionID")
            and source.get("sessionID") == record.get("sourceSessionID")
            and source.get("directory") == record.get("sourceDirectory")
        )
        if not expected_identity:
            errors.append(f"archive source identity mismatch: {directory}")
        if goal.get("status") != record.get("status") or goal.get("planRevision") != record.get("planRevision"):
            errors.append(f"archive index/snapshot drift: {directory}")
        generated = snapshot_value.get("generatedFiles")
        if not isinstance(generated, dict):
            errors.append(f"snapshot generatedFiles map missing: {directory}")
            continue
        for filename in ("plan.md", "HANDOFF.md", "work-history.md"):
            relative = f"{directory}/{filename}"
            if generated.get(filename) != files.get(relative):
                errors.append(f"snapshot/manifest generated-file hash mismatch: {relative}")

    confirmation_bytes = 0
    try:
        confirmed_manifest = _read_archive_file(root, ".goal-docs-manifest.json")
    except AuditError:
        errors.append("archive manifest changed or became unreadable during audit")
    else:
        confirmation_bytes += len(confirmed_manifest)
        if confirmed_manifest != manifest_bytes:
            errors.append("archive manifest changed during audit")
        for name, original_content in loaded.items():
            try:
                confirmed_content = _read_archive_file(root, name)
            except AuditError:
                errors.append(f"archive file changed or became unreadable during audit: {name}")
                continue
            confirmation_bytes += len(confirmed_content)
            if confirmation_bytes > MAX_ARCHIVE_BYTES:
                raise AuditError(f"archive recheck exceeds {MAX_ARCHIVE_BYTES}-byte aggregate limit")
            if confirmed_content != original_content:
                errors.append(f"archive file changed during audit: {name}")

    return {
        "status": "match" if not errors else "mismatch",
        "root": str(root),
        "manifest_integrity_sha256": integrity_actual,
        "owned_file_count": len(files),
        "loaded_file_count": len(loaded),
        "goal_count": len(goals),
        "archive_bytes_read": total_bytes + confirmation_bytes,
        "hash_mismatches": _limited(mismatches),
        "errors": _limited(errors),
        "freshness": "not queried; a supported source-qualified goal checkpoint was not supplied",
        "consistency": "two read-only samples; no archive lock was taken",
        "repair_or_writer_invoked": False,
    }


def _validate_branch_name(root: Path, name: str) -> str:
    """Validate a local branch name and return its fully qualified ref."""
    if not name or name.startswith("-") or name.startswith("refs/"):
        raise AuditError("target must be a local branch name, not a revision expression or ref path")
    code, _, _ = _run_git(root, ["check-ref-format", f"refs/heads/{name}"], check=False, stdout_limit=1024)
    if code != 0:
        raise AuditError(f"invalid local target branch name: {name}")
    return f"refs/heads/{name}"


def _release_proposal(root: Path, current: dict[str, object], preservation: dict[str, object], target_name: str) -> dict[str, object]:
    """Assess local structural merge prerequisites without creating merge objects."""
    repository = current["repository"]
    git_state = current["git"]
    if not isinstance(repository, dict) or not isinstance(git_state, dict):
        raise AuditError("current Git evidence is malformed")
    target_ref = _validate_branch_name(root, target_name)
    blockers: list[str] = []
    target_code, target_output, _ = _run_git(
        root,
        ["show-ref", "--verify", "--hash", target_ref],
        check=False,
        stdout_limit=1024,
    )
    target_head = target_output.decode("ascii", errors="replace").strip() if target_code == 0 else None
    if target_head is None:
        blockers.append("target_local_branch_missing; no fetch was attempted")

    source_branch = repository.get("branch")
    if source_branch is None:
        blockers.append("source_HEAD_is_detached")
    elif source_branch == target_name:
        blockers.append("source_and_target_are_the_same_branch")

    if git_state.get("status_count") != 0:
        blockers.append("worktree_or_index_is_not_clean")
    if not preservation.get("passed"):
        blockers.append("preservation_baseline_did_not_match")

    ahead = behind = None
    merge_base = None
    committed_paths: list[dict[str, str]] = []
    if target_head is not None:
        counts_code, counts_text = _git_text(
            root,
            ["rev-list", "--left-right", "--count", f"{target_ref}...HEAD"],
            check=False,
        )
        if counts_code != 0:
            blockers.append("commit_range_could_not_be_read")
        else:
            pieces = counts_text.split()
            if len(pieces) != 2 or not all(piece.isdigit() for piece in pieces):
                blockers.append("commit_range_output_was_invalid")
            else:
                behind, ahead = (int(pieces[0]), int(pieces[1]))
                if ahead == 0:
                    blockers.append("source_has_no_commits_missing_from_target")
        base_code, base_text = _git_text(root, ["merge-base", target_ref, "HEAD"], check=False)
        if base_code == 0:
            merge_base = base_text
            scope_code, scope_bytes, _ = _run_git(
                root,
                [
                    "diff",
                    "--name-status",
                    "-z",
                    "--no-renames",
                    "--no-ext-diff",
                    "--no-textconv",
                    f"{target_ref}...HEAD",
                ],
                check=False,
                stdout_limit=MAX_STATUS_BYTES,
            )
            if scope_code == 0:
                committed_paths = _parse_name_status(scope_bytes)
            else:
                blockers.append("committed_path_scope_could_not_be_read")
        else:
            blockers.append("source_and_target_have_no_common_ancestor")

    structural = not blockers
    return {
        "source_branch": source_branch,
        "source_head_commit": repository.get("head"),
        "target_branch": target_name,
        "target_ref": target_ref,
        "target_head_commit": target_head,
        "ahead_commits": ahead,
        "behind_commits": behind,
        "merge_base_commit": merge_base,
        "committed_path_scope": _limited(committed_paths),
        "status": "structural_candidate_for_parent_review" if structural else "blocked",
        "blockers": blockers,
        "conflict_check": "not_run; a full merge-tree write can create Git objects",
        "actual_merge_performed": False,
        "commit_created": False,
        "push_performed": False,
        "final_merge_ready": False,
        "separate_release_branch_created": False,
        "remote_state_checked": False,
    }


def _status_summary(records: list[dict[str, object]]) -> dict[str, int]:
    """Count status records by type for a compact audit result."""
    summary: dict[str, int] = {}
    for record in records:
        kind = str(record.get("kind", "unknown"))
        summary[kind] = summary.get(kind, 0) + 1
    return summary


def _parse_name_status(data: bytes) -> list[dict[str, str]]:
    """Parse bounded NUL-delimited, no-renames committed path scope."""
    fields = data.split(b"\x00")
    if fields and not fields[-1]:
        fields.pop()
    if len(fields) % 2:
        raise AuditError("malformed committed name-status output")
    if len(fields) // 2 > MAX_STATUS_RECORDS:
        raise AuditError("committed path scope exceeds record limit")
    result: list[dict[str, str]] = []
    for index in range(0, len(fields), 2):
        status = fields[index].decode("ascii", errors="replace")
        path = os.fsdecode(fields[index + 1])
        if not status or len(status) > 2 or not _safe_relative(path):
            raise AuditError("unsafe or malformed committed path scope")
        result.append({"status": status, "path": path})
    return result


def run_audit(arguments: argparse.Namespace) -> tuple[dict[str, object], int]:
    """Run a baseline comparison and optional archive/release preflight."""
    current = capture_state(arguments.repo)
    root = Path(str(current["repository"]["root"]))
    baseline = _load_baseline(arguments.baseline, root)
    allowed: set[str] = set()
    for path in arguments.allow_path:
        if not _safe_relative(path):
            raise AuditError(f"unsafe allowed path: {path!r}")
        allowed.add(path)
    preservation = _compare_baseline(baseline, current, allowed)

    expected_checks: list[dict[str, object]] = []
    current_repo = current["repository"]
    current_git = current["git"]
    for flag, actual, name in (
        (arguments.expect_branch, current_repo["branch"], "expected_branch"),
        (arguments.expect_head, current_repo["head"], "expected_head"),
        (arguments.expect_index_sha256, current_git["index_sha256"], "expected_index_sha256"),
        (
            arguments.expect_staged_patch_sha256,
            current_git["staged_patch_sha256"],
            "expected_staged_patch_sha256",
        ),
    ):
        if flag is not None:
            expected_checks.append({"name": name, "expected": flag, "actual": actual, "passed": flag == actual})

    status_records = current_git["status_records"]
    report: dict[str, object] = {
        "schema": SCHEMA,
        "read_only": True,
        "repository": current_repo,
        "current_git": {
            "index_path": current_git["index_path"],
            "index_sha256": current_git["index_sha256"],
            "staged_patch_sha256": current_git["staged_patch_sha256"],
            "consistency": current_git["consistency"],
            "status_count": current_git["status_count"],
            "status_summary": _status_summary(status_records),
            "status_paths": _limited(_status_paths(status_records)),
        },
        "goal_checkpoint": (
            {
                "identifier": arguments.goal_checkpoint,
                "classification": "caller-supplied goal checkpoint label; not queried or treated as a Git commit",
                "counts_as_git_commit": False,
            }
            if arguments.goal_checkpoint
            else None
        ),
        "preservation": preservation,
        "expected_values": {"passed": all(item["passed"] for item in expected_checks), "checks": expected_checks},
        "archive": audit_archive(arguments.archive_root) if arguments.archive_root else {"status": "not_requested"},
        "writes_performed": [],
    }

    if arguments.target:
        report["release_proposal"] = _release_proposal(root, current, preservation, arguments.target)
        if not report["expected_values"]["passed"]:
            release_report = report["release_proposal"]
            release_report["blockers"].append("explicit_expected_git_values_mismatched")
            release_report["status"] = "blocked"
    else:
        report["release_proposal"] = {"status": "not_requested", "actual_merge_performed": False}

    archive_report = report["archive"]
    release_report = report["release_proposal"]
    failed = not preservation["passed"] or not report["expected_values"]["passed"]
    if isinstance(archive_report, dict) and archive_report.get("status") == "mismatch":
        failed = True
    if isinstance(release_report, dict) and release_report.get("status") == "blocked":
        failed = True
    report["audit_status"] = "discrepancy_or_preflight_blocker" if failed else "checks_passed_with_limits"
    report["merge_authorized"] = False
    return report, 1 if failed else 0


def _sha_argument(value: str) -> str:
    """Validate one SHA-256 command-line expectation."""
    normalized = value.lower()
    if len(normalized) != 64 or any(char not in "0123456789abcdef" for char in normalized):
        raise argparse.ArgumentTypeError("expected a 64-character hexadecimal SHA-256")
    return normalized


def _parser() -> argparse.ArgumentParser:
    """Build the read-only command-line interface."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    capture = commands.add_parser("capture", help="emit a read-only baseline as JSON on stdout")
    capture.add_argument("--repo", type=Path, required=True)

    audit = commands.add_parser("audit", help="compare a worktree to an external baseline")
    audit.add_argument("--repo", type=Path, required=True)
    audit.add_argument("--baseline", type=Path, required=True)
    audit.add_argument("--allow-path", action="append", default=[], metavar="PATH")
    audit.add_argument("--expect-branch")
    audit.add_argument("--expect-head")
    audit.add_argument("--expect-index-sha256", type=_sha_argument)
    audit.add_argument("--expect-staged-patch-sha256", type=_sha_argument)
    audit.add_argument("--goal-checkpoint", help="label only; never treated as a Git commit")
    audit.add_argument("--target", help="local target branch name for structural merge preflight")
    audit.add_argument("--archive-root", type=Path, help="optional read-only goal-docs archive root")

    archive = commands.add_parser("archive", help="verify a goal-docs manifest and owned bytes")
    archive.add_argument("--root", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the selected audit and emit a bounded JSON report."""
    arguments = _parser().parse_args(argv)
    try:
        if arguments.command == "capture":
            report = capture_state(arguments.repo)
            code = 0
        elif arguments.command == "archive":
            report = audit_archive(arguments.root)
            code = 0 if report["status"] == "match" else 1
        else:
            report, code = run_audit(arguments)
        sys.stdout.write(json.dumps(report, ensure_ascii=True, indent=2, sort_keys=True) + "\n")
        return code
    except (AuditError, OSError, ValueError) as error:
        sys.stderr.write(f"delivery-preservation: {error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
