---
name: goal-usage
description: Use OpenCode goals correctly, including when a token budget, duration limit or auto-continue cap may be set. Use when creating, resuming, replacing, pausing, closing or budgeting a goal, when a goal reports budgetLimited, or when the user asks about goal limits.
metadata:
  schema-version: "1"
  category: "maintenance"
  tags: "goals,budget,limits,continuation,lifecycle"
---

# Goal Usage

## Auto-approve and autonomous work

In Build auto, project auto-approve or explicit no-question work, do not ask
routine clarifying or preference questions. Reuse existing authority or record a
blocker and continue. Read
[the shared autonomy contract](../development-conventions/references/autonomous-work.md).

## The budget rule

**Set a token budget only when the user states one.**

- No budget is the default. A goal created from an approved plan, a task
  request, or a "make this a goal" instruction gets **no** `token_budget`.
- Never infer a budget from plan size, phase count, estimated effort, a previous
  goal's budget, or the desire to "be safe".
- Do not copy a budget forward when replacing or re-creating a goal. Budgets are
  per-goal and expire with the goal that carried them.
- The same restraint applies to `max_duration_seconds` and `max_auto_turns`:
  omit them unless the user specifies a limit.
- If you believe a limit would help, say so once and let the user decide. Do not
  apply it speculatively.

### Why

Goal accounting is cumulative and dominated by context cost, not by work
completed. A budget can therefore be exhausted by a few long turns while almost
none of the planned work has been done. A budget the user did not ask for turns a
healthy goal into a blocked one, and each artificial stop costs a replace-and-
re-plan cycle that is more expensive than the limit was meant to save.

### Recognising and handling `budgetLimited`

A `budgetLimited` goal may not continue. Do not call `update_goal_status` to force
it back to active, and do not keep working as if it were active.

1. Stop starting new substantive work.
2. Summarise verified progress, remaining scope and the concrete blocker.
3. Tell the user the goal is `budgetLimited` and that resumption needs their
   explicit instruction.
4. If they ask to remove or raise the budget, replace the goal with no
   `token_budget` (or the figure they name) and re-attach the plan, carrying
   completed phases and their evidence forward.

## Creating a goal

1. Confirm the user actually asked for a goal. A plan request, a roadmap, or an
   implementation task is not a goal request.
2. Write the objective as a concrete outcome, not a task list.
3. Call the goal tool **without** budget parameters unless the user named them.
4. Persist the plan with `update_goal_plan` before implementation, using the
   returned `goal_id` and `planRevision`.
5. Keep completion criteria immutable. A current task never replaces the goal.

## Progress, evidence and lifecycle

- **Goal planning is parent-only.** The main coordinator owns plans, backlog
  sequencing, next-task selection and completion decisions. Subagents do bounded
  implementation and verification, never plan drafting or lifecycle updates.
- Record task evidence before marking a task complete, and phase verification
  before completing a phase. Cite commands actually run, counts actually
  observed, and paths actually inspected.
- Preserve completed work unless concrete evidence warrants reopening it.
- Close as `complete` only with verified evidence; close as `unmet` only with a
  concrete blocker. A pause, an interruption, or a context boundary is neither.
- Do not reopen, mutate or clear another session's goal. Cross-session work is a
  read-only import plus, when the user asks for it, a queued message.

## Keep the session name aligned with meaningful goal changes

After a **successful goal mutation**, evaluate the resulting goal and the current
session name in the same turn. If the name no longer describes the current work,
update it using the consumer's exposed, supported session-rename tool. A configured
hook or an attempted rename is not proof that the name changed; check the result.
Do not leave a stale title merely because another automation is expected to fix it.

- `create_goal`, `set_goal`, `replace_goal`, `update_goal_objective`: refresh for a
  genuinely new or changed objective, not a reused/conflicting/no-op result.
- `update_goal_plan`: refresh when the current phase/task, meaningful focus or
  milestone changes, not for evidence, wording or plan-revision bookkeeping alone.
- `update_goal`, `update_goal_status`, `stop_goal`, `clear_goal`: refresh when the
  actual lifecycle/attachment change makes the name misleading; never imply work
  is complete just because a goal paused, stopped or was cleared.
- `get_goal`, `get_goal_history`, `list_all_goals`: **no rename for the read**.
  Failed, refused, cancelled or malformed mutation results do not trigger one.

Use a short semantic subject/outcome, not a tool name or copied objective prefix.
Keep an already accurate name; coalesce related mutations into one update for the
latest state. Follow the consumer's naming style and preserve a known user-chosen
custom name unless the user authorizes goal-driven renaming. Rename only the
current session, not peers/children found in goal history. Do not create or resume
a goal, trigger extra model generation, change settings or restart a service just
to name the chat. An explicitly requested direct rename does not prove automatic
hook loading or atomic manual-title protection; never weaken a guarded publisher
or invent conditional-rename support to hide that limitation.

## Verification

Success means the goal's objective and completion criteria match what the user
asked for, the plan reflects real progress and honest blockers, no budget exists
that the user did not request, and the user knows the exact next action whenever
the goal is paused or limited.

## Usage guide

When the user asks how to use this skill, also read [README.md](./README.md).
