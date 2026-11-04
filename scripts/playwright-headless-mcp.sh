#!/usr/bin/env bash
# Start the pinned Playwright MCP in an isolated headless browser.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="${OPENCODE_NODE_BIN:-$(command -v node || true)}"
PROJECT="$(cd "$SCRIPT_DIR/../tools/browser" && pwd)"
MCP="$PROJECT/node_modules/@playwright/mcp/cli.js"
SELECT="$SCRIPT_DIR/playwright-browser-select.mjs"
OUTPUT="/tmp/opencode/playwright-headless"

if [[ "$NODE" != /* || ! -f "$NODE" || ! -x "$NODE" ]]; then
  echo "playwright-headless: Node.js is unavailable: $NODE" >&2
  exit 1
fi
NODE_OWNER="$(stat -c '%u' "$NODE" 2>/dev/null || true)"
if [[ "$NODE_OWNER" != "$(id -u)" && "$NODE_OWNER" != "0" ]]; then
  echo "playwright-headless: Node.js must be owned by this user or root: $NODE" >&2
  exit 1
fi
if [ ! -f "$MCP" ]; then
  echo "playwright-headless: runtime is not installed: $MCP" >&2
  echo "Run: ./scripts/onboard.sh --with-browser to provision it." >&2
  exit 1
fi

mkdir -p "$OUTPUT"
chmod 700 "$OUTPUT"

# Pick a browser the pinned runtime can drive; never assume Firefox exists.
if ! SELECTION_TEXT="$(PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" "$NODE" "$SELECT" --tokens)"; then
  echo "playwright-headless: no Playwright-drivable browser was found" >&2
  exit 1
fi
mapfile -t SELECTION <<< "$SELECTION_TEXT"
PROFILE_KEY="${SELECTION[0]#profile=}"
BROWSER_ARGS=("${SELECTION[@]:1}")
echo "playwright-headless: launching browser profile=$PROFILE_KEY" >&2

# Headless work needs no provider credentials. Reduce the environment to the
# browser runtime's actual inputs before exec.
ENVIRONMENT=(
  "HOME=$HOME"
  "PATH=/usr/local/bin:/usr/bin:/bin"
  "LANG=${LANG:-C.UTF-8}"
  "PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  "TMPDIR=${TMPDIR:-/tmp/opencode}"
)
for NAME in LC_ALL LC_CTYPE XDG_RUNTIME_DIR; do
  VALUE="${!NAME:-}"
  if [[ -n "$VALUE" && ! "$VALUE" =~ [[:cntrl:]] ]]; then
    ENVIRONMENT+=("$NAME=$VALUE")
  fi
done
unset NAME VALUE

exec /usr/bin/env -i "${ENVIRONMENT[@]}" \
  "$NODE" "$MCP" \
  "${BROWSER_ARGS[@]}" \
  --headless \
  --isolated \
  --image-responses omit \
  --output-dir "$OUTPUT"
