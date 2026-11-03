#!/usr/bin/env python3
"""Preview or deploy only the canonical personality plugin declaration."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import stat

import mcp_config_transaction as transaction

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "tools/personality"
DEFAULT_ID = "personality-plain-english"
spec = importlib.util.spec_from_file_location("personality_jsonc", ROOT / "scripts/setup-opencode-jsonc.py")
assert spec and spec.loader
jsonc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jsonc)


def merged_config(current: bytes, source: bytes) -> bytes:
    """Merge one exact declaration without replacing unrelated settings.

    Args:
        current: Exact selected target JSONC bytes.
        source: Canonical global template bytes.

    Returns:
        Target JSONC with only its plugin array changed.
    """
    document = jsonc.parse_jsonc(current.decode("utf-8"))
    template = jsonc.parse_jsonc(source.decode("utf-8"))
    if not isinstance(document, dict) or not isinstance(template, dict):
        raise ValueError("configuration roots must be objects")
    plugins, desired = document.get("plugins", []), template.get("plugins")
    if not isinstance(plugins, list) or not isinstance(desired, list):
        raise ValueError("plugins must be arrays")

    def selected(entry: object) -> bool:
        """Match only this canonical package, never a similarly named plugin."""
        value = entry.get("package") if isinstance(entry, dict) else entry
        return value == str(PACKAGE)

    candidates = [entry for entry in desired if selected(entry)]
    existing = [entry for entry in plugins if selected(entry)]
    if len(candidates) != 1 or len(existing) > 1:
        raise ValueError("require one canonical source and at most one target declaration")
    chosen = candidates[0]
    if chosen != {"package": str(PACKAGE), "options": {"defaultID": DEFAULT_ID}}:
        raise ValueError("source personality declaration differs from reviewed default")
    if any(isinstance(entry, dict) and entry.get("options", {}).get("defaultID", DEFAULT_ID) != DEFAULT_ID for entry in existing):
        raise ValueError("existing custom personality default needs explicit reconciliation")
    updated = [chosen if selected(entry) else entry for entry in plugins]
    if not existing:
        updated.append(chosen)
    if updated == plugins:
        return current
    result = jsonc.replace_top_level(current.decode("utf-8"), "plugins", updated).encode("utf-8")
    parsed = jsonc.parse_jsonc(result.decode("utf-8"))
    if {key: value for key, value in parsed.items() if key != "plugins"} != {
        key: value for key, value in document.items() if key != "plugins"
    }:
        raise ValueError("unrelated configuration changed")
    return result


def deploy(source: Path, target: Path, *, expected_sha256: str | None = None) -> dict[str, object]:
    """Preview or transactionally apply an exact plugin-only update.

    Args:
        source: Canonical global template path.
        target: Explicit existing active global configuration path.
        expected_sha256: Current target digest from preview, only after approval.

    Returns:
        Non-secret transaction evidence; application also retains a backup.
    """
    source, target = source.absolute(), target.absolute()
    if source.resolve() != source or target.resolve() != target:
        raise ValueError("symlinked configuration paths are refused")
    current = read_config_bytes(target)
    template = read_config_bytes(source)
    desired = merged_config(current, template)
    report = transaction.preview(target, desired)
    if expected_sha256 is not None:
        report = transaction.apply(target, desired, expected_sha256=expected_sha256)
    return {"source": str(source), "target": str(target), "scope": "personality plugin only; no restart", **report}


def read_config_bytes(filename: Path) -> bytes:
    """Read one bounded owned regular file without following a final alias."""
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
    """Require explicit paths and a preview digest for any write."""
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
