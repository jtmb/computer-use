# Task-aware handoff and automatic rotation

## Scope

Implement only the handoff mechanism's worker naming, automatic rotation policy,
operator controls, and tests. The originating chat remains the reviewer.

- Non-reviewer titles: `<current task> — Goal handoff <hash>`, retaining the
  handoff identity while updating the task description.
- Use an independent new chat, not a child/subagent, for a real handoff test.
- Automatically request a source-authored handoff at major goal milestones or
  around 500,000 current-context tokens, before compaction when supported.
- Expose an operator control through **Ctrl+P settings** to disable automatic
  handoff. When disabled, leave native compaction enabled and continue in the
  same chat. Manual `/handoff` remains available.
- Exclude reviewer chats, deduplicate triggers, avoid historical milestone
  replay/rotation loops, and preserve goal status, limits and approvals.
- Discover actual context metrics and pre-compaction hooks. Never equate
  cumulative lifetime usage with current context or invent a hard interception
  guarantee. Document unsupported runtime capabilities explicitly.

## Current source

The simplified `/handoff` in `.opencode/plugins/goal-docs/tui.ts` steers the
current model using `source-handoff.ts`. The source composes a continuation
prompt with a document link/path and sends it to one new independent chat with
`delivery:steer,resume:true`. Legacy goal-transfer RPCs remain separate.

Baseline: 82 goal-docs tests and strict installed SDK 2.1.1 typechecking passed.
See [the simplification audit](../handoff-simplification-audit.md) and
[plugin documentation](../../.opencode/plugins/goal-docs/README.md).

## Ownership and approvals

The mistakenly launched child was cancelled before this independent handoff.
The child session reports interrupted; project-scoped shell/PTY checks found
no child-owned active commands or PTYs. Do not infer unrelated peers stopped.
Inspect inherited dirty files before edits. Own only bounded goal-docs handoff
sources, scoped tests and related documentation; preserve all other work.

No commit, push, deployed-copy edits, shared-service restart, security changes,
computer-use p9 edits, or old-goal resume is authorized by this handoff.

## Next action and acceptance

Inspect the actual stock-v2 hooks and settings extension surfaces, implement the
bounded policy and Ctrl+P control, test source-chat delivery and disabled-mode
native compaction behavior, then report evidence and limitations to the reviewer.
Tests must distinguish source wiring from real receiver processing. This file
records requirements, not completed implementation or live acceptance.

## Implementation checkpoint — 2026-10-27

The independent worker read this file and began processing; its reviewer ACK was
admitted as `msg_handoff_auto_independent_ack_20261027`. Source now contains worker
task/hash naming, normal-context one-shot source requests and a per-chat Ctrl+P
**Handoff settings** selector. OFF leaves native compaction and manual `/handoff`
unchanged. This is not a native Open settings-page extension or pre-compaction
interceptor; those inspected stock-v2 surfaces are unavailable.

See [acceptance and bounded test-quality audit](acceptance.md) for the exact live
receipt versus fixture evidence, verification results and remaining limitations.
No runtime deployment or old-goal activation was performed. Reviewer acceptance
and any separately authorized live policy/UI exercise remain separate next steps.
