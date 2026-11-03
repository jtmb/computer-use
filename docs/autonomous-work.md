# Auto-approve means uninterrupted authorized work

When OpenCode shows **Build auto**, or the user states that project permissions
are on auto-approve, the agent must not interrupt the authorized goal with its
own questions. This includes routine Git, clarification forms, preference polls,
delegation opt-ins, repeated approval and "should I continue?" prompts. Automatic
tool approval is not a reason for a skill to ask the same thing in prose.

## Expected behavior

| Situation in auto mode | Agent behavior |
| --- | --- |
| Routine permitted inspection, edit, test or Git work within scope | Execute, verify and continue without a question. |
| Ordinary implementation ambiguity | Choose a reasonable reversible default; record a material assumption and verify. |
| Necessary information or authorization is absent | Record that task's concrete blocker and continue independent work without prompting. |
| A previously approved exact action is still in scope and permitted | Reuse its authorization; do not reconfirm because a skill or goal was reloaded. |
| A native denial, explicit deferral, credential/privacy limit or unapproved scope expansion | Do not bypass it; record the blocker, without a question. |
| Delegation is off or unknown | Work in the parent; do not interrupt to opt in. |

Git is included: routine status/diff/log/show and scoped already-authorized local
work do not need a fresh question. Preserve unrelated staged/unstaged/untracked
work. Commit and push are distinct operations; verify their exact scope and any
required explicit authority. If authority is missing, record a blocker rather
than asking or silently publishing. An autonomous request does not mean "commit
and push everything" or waive a higher-priority mandatory approval.

## Configuration versus instructions

OpenCode's [CLI settings](https://opencode.ai/v2/docs/cli/config) document
`session.permissions: "autoaccept"`; the TUI can display this as **Build auto**.
That is separate from the server's ordered permission rules in `opencode.json(c)`.
There is no project-local `cli.json`. Do not guess a new `auto` config key or
rewrite the operator's chosen setting to implement this instruction fix.

The repository's `global/cli.json` is a tracked template and currently says
`prompt`; that does not establish the running TUI's selected mode. The user
provided a screenshot showing **Build auto** during this remediation, so this
goal is no-question work. No global autoaccept setting was enabled or deployed.

The rule lives in [AGENTS.md](../AGENTS.md), the
[skill catalog](../.opencode/skills/README.md), the applicable canonical skill
entries/usage guides and the [continuation command](../global/commands/handoff_resume.md).
The full portable skill contract is
[here](../.opencode/skills/development-conventions/references/autonomous-work.md).
These are real source instruction changes, not a patch to OpenCode's native core.
Existing sessions can retain previously loaded skill context; do not claim a
fresh model/client test ran merely because source checks passed.

## Verification

Goal planning is parent-only in all modes, including auto and parallel runs.
The coordinator owns goal plans, task sequencing, next-task selection and
lifecycle/completion decisions. General delegation permission covers bounded
implementation or factual verification, not goal planning. The durable rule is
in [the goal workflow](goal-mode-usage.md) and the shared contract above.

`node --test scripts/autonomy-contract.test.mjs` checks repository/skill coverage,
Git wording, default/blocker behavior, delegation-no-prompt fallback, local
links and preserved boundaries. This is a source-contract test, not live model
enforcement. Combined tests, original-index preservation and current goal-export
verification are recorded in the goal. No extra model/subagent session, security
change, deployment, commit or push is needed to validate these source edits.
