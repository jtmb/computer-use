#!/usr/bin/env python3
"""Register this checkout's complete skill source globally without replacing config."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
MAX_CONFIG_BYTES = 2 * 1024 * 1024


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Reject ambiguous duplicate keys rather than changing their interpretation."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key in global configuration; retained unchanged")
        result[key] = value
    return result


def canonical(path: Path) -> Path:
    """Refuse symlinked paths instead of silently writing through them."""
    absolute = path.expanduser().absolute()
    if absolute.resolve() != absolute:
        raise ValueError(f"refusing symlinked path: {absolute}")
    return absolute


def read_config(filename: Path) -> tuple[bytes, dict[str, Any], os.stat_result]:
    """Read a bounded owned regular JSON file without following links."""
    descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_size > MAX_CONFIG_BYTES:
            raise ValueError("unsafe or oversized global configuration")
        data = source.read(MAX_CONFIG_BYTES + 1)
    if len(data) > MAX_CONFIG_BYTES:
        raise ValueError("global configuration exceeds byte budget")
    try:
        parsed = json.loads(data, object_pairs_hook=unique_object)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("skills-only deployment requires strict JSON; JSONC comments are not rewritten") from error
    if not isinstance(parsed, dict):
        raise ValueError("global configuration must be an object")
    return data, parsed, info


def deploy(filename: Path, skills: Path, *, apply: bool = False) -> dict[str, object]:
    """Add one complete source root, backing up and preserving all other settings.

    Args:
        filename: Existing selected global configuration document.
        skills: Canonical complete source bundle root to register, not copy.
        apply: Write only when explicitly selected; preview is the default.

    Returns:
        A nonsecret deployment receipt, including backup path when changed.
    """
    filename, skills = canonical(filename), canonical(skills)
    bundles = sorted(skills.glob("*/SKILL.md"))
    if not bundles or not (skills / "cross-session-coordination/SKILL.md").is_file():
        raise ValueError("coordination skill source is incomplete")
    for item in skills.rglob("*"):
        if item.is_symlink() or not (item.is_dir() or item.is_file()):
            raise ValueError("skill source contains a symlink or non-regular entry")
    original, config, info = read_config(filename)
    previous = config.get("skills", [])
    if not isinstance(previous, list) or not all(isinstance(item, str) for item in previous):
        raise ValueError("existing skills configuration is not a list of sources")
    already = any(not item.startswith(("http://", "https://")) and Path(item).expanduser().is_absolute()
                  and Path(item).expanduser().resolve() == skills for item in previous)
    receipt: dict[str, object] = {"target": str(filename), "source": str(skills), "skillCount": len(bundles),
                                  "changed": not already, "applied": False, "scope": "skills only; no restart or plugin activation"}
    if already or not apply:
        return receipt
    updated = {**config, "skills": [*previous, str(skills)]}
    data = (json.dumps(updated, indent=2, ensure_ascii=False) + "\n").encode()
    if len(data) > MAX_CONFIG_BYTES:
        raise ValueError("updated configuration exceeds byte budget")
    # This advisory lock coordinates this deployer; content comparison also catches other editors.
    descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as locked:
        fcntl.flock(locked, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current, _, latest = read_config(filename)
        if current != original or (latest.st_dev, latest.st_ino, latest.st_mtime_ns) != (info.st_dev, info.st_ino, info.st_mtime_ns):
            raise ValueError("global configuration changed; preview again")
        backup_fd, backup_name = tempfile.mkstemp(prefix=filename.name + ".backup.skills-", dir=filename.parent)
        with os.fdopen(backup_fd, "wb") as backup:
            backup.write(original)
            backup.flush()
            os.fsync(backup.fileno())
        output_fd, output_name = tempfile.mkstemp(prefix=".skills-deploy-", dir=filename.parent)
        try:
            with os.fdopen(output_fd, "wb") as output:
                os.fchmod(output.fileno(), stat.S_IMODE(info.st_mode))
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            if read_config(filename)[0] != original:
                raise ValueError("global configuration changed before replacement; retained backup")
            os.replace(output_name, filename)
            directory = os.open(filename.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            Path(output_name).unlink(missing_ok=True)
        _, observed, _ = read_config(filename)
        if observed != updated or {key: value for key, value in observed.items() if key != "skills"} != {
                key: value for key, value in config.items() if key != "skills"}:
            raise ValueError("global skills readback mismatch; inspect retained backup")
    return {**receipt, "applied": True, "backup": backup_name}


def main() -> None:
    """Discover the active config directory, preview, or apply the bounded change."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="register the source after backing up; default is preview")
    parser.add_argument("--config-dir", type=Path, help="explicit existing global config directory; otherwise use opencode debug paths")
    args = parser.parse_args()
    directory = args.config_dir
    if directory is None:
        result = subprocess.run(["opencode", "debug", "paths"], check=True, capture_output=True, text=True, timeout=15)
        matches = [line.split(maxsplit=1)[1] for line in result.stdout.splitlines() if line.split()[:1] == ["config"]]
        if len(matches) != 1:
            raise ValueError("cannot identify one active global config directory")
        directory = Path(matches[0])
    candidates = [directory / name for name in ("opencode.jsonc", "opencode.json") if (directory / name).exists()]
    if len(candidates) != 1:
        raise ValueError("select a directory containing exactly one existing global config document")
    print(json.dumps(deploy(candidates[0], ROOT / ".opencode/skills", apply=args.apply)))


if __name__ == "__main__":
    main()
