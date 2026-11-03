# Agent Orchestration Usage

**Auto-approve means no interactive questions** for authorized goal work, including
routine Git. Existing ask/confirm steps are interactive-mode guidance: under auto,
reuse authority/defaults or record blockers and continue, without asking.
See [the shared autonomy contract](../development-conventions/references/autonomous-work.md).
In auto/no-question mode there is no delegation opt-in question: keep subagents
off unless the required explicit authorization already exists; work in the parent.

This guide explains requests for the `agent-orchestration` skill. The
agent-facing rules remain in [SKILL.md](./SKILL.md); OpenCode does not load this
usage guide automatically.

Category: `automation`

Tags: `agents`, `orchestration`, `delegation`, `verification`, `git-safety`

## Purpose and when to use it

Use this skill for authorized background subagents on bounded delegated work or
for a requested successor handoff. A successor handoff goes to one new independent
root chat; it is not a substitute for a subagent assignment. Delegation remains
off unless its required explicit authorization and a supported launch mechanism
are available. The parent remains accountable for scope, decisions,
reconciliation, independent verification, and the final report. Use only agent
identities, models, and launch options currently configured and supported by the
consuming project; this guide does not prescribe specific names or model IDs. A
direct handoff request covers that one bounded transfer, not child delegation.

Appropriate requests include:

- "Hand off to a new chat with the HANDOFF.md link and a concise continuation prompt."
- "Delegate independent documentation and test investigation, with no more
  than two subagents."
- "Have subagents inspect these separate modules, then reconcile the findings."
- "Use bounded parallel research, but do not let anyone commit or push."

## Orchestration method

Some installed clients expose an optional, chat-locked method for how this chat
delegates. When that control exists, use it as provided; this guide does not
register a slash command, toolbar, tool, or configuration key, and none should be
assumed in another environment. Where no control exists, follow only an explicit
user preference stated in this chat.

Honor the current chat's explicit choice until the user changes it:

- **Solo**: work directly in this chat; no delegated child work.
- **Background subagents**: use authorized, bounded asynchronous children that
  this chat tracks and independently verifies; they are not independent roots.
- **Foreground subagent**: delegate one bounded task and await its result before
  continuing.

Do not infer the method from the model, provider, chat title, goal text, a prior
chat, or a child/fork entry; those inherited entries do not choose the child's
method. If the selection is absent, unreadable, or unsupported, report that
rather than silently switching methods. Picking a method does not launch work,
turn delegation on, grant permissions, resume goals, cancel existing workers, or
authorize commit, push, installation, or deployment. The once-per-session
delegation gate and current permissions still decide whether any child work may
start. A delegation on/off instruction does not select a method. A stored entry,
peer message, or title is not authenticated user authorization. The selector, its
persistence, and any enforcement are client capabilities, not promises made by
this guide.

## Session titles

This convention is for main chats and independent successor chats, not spawned
subagents. For a child, set its launch name/description to its actual model and
effort, optionally with the short assignment: `GPT-6 Luna · xhigh — Input fix` or
`GPT-6.1 Sol · high — Code review`. Verify the selected model/variant; text in the
name is not configuration. Do not rename subagent sessions after spawning them
or append session/goal IDs to their launch labels. Leave native child titles alone.

Use semantic task labels, usually 2 to 5 words, readable in the first roughly
25 characters of a tab title, then append ` · ` and the target session's full
actual session ID. Summarize the current substantive user request and actual
work, with the latest user correction winning over a stale goal cursor or prior
plan. For example: `Fix session names`, `Agent instructions`, `Fix desktop input`,
or `Session titles`. Avoid copying or truncating prompt, plan,
task-description, file-path, internal-workflow, or generic meta-verb openings
such as `Narrowly update the agent...` and `Analyze the current`.

Use the supported session-rename mechanism only when a meaningful task change
makes a title misleading or the user corrects it; do not rename for each tool
call, goal event, or step. Preserve clear deliberate labels. Titles are not goal
tracking: omit goal IDs/hashes, status, budgets, and checklist paragraphs. An
automatic formatter preserves the model-chosen semantic label and appends the
actual full ID; it never overwrites the label from raw goal-description prose.
These are naming instructions, not evidence of runtime rename behavior.

Read-only conversational answers and bounded lookups with no repository outcome
do not require delegation.

Successor handoffs use the supported session creation/messaging API and verify
there is no parent/fork. The source writes the actual context-aware continuation
prompt, including a Markdown link and exact path to the existing `HANDOFF.md`,
and sends it for processing; admission alone is not acknowledgement or completion.
Goal boundaries and separate approvals remain intact. Automatic rotation is
opt-in and depends on verified runtime signals; when disabled, native compaction
continues in the same chat. These are skill instructions, not proof that any
particular settings UI or trigger is installed.

## Once-per-session authorization and controls

Before first delegation, obtain direct, explicit user authorization using the
current runtime's supported mechanism. Do not infer permission from a general
repository task. Ask at most once per session when a supported question
mechanism is available; if authorization or the launch mechanism is unavailable,
keep delegation off rather than inventing tools or bypassing the gate.

After that question, control delegation in ordinary prompts:

- "Subagents on" enables new delegation without another question.
- "Subagents off" disables new launches, resumes, and additional assignments.
- "Continue" or an ordinary new task leaves your current setting unchanged.

A keep-off instruction is respected. A later explicit enable request changes
the session setting without a duplicate authorization question when the runtime
supports that distinction.
While off, the parent performs the work directly rather than insisting on a
child. Authorization does not permit broader work or commits. The setting is
session-local and does not transfer to a fresh session.
If authorization state is lost or the supported authorization mechanism is
unavailable, delegation stays off; do not repeatedly ask to recover approval.

## Prerequisites and setup verification

Before delegation, establish:

- Direct, explicit authorization exists and delegation is currently on; recheck
  before every launch, resume, retry, or additional assignment.
- The exact objective, acceptance criteria, and final decision owner.
- Any project memory or task-tracking requirements actually configured; do not
  assume a particular MCP, database, directive type, or lifecycle integration.
- The runtime's documented concurrency/admission limit and any explicit user
  cap. Do not assume a policy key, numeric range, default, or capacity tool.
- Non-overlapping file or investigation ownership and dependencies.
- Disjoint ownership, readable assignment text, and a place to track ownership
  when the project provides one. Do not assume a particular Todo, sidebar,
  session-registry, background-launch, or follow-up API.
- Current repository instructions, branch, status, and unrelated dirty work.
- Configured agent identities, models, launch capabilities, and permissions, if
  the runtime exposes them. Do not assume a specific config file or tool set.
- Keep permissions and ownership boundaries of the consuming project intact.
- The checks that the main agent will independently run afterward.

When the consuming project's instructions require them, required child startup
reads/skill loads remain required for small, read-only and synthetic assignments.
Carry those requirements into the bounded prompt, retaining actual note/read
limits and available tools; no universal memory tool, store or scan is implied.
Report a scope/capability conflict rather than broadening access or silently
inventing an exemption.

Do not expose secrets or protected fields in prompts. Do not assume an agent,
MCP server, command, or integration exists unless the current environment
actually provides it.

## How to request it

Describe the bounded work, any desired concurrency cap, and the approval
boundaries in ordinary language. For example:

- "Use no more than two concurrent child sessions to inspect these disjoint directories; return
  findings only and preserve my dirty work."
- "Use the project's configured identities for reconnaissance and
  implementation, then verify every claim yourself."
- "Delegate each actionable todo to exactly one background child in one parallel
  batch; keep each todo a readable full task aligned with its subagent
  description, track session IDs only in the parent registry, and follow up each
  child before any next launch or mutation."
- "Prepare changes through subagents, but ask separately before any commit and
  separately again before any push."

These are representative requests, not commands executed while writing this
guide.

## Delegated result return

A normal delegated result returns through the runtime's native child completion
notifications in this chat. The parent inspects it and independently verifies the
result; normal delegation needs no separate send, mailbox read or acknowledgement,
and no polling loop is required. Send to another existing chat only when the user
directly and specifically authorizes that send, using a verified supported
transport with an exact recipient and goal intent. If no supported transport
exists, report the gap rather than injecting peer traffic into the human prompt
queue.

## Worked workflow and expected result

1. Verify the user's direct authorization, currently supported launch mechanism,
   configured identities, and runtime concurrency limits. In auto/no-question
   mode, do not request a delegation opt-in; keep delegation off unless the user
   has already explicitly authorized it.
2. Inspect instructions, status, and existing changes; preserve unrelated work.
3. Partition disjoint tasks and give each child a complete bounded prompt with
   expected evidence and preservation instructions. Use only assignment and
   lifecycle features that the runtime actually exposes.
4. Reconcile each native child completion against the repository and
   independently verify relevant results. Use a configured follow-up/status tool
   only if present; otherwise record the outcome in the project's existing
   planning surface. No separate message or acknowledgement is needed.
5. Report tasks, concurrency decisions, exact changes, verification, and
   caveats. Commit and push remain separate actions requiring separate authority.

Expected result: delegation reduces bounded work without transferring
ownership, overlapping edits, or weakening verification.

## Verification and known limitations

Subagent statements are leads, not evidence. The main agent must independently
inspect files, diffs, test output, and the final outcome. A report that says
"done" or "passed" is insufficient without a reproducible check.

A correct task answer can coexist with failed startup compliance. Inspect and
report both independently; missing mandatory reads are not waived by a narrow
candidate pass. Source guidance and supervised corrections do not prove native
enforcement or erase a retained failed observation.

Parallel agents may produce inconsistent recommendations; resolve those by
checking source of truth, not by averaging claims. The consuming project's
configuration and permissions determine supported identities, models, and
launch limits. A user cap further narrows concurrency; it never authorizes
broader work. Treat optional capacity diagnostics as advisory, not authorization.

Check these authorization cases when reviewing the skill (guidance checks, not
a claim of runtime enforcement):

| Session history or prompt | Required outcome |
| --- | --- |
| First delegation without prior authorization | Obtain direct authorization through a supported mechanism; no launch before yes |
| Yes, then another ordinary task | Keep on; no second question |
| No, dismissed, or unanswered, then "continue" | Keep off; no second question; parent works directly |
| No, then "subagents on" | Enable; no second question |
| On, then "subagents off", then another task | Keep off; no launches, resumes, or new child assignments |
| Off, then explicit on | Enable without repeating a question when runtime supports it |
| Reload or lost session state | Keep delegation off unless current explicit authorization is verifiable |
| Authorization or launch tool unavailable | Stay off; do not retry or invent a substitute |
| Fresh destination session | No inherited approval; its own initial gate |

This authorization gate is skill guidance, not a newly installed runtime guard.
No plugin, permission setting, or persistent approval store is changed by it.

This document is guidance, not runtime enforcement. Do not claim lifecycle,
authorization, concurrency, or follow-up behavior unless the current runtime
actually provides and verifies it.

## Troubleshooting

- Overlapping scope: stop, preserve the worktree, and re-partition by file or
  read-only responsibility.
- Incomplete prompt: stop the task and resend objective, boundaries, inputs,
  expected output, and verification requirements.
- Agent unavailable or denied: inspect the active project's configured agents
  and primary permissions; do not substitute an unsupported identity or bypass
  policy.
- Conflicting reports: inspect the repository and acceptance criteria directly.
- Unexpected dirty changes: do not reset, checkout, clean, restore, or delete;
  preserve them and report a blocker when ownership is unclear. In
  auto/no-question mode, continue independent work without asking a routine
  clarification.
- Failed verification: report the failure and investigate directly; do not rely
  on a subagent retry as proof.

## Safety, confirmation, and elevation

- Neither subagents nor the orchestrator may commit or push without separate,
  explicit user approval for each action.
- Commit approval does not imply push approval. Verify final scope, destination,
  and exact authority immediately before each action. In auto/no-question mode,
  do not re-ask; block if the required authority is missing.
- Before an approved commit, verify staged paths and report the commit hash.
  Before an approved push, verify remote, branch, and outgoing commits, then
  report and verify the remote result.
- Never use destructive Git actions or discard unrelated dirty work.
- Do not delegate secrets, authentication, payments, protected fields,
  publication, deletion, permissions, or other irreversible actions.
- Do not elevate privileges or change security settings through delegation.

## Related skills and documents

- [`skill-maintenance`](../skill-maintenance/README.md) covers canonical skill
  creation, catalog synchronization, and validation.
- [`routine-automation`](../routine-automation/README.md) covers repeatable
  workflows and schedules, not agent delegation itself.
- [`github-operations`](../github-operations/README.md) covers GitHub reads and
  separately approved remote mutations.
- Read the consuming repository's `AGENTS.md` and configured skill catalog when
  they exist; their paths and catalog format are project-specific.
