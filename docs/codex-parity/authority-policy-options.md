# F04 — Commit/push authority: operator decision options

**Purpose:** turn the recorded blocker into a small, explicit policy choice. This document records current wording, identifies what it does and does not decide, and offers alternatives; it is not itself an approval to change policy.

## Decision sheet

Choose one complete package below, or answer the three fields independently. Replying with `Option 1`, `Option 2`, or `Option 3` is the shortest complete decision. For independent choices, these are copy-ready one-sentence answers:

- **A — Commit/push scope and bundling:** “Commit approval covers [scope]; push approval covers [scope]; they [must be separately approved / may be explicitly bundled as specified in Option 2 / may be explicitly bundled for a bounded batch as specified in Option 3].”
- **B — Routine Git gates:** “Within an already-authorized task scope, [every mutating Git operation needs a fresh gate / explicitly authorized staging and branch operations reuse that authority]; read-only Git inspection needs no fresh gate, and commit/push follow A.”
- **C — Approval and evidence:** “Approval must be [an explicit operator-authored statement in the current task / a native OpenCode Ask acceptance / either], after a summary of the exact action; record the approval reference and action scope before acting.”

The three packages below supply concrete meanings for each bracket. **Nothing in this document has been applied. Applying any option requires its own explicit approval.**

## Current authority wording (verbatim)

Line references are to the checked-out files at `/home/james/repos/computer-use` unless a different absolute path is shown. Quotes below are copied from the current files; proposed language appears only in the later, clearly labeled option sections.

### Parent instructions: `/home/james/AGENTS.md`

The requested “Routine authorization”, “Safety”, and “Auto-approve” sections do not exist in this file; it is 25 lines and contains home-directory save-location rules. The relevant current save boundary is:

`/home/james/AGENTS.md:3-6`
> **Hard rule: agents must save all work in one of the folders listed below.
> Anything else — including `~` root, `Desktop/`, `snap/`, dotfiles/dotdirs,
> and XDG media dirs — is off-limits for agent output. When no listed folder
> fits, ask the user first instead of guessing.**

This governs where work may be saved, not commit or push authority.

### Repository `AGENTS.md`

`AGENTS.md:35-41` — Routine authorization:
> - An explicit request authorizes routine in-scope work within current mode and
>   permissions. Reuse existing exact authority; do not re-ask unchanged scope.
> - This never resumes a paused/closed goal or approves a new consequential step.
>   Deployment, extension activation, shared restart/logout, security/permission
>   changes, publication/deletion and commit/push retain separate explicit gates.
> - Verify source identity and worker overlap before shared edits. Receipts/old
>   outcomes are not live status; missing receipts are not invented prerequisites.

`AGENTS.md:43-53` — Auto-approve means no questions:
> In Build auto/project auto-approve/no-question work, do not interrupt the authorized
> goal with agent-authored questions, including routine Git work.
> Do not call the `question` tool or ask the same thing in prose. Make reasonable,
> reversible assumptions and verify them; record a blocker and continue independent work instead
> when authority/data is missing. Delegation off/unknown stays off without an opt-in question.
> Read [the autonomy contract](.opencode/skills/development-conventions/references/autonomous-work.md)
> when this mode applies; it governs skills' interactive ask/confirm wording.
> Do not change operator mode, enable blanket autoaccept, self-grant permissions,
> bypass native deny/ask, broaden scope or infer commit/push authority from auto mode.

`AGENTS.md:18-25` — Plan-mode responses:
> ## Plan-mode responses
>
> - Always show the substantive plan in chat, not only a goal ID, tool result, or file path.
>   Include outcomes, ordered steps, checks and blockers. Planning is not implementation.
> - Verify a plan file before providing its clickable Markdown link; prefer the
>   actual repo export, otherwise label the planning copy. If none exists, say no
>   file was written. Never create a file merely for a link or bypass mode limits.
> - Goal records are not repo exports or commits; this guidance is not native behavior.

`AGENTS.md:114-124` — Verification:
> ## Verification
>
> Run behavior-relevant checks; [maintainer policy](docs/maintainer-policy.md) owns exact
> commands including `./scripts/health-check.sh` for harness integration changes.
> Follow [test-quality cadence](docs/test-quality-audit.md#when-to-review): after five
> accepted units, phase/integration boundaries, before release, escaped regressions,
> SDK/schema/fixture drift/flakiness and weekly during active work. Record findings,
> preserve distinct failure coverage; no scheduler or test/data deletion is authorized.
> Source/fixture checks, runtime loading, model behavior and app/client outcomes are distinct.
> External cluster plan/handoff and fresh-backup-plus-tested-restore requirements
> remain in the maintainer policy; do not adopt that work in an unrelated chat.

`AGENTS.md:126-134` — Safety:
> ## Safety
>
> - Require applicable authority immediately before sending/publishing, deletion,
>   account/security changes, permission grants, reboot or other consequential action.
>   Interactive confirmation rules defer to auto-mode blocker handling above.
> - Commit approval and push approval are separate; no implied release authority.
> - No credentials, tokens, keys, payment data or passwords in repo, memory or evidence.
> - Never weaken browser sandboxing, TLS validation, filesystem permissions or system
>   security to hide failure. Never patch deployed copies to evade a source/permission gate.

### Maintainer policy

`docs/maintainer-policy.md:3-5`:
> Repository-specific operations; reusable skills must discover consumer equivalents.
> Read the root [AGENTS.md](../AGENTS.md) first. This file owns layout/commands and
> external-work locators, not native OpenCode behavior or a deployment approval.

`docs/maintainer-policy.md:52-71` — Source, archive and approval boundaries:
> ## Source, archive and approval boundaries
>
> Review the combined tree including added/untracked files; cloud main may omit
> the actual implementation. Preserve exact index entries/staged patch and unrelated
> source work; a stat-cache change alone is not proof content was staged differently.
> No blanket staging, destructive cleanup or unrequested source reformatting.
>
> Goal records live through supported tools. Generated [goal bundles](goals/) contain
> plan, HANDOFF, work-history and snapshot, indexed with an ownership manifest.
> They are bounded historical exports, not every transcript/revision or proof all
> work is complete. Validate source identity, status/revision/freshness and the
> writer's checksum semantics; the README hash covers only its managed block.
> Preserve mismatching bytes before diagnosis. Never edit generated files/raw goal
> state, delete a persistent lock inode or rewrite a manifest just to make it green.
> Use only supported validated recovery; unknown provenance is an explicit blocker.
>
> Sending/publication, deletion, account/security/permission changes, reboot,
> deployment/extension activation/shared restart/logout, commit and push keep their
> separate applicable authority. Reuse exact existing approval; auto mode does not
> create missing authority. [Autonomy contract](../.opencode/skills/development-conventions/references/autonomous-work.md).

### Autonomy contract

`.opencode/skills/development-conventions/references/autonomous-work.md:22-38`:
> 1. Keep working on actions that are in the user's requested scope and permitted
>    by the effective project/session policy. Reuse existing explicit approvals;
>    do not ask again merely because another skill was loaded or a goal continued.
> 2. For ordinary ambiguity, choose a reasonable, reversible default, state the
>    assumption briefly when material, and verify the result. Do not turn every
>    implementation choice into a decision form.
> 3. If essential data, a prerequisite or required authorization is missing, mark
>    that task blocked with the concrete missing item, preserve the work, and
>    continue independent tasks. Report blockers without a question. If all work
>    is genuinely blocked, give a factual blocker report instead of an approval
>    menu. Do not close an unfinished goal as complete.
> 4. Existing "ask", "confirm" and "obtain approval" wording in a skill is an
>    interactive-mode workflow, not an extra prompt layer in auto mode. In auto
>    mode, check whether the necessary authority already exists. If it does,
>    proceed without a duplicate question. If it does not, skip/block that action
>    instead of asking. Higher-priority mandatory approvals/denials still apply;
>    no one may manufacture or grant their own approval.

`.opencode/skills/development-conventions/references/autonomous-work.md:42-53`:
> Run scoped `git status`, `diff`, `log`, `show` and other permitted routine local
> Git work without questions. Scoped branch/staging operations that the task
> already authorizes are not a reason to stop for a preference survey. Preserve
> unrelated index, staged, unstaged and untracked work; no blanket staging or
> destructive cleanup.
>
> Commit and push remain distinct actions. Verify the exact intended files,
> branch, remote and existing authorization for each. Do not re-ask for an exact
> action that is already authorized and permitted, unless a higher-priority rule
> requires a new final confirmation. If such confirmation/authority is missing
> in no-question mode, record a blocker and continue other work; do not silently
> publish, expand scope or treat autoaccept as a request to commit everything.

### Handoff skill

`.opencode/skills/handoff/SKILL.md:18-27`:
> For Build auto, project auto-approve or explicitly autonomous/no-question work,
> apply this rule to all interactive ask/confirm steps below: Do not ask routine questions,
> including Git questions, clarification forms or "continue?" prompts. Use existing
> authority and reasonable reversible defaults. If essential authority or data is
> missing, record the blocker and continue independent work instead of asking.
> Explicitly read [the shared autonomy contract](../development-conventions/references/autonomous-work.md).
> Native policy, mode restrictions and task scope remain effective; do not
> self-grant permissions or enable autoaccept as a workaround.

`.opencode/skills/handoff/SKILL.md:174-185`:
> ## Safety
>
> - Preserve unrelated dirty work.
> - Do not combine state from different repositories, worktrees, sessions, or
>   goals without explicit user selection and verified provenance.
> - Never include credentials, access tokens, private keys, payment data, or
>   unrelated sensitive personal information.
> - Keep commit and push approvals separate.
> - Do not automatically resume or mutate the source session. A continuation
>   command, when configured, is an explicit action, not a background or automatic
>   resume.
> - Do not modify deployed runtime copies.

### Coordination memory

`docs/memory/coordination-workflow.md:26-34`:
> When delegation is explicitly authorized, use GPT-6 Luna at xhigh effort for implementation by default. Partition independent work among up to 10 background agents, subject to actual runtime admission limits and non-overlapping ownership; do not create agents just to fill the cap.
>
> If Luna workers are not sufficient for a task, use Sol at medium or high effort as appropriate to the task's difficulty. Discover the actual available model IDs and variants before launch rather than guessing them.
>
> DeepSeek is also available for delegated work. Verified on 2026-10-28: `deepseek/deepseek-flash` (DeepSeek V4.1 Flash 1017) and `deepseek/deepseek-v4-pro` (DeepSeek V4 Pro), each with `none`, `low`, `high`, and `max` variants. No DeepSeek-specific effort preference was specified; choose for the task and recheck availability before launch. This adds options without replacing the Luna default.
>
> Use ordinary parent-owned background subagents, not a dedicated independent reviewer/worker-chat ceremony. The parent coordinates, independently verifies results, and alone manages goals. Successor handoff remains a separate mechanism.
>
> This records model/workflow preferences, not standing permission for future sessions or deployments. Preserve separate commit, push, publication, deployment/activation, and security-change approval gates.

### Native permission configuration

`global/opencode.jsonc:69-78` (Build agent, broad rule followed by a GitHub ask):

```jsonc
        {
          "action": "*",
          "resource": "*",
          "effect": "allow"
        },
        {
          "action": "github_*",
          "resource": "*",
          "effect": "ask"
        },
```

The Build block also explicitly allows listed GitHub read/list/search actions at `global/opencode.jsonc:79-107`. Its commit/push rules are:

`global/opencode.jsonc:108-117`

```jsonc
        {
          "action": "repo_commit",
          "resource": "*",
          "effect": "ask"
        },
        {
          "action": "repo_push",
          "resource": "*",
          "effect": "ask"
        }
```

The plan agent's commit/push denies at `global/opencode.jsonc:133-152` are:

```jsonc
        {
          "action": "shell",
          "resource": "git commit *",
          "effect": "deny"
        },
        {
          "action": "shell",
          "resource": "git push *",
          "effect": "deny"
        },
        {
          "action": "repo_commit",
          "resource": "*",
          "effect": "deny"
        },
        {
          "action": "repo_push",
          "resource": "*",
          "effect": "deny"
        }
```

The same four deny rules recur for explore at `global/opencode.jsonc:197-215` and general at `:228-246`. Architect at `:170-184` denies all shell actions and separately denies repository commit/push:

```jsonc
        {
          "action": "shell",
          "resource": "*",
          "effect": "deny"
        },
        {
          "action": "repo_commit",
          "resource": "*",
          "effect": "deny"
        },
        {
          "action": "repo_push",
          "resource": "*",
          "effect": "deny"
        }
```

These are native tool permission rules, not definitions of what user approval covers or how approval evidence is recorded.

`opencode.json:1-33` contains project plugins, skills, and MCP server configuration, with no `agents` or `permissions` block. It supplies no project-level commit/push permission wording.

## Classification

Counts below are by numbered finding, not by quoted line. A finding may cite several sources. No current statement is silently upgraded into a more specific rule than its text supports.

### (a) Already correct and directly reusable — 12 findings

1. The parent file's save-location boundary applies to this document's location; it does not authorize Git actions (`/home/james/AGENTS.md:3-6`).
2. Explicit task scope and existing exact authority are reusable; new consequential actions still have gates (`AGENTS.md:35-41`).
3. Auto/no-question mode means no agent-authored duplicate question; missing authority becomes a blocker, and auto mode does not grant commit/push authority (`AGENTS.md:43-53`).
4. Plan mode remains non-implementation; plan records are not commits or native behavior (`AGENTS.md:18-25`).
5. Verification is behavior-relevant and distinct from runtime/model/client outcomes (`AGENTS.md:114-124`).
6. Consequential actions require applicable authority; commit and push are separate, and release authority is not implied (`AGENTS.md:126-134`).
7. Maintainer policy limits itself to repo operations/layout and says it does not define native OpenCode behavior or deployment approval (`docs/maintainer-policy.md:3-5`).
8. Applicable approvals are reused without repeated asking; missing authority blocks action, and auto mode cannot create it (`docs/maintainer-policy.md:68-71`; autonomy contract `:22-38`).
9. Current Git guidance protects unrelated index/worktree state and bars blanket staging/destructive cleanup (`autonomous-work.md:42-47`; `docs/maintainer-policy.md:52-57`).
10. Handoff's no-question rule retains task scope/native policy and blocks rather than self-grants missing authority (`handoff/SKILL.md:18-27`).
11. Handoff preserves separate commit/push approvals and sensitive-data limits (`handoff/SKILL.md:174-185`).
12. Coordination memory explicitly says it is not standing permission and preserves separate approval gates (`docs/memory/coordination-workflow.md:26-34`).

### (b) Ambiguous, duplicated, or potentially conflicting — 4 findings

1. **Routine Git boundary is underspecified.** `AGENTS.md:35-39` authorizes routine in-scope work and reserves separate commit/push gates; the auto section includes routine Git work (`AGENTS.md:45-49`); the autonomy contract permits task-authorized branch/staging operations (`autonomous-work.md:42-45`). None precisely says which mutating Git operations count as routine, or whether “already-authorized” must name each operation. This is a gap in specificity, not a proven contradiction.
2. **Separate-gate rule is repeated without a shared definition.** See `AGENTS.md:38-39,131`, `docs/maintainer-policy.md:68-71`, `autonomous-work.md:48-53`, `handoff/SKILL.md:181`, and `docs/memory/coordination-workflow.md:34`. The repetitions agree that commit and push are separate approval gates, but do not say whether one explicit statement can grant both distinct acts.
3. **“Exact action” has no common scope schema.** The autonomy contract refers to exact intended files, branch, and remote (`autonomous-work.md:48-53`), while maintainer policy says to reuse exact existing approval (`docs/maintainer-policy.md:68-71`). Neither standardizes whether approval also binds commit message/tree, commit range, target ref, or stopping condition.
4. **Native Ask and operator authority are not equated.** The Build config has a wildcard allow plus specific `repo_commit`/`repo_push` Ask rules (`global/opencode.jsonc:69-78,108-117`), while instructions forbid self-granting and require applicable authority. No cited policy says whether accepting a native Ask prompt alone is the operator's approval, or how that acceptance should be evidenced. The `opencode.json` has no project permission block (`opencode.json:1-33`); it does not resolve this.

The parent file has no matching Routine authorization, Safety, or Auto-approve sections. This absence is not a conflict and is not a basis for inventing parent-level Git wording.

### (c) Genuinely missing; operator decision required — 5 decisions

1. **Commit approval scope:** exactly what single commit is authorized (reviewed tree/files, branch, and whether message or other commit metadata is bound).
2. **Push approval scope:** exactly which resulting commit(s), remote, and destination ref are authorized.
3. **Bundling:** whether one explicit approval statement may grant both distinct acts, and if so whether it covers only one commit/push pair or a bounded batch.
4. **Routine Git reuse:** whether staging/branch/index mutations already named by an authorized task need another gate, beyond read-only status/diff/log/show.
5. **Approval expression and evidence:** which operator action constitutes approval and what durable-in-task record is required before executing it.

## Proposed alternatives — not current policy

Each package below is a reviewable proposed diff, not an applied patch. The three are alternatives; do not combine them. Paths are repository-relative. Option 1 is strict; Option 2 permits one exact paired grant; Option 3 permits a bounded batch grant. All preserve commit and push as distinct acts and require approvals to be explicit and evidenced.

### Option 1 — Fresh gate for every Git mutation; no bundling

**Question answered:** Must staging/branch changes, each commit, and each push have fresh, separate approval? **Yes.** A commit grant covers one reviewed tree on one named branch; a push grant covers only the specified commit(s) to one named remote/ref; no one statement can cover both. Read-only inspection reuses task authority.

**Tradeoff:** strongest action-by-action control, with more interruptions in interactive workflows and more blockers in auto mode. **Affected:** operators, parent agents, and delegated workers performing any mutating Git operation. **Rationale:** maximizes review at each state transition and makes accidental scope reuse difficult.

```diff
*** Begin Patch
*** Update File: AGENTS.md
@@
 - An explicit request authorizes routine in-scope work within current mode and
   permissions. Reuse existing exact authority; do not re-ask unchanged scope.
+  For Git, only read-only inspection is routine by default. Each mutating Git
+  operation, including staging or branch changes, requires a fresh explicit gate.
@@
 - Commit approval and push approval are separate; no implied release authority.
+  Each approval covers one act only. Commit approval names the reviewed tree and
+  branch; push approval names the exact commit(s), remote, and destination ref.
+  The operator must state approval in the current task after an action summary;
+  record its message reference and scope before acting. A commit and its push
+  may not be approved together.
*** Update File: .opencode/skills/development-conventions/references/autonomous-work.md
@@
-Run scoped `git status`, `diff`, `log`, `show` and other permitted routine local
-Git work without questions. Scoped branch/staging operations that the task
-already authorizes are not a reason to stop for a preference survey. Preserve
-unrelated index, staged, unstaged and untracked work; no blanket staging or
-destructive cleanup.
+Read-only Git inspection remains routine. Every mutating Git operation,
+including staging and branch changes, requires its own explicit operator
+approval. In no-question mode, block the unapproved action and continue
+independent work.
@@
-Commit and push remain distinct actions. Verify the exact intended files,
-branch, remote and existing authorization for each. Do not re-ask for an exact
-action that is already authorized and permitted, unless a higher-priority rule
-requires a new final confirmation. If such confirmation/authority is missing
-in no-question mode, record a blocker and continue other work; do not silently
-publish, expand scope or treat autoaccept as a request to commit everything.
+Commit and push remain distinct actions and need separate fresh approvals. A
+commit approval covers one reviewed tree and named branch; a push approval
+covers only named commit(s), remote and destination ref. They cannot be bundled.
+Record the operator's approval reference and exact action scope before use. If
+authority is missing in no-question mode, block the action and continue
+independent work; do not silently publish or expand scope.
*** End Patch
```

### Option 2 — Reuse explicitly scoped routine Git authority; one exact pair may be bundled

**Question answered:** Can one explicit operator statement authorize one commit and its resulting push together? **Yes, but only when it names both acts and their exact scope.** Read-only Git plus task-authorized staging/branch changes need no fresh gate. A commit-only grant never implies push; a push-only grant never implies commit. A paired grant authorizes one commit of the reviewed tree on the named branch and only that result pushed to the named remote/ref.

**Tradeoff:** avoids repeated gates for a precisely reviewed one-commit workflow while preventing vague “commit and push” authority from expanding. **Affected:** operators and agents completing a bounded change with known destination. **Rationale:** preserves distinct authority for each act while allowing one unambiguous statement to grant both.

```diff
*** Begin Patch
*** Update File: AGENTS.md
@@
 - An explicit request authorizes routine in-scope work within current mode and
   permissions. Reuse existing exact authority; do not re-ask unchanged scope.
+  Read-only Git inspection and explicitly task-authorized staging/branch
+  operations need no fresh gate. Other mutating Git operations need applicable
+  authority; commit and push are never inferred from routine task scope.
@@
 - Commit approval and push approval are separate; no implied release authority.
+  Commit approval covers one reviewed tree and named branch. Push approval
+  covers only the resulting named commit, remote, and destination ref. One
+  operator-authored statement may explicitly grant both acts only if it names
+  each scope; otherwise obtain them separately. After summarizing the exact
+  action, record the approval message reference and repo/branch/tree or
+  commit/remote/ref before acting.
*** Update File: .opencode/skills/development-conventions/references/autonomous-work.md
@@
 Commit and push remain distinct actions. Verify the exact intended files,
 branch, remote and existing authorization for each. Do not re-ask for an exact
 action that is already authorized and permitted, unless a higher-priority rule
 requires a new final confirmation. If such confirmation/authority is missing
 in no-question mode, record a blocker and continue other work; do not silently
 publish, expand scope or treat autoaccept as a request to commit everything.
+A single operator-authored approval may grant one commit and its resulting push
+only when it expressly identifies both acts, the reviewed tree and branch, and
+the destination remote/ref. Otherwise, commit and push need separate approvals.
+Record the approval reference and these scopes before acting; never infer the
+second act from approval of the first.
*** End Patch
```

### Option 3 — Reuse scoped routine authority; explicit bounded batch grant

**Question answered:** May one approval cover multiple commits and pushes within a defined task boundary? **Yes, only as a bounded batch grant.** It must separately enumerate the commit and push permissions, repository/worktree, branch, allowed paths or tree boundary, destination remote/ref, maximum number of commits, and a stopping condition. Actions outside that envelope need new approval. Read-only inspection and explicitly task-authorized staging/branch changes need no fresh gate.

**Tradeoff:** least repeated approval for a known sequence, but requires the operator to define a narrower and more complete envelope up front; any scope drift blocks the remaining batch. **Affected:** operators and agents running multi-commit or multi-push workflows. **Rationale:** supports bounded automation without turning a commit grant into implicit publication authority.

```diff
*** Begin Patch
*** Update File: AGENTS.md
@@
 - An explicit request authorizes routine in-scope work within current mode and
   permissions. Reuse existing exact authority; do not re-ask unchanged scope.
+  Read-only Git inspection and explicitly task-authorized staging/branch
+  operations need no fresh gate. Routine authority does not include commit or
+  push unless the operator expressly grants those acts as described below.
@@
 - Commit approval and push approval are separate; no implied release authority.
+  Each is a distinct grant. An operator may expressly bundle a bounded batch
+  only by separately listing authorized commits and pushes, repository/worktree,
+  branch, allowed paths or tree boundary, destination remote/ref, maximum commit
+  count, and stopping condition. No unlisted act or scope change is covered.
+  After an action summary, record the operator-authored approval reference and
+  full envelope before acting; stop at the first unmet boundary.
*** Update File: .opencode/skills/development-conventions/references/autonomous-work.md
@@
 Commit and push remain distinct actions. Verify the exact intended files,
 branch, remote and existing authorization for each. Do not re-ask for an exact
 action that is already authorized and permitted, unless a higher-priority rule
 requires a new final confirmation. If such confirmation/authority is missing
 in no-question mode, record a blocker and continue other work; do not silently
 publish, expand scope or treat autoaccept as a request to commit everything.
+An explicit operator grant may cover a bounded batch only if it separately
+lists authorized commit and push acts, repository/worktree, branch, allowed
+paths or tree boundary, remote/ref, maximum commit count, and stopping
+condition. Record the grant reference and full envelope before acting. Treat
+any scope change or unmet boundary as a blocker; never infer push authority
+from commit approval.
*** End Patch
```

## Explicitly unresolved

The recorded blocker remains accurate: “Supplied request contains no substantive replacement commit/push policy. Bounded wording completed; any substantive replacement or corrective peer notice remains unspecified/unapproved.” The later user message, “the substantive policy replacement is unspecified,” confirms that no candidate above is current policy. The operator must select or edit an option; no peer notice is drafted or authorized here.

**No changes to policy/configuration were applied.** Only this options document was created. Applying any option, sending a corrective peer notice, or making any other policy change requires its own explicit approval.
