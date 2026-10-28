#!/usr/bin/env bash
# Deploy the repository skill bundles to the native global skills directory.
# Dry-run is the default; pass --apply to write.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/scripts/opencode-paths.sh"
TARGET="${OPENCODE_GLOBAL_SKILLS_DIR:-$(resolve_global_config_dir)/skills}"
APPLY=0
PRUNE=0

usage() {
  cat <<'EOF'
Usage: deploy-skills.sh [--apply] [--prune] [--target DIR]

Copies every directory under .opencode/skills that contains a SKILL.md into the
global skills directory. Dry-run is the default.

Options:
  --apply        Write the deployment.
  --prune        Remove global skill directories that are not in the source.
  --target DIR   Override the target directory.
  -h, --help     Show this help.
EOF
}

fail() {
  printf 'deploy-skills: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --prune) PRUNE=1; shift ;;
    --target)
      [ "$#" -ge 2 ] || fail "--target requires a directory"
      TARGET="$2"
      shift 2
      ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

SOURCE="$ROOT/.opencode/skills"
[ -d "$SOURCE" ] || fail "source directory not found: $SOURCE"

case "$TARGET" in
  ""|"/"|".") fail "refusing unsafe target: $TARGET" ;;
esac
[ "$TARGET" = "$SOURCE" ] && fail "target must not be the source directory"
[ -L "$TARGET" ] && fail "target must not be a symlink: $TARGET"

if [ -n "$(find "$SOURCE" -type l -print -quit 2>/dev/null)" ]; then
  fail "source contains symlinks; refusing to deploy"
fi

count=0
missing=0
for src in "$SOURCE"/*/; do
  [ -f "$src/SKILL.md" ] || continue
  count=$((count + 1))
  name="$(basename "$src")"
  if [ "$APPLY" -eq 1 ]; then
    printf 'deploy: %s\n' "$name"
  else
    printf 'would deploy: %s\n' "$name"
  fi
done

[ "$count" -gt 0 ] || fail "no skill bundles with SKILL.md found in $SOURCE"

if [ "$APPLY" -eq 0 ]; then
  printf 'deploy-skills: dry run; %s bundles; target=%s\n' "$count" "$TARGET"
  printf 'deploy-skills: rerun with --apply to write\n'
  exit 0
fi

if [ -e "$TARGET" ]; then
  backup="${TARGET%/}.backup-$(date +%Y%m%d-%H%M%S)"
  cp -a "$TARGET" "$backup"
  printf 'backup: %s\n' "$backup"
fi

if [ -d "$TARGET" ]; then
  for target_dir in "$TARGET"/*/; do
    [ -d "$target_dir" ] || continue
    if [ -L "${target_dir%/}" ]; then
      printf 'deploy-skills: skip symlinked target: %s\n' "${target_dir%/}" >&2
      continue
    fi
    extra="$(basename "$target_dir")"
    if [ ! -f "$SOURCE/$extra/SKILL.md" ]; then
      if [ "$PRUNE" -eq 1 ]; then
        rm -rf -- "$target_dir"
        printf 'deploy-skills: pruned %s (not in source)\n' "$extra"
      else
        printf 'deploy-skills: note: %s exists globally but not in the source; use --prune to remove\n' "$extra"
      fi
    fi
  done
fi

mkdir -p "$TARGET"
chmod 700 "$TARGET" 2>/dev/null || true

for src in "$SOURCE"/*/; do
  [ -f "$src/SKILL.md" ] || continue
  name="$(basename "$src")"
  rm -rf "${TARGET:?}/$name"
  cp -a "$src" "$TARGET/$name"
done

for src in "$SOURCE"/*/; do
  [ -f "$src/SKILL.md" ] || continue
  name="$(basename "$src")"
  if ! diff -r "$src" "$TARGET/$name" >/dev/null 2>&1; then
    missing=$((missing + 1))
    printf 'deploy-skills: verification failed for %s\n' "$name" >&2
  fi
done

[ "$missing" -eq 0 ] || fail "$missing skill bundle(s) did not verify"
printf 'deploy-skills: deployed %s bundles to %s\n' "$count" "$TARGET"
