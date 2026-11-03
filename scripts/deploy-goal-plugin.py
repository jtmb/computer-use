#!/usr/bin/env python3
"""Deploy only the canonical goal-plugin declaration, preserving other settings."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import stat

import mcp_config_transaction as transaction

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = "@prevalentware/opencode-goal-plugin"
LOCAL_PACKAGE = Path.home() / "repos/opencode-goal-plugin"
spec = importlib.util.spec_from_file_location("goal_deploy_jsonc", ROOT / "scripts/setup-opencode-jsonc.py")
assert spec and spec.loader
jsonc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jsonc)


def is_goal_entry(entry: object, local_package: Path = LOCAL_PACKAGE) -> bool:
    """Identify only the named package or the explicit local package directory."""
    value = entry.get("package") if isinstance(entry, dict) else entry
    return isinstance(value, str) and (
        value == PACKAGE or value.startswith(PACKAGE + "@") or value == str(local_package)
    )


def merged_config(current: bytes, source: bytes, local_package: Path = LOCAL_PACKAGE) -> bytes:
    """Merge one verified local declaration while retaining all unrelated JSONC bytes."""
    document = jsonc.parse_jsonc(current.decode("utf-8"))
    template = jsonc.parse_jsonc(source.decode("utf-8"))
    if not isinstance(document, dict) or not isinstance(template, dict):
        raise ValueError("configuration roots must be objects")
    plugins, desired = document.get("plugins"), template.get("plugins")
    if not isinstance(plugins, list) or not isinstance(desired, list):
        raise ValueError("both configurations need an explicit plugin list")
    selected = [item for item in desired if is_goal_entry(item, local_package)]
    existing = [item for item in plugins if is_goal_entry(item, local_package)]
    if len(selected) != 1 or len(existing) != 1:
        raise ValueError("require exactly one goal-plugin declaration in source and target")
    entry = selected[0]
    target = entry.get("package") if isinstance(entry, dict) else entry
    if target != str(local_package):
        raise ValueError("source must select the explicit local enhanced package")
    if isinstance(entry, dict) and entry.get("options", {}).get("goal_engine", "enhanced") != "enhanced":
        raise ValueError("deployment must preserve the enhanced engine selection")
    if "opencode.goal" in plugins:
        raise ValueError("refusing to switch an explicitly selected built-in engine")
    updated = [entry if is_goal_entry(item, local_package) else item for item in plugins]
    if "-opencode.goal" in desired and "-opencode.goal" not in updated:
        updated.append("-opencode.goal")
    result = jsonc.replace_top_level(current.decode("utf-8"), "plugins", updated).encode("utf-8")
    parsed = jsonc.parse_jsonc(result.decode("utf-8"))
    if {key: value for key, value in parsed.items() if key != "plugins"} != {
        key: value for key, value in document.items() if key != "plugins"
    }:
        raise ValueError("unrelated settings changed")
    return result


def deploy(source: Path, target: Path, *, expected_sha256: str | None = None) -> dict[str, object]:
    """Preview or CAS-apply the source-authored plugin-only deployment with rollback."""
    source, target = source.absolute(), target.absolute()
    if source.resolve() != source or target.resolve() != target:
        raise ValueError("symlinked configuration paths are refused")
    original = read_config_bytes(target)
    desired = merged_config(original, read_config_bytes(source))
    report = transaction.preview(target, desired)
    if expected_sha256 is not None:
        report = transaction.apply(target, desired, expected_sha256=expected_sha256)
    return {"source": str(source), "target": str(target), **report}


def read_config_bytes(filename: Path) -> bytes:
    """Bound both source and target reads and refuse aliases and special files."""
    descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid():
            raise ValueError("configuration must be an owned, single-link regular file")
        data = stream.read(transaction.MAX_CONFIG_BYTES + 1)
    if len(data) > transaction.MAX_CONFIG_BYTES:
        raise ValueError("configuration exceeds the byte limit")
    return data


def main() -> None:
    """Require explicit source, target and preview digest for a deployment."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-sha256")
    args = parser.parse_args()
    if args.apply != bool(args.expected_sha256):
        parser.error("--apply and --expected-sha256 must be supplied together")
    print(json.dumps(deploy(args.source, args.target, expected_sha256=args.expected_sha256)))


if __name__ == "__main__":
    main()
