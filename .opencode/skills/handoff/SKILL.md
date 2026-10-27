---
name: handoff
description: Refresh the HANDOFF.md in the current working directory so a new OpenCode v2 session can continue safely. Use when the user asks to update the handoff, finish a session handoff, preserve live state, or carry cluster/backup work into a fresh chat.
metadata:
  schema-version: "1"
  category: "maintenance"
  tags: "handoff,session,continuity,verification,planning"
---

# Handoff

Keep a single, current handoff document in the directory where the work lives.
Preserve the existing prompt and live-state structure; update only the generated
state, blockers, and next steps.

## Source of truth

Work in the directory the user names. Use:

- `HANDOFF.md` in the current working directory
- `plan.md` in the current working directory for cluster or backup work
- `REPORT.md`, `findings.csv`, `inventory.json`, and evidence in the same
  directory when the task is a cluster assessment
- `AGENTS.md` and `README.md` only when they exist in the current directory
- the current git branch, status, and recent commits only when the directory is
  a git repository

Do not assume another repository is the working directory. Do not edit deployed
copies under `~/.config/opencode/`.

## Workflow

1. Run `pwd` and list the current directory. Read the handoff and plan/report
   files that actually exist there.
2. Inspect the branch, latest commits, `git status --short`, changed sources,
   and checks already run when the directory is a git repository.
3. Run the local health check only if the current directory provides one.
4. Update `HANDOFF.md` with:
   - the copy-paste prompt (preserve it);
   - live state: working directory, cluster or project state, backups,
     verification results, blockers;
   - Work In Progress: current task, completed work, blockers, and concrete
     next steps.
5. Update `plan.md` in the same directory only when the plan changed.
6. Replace stale contradictions rather than appending a second version.
7. Run `git diff --check` if this is a git repository.
8. Report the exact pass/fail result and remaining blockers.

## Handoff content rules

- **Prompt:** keep the paste-ready block intact, with paths relative to the
  actual working directory.
- **Live state:** record facts, not intentions. Say "connected" only when a
  check shows it; say "passes" only when the command passes.
- **Work In Progress:** record the active task, completed work, open blockers,
  and the next concrete command. Do not claim a scheduled job succeeded until a
  run completed.
- **Backups:** distinguish "schedule fixed" from "backup verified." A stale
  backup is a blocker.
- **Cluster work:** do not imply remediation was performed. Link the plan and
  evidence in the current directory.

## Safety

- Preserve unrelated dirty work.
- Never include credentials, tokens, kubeconfig contents, private keys, or
  payment data.
- Keep commit and push approvals separate.
- Do not modify deployed runtime copies.
