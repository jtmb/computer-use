#!/usr/bin/env python3
"""Legacy JSON memory utility requiring an explicit active-repository path.

Reads are safe by default. Remember/forget/prune only write with --apply.
The JSON store is owner-only and rejects obvious credentials.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import stat
import subprocess
import tempfile
import uuid
from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from datetime import date, datetime, timezone
from pathlib import Path


CATEGORIES = ("preference", "system", "workflow", "decision", "pending")
SOURCES = ("user", "observed", "verified")
SECRET_PATTERN = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|"
    r"(?:password|passwd|api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*\S+|"
    r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b",
    re.IGNORECASE,
)


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _git_identity(directory: Path) -> tuple[Path, Path]:
    """Return the resolved worktree root and shared Git directory."""
    cwd = directory.resolve(strict=True)
    try:
        root_result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        common_result = subprocess.run(
            ["git", "rev-parse", "--git-common-dir"],
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SystemExit("assistant-memory: cannot verify the active Git repository") from exc
    if root_result.returncode != 0 or common_result.returncode != 0:
        raise SystemExit("assistant-memory: run this command from an active Git repository")
    try:
        root = Path(root_result.stdout.strip()).resolve(strict=True)
        common = Path(common_result.stdout.strip())
        if not common.is_absolute():
            common = cwd / common
        common = common.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise SystemExit("assistant-memory: cannot verify the active Git repository") from exc
    if not root.is_dir() or not common.is_dir():
        raise SystemExit("assistant-memory: invalid active Git repository")
    return root, common


def _active_repository_root() -> Path:
    """Require and return the worktree active in the caller's current directory."""
    root, _common = _git_identity(Path.cwd())
    return root


def memory_path(selected: Path | str) -> Path:
    """Validate an explicitly selected store path inside the active Git worktree."""
    if not str(selected).strip():
        raise SystemExit("assistant-memory: --path must select a file")
    root = _active_repository_root()
    candidate = Path(selected).expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    candidate = Path(os.path.abspath(candidate))
    try:
        relative = candidate.relative_to(root)
    except ValueError as exc:
        raise SystemExit(
            "assistant-memory: --path must be inside the active Git repository"
        ) from exc
    if not relative.parts or relative.parts[0] == ".git":
        raise SystemExit("assistant-memory: --path must select a file outside Git metadata")
    current = root
    missing = False
    for index, part in enumerate(relative.parts):
        current = current / part
        if missing:
            continue
        try:
            metadata = current.lstat()
        except FileNotFoundError:
            missing = True
            continue
        if stat.S_ISLNK(metadata.st_mode):
            raise SystemExit("assistant-memory: --path cannot contain symlinks")
        final = index == len(relative.parts) - 1
        if final and not stat.S_ISREG(metadata.st_mode):
            raise SystemExit("assistant-memory: --path must select a regular file")
        if not final and not stat.S_ISDIR(metadata.st_mode):
            raise SystemExit("assistant-memory: --path ancestors must be directories")
    return candidate


def empty_store() -> dict:
    return {"version": 1, "entries": []}


def validate_timestamp(value: object, index: int, field: str) -> None:
    if not isinstance(value, str):
        raise SystemExit(f"assistant-memory: invalid {field} at index {index}")
    try:
        datetime.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit(f"assistant-memory: invalid {field} at index {index}") from exc


def validate_store(data: object) -> dict:
    if not isinstance(data, dict) or data.get("version") != 1:
        raise SystemExit("assistant-memory: unsupported or invalid store version")
    entries = data.get("entries")
    if not isinstance(entries, list):
        raise SystemExit("assistant-memory: entries must be a list")
    required = {"id", "category", "text", "source", "created_at", "updated_at", "expires"}
    seen = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict) or not required.issubset(entry):
            raise SystemExit(f"assistant-memory: invalid entry at index {index}")
        if not isinstance(entry["id"], str) or not entry["id"].strip():
            raise SystemExit(f"assistant-memory: invalid id at index {index}")
        if entry["id"] in seen:
            raise SystemExit(f"assistant-memory: duplicate id {entry['id']}")
        seen.add(entry["id"])
        if entry["category"] not in CATEGORIES or entry["source"] not in SOURCES:
            raise SystemExit(f"assistant-memory: invalid category/source at index {index}")
        if not isinstance(entry["text"], str) or not entry["text"].strip():
            raise SystemExit(f"assistant-memory: empty text at index {index}")
        validate_timestamp(entry["created_at"], index, "created_at")
        validate_timestamp(entry["updated_at"], index, "updated_at")
        if entry["expires"] is not None:
            try:
                date.fromisoformat(entry["expires"])
            except (TypeError, ValueError) as exc:
                raise SystemExit(
                    f"assistant-memory: invalid expiry at index {index}"
                ) from exc
    return data


@contextmanager
def store_lock(path: Path, *, exclusive: bool, create: bool = False) -> Iterator[None]:
    """Serialize access through a process lock beside the memory store."""
    path = memory_path(path)
    lock_path = path.with_name(".memory.lock")
    memory_path(lock_path)
    if create:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(path.parent, 0o700)
        memory_path(lock_path)
    flags = os.O_RDWR if exclusive else os.O_RDONLY
    flags |= getattr(os, "O_NOFOLLOW", 0)
    if create:
        flags |= os.O_CREAT
    try:
        fd = os.open(lock_path, flags, 0o600)
    except FileNotFoundError:
        if not create:
            yield
            return
        raise SystemExit("assistant-memory: cannot create the store lock") from None
    except OSError as exc:
        raise SystemExit("assistant-memory: cannot safely open the store lock") from exc
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise SystemExit("assistant-memory: store lock must be a regular file")
        if create:
            os.fchmod(fd, 0o600)
        fcntl.flock(fd, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def load(path: Path, *, create: bool = False) -> dict:
    path = memory_path(path)
    if not path.exists():
        if create:
            return empty_store()
        raise SystemExit(f"assistant-memory: store not initialized: {path} (run init)")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"assistant-memory: cannot read {path}: {exc}") from exc
    return validate_store(data)


def save(path: Path, data: dict) -> None:
    validate_store(data)
    path = memory_path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    path = memory_path(path)
    fd, tmp_name = tempfile.mkstemp(prefix=".memory.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, 0o600)
        os.replace(tmp_name, path)
    finally:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass


def is_expired(entry: dict) -> bool:
    return entry["expires"] is not None and date.fromisoformat(entry["expires"]) < date.today()


def print_entries(entries: list[dict], as_json: bool) -> None:
    if as_json:
        print(json.dumps(entries, indent=2, ensure_ascii=False))
        return
    if not entries:
        print("No matching memories.")
        return
    for entry in entries:
        expiry = f" expires={entry['expires']}" if entry["expires"] else ""
        print(
            f"{entry['id']} [{entry['category']}/{entry['source']}]"
            f"{expiry} {entry['text']}"
        )


def filtered_entries(args: argparse.Namespace) -> list[dict]:
    entries = load(memory_path(args.path))["entries"]
    if not getattr(args, "all", False):
        entries = [entry for entry in entries if not is_expired(entry)]
    if getattr(args, "category", None):
        entries = [entry for entry in entries if entry["category"] == args.category]
    if getattr(args, "source", None):
        entries = [entry for entry in entries if entry["source"] == args.source]
    return entries


def command_init(_args: argparse.Namespace) -> None:
    path = memory_path(_args.path)
    with store_lock(path, exclusive=True, create=True):
        if path.exists():
            load(path)
            os.chmod(path, 0o600)
            os.chmod(path.parent, 0o700)
            print(f"Memory store already initialized: {path}")
            return
        save(path, empty_store())
        print(f"Initialized memory store: {path}")


def command_list(args: argparse.Namespace) -> None:
    path = memory_path(args.path)
    with store_lock(path, exclusive=False):
        print_entries(filtered_entries(args), args.json)


def command_search(args: argparse.Namespace) -> None:
    path = memory_path(args.path)
    with store_lock(path, exclusive=False):
        terms = args.query.casefold().split()
        entries = [
            entry
            for entry in filtered_entries(args)
            if all(term in entry["text"].casefold() for term in terms)
        ]
        print_entries(entries, args.json)


def validate_expiry(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit("assistant-memory: --expires must be YYYY-MM-DD") from exc
    return value


def command_remember(args: argparse.Namespace) -> None:
    text = " ".join(args.text.split())
    if not text:
        raise SystemExit("assistant-memory: memory text cannot be empty")
    if SECRET_PATTERN.search(text):
        raise SystemExit("assistant-memory: refusing text that looks like a credential")
    expiry = validate_expiry(args.expires)
    path = memory_path(args.path)
    lock = store_lock(path, exclusive=True, create=True) if args.apply else nullcontext()
    with lock:
        data = load(path, create=not args.apply)
        duplicate = next(
            (
                entry
                for entry in data["entries"]
                if entry["category"] == args.category
                and entry["text"].casefold() == text.casefold()
            ),
            None,
        )
        preview = {
            "category": args.category,
            "text": text,
            "source": args.source,
            "expires": expiry,
        }
        if not args.apply:
            print(json.dumps({"dry_run": True, "would_remember": preview}, indent=2))
            return
        if duplicate:
            print(json.dumps({"applied": False, "duplicate": duplicate}, indent=2))
            return
        timestamp = now()
        entry = {
            "id": f"mem-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}",
            **preview,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        data["entries"].append(entry)
        save(path, data)
        print(json.dumps({"applied": True, "entry": entry}, indent=2))


def command_forget(args: argparse.Namespace) -> None:
    path = memory_path(args.path)
    if args.apply and not path.exists():
        load(path)
    lock = store_lock(path, exclusive=True, create=True) if args.apply else nullcontext()
    with lock:
        data = load(path)
        matching = [entry for entry in data["entries"] if entry["id"] == args.id]
        if not matching:
            raise SystemExit(f"assistant-memory: id not found: {args.id}")
        if not args.apply:
            print(json.dumps({"dry_run": True, "would_forget": matching[0]}, indent=2))
            return
        data["entries"] = [entry for entry in data["entries"] if entry["id"] != args.id]
        save(path, data)
        print(json.dumps({"applied": True, "forgot": matching[0]}, indent=2))


def command_prune(args: argparse.Namespace) -> None:
    path = memory_path(args.path)
    if args.apply and not path.exists():
        load(path)
    lock = store_lock(path, exclusive=True, create=True) if args.apply else nullcontext()
    with lock:
        data = load(path)
        expired = [entry for entry in data["entries"] if is_expired(entry)]
        if not args.apply:
            print(json.dumps({"dry_run": True, "expired": expired}, indent=2))
            return
        expired_ids = {entry["id"] for entry in expired}
        data["entries"] = [entry for entry in data["entries"] if entry["id"] not in expired_ids]
        save(path, data)
        print(json.dumps({"applied": True, "pruned": len(expired)}, indent=2))


def command_validate(_args: argparse.Namespace) -> None:
    path = memory_path(_args.path)
    with store_lock(path, exclusive=False):
        data = load(path)
        file_stat = path.stat()
        parent_stat = path.parent.stat()
        if file_stat.st_mode & 0o777 != 0o600:
            raise SystemExit(
                f"assistant-memory: unsafe file mode {file_stat.st_mode & 0o777:o}; expected 600"
            )
        if parent_stat.st_mode & 0o777 != 0o700:
            raise SystemExit(
                f"assistant-memory: unsafe directory mode {parent_stat.st_mode & 0o777:o}; expected 700"
            )
        if file_stat.st_uid != os.geteuid() or parent_stat.st_uid != os.geteuid():
            raise SystemExit("assistant-memory: store must be owned by the current user")
        print(f"OK: {path} ({len(data['entries'])} entries, mode 600)")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Private memory store for computer-assistant skills"
    )
    result.add_argument(
        "--path",
        type=Path,
        required=True,
        help="store file inside the active Git repository",
    )
    sub = result.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="create an empty owner-only store")
    init.set_defaults(func=command_init)

    listing = sub.add_parser("list", help="list active memories")
    listing.add_argument("--category", choices=CATEGORIES)
    listing.add_argument("--source", choices=SOURCES)
    listing.add_argument("--all", action="store_true", help="include expired entries")
    listing.add_argument("--json", action="store_true")
    listing.set_defaults(func=command_list)

    search = sub.add_parser("search", help="search memory text")
    search.add_argument("query")
    search.add_argument("--category", choices=CATEGORIES)
    search.add_argument("--source", choices=SOURCES)
    search.add_argument("--all", action="store_true", help="include expired entries")
    search.add_argument("--json", action="store_true")
    search.set_defaults(func=command_search)

    remember = sub.add_parser("remember", help="add a memory; dry-run unless --apply")
    remember.add_argument("text")
    remember.add_argument("--category", choices=CATEGORIES, required=True)
    remember.add_argument("--source", choices=SOURCES, required=True)
    remember.add_argument("--expires", help="optional YYYY-MM-DD expiry")
    remember.add_argument("--apply", action="store_true")
    remember.set_defaults(func=command_remember)

    forget = sub.add_parser("forget", help="remove a memory; dry-run unless --apply")
    forget.add_argument("id")
    forget.add_argument("--apply", action="store_true")
    forget.set_defaults(func=command_forget)

    prune = sub.add_parser("prune", help="remove expired memories; dry-run unless --apply")
    prune.add_argument("--apply", action="store_true")
    prune.set_defaults(func=command_prune)

    validate = sub.add_parser("validate", help="validate schema and permissions")
    validate.set_defaults(func=command_validate)
    return result


def main() -> int:
    args = parser().parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
