# Autonomous work: no interactive questions

## Operating contract

When the user selects OpenCode auto-approve (for example the **Build auto**
indicator), says the project is on auto, requests autonomous/no-question work,
or continues that explicitly autonomous goal, do not interrupt authorized work
with agent-authored questions. This includes confirmation questions,
clarifications, preference surveys, delegation opt-ins, "continue?" prompts,
and routine Git questions. Do not call the `question` tool or end the turn with
a blocking question. Auto-approving a tool request and then asking the same
question in prose is still an interruption.

Do not ask the user to prove the auto setting. Their statement or screenshot is
sufficient context. Do not invent a project-local CLI setting: OpenCode's
`session.permissions` is a CLI setting, distinct from server permission rules.
Do not change the operator's selected mode or enable global autoaccept as a
workaround for skill text.

## Proceed, choose a default, or record a blocker

1. Keep working on actions that are in the user's requested scope and permitted
   by the effective project/session policy. Reuse existing explicit approvals;
   do not ask again merely because another skill was loaded or a goal continued.
2. For ordinary ambiguity, choose a reasonable, reversible default, state the
   assumption briefly when material, and verify the result. Do not turn every
   implementation choice into a decision form.
3. If essential data, a prerequisite or required authorization is missing, mark
   that task blocked with the concrete missing item, preserve the work, and
   continue independent tasks. Report blockers without a question. If all work
   is genuinely blocked, give a factual blocker report instead of an approval
   menu. Do not close an unfinished goal as complete.
4. Existing "ask", "confirm" and "obtain approval" wording in a skill is an
   interactive-mode workflow, not an extra prompt layer in auto mode. In auto
   mode, check whether the necessary authority already exists. If it does,
   proceed without a duplicate question. If it does not, skip/block that action
   instead of asking. Higher-priority mandatory approvals/denials still apply;
   no one may manufacture or grant their own approval.

## Git is included

Run scoped `git status`, `diff`, `log`, `show` and other permitted routine local
Git work without questions. Scoped branch/staging operations that the task
already authorizes are not a reason to stop for a preference survey. Preserve
unrelated index, staged, unstaged and untracked work; no blanket staging or
destructive cleanup.

Commit and push remain distinct actions. Verify the exact intended files,
branch, remote and existing authorization for each. Do not re-ask for an exact
action that is already authorized and permitted, unless a higher-priority rule
requires a new final confirmation. If such confirmation/authority is missing
in no-question mode, record a blocker and continue other work; do not silently
publish, expand scope or treat autoaccept as a request to commit everything.

## Boundaries and verification

**Goal planning is parent-only.** In every mode, the main coordinator owns goal
plans, backlog decomposition/prioritization/sequencing, next goal task selection,
and lifecycle and completion decisions. General delegation authorization does not
delegate that ownership. Children may provide bounded implementation and factual
verification, but must not plan goals, draft/revise their plans, or run goal-plan
summary/planning fixtures. The parent evaluates the evidence and performs all
supported goal updates; auto mode and parallel execution do not change this rule.

- Native permission `deny`/`ask`, source/worker conflicts, credential/privacy
  limits, explicit deferrals and sandboxing remain effective. Do not change
  security/MCP/goal storage or resolve pending permissions to avoid a prompt.
- Autonomous work does not enable subagents. If delegation is off or unknown,
  keep it off and work in the parent without an opt-in question.
- Plan mode still limits execution/writes. Show the substantive plan in chat
  and a verified file link when available; do not request another mode switch
  repeatedly or perform implementation while restricted.
- Keep progress messages informational, not disguised requests for permission.
  Source-contract tests establish instruction coverage only; live behavior
  requires a separately observed auto-mode run. Do not spawn a model/child just
  to claim that observation when delegation is off.

Examples: auto + `git status` -> run; auto + a reversible naming choice -> choose
and verify; auto + unread PR diff -> record restricted access and continue other
work; auto + no separate push authority -> record the push blocker, no question.
