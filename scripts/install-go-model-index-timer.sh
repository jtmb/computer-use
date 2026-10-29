#!/usr/bin/env bash
# Install or remove the check-only model-index systemd user timer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_TARGET="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
TARGET="$DEFAULT_TARGET"
APPLY=0
REMOVE=0

usage() {
  cat <<'USAGE'
Usage: install-go-model-index-timer.sh [--apply] [--remove] [--target DIR]

Dry-run by default. --apply installs and enables the weekly check-only timer.
--remove disables and removes it. This timer never runs apply, commits, or pushes.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --remove) REMOVE=1; shift ;;
    --target) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; TARGET="$2"; shift 2 ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

command -v systemctl >/dev/null 2>&1 || {
  echo "install-go-model-index-timer: systemctl is not available" >&2
  exit 1
}
systemctl --user show-environment >/dev/null 2>&1 || {
  echo "install-go-model-index-timer: systemd user session is not available" >&2
  exit 1
}

SERVICE="opencode-go-model-index-check.service"
TIMER="opencode-go-model-index-check.timer"
SRC_SERVICE="$ROOT/config/systemd/user/$SERVICE.in"
SRC_TIMER="$ROOT/config/systemd/user/$TIMER.in"

if [ "$REMOVE" -eq 1 ]; then
  if [ "$APPLY" -eq 0 ]; then
    echo "would disable and remove $TIMER from $TARGET"
    exit 0
  fi
  systemctl --user disable --now "$TIMER" 2>/dev/null || true
  rm -f "$TARGET/$SERVICE" "$TARGET/$TIMER"
  systemctl --user daemon-reload
  echo "removed $TIMER"
  exit 0
fi

if [ "$APPLY" -eq 0 ]; then
  echo "would install $SERVICE and $TIMER into $TARGET"
  echo "would enable and start $TIMER"
  echo "the timer runs: $ROOT/scripts/go-model-index-maintain.sh check"
  exit 0
fi

"$ROOT/scripts/go-model-index-maintain.sh" --help >/dev/null
mkdir -p "$TARGET"
sed "s#@ROOT@#$ROOT#g" "$SRC_SERVICE" > "$TARGET/$SERVICE"
sed "s#@ROOT@#$ROOT#g" "$SRC_TIMER" > "$TARGET/$TIMER"
chmod 0644 "$TARGET/$SERVICE" "$TARGET/$TIMER"
if [ "$TARGET" != "$DEFAULT_TARGET" ]; then
  echo "wrote test-target units to $TARGET; not enabling them"
  exit 0
fi
systemctl --user daemon-reload
systemctl --user enable --now "$TIMER"
systemctl --user list-timers "$TIMER" --no-pager
