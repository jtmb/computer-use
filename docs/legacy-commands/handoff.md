---
description: Update HANDOFF.md in the current working directory with the current v2 session state.
agent: build
---

Refresh the session handoff in the directory where the work lives.

1. Run `pwd` and list the current directory. Read `HANDOFF.md` fully; read
   `plan.md` and `REPORT.md` when this is cluster or backup work; read
   `AGENTS.md` and `README.md` only if they exist there.
2. Inspect the branch, recent commits, `git status --short`, changed sources,
   and checks already run when the directory is a git repository.
3. Call `get_goal` with `view: full` for the objective, plan (phases, tasks, and
   completion criteria), decisions, and status. Call `get_goal_history` for the
   goal lifecycle history and recent checkpoints. The OpenCode goal is the
   preferred source for the handoff plan and historical documentation. If no
   goal exists, use the existing `plan.md` in the working directory for the
   plan, and `git log` plus `git status` as the historical record.
4. Always include both a `## Plan` section and a `## Historical documentation`
   section in the generated `HANDOFF.md`. Populate them from the sources above;
   if a fallback source is missing, keep the section and state that fact rather
   than inventing content. Also update live state with the active work, exact
   verification status, blockers, and concrete next steps. Preserve the
   handoff prompt and replace stale contradictions.
5. Update `plan.md` in the same directory only when the plan changed.
6. Run `git diff --check` when this is a git repository. Do not commit, push, or
   edit deployed copies. If the user later requests a commit or push, obtain
   separate explicit approval for each.
