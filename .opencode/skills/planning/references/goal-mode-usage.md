# Persistent Goal Progress and Backlog

Read this reference explicitly when a request continues or updates work in an
existing persistent goal, or when explaining how goal progress works. It is not
loaded automatically. A human-readable plan and a persistent goal are distinct:
planning alone does not create, resume, replace, cancel, or close a goal.

## Read live state before goal work

1. Call `get_goal` before doing work under a goal. Read its live `status` and
   `planRevision`; use the full view when task or phase context is needed. Do
   not rely on a stale chat summary, exported document, or raw state file.
2. Continue goal work only while the goal is `active`. A paused, budget-limited,
   usage-limited, completed, unmet, or cancelled goal is not an execution
   target. Do not resume or otherwise change lifecycle state unless the user
   explicitly requests that operation and the active mode permits it.
3. Before a goal-plan write, use the current `goal_id` and `planRevision`.
   If the revision is stale or the write conflicts, reread live state and
   reconcile rather than replaying an old update.

## Follow the active-phase cursor

**Goal planning is parent-only.** The main coordinator alone owns goal plans,
backlog decomposition/prioritization/sequencing, next goal task selection, and
lifecycle and completion decisions. General delegation authorization does not
transfer this work to children, even in parallel or auto mode. Children may do
bounded implementation and factual verification; they must not plan goals or
draft/revise/summarize goal plans as a planning fixture. The parent evaluates
their evidence and performs all supported goal updates.

- Continue `currentTask` first. Complete it only after the work is done and
  concrete evidence is available. Then reread the live goal and use its derived
  `nextTask` for the next task in the active phase.
- A `nextTask` value is scoped to the active phase; it is not a search across
  every pending task in the goal. Do not jump to later-phase backlog while the
  active phase still governs execution.
- If `nextTask` is null, inspect the full plan and the actual next-phase field
  exposed by the current tool (for example, `nextPhase` or `nextPhaseID`). A
  null cursor does not prove that the overall backlog is empty, that the goal
  is complete, or that a later-phase implementation task may start.
- The supported goal view is a single coordinator cursor (`currentPhase` /
  `currentTask` / `nextTask`), not a complete concurrency registry. It does not
  prohibit explicitly user-authorized, independent preparatory or review work
  in parallel when that work's dependencies are satisfied and its ownership is
  disjoint. A pending later-phase task by itself is not permission to execute it.
- For such an authorized parallel run, keep the coordinator cursor intact and
  maintain a separate child ownership/verification registry: exact child owner,
  task and path scope, status, expected return/evidence, and independent
  verification. Prevent overlapping writes. Child completion or pending parent
  acceptance is not task completion; record verified evidence through the
  supported goal update before advancing the cursor or phase.
- If newly requested scope is authorized and should be worked in the active
  phase, record it as one or more concrete pending successor tasks before
  implementation. State an outcome and a check/evidence for each task. If the
  work belongs in a later phase, record it there but do not jump ahead; let the
  phase dependencies and verification control when it becomes executable. Use
  supported goal-plan tools with the current revision; do not manufacture or
  edit a derived cursor field.
- Complete an active phase only when its required tasks have evidence and its
  phase-level verification is recorded. Then reread the goal and follow the
  supported phase progression. Later-phase pending tasks alone do not satisfy
  active-phase verification.

## Preserve scope and report blockers

- Preserve the overall objective, immutable completion criteria, and completed
  tasks when extending a plan. Add authorized work without silently replacing
  the goal or weakening its acceptance conditions. Do not reopen completed work
  without concrete revisit evidence and the supported update path.
- Mark a blocked task with its specific blocker; do not represent it as complete
  or silently drop it. Continue independent, authorized tasks when possible.
- In auto/no-question mode, do not ask clarification or delegation questions.
  Use a reversible default when reasonable; otherwise record the blocker and
  continue authorized independent work. Native permissions and explicit
  delegation limits still apply.
- Do not mark the overall goal complete merely because the current task ended,
  a phase has no derived `nextTask`, or no work was available in a summary view.
  Close it only after auditing the full objective and completion criteria
  against real evidence. Use `unmet` only for a concrete blocker or
  impossibility, not as a substitute for unfinished work.
- Use goal tools for supported reads and updates. Never edit goal storage,
  generated goal exports, or derived fields directly. A planning-only request
  does not authorize goal creation or lifecycle changes.

## Illustrative progress selection

The fixture is deliberately illustrative, not a live goal response or model
acceptance result. Field details may differ; use the current tool's actual
output. It shows an active phase with an explicit successor and a separate
later-phase backlog:

```json
{
  "status": "active",
  "planRevision": 11,
  "currentTask": "current_task",
  "nextTask": "features_inventory",
  "currentPhase": {
    "id": "discovery",
    "tasks": [
      { "id": "current_task", "status": "in_progress" },
      { "id": "features_inventory", "status": "pending" }
    ]
  },
  "nextPhase": {
    "id": "implementation",
    "tasks": [
      { "id": "implementation_task", "status": "pending" }
    ]
  }
}
```

First continue `current_task`. After recording its completion evidence, reread
the goal. With no current task and `nextTask` still equal to
`features_inventory`, select that active-phase successor, not
`implementation_task`. If the refreshed `nextTask` is null, inspect the full
plan and next-phase information before deciding whether to add an authorized
task, verify a phase boundary, or report a blocker.
