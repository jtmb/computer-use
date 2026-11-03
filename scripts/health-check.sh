#!/usr/bin/env bash
# Read-only health check for the computer-use v2 configuration.
set -euo pipefail

usage() {
  printf 'Usage: %s [--status-only]\n' "${0##*/}"
  printf '  --status-only  Read service/configuration status without running test suites.\n'
}

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 2
fi
status_only=false
if [ "$#" -eq 1 ]; then
  case "$1" in
    --status-only) status_only=true ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

ok() { printf 'OK: %s\n' "$*"; }
bad() { printf 'FAIL: %s\n' "$*" >&2; fail=$((fail + 1)); }

version="$(opencode --version 2>/dev/null | head -1 || true)"
major="$(printf '%s' "$version" | sed -nE 's/^[^0-9]*([0-9]+).*/\1/p')"
if [ -n "$major" ] && [ "$major" -ge 2 ]; then
  ok "OpenCode v2 (${version})"
else
  bad "OpenCode v2 not detected (${version:-missing})"
fi

# The CLI also succeeds when it prints "stopped"; that must not reach API auto-start.
if service_status="$(opencode service status 2>/dev/null)" \
  && [[ "$service_status" =~ ^https?://[^[:space:]/]+/?$ ]]; then
  ok "background service responds"
else
  bad "background service is unavailable"
  if [ "$status_only" = true ]; then
    printf 'Status diagnostics stopped before API discovery; no service start or test execution requested.\n' >&2
  else
    printf 'Health diagnostics stopped before API discovery; no service start or test execution requested.\n' >&2
  fi
  exit 1
fi

required_plugins=(computer-use.desktop local.goal-mode.server)
if [ -f .opencode/plugins/goal-docs/index.ts ]; then
  required_plugins+=(computer-use.goal-docs)
fi
plugin_route="$(python3 -c 'import sys, urllib.parse; print("/api/plugin?location%5Bdirectory%5D=" + urllib.parse.quote(sys.argv[1], safe=""))' "$ROOT")"
if plugin_list="$(opencode api get "$plugin_route" 2>/dev/null)"; then
  if plugin_check="$(printf '%s' "$plugin_list" | python3 -c '
import json, sys
try:
    response = json.load(sys.stdin)
    if response.get("location", {}).get("directory") != sys.argv[1]:
        raise ValueError("plugin inventory is not scoped to this repository")
    entries = response["data"]
    if not isinstance(entries, list):
        raise ValueError("plugin inventory data is not a list")
    for plugin_id in sys.argv[2:]:
        matches = [entry for entry in entries if isinstance(entry, dict) and entry.get("id") == plugin_id]
        if len(matches) != 1 or matches[0].get("state", {}).get("status") != "active":
            raise ValueError("plugin missing, duplicated, or not active: " + plugin_id)
    print("required server plugins active at the repository location")
except (ValueError, KeyError, TypeError, AttributeError):
    print("required plugin inventory is invalid, incorrectly scoped, or contains an inactive plugin")
    sys.exit(1)
' "$ROOT" "${required_plugins[@]}")"; then
    ok "$plugin_check"
  else
    bad "$plugin_check; inspect opencode api get '$plugin_route'"
  fi
else
  bad "cannot read the location-scoped server plugin inventory"
fi

mcp_list="$(opencode mcp list 2>/dev/null || true)"
for mcp in github playwright; do
  if printf '%s\n' "$mcp_list" | grep -Eq "^[^[:alnum:]]*$mcp[[:space:]]+connected"; then
    ok "MCP connected: $mcp"
  else
    bad "MCP not connected: $mcp"
  fi
done

config="$(opencode debug config 2>/dev/null || true)"
if printf '%s' "$config" | grep -Fq '.opencode/skills'; then
  ok "effective config includes the repository skill path"
else
  bad "effective config does not include .opencode/skills"
fi

for f in \
  scripts/github-mcp.sh \
  scripts/playwright-mcp.sh \
  scripts/desktop-control.py \
  scripts/assistant-memory.py \
  scripts/opencode-db-maintain.py \
  scripts/opencode-chat-backup.py \
  scripts/opencode-maintenance-cron.sh; do
  if [ -f "$ROOT/$f" ]; then
    ok "present: $f"
  else
    bad "missing: $f"
  fi
done

for f in \
  .opencode/plugins/computer-use/index.ts \
  .opencode/plugins/computer-use/desktop.ts \
  .opencode/plugins/computer-use/screenshot.ts \
  .opencode/plugins/computer-use/contract.test.ts \
  .opencode/plugins/computer-use/logic.test.ts; do
  if [ -f "$ROOT/$f" ]; then
    ok "present: $f"
  else
    bad "missing: $f"
  fi
done

if [ "$status_only" = true ]; then
  printf 'SKIP: test suites not run (--status-only); this is not full verification.\n'
elif command -v node >/dev/null 2>&1; then
  if node --test .opencode/plugins/computer-use/*.test.ts >/dev/null 2>&1; then
    ok "computer-use plugin logic and contract tests pass"
  else
    bad "computer-use plugin tests failed; run node --test .opencode/plugins/computer-use/*.test.ts (requires TypeScript-capable Node)"
  fi
  if [ -f .opencode/plugins/goal-docs/index.ts ]; then
    if node --test .opencode/plugins/goal-docs/*.test.ts >/dev/null 2>&1; then
      ok "goal-docs companion tests pass (not live handoff acceptance)"
    else
      bad "goal-docs companion tests failed; run node --test .opencode/plugins/goal-docs/*.test.ts"
    fi
  fi
else
  bad "node is unavailable; cannot run the computer-use plugin tests"
fi

for f in AGENTS.md .opencode/skills/README.md .opencode/skills/handoff/SKILL.md; do
  if [ -f "$ROOT/$f" ]; then
    ok "present: $f"
  else
    bad "missing: $f"
  fi
done

skill_count="$(find .opencode/skills -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [ "$skill_count" -ge 20 ]; then
  ok "skills present: $skill_count"
else
  bad "skill count is unexpectedly low: $skill_count"
fi

if [ "$fail" -eq 0 ]; then
  if [ "$status_only" = true ]; then
    printf '\nStatus diagnostics PASSED (test suites not run; not full acceptance)\n'
  else
    printf '\nHealth check PASSED\n'
  fi
  exit 0
fi

if [ "$status_only" = true ]; then
  printf '\nStatus diagnostics FAILED: %s issue(s)\n' "$fail" >&2
else
  printf '\nHealth check FAILED: %s issue(s)\n' "$fail" >&2
fi
exit 1
