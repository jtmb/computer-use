# Agent instruction authoring usage

Use this skill to design or review agent instructions, not to generate a generic
manual from a repository name. It discovers the consumer's rules and tools first.

Category: `skills`

Tags: `agents`, `instructions`, `architecture`, `context`, `traceability`

## Requests

- “Make our agent instructions a short index without losing safeguards.”
- “Review conflicts between parent guidance, local instructions and skills.”
- “Audit which requirements disappeared across our previous handoff.”
- “Propose bounded startup memory retrieval; do not install a hook.”

## Workflow and example

The agent inspects existing instruction scope/configuration and file ownership,
maps policies to owners, compares alternatives, and presents a migration before
editing when approval is required. Example: a repository repeats deployment
rules in several guides. Keep its approval invariant visible, choose the actual
deployment guide as owner, and replace duplications with explicit task-triggered
reads. Verify every removed clause is covered before calling the migration done.
This is an illustrative workflow, not a claim of an executed deployment.

Use the consumer's normal files/tools; no command or special plugin is installed
by loading the skill. [SKILL.md](SKILL.md) defines agent behavior. Explicitly read
the [research/evaluation reference](references/research-and-evaluation.md) for
research-based choices; linked references do not automatically enter context.

## Safety and validation

Auto-approve means no interactive questions for authorized work, including routine
Git. Follow the [shared autonomy contract](../development-conventions/references/autonomous-work.md):
reuse authority/defaults or record missing authority without changing native policy.
Planning is not implementation, goal resumption or publication permission.
`skill-maintenance` owns bundle/catalog checks and separately approved deployment.

Compare actual task correctness, safety, routing misses, reads and complete context
cost, not just line count. If a reference is missing, scope conflicts or an archive
is stale, report that limit; do not invent precedence or hide unfinished work.
Source checks do not prove fresh-session behavior or native enforcement.
