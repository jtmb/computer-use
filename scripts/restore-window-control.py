#!/usr/bin/env python3
"""Preview an installed-byte restore from an original forward-deployer receipt."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import sys
from typing import Callable

from window_control_lock import directory_identity, open_directory, target_lock

UUID = "opencode-window-control@computer-use.local"
FILES = ("metadata.json", "extension.js", "policy.mjs", "capture.mjs", "input.mjs",
         "launch.mjs", "runtime-contract.mjs")
MARKER = ".computer-use-managed.json"
MAX_FILE = 4 * 1024 * 1024
MAX_JSON = 64 * 1024
MAX_MARKER = 16384


class RestoreError(ValueError):
    """Report failure with the retained recovery directory, when one exists."""

    def __init__(self, message: str, recovery: Path | None = None) -> None:
        super().__init__(message)
        self.recovery = recovery


def sha256(data: bytes) -> str:
    """Hash actual bytes rather than a source-tree claim."""
    return hashlib.sha256(data).hexdigest()


def signature(info: os.stat_result) -> tuple[int, ...]:
    """Include identity and change indicators in file compare-and-swap checks."""
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns)


@dataclass(frozen=True)
class Snapshot:
    """Keep bounded bytes and their observed filesystem identity together."""

    data: bytes | None
    signature: tuple[int, ...] | None
    limit: int

    @property
    def digest(self) -> str | None:
        """Return explicit absence or the actual byte hash."""
        return None if self.data is None else sha256(self.data)


def read_snapshot(path: Path, limit: int = MAX_FILE) -> Snapshot:
    """Bound allocation and reject links, special files, growth and read races."""
    with open_directory(path.parent) as directory:
        try:
            descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
                                 | os.O_CLOEXEC, dir_fd=directory)
        except FileNotFoundError:
            return Snapshot(None, None, limit)
        try:
            before = os.fstat(descriptor)
            if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                    or before.st_size > limit):
                raise RestoreError(f"Unsafe, linked, nonregular or oversized file: {path}")
            chunks = []
            size = 0
            while True:
                chunk = os.read(descriptor, min(65536, limit + 1 - size, before.st_size + 1 - size))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
                if size > limit or size > before.st_size:
                    raise RestoreError(f"File grew while reading: {path}")
            after = os.fstat(descriptor)
            current = os.stat(path.name, dir_fd=directory, follow_symlinks=False)
            if (signature(before) != signature(after) or signature(after) != signature(current)
                    or size != before.st_size):
                raise RestoreError(f"File changed while reading: {path}")
            return Snapshot(b"".join(chunks), signature(after), limit)
        finally:
            os.close(descriptor)


def json_object(data: bytes | None, label: str) -> dict[str, object]:
    """Decode a bounded JSON object without ambiguous duplicate keys or NaN."""
    def unique(pairs: list[tuple[str, object]]) -> dict[str, object]:
        """Reject duplicate members at every nesting level."""
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise RestoreError(f"Duplicate JSON key in {label}: {key}")
            result[key] = value
        return result

    def invalid_constant(value: str) -> None:
        """Do not accept nonstandard JSON numeric constants."""
        raise RestoreError(f"Invalid JSON constant in {label}: {value}")

    if data is None:
        raise RestoreError(f"Missing {label}")
    try:
        result = json.loads(data, object_pairs_hook=unique, parse_constant=invalid_constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise RestoreError(f"Invalid JSON in {label}") from error
    if not isinstance(result, dict):
        raise RestoreError(f"Expected a JSON object in {label}")
    return result


def valid_hash(value: object) -> bool:
    """Accept only the original deployer's lowercase SHA-256 representation."""
    return isinstance(value, str) and len(value) == 64 and all(
        character in "0123456789abcdef" for character in value)


def hash_map(value: object, nullable: bool = False) -> dict[str, str | None]:
    """Require the complete, exact seven-file map; never infer missing absences."""
    if not isinstance(value, dict) or set(value) != set(FILES):
        raise RestoreError("Receipt requires the exact complete seven-file hash map")
    if any(not valid_hash(item) and not (nullable and item is None) for item in value.values()):
        raise RestoreError("Receipt contains an invalid hash")
    return value


def marker_files(snapshot: Snapshot) -> dict[str, str]:
    """Validate version-one ownership and retain its actual managed subset."""
    marker = json_object(snapshot.data, "ownership marker")
    files = marker.get("files")
    if (marker.get("uuid") != UUID or type(marker.get("version")) is not int
            or marker["version"] != 1 or not isinstance(files, dict)
            or not set(files).issubset(FILES) or any(not valid_hash(item) for item in files.values())):
        raise RestoreError("Invalid ownership marker identity or managed paths")
    return files


def encoded(value: object) -> bytes:
    """Serialize machine-readable evidence deterministically."""
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


@dataclass
class RestorePlan:
    """Retain exact input snapshots for an apply-time comparison, not authority."""

    target: Path
    receipt: Path
    evidence: dict[Path, Snapshot]
    directories: dict[Path, tuple[int, int]]
    desired: dict[str, bytes | None]
    old_managed: dict[str, str]

    def document(self) -> dict[str, object]:
        """Describe the preview and all identity checks without embedding file bytes."""
        return {
            "target": str(self.target), "receipt": str(self.receipt),
            "old_managed": self.old_managed,
            "restore": {name: None if data is None else sha256(data)
                        for name, data in self.desired.items()},
            "evidence": {str(path): {"sha256": item.digest, "signature": item.signature}
                         for path, item in sorted(self.evidence.items())},
            "directories": {str(path): identity for path, identity in sorted(self.directories.items())},
            "enablement": "not performed", "restart": "not performed",
        }

    @property
    def digest(self) -> str:
        """Bind optional operator preview checking to the complete plan."""
        return sha256(encoded(self.document()))


def recheck(plan: RestorePlan, expected: dict[Path, Snapshot]) -> None:
    """Check every proof and current file before each managed mutation."""
    for path, identity in plan.directories.items():
        if directory_identity(path) != identity:
            raise RestoreError(f"Directory identity changed: {path}")
    for path, previous in expected.items():
        if read_snapshot(path, previous.limit) != previous:
            raise RestoreError(f"Compare-and-swap evidence changed: {path}")


def restore_plan(target: Path, receipt: Path) -> RestorePlan:
    """Prove old bytes using only the selected original receipt and installed data."""
    target = Path(os.path.abspath(target))
    receipt = Path(os.path.abspath(receipt))
    if target.name != UUID:
        raise RestoreError(f"Target must be named {UUID}")
    directories = {path: directory_identity(path) for path in (target.parent, target, receipt.parent)}
    evidence = {receipt: read_snapshot(receipt, MAX_JSON)}
    record = json_object(evidence[receipt].data, "forward receipt")
    required = {"source", "target", "files", "before", "changes", "marker_sha256",
                "backup", "verified", "dry_run"}
    if not required.issubset(record) or record["verified"] is not True or record["dry_run"] is not False:
        raise RestoreError("Incomplete or unapplied original forward receipt")
    if record["target"] != str(target) or not isinstance(record["source"], str):
        raise RestoreError("Receipt target does not match the explicitly selected target")
    new = hash_map(record["files"])
    old = hash_map(record["before"], nullable=True)
    changes = [name for name in FILES if old[name] != new[name]]
    if record["changes"] != changes or not changes:
        raise RestoreError("Receipt changes are incomplete, ambiguous or not an update")
    backup_value = record["backup"]
    if not isinstance(backup_value, str) or not valid_hash(record["marker_sha256"]):
        raise RestoreError("Restore requires the actual saved old marker and exact backup")
    backup = Path(backup_value)
    if (not backup.is_absolute() or str(backup) != backup_value or ".." in backup.parts
            or backup.parent != target / ".backups" or backup.name in ("", ".", "..")):
        raise RestoreError("Backup must be the exact named directory under target/.backups")
    for path in (backup.parent, backup):
        directories[path] = directory_identity(path)
    for name in (*FILES, MARKER):
        path = target / name
        if path in evidence:
            raise RestoreError("Receipt overlaps managed data")
        evidence[path] = read_snapshot(path, MAX_MARKER if name == MARKER else MAX_FILE)
    differing = [name for name in FILES if evidence[target / name].digest != new[name]]
    if differing:
        raise RestoreError(f"Current installed seven-file hashes differ from the receipt at {target}: {differing}")
    if marker_files(evidence[target / MARKER]) != new:
        raise RestoreError("Current ownership marker differs from receipt new files")
    published_marker = (json.dumps({"uuid": UUID, "version": 1,
                                   "files": {name: new[name] for name in FILES}}, indent=2) + "\n").encode()
    if evidence[target / MARKER].data != published_marker:
        raise RestoreError("Current ownership marker bytes differ from original forward publication")
    saved_marker = backup / MARKER
    if saved_marker in evidence:
        raise RestoreError("Receipt overlaps saved marker proof")
    evidence[saved_marker] = read_snapshot(saved_marker, MAX_MARKER)
    if evidence[saved_marker].digest != record["marker_sha256"]:
        raise RestoreError("Saved old marker hash differs from the receipt")
    managed = marker_files(evidence[saved_marker])
    if managed != {name: old[name] for name in managed}:
        raise RestoreError("Old marker managed set disagrees with receipt before hashes")
    desired: dict[str, bytes | None] = {MARKER: evidence[saved_marker].data}
    for name in FILES:
        if old[name] is None:
            if name in managed:
                raise RestoreError(f"Old marker contradicts introduced-file absence: {name}")
            desired[name] = None
        elif name in changes:
            path = backup / name
            if path in evidence:
                raise RestoreError("Receipt overlaps backup proof")
            evidence[path] = read_snapshot(path)
            if evidence[path].digest != old[name]:
                raise RestoreError(f"Missing or changed saved old bytes: {path}")
            desired[name] = evidence[path].data
        else:
            if evidence[target / name].digest != old[name]:
                raise RestoreError(f"Unchanged bytes do not prove old content: {name}")
            desired[name] = evidence[target / name].data
    plan = RestorePlan(target, receipt, evidence, directories, desired, managed)
    recheck(plan, evidence)
    return plan


def write_exclusive(path: Path, data: bytes) -> None:
    """Create and durably verify a private recovery copy; never replace evidence."""
    with open_directory(path.parent) as directory:
        descriptor = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                             | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.fsync(directory)
    if read_snapshot(path).data != data:
        raise RestoreError(f"Recovery copy failed readback: {path}")


def journal_event(path: Path, event: dict[str, object]) -> None:
    """Append one durable journal record without following replaced special files."""
    previous = read_snapshot(path, MAX_JSON)
    if previous.data is None:
        raise RestoreError(f"Missing recovery journal: {path}")
    line = json.dumps(event, sort_keys=True).encode() + b"\n"
    if len(previous.data) + len(line) > MAX_JSON:
        raise RestoreError("Recovery journal exceeds its bounded size")
    with open_directory(path.parent) as directory:
        descriptor = os.open(path.name, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW
                             | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory)
        with os.fdopen(descriptor, "wb") as stream:
            info = os.fstat(stream.fileno())
            if signature(info) != previous.signature:
                raise RestoreError("Recovery journal identity or content changed")
            stream.write(line)
            stream.flush()
            os.fsync(stream.fileno())
    if read_snapshot(path, MAX_JSON).data != previous.data + line:
        raise RestoreError(f"Recovery journal append readback failed: {path}")


def prepare_recovery(plan: RestorePlan, recovery: Path) -> Path:
    """Preserve all current bytes, exact receipt, desired bytes and the restore plan."""
    write_exclusive(recovery / "journal.jsonl", b"")
    journal = recovery / "journal.jsonl"
    journal_event(journal, {"stage": "preparing", "target": str(plan.target)})
    for subdirectory in ("current", "desired"):
        (recovery / subdirectory).mkdir(mode=0o700)
    for name in (*FILES, MARKER):
        write_exclusive(recovery / "current" / name, plan.evidence[plan.target / name].data)
        if plan.desired[name] is not None:
            write_exclusive(recovery / "desired" / name, plan.desired[name])
    write_exclusive(recovery / "receipt.json", plan.evidence[plan.receipt].data)
    write_exclusive(recovery / "plan.json", encoded(plan.document()))
    with open_directory(recovery) as directory:
        os.fsync(directory)
    with open_directory(recovery.parent) as directory:
        os.fsync(directory)
    journal_event(journal, {"stage": "prepared", "plan_sha256": plan.digest})
    return journal


def publish(directory: int, name: str, temporary: str | None) -> None:
    """Perform one atomic publication, or one explicitly proven absence restore."""
    if temporary is None:
        os.unlink(name, dir_fd=directory)
    else:
        os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
    os.fsync(directory)


def apply_restore(plan: RestorePlan, notify: Callable[[Path], None] | None = None) -> dict[str, object]:
    """Restore bytes under a cooperative flock, retaining evidence on interruption.

    There is deliberately no automatic rollback or partial-run resume: unexpected
    state fails closed and the retained journal/copies require inspection.
    """
    recovery = None
    journal = None
    try:
        with target_lock(plan.target) as directory:
            opened = os.fstat(directory)
            if (opened.st_dev, opened.st_ino) != plan.directories[plan.target]:
                raise RestoreError(f"Directory identity changed: {plan.target}")
            expected = dict(plan.evidence)
            recheck(plan, expected)
            candidate = plan.target.with_name(f".{UUID}.restore-{secrets.token_hex(12)}")
            candidate.mkdir(mode=0o700)
            recovery = candidate
            journal = prepare_recovery(plan, recovery)
            if notify is not None:
                notify(recovery)
            recheck(plan, expected)
            for name in (*FILES, MARKER):
                path = plan.target / name
                desired = plan.desired[name]
                if expected[path].data == desired:
                    continue
                temporary = None
                staged = None
                if desired is not None:
                    temporary = f".restore-{secrets.token_hex(12)}"
                    write_exclusive(plan.target / temporary, desired)
                    staged = read_snapshot(plan.target / temporary)
                journal_event(journal, {"stage": "intent", "file": name, "temporary": temporary,
                                        "before": expected[path].digest,
                                        "after": None if desired is None else sha256(desired)})
                recheck(plan, expected)
                if (read_snapshot(path, expected[path].limit) != expected[path]
                        or directory_identity(plan.target) != plan.directories[plan.target]):
                    raise RestoreError(f"Immediate publication compare-and-swap changed: {path}")
                if temporary is not None and read_snapshot(plan.target / temporary) != staged:
                    raise RestoreError(f"Staged publication changed: {plan.target / temporary}")
                publish(directory, name, temporary)
                current = read_snapshot(path, expected[path].limit)
                if current.data != desired:
                    raise RestoreError(f"Publication readback differs: {path}")
                expected[path] = current
                journal_event(journal, {"stage": "published", "file": name, "sha256": current.digest})
            recheck(plan, expected)
            if any(read_snapshot(plan.target / name).data != data for name, data in plan.desired.items()):
                raise RestoreError("Final installed-byte verification failed")
            journal_event(journal, {"stage": "complete", "verified": True})
            checked = read_snapshot(recovery / "journal.jsonl", MAX_JSON)
            if not checked.data:
                raise RestoreError("Completion journal readback failed")
            terminal = json_object(checked.data.splitlines()[-1], "completion journal")
            if (set(terminal) != {"stage", "verified"} or terminal["stage"] != "complete"
                    or terminal["verified"] is not True):
                raise RestoreError("Completion journal readback failed")
            return {"dry_run": False, "verified": True, "target": str(plan.target),
                    "recovery": str(recovery), "plan_sha256": plan.digest,
                    "enablement": "not performed", "restart": "not performed"}
    except (OSError, ValueError, KeyboardInterrupt) as error:
        if journal is not None:
            try:
                journal_event(journal, {"stage": "interrupted", "error": str(error)})
            except (OSError, ValueError):
                # Keep the first failure and its inspection path even if journal I/O also fails.
                pass
        inspection = (f"Inspect retained recovery: {recovery}" if recovery is not None else
                      f"No recovery created; inspect target: {plan.target} and receipt: {plan.receipt}")
        raise RestoreError(f"Restore refused or interrupted: {error}; no automatic resume. "
                           f"{inspection}", recovery) from error


def main() -> int:
    """Require explicit target and receipt, with no write unless --apply is selected."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extension-dir", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expect-plan", help="Refuse a different preview SHA-256; not an approval grant")
    args = parser.parse_args()
    try:
        plan = restore_plan(args.extension_dir.expanduser(), args.receipt.expanduser())
        if args.expect_plan is not None and args.expect_plan != plan.digest:
            raise RestoreError("Preview plan changed; review a fresh preview")
        if args.apply:
            def notify(path: Path) -> None:
                """Expose the exact retained path before any managed mutation."""
                sys.stderr.write(f"Retained restore recovery: {path}\n")
                sys.stderr.flush()
            result = apply_restore(plan, notify)
        else:
            result = {"dry_run": True, "plan_sha256": plan.digest, **plan.document()}
    except (OSError, ValueError, KeyboardInterrupt) as error:
        result = {"ok": False, "verified": False, "error": str(error),
                  "recovery": str(error.recovery) if isinstance(error, RestoreError) and error.recovery else None}
        json.dump(result, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 1
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
