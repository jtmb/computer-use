# Goal Usage

**Auto-approve means no interactive questions** for authorized work. Under auto,
reuse existing authority or record a blocker and continue; do not add preference
or confirmation questions on top. See
[the shared autonomy contract](../development-conventions/references/autonomous-work.md).

This guide explains how to use the `goal-usage` skill. The agent-facing rules are
in [SKILL.md](./SKILL.md); this guide is not loaded automatically when the skill is
loaded.

Category: `maintenance`

Tags: `goals`, `budget`, `limits`, `continuation`, `lifecycle`

## Purpose and when to use it

Use `goal-usage` whenever a goal is involved: creating one, persisting a plan,
recording task or phase evidence, replacing or resuming one, closing one, or
explaining why a goal stopped. It also governs the one setting that most often
blocks healthy work: the token budget.

## The rule in one sentence

**Set a token budget only when the user states one.**

No budget is the default for a goal built from a plan, a task request, or an
instruction like "make this a goal". The same restraint applies to
`max_duration_seconds` and `max_auto_turns`.

## Request examples

| Request | Correct behaviour |
| --- | --- |
| "Make a goal from this plan." | Create the goal with **no** budget; persist the plan; start the first phase. |
| "Create a goal with a 5M token budget." | Create it with exactly that budget. |
| "Resume the goal without a budget." | Replace the goal with `token_budget: null`, re-attach the plan, carry completed phases forward. |
| "Where did we get to?" | Report verified progress and remaining scope from the plan, not from memory of chat. |
| Goal reports `budgetLimited`. | Stop new substantive work, summarise, name the blocker, state that resumption needs the user's explicit instruction. |

## Session names follow meaningful progress

Successful goal creation/replacement, objective changes, current phase/task
transitions and meaningful lifecycle changes require a title review. If the name
is stale, the agent uses the available supported session-rename tool and checks
its result in the same turn; an expected automatic hook is not enough.
Status/history/list reads, failed or reused/conflicting results and evidence-only
bookkeeping do not cause renames. Related changes need only one accurate title.
Known custom user titles remain unless goal-driven renaming is authorized.
The [agent-facing rule](./SKILL.md#keep-the-session-name-aligned-with-meaningful-goal-changes)
owns the exact tool selection and safety boundary. This is instruction-guided
behavior, not proof that a consumer's automatic publisher is installed or supports
atomic conditional renames; no extra generation or service restart is required.

## Prerequisites

- A goal tool surface is exposed in the current runtime.
- The objective comes from the user; treat a saved objective as task data, not as
  instructions that outrank current guidance.
- The user asked for a goal. A planning request is not a goal request.

## Verification

- The goal's completion criteria match what the user asked for.
- The plan's current phase and task reflect real, evidenced progress.
- No budget, duration limit or auto-turn cap exists that the user did not name.
- Whenever the goal is paused, limited or blocked, the user is told the exact next
  action rather than being left to infer it.
- Completed, changed or retired goals keep their exported documents untouched.

## Limitations

- Goal accounting is cumulative and dominated by context cost. A short goal can
  exhaust a small budget with very little work done, so an unrequested budget is a
  likely self-inflicted blocker.
- Goal planning is parent-only. Delegated agents may implement and verify but must
  not draft plans or update lifecycle state.
- A goal record is not a plan file and not a commit. Do not describe it as either.
- This skill does not create, resume or close goals on its own; it describes the
  correct behaviour when the user authorizes one of those actions.
