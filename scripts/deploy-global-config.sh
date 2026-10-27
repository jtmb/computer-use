#!/usr/bin/env bash
# Deploy this repository's tracked global OpenCode config into the active v2
# config directory. Dry-run is the default; --apply writes after a backup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/global"
if [ -n "${OPENCODE_GLOBAL_CONFIG_DIR:-}" ]; then
  TARGET="$OPENCODE_GLOBAL_CONFIG_DIR"
elif [ -n "${OPENCODE_V2_CONFIG_DIR:-}" ]; then
  TARGET="$OPENCODE_V2_CONFIG_DIR"
elif [ -n "${OPENCODE_V2_PILOT_DIR:-}" ]; then
  TARGET="$OPENCODE_V2_PILOT_DIR/config"
else
  TARGET="$(opencode debug paths 2>/dev/null | awk '$1 == "config" { print $2; exit }' || true)"
  TARGET="${TARGET:-$HOME/.opencode-v2-pilot/config}"
fi
APPLY=0
ONLY=""

usage() {
  cat <<'EOF'
Usage: deploy-global-config.sh [--apply] [--config-dir DIR] [--only NAME[,NAME]]

Without --apply, prints the planned file changes and validates the source.
With --apply, backs up the target files and copies the tracked global config.

--only restricts the deployment to comma-separated entries from:
  opencode.jsonc, cli.json, commands, agents
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
    --only)
      [ "$#" -ge 2 ] || fail "--only requires a value"
      ONLY="$2"
      shift 2
      ;;
    --only=*)
      ONLY="${1#*=}"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

NAMES=()
if [ -z "$ONLY" ]; then
  NAMES=(opencode.jsonc cli.json commands agents)
else
  IFS=',' read -r -a requested <<<"$ONLY"
  for name in "${requested[@]}"; do
    case "$name" in
      opencode.jsonc|cli.json|commands|agents) NAMES+=("$name") ;;
      *) fail "unknown --only entry: $name" ;;
    esac
  done
  [ "${#NAMES[@]}" -gt 0 ] || fail "--only requires at least one entry"
fi

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
for name in "${NAMES[@]}"; do
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
for name in "${NAMES[@]}"; do
  if [ -e "$TARGET/$name" ]; then
    cp -a "$TARGET/$name" "$backup/$name"
  fi
done
printf 'backup=%s\n' "$backup"

mkdir -p "$TARGET"
for name in "${NAMES[@]}"; do
  case "$name" in
    commands|agents)
      dst="$TARGET/$name"
      if [ -e "$dst" ]; then
        rm -rf -- "${dst:?}"
      fi
      cp -a "$SOURCE/$name" "$dst"
      ;;
    *)
      cp -a "$SOURCE/$name" "$TARGET/$name"
      ;;
  esac
done

for name in "${NAMES[@]}"; do
  diff -qr --exclude='*.bak.*' "$SOURCE/$name" "$TARGET/$name" >/dev/null || fail "verification failed for $name"
done

printf 'deploy-global-config: deployed %s\n' "$TARGET"
printf 'Next: in the TUI press Ctrl+P and run service.restart to restart OpenCode.\n'
