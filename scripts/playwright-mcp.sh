#!/usr/bin/env bash
# Start the pinned Playwright MCP with a minimal, explicit environment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${OPENCODE_NODE_BIN:-$HOME/.opencode/bin/node}"
MCP="$ROOT/tools/browser/node_modules/@playwright/mcp/cli.js"
SELECT="$ROOT/scripts/playwright-browser-select.mjs"
BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
OUTPUT_DIR="${PLAYWRIGHT_OUTPUT_DIR:-/tmp/opencode/playwright-mcp}"

if [[ ! -x "$NODE" ]]; then
  echo "playwright-mcp: Node.js is unavailable: $NODE" >&2
  exit 1
fi
if [[ ! -f "$MCP" ]]; then
  echo "playwright-mcp: dependency is not installed: $MCP" >&2
  echo "Run: npm --prefix tools/browser install" >&2
  exit 1
fi

# OPENCODE_NODE_BIN selects the interpreter, so validate it before executing:
# absolute, a regular file, and owned by this user or root. Mode bits are not
# enforced here because the stock OpenCode installer ships this binary 0777.
if [[ "$NODE" != /* ]]; then
  echo "playwright-mcp: Node.js path must be absolute: $NODE" >&2
  exit 1
fi
if [[ ! -f "$NODE" ]]; then
  echo "playwright-mcp: Node.js must be a regular file: $NODE" >&2
  exit 1
fi
NODE_OWNER="$(stat -c '%u' "$NODE" 2>/dev/null || true)"
if [[ "$NODE_OWNER" != "$(id -u)" && "$NODE_OWNER" != "0" ]]; then
  echo "playwright-mcp: Node.js must be owned by this user or root: $NODE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Choose a browser Playwright can actually launch instead of hard-coding one.
# The default browser wins when it is drivable; otherwise the first installed
# supported browser is used. System Firefox alone is never chosen because
# Playwright needs its own patched build.
if ! SELECTION_TEXT="$(PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH" "$NODE" "$SELECT" --tokens)"; then
  echo "playwright-mcp: no Playwright-drivable browser was found" >&2
  exit 1
fi
mapfile -t SELECTION <<< "$SELECTION_TEXT"
PROFILE_KEY="${SELECTION[0]#profile=}"
BROWSER_ARGS=("${SELECTION[@]:1}")
USER_DATA_DIR="${PLAYWRIGHT_USER_DATA_DIR:-$HOME/.local/share/opencode/playwright-$PROFILE_KEY}"
echo "playwright-mcp: launching browser profile=$PROFILE_KEY" >&2

# The browser MCP needs no provider credentials. Pass only what it genuinely
# uses so unrelated secrets in the parent environment cannot reach it.
ENVIRONMENT=(
  "HOME=$HOME"
  "PATH=/usr/local/bin:/usr/bin:/bin"
  "LANG=${LANG:-C.UTF-8}"
  "PLAYWRIGHT_BROWSERS_PATH=$BROWSERS_PATH"
)
for NAME in LC_ALL LC_CTYPE TMPDIR XDG_RUNTIME_DIR DISPLAY WAYLAND_DISPLAY XAUTHORITY; do
  VALUE="${!NAME:-}"
  if [[ -n "$VALUE" && ! "$VALUE" =~ [[:cntrl:]] ]]; then
    ENVIRONMENT+=("$NAME=$VALUE")
  fi
done
unset NAME VALUE

exec /usr/bin/env -i "${ENVIRONMENT[@]}" "$NODE" "$MCP" \
  "${BROWSER_ARGS[@]}" \
  --user-data-dir "$USER_DATA_DIR" \
  --viewport-size 1440x900 \
  --output-dir "$OUTPUT_DIR"
