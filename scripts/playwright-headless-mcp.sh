#!/usr/bin/env bash
# Start the pinned Playwright MCP in an isolated headless Firefox browser.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="${OPENCODE_NODE_BIN:-$(command -v node 2>/dev/null || true)}"
[ -n "$NODE" ] || NODE="$HOME/.opencode/bin/node"
NODE_BIN="$(dirname "$NODE")"
PROJECT="$(cd "$SCRIPT_DIR/../tools/browser" && pwd)"
MCP="$PROJECT/node_modules/.bin/playwright-mcp"
OUTPUT="${OPENCODE_HEADLESS_OUTPUT_DIR:-${TMPDIR:-/tmp}/opencode/playwright-headless}"

if [ ! -x "$NODE" ]; then
  echo "playwright-headless: Node.js is unavailable: $NODE" >&2
  exit 1
fi
if [ ! -x "$MCP" ]; then
  echo "playwright-headless: runtime is not installed: $MCP" >&2
  echo "Run ./scripts/onboard.sh --with-browser to provision it." >&2
  exit 1
fi

mkdir -p "$OUTPUT"
chmod 700 "$OUTPUT"
export PATH="$NODE_BIN:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$PROJECT/browsers"

exec "$MCP" \
  --browser firefox \
  --headless \
  --isolated \
  --image-responses omit \
  --output-dir "$OUTPUT"
