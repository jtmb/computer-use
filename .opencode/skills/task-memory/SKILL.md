---
name: task-memory
description: Store and retrieve durable user preferences, verified computer facts, workflow decisions, and pending tasks in a local Markdown task-memory store. Use when the user says remember, forget, continue later, what did we decide, or when durable context would prevent repeated setup. Never store credentials or full private conversations.
metadata:
  schema-version: "1"
  category: "memory"
  tags: "memory,preferences,decisions,pending"
---

# Task Memory

Use the local Markdown store. No MCP server, database, or external service is
required.

Root: `${XDG_DATA_HOME:-$HOME/.local/share}/opencode/task-memory/`

Directories: `preferences/`, `systems/`, `workflows/`, `decisions/`,
`pending/`. Create a directory only when the first note needs it.

## Read narrowly

```bash
root="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/task-memory"
find "$root" -name '*.md' 2>/dev/null | head -20
rg -il 'search-term' "$root" 2>/dev/null | head -20
```

Use a literal distinctive term in place of `search-term`. Read the best match,
not the whole store. To find related notes, search for `[[<slug>]]` links. A
note is evidence of a prior preference, not proof of current system state;
re-check live state when it matters.

## Note format

```markdown
---
title: Short human title
type: preference
tags: [preferences, reporting]
updated: 2026-10-28
---

One short paragraph of durable fact or instruction. Link related notes with
[[other-slug]].
```

Use a lowercase hyphenated filename matching the title, for example
`preferences/end-of-run-summaries.md`.

## Write deliberately

- Confirm with the user before recording a personal fact or a durable decision.
- Choose the directory from the note type: preference, system, workflow,
  decision, or pending.
- Create the store and note with owner-only permissions:

```bash
root="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/task-memory"
install -d -m 700 "$root" "$root/preferences"
NOTE="$root/preferences/note.md"
chmod 600 "$NOTE"
```

- Write one short note; do not append unrelated facts to an existing note.
- Correct or replace obsolete facts with `edit`; do not leave contradictions.
- Delete only after an explicit confirmation in the moment, and never delete a
  directory or multiple notes at once.
- Reference related notes by slug so they can be found later.

## Rules

- Never store passwords, API keys, tokens, private keys, payment details, MFA
  codes, dictated private content, or whole chats.
- Do not record guesses as facts. Use `pending` when uncertain.
- Do not silently remember incidental personal details.
- Basic Memory and the legacy JSON store are retired; do not use them.

## Verification

After a write, read the note back and confirm it is found by a search for a
distinctive term. Check that the file mode is `600` and the store directory is
`700`.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md). It is not loaded automatically.
