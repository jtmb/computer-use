# AGENTS.md — computer-use

This is the canonical repository for the local OpenCode v2 computer-use setup:
project/global configuration, skills, MCP wrappers, browser tooling, and the
supporting scripts.

Canonical repository: the checkout that contains this file (commonly cloned at
`~/repos/computer-use`). Scripts and docs resolve paths from the repository
root; do not assume a specific home directory.

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
- Cluster work (CVE assessment, plan, evidence, handoff) lives in a local audit
  directory outside this repository. Set `CLUSTER_AUDIT_DIR` in your local
  environment or notes; do not hardcode one user's path in this repo.

The project `opencode.json` registers the `github` and `playwright` local MCPs
from `./scripts/`. Global skills are deployed to the active global skills
directory (by default `~/.config/opencode/skills/`) and discovered natively;
the repository `.opencode/skills` directory is the source of truth.

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
- `kubernetes-rancher-operations` — cluster, Rancher, storage, GitOps, upgrade,
  and migration diagnosis.
- `repo-onboarding`, `development-conventions`, `agent-orchestration`, and the
  task-domain skills.

## Verification

Run the read-only health check from the repository root:

```bash
./scripts/health-check.sh
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
`playwright` connected, skills deployed in the active global skills directory,
and the required local scripts present.

## Handoff and the cluster plan

- Use the global `handoff` skill in the directory where the work lives. Refresh
  that directory's `HANDOFF.md` with the current state, blockers, and next
  steps; preserve its prompt and live-state structure.
- Keep the cluster plan at `$CLUSTER_AUDIT_DIR/plan.md` synchronized with the
  remediation and backup state.
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
