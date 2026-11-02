#!/usr/bin/env python3
"""Collect one user-entered secret and stage it in a private file."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import secrets
import selectors
import signal
import stat
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Sequence


MAX_SECRET_BYTES = 4_096
MAX_STATUS_BYTES = 1_024
DIALOG_TIMEOUT_SECONDS = 300.0
DIALOG_HELPER = Path(__file__).with_name("browser-auth-dialog.py")
REMINDER = "Reminder: the caller is responsible for deleting the staged file after use."


class StageError(Exception):
    """Raised when staging cannot be completed safely."""


DIALOG_FAILURE_REASONS = {
    "display": "the dialog could not open a graphical display",
    "internal": "the dialog hit an internal error",
    "spec": "the dialog rejected its specification",
}


class DialogFailure(StageError):
    """Raised when the dialog helper exits unsuccessfully.

    The helper's stderr is deliberately discarded: nothing it writes there is
    trusted, because a defect there could echo the typed value. Diagnosis comes
    from an explicit machine-readable category on stdout instead.
    """

    def __init__(self, exit_code: int, detail: str = ""):
        """Keep the exit code and a fixed reason mapped from the category."""
        reason = ""
        for line in detail.splitlines():
            stripped = line.strip()
            if stripped.startswith("failed:"):
                category = stripped.split(":", 1)[1].strip().lower()
                reason = DIALOG_FAILURE_REASONS.get(category, "")
                break
        message = f"dialog failed with exit code {exit_code}"
        if reason:
            message = f"{message}: {reason}"
        super().__init__(message)
        self.exit_code = exit_code


def build_dialog_environment() -> dict[str, str]:
    """Build the small environment needed by GTK without forwarding secrets."""
    environment = {
        "GTK_A11Y": "none",
        "HOME": os.environ.get("HOME", "/"),
        "PATH": os.environ.get("PATH", os.defpath),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
    }
    for name in ("XDG_RUNTIME_DIR", "DISPLAY", "WAYLAND_DISPLAY"):
        value = os.environ.get(name)
        if value:
            environment[name] = value
    authority = os.environ.get("XAUTHORITY")
    if authority:
        try:
            Path(authority).resolve().relative_to("/run/user")
        except (OSError, ValueError):
            pass
        else:
            environment["XAUTHORITY"] = authority
    return environment


def _save_fd_three() -> tuple[int | None, bool]:
    """Preserve an existing parent descriptor before temporarily mapping fd 3."""
    try:
        descriptor_flags = fcntl.fcntl(3, fcntl.F_GETFD)
    except OSError:
        return None, False
    saved = fcntl.fcntl(3, fcntl.F_DUPFD_CLOEXEC, 10)
    return saved, bool(descriptor_flags & fcntl.FD_CLOEXEC)


def _restore_fd_three(saved: int | None, was_cloexec: bool) -> None:
    """Restore the parent's original fd 3 after launching the dialog."""
    try:
        os.close(3)
    except OSError:
        pass
    if saved is not None:
        os.dup2(saved, 3, inheritable=not was_cloexec)
        os.close(saved)


def _collect_dialog(process: subprocess.Popen[bytes], read_fd: int) -> tuple[str, bytes]:
    """Acquire only bounded status/payload streams before one monotonic deadline."""
    payload = bytearray()
    status = bytearray()
    deadline = time.monotonic() + DIALOG_TIMEOUT_SECONDS
    assert process.stdout is not None
    with selectors.DefaultSelector() as selector:
        for descriptor, buffer, limit, label in (
            (read_fd, payload, MAX_SECRET_BYTES + 4, "payload"),
            (process.stdout.fileno(), status, MAX_STATUS_BYTES, "status"),
        ):
            os.set_blocking(descriptor, False)
            selector.register(descriptor, selectors.EVENT_READ, (buffer, limit, label))
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise StageError("dialog acquisition deadline expired")
            for key, _events in selector.select(min(remaining, 0.1)):
                buffer, limit, label = key.data
                try:
                    chunk = os.read(key.fd, min(8_192, limit + 1 - len(buffer)))
                except BlockingIOError:
                    continue
                if not chunk:
                    selector.unregister(key.fd)
                    continue
                if len(buffer) + len(chunk) > limit:
                    if label == "payload":
                        raise StageError("dialog payload is invalid or oversized")
                    raise StageError("dialog status exceeds its byte budget")
                buffer.extend(chunk)
        try:
            process.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            raise StageError("dialog acquisition deadline expired") from None
    return status.decode("utf-8", errors="replace"), bytes(payload)


def launch_dialog(spec_path: str) -> tuple[int, str, bytes, str]:
    """Run the masked dialog and receive its bounded fd-3 payload and status."""
    read_fd, write_fd = os.pipe()
    saved_fd, was_cloexec = _save_fd_three() if 3 not in (read_fd, write_fd) else (None, False)
    if read_fd == 3:
        moved_read_fd = fcntl.fcntl(read_fd, fcntl.F_DUPFD_CLOEXEC, 10)
        os.close(read_fd)
        read_fd = moved_read_fd
    try:
        if write_fd != 3:
            os.dup2(write_fd, 3, inheritable=True)
            os.close(write_fd)
            write_fd = 3
        process = subprocess.Popen(
            ["python3", str(DIALOG_HELPER), spec_path],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            env=build_dialog_environment(),
            pass_fds=(3,),
            close_fds=True,
            start_new_session=True,
        )
    except OSError:
        os.close(read_fd)
        raise
    finally:
        if write_fd == 3:
            _restore_fd_three(saved_fd, was_cloexec)
        else:
            try:
                os.close(write_fd)
            except OSError:
                pass
            if saved_fd is not None:
                os.close(saved_fd)
    try:
        status, payload = _collect_dialog(process, read_fd)
        assert process.returncode is not None
        return process.returncode, status, payload, ""
    finally:
        # The direct helper may have exited while its descendants still hold pipes.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            raise StageError("dialog cleanup deadline expired") from None
        finally:
            os.close(read_fd)
            if process.stdout is not None:
                process.stdout.close()


def validate_target(target: str) -> tuple[int, str]:
    """Open and validate an absolute target's parent without following links."""
    if not target.startswith("/") or "\0" in target:
        raise StageError("target must be an absolute path")
    path = Path(target)
    name = path.name
    if not name or name in (".", ".."):
        raise StageError("target must name a file")
    parts = path.parent.parts[1:]
    directory_fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts:
            next_fd = os.open(
                part,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=directory_fd,
            )
            os.close(directory_fd)
            directory_fd = next_fd
        directory_info = os.fstat(directory_fd)
        if not stat.S_ISDIR(directory_info.st_mode):
            raise StageError("target parent is not a directory")
        if directory_info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
            private_owner_dir = (
                directory_info.st_uid == os.geteuid()
                and stat.S_IMODE(directory_info.st_mode) == 0o700
            )
            if not private_owner_dir:
                raise StageError("target parent is group/world writable")
        return directory_fd, name
    except BaseException:
        os.close(directory_fd)
        raise


def _read_payload(payload: bytes, minimum: int, maximum: int) -> bytes:
    """Validate the bounded length-prefixed UTF-8 value received from fd 3."""
    if len(payload) < 4:
        raise StageError("dialog returned no secret payload")
    length = struct.unpack(">I", payload[:4])[0]
    if length > MAX_SECRET_BYTES or len(payload) != length + 4:
        raise StageError("dialog payload is invalid or oversized")
    secret = payload[4:]
    try:
        text = secret.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise StageError("dialog payload is not valid UTF-8") from error
    if len(text) < minimum or len(text) > maximum:
        raise StageError("dialog payload does not meet the length requirements")
    return secret


SNAPSHOT_FIELDS = (
    "st_dev",
    "st_ino",
    "st_mode",
    "st_nlink",
    "st_uid",
    "st_size",
    "st_mtime_ns",
    "st_ctime_ns",
)


class TargetSnapshot:
    """Sampled destination metadata used to detect a concurrent change without reads.

    Comparison covers identity, ownership, type, link count, size and timestamps
    only. It narrows the overwrite race to a sampled recheck; it cannot stop a
    hostile writer that restores an identical inode state between samples.
    """

    __slots__ = ("info",)

    def __init__(self, info: os.stat_result | None) -> None:
        """Record sampled metadata; None records that the destination was absent."""
        self.info = info

    def matches(self, current: os.stat_result | None) -> bool:
        """Return whether current no-follow metadata equals the sampled state."""
        if self.info is None or current is None:
            return self.info is None and current is None
        return all(
            getattr(self.info, field) == getattr(current, field)
            for field in SNAPSHOT_FIELDS
        )

    def require_unchanged(self, directory_fd: int, name: str) -> None:
        """Raise when the destination no longer matches this sampled state."""
        if not self.matches(_sample_target(directory_fd, name).info):
            raise StageError("target changed after it was explicitly inspected")


def _sample_target(directory_fd: int, name: str) -> TargetSnapshot:
    """Sample final-component metadata without following links or reading content."""
    try:
        info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        info = None
    return TargetSnapshot(info)


def _unlink_if_owned(directory_fd: int, name: str, identity: tuple[int, int]) -> None:
    """Remove only the temporary file created here, never a substituted replacement."""
    try:
        current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except OSError:
        return
    if (current.st_dev, current.st_ino) != identity:
        return
    try:
        os.unlink(name, dir_fd=directory_fd)
    except OSError:
        pass


def write_secret(
    directory_fd: int,
    name: str,
    secret: bytes,
    allow_overwrite: bool,
    expected: TargetSnapshot | None = None,
) -> None:
    """Persist the payload privately, refusing a destination changed since consent.

    Args:
        directory_fd: Open descriptor for the validated absolute parent.
        name: Final path component to publish.
        secret: Bounded payload bytes to write.
        allow_overwrite: Whether replacing an existing regular file was requested.
        expected: Metadata sampled before the dialog; direct callers without a
            sample bind to the destination inspected at this function's entry.
    """
    snapshot = expected if expected is not None else _sample_target(directory_fd, name)
    snapshot.require_unchanged(directory_fd, name)
    existing = snapshot.info
    if existing is not None:
        if not allow_overwrite:
            raise StageError("target already exists; pass --allow-overwrite explicitly")
        if (
            not stat.S_ISREG(existing.st_mode)
            or existing.st_uid != os.geteuid()
        ):
            raise StageError("existing target must be a regular file owned by this user")

    replace_existing = allow_overwrite and existing is not None
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    created_name = (
        f".secret-stage-{secrets.token_hex(12)}" if replace_existing else name
    )
    descriptor = os.open(created_name, flags, 0o600, dir_fd=directory_fd)
    created_identity: tuple[int, int] | None = None
    published = False
    try:
        created_info = os.fstat(descriptor)
        created_identity = (created_info.st_dev, created_info.st_ino)
        os.fchmod(descriptor, 0o600)
        view = memoryview(secret)
        while view:
            written = os.write(descriptor, view)
            if not isinstance(written, int) or written <= 0 or written > len(view):
                raise StageError("private staging write made invalid progress")
            view = view[written:]
        os.fsync(descriptor)
        written_snapshot = TargetSnapshot(os.fstat(descriptor))
        os.close(descriptor)
        descriptor = -1
        written_snapshot.require_unchanged(directory_fd, created_name)
        if replace_existing:
            snapshot.require_unchanged(directory_fd, name)
            os.replace(
                created_name,
                name,
                src_dir_fd=directory_fd,
                dst_dir_fd=directory_fd,
            )
            published = True
        os.fsync(directory_fd)
        final = _sample_target(directory_fd, name).info
        # Rename can legitimately change ctime, but not the payload inode or
        # its remaining sampled metadata. Never report a replacement as staged.
        fields = SNAPSHOT_FIELDS if not replace_existing else (
            field for field in SNAPSHOT_FIELDS if field != "st_ctime_ns"
        )
        if final is None or any(
            getattr(final, field) != getattr(written_snapshot.info, field)
            for field in fields
        ):
            raise StageError("staged target changed before success could be verified")
    except BaseException:
        if descriptor >= 0:
            os.close(descriptor)
        if not published and created_identity is not None:
            _unlink_if_owned(directory_fd, created_name, created_identity)
        raise


def preflight_target(
    directory_fd: int, name: str, allow_overwrite: bool
) -> TargetSnapshot:
    """Snapshot and validate the destination before the user enters a secret."""
    snapshot = _sample_target(directory_fd, name)
    existing = snapshot.info
    if existing is None:
        return snapshot
    if not allow_overwrite:
        raise StageError("target already exists; pass --allow-overwrite explicitly")
    if not stat.S_ISREG(existing.st_mode) or existing.st_uid != os.geteuid():
        raise StageError("existing target must be a regular file owned by this user")
    return snapshot


def verify_target_parent(target: str, directory_fd: int, name: str) -> None:
    """Fail closed if the named parent changed while the user-facing helper ran."""
    try:
        current_fd, current_name = validate_target(target)
    except (OSError, StageError) as error:
        raise StageError("target parent changed while the dialog was open") from error
    try:
        original = os.fstat(directory_fd)
        current = os.fstat(current_fd)
        if (
            current_name != name
            or (current.st_dev, current.st_ino) != (original.st_dev, original.st_ino)
        ):
            raise StageError("target parent changed while the dialog was open")
    finally:
        os.close(current_fd)


def remove_spec(spec_path: str) -> None:
    """Delete the non-secret prompt specification before publication.

    A cleanup failure before the value is written fails closed. A later failure
    must not turn an already verified staged file into a reported failure, so
    the residual unlink in `run` is best-effort.
    """
    try:
        os.unlink(spec_path)
    except FileNotFoundError:
        return
    except OSError as error:
        raise StageError("could not remove the private dialog specification") from error


def run(args: argparse.Namespace) -> int:
    """Collect one value, stage it privately, and print only status metadata."""
    if args.min_length < 0 or args.max_length < 1 or args.max_length > MAX_SECRET_BYTES:
        raise StageError("length bounds are outside the allowed range")
    if args.min_length > args.max_length:
        raise StageError("minimum length exceeds maximum length")

    directory_fd, name = validate_target(args.target)
    spec_path: str | None = None
    secret = b""
    try:
        snapshot = preflight_target(directory_fd, name, args.allow_overwrite)
        spec = {
            "title": "Enter a one-use secret",
            "label": "Enter the secret for the requested local operation.",
            "description": "The value is transferred directly to a private staging file.",
            "minLength": args.min_length,
            "maxLength": args.max_length,
        }
        spec_fd, spec_path = tempfile.mkstemp(prefix="private-secret-spec-", suffix=".json")
        try:
            os.fchmod(spec_fd, 0o600)
            with os.fdopen(spec_fd, "w", encoding="utf-8") as spec_file:
                json.dump(spec, spec_file, ensure_ascii=False, separators=(",", ":"))
                spec_file.flush()
                os.fsync(spec_file.fileno())
        finally:
            try:
                os.close(spec_fd)
            except OSError:
                pass
        exit_code, status, payload, _stderr = launch_dialog(spec_path)
        # The helper has exited, so the spec is no longer needed. Removing it
        # here means a cleanup failure cannot happen after publication.
        remove_spec(spec_path)
        spec_path = None
        if exit_code == 2 and status.strip() == "cancelled" and not payload:
            print("cancelled")
            return 2
        if exit_code != 0:
            raise DialogFailure(exit_code, status)
        if status.strip() != "ok":
            raise StageError("dialog did not return a success status")
        verify_target_parent(args.target, directory_fd, name)
        secret = _read_payload(payload, args.min_length, args.max_length)
        write_secret(directory_fd, name, secret, args.allow_overwrite, snapshot)
        try:
            print(json.dumps({"status": "staged", "path": args.target, "bytes": len(secret)}))
            print(REMINDER)
            sys.stdout.flush()
        except OSError:
            # The staged file is already verified. A closed or broken status
            # stream must not report failure for a value that was delivered.
            pass
        return 0
    finally:
        secret = b""
        try:
            os.close(directory_fd)
        except OSError:
            pass
        if spec_path is not None:
            try:
                os.unlink(spec_path)
            except OSError:
                pass


def parser() -> argparse.ArgumentParser:
    """Build the staging command-line interface."""
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--target", required=True, help="absolute destination for the staged file")
    result.add_argument("--min-length", type=int, default=0)
    result.add_argument("--max-length", type=int, default=MAX_SECRET_BYTES)
    overwrite = result.add_mutually_exclusive_group()
    overwrite.add_argument("--forbid-existing", action="store_true", help="refuse an existing target (the default)")
    overwrite.add_argument("--allow-overwrite", action="store_true", help="explicitly replace an existing user-owned regular file")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    """Validate the request, obtain one secret, and stage it without echoing it."""
    try:
        return run(parser().parse_args(argv))
    except StageError as error:
        print(f"private-secret-stage: {error}", file=sys.stderr)
        if isinstance(error, DialogFailure):
            return error.exit_code if error.exit_code > 0 else 128 - error.exit_code
        return 1
    except OSError:
        print("private-secret-stage: secure staging failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
