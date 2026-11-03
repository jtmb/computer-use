---
name: planning
description: Create clear, evidence-based plans for tasks, feature work, and architecture changes. Use when the user asks to scope, sequence, compare approaches, or define dependencies and acceptance criteria.
metadata:
  schema-version: "1"
  category: "maintenance"
  tags: "planning,architecture,scope,phases,dependencies,tradeoffs,acceptance-tests"
---

# Planning

Help the user shape work into a clear, usable plan in natural conversation. Match
the level of detail to the task; do not impose a large template on a small fix.

## Auto-approve and autonomous work

For Build auto, project auto-approve or explicitly autonomous/no-question work,
apply this rule to all interactive ask/confirm steps below: Do not ask routine questions,
including Git questions, clarification forms or "continue?" prompts. Use existing
authority and reasonable reversible defaults. If essential authority or data is
missing, record the blocker and continue independent work instead of asking.
Explicitly read [the shared autonomy contract](../development-conventions/references/autonomous-work.md).
Native policy, mode restrictions and task scope remain effective; do not
self-grant permissions or enable autoaccept as a workaround.

## Workflow

1. Identify the desired outcome, audience, constraints, and requested level of
   detail. In interactive mode, ask only when a missing decision blocks a useful
   plan; otherwise state reasonable assumptions. In auto/no-question mode, use
   reversible defaults, or record an essential blocker and continue independent
   work instead of prompting.
2. For repository work, inspect the actual working tree and relevant guidance
   (including `AGENTS.md` when present), then inspect affected source and tests.
   Base file trees, links, workflow descriptions, and diagrams on that evidence.
   Do not infer current structure from a name, an old session, or a proposed
   design. For plans that include implementation in a git worktree, baseline
   `git status --short` and relevant diffs before edits. Preserve unrelated
   changes and compare later task edits against that baseline; do not imply every
   dirty path belongs to the task.
3. Separate observed facts, assumptions, and proposals. Cite line numbers only
   after reading those exact lines. Describe tests as acceptance criteria unless
   they were actually run; never invent command output, test results, or file
   locations.
4. Scale the plan:
   - For a small fix, give the outcome, a few concrete steps, the key check, and
     any material risk or approval gate.
   - For multi-phase or architecture work, identify scope and non-goals,
     alternatives and tradeoffs, ordered phases with concrete dependencies,
     deliverables, risks, and acceptance tests.
5. Link affected files only after verifying they exist. Make Markdown links
   relative to the plan document when they resolve correctly; otherwise use
   repository-root-relative code paths. Keep proposed additions separate and
   label each one `Proposed new file`. Never present a proposed path as an
   existing file.
6. Add a current file tree or workflow/dependency diagram only when it helps.
   A current-state tree or diagram must reflect inspected evidence. Clearly
   distinguish proposed future state from current behavior, and label uncertain
   components as assumptions. Omit diagrams when they would add ceremony rather
   than clarity.
7. Before responding, review a substantial plan with
   [the examples and review rubric](references/examples-and-review.md). Read
   that reference explicitly when preparing a complex plan or when an example
   or rubric would help. It is not loaded automatically.

## Deliver the plan in chat

- Always output the substantive plan in chat in Plan mode. Show the actual
  outcomes, ordered steps, verification and blockers at the requested level of
  detail, not just a goal ID, tool result, file path or "plan saved" message.
- If a plan file exists, also include a clickable Markdown link to that actual
  document. Verify the file exists before linking and use a path that resolves
  from the chat's current directory; an absolute local path avoids ambiguity.
  Prefer a verified repo-local goal plan over an older planning copy. Label a
  planning copy separately from a generated goal export.
- If no authorized plan file exists, show the plan inline and say that no file
  was written. Do not create a file merely to supply a link; a file artifact
  still requires the user's request and the active mode's allowed location.
- A persistent goal record is not a clickable plan file. Do not claim a repository export exists
  until its actual files and source identity/revision have been checked, or
  claim that untracked/staged files were committed. Keep goal-tool and readable
  plan copies aligned when explicitly authorized to update them; disclose stale
  or deferred copies rather than silently bypassing writer permissions.
- These instructions govern users of this skill; editing its repository source
  does not change the global OpenCode Plan agent. A fresh-session output and
  rendered-link check is separate from source-contract tests.

## Goals, modes, and execution boundaries

- **Goal planning is parent-only.** The main coordinator alone owns goal plans,
  backlog decomposition/prioritization/sequencing, next goal task selection,
  and lifecycle and completion decisions. General delegation authorization does not
  delegate this work, even in parallel or auto mode. Subagents may perform bounded
  implementation and factual verification, not goal planning, plan drafting or
  goal-plan summary/planning fixtures. The parent evaluates their evidence and
  makes all supported goal updates.
- A human-readable plan is not an OpenCode persistent goal. Do not create,
  resume, replace, or otherwise manage a goal unless the user explicitly asks
  for that goal operation. A request to plan work is not such an instruction.
- When a turn explicitly continues or executes an existing goal, or the harness
  supplies an active-goal continuation prompt, first read [the goal-mode
  workflow](references/goal-mode-usage.md); it is not loaded automatically.
  Call `get_goal` before goal work and inspect the live status and
  `planRevision`. Continue work only while the goal is `active`.
- In an active goal, honor `currentTask` before its derived `nextTask`. If
  `nextTask` is null, inspect the full plan and the live tool's next-phase
  information; do not infer that all phases are empty or skip to later-phase
  backlog. Add concrete pending tasks for newly authorized scope before doing
  that work.
- Record evidence before marking a task complete and phase verification before
  completing a phase. Keep blocked work explicit. Preserve the objective,
  immutable completion criteria, and completed work; use supported goal tools,
  never raw storage or edits to derived fields.
- Respect the active agent mode. In Plan mode, do not implement changes, run
  state-changing commands, or use goal operations to bypass the mode. Switching
  to Build makes execution possible, not authorized: implement only after a
  clear user request to implement. If execution is requested while restricted,
  explain that the user must switch to Build mode before acting.
- A planning request alone authorizes planning, not implementation. Do not
  perform planned work unless separately authorized. Keep commit and push as
  separate approvals. Follow the target repository's `AGENTS.md` and required
  consequential-action gates. In interactive mode, ask when required; in
  auto/no-question mode, proceed only with existing authority, otherwise record
  the blocker and continue independent work without prompting.

## Usage guide

When the user asks how to use this skill, also read [README.md](README.md) for
request examples, workflow, verification, and safety boundaries. The guide and
other references are not loaded automatically.
