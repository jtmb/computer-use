---
{
  "version": 1,
  "owner": "opencode-memory",
  "id": "coordination-workflow",
  "scope": "repo",
  "title": "Background-agent model preferences",
  "tags": [
    "agents",
    "delegation",
    "models",
    "workflow"
  ],
  "kind": "preference",
  "updated": "2026-10-28",
  "verified": "2026-10-28",
  "sources": [
    "User model/delegation preferences, 2026-10-28",
    "User request to remember DeepSeek availability, 2026-10-28; verified with the runtime models tool",
    "AGENTS.md#goal-progress-and-backlog",
    ".opencode/skills/agent-orchestration/SKILL.md"
  ]
}
---

When delegation is explicitly authorized, use GPT-6 Luna at xhigh effort for implementation by default. Partition independent work among up to 10 background agents, subject to actual runtime admission limits and non-overlapping ownership; do not create agents just to fill the cap.

If Luna workers are not sufficient for a task, use Sol at medium or high effort as appropriate to the task's difficulty. Discover the actual available model IDs and variants before launch rather than guessing them.

DeepSeek is also available for delegated work. Verified on 2026-10-28: `deepseek/deepseek-flash` (DeepSeek V4.1 Flash 1017) and `deepseek/deepseek-v4-pro` (DeepSeek V4 Pro), each with `none`, `low`, `high`, and `max` variants. No DeepSeek-specific effort preference was specified; choose for the task and recheck availability before launch. This adds options without replacing the Luna default.

Use ordinary parent-owned background subagents, not a dedicated independent reviewer/worker-chat ceremony. The parent coordinates, independently verifies results, and alone manages goals. Successor handoff remains a separate mechanism.

This records model/workflow preferences, not standing permission for future sessions or deployments. Preserve separate commit, push, publication, deployment/activation, and security-change approval gates.
