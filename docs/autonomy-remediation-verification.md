# Auto-approve remediation: interim verification

## Scope and status

This is a source-contract review of the current in-flight remediation, not a
final integration or runtime acceptance report. The parent owns the shared
contract, repository policy, and source-bundle changes; other edits may still be
underway. Findings below describe the snapshot inspected for this review and
should be reconciled against the combined tree before calling the remediation
complete.

The governing sources are [`AGENTS.md`](../AGENTS.md), the
[shared autonomy contract](../.opencode/skills/development-conventions/references/autonomous-work.md),
and the user-facing [overview](./autonomous-work.md). Their intended behavior is
that Build auto/no-question work proceeds on existing authority, uses reasonable
reversible defaults for ordinary ambiguity, and records a concrete blocker
without asking when required data or authority is missing. Independent work
continues. Routine Git is included; commit and push authority remain distinct.
Delegation that is off or unknown stays off without an opt-in question. Native
permission rules, task scope, mode limits, privacy and other higher-priority
boundaries remain effective.

## Source-contract regression coverage

[`scripts/autonomy-contract.test.mjs`](../scripts/autonomy-contract.test.mjs)
checks repository policy and the shared contract, then checks the autonomous
work preamble and its ordering in the six affected skill bundles: planning,
GitHub operations, agent orchestration, handoff, README GIF, and skill
maintenance. It checks that their usage guides describe no-question auto behavior
and link to the shared contract. Specific regressions include routine Git,
reasonable defaults, blocker-without-question fallback, continuing independent
work, delegation off/no opt-in, and preserving higher-priority policy/mode
boundaries.

These are instruction-coverage tests only. They do not execute or prompt a live
model, observe a real Build auto turn, change OpenCode's selected mode, or prove
native permission behavior. A separately observed auto-mode run would be needed
for live behavior evidence; no such run is claimed here.

The regression intentionally does **not** pin `global/cli.json` to a specific
prompt setting. The contract says not to change the operator-selected mode or
enable blanket autoaccept. In the initial and final read-only checks for this
subtask, `global/cli.json` had no staged or unstaged diff. That is evidence only
about this source worktree, not the running TUI's mode or any consumer
repository's configuration.

## Residual wording for parent reconciliation

The following was present in the inspected snapshot and was not changed by this
subtask:

| Source | Observed wording | Why it needs review |
| --- | --- | --- |
| [`.opencode/skills/agent-orchestration/SKILL.md`](../.opencode/skills/agent-orchestration/SKILL.md#L179) lines 183–185 and [its usage guide](../.opencode/skills/agent-orchestration/README.md#L234) lines 238–239 | “Ask again for push” and “re-confirm” before a mutation | This is in direct tension with the shared contract's no-question fallback when a required confirmation is absent. Under no-question mode, preserve the gate and block the action rather than prompting. |
| [`.opencode/skills/github-operations/SKILL.md`](../.opencode/skills/github-operations/SKILL.md#L42) lines 47–48, 62–67 and [its usage guide](../.opencode/skills/github-operations/README.md#L59) lines 59–62, 74–76, 113–127 | Unqualified “ask immediately before” instructions for remote mutations | The skill's auto preamble says to reuse exact authority or record a blocker, but these later instructions can still be read as a required question. Make the auto-mode blocker behavior explicit while preserving any mandatory approval boundary. |
| [`.opencode/skills/readme-maintenance/SKILL.md`](../.opencode/skills/readme-maintenance/SKILL.md#L79) lines 79–83 | Includes “ask before writes or installs” in a prescribed setup prompt, without an auto-mode preamble in the inspected file | This is a coverage gap to reconcile against the repository-wide rule that skill-level ask/confirm wording must not create another question layer. It is not a claim that the skill's source update is final. |

The location and wording of these findings must be rechecked after the sibling
source changes land. No source edits outside the two owned files were made here.

## Verification status

In the inspected snapshot, `node --test scripts/autonomy-contract.test.mjs`
passed all 11 tests. The verification document's nine local links resolved, and
both owned files passed a trailing-whitespace check. The combined-tree rerun and
parent independent verification remain pending; sibling source changes may alter
the inputs or expose additional gaps. Passing this focused test alone does not
establish live no-question enforcement or close the remediation.
