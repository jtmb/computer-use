#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${OPENCODE_NODE_BIN:-$HOME/.opencode/bin/node}"
MCP="$ROOT/tools/browser/node_modules/@playwright/mcp/cli.js"
BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
USER_DATA_DIR="${PLAYWRIGHT_USER_DATA_DIR:-$HOME/.local/share/opencode/playwright-firefox}"
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

mkdir -p "$OUTPUT_DIR"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH"

exec "$NODE" "$MCP" \
  --browser firefox \
  --user-data-dir "$USER_DATA_DIR" \
  --viewport-size 1440x900 \
  --output-dir "$OUTPUT_DIR"
