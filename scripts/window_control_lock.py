"""Provide a persistent, cooperative kernel lock for one extension target."""

from __future__ import annotations

from contextlib import contextmanager
import fcntl
import os
from pathlib import Path
import stat
from typing import Iterator

LOCK_NAME = ".computer-use-window-control.lock"


@contextmanager
def open_directory(path: Path) -> Iterator[int]:
    """Open an absolute directory without following any symlink component."""
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Expected an absolute, traversal-free directory: {path}")
    descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for component in path.parts[1:]:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
                            | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        yield descriptor
    finally:
        os.close(descriptor)


def directory_identity(path: Path) -> tuple[int, int]:
    """Return the identity of a securely opened directory."""
    with open_directory(path) as descriptor:
        info = os.fstat(descriptor)
        return info.st_dev, info.st_ino


@contextmanager
def target_lock(target: Path) -> Iterator[int]:
    """Exclusively lock an existing target, refusing contention or unsafe locks.

    The inode is persistent: callers must never unlink this lock. Only writers
    using this same protocol are serialized; this is not a same-UID security wall.
    Yields an open target directory descriptor for descriptor-relative mutations.
    """
    with open_directory(target) as directory:
        descriptor = os.open(LOCK_NAME, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW
                             | os.O_NONBLOCK | os.O_CLOEXEC, 0o600, dir_fd=directory)
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 4096:
                raise ValueError("Unsafe persistent window-control lock")
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise ValueError("Window-control target is locked by another writer") from error
            current = os.stat(LOCK_NAME, dir_fd=directory, follow_symlinks=False)
            if ((current.st_dev, current.st_ino) != (info.st_dev, info.st_ino)
                    or not stat.S_ISREG(current.st_mode) or current.st_nlink != 1
                    or current.st_size > 4096):
                raise ValueError("Persistent window-control lock identity changed")
            os.fsync(directory)
            yield directory
        finally:
            os.close(descriptor)
