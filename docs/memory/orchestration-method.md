---
{
  "version": 1,
  "owner": "opencode-memory",
  "id": "orchestration-method",
  "scope": "repo",
  "title": "Parallel DeepSeek everyday-use verification",
  "tags": [
    "agents",
    "decisions",
    "delegation",
    "models",
    "orchestration"
  ],
  "kind": "decision",
  "updated": "2026-11-02",
  "verified": "2026-11-02",
  "sources": [
    "docs/session-consolidation-2026-10-29.md#resumed-everyday-use-work--2026-11-02",
    ".opencode/skills/agent-orchestration/SKILL.md#orchestration-method"
  ]
}
---

Current decision — 2026-11-02: the user explicitly requests resolving memory/build blockers and everyday-use items 1–10 using DeepSeek Flash agents in parallel, then invokes /resume_goal. Use bounded, disjoint background children; reuse returned relevant workers after checking ownership. The parent alone plans goals, integrates changes and independently verifies outcomes. Start conservatively when runtime capacity is unknown; serialize heavy checks as required.

Supersession/history: this direct request supersedes the earlier parent-only/no-subagent restriction in revision 8f48219e. The earlier no-further-tests restriction was already superseded by “you verify”; necessary verification remains required. Accepted work and historical failures remain evidence, not instructions to repeat unchanged checks.

The selector requirement remains Solo / Background subagents / Foreground subagent, explicit per chat without composer redesign. This note does not prove a saved selector setting, change unrelated chats or grant goal-resumption authority.

“Kill blockers” means resolve obstacles, not kill unrelated processes, weaken guards, omit inputs or fabricate success. Keep private/reserved work disjoint. Native child completion is the result route; no mandatory inbox reads or peer prompt-queue traffic. Installation, deployment, activation, security, archive/private/callback/demo actions, deletion, publication, commit and push retain separate applicable gates.
