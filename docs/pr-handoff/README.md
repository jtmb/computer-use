# PR #4 Agent Handoff

Use this bundle when you are the agent continuing or merging PR #4.

## Start here

1. Read [`goals.md`](./goals.md) for the goals that produced this PR.
2. Read [`decisions.md`](./decisions.md) for implementation choices and constraints.
3. Read [`roadmap.md`](./roadmap.md) for remaining work.
4. Read [`artifacts.md`](./artifacts.md) for canonical links and local-only artifacts.
5. Read [`errors.md`](./errors.md) for failures already diagnosed and remaining risks.
6. Read the PR continuation sub-skill:
   `.opencode/skills/github-operations/references/pr-continuation.md`.

## Current state

- PR: https://github.com/jtmb/computer-use/pull/4
- Branch: `feat/kubernetes-rancher-operations`
- Base: `main` (`b47765e` when this bundle was written)
- Scope: Kubernetes/Rancher skill, portable skill deployment, task-memory replacement, health-check fixes, and Debian/Fedora path handling.
- The PR intentionally excludes the email-management and browser commits from closed PR #2.

## Merge rules

- Prefer a merge commit to preserve the logical commits.
- Do not force-push the PR branch.
- Do not add unrelated commits to the PR.
- Ask for explicit approval before merging, pushing, publishing, or changing repository settings.
- If `main` advanced, merge `origin/main` into the branch and resolve conflicts using
  [`roadmap.md`](./roadmap.md) and [`decisions.md`](./decisions.md).

## Verify before merge

```bash
./scripts/health-check.sh
bash -n scripts/*.sh
python3 -m py_compile scripts/*.py
git diff --check
```

After merge, deploy and verify:

```bash
./scripts/deploy-global-config.sh --apply
./scripts/health-check.sh
```

Restart the OpenCode service if skill discovery does not refresh.
