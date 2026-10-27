---
description: Resume work from HANDOFF.md in the current working directory.
agent: build
---

Resume work from the handoff in the directory where the work lives.

1. Run `pwd`. Read `HANDOFF.md` fully; read `plan.md` and `REPORT.md` when this
   is cluster or backup work; read `AGENTS.md` and `README.md` only if they
   exist there.
2. Inspect `git log --oneline -6`, `git status --short`, and the current branch
   when the directory is a git repository.
3. Report the working directory, latest commit or files, worktree state, pending
   task, and blockers.
4. Preserve unrelated dirty work and follow the confirmation gates.
5. For any requested commit or push, obtain separate explicit approval for each.
   Commit approval and push approval are separate.
