#!/usr/bin/env bash
# One-shot post-login acceptance runner.
#
# Why this exists: the GNOME Shell caches extension modules by URL, so the fixed
# controllers only load after a login. A logout also ends the agent session that would run
# the checks, so the checks are queued to run *after* the next login instead.
#
# Installed as ~/.config/autostart/opencode-post-login-acceptance.desktop and removes that
# entry as soon as it starts, so it can never run twice.
#
# It waits for the bridge, then:
#   1. live-capture-check.py   (read-only: does capture work, and if not why)
#   2. desktop-workflow-acceptance.py --yes  (launch Calculator, capture, type 1+1=,
#      capture again, require a visible change, then close it) -- only when step 1 passes
# and appends a report to docs/codex-parity/acceptance-live-login.md.
#
# Run it by hand at any time with: scripts/post-login-acceptance.sh

set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$REPO/docs/codex-parity/acceptance-live-login.md"
LOG_DIR="${TMPDIR:-/tmp/opencode}"
AUTOSTART="$HOME/.config/autostart/opencode-post-login-acceptance.desktop"
mkdir -p "$LOG_DIR" || exit 1

# One-shot: drop the autostart entry before doing anything slow.
rm -f "$AUTOSTART" 2>/dev/null || true

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}
record() {  # record <heading> <file>
  {
    printf '\n### %s\n\n```\n' "$1"
    cat "$2"
    printf '```\n'
  } >>"$REPORT"
}

{
  printf '\n## Post-login acceptance — %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf '\nSession: %s | Shell pid %s started %s\n' \
    "${XDG_SESSION_TYPE:-unknown}" "$(pgrep -x gnome-shell | head -1)" \
    "$(ps -o lstart= -p "$(pgrep -x gnome-shell | head -1)" 2>/dev/null | sed 's/^ *//')"
} >>"$REPORT"

# 1. Wait for the extension to be active and the bridge to answer (login services settle late).
deadline=$(( $(date +%s) + 120 ))
state="unknown"
while [ "$(date +%s)" -lt "$deadline" ]; do
  state=$(gnome-extensions info opencode-window-control@computer-use.local 2>/dev/null \
    | awk -F': ' '/State:/ {print $2}' | tr -d ' \r')
  if [ "$state" = "ACTIVE" ]; then
    owner=$(gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
      --method org.freedesktop.DBus.NameHasOwner \
      org.gnome.Shell.Extensions.OpenCodeWindowControl 2>/dev/null || true)
    case "$owner" in *true*) break;; esac
  fi
  sleep 2
done
log "extension state: ${state:-unknown}"

# 2. Read-only capture check.
timeout 90 python3 "$REPO/tools/gnome-window-control/live-capture-check.py" >"$LOG_DIR/post-login-capture.txt" 2>&1
capture_status=$?
record "live-capture-check.py (exit $capture_status)" "$LOG_DIR/post-login-capture.txt"
log "live-capture-check exit $capture_status"

# 3. Only if capture works: the visible-outcome workflow.
workflow_status="skipped"
if [ "$capture_status" -eq 0 ]; then
  timeout 300 python3 "$REPO/tools/gnome-window-control/desktop-workflow-acceptance.py" --yes \
    >"$LOG_DIR/post-login-workflow.txt" 2>&1
  workflow_status=$?
  record "desktop-workflow-acceptance.py --yes (exit $workflow_status)" "$LOG_DIR/post-login-workflow.txt"
  log "workflow exit $workflow_status"
else
  printf '\n### desktop-workflow-acceptance.py\n\nSkipped: capture did not pass, so a visible-outcome run would only repeat that failure.\n' >>"$REPORT"
fi

# 4. Summary line.
summary="capture=$capture_status workflow=$workflow_status"
if [ "$capture_status" -eq 0 ] && [ "$workflow_status" -eq 0 ]; then
  summary="$summary — live acceptance PASSED"
else
  summary="$summary — not accepted yet"
fi
printf '\n**%s**\n' "$summary" >>"$REPORT"
log "$summary"
echo "$summary" >"$LOG_DIR/post-login-summary.txt"
