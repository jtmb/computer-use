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
3. Update the generated live-state and Work In Progress sections with the
   active components, exact verification status, blockers, and concrete next
   steps. Preserve the handoff prompt and replace stale contradictions.
4. Update `plan.md` in the same directory only when the plan changed.
5. Run `git diff --check` when this is a git repository.
6. Do not commit, push, or edit deployed copies. If the user later requests a
   commit or push, obtain separate explicit approval for each.
