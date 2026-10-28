#!/usr/bin/env bash
# Read-only health check for the computer-use v2 configuration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/scripts/opencode-paths.sh"
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

if opencode service status >/dev/null 2>&1; then
  ok "background service responds"
else
  bad "background service is unavailable"
fi

mcp_connected() {
  printf '%s\n' "$1" | grep -Eq "^[^[:alnum:]]*$2[[:space:]]+connected"
}

# MCP servers start asynchronously. A first query can legitimately return
# before both servers finish connecting, so retry briefly instead of reporting
# a false failure. The wait is bounded and does not skip the check.
mcp_list=""
for _ in {1..15}; do
  mcp_list="$(opencode mcp list 2>/dev/null || true)"
  if mcp_connected "$mcp_list" github && mcp_connected "$mcp_list" playwright; then
    break
  fi
  # A reported failure is terminal for this run; only cold starts are retried.
  if printf '%s\n' "$mcp_list" | grep -q 'failed'; then
    break
  fi
  sleep 2
done

for mcp in github playwright; do
  if mcp_connected "$mcp_list" "$mcp"; then
    ok "MCP connected: $mcp"
  else
    bad "MCP not connected: $mcp"
  fi
done

skill_root="${OPENCODE_GLOBAL_SKILLS_DIR:-$(resolve_global_config_dir)/skills}"
if [ -f "$skill_root/handoff/SKILL.md" ]; then
  ok "global skills deployed: $skill_root"
else
  bad "global skills directory is missing or incomplete: $skill_root"
fi

for f in \
  scripts/github-mcp.sh \
  scripts/playwright-mcp.sh \
  scripts/desktop-control.py \
  scripts/deploy-skills.sh \
  scripts/opencode-db-maintain.py \
  scripts/opencode-chat-backup.py \
  scripts/opencode-maintenance-cron.sh; do
  if [ -f "$ROOT/$f" ]; then
    ok "present: $f"
  else
    bad "missing: $f"
  fi
done

for f in AGENTS.md .opencode/skills/README.md .opencode/skills/handoff/SKILL.md; do
  if [ -f "$ROOT/$f" ]; then
    ok "present: $f"
  else
    bad "missing: $f"
  fi
done

skill_count="$(find "$skill_root" -name SKILL.md -type f 2>/dev/null | wc -l | tr -d ' ')"
if [ "$skill_count" -ge 20 ]; then
  ok "global skills present: $skill_count"
else
  bad "global skill count is unexpectedly low: $skill_count"
fi

skills_ready() {
  printf '%s' "$1" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin).get("data", [])
except Exception:
    sys.exit(1)
ids = {item.get("id", "") for item in data if isinstance(item, dict)}
required = {"handoff"}
sys.exit(0 if required <= ids else 1)
' 2>/dev/null
}

skill_api=""
for _ in {1..5}; do
  skill_api="$(opencode api get /api/skill 2>/dev/null || true)"
  if skills_ready "$skill_api"; then
    break
  fi
  sleep 2
done

if skills_ready "$skill_api"; then
  ok "OpenCode discovers deployed skills"
else
  bad "OpenCode did not report the deployed skills"
fi

if [ "$fail" -eq 0 ]; then
  printf '\nHealth check PASSED\n'
  exit 0
fi

printf '\nHealth check FAILED: %s issue(s)\n' "$fail" >&2
exit 1
