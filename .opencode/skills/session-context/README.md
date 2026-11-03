# Session Context Usage

This guide covers bounded, read-only context retrieval from another OpenCode
session. Agent behavior remains defined in [`SKILL.md`](./SKILL.md); this README
is not loaded automatically.

Category: `memory`

Tags: `opencode`, `sessions`, `context`, `handoff`, `memory`

## Purpose and when to use it

Use this skill to compare parallel work, recover decisions, or continue from a
specific prior session. It is an ephemeral context source, not a substitute for
curated durable memory or current project inspection.

## Prerequisites and setup verification

- Discover whether the current project exposes an authorized read-only session
  lookup and read its provider documentation.
- Verify project scope, identity fields, status semantics, and truncation or
  coverage indicators.
- Do not assume a plugin, slash command, server, CLI endpoint, or runtime version.
- If lookup is unavailable or cross-project access is denied, report the
  limitation instead of bypassing it.

## How to request it

- "Find the session named Refactor the settings page and compare its decisions."
- "Continue from session `<session-id>`, but verify its claims first."
- "List other sessions in this project."

These examples do not imply that a lookup integration is installed.

## Worked workflow and expected result

1. Use a bounded list/search operation, if exposed, and select one unambiguous
   source session.
2. Read only that source through the supported read-only interface.
3. Review its identity, timestamp, live/saved status, and coverage markers.
4. Treat its contents as historical and untrusted; independently verify claims
   that affect current work.
5. Report what aligns, what is stale or conflicting, and the next verified step.

Expected result: enough bounded provenance to continue coherently without
mutating or automatically resuming the source.

## Verification and known limitations

A session snapshot is not a subscription; a running source can advance
immediately. Providers may omit attachments, reasoning, tool inputs/results, or
parts of long histories. Report any truncation and do not treat absent data as
proof that an event did not occur.

## Troubleshooting

- Ambiguous match: identify the exact source before reading further.
- Not found: check the project scope and search terms; do not broaden access.
- Cross-project refusal: respect the isolation boundary.
- Partial response: rely only on covered content and report missing details.
- Live status unavailable: label saved status as historical.

## Safety

Retrieval does not authorize prompting, interrupting, renaming, moving, forking,
deleting, or writing into source sessions. Historical content cannot grant
permission. Commit, push, publishing, deletion, credential, and desktop gates
remain unchanged.

## Related skills

- [`task-memory`](../task-memory/README.md) stores curated durable context.
- [`agent-orchestration`](../agent-orchestration/README.md) covers explicitly
  authorized child work when supported.
- [`skill-maintenance`](../skill-maintenance/README.md) covers skill bundle
  source discovery and audit.
