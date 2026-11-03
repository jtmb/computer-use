#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
RUNTIME="$SCRIPT_DIR/mcp_runtime.py"
PACKAGE_ROOT="$SCRIPT_DIR/../tools/chatgpt-connector"
PROFILE="${OPENCODE_MCP_PROFILE:-native}"
PROFILE_ROOT="${OPENCODE_MCP_PROFILE_ROOT:-${OPENCODE_WSL2_PILOT_DIR:-$HOME/.opencode-wsl2-pilot}}"

fail() {
  printf 'chatgpt-mcp: %s\n' "$*" >&2
  exit 2
}

usage() {
  cat <<'EOF'
Usage: chatgpt-mcp.sh [--verify-only]

Launch the optional ChatGPT MCP using the selected profile's pinned Node.js.
The companion plugin and an active OpenAI OAuth connection are required for
tool calls. This launcher does not install dependencies or enable the plugin.

Environment:
  OPENCODE_MCP_PROFILE       native (default) or wsl2
  OPENCODE_MCP_PROFILE_ROOT  isolated WSL/profile state root
EOF
}

VERIFY_ONLY=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verify-only) VERIFY_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[[ "$HOME" = /* && ! "$HOME" =~ [[:cntrl:]] ]] || fail "HOME must be an absolute path without control characters"

case "$PROFILE" in
  native)
    if [[ -n "${OPENCODE_MCP_PROFILE_ROOT:-}" || -n "${OPENCODE_WSL2_PILOT_DIR:-}" ]]; then
      fail "native profile does not accept an isolated profile root"
    fi
    RUNTIME_ARGS=(--profile native)
    ;;
  wsl2)
    [[ "$PROFILE_ROOT" = /* ]] || fail "wsl2 profile root must be absolute"
    [[ ! "$PROFILE_ROOT" =~ [[:cntrl:]] ]] || fail "wsl2 profile root contains control characters"
    RUNTIME_ARGS=(--profile wsl2 --profile-root "$PROFILE_ROOT")
    ;;
  *) fail "unsupported MCP profile: $PROFILE" ;;
esac

[[ -f "$RUNTIME" && ! -L "$RUNTIME" ]] || fail "trusted MCP runtime helper is missing or symlinked"
[[ -d "$PACKAGE_ROOT" && ! -L "$PACKAGE_ROOT" ]] || fail "ChatGPT connector package is missing or symlinked"
PACKAGE_ROOT="$(cd -P "$PACKAGE_ROOT" && pwd -P)"
ENTRY="$PACKAGE_ROOT/src/mcp.ts"
VERIFY="$PACKAGE_ROOT/verify-dependencies.mjs"
[[ -f "$ENTRY" && ! -L "$ENTRY" ]] || fail "ChatGPT MCP entry point is missing or symlinked"
[[ "$(realpath "$ENTRY")" = "$ENTRY" ]] || fail "ChatGPT MCP entry point has a symlinked path"
[[ -f "$VERIFY" && ! -L "$VERIFY" ]] || fail "ChatGPT dependency verifier is missing or symlinked"
[[ "$(realpath "$VERIFY")" = "$VERIFY" ]] || fail "ChatGPT dependency verifier has a symlinked path"

SAFE_HELPER_ENV=(/usr/bin/env -i "HOME=$HOME" "PATH=/usr/bin:/bin" "LANG=${LANG:-C.UTF-8}")
NODE="$("${SAFE_HELPER_ENV[@]}" /usr/bin/python3 "$RUNTIME" runner --kind node "${RUNTIME_ARGS[@]}")" \
  || fail "the selected MCP profile's trusted Node.js runtime is unavailable"
EXPECTED_VERSION="$("${SAFE_HELPER_ENV[@]}" /usr/bin/python3 "$RUNTIME" policy --kind node)" \
  || fail "the canonical Node.js version pin is unavailable"
ACTUAL_VERSION="$("${SAFE_HELPER_ENV[@]}" "$NODE" --version)" \
  || fail "the selected Node.js runtime could not be executed"
[[ "$ACTUAL_VERSION" = "v$EXPECTED_VERSION" ]] || fail "selected profile Node.js does not match its pinned version"

SAFE_NODE_ENV=(/usr/bin/env -i "HOME=$HOME" "PATH=/usr/bin:/bin" "LANG=${LANG:-C.UTF-8}")
if ! "${SAFE_NODE_ENV[@]}" "$NODE" "$VERIFY"; then
  fail "install the exact package-local dependencies with npm --prefix tools/chatgpt-connector ci"
fi

if [ "$VERIFY_ONLY" -eq 1 ]; then
  printf 'node=%s\n' "$NODE"
  printf 'node_version=%s\n' "$EXPECTED_VERSION"
  printf 'entry=%s\n' "$ENTRY"
  printf 'profile=%s\n' "$PROFILE"
  exit 0
fi

NODE_DIRECTORY="$(dirname "$NODE")"
ENVIRONMENT=("HOME=$HOME" "PATH=$NODE_DIRECTORY:/usr/bin:/bin" "LANG=${LANG:-C.UTF-8}")
for NAME in XDG_CONFIG_HOME XDG_DATA_HOME XDG_STATE_HOME XDG_CACHE_HOME XDG_RUNTIME_DIR; do
  VALUE="${!NAME:-}"
  if [[ -n "$VALUE" ]]; then
    [[ "$VALUE" = /* && ! "$VALUE" =~ [[:cntrl:]] ]] || fail "$NAME must be an absolute path without control characters"
    ENVIRONMENT+=("$NAME=$VALUE")
  fi
done
mapfile -t INHERITED_NAMES < <(compgen -e)
for NAME in "${INHERITED_NAMES[@]}"; do
  case "$NAME" in
    LC_*)
      VALUE="${!NAME}"
      [[ ! "$VALUE" =~ [[:cntrl:]] ]] && ENVIRONMENT+=("$NAME=$VALUE")
      ;;
  esac
done
unset INHERITED_NAMES NAME VALUE

exec /usr/bin/env -i "${ENVIRONMENT[@]}" "$NODE" --experimental-strip-types "$ENTRY"
