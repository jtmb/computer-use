# AGENTS.md — computer-use

This is the canonical repository for the local OpenCode v2 computer-use setup:
project/global configuration, skills, MCP wrappers, browser tooling, and the
supporting scripts.

Canonical repository: `~/repos/computer-use`

## Start Here

For every new task:

1. Read the user's request and the relevant skill.
2. Inspect current state read-only before changing anything.
3. Make the smallest bounded change that satisfies the request.
4. Verify the real outcome, not just a command exit code.
5. Preserve unrelated dirty work and never edit deployed copies.
6. Report what changed, what passed, and any limitation.

For a fresh session, use the global `handoff` skill in the working directory.
Cluster work keeps its `HANDOFF.md` and `plan.md` with the audit evidence, not
in this repository.

## Layout

- Skills source: `.opencode/skills/<name>/SKILL.md`
- Skill catalog: `.opencode/skills/README.md`
- Supporting scripts: `scripts/`
- Global config source: `global/`
- Project config: `opencode.json`
- MCP version pins: `config/mcp-versions.json`
- Browser tooling: `tools/browser/`
- Cluster and backup plan: `/home/shak/audits/k8s-cve-20261026T225036Z/plan.md` (with the audit evidence)
- Cluster handoff: `/home/shak/audits/k8s-cve-20261026T225036Z/HANDOFF.md`

The project `opencode.json` registers the `github` and `playwright` local MCPs
from `./scripts/`. The `playwright` server is an isolated automation browser
with its own throwaway profile; it is never the user's browser and must never
be used for the user's logged-in accounts or personal browsing. The global
config enables the same server and points skills at
`~/repos/computer-use/.opencode/skills`.

The native-Ubuntu real-browser path is `scripts/desktop-control.py`, an AT-SPI
CLI, not an MCP tool. The `desktop-control` and `desktop-vision` MCP tools do
not exist here, and `vision_capture`/`ydotool` are unavailable on this host.

## Skills

Load the matching `.opencode/skills/<name>/SKILL.md` before acting. The catalog
in `.opencode/skills/README.md` is the routing and tag index.

Important skills:

- `handoff` — refresh `HANDOFF.md` and preserve the live state.
- `skill-maintenance` — update skills and the catalog safely.
- `desktop-vision` / `desktop-control` — GNOME observation and control.
- `browser-assistant` / `browser-headless` — visible and headless browser work.
- `github-operations` — bounded GitHub reads and approved mutations.
- `task-memory` — durable private context.
- `opencode-db-maintenance` — chat backup and database maintenance.
- `repo-onboarding`, `development-conventions`, `agent-orchestration`, and the
  task-domain skills.

## Verification

Run the read-only health check:

```bash
/home/shak/repos/computer-use/scripts/health-check.sh
```

Supporting checks:

```bash
opencode --version
opencode service status
opencode mcp list
opencode debug config
bash -n scripts/*.sh
python3 -m py_compile scripts/*.py
git status --short
git diff --check
```

A healthy setup reports OpenCode v2, a running service, `github` and
`playwright` connected, `scripts/desktop-control.py apps` exiting 0, the
repository skill path in the effective config, and the required local scripts
present.

## Handoff and the cluster plan

- Use the global `handoff` skill in the directory where the work lives. Refresh
  that directory's `HANDOFF.md` with the current state, blockers, and next
  steps; preserve its prompt and live-state structure.
- Keep the cluster plan at `/home/shak/audits/k8s-cve-20261026T225036Z/plan.md` synchronized with the remediation and
  backup state.
- The cluster recovery gate is open until a fresh Longhorn backup and a tested
  restore are observed. A scheduled backup is not proof that a backup works.

## Safety

- Ask immediately before sending/publishing, deleting data, changing account or
  security settings, granting permissions, rebooting, or other consequential
  actions.
- Do not commit or push without explicit approval. Commit approval and push
  approval are separate.
- Never edit deployed copies under `~/.config/opencode/` or other runtime
  directories.
- Never store credentials, tokens, private keys, payment data, or passwords in
  this repository or in task memory.
- Never weaken browser sandboxing, TLS validation, filesystem permissions, or
  system security to hide a failure.
- Never use the project Playwright MCP as the user's browser. It is an isolated
  automation profile with no user logins, and Google rejects sign-in from it;
  the user's real browser is driven through `scripts/desktop-control.py`.
