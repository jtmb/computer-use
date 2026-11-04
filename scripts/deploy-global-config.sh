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
WITH_VOICE=0
CANONICAL_ROOT="/home/james/repos/computer-use"
GOAL_PLUGIN_ROOT="${OPENCODE_GOAL_PLUGIN_DIR:-$(dirname "$ROOT")/opencode-goal-plugin}"

usage() {
  cat <<'EOF'
Usage: deploy-global-config.sh [--apply] [--config-dir DIR] [--only NAME[,NAME]] [--with-voice]

Without --apply, prints the planned file changes and validates the source.
With --apply, backs up the target files and copies the tracked global config.
Selected target aliases and unmanaged directory entries are refused before writes.
--with-voice opts in to the voice TUI only after its installed prerequisites pass.

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
    --with-voice) WITH_VOICE=1; shift ;;
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
if [ "$WITH_VOICE" -eq 1 ]; then
  [[ " ${NAMES[*]} " == *" cli.json "* ]] || fail "--with-voice requires cli.json in the selected scope"
  voice_check=--check
  [ "$APPLY" -eq 1 ] && voice_check=--verify-models
  bash "$ROOT/scripts/voice-onboarding-preflight.sh" "$voice_check"
fi
[ -n "$TARGET" ] || fail "target config directory is empty"
case "$TARGET" in
  /|//|.) fail "refusing unsafe target: $TARGET" ;;
esac

python3 - "$SOURCE" "$TARGET" "${NAMES[@]}" <<'PY'
import json
import os
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(os.path.abspath(os.path.expanduser(sys.argv[2])))
selected = sys.argv[3:]

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

def target_file(path: Path) -> None:
    """Refuse target aliases before any backup, deletion or copy."""
    if path.is_symlink():
        raise SystemExit(f"refusing target symlink: {path}")
    info = path.lstat()
    if not path.is_file() or info.st_nlink != 1:
        raise SystemExit(f"target must be an unlinked regular file: {path}")

for name in selected:
    destination = target / name
    if destination.is_symlink():
        raise SystemExit(f"refusing target symlink: {destination}")
    if not destination.exists():
        continue
    origin = source / name
    if origin.is_file():
        target_file(destination)
        continue
    if not destination.is_dir():
        raise SystemExit(f"target config entry must be a directory: {destination}")
    managed = {path.relative_to(origin) for path in origin.rglob("*")}
    # Replacing a directory is not authority to retire unrelated user definitions.
    for existing in destination.rglob("*"):
        if existing.relative_to(destination) not in managed:
            raise SystemExit(f"unmanaged target entry requires separate reconciliation: {existing}")
        target_file(existing)

print(f"source={source}")
print(f"target={target}")
PY

# Render in memory: previews must not create files, even temporary ones. Both
# server and TUI paths must refer to this checkout, not the template author's home.
render_config() {
  python3 - "$SOURCE/$1" "$ROOT" "$CANONICAL_ROOT" "$GOAL_PLUGIN_ROOT" "$WITH_VOICE" <<'PY'
import json
import sys
from pathlib import Path

path, root, canonical, goal_root, with_voice = sys.argv[1:]
text = Path(path).read_text(encoding="utf-8")
prefixes = [(canonical, root), ("~/repos/computer-use", root),
            ("/home/james/repos/opencode-goal-plugin", str(Path(goal_root).absolute()))]

def render(value):
    if isinstance(value, str):
        for old, new in prefixes:
            if value == old or value.startswith(old + "/"):
                return new + value[len(old):]
        return value
    if isinstance(value, list):
        return [render(item) for item in value]
    if isinstance(value, dict):
        return {key: render(item) for key, item in value.items()}
    return value

original = json.loads(text)
rendered = render(original)
if Path(path).name == "cli.json" and with_voice == "1":
    rendered.setdefault("plugins", []).append({"package": str(Path(root) / "voice-assistant"),
                                                "options": {"recognitionBackend": "sherpa"}})
sys.stdout.write(text if rendered == original else json.dumps(rendered, indent=2) + "\n")
PY
}

SERVER_CONFIG="$(render_config opencode.jsonc)"
CLI_CONFIG="$(render_config cli.json)"
config_content() {
  case "$1" in
    opencode.jsonc) printf '%s\n' "$SERVER_CONFIG" ;;
    cli.json) printf '%s\n' "$CLI_CONFIG" ;;
  esac
}

changed=0
for name in "${NAMES[@]}"; do
  src="$SOURCE/$name"
  dst="$TARGET/$name"
  if [[ "$name" = *.json* ]]; then
    matches=false
    if [ -f "$dst" ] && diff -q <(config_content "$name") "$dst" >/dev/null 2>&1; then matches=true; fi
  else
    matches=false
    if [ -e "$dst" ] && diff -qr --exclude='*.bak.*' "$src" "$dst" >/dev/null 2>&1; then matches=true; fi
  fi
  if [ "$matches" = true ]; then
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
mkdir -p "$TARGET"
mkdir -- "$backup" || fail "refusing to reuse backup path: $backup"
for name in "${NAMES[@]}"; do
  if [ -e "$TARGET/$name" ]; then
    cp -a "$TARGET/$name" "$backup/$name"
  fi
done
printf 'backup=%s\n' "$backup"

for name in "${NAMES[@]}"; do
  case "$name" in
    commands|agents)
      dst="$TARGET/$name"
      mkdir -p "$dst"
      (
        shopt -s dotglob nullglob
        for entry in "$SOURCE/$name"/*; do
          cp -a --remove-destination -- "$entry" "$dst/${entry##*/}"
        done
      )
      ;;
    opencode.jsonc|cli.json)
      cp -a --remove-destination -- "$SOURCE/$name" "$TARGET/$name"
      config_content "$name" > "$TARGET/$name"
      ;;
    *)
      cp -a --remove-destination -- "$SOURCE/$name" "$TARGET/$name"
      ;;
  esac
done

for name in "${NAMES[@]}"; do
  if [[ "$name" = *.json* ]]; then
    diff -q <(config_content "$name") "$TARGET/$name" >/dev/null || fail "verification failed for $name"
  else
    diff -qr --exclude='*.bak.*' "$SOURCE/$name" "$TARGET/$name" >/dev/null || fail "verification failed for $name"
  fi
done

printf 'deploy-global-config: deployed %s\n' "$TARGET"
printf 'Next: in the TUI press Ctrl+P and run service.restart to restart OpenCode.\n'
