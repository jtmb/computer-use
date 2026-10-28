# Artifacts and Links

## Canonical remote artifacts

- PR #4: https://github.com/jtmb/computer-use/pull/4
- Repository: https://github.com/jtmb/computer-use
- Fork branch: https://github.com/shakiata/computer-use/tree/feat/kubernetes-rancher-operations
- Related open PR #3 (README/splice/readme-maintenance):
  https://github.com/jtmb/computer-use/pull/3
- Closed PR #2 (email/browser work; intentionally excluded):
  https://github.com/jtmb/computer-use/pull/2

## Upstream documentation

- Agent Skills: https://opencode.ai/docs/skills/
- Configuration and path precedence: https://opencode.ai/docs/config/
- Rules and AGENTS.md: https://opencode.ai/docs/rules/
- MCP servers: https://opencode.ai/docs/mcp-servers/
- GitHub CLI pull requests: https://cli.github.com/manual/gh_pr

## In this PR

- [`README.md`](./README.md) — continuation and merge procedure.
- [`goals.md`](./goals.md) — sanitized goal record.
- [`decisions.md`](./decisions.md) — implementation decisions and conflict rules.
- [`roadmap.md`](./roadmap.md) — remaining phases.
- [`errors.md`](./errors.md) — sanitized failure log and remaining risks.
- `.opencode/skills/github-operations/references/pr-continuation.md` — the
  GitHub sub-skill for the next agent.
- `.opencode/skills/kubernetes-rancher-operations/` — the reusable skill.
- `scripts/opencode-paths.sh` — shared config-directory resolver.
- `scripts/deploy-skills.sh` — global skill deployment.

## Local-only artifacts

These are not published and may contain private infrastructure details:

- Raw goal store:
  `${XDG_DATA_HOME:-$HOME/.local/share}/opencode-goal-plugin/goals.json`
- Cluster audit directory, if present on the operator machine. It is outside
  this repository and is deliberately not copied into the PR.

Do not publish the raw goal store or cluster audit artifacts. Use the sanitized
files in this directory instead.

## Verification commands

```bash
./scripts/health-check.sh
bash -n scripts/*.sh
python3 -m py_compile scripts/*.py
git diff --check
```

There is no CI configuration in the repository; these checks were run locally.
