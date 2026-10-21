#!/usr/bin/env bash
# Deploy this repository's tracked global OpenCode config into the active v2
# config directory. Dry-run is the default; --apply writes after a backup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/global"
TARGET="${OPENCODE_GLOBAL_CONFIG_DIR:-${OPENCODE_V2_CONFIG_DIR:-${OPENCODE_V2_PILOT_DIR:-$HOME/.opencode-v2-pilot}/config}}"
APPLY=0

usage() {
  cat <<'EOF'
Usage: deploy-global-config.sh [--apply] [--config-dir DIR]

Without --apply, prints the planned file changes and validates the source.
With --apply, backs up the target files and copies the tracked global config.
EOF
}

fail() {
  printf 'deploy-global-config: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --config-dir)
      [ "$#" -ge 2 ] || fail "--config-dir requires a directory"
      TARGET="$2"
      shift 2
      ;;
    --config-dir=*)
      TARGET="${1#*=}"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

[ -d "$SOURCE" ] || fail "tracked global config is missing: $SOURCE"
[ -n "$TARGET" ] || fail "target config directory is empty"
case "$TARGET" in
  /|//|.) fail "refusing unsafe target: $TARGET" ;;
esac

python3 - "$SOURCE" "$TARGET" <<'PY'
import json
import os
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(os.path.abspath(os.path.expanduser(sys.argv[2])))

def reject_symlink_or_ancestor(path: Path, label: str) -> None:
    current = Path("/")
    for part in path.parts[1:]:
        current /= part
        if current.is_symlink():
            raise SystemExit(f"refusing symlinked {label}: {current}")
        if current == path:
            break
        if current.exists() and not current.is_dir():
            raise SystemExit(f"{label} ancestor is not a directory: {current}")

for path in (source, target):
    reject_symlink_or_ancestor(path, "config path")

required = ["opencode.jsonc", "cli.json", "commands", "agents"]
for name in required:
    if not (source / name).exists():
        raise SystemExit(f"tracked global config is incomplete: {source / name}")

for name in ("opencode.jsonc", "cli.json"):
    path = source / name
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f"tracked config must be a regular file: {path}")
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"invalid JSON in {path}: {error}") from error

for directory in ("commands", "agents"):
    root = source / directory
    if not root.is_dir() or root.is_symlink():
        raise SystemExit(f"tracked config directory is invalid: {root}")
    for path in root.rglob("*"):
        if path.is_symlink():
            raise SystemExit(f"tracked config contains a symlink: {path}")
        if not path.is_file():
            raise SystemExit(f"tracked config contains a non-file: {path}")

print(f"source={source}")
print(f"target={target}")
PY

changed=0
for name in opencode.jsonc cli.json commands agents; do
  src="$SOURCE/$name"
  dst="$TARGET/$name"
  if [ -e "$dst" ] && diff -qr --exclude='*.bak.*' "$src" "$dst" >/dev/null 2>&1; then
    printf 'unchanged: %s\n' "$name"
  else
    printf 'update: %s\n' "$name"
    changed=1
  fi
done

if [ "$changed" -eq 0 ]; then
  printf 'deploy-global-config: tracked config already matches %s\n' "$TARGET"
  exit 0
fi

if [ "$APPLY" -eq 0 ]; then
  printf 'deploy-global-config: dry run only; rerun with --apply to write\n'
  exit 0
fi

stamp="$(date +%Y%m%d-%H%M%S)"
backup="$TARGET/backup-$stamp"
mkdir -p "$backup"
for name in opencode.jsonc cli.json commands agents; do
  if [ -e "$TARGET/$name" ]; then
    cp -a "$TARGET/$name" "$backup/$name"
  fi
done
printf 'backup=%s\n' "$backup"

mkdir -p "$TARGET"
cp -a "$SOURCE/opencode.jsonc" "$TARGET/opencode.jsonc"
cp -a "$SOURCE/cli.json" "$TARGET/cli.json"
for name in commands agents; do
  dst="$TARGET/$name"
  if [ -e "$dst" ]; then
    rm -rf -- "${dst:?}"
  fi
  cp -a "$SOURCE/$name" "$dst"
done

for name in opencode.jsonc cli.json commands agents; do
  diff -qr --exclude='*.bak.*' "$SOURCE/$name" "$TARGET/$name" >/dev/null || fail "verification failed for $name"
done

printf 'deploy-global-config: deployed %s\n' "$TARGET"
printf 'Next: in the TUI press Ctrl+P and run service.restart to restart OpenCode.\n'
