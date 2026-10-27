#!/usr/bin/env python3
"""Prepare the fixed synthetic-test scratch root on a fresh CI runner."""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path

SCRATCH_ROOT = Path("/tmp/opencode")


class ScratchError(RuntimeError):
    """Report an unsafe scratch path without changing an existing directory."""


def prepare_scratch(path: Path = SCRATCH_ROOT) -> None:
    """Create an owned directory without following any ancestor or leaf symlink.

    Existing harness directories are preserved, including their permissions.
    Tests create private temporary children; their contents are synthetic only.
    """
    if not path.is_absolute() or ".." in path.parts or path == Path("/"):
        raise ScratchError("Scratch must be a fixed absolute directory path.")
    directory = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in path.parent.parts[1:]:
            child = os.open(
                component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=directory,
            )
            os.close(directory)
            directory = child
        try:
            os.mkdir(path.name, mode=0o700, dir_fd=directory)
        except FileExistsError:
            pass
        child = os.open(
            path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=directory,
        )
        try:
            info = os.fstat(child)
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o002:
                raise ScratchError("Existing scratch has unsafe ownership or public write access.")
        finally:
            os.close(child)
    except OSError:
        raise ScratchError("Scratch must have real, accessible directory ancestors and leaf.") from None
    finally:
        os.close(directory)


def main() -> int:
    """Prepare only the fixed test path; never accept a user-supplied destination."""
    try:
        prepare_scratch()
    except ScratchError as error:
        print(f"test scratch: {error}", file=sys.stderr)
        return 2
    print("Synthetic test scratch is ready; existing permissions and contents preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
