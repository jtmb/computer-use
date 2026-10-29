#!/usr/bin/env bash
# Read-only health check for the computer-use v2 configuration.
set -euo pipefail

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

if opencode service status >/dev/null 2>&1; then
  ok "background service responds"
else
  bad "background service is unavailable"
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
  scripts/opencode-maintenance-cron.sh \
  scripts/go-model-index-maintain.py \
  scripts/go-model-index-maintain.sh \
  scripts/install-go-model-index-timer.sh; do
  if [ -f "$ROOT/$f" ]; then
    ok "present: $f"
  else
    bad "missing: $f"
  fi
done

for f in \
  AGENTS.md \
  .opencode/skills/README.md \
  .opencode/skills/handoff/SKILL.md \
  opencode-go-model-index.yaml \
  config/go-model-index-variants.json \
  docs/go-model-index-maintenance.md; do
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
  printf '\nHealth check PASSED\n'
  exit 0
fi

printf '\nHealth check FAILED: %s issue(s)\n' "$fail" >&2
exit 1
