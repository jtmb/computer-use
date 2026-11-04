#!/usr/bin/env bash
# Restart only the Playwright MCP connection for one project location.
#
# OpenCode keeps MCP servers alive for the life of a session, so a launcher fix
# does not reach a service that is already running. This script asks the running
# service to disconnect and reconnect the Playwright server, which spawns the
# current launcher without restarting chats or interrupting model turns.
#
# Non-interactive by design: no prompts, no password, no confirmation.
set -euo pipefail

DIRECTORY="$PWD"
DRY_RUN=false
TIMEOUT=45

usage() {
  cat >&2 <<'EOF'
Usage: restart-playwright-mcp.sh [--directory <path>] [--dry-run] [--timeout <seconds>]

  --directory  Project location whose Playwright MCP should reconnect (default: cwd)
  --dry-run    Show the current state without reconnecting
  --timeout    Seconds to wait for the reconnect (default: 45)
EOF
}

while (($# > 0)); do
  case "$1" in
    --directory)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      DIRECTORY="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --timeout)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "restart-playwright-mcp: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ ! -d "$DIRECTORY" ]]; then
  echo "restart-playwright-mcp: not a directory: $DIRECTORY" >&2
  exit 1
fi

OPENCODE_BIN="${OPENCODE_BIN:-$HOME/.local/opt/opencode-v2/opencode}"
if [[ ! -x "$OPENCODE_BIN" ]]; then
  OPENCODE_BIN="$(command -v opencode || true)"
fi
if [[ -z "$OPENCODE_BIN" || ! -x "$OPENCODE_BIN" ]]; then
  echo "restart-playwright-mcp: the OpenCode binary was not found" >&2
  exit 1
fi

LOCATION="location%5Bdirectory%5D=$DIRECTORY"
LIST_URL="/api/mcp?$LOCATION"

if ! "$OPENCODE_BIN" service status >/dev/null 2>&1; then
  echo "restart-playwright-mcp: no background service is running; a new session will use the current launcher" >&2
  exit 0
fi

state() {
  "$OPENCODE_BIN" api get "$LIST_URL" 2>/dev/null || true
}

BEFORE="$(state)"
if [[ -z "$BEFORE" ]]; then
  echo "restart-playwright-mcp: the service did not return MCP state for $DIRECTORY" >&2
  exit 1
fi

if ! grep -q '"name":"playwright"' <<<"$BEFORE"; then
  echo "restart-playwright-mcp: Playwright MCP is not configured for $DIRECTORY" >&2
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "restart-playwright-mcp: dry run; current state: $BEFORE"
  exit 0
fi

# A disconnect can legitimately report "not connected"; continue to connect.
"$OPENCODE_BIN" api post "/api/experimental/mcp/playwright/disconnect?$LOCATION" --data '{}' >/dev/null 2>&1 || true
"$OPENCODE_BIN" api post "/api/experimental/mcp/playwright/connect?$LOCATION" --data '{}' >/dev/null 2>&1 || true

DEADLINE=$((SECONDS + TIMEOUT))
while ((SECONDS < DEADLINE)); do
  if state | grep -q '"name":"playwright","status":{"status":"connected"}'; then
    echo "restart-playwright-mcp: Playwright MCP reconnected for $DIRECTORY"
    pgrep -af "@playwright/mcp/cli.js" 2>/dev/null | grep -v "bash -c" | sed 's/^/  /' || true
    exit 0
  fi
  sleep 1
done

echo "restart-playwright-mcp: Playwright MCP did not report connected within ${TIMEOUT}s" >&2
echo "restart-playwright-mcp: current state: $(state)" >&2
exit 1
