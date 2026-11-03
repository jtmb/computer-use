#!/usr/bin/env bash
# Start the pinned Playwright MCP in an isolated headless Firefox browser.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$HOME/.local/share/fnm/aliases/default/bin"
PROJECT="$(cd "$SCRIPT_DIR/../tools/browser" && pwd)"
MCP="$PROJECT/node_modules/.bin/playwright-mcp"
OUTPUT="/tmp/opencode/playwright-headless"

if [ ! -x "$NODE_BIN/node" ]; then
  echo "playwright-headless: fnm default Node is unavailable: $NODE_BIN/node" >&2
  exit 1
fi
if [ ! -x "$MCP" ]; then
  echo "playwright-headless: runtime is not installed: $MCP" >&2
  echo "Run: ./scripts/onboard.sh --with-browser to provision it." >&2
  exit 1
fi

mkdir -p "$OUTPUT"
chmod 700 "$OUTPUT"

# Headless work needs no provider credentials. Reduce the environment to the
# browser runtime's actual inputs before exec.
ENVIRONMENT=(
  "HOME=$HOME"
  "PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
  "LANG=${LANG:-C.UTF-8}"
  "PLAYWRIGHT_BROWSERS_PATH=$PROJECT/browsers"
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
  "$MCP" \
  --browser firefox \
  --headless \
  --isolated \
  --image-responses omit \
  --output-dir "$OUTPUT"
