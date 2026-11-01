---
{
  "version": 1,
  "owner": "opencode-memory",
  "id": "agent-inbox",
  "scope": "repo",
  "title": "Remove the custom agent inbox",
  "tags": [
    "agents",
    "coordination",
    "decisions",
    "inbox",
    "removal"
  ],
  "kind": "decision",
  "updated": "2026-10-31",
  "verified": "2026-10-30",
  "sources": [
    "docs/session-consolidation-2026-10-29.md#approved-implementation-continuation--2026-10-30",
    "docs/deployments/2026-10-29-goal-plugin.md"
  ]
}
---

Current decision — 2026-10-30: remove the custom agent inbox/mailbox feature, including its UI, delivery/settings exposure, automatic injection and mandatory inbox reads. Use native child-completion notifications for delegated results; do not substitute peer traffic in the human prompt queue. Preserve already stored message history inert unless its deletion is separately authorized.

Rationale: inbox traffic and repeated reads are unwanted; durable choices must instead be recalled through source-linked repository decision memory.

Supersedes: the earlier agreement removed automatic injection/polling and peer prompt-queue traffic but retained the optional mailbox feature/history. The later explicit removal request replaces feature retention, not historical-data preservation.

Implementation distinction: this is the authorized decision, not evidence that source removal, loaded-runtime removal or operational acceptance has finished. The source records own current implementation evidence. This note grants no deployment, restart, deletion, permission, goal-resumption or publication authority.
