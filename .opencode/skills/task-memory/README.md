# Task Memory Usage

This guide explains how to use the `task-memory` skill. The agent-facing rules
remain in [SKILL.md](./SKILL.md); OpenCode does not load this guide
automatically.

Category: `memory`

Tags: `memory`, `preferences`, `decisions`, `pending`

## Purpose and when to use it

Use `task-memory` to preserve durable context across sessions in a local
Markdown store. It replaces Basic Memory and needs no MCP server or database.

Appropriate requests:

- "Remember that I prefer direct automation with verification."
- "What did we decide about screenshots?"
- "Continue where we left off yesterday."
- "Forget that outdated hardware fact."
- "Show pending work that still has a concrete next step."

Do not use memory instead of inspecting current system, project, or application
state.

## Prerequisites

- The store lives at
  `${XDG_DATA_HOME:-$HOME/.local/share}/opencode/task-memory/`.
- The account running OpenCode must be able to create and write that directory.
- `rg` (ripgrep) should be available for search; `find` is enough to list notes.

Verify read-only:

```bash
root="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/task-memory"
ls -ld "$root" 2>/dev/null || echo "store not created yet"
find "$root" -name '*.md' 2>/dev/null | head
```

## How to request it

Ask in ordinary language; no tool names or paths are required.

- "Remember this durable preference."
- "Search memory for microphone setup."
- "List pending items."
- "Remove the obsolete note about the old printer."

The agent should search narrowly and read only the matching note.

## Worked workflow

Write:

1. Decide whether the fact is durable and appropriate.
2. Confirm before recording personal facts or decisions.
3. Choose the directory and a lowercase hyphenated filename.
4. Create the directory with mode `700`, write the note with `title`, `type`,
   `tags`, and `updated`, then set the note to mode `600`.
5. Read it back and confirm a distinctive search term finds it.

Read:

1. List recent notes or search with `rg -il`.
2. Read the best match once identified.
3. Follow `[[slug]]` links only when the task needs broader context.

## Note types and directories

- `preferences/` - explicit durable user choices.
- `systems/` - verified hardware, OS, or application facts.
- `workflows/` - tested procedures that succeeded on this machine.
- `decisions/` - user-approved implementation or policy choices.
- `pending/` - unfinished work with a concrete next step.

### Example note

```markdown
---
title: End-of-run summaries
type: preference
tags: [preferences, reporting]
updated: 2026-10-28
---

Append a compact summary (maximum 15 lines) after every goal run, phase,
consolidation, or compaction, in addition to the technical report.
```

## Verification and limitations

- Search is literal or regex, not semantic. Try several distinctive terms.
- `rg` is preferred; `grep -Ril` works as a fallback.
- There is no automatic indexing or sync; notes are plain files.
- Notes have no expiry. Replace stale notes instead of leaving contradictions.
- Writes apply directly; confirmation is the guardrail.
- Basic Memory and the legacy JSON store are retired and must not be recreated.

## Troubleshooting

- Store missing: create it with mode `700` when the first note is written.
- Search finds nothing: try broader terms or list recent files.
- Wrong note: read it first; then edit or replace it.
- Permission denied: confirm ownership and mode on the store, and do not
  broaden permissions beyond the user.

## Safety and confirmation

Never store:

- Passwords or passphrases.
- API keys or access tokens.
- Private keys.
- Payment details.
- MFA codes.
- Dictated private content.
- Whole chats or unrelated personal details.

Ask before deleting a note, and before recording sensitive personal context
even when it is not on the forbidden list.

## Related skills and documents

- [`session-context`](../session-context/README.md) retrieves read-only context
  from another session.
- [`handoff`](../handoff/README.md) records live work state for the next
  session.
- The catalog entry is in [`skills/README.md`](../README.md).
