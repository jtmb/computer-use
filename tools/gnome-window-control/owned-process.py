"""Supervise one newly forked child using a retained Linux pidfd, never a saved PID."""

from __future__ import annotations

import argparse
import json
import logging
import os
import select
import signal
import stat
import time
from collections.abc import Sequence
from pathlib import Path

LOGGER = logging.getLogger(__name__)


class OwnershipError(RuntimeError):
    """Refuse an unsafe process lifecycle or job directory."""


def job_directory(raw: str) -> Path:
    """Require an existing owner-private, nonsymlink job directory."""
    directory = Path(raw)
    if not directory.is_absolute() or directory.resolve() != directory:
        raise OwnershipError("job directory must be absolute and nonsymlinked")
    info = directory.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise OwnershipError("job directory must be owner-private")
    return directory


def stop_requested(directory: Path) -> bool:
    """Read only this job's directory stop marker without following links."""
    try:
        info = (directory / "stop.request").lstat()
    except FileNotFoundError:
        return False
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise OwnershipError("invalid stop marker; refusing to follow it")
    return True


def publish(directory: Path, record: dict[str, object]) -> None:
    """Atomically update only the receipt created by this invocation."""
    temporary = directory / "receipt.pending"
    descriptor = os.open(
        temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(record, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, directory / "receipt.json")


class OwnedChild:
    """Keep a child blocked before exec until its kernel identity handle exists."""

    def __init__(self, command: Sequence[str]) -> None:
        if (
            not command
            or not callable(getattr(os, "pidfd_open", None))
            or not callable(getattr(signal, "pidfd_send_signal", None))
        ):
            raise OwnershipError(
                "Linux pidfd support and a command are required before launch"
            )
        read_pipe, write_pipe = os.pipe2(os.O_CLOEXEC)
        try:
            child = os.fork()
        except OSError:
            os.close(read_pipe)
            os.close(write_pipe)
            raise
        if child == 0:
            os.close(write_pipe)
            try:
                permitted = os.read(read_pipe, 1) == b"G"
                os.close(read_pipe)
                if permitted:
                    os.execvpe(command[0], list(command), os.environ)
            except OSError:
                os._exit(126)
            os._exit(125)
        os.close(read_pipe)
        self.pid = child
        self.gate: int | None = write_pipe
        self.status: int | None = None
        try:
            self.handle = os.pidfd_open(child)
        except OSError:
            os.close(write_pipe)
            self.gate = None
            os.waitpid(child, 0)
            raise OwnershipError(
                "pidfd acquisition failed; blocked child exited without exec"
            ) from None

    def release(self) -> None:
        """Permit exec once, only after the caller has retained the pidfd."""
        if self.gate is None:
            raise OwnershipError("child launch gate already closed")
        try:
            os.write(self.gate, b"G")
        finally:
            os.close(self.gate)
            self.gate = None

    def wait(self, seconds: float) -> bool:
        """Reap only the retained child after its pidfd becomes readable."""
        if self.status is not None:
            return True
        if not select.select([self.handle], [], [], seconds)[0]:
            return False
        _, status = os.waitpid(self.pid, 0)
        self.status = os.waitstatus_to_exitcode(status)
        return True

    def stop(self) -> None:
        """Terminate only the retained child; no process-group/PID fallback exists."""
        if self.gate is not None:
            os.close(self.gate)
            self.gate = None
        if self.wait(0):
            return
        for requested, grace in [(signal.SIGTERM, 1.0), (signal.SIGKILL, 2.0)]:
            try:
                signal.pidfd_send_signal(self.handle, requested)
            except ProcessLookupError:
                pass
            if self.wait(grace):
                return
        raise OwnershipError("owned child did not exit after bounded pidfd cleanup")

    def close(self) -> None:
        """Clean up the retained child and descriptor even after caller failure."""
        try:
            self.stop()
        finally:
            os.close(self.handle)


def run_owned(directory: Path, command: Sequence[str], timeout: float) -> int:
    """Run one new child and retain outcome evidence in a fresh private job."""
    if (
        (directory / "receipt.json").exists()
        or (directory / "receipt.json").is_symlink()
        or (directory / "receipt.pending").exists()
    ):
        raise OwnershipError("refusing an existing process receipt")
    if stop_requested(directory):
        publish(
            directory,
            {"status": "cancelled", "reaped": True, "reason": "stopped-before-launch"},
        )
        return 0
    interrupted: int | None = None

    def interrupt(number: int, _frame: object) -> None:
        """Defer signal handling to the bounded owned-child cleanup path."""
        nonlocal interrupted
        interrupted = number

    prior = {
        number: signal.signal(number, interrupt)
        for number in [signal.SIGTERM, signal.SIGINT]
    }
    child: OwnedChild | None = None
    started = time.monotonic()
    try:
        child = OwnedChild(command)
        publish(
            directory,
            {
                "status": "running",
                "processId": child.pid,
                "pidfdHeld": True,
                "reaped": False,
            },
        )
        if interrupted or stop_requested(directory):
            child.stop()
            reason = "interrupted" if interrupted else "stopped-before-exec"
        else:
            child.release()
            reason = "exited"
            while not child.wait(0.05):
                if interrupted or stop_requested(directory):
                    reason = "interrupted" if interrupted else "stop-requested"
                    child.stop()
                    break
                if time.monotonic() - started >= timeout:
                    reason = "deadline"
                    child.stop()
                    break
        publish(
            directory,
            {
                "status": "complete",
                "processId": child.pid,
                "pidfdHeld": True,
                "reaped": True,
                "reason": reason,
                "childExitCode": child.status,
            },
        )
        if reason == "deadline":
            return 124
        if reason == "interrupted":
            return 128 + (interrupted or signal.SIGTERM)
        return 0 if reason != "exited" or child.status == 0 else 1
    finally:
        try:
            if child is not None:
                child.close()
        finally:
            for number, handler in prior.items():
                signal.signal(number, handler)


def receipt(directory: Path) -> dict[str, object] | None:
    """Read small owner-private metadata; it never reconstructs a pidfd authority."""
    try:
        descriptor = os.open(
            directory / "receipt.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
        )
    except FileNotFoundError:
        return None
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_size > 4096
        ):
            raise OwnershipError("invalid process receipt")
        raw = stream.read(4097)
    if len(raw) > 4096:
        raise OwnershipError("oversized process receipt")
    value: object = json.loads(raw)
    if not isinstance(value, dict):
        raise OwnershipError("invalid process receipt shape")
    return value


def main(arguments: Sequence[str] | None = None) -> int:
    """Expose run/readiness/membership only; arbitrary-PID signaling is absent."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["run", "ready", "matches"])
    parser.add_argument("--job-dir", required=True)
    parser.add_argument("--timeout-seconds", type=float, default=1800)
    parser.add_argument("--pid", type=int)
    known, command = parser.parse_known_args(arguments)
    if command and command[0] == "--":
        command = command[1:]
    if not 0 < known.timeout_seconds <= 1800 or known.operation != "run" and command:
        parser.error("invalid timeout or unexpected command")
    if known.operation == "run" and known.pid is not None:
        parser.error("run never accepts a caller-supplied PID")
    directory = job_directory(known.job_dir)
    if known.operation == "run":
        return run_owned(directory, command, known.timeout_seconds)
    if known.operation == "matches":
        value = receipt(directory)
        return (
            0
            if value
            and value.get("status") == "running"
            and value.get("pidfdHeld") is True
            and value.get("processId") == known.pid
            else 1
        )
    deadline = time.monotonic() + min(known.timeout_seconds, 5)
    while receipt(directory) is None:
        if time.monotonic() >= deadline:
            raise OwnershipError("process receipt not ready within its bound")
        time.sleep(0.01)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OwnershipError, OSError, ValueError) as error:
        LOGGER.error("owned process refused: %s", error)
        raise SystemExit(2) from None
