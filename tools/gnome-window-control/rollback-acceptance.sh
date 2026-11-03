#!/usr/bin/env bash
# Deployment rollback rehearsal against the reviewed deployer, in a throwaway target.
#
# Demonstrates the artifact half of rollback without touching the live extension:
#   1. deploy the reviewed files into a temporary target,
#   2. restore a real backup snapshot over them (what a rollback does),
#   3. show the deployer detects that drift instead of silently accepting it,
#   4. re-apply the reviewed files and show every managed file matches source again.
#
# The behavioural half of rollback (old code behaves as it did) needs an older artifact
# that predates the current fixes; the deployer's snapshots started after the capture fix,
# so this rehearsal covers the mechanism, not a historic behaviour comparison.
#
#   tools/gnome-window-control/rollback-acceptance.sh [--snapshot <name>]
#
# Exit 0 when the cycle behaves as described, 1 otherwise, 2 on a missing prerequisite.

set -u

REPO=$(cd "$(dirname "$0")/../.." && pwd)
DEPLOYED="$HOME/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local"
DEPLOYER="$REPO/scripts/deploy-window-control.py"
SCRATCH_ROOT="${TMPDIR:-/tmp/opencode}"
mkdir -p "$SCRATCH_ROOT" || exit 2

SNAPSHOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot) SNAPSHOT="${2:-}"; shift 2 ;;
    *) echo "usage: $0 [--snapshot <name>]" >&2; exit 2 ;;
  esac
done

[ -d "$DEPLOYED/.backups" ] || { echo "FAIL no deployer backups at $DEPLOYED/.backups" >&2; exit 2; }
[ -f "$DEPLOYER" ] || { echo "FAIL deployer not found: $DEPLOYER" >&2; exit 2; }

if [ -z "$SNAPSHOT" ]; then
  SNAPSHOT=$(ls -1t "$DEPLOYED/.backups" 2>/dev/null | head -1)
fi
if [ -z "$SNAPSHOT" ]; then
  echo "FAIL no snapshot name given or found" >&2
  exit 2
fi
# Keep the snapshot inside the deployer's backup directory: the name must not traverse.
case "$(realpath -m "$DEPLOYED/.backups/$SNAPSHOT")" in
  "$(realpath -m "$DEPLOYED/.backups")"/*) ;;
  *) echo "FAIL snapshot path escapes the backup directory: $SNAPSHOT" >&2; exit 2 ;;
esac
[ -d "$DEPLOYED/.backups/$SNAPSHOT" ] || { echo "FAIL snapshot not found: $SNAPSHOT" >&2; exit 2; }

BASE=$(mktemp -d "$SCRATCH_ROOT/ocwc-rollback.XXXXXX") || exit 2
chmod 700 "$BASE"
# The deployer only writes to a directory named for this extension.
TARGET="$BASE/opencode-window-control@computer-use.local"
LOG="$BASE/result.log"
FAILED=0
log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG"; }
fail() { log "FAIL $*"; FAILED=1; }
cleanup() { rm -rf "$BASE"; }
trap cleanup EXIT

deployer() { python3 "$DEPLOYER" --extension-dir "$TARGET" "$@"; }
# Hash the files that actually exist in the target, so a comparison cannot pass on the
# desired-source manifest alone.
hashes() {
  (cd "$TARGET" 2>/dev/null && sha256sum metadata.json extension.js policy.mjs capture.mjs input.mjs launch.mjs runtime-contract.mjs 2>/dev/null | sort) || true
}

log "snapshot under test: $SNAPSHOT"

mkdir -p "$TARGET"
if ! deployer --apply >"$BASE/deploy.json" 2>&1; then
  fail "the first deployment failed"; cat "$BASE/deploy.json"; exit 1
fi
first=$(hashes)
count=$(printf '%s\n' "$first" | grep -c . || true)
[ "${count:-0}" -eq 7 ] && log "PASS deployed $count managed files into a throwaway target" || fail "expected 7 files in the target, found ${count:-0}"

# A real rollback restores the snapshot's files over the deployed ones, together with the
# ownership marker saved beside them: that is what makes the tree consistent again instead
# of looking like an out-of-band edit.
restored=0
for file in "$DEPLOYED/.backups/$SNAPSHOT"/* "$DEPLOYED/.backups/$SNAPSHOT"/.*; do
  [ -f "$file" ] || continue
  case "$(basename "$file")" in .|..) continue;; esac
  cp "$file" "$TARGET/$(basename "$file")" && restored=$((restored + 1))
done
[ "$restored" -gt 0 ] && log "PASS restored $restored file(s) from the snapshot (including its marker)" || fail "the snapshot contained no files"

# With its own marker restored, the rolled-back tree is owned but older than source: the
# deployer must report the pending forward changes instead of refusing or silently agreeing.
deployer >"$BASE/after-restore.json" 2>&1 || true
python3 - "$BASE/after-restore.json" <<'PY' | tee -a "$LOG"
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception as error:
    print("FAIL the dry run produced unreadable output:", error); raise SystemExit(1)
if data.get("ok") is False:
    print("FAIL the deployer refused the restored tree:", data.get("error")); raise SystemExit(1)
changes = data.get("changes") or []
print(("PASS" if changes else "FAIL"),
      "the restored tree is owned and reports pending forward changes:", changes or "none")
raise SystemExit(0 if changes else 1)
PY
[ "${PIPESTATUS[0]}" -ne 0 ] && FAILED=1

# Re-applying the reviewed files must restore the reviewed state exactly.
if ! deployer --apply >"$BASE/reapply.json" 2>&1; then
  fail "re-applying the reviewed files failed"
  cat "$BASE/reapply.json" | tail -5
fi
after=$(hashes)
if [ -n "$after" ] && [ "$after" = "$first" ]; then
  log "PASS re-applying the reviewed files restored every target-file hash"
else
  fail "re-applying the reviewed files did not restore the earlier target-file hashes"
fi

# And the live deployment must still match source (this script never writes to it).
live=$(python3 "$DEPLOYER" --extension-dir "$DEPLOYED" 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); f=d.get("files") or {}; b=d.get("before") or {}; print(sum(1 for k,v in f.items() if b.get(k)==v), "/", len(f))')
case "$live" in
  "7 / 7") log "PASS the live deployment was untouched and still matches source (7/7)" ;;
  *) fail "the live deployment no longer matches source: $live" ;;
esac

[ "$FAILED" -eq 0 ] && { log "rollback rehearsal passed"; exit 0; }
log "rollback rehearsal failed"; exit 1
