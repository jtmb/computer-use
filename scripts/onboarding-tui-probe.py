#!/usr/bin/env python3
"""Run one private OpenCode TUI in a bounded pseudo-terminal, without a prompt."""

from __future__ import annotations

import argparse
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import termios
import time
from pathlib import Path


def probe(
    binary: str,
    session: str,
    observation: Path,
    output: Path,
    timeout: float = 45,
    byte_limit: int = 8 * 1024 * 1024,
) -> dict[str, object]:
    """Observe actual TUI plugin setup, with bounded output and owned cleanup."""
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))
    environment = {
        **os.environ,
        "TERM": "xterm-256color",
        "COLUMNS": "140",
        "LINES": "40",
    }
    try:
        process = subprocess.Popen(
            [binary, "--session", session],
            stdin=slave,
            stdout=slave,
            stderr=slave,
            start_new_session=True,
            env=environment,
        )
    except OSError:
        os.close(master)
        os.close(slave)
        raise
    os.close(slave)
    acquired = 0
    seen = False
    forced = False
    deadline = time.monotonic() + timeout
    try:
        with output.open("wb") as stream:
            while process.poll() is None and time.monotonic() < deadline:
                if observation.is_file():
                    seen = True
                    break
                readable, _, _ = select.select([master], [], [], 0.1)
                if not readable:
                    continue
                remaining = byte_limit - acquired
                if remaining <= 0:
                    raise RuntimeError("TUI output exceeded its fixed byte allowance")
                try:
                    chunk = os.read(master, min(16384, remaining))
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                acquired += len(chunk)
                stream.write(chunk)
                if b"\x1b[6n" in chunk:
                    os.write(master, b"\x1b[1;1R")
                if not chunk:
                    break
    finally:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                forced = True
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        os.close(master)
    return {
        "observation_seen": seen,
        "exit_code": process.returncode,
        "output_bytes": acquired,
        "forced_kill": forced,
    }


def successful(result: dict[str, object]) -> bool:
    """Do not promote an observed startup followed by an error exit to success."""
    return (
        bool(result["observation_seen"])
        and not result["forced_kill"]
        and result["exit_code"] in (0, 130, -signal.SIGTERM)
    )


def main() -> None:
    """Parse test-owned paths and fail unless the real observer ran."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--observation", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = probe(args.binary, args.session, args.observation, args.output)
    print(json.dumps(result))
    if not successful(result):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
