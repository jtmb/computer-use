#!/usr/bin/env bash
# One-shot onboarding for this repository's OpenCode v2 setup.
# Dry-run is the default; pass --apply to deploy configuration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLY=0
MODEL=""
INTERACTIVE=0
WITH_BROWSER=0
SKIP_SEARCH=0
FORCE_SEARCH=0
STRICT=0
WARNINGS=0

usage() {
  cat <<'EOF'
Usage: onboard.sh [--apply] [--model provider/model] [--interactive]
                  [--with-browser] [--search] [--no-search] [--strict]

Checks OpenCode v2, deploys the tracked global config, optionally configures a
model, installs the browser MCP dependency, and verifies web search.

Dry-run is the default. --apply performs writes. A dry run does not run the
live web search check unless --search is given.

Options:
  --apply          Deploy the global config and any selected model
  --model ID       Set the global model without prompting
  --interactive    Prompt for a model from the available list
  --with-browser   Run npm --prefix tools/browser install
  --search         Run the live web search check even in a dry run
  --no-search      Skip the live web search check
  --strict         Exit nonzero when the run records warnings
  -h, --help       Show this help
EOF
}

fail() {
  printf 'onboard: %s\n' "$*" >&2
  exit 1
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  printf 'onboard: warning: %s\n' "$*" >&2
}

step() {
  printf '\n== %s ==\n' "$*"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --model)
      [ "$#" -ge 2 ] || fail "--model requires an ID"
      MODEL="$2"
      shift 2
      ;;
    --model=*)
      MODEL="${1#*=}"
      shift
      ;;
    --interactive) INTERACTIVE=1; shift ;;
    --with-browser) WITH_BROWSER=1; shift ;;
    --search) FORCE_SEARCH=1; shift ;;
    --no-search) SKIP_SEARCH=1; shift ;;
    --strict) STRICT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

search_value() {
  python3 -c '
import json, sys
try:
    payload = json.load(sys.stdin)
    print(payload.get("data", {}).get(sys.argv[1], ""))
except Exception:
    pass
' "$1"
}

step "Check OpenCode v2"
command -v opencode >/dev/null 2>&1 || fail "opencode is not on PATH"
VERSION="$(opencode --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
[ -n "$VERSION" ] || fail "could not read the OpenCode version"
MAJOR="${VERSION%%.*}"
case "$MAJOR" in
  ''|*[!0-9]*) fail "unexpected OpenCode version: $VERSION" ;;
esac
[ "$MAJOR" -ge 2 ] || fail "OpenCode v2 is required; found $VERSION"
printf 'opencode=%s\n' "$VERSION"
printf 'root=%s\n' "$ROOT"

step "Check repository layout"
for path in global/opencode.jsonc global/cli.json scripts/deploy-global-config.sh; do
  [ -e "$ROOT/$path" ] || fail "missing $path"
done
printf 'layout=ok\n'

step "Check OpenCode service"
if opencode service status >/dev/null 2>&1; then
  printf 'service=ok\n'
else
  warn "service is not healthy; configuration can still be deployed"
fi

step "Deploy global configuration"
if [ "$APPLY" -eq 1 ]; then
  printf 'note: full deployment replaces tracked agents/ and commands/; local-only entries are backed up\n'
  "$ROOT/scripts/deploy-global-config.sh" --apply
else
  "$ROOT/scripts/deploy-global-config.sh"
fi

step "Model selection"
if [ -n "$MODEL" ]; then
  args=(--model "$MODEL")
  [ "$APPLY" -eq 1 ] && args+=(--apply)
  "$ROOT/scripts/setup-model.sh" "${args[@]}"
elif [ "$INTERACTIVE" -eq 1 ]; then
  [ -t 0 ] || fail "--interactive requires a terminal"
  if [ "$APPLY" -eq 1 ]; then
    "$ROOT/scripts/setup-model.sh" --apply
  else
    "$ROOT/scripts/setup-model.sh"
  fi
else
  CURRENT_MODEL="$(python3 - "$ROOT/global/opencode.jsonc" <<'PY'
import json, sys
try:
    print(json.load(open(sys.argv[1])).get("model", ""))
except Exception:
    print("")
PY
)"
  printf 'model=%s (unchanged; pass --model or --interactive to change)\n' "${CURRENT_MODEL:-<none>}"
fi

step "GitHub CLI"
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    printf 'gh=authenticated\n'
  else
    warn "gh is installed but not authenticated; run: gh auth login"
  fi
else
  warn "gh is not installed; GitHub MCP tools will not work"
fi

step "Browser MCP dependency"
if [ "$WITH_BROWSER" -eq 1 ]; then
  if [ "$APPLY" -eq 1 ]; then
    npm --prefix "$ROOT/tools/browser" install
    printf 'browser=installed\n'
  else
    printf 'browser=would install (rerun with --apply)\n'
  fi
else
  printf 'browser=skipped (pass --with-browser to install)\n'
fi

step "Web search"
if [ "$SKIP_SEARCH" -eq 1 ]; then
  printf 'search=skipped (--no-search)\n'
elif [ "$APPLY" -eq 0 ] && [ "$FORCE_SEARCH" -eq 0 ]; then
  printf 'search=skipped (dry run; use --apply or --search to run a live query)\n'
elif ! command -v opencode >/dev/null 2>&1; then
  warn "cannot verify web search without the opencode CLI"
else
  PROVIDERS="$(opencode api get /api/websearch/provider 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin).get("data", [])
    print(",".join(item.get("id", "") for item in data))
except Exception:
    print("")
' || true)"
  if [ -n "$PROVIDERS" ]; then
    printf 'providers=%s\n' "$PROVIDERS"
  else
    warn "no websearch providers reported"
  fi

  SEARCH_JSON="$(opencode api post /api/websearch -d '{"query":"OpenCode v2 websearch onboarding"}' 2>/dev/null || true)"
  PROVIDER="$(printf '%s' "$SEARCH_JSON" | search_value providerID)"
  COUNT="$(printf '%s' "$SEARCH_JSON" | python3 -c '
import json, sys
try:
    print(len(json.load(sys.stdin).get("data", {}).get("results", [])))
except Exception:
    print(0)
' || true)"
  if [ -n "$PROVIDER" ] && [ "${COUNT:-0}" -gt 0 ]; then
    printf 'search=ok provider=%s results=%s\n' "$PROVIDER" "$COUNT"
  else
    warn "live web search returned no results; check network or /connect"
  fi
fi

step "Result"
if [ "$APPLY" -eq 1 ]; then
  printf 'configuration applied; reload with Ctrl+P > service.restart if the TUI is running\n'
else
  printf 'dry run complete; rerun with --apply to write changes\n'
fi
if [ "$WARNINGS" -gt 0 ]; then
  printf 'warnings=%s\n' "$WARNINGS"
  if [ "$STRICT" -eq 1 ]; then
    exit 1
  fi
else
  printf 'warnings=0\n'
fi
