# Handoff Usage

This guide explains how to use the `handoff` skill. The agent-facing rules are
in [SKILL.md](./SKILL.md).

Category: `maintenance`

Tags: `handoff`, `session`, `continuity`, `verification`, `planning`

## Purpose and when to use it

Use `handoff` when a session needs to be resumed in a fresh OpenCode v2 chat, or
when the current work directory's live state and Work In Progress need a
current, verified record.

Appropriate requests include:

- "Refresh the repository handoff."
- "Finish the handoff so a new session can continue."
- "Update HANDOFF.md with the current branch, health check, and blockers."
- "Save the cluster and backup plan to plan.md."

Do not use it to commit, push, deploy, or repair the environment. Those are
separate actions with their own approval gates.

## Prerequisites and verification

Before writing, in the current working directory:

1. Run `pwd` and list the directory.
2. Read `HANDOFF.md`, and `plan.md`/`REPORT.md` when this is cluster work.
3. Inspect `git branch --show-current`, `git log --oneline -6`,
   `git status --short`, and the current diff when this is a git repository.
4. Run the local health check only if the directory has one.
5. Confirm no credentials or deployed runtime files are being edited.

## What the skill writes

- `HANDOFF.md` in the current working directory.
- `plan.md` in the same directory only when the plan changed.

It does not write `~/.config/opencode/`, does not deploy skills, and does not
commit or push.

## Verification after writing

```bash
git diff --check   # only in a git repository
git status --short
```

Report the working directory, branch or files, health result, blockers, and next
command.
