# Handoff identity acceptance fixtures

**Evidence level: isolated source-level behavior only. This is not full live model/TUI continuation evidence.**

The fixtures in `.opencode/plugins/goal-docs/handoff-identity-acceptance.test.ts` run the actual `readGoalStateForSession` adapter, `exportGoalState` exporter, and `handoffPrompt` renderer. Only their external boundaries are fixture-backed: package/state bytes, session lookup, permission assertion, repository metadata, and a captured writer sink. No production goal-state path or live writer is used.

The cases verify:

- A matching source session and goal retain their repository/worktree/scope identity, plan, history, and explicit `/handoff_resume` name.
- A validated source state with no source goal, and an absent state file, are reported as missing. A goal found only under another session is not substituted; a mismatched embedded session ID is rejected.
- Inaccessible source state and inaccessible or mismatched source sessions fail closed before writing.
- A paused goal stays paused. Archived `complete`, `unmet`, and `cancelled` goals retain their exact status and `closedAt`, even when the source session also has a different active current goal.
- Rendered handoff context retains the source `## Plan` and `## Historical documentation` material.

These tests do **not** call `coordinateHandoff`, create or prompt a session, read or mutate runtime goal state, invoke a model or TUI, use the retained destination, or prove a live `/handoff_resume` continuation. The write sink is captured in memory, so these fixtures do not verify disk persistence or GUI behavior either.

## Reproduce

Run only these isolated fixtures:

```bash
node --test .opencode/plugins/goal-docs/handoff-identity-acceptance.test.ts
```

The broader goal-docs source suite can be run with:

```bash
node --test .opencode/plugins/goal-docs/*.test.ts
```

## Remaining live acceptance

Live model/TUI continuation remains unverified and requires separate explicit authority for the exact retained destination and continuation. Before that test, independently select and verify the source repository/worktree, source session ID, source goal ID, exported status, revision, and the consistent `HANDOFF.md`, `snapshot.json`, `plan.md`, and historical context. Do not use the invoking session's unrelated goal as a substitute. For overlapping edits, read-only live checks must establish that the exact source session and all relevant workers are inactive with complete, untruncated coverage. Then, only under that authority, a live acceptance must observe the explicit `/handoff_resume` flow, source identity and context, and preservation of paused/closed state without goal creation, rebinding, activation, or unrelated-session substitution. These fixtures are not evidence for any of those live outcomes.
