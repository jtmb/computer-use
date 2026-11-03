#!/usr/bin/env bash
# Session relogin helper: arm the one-shot post-login acceptance runner and (optionally) log
# out, which is the only way to make GNOME Shell reload the reviewed extension modules.
#
#   scripts/session-relogin.sh --check     report readiness, change nothing (default)
#   scripts/session-relogin.sh --now       arm the runner and log out
#   scripts/session-relogin.sh --now --force   log out even if another session wrote recently
#
# A logout ends every process in this session, including the agent and any peer session
# working in the same account. The check therefore refuses --now while another session has
# written recently, unless --force is given deliberately.
#
# What a logout cannot do: type the password at the GDM login screen. Unless GDM automatic
# login is enabled (a security setting that is not changed here), a person must log back in;
# the queue installed below makes that login finish the acceptance automatically.

set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$REPO/scripts/post-login-acceptance.sh"
AUTOSTART="$HOME/.config/autostart/opencode-post-login-acceptance.desktop"
LOG_DIR="${TMPDIR:-/tmp/opencode}"
QUIET_SECONDS=120
MODE=check
FORCE=0

for argument in "$@"; do
  case "$argument" in
    --check) MODE=check ;;
    --now) MODE=now ;;
    --force) FORCE=1 ;;
    *) echo "usage: $0 [--check|--now] [--force]" >&2; exit 2 ;;
  esac
done

command -v gnome-session-quit >/dev/null 2>&1 || { echo "gnome-session-quit is not available" >&2; exit 2; }
[ -x "$RUNNER" ] || { echo "runner missing or not executable: $RUNNER" >&2; exit 2; }

arm() {
  local staged
  mkdir -p "$(dirname "$AUTOSTART")" || return 1
  staged="$(mktemp "$(dirname "$AUTOSTART")/.opencode-post-login-acceptance.XXXXXX")" || return 1
  if ! cat >"$staged" <<EOF
[Desktop Entry]
Type=Application
Name=OpenCode post-login acceptance
Comment=One-shot: verifies the reviewed GNOME bridge and runs the visible-outcome workflow, then removes itself.
Exec=$RUNNER
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF
  then
    rm -f -- "$staged"
    return 1
  fi
  if [ ! -s "$staged" ] || ! mv -f -- "$staged" "$AUTOSTART"; then
    rm -f -- "$staged"
    return 1
  fi
  echo "armed: $AUTOSTART"
}

# Another session writing into the worktree would lose that work to a logout.
recent() {
  find "$REPO" -path "$REPO/.git" -prune -o -newermt "-${QUIET_SECONDS} seconds" -type f -print 2>/dev/null \
    | grep -vE "node_modules|__pycache__|acceptance-live-login\.md|(${REPO}/scripts/(session-relogin|post-login-acceptance)\.sh)" \
    | head -5
}

echo "session: ${XDG_SESSION_TYPE:-unknown}, Shell pid $(pgrep -x gnome-shell | head -1)"
echo "autostart armed: $([ -f "$AUTOSTART" ] && echo yes || echo no)"
state=$(gnome-extensions info opencode-window-control@computer-use.local 2>/dev/null | awk -F': ' '/State:/ {print $2}' | tr -d ' \r')
echo "extension state: ${state:-unknown}"
recent_files=$(recent)
if [ -n "$recent_files" ]; then
  echo "recent writes inside the last ${QUIET_SECONDS}s (another session may be working):"
  printf '  %s\n' $recent_files
else
  echo "recent writes inside the last ${QUIET_SECONDS}s: none"
fi

if [ "$MODE" = "check" ]; then
  echo "check only; run with --now to arm the runner and log out"
  exit 0
fi

if [ -n "$recent_files" ] && [ "$FORCE" -ne 1 ]; then
  echo "refusing to log out: another session is writing. Re-run with --force if that is intended." >&2
  exit 3
fi

if ! arm; then
  echo "refusing to log out: could not atomically arm post-login acceptance" >&2
  exit 2
fi
echo "logging out in 5 seconds; log back in to let the runner finish the acceptance"
sleep 5 || exit 2
gnome-session-quit --logout --no-prompt
