"""Provide bounded, reversible transactions for one existing MCP config file."""

from __future__ import annotations

from contextlib import suppress
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import time


MAX_CONFIG_BYTES = 1024 * 1024
MAX_RECEIPT_BYTES = 16 * 1024
LOCK_WAIT_SECONDS = 0.25
LOCK_POLL_SECONDS = 0.01
RECEIPT_SCHEMA = "opencode.mcp-config-transaction/v1"
TOKEN_PATTERN = re.compile(r"[0-9a-f]{32}\Z")
HASH_PATTERN = re.compile(r"[0-9a-f]{64}\Z")


class ConfigTransactionError(RuntimeError):
    """Raised when a config transaction cannot be proven safe to complete."""


class _Snapshot:
    """Hold the bytes and identity evidence for one regular config file."""

    def __init__(
        self,
        content: bytes,
        identity: tuple[int, ...],
        mode: int,
        parent_identity: tuple[int, ...],
    ) -> None:
        self.content = content
        self.identity = identity
        self.mode = mode
        self.parent_identity = parent_identity


def _file_identity(metadata: os.stat_result) -> tuple[int, ...]:
    """Return metadata that detects path replacement and concurrent mutation."""
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
        metadata.st_uid,
        metadata.st_gid,
        metadata.st_nlink,
    )


def _directory_identity(metadata: os.stat_result) -> tuple[int, ...]:
    """Return stable identity and ownership evidence for a parent directory."""
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_uid,
        metadata.st_gid,
    )


def _canonical_path(path: Path, label: str) -> Path:
    """Require an absolute, normalized path without dot-dot traversal."""
    if not isinstance(path, Path):
        raise ConfigTransactionError(f"{label} must be a pathlib.Path")
    value = os.fspath(path)
    if (
        not path.is_absolute()
        or ".." in path.parts
        or value != os.path.normpath(value)
        or path.name in ("", ".", "..")
    ):
        raise ConfigTransactionError(f"{label} must be a normalized absolute file path")
    return path


def _open_directory(path: Path) -> int:
    """Open every directory component without following symlinks."""
    if not path.is_absolute() or ".." in path.parts or str(path) != os.path.normpath(str(path)):
        raise ConfigTransactionError("parent directory path is not canonical")
    nofollow = getattr(os, "O_NOFOLLOW", None)
    directory = getattr(os, "O_DIRECTORY", None)
    if nofollow is None or directory is None:
        raise ConfigTransactionError("platform lacks no-follow directory opens")
    flags = os.O_RDONLY | directory | nofollow | getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(path.anchor, flags)
    except OSError as error:
        raise ConfigTransactionError(f"cannot safely open parent directory: {error.strerror}") from error

    try:
        for component in path.parts[1:]:
            try:
                before = os.stat(component, dir_fd=descriptor, follow_symlinks=False)
                if not stat.S_ISDIR(before.st_mode):
                    raise ConfigTransactionError("path component is not a real directory")
                child = os.open(component, flags, dir_fd=descriptor)
            except OSError as error:
                raise ConfigTransactionError(
                    f"cannot safely open parent directory component: {error.strerror}"
                ) from error
            after = os.fstat(child)
            if _directory_identity(before) != _directory_identity(after):
                os.close(child)
                raise ConfigTransactionError("parent directory changed while it was opened")
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _open_parent(path: Path) -> tuple[int, str, tuple[int, ...]]:
    """Open a target's canonical parent and return its identity."""
    target = _canonical_path(path, "target")
    descriptor = _open_directory(target.parent)
    return descriptor, target.name, _directory_identity(os.fstat(descriptor))


def _assert_parent(path: Path, expected: tuple[int, ...]) -> None:
    """Prove the canonical parent path still names the opened directory."""
    descriptor = _open_directory(path.parent)
    try:
        if _directory_identity(os.fstat(descriptor)) != expected:
            raise ConfigTransactionError("target parent identity changed during transaction")
    finally:
        os.close(descriptor)


def _require_owned_regular(metadata: os.stat_result, label: str) -> None:
    """Reject special files, foreign ownership, and ambiguous hard links."""
    if not stat.S_ISREG(metadata.st_mode):
        raise ConfigTransactionError(f"{label} is not a regular file")
    if metadata.st_uid != os.geteuid():
        raise ConfigTransactionError(f"{label} is not owned by the current user")
    if metadata.st_nlink != 1:
        raise ConfigTransactionError(f"{label} must have exactly one hard link")


def _read_descriptor(descriptor: int, limit: int, label: str) -> bytes:
    """Read at most limit plus one byte from an already opened regular file."""
    chunks: list[bytes] = []
    total = 0
    while total <= limit:
        try:
            chunk = os.read(descriptor, min(64 * 1024, limit + 1 - total))
        except OSError as error:
            raise ConfigTransactionError(f"cannot read {label}: {error.strerror}") from error
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > limit:
            raise ConfigTransactionError(f"{label} exceeds the {limit}-byte limit")
    return b"".join(chunks)


def _read_regular_at(
    directory_fd: int,
    name: str,
    *,
    limit: int,
    label: str,
    required_mode: int | None = None,
) -> tuple[bytes, tuple[int, ...], int]:
    """Read one no-follow, nonblocking, user-owned single-link regular file."""
    try:
        named_before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except OSError as error:
        raise ConfigTransactionError(f"cannot safely inspect {label}: {error.strerror}") from error
    _require_owned_regular(named_before, label)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    flags |= getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(name, flags, dir_fd=directory_fd)
    except OSError as error:
        raise ConfigTransactionError(f"cannot safely open {label}: {error.strerror}") from error
    try:
        before = os.fstat(descriptor)
        _require_owned_regular(before, label)
        if required_mode is not None and stat.S_IMODE(before.st_mode) != required_mode:
            raise ConfigTransactionError(f"{label} has unexpected permissions")
        if _file_identity(before) != _file_identity(named_before):
            raise ConfigTransactionError(f"{label} path identity changed while opening")

        content = _read_descriptor(descriptor, limit, label)
        after = os.fstat(descriptor)
        try:
            named_after = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except OSError as error:
            raise ConfigTransactionError(f"{label} path changed while reading") from error
        if (
            _file_identity(before) != _file_identity(after)
            or _file_identity(after) != _file_identity(named_after)
            or len(content) != after.st_size
        ):
            raise ConfigTransactionError(f"{label} changed while it was read")
        return content, _file_identity(after), stat.S_IMODE(after.st_mode)
    finally:
        os.close(descriptor)


def _snapshot_at(
    target: Path,
    directory_fd: int,
    name: str,
    parent_identity: tuple[int, ...],
) -> _Snapshot:
    """Capture bounded target bytes and verify both descriptor and path identity."""
    content, identity, mode = _read_regular_at(
        directory_fd,
        name,
        limit=MAX_CONFIG_BYTES,
        label="config target",
    )
    _assert_parent(target, parent_identity)
    return _Snapshot(content, identity, mode, parent_identity)


def _snapshot(target: Path) -> _Snapshot:
    """Open and snapshot an existing target without following path symlinks."""
    target = _canonical_path(target, "target")
    directory_fd, name, parent_identity = _open_parent(target)
    try:
        return _snapshot_at(target, directory_fd, name, parent_identity)
    finally:
        os.close(directory_fd)


def _sha256(content: bytes) -> str:
    """Return the lowercase SHA-256 digest of exact bytes."""
    return hashlib.sha256(content).hexdigest()


def _valid_hash(value: object) -> bool:
    """Check the exact lowercase digest representation accepted by the API."""
    return isinstance(value, str) and HASH_PATTERN.fullmatch(value) is not None


def _validate_expected(value: str) -> None:
    """Reject noncanonical expected digests before inspecting a target."""
    if not _valid_hash(value):
        raise ConfigTransactionError("expected_sha256 must be 64 lowercase hexadecimal characters")


def _result(current: bytes, desired: bytes, *, applied: bool = False) -> dict[str, object]:
    """Build the stable, content-free report shared by previews and applies."""
    return {
        "current_sha256": _sha256(current),
        "desired_sha256": _sha256(desired),
        "changed": current != desired,
        "applied": applied,
    }


def preview(path: Path, desired: bytes) -> dict[str, object]:
    """Preview exact-byte replacement without creating or changing filesystem entries.

    Args:
        path: Existing config file to inspect.
        desired: Exact replacement bytes, bounded to one MiB.

    Returns:
        A content-free report with current and desired SHA-256 digests.

    Raises:
        ConfigTransactionError: If the path, file, or desired bytes are unsafe.
    """
    if not isinstance(desired, bytes) or len(desired) > MAX_CONFIG_BYTES:
        raise ConfigTransactionError(f"desired config must be bytes no larger than {MAX_CONFIG_BYTES} bytes")
    snapshot = _snapshot(path)
    return _result(snapshot.content, desired)


def _lock_filename(target: Path) -> str:
    """Return the persistent per-canonical-target cooperative lock name."""
    digest = hashlib.sha256(os.fsencode(str(target))).hexdigest()
    return f".mcp-config-lock-{digest}"


def _acquire_lock(
    target: Path,
    directory_fd: int,
    parent_identity: tuple[int, ...],
) -> int:
    """Acquire a persistent private target lock without blocking indefinitely."""
    _assert_parent(target, parent_identity)
    name = _lock_filename(target)
    flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    flags |= getattr(os, "O_CLOEXEC", 0)
    created = False
    named_before: os.stat_result | None = None
    try:
        descriptor = os.open(name, flags, 0o600, dir_fd=directory_fd)
        created = True
    except FileExistsError:
        try:
            named_before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except OSError as error:
            raise ConfigTransactionError(f"cannot safely inspect transaction lock: {error.strerror}") from error
        _require_owned_regular(named_before, "transaction lock")
        try:
            descriptor = os.open(
                name,
                os.O_RDWR | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
                | getattr(os, "O_CLOEXEC", 0),
                dir_fd=directory_fd,
            )
        except OSError as error:
            raise ConfigTransactionError(f"cannot safely open transaction lock: {error.strerror}") from error
    except OSError as error:
        raise ConfigTransactionError(f"cannot create transaction lock: {error.strerror}") from error

    try:
        metadata = os.fstat(descriptor)
        _require_owned_regular(metadata, "transaction lock")
        if created:
            os.fchmod(descriptor, 0o600)
            metadata = os.fstat(descriptor)
        if stat.S_IMODE(metadata.st_mode) != 0o600:
            raise ConfigTransactionError("transaction lock must have mode 0600")
        named = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if _file_identity(metadata) != _file_identity(named):
            raise ConfigTransactionError("transaction lock path identity changed")
        if not created and (
            named_before is None or _file_identity(named_before) != _file_identity(named)
        ):
            raise ConfigTransactionError("transaction lock changed while opening")
        if created:
            os.fsync(descriptor)
            os.fsync(directory_fd)
        deadline = time.monotonic() + LOCK_WAIT_SECONDS
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                _assert_parent(target, parent_identity)
                _assert_lock(target, directory_fd, descriptor)
                return descriptor
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise ConfigTransactionError("transaction lock is busy; retry later")
                time.sleep(LOCK_POLL_SECONDS)
    except ConfigTransactionError:
        with suppress(OSError):
            os.close(descriptor)
        raise
    except OSError as error:
        with suppress(OSError):
            os.close(descriptor)
        raise ConfigTransactionError(f"cannot safely use transaction lock: {error.strerror}") from error
    except BaseException:
        with suppress(OSError):
            os.close(descriptor)
        raise


def _assert_lock(target: Path, directory_fd: int, descriptor: int) -> None:
    """Refuse publication if the held persistent lock is no longer the named inode."""
    held = os.fstat(descriptor)
    _require_owned_regular(held, "held transaction lock")
    if stat.S_IMODE(held.st_mode) != 0o600:
        raise ConfigTransactionError("held transaction lock mode changed")
    named = os.stat(_lock_filename(target), dir_fd=directory_fd, follow_symlinks=False)
    if _file_identity(held) != _file_identity(named):
        raise ConfigTransactionError("persistent transaction lock identity changed")


def _release_lock(descriptor: int) -> None:
    """Release a lock descriptor without unlinking its persistent inode."""
    try:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
    finally:
        os.close(descriptor)


def _write_all(descriptor: int, content: bytes) -> None:
    """Write all bytes while handling short system writes."""
    remaining = memoryview(content)
    while remaining:
        try:
            written = os.write(descriptor, remaining)
        except OSError as error:
            raise ConfigTransactionError(f"cannot write transaction artifact: {error.strerror}") from error
        if written <= 0:
            raise ConfigTransactionError("short write while saving transaction artifact")
        remaining = remaining[written:]


def _write_private_at(
    directory_fd: int,
    name: str,
    content: bytes,
    *,
    mode: int,
    label: str,
) -> tuple[int, ...]:
    """Create one exclusive private adjacent artifact and verify its exact bytes."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    flags |= getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(name, flags, 0o600, dir_fd=directory_fd)
    except OSError as error:
        raise ConfigTransactionError(f"cannot exclusively create {label}: {error.strerror}") from error
    try:
        metadata = os.fstat(descriptor)
        _require_owned_regular(metadata, label)
        os.fchmod(descriptor, mode)
        _write_all(descriptor, content)
        os.fsync(descriptor)
        written_identity = _file_identity(os.fstat(descriptor))
    except ConfigTransactionError as error:
        raise ConfigTransactionError(f"cannot preserve {label} at {name}: {error}") from error
    except OSError as error:
        raise ConfigTransactionError(
            f"cannot preserve {label} at {name}: {error.strerror}; inspect the adjacent path"
        ) from error
    finally:
        os.close(descriptor)

    try:
        saved, identity, actual_mode = _read_regular_at(
            directory_fd,
            name,
            limit=max(len(content), 1),
            label=label,
            required_mode=mode,
        )
    except ConfigTransactionError as error:
        raise ConfigTransactionError(f"cannot verify {label} at {name}: {error}") from error
    if saved != content or identity != written_identity or actual_mode != mode:
        raise ConfigTransactionError(f"{label} did not verify after creation; inspect its adjacent path")
    return identity


def _write_stage(
    directory_fd: int,
    name: str,
    content: bytes,
) -> tuple[int, tuple[int, ...]]:
    """Create and retain an open, private stage file for later atomic publication."""
    flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    flags |= getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(name, flags, 0o600, dir_fd=directory_fd)
    except OSError as error:
        raise ConfigTransactionError(f"cannot create private publication stage: {error.strerror}") from error
    identity: tuple[int, ...] | None = None
    try:
        _require_owned_regular(os.fstat(descriptor), "publication stage")
        _write_all(descriptor, content)
        os.fsync(descriptor)
        identity = _file_identity(os.fstat(descriptor))
        _verify_stage(directory_fd, name, descriptor, content, 0o600)
        return descriptor, identity
    except BaseException:
        if identity is None:
            with suppress(OSError):
                identity = _file_identity(os.fstat(descriptor))
        with suppress(OSError):
            os.close(descriptor)
        _unlink_stage_if_same(directory_fd, name, identity)
        raise


def _verify_stage(
    directory_fd: int,
    name: str,
    descriptor: int,
    expected: bytes,
    mode: int,
) -> tuple[int, ...]:
    """Verify stage bytes, mode, ownership, link count, and directory entry."""
    before = os.fstat(descriptor)
    _require_owned_regular(before, "publication stage")
    if stat.S_IMODE(before.st_mode) != mode or before.st_size != len(expected):
        raise ConfigTransactionError("publication stage metadata changed")
    named = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    if _file_identity(before) != _file_identity(named):
        raise ConfigTransactionError("publication stage path identity changed")
    os.lseek(descriptor, 0, os.SEEK_SET)
    content = _read_descriptor(descriptor, MAX_CONFIG_BYTES, "publication stage")
    after = os.fstat(descriptor)
    if _file_identity(before) != _file_identity(after) or content != expected:
        raise ConfigTransactionError("publication stage bytes or identity changed")
    return _file_identity(after)


def _unlink_stage_if_same(directory_fd: int, name: str, identity: tuple[int, ...] | None) -> None:
    """Remove only this transaction's unpublished stage inode."""
    if identity is None:
        return
    try:
        named = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if _file_identity(named) == identity:
            os.unlink(name, dir_fd=directory_fd)
    except FileNotFoundError:
        pass
    except OSError:
        pass


def _mode(value: object, label: str) -> int:
    """Validate a JSON mode as an exact non-boolean permission integer."""
    if type(value) is not int or value < 0 or value > 0o7777:
        raise ConfigTransactionError(f"receipt {label} is invalid")
    return value


def _identity_json(identity: tuple[int, ...]) -> dict[str, int]:
    """Serialize the device/inode pair bound by an immutable receipt."""
    return {"device": identity[0], "inode": identity[1]}


def _parent_json(identity: tuple[int, ...]) -> dict[str, int]:
    """Serialize parent device, inode, type/mode, and ownership evidence."""
    return {
        "device": identity[0],
        "inode": identity[1],
        "mode": identity[2],
        "uid": identity[3],
        "gid": identity[4],
    }


def _canonical_receipt_bytes(record: dict[str, object]) -> bytes:
    """Encode the allowlisted transaction receipt deterministically."""
    return (json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("ascii")


def _token_names(token: str) -> tuple[str, str, str]:
    """Return the deterministic stage, backup, and receipt names for one token."""
    stem = f".mcp-config-transaction-{token}"
    return f"{stem}.stage", f"{stem}.backup", f"{stem}.receipt"


def _create_receipt_record(
    target: Path,
    parent_identity: tuple[int, ...],
    before: _Snapshot,
    desired: bytes,
    desired_mode: int,
    stage_identity: tuple[int, ...],
    backup_identity: tuple[int, ...],
    token: str,
    backup_name: str,
) -> dict[str, object]:
    """Bind the exact file transition and adjacent backup into a receipt."""
    return {
        "schema": RECEIPT_SCHEMA,
        "transaction_id": token,
        "target": str(target),
        "parent_identity": _parent_json(parent_identity),
        "target_before_identity": _identity_json(before.identity),
        "published_identity": _identity_json(stage_identity),
        "before_sha256": _sha256(before.content),
        "desired_sha256": _sha256(desired),
        "original_mode": before.mode,
        "desired_mode": desired_mode,
        "backup": str(target.parent / backup_name),
        "backup_identity": _identity_json(backup_identity),
        "backup_sha256": _sha256(before.content),
    }


def _same_snapshot(actual: _Snapshot, expected: _Snapshot, stage: str) -> None:
    """Refuse a transaction if bytes, mode, path identity, or parent changed."""
    if (
        actual.content != expected.content
        or actual.identity != expected.identity
        or actual.mode != expected.mode
        or actual.parent_identity != expected.parent_identity
    ):
        raise ConfigTransactionError(f"config changed concurrently {stage}; refusing to overwrite")


def _publish(
    target: Path,
    directory_fd: int,
    name: str,
    parent_identity: tuple[int, ...],
    before: _Snapshot,
    desired: bytes,
    desired_mode: int,
    lock_fd: int,
) -> dict[str, object]:
    """Preserve, receipt, atomically publish, and verify one byte transition."""
    token = secrets.token_hex(16)
    stage_name, backup_name, receipt_name = _token_names(token)
    stage_fd: int | None = None
    stage_identity: tuple[int, ...] | None = None
    backup_path = target.parent / backup_name
    receipt_path = target.parent / receipt_name
    replace_attempted = False
    preservation_complete = False
    try:
        stage_fd, _ = _write_stage(directory_fd, stage_name, desired)
        stage_identity = _file_identity(os.fstat(stage_fd))
        backup_identity = _write_private_at(
            directory_fd,
            backup_name,
            before.content,
            mode=0o600,
            label="config backup",
        )
        record = _create_receipt_record(
            target,
            parent_identity,
            before,
            desired,
            desired_mode,
            stage_identity,
            backup_identity,
            token,
            backup_name,
        )
        receipt_bytes = _canonical_receipt_bytes(record)
        _write_private_at(
            directory_fd,
            receipt_name,
            receipt_bytes,
            mode=0o400,
            label="transaction receipt",
        )
        os.fsync(directory_fd)
        preservation_complete = True

        os.fchmod(stage_fd, desired_mode)
        os.fsync(stage_fd)
        stage_identity = _verify_stage(directory_fd, stage_name, stage_fd, desired, desired_mode)
        _assert_parent(target, parent_identity)
        current = _snapshot_at(target, directory_fd, name, parent_identity)
        _same_snapshot(current, before, "immediately before publication")
        saved, saved_identity, _ = _read_regular_at(
            directory_fd,
            backup_name,
            limit=MAX_CONFIG_BYTES,
            label="config backup",
            required_mode=0o600,
        )
        if saved != before.content or saved_identity != backup_identity:
            raise ConfigTransactionError("preserved backup changed before publication")
        receipt_check, _, _ = _read_regular_at(
            directory_fd,
            receipt_name,
            limit=MAX_RECEIPT_BYTES,
            label="transaction receipt",
            required_mode=0o400,
        )
        if receipt_check != receipt_bytes:
            raise ConfigTransactionError("immutable receipt changed before publication")

        _assert_parent(target, parent_identity)
        latest = _snapshot_at(target, directory_fd, name, parent_identity)
        _same_snapshot(latest, before, "at the final publication boundary")
        _assert_lock(target, directory_fd, lock_fd)
        replace_attempted = True
        os.replace(stage_name, name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
        os.fsync(directory_fd)
        published = _snapshot_at(target, directory_fd, name, parent_identity)
        if (
            published.content != desired
            or published.mode != desired_mode
            or published.identity[:2] != stage_identity[:2]
        ):
            raise ConfigTransactionError("published config failed exact post-readback verification")
        result = _result(before.content, desired, applied=True)
        result["backup"] = str(backup_path)
        result["receipt"] = str(receipt_path)
        return result
    except ConfigTransactionError as error:
        if replace_attempted:
            raise ConfigTransactionError(
                f"publication outcome is uncertain; inspect target {target}, backup {backup_path}, "
                f"and receipt {receipt_path}: {error}"
            ) from error
        if preservation_complete:
            raise ConfigTransactionError(
                f"publication was not attempted; preserved backup {backup_path} and receipt {receipt_path}: {error}"
            ) from error
        raise
    except OSError as error:
        if replace_attempted:
            raise ConfigTransactionError(
                f"publication outcome is uncertain; inspect target {target}, backup {backup_path}, "
                f"and receipt {receipt_path}: {error.strerror}"
            ) from error
        raise ConfigTransactionError(
            f"config transaction failed before publication; inspect adjacent preservation files "
            f"{backup_path} and {receipt_path}: {error.strerror}"
        ) from error
    finally:
        if stage_fd is not None:
            with suppress(OSError):
                os.close(stage_fd)
        _unlink_stage_if_same(directory_fd, stage_name, stage_identity)


def apply(path: Path, desired: bytes, *, expected_sha256: str) -> dict[str, object]:
    """Apply exact desired bytes only when the current digest matches the caller's preview.

    Args:
        path: Existing config file to replace.
        desired: Exact replacement bytes, bounded to one MiB.
        expected_sha256: Lowercase digest observed by the caller before approval.

    Returns:
        A content-free result. Actual changes include absolute backup and receipt paths.

    Raises:
        ConfigTransactionError: If validation, compare-and-swap, preservation, or
            publication verification fails.
    """
    _validate_expected(expected_sha256)
    if not isinstance(desired, bytes) or len(desired) > MAX_CONFIG_BYTES:
        raise ConfigTransactionError(f"desired config must be bytes no larger than {MAX_CONFIG_BYTES} bytes")
    target = _canonical_path(path, "target")
    directory_fd, name, parent_identity = _open_parent(target)
    lock_fd: int | None = None
    try:
        before = _snapshot_at(target, directory_fd, name, parent_identity)
        if _sha256(before.content) != expected_sha256:
            raise ConfigTransactionError("current config digest differs from expected_sha256")
        if before.content == desired:
            return _result(before.content, desired)

        lock_fd = _acquire_lock(target, directory_fd, parent_identity)
        current = _snapshot_at(target, directory_fd, name, parent_identity)
        _same_snapshot(current, before, "while acquiring the cooperative lock")
        if _sha256(current.content) != expected_sha256:
            raise ConfigTransactionError("current config digest differs from expected_sha256")
        if current.content == desired:
            return _result(current.content, desired)
        return _publish(target, directory_fd, name, parent_identity, current, desired, current.mode, lock_fd)
    finally:
        if lock_fd is not None:
            _release_lock(lock_fd)
        os.close(directory_fd)


def _pairs_without_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Reject repeated JSON keys instead of accepting ambiguous receipt meaning."""
    record: dict[str, object] = {}
    for key, value in pairs:
        if key in record:
            raise ConfigTransactionError("transaction receipt contains duplicate keys")
        record[key] = value
    return record


def _load_receipt(
    target: Path,
    receipt: Path,
    directory_fd: int,
    parent_identity: tuple[int, ...],
) -> tuple[dict[str, object], bytes, str, str]:
    """Read and strictly validate an untrusted receipt and its canonical names."""
    receipt = _canonical_path(receipt, "receipt")
    if receipt.parent != target.parent:
        raise ConfigTransactionError("receipt must be adjacent to the selected target")
    match = re.fullmatch(r"\.mcp-config-transaction-([0-9a-f]{32})\.receipt", receipt.name)
    if match is None:
        raise ConfigTransactionError("receipt filename is foreign or ambiguous")
    token = match.group(1)
    _, backup_name, receipt_name = _token_names(token)
    if receipt.name != receipt_name:
        raise ConfigTransactionError("receipt filename does not match its transaction identifier")
    content, _, _ = _read_regular_at(
        directory_fd,
        receipt_name,
        limit=MAX_RECEIPT_BYTES,
        label="transaction receipt",
        required_mode=0o400,
    )
    try:
        record_value = json.loads(content.decode("ascii"), object_pairs_hook=_pairs_without_duplicates)
    except (ValueError, RecursionError) as error:
        raise ConfigTransactionError("transaction receipt is not valid canonical JSON") from error
    if type(record_value) is not dict:
        raise ConfigTransactionError("transaction receipt must be a JSON object")
    record = record_value
    expected_fields = {
        "schema",
        "transaction_id",
        "target",
        "parent_identity",
        "target_before_identity",
        "published_identity",
        "before_sha256",
        "desired_sha256",
        "original_mode",
        "desired_mode",
        "backup",
        "backup_identity",
        "backup_sha256",
    }
    if set(record) != expected_fields:
        raise ConfigTransactionError("transaction receipt has missing or unrecognized fields")
    try:
        canonical = _canonical_receipt_bytes(record)
    except (TypeError, ValueError, RecursionError) as error:
        raise ConfigTransactionError("transaction receipt contains invalid field values") from error
    if canonical != content:
        raise ConfigTransactionError("transaction receipt is not in canonical immutable form")
    if record["schema"] != RECEIPT_SCHEMA or record["transaction_id"] != token:
        raise ConfigTransactionError("transaction receipt schema or identifier is foreign")
    if record["target"] != str(target):
        raise ConfigTransactionError("transaction receipt names a different target")
    parent_record = record["parent_identity"]
    if (
        type(parent_record) is not dict
        or set(parent_record) != {"device", "inode", "mode", "uid", "gid"}
        or any(type(value) is not int or value < 0 for value in parent_record.values())
        or parent_record != _parent_json(parent_identity)
    ):
        raise ConfigTransactionError("transaction receipt parent identity does not match")
    if not _valid_hash(record["before_sha256"]) or not _valid_hash(record["desired_sha256"]):
        raise ConfigTransactionError("transaction receipt contains an invalid config digest")
    if record["backup_sha256"] != record["before_sha256"]:
        raise ConfigTransactionError("transaction receipt backup digest is inconsistent")
    if record["before_sha256"] == record["desired_sha256"]:
        raise ConfigTransactionError("transaction receipt describes an ambiguous no-op")
    _mode(record["original_mode"], "original_mode")
    _mode(record["desired_mode"], "desired_mode")

    for field in ("target_before_identity", "published_identity", "backup_identity"):
        value = record[field]
        if (
            type(value) is not dict
            or set(value) != {"device", "inode"}
            or any(type(value[key]) is not int or value[key] < 0 for key in ("device", "inode"))
        ):
            raise ConfigTransactionError(f"transaction receipt {field} is invalid")
    expected_backup = target.parent / backup_name
    if record["backup"] != str(expected_backup):
        raise ConfigTransactionError("transaction receipt backup is not its exact adjacent transaction file")
    return record, content, backup_name, token


def _restore_plan(
    target: Path,
    receipt: Path,
    directory_fd: int,
    name: str,
    parent_identity: tuple[int, ...],
    expected_sha256: str,
) -> tuple[_Snapshot, bytes, dict[str, object]]:
    """Verify current post-bytes, receipt bindings, and exact private backup."""
    current = _snapshot_at(target, directory_fd, name, parent_identity)
    current_digest = _sha256(current.content)
    if current_digest != expected_sha256:
        raise ConfigTransactionError("current config digest differs from expected_sha256")
    record, _, backup_name, _ = _load_receipt(target, receipt, directory_fd, parent_identity)
    if current_digest != record["desired_sha256"]:
        raise ConfigTransactionError("current config is not the exact post-transaction content")
    if current.mode != record["desired_mode"]:
        raise ConfigTransactionError("current config mode differs from the receipt's published mode")
    published = record["published_identity"]
    if current.identity[:2] != (published["device"], published["inode"]):
        raise ConfigTransactionError("current config file identity differs from the receipt")

    backup, backup_identity, _ = _read_regular_at(
        directory_fd,
        backup_name,
        limit=MAX_CONFIG_BYTES,
        label="receipt backup",
        required_mode=0o600,
    )
    if _sha256(backup) != record["before_sha256"] or _sha256(backup) != record["backup_sha256"]:
        raise ConfigTransactionError("receipt backup bytes do not match their recorded digest")
    recorded_backup = record["backup_identity"]
    if backup_identity[:2] != (recorded_backup["device"], recorded_backup["inode"]):
        raise ConfigTransactionError("receipt backup file identity does not match")
    return current, backup, record


def restore(
    path: Path,
    receipt: Path,
    *,
    expected_sha256: str,
    apply: bool = False,
) -> dict[str, object]:
    """Preview or explicitly perform a reversible restore from a strict receipt.

    Args:
        path: Existing config target named by the receipt.
        receipt: Immutable adjacent receipt produced by an earlier transaction.
        expected_sha256: Lowercase digest of the exact current post-transaction bytes.
        apply: Must be explicitly true to write; defaults to a read-only preview.

    Returns:
        A content-free preview or apply report. An applied restore returns a new
        backup and receipt that can reverse the restore.

    Raises:
        ConfigTransactionError: If receipt, backup, target, path, or digest validation fails.
    """
    _validate_expected(expected_sha256)
    if type(apply) is not bool:
        raise ConfigTransactionError("apply must be a boolean")
    target = _canonical_path(path, "target")
    receipt_path = _canonical_path(receipt, "receipt")
    if receipt_path.parent != target.parent:
        raise ConfigTransactionError("receipt must be adjacent to the selected target")
    directory_fd, name, parent_identity = _open_parent(target)
    lock_fd: int | None = None
    try:
        current, desired, record = _restore_plan(
            target,
            receipt_path,
            directory_fd,
            name,
            parent_identity,
            expected_sha256,
        )
        result = _result(current.content, desired)
        if not apply:
            return result

        lock_fd = _acquire_lock(target, directory_fd, parent_identity)
        locked_current, locked_desired, locked_record = _restore_plan(
            target,
            receipt_path,
            directory_fd,
            name,
            parent_identity,
            expected_sha256,
        )
        _same_snapshot(locked_current, current, "while acquiring the cooperative lock")
        if locked_desired != desired or locked_record != record:
            raise ConfigTransactionError("restore evidence changed while acquiring the cooperative lock")
        return _publish(
            target,
            directory_fd,
            name,
            parent_identity,
            locked_current,
            locked_desired,
            _mode(locked_record["original_mode"], "original_mode"),
            lock_fd,
        )
    finally:
        if lock_fd is not None:
            _release_lock(lock_fd)
        os.close(directory_fd)
