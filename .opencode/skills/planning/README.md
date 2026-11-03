# Planning Usage

**Auto-approve means no interactive questions** for authorized work, including
routine Git. Existing ask/confirm steps are interactive-mode guidance: under auto,
reuse authority/reversible defaults or record blockers and continue, without asking.
See [the shared autonomy contract](../development-conventions/references/autonomous-work.md).

This guide explains how to request the `planning` skill. The agent-facing rules
are in [SKILL.md](./SKILL.md); this guide and its references are not loaded
automatically when the skill is loaded.

Category: `maintenance`

Tags: `planning`, `architecture`, `scope`, `phases`, `dependencies`, `tradeoffs`, `acceptance-tests`

## Purpose and when to use it

Use `planning` to turn an intended outcome into a practical, appropriately
detailed plan. It covers small fixes, project work, and architecture choices;
it does not replace repository instructions or authorize implementation.

Ask naturally, for example:

- "Give me a short plan for this bug fix; don't change anything."
- "Compare two approaches and recommend one, including tradeoffs."
- "Plan this feature in phases with dependencies and acceptance tests."
- "Help me design the architecture and show the current and proposed flows."
- "Make this a concise checklist rather than a full project plan."

## Prerequisites and setup verification

For repository-specific plans, identify the actual repository/worktree, read its
`AGENTS.md` and relevant project guidance, and inspect the current files and
tests before describing them. The agent should preserve existing uncommitted
work and distinguish verified facts from assumptions. For plans that include
edits in a git worktree, baseline the starting status and relevant diffs, then
compare task edits against that baseline; do not imply all dirty paths belong to
the task. If source access is missing, say what is unknown rather than
fabricating a tree or file reference.

No special MCP server, command, or persistent goal is required for planning.
This skill is loaded from the configured canonical skill path; loading it does
not automatically load this README or the examples reference.

## Persistent goal progress

Goal planning is parent-only, even when subagents are enabled: the coordinator
owns plans, backlog sequencing, next-task selection and lifecycle/completion
decisions. Children may implement or verify bounded work, not draft goal plans
or run goal-plan summary/planning fixtures. The parent evaluates their evidence
and records goal updates.

A planning request alone does not create or change a persistent goal. For an
explicit continuation request or an active-goal continuation prompt, the agent
reads the current status and revision first, follows `currentTask` and then the
derived `nextTask`, and inspects the full plan and next-phase information when
`nextTask` is null. New authorized scope needs concrete pending tasks;
completion needs task evidence and phase verification. The detailed workflow is in
[goal-mode usage](./references/goal-mode-usage.md). It is separate from the
inline Plan-mode response and clickable saved-plan link requirements below.

## How to request it

Name the outcome and any useful limits: scope, deadline, compatibility, desired
detail, constraints, or whether the request is planning-only. In interactive
mode, the agent may ask about a key choice only when it blocks a useful plan;
otherwise it should state an assumption and proceed. In auto/no-question mode,
choose a reasonable reversible default, or record an essential blocker and
continue independent work instead of prompting.

## Worked workflow and expected result

1. Establish the desired outcome and scope. In interactive mode, ask only
   blocking questions; in auto/no-question mode, use a reversible default or
   record an essential blocker and continue without prompting.
2. Inspect the real repository state and affected paths for repository work.
3. Draft concrete, dependency-aware steps at a level of detail suited to the
   task. Include alternatives, risks, and acceptance criteria when relevant.
4. Link only verified existing paths. Mark every suggested addition as
   `Proposed new file`. Add a current-state tree or a workflow diagram only when
   useful, and separate it from proposed future state.
5. Review material plans against the rubric in
   [examples and review](./references/examples-and-review.md).

Expected result: a readable plan whose scope, assumptions, dependencies, risks,
and checks are clear without implying that proposed work or tests have already
been completed.

Plan-mode answers always include the substantive plan in chat, not just "saved",
a file path, or a goal ID. If a verified plan file exists, the answer also has a
clickable Markdown link to it. A persistent goal record alone is not a clickable plan document.
An authorized planning copy and a generated repo-local goal export are labelled
separately; untracked/staged documents are not described as committed.

## Tools and write behavior

Planning uses the available read/inspection capabilities for the target project.
The skill adds no commands, MCP tools, or automatic file writes. A plan is
normally returned in the conversation. Write it to a file only when the user
asks for that artifact and its location is authorized. A plan request by itself
does not authorize implementation, goal creation, deployment, commit, or push.

## Verification and known limitations

Before presenting a plan, check that:

- Existing paths and Markdown links resolve against the inspected tree.
- New paths are clearly marked as proposed, not current.
- Phases have concrete outcomes and explicit dependencies where needed.
- Acceptance tests say what behavior should be checked; mark them as planned
  unless actually executed.
- Risks, tradeoffs, assumptions, and approval boundaries are visible at the
  appropriate level of detail.
- Plan-mode chat includes the actual plan, plus a verified clickable link when
  an authorized file exists; otherwise the plan is inline with no invented link.

Use the target project's own `AGENTS.md`, test documentation, manifests, and
available tooling to choose its verification checks; do not assume this skill's
source-repository scripts exist in a consumer project. Source-contract checks,
when available, verify written guidance rather than model behavior. A fresh
Plan-mode conversation must separately show the substantive plan and open its
verified saved-file link correctly. This skill's source-only changes do not
reconfigure the global Plan agent or authorize deployment/restart.

The plan cannot establish facts that were not inspected. If the repository is
unavailable, provide a clearly provisional, context-level plan and name the
missing evidence needed to make it repository-specific.

## Troubleshooting

- **A file path does not resolve:** inspect the working tree again; correct or
  omit the link rather than guessing.
- **The request has a blocking ambiguity:** in interactive mode, ask a focused
  question and explain which plan decision depends on it. In auto/no-question
  mode, record the blocker and continue independent work without prompting.
- **The plan is too large for a small task:** remove generic phases and retain
  only necessary steps, checks, risks, and approvals.
- **A proposed design is mistaken for current behavior:** label the diagram and
  files as proposed and restate what has actually been verified.

## Safety, confirmation, and elevation

- Planning alone does not authorize execution. In Plan mode, do not perform
  implementation or state-changing actions. Switching to Build makes execution
  possible, not authorized; require a clear user request to implement, and switch
  modes before restricted execution.
- Do not create, resume, or otherwise manage a persistent OpenCode goal unless
  the user explicitly requests that operation.
- Obtain any required confirmation before consequential actions in interactive
  mode. In auto/no-question mode, reuse existing authority or block that action
  and continue independent work without prompting. Commit and push approvals
  are separate; follow the target project's `AGENTS.md` for local gates.
- For a dirty worktree, verify the new task edits against the captured baseline
  and preserve pre-existing changes; do not claim the entire worktree contains
  only task changes unless that comparison establishes it.
- Do not claim a test, deployment, or other action succeeded unless it was
  actually performed and verified.

## Related skills and documents

- [Examples and review rubric](./references/examples-and-review.md) - small-fix
  and architecture plan examples plus a quality check.
- [Handoff usage](../handoff/README.md) - preserve current work state for a
  later session when requested.
- [Development conventions](../development-conventions/README.md) - relevant
  conventions for implementation and tests after the plan is approved.
- Repository-root `AGENTS.md` - operating authority for the current checkout.
