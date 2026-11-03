#!/usr/bin/env python3
"""Preview or deploy the managed GNOME bridge bundle; never enable or restart it."""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

from window_control_lock import target_lock

UUID = "opencode-window-control@computer-use.local"
# Every file the loaded extension can import must be deployed. `extension.js`
# imports capture.mjs, input.mjs and launch.mjs dynamically, so a managed set that
# omits the latter two deploys an extension whose input and launch fail at call time
# with "No such file or directory" - which is exactly what a live launch attempt hit.
FILES = ("metadata.json", "extension.js", "policy.mjs", "capture.mjs", "input.mjs", "launch.mjs", "runtime-contract.mjs")
# The shared contract has one canonical source outside the extension directory;
# deployment copies it under the name capture.mjs imports.
SOURCE_OVERRIDES = {
    "runtime-contract.mjs": Path(__file__).resolve().parents[1]
    / "tools/computer-use-runtime/src/runtime-contract.mjs",
}
MARKER = ".computer-use-managed.json"
SOURCE = Path(__file__).resolve().parents[1] / "tools/gnome-window-control"


def source_file(name: str) -> Path:
    """Return the canonical source for one managed file."""
    return SOURCE_OVERRIDES.get(name, SOURCE / name)


def reject_symlinks(path: Path) -> None:
    """Refuse symlinked source/target paths and non-directory ancestors."""
    for entry in reversed((path, *path.parents)):
        if entry.is_symlink():
            raise ValueError(f"Refusing symlink: {entry}")
        if entry != path and entry.exists() and not entry.is_dir():
            raise ValueError(f"Not a directory: {entry}")


def digest(path: Path) -> str:
    """Return the managed file's exact content hash."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def deployment_plan(source: Path, target: Path) -> dict[str, object]:
    """Validate ownership and preserve all unrelated or manually edited data."""
    reject_symlinks(source)
    reject_symlinks(target)
    if target.name != UUID:
        raise ValueError(f"The target directory must be named {UUID}")
    if target.exists() and not target.is_dir():
        raise ValueError("Extension target is not a directory")
    expected = {}
    actual = {}
    for name in FILES:
        src = source_file(name) if name in SOURCE_OVERRIDES else source / name
        dst = target / name
        reject_symlinks(src)
        reject_symlinks(dst)
        if not src.is_file() or (dst.exists() and not dst.is_file()):
            raise ValueError(f"Managed entry must be a regular file: {name}")
        expected[name] = digest(src)
        actual[name] = digest(dst) if dst.exists() else None
    metadata = json.loads((source / "metadata.json").read_text())
    if metadata.get("uuid") != UUID or metadata.get("shell-version") != ["50"]:
        raise ValueError("Unexpected extension UUID or supported Shell version")
    marker = target / MARKER
    reject_symlinks(marker)
    if marker.exists():
        if not marker.is_file() or marker.stat().st_size > 16384:
            raise ValueError("Invalid ownership marker")
        owned = json.loads(marker.read_text())
        if not isinstance(owned, dict) or owned.get("uuid") != UUID or owned.get("version") != 1:
            raise ValueError("Invalid ownership marker identity")
        recorded = owned.get("files")
        if not isinstance(recorded, dict) or not set(recorded).issubset(set(FILES)):
            raise ValueError("Invalid ownership marker file set")
        # A legacy marker may list fewer managed files; every file it does list
        # must still match, so an upgrade cannot adopt a tampered tree.
        if recorded != {name: actual[name] for name in recorded}:
            raise ValueError("Managed target files changed outside deployment; preserve and review them")
    elif any(value is not None for value in actual.values()):
        raise ValueError("Refusing to take ownership of existing unmanaged extension files")
    return {"source": str(source), "target": str(target), "files": expected,
            "before": actual, "changes": [name for name in FILES if expected[name] != actual[name]],
            "marker_sha256": digest(marker) if marker.exists() else None,
            "enablement": "not performed", "restart": "not performed"}


def atomic_write(path: Path, contents: bytes) -> None:
    """Write via a new same-directory file without following an existing link."""
    descriptor, filename = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(contents)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(filename, path)


def deploy(source: Path, target: Path, apply: bool = False) -> dict[str, object]:
    """Keep previews read-only and serialize actual updates with installed restores."""
    plan = deployment_plan(source, target)
    if not apply or not plan["changes"]:
        return {"dry_run": not apply, **plan}
    target.mkdir(parents=True, exist_ok=True)
    with target_lock(target):
        if deployment_plan(source, target) != plan:
            raise ValueError("Target changed while acquiring deployment lock")
        return _deploy_locked(source, target)


def _deploy_locked(source: Path, target: Path) -> dict[str, object]:
    """Update previously owned files with the caller holding the target lock."""
    plan = deployment_plan(source, target)
    if not plan["changes"]:
        return {"dry_run": False, **plan}
    contents = {name: (source_file(name) if name in SOURCE_OVERRIDES else source / name).read_bytes() for name in FILES}
    if {name: hashlib.sha256(data).hexdigest() for name, data in contents.items()} != plan["files"]:
        raise ValueError("Source changed during deployment planning")
    target.mkdir(parents=True, exist_ok=True)
    if deployment_plan(source, target) != plan:
        raise ValueError("Target changed during deployment planning")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    marker = target / MARKER
    backup = None
    if marker.exists() or any(plan["before"][name] is not None for name in plan["changes"]):
        backups = target / ".backups"
        reject_symlinks(backups)
        backups.mkdir(exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix=stamp + "-", dir=backups))
    saved = False
    for name in plan["changes"]:
        destination = target / name
        reject_symlinks(destination)
        if (digest(destination) if destination.exists() else None) != plan["before"][name]:
            raise ValueError("Target changed before a managed file replacement")
        if destination.exists():
            shutil.copy2(destination, backup / name)
            saved = True
        atomic_write(destination, contents[name])
    if (digest(marker) if marker.exists() else None) != plan["marker_sha256"]:
        raise ValueError("Ownership marker changed during deployment")
    if marker.exists():
        shutil.copy2(marker, backup / MARKER)
        saved = True
    atomic_write(marker, (json.dumps({"uuid": UUID, "version": 1, "files": plan["files"]}, indent=2) + "\n").encode())
    verified = deployment_plan(source, target)
    if verified["changes"]:
        raise ValueError("Deployed files do not match canonical source")
    return {"dry_run": False, "backup": str(backup) if saved else None, **plan, "verified": True}


def main() -> int:
    """Require an explicit destination for writes and emit the exact manifest."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extension-dir", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    target = Path(os.path.abspath(args.extension_dir.expanduser()))
    try:
        result = deploy(SOURCE, target, args.apply)
    except (ValueError, OSError) as error:
        json.dump({"ok": False, "error": str(error)}, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 1
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
