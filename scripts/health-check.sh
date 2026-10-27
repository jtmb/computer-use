#!/usr/bin/env bash
# Read-only health check for the computer-use v2 configuration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

ok() { printf 'OK: %s\n' "$*"; }
bad() { printf 'FAIL: %s\n' "$*" >&2; fail=$((fail + 1)); }
warn() { printf 'WARN: %s\n' "$*"; }

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
if printf '%s\n' "$mcp_list" | grep -Eq '^[^[:alnum:]]*github[[:space:]]+connected'; then
  ok "MCP connected: github"
else
  bad "MCP not connected: github"
fi

# The Playwright MCP is an isolated automation browser, never the user's browser.
# It must stay disabled in every state; absence of the line is fine, but any
# state other than "disabled" (connected, starting, error, unrecognised) is a
# defect. Matching is case-insensitive so a capitalised state cannot slip past.
pw_bad="$(printf '%s\n' "$mcp_list" | grep -Ei 'playwright' | grep -Eiv 'disabled' || true)"
if [ -n "$pw_bad" ]; then
  bad "MCP playwright is not disabled: $(printf '%s' "$pw_bad" | tr '\n' ' ' | cut -c1-200)"
  printf '      hint: keep "disabled": true and remove the global playwright server\n' >&2
else
  ok "MCP playwright absent or disabled"
fi

# Config-level assertion on the raw config documents, not the merged view.
# A playwright server outside this repository is the retired global server.
if config_check="$(opencode debug config 2>/dev/null | ROOT="$ROOT" python3 -c '
import json, os, sys

root = os.path.realpath(os.environ["ROOT"])
prefix = root + os.sep

def under_root(path):
    p = os.path.realpath(path)
    return p == root or p.startswith(prefix)

try:
    docs = json.load(sys.stdin)
except Exception:
    print("could not read or parse opencode debug config")
    sys.exit(1)

if not isinstance(docs, list):
    print("opencode debug config is not a JSON array")
    sys.exit(1)

problems = []
for doc in docs:
    if not isinstance(doc, dict):
        continue
    path = doc.get("path") or "unknown"
    info = doc.get("info") or {}
    servers = (info.get("mcp") or {}).get("servers") or {}
    if "playwright" not in servers:
        continue
    entry = servers["playwright"]
    disabled = entry.get("disabled") if isinstance(entry, dict) else None
    if not under_root(path):
        problems.append("retired global playwright MCP server in " + path)
    elif disabled is not True:
        problems.append("project playwright MCP server not disabled in " + path)

if problems:
    print("; ".join(problems))
    sys.exit(1)

print("playwright MCP confined to disabled project entry")
')"; then
  ok "$config_check"
else
  bad "config check: ${config_check:-opencode debug config unavailable}"
fi

# Real-browser control path: AT-SPI CLI, not an MCP tool.
if dc_out="$(python3 "$ROOT/scripts/desktop-control.py" apps 2>&1)"; then
  if printf '%s' "$dc_out" | python3 -c '
import json, sys
try:
    apps = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if isinstance(apps, list) and len(apps) > 0 else 1)
' 2>/dev/null; then
    ok "desktop-control reaches the AT-SPI bus"
  else
    bad "desktop-control apps returned no accessible applications: $(printf '%s' "$dc_out" | tr '\n' ' ' | cut -c1-200)"
  fi
else
  bad "desktop-control apps failed: $(printf '%s' "$dc_out" | tr '\n' ' ' | cut -c1-200)"
fi

# Non-fatal diagnostics for the desktop control/vision path.
a11y="$(gsettings get org.gnome.desktop.interface toolkit-accessibility 2>/dev/null || true)"
if [ "$a11y" = "true" ]; then
  ok "toolkit-accessibility enabled"
else
  warn "toolkit-accessibility is ${a11y:-unavailable}; apps that gate on the pref (notably Firefox) may not publish themselves to AT-SPI"
fi

if command -v ydotool >/dev/null 2>&1; then
  ok "ydotool present"
else
  warn "ydotool not installed; desktop-vision key input may be unavailable"
fi

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
  scripts/pyatspi_compat.py \
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
  printf '\nHealth check PASSED\n'
  exit 0
fi

printf '\nHealth check FAILED: %s issue(s)\n' "$fail" >&2
exit 1
