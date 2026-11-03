# Consolidated plan — `computer-use` (2026-10-27)

Scope: this repository only (`jtmb/computer-use`, worktree `main` at
`/home/james/repos/computer-use`). This document is a **plan**, not execution
authority. Routine in-scope follow-up is authorized by the user's request; new
consequential actions keep their gates (§7).

## 0. Why this plan is a document, not a goal plan

Both repository goals are closed: `a0ce8b0f…` (cancelled, revision 59) and
`d1ff47da…` (cancelled, revision 9). Goal tools refuse edits to closed goals
(`cannot update a closed goal's plan`), and a cancelled goal must not be
reopened or silently duplicated. So the merged scope lives here until the user
creates one new goal. Nothing below was executed while preparing this plan.

## 1. Inventory of current work (source identities, real status)

| Source | Status | What it owns now |
| --- | --- | --- |
| Goal `69b8f91d…`, session `ses_e852…` | `complete`, rev 6 | Desktop/AT-SPI tool definitions for this repo. Done — do not reopen. |
| Goal `512d114e…`, session `ses_e846…` | `unmet`, rev 4 | v1 bounded window tools. Superseded by the v2 bridge; keep as history, do not reopen. |
| Goal `d1ff47da…`, session `ses_e846…` | `cancelled`, rev 9 | GNOME window-control v2 + simultaneous README demo. Inherited in full (§4, §5). |
| Goal `a0ce8b0f…`, session `ses_e852…` | `cancelled`, rev 59 | Nine review findings, goal-docs exports, handoff transfer, PR integration. Inherited in full (§2, §3, §6). |
| Transfer record [`docs/demo/HANDOFF-d1ff47da.md`](demo/HANDOFF-d1ff47da.md) + snapshot | received | Source-qualified scope for the row above. Delivery/stop receipt files were never created and are **not** a dependency. |

Evidence that is current, not stale:

- Producer flow verified end-to-end earlier: export → one independent
  same-worktree destination → full pending seed (`resume:false`) → real tab
  focus and open acknowledgement, plus a read-only context preview
  ([`docs/handoff-live-acceptance.json`](handoff-live-acceptance.json)).
- Findings 2, 7, 8 and source-aware handoff guidance are implemented and tested.
- Bridge v2 is installed, enabled and **ACTIVE**; maximized windows now report
  `canResize=true`. Typed inventory returned live compositor data.
- Root README is 98 physical lines; 26 skill bundles; 139 plugin/desktop/health
  tests passed at the last full run.

Stale or superseded claims to ignore:

- `d1ff47da` revision-9 “lock hold” wording — superseded by the later live
  session-2 observations.
- Old `stage.json` PIDs/window IDs, pre-restart demo browser, and the
  pre-login extension state.
- `composition-check/` (leaks unrelated tab titles) and
  `native-helper-offline-check/` (idle tooling only, labelled **NO TASK
  ACTIONS**).
- The quarantined clip `…/live-frame-smoke-v2/` — inspect JSON only, never
  decode/export/publish.

## 2. Workstream A — approval friction (do first; it lowers the cost of everything else)

Goal: an explicit user request authorizes its routine in-scope operations; only
new or consequential actions prompt. No blanket autoaccept, no removal of the
untrusted-goal wrapper, no `/autonomy` command.

Effective permissions today (`global/opencode.jsonc`, Build agent): `*` allow,
then `github_*` **ask**, `repo_commit` ask, `repo_push` ask. The blanket
`github_*` ask catches read-only calls too — the main source of repeated
prompting.

| # | Task | Dependency | Completion evidence |
| --- | --- | --- | --- |
| A1 | Read the live agent/tool policy and enumerate the actual GitHub tool action IDs (read vs mutating). No config change. | — | Recorded action list from live policy/inventory, not guessed names. |
| A2 | Narrow `global/opencode.jsonc`: allow the enumerated read-only GitHub actions; keep `ask` for create/update/merge/delete/fork/publish; keep `repo_commit`/`repo_push` ask. | A1 | Config diff limited to the Build permissions block; `opencode debug config` shows reads allowed, mutations asking. |
| A3 | Instruction wording in `AGENTS.md` and affected skills: explicit request = authorization for its routine in-scope steps; do not re-ask to continue or repeat the same action/scope; keep consequential gates. | A2 | Diff review; no safety rule removed; skills still name their gates. |
| A4 | Reconcile [`global/commands/handoff_resume.md`](../global/commands/handoff_resume.md) and [handoff skill](../.opencode/skills/handoff/SKILL.md): continuation authorized by the user's request; verify source identity once per session; no receipt/export/health prerequisites; keep source/worker conflict gates. Skill already updated to delivery-first — command file still document-heavy. | A3 | Command text requires one verification pass, not repeated paperwork; still refuses unrelated-goal substitution. |
| A5 | Acceptance tests (manual, bounded): GitHub read runs un-prompted; a mutating GitHub call prompts; goal continuation does not re-ask; named-chat handoff delivers immediately; commit and push still prompt separately. | A2–A4 | Short recorded transcript per case. |

Dependency note: A2 is a config change → needs the user's explicit approval at
apply time (it is not covered by “formulate a plan”). A3/A4 are text edits.

## 3. Workstream B — finish the nine-finding repair (`a0ce8b0f`)

| # | Task | Status / dependency | Completion evidence |
| --- | --- | --- | --- |
| B1 | Findings 2, 7, 8, and source-aware handoff guidance | **Done.** | Existing tests/live policy checks. |
| B2 | Findings 1, 3, 4, 5, 6 (screenshot ownership, cleanup truth, full PNG validation, bounded read, capture lifecycle) | **Blocked by user deferral.** Needs a capture contract: request-correlated output with truthful retention. | Would require approval of the interaction/retention model first; backend stays untouched meanwhile. |
| B3 | `/handoff_resume` explicit-continuation acceptance | Command exists and is deployed; one approval was granted but never used (goal was cancelled). | One bounded run in the retained destination: identifies source + blockers, no edits, no goal change. |
| B4 | PR #2 review (browser fixes, Playwright re-enable, email skill) | **Blocked:** GitHub MCP returns “restricted by lockdown mode” for changed files. | Needs a permitted read path or a user-supplied patch; do not bypass. |
| B5 | PR #3 local carry-back | **Done**, including later additive README-maintenance edits that preserve the accepted content. | Existing verification; no action. |
| B6 | Final combined checks + audit of the nine findings | After B2/B3/B4 resolve. | Tests, health, whitespace, docs reconciliation, explicit list of what remains unverified. |

## 4. Workstream C — window-control v2 live acceptance (`d1ff47da`)

| # | Task | Dependency | Completion evidence |
| --- | --- | --- | --- |
| C1 | Read-only state check: extension version/enabled, session locked?, bridge `GetState`, fresh epoch and window IDs. | — | Live typed output; no mutation. |
| C2 | Confirm installed bundle matches canonical `tools/gnome-window-control/`; no reinstall unless drift is shown. | C1 | Byte comparison + `gnome-extensions info`. |
| C3 | v2 restore/placement acceptance on the disposable public terminal: inventory → fresh preview → apply → readback → isolated visual check; focus selected IDs; preserve the user's terminal. | C1, C2 | Real readback + screenshot; stale-token refusal shown once. |
| C4 | Record the result in [`docs/demo/window-control-verification.md`](demo/window-control-verification.md), replacing the “pending v2” line with observed fact. | C3 | Doc diff; v1 record kept as history. |

## 5. Workstream D — simultaneous README demo (`d1ff47da`)

| # | Task | Dependency | Completion evidence |
| --- | --- | --- | --- |
| D1 | Diagnose the live-frame freshness failure and the generic blocked-context stop, metadata only. Fragmented-MP4 live extraction is a lead, not a proven cause. | — | Written cause list + reproduction or explicit “undetermined”; quarantined clip untouched. |
| D2 | Fix/verify capture lifecycle: obtain a fresh decoded frame while recording continues; keep continuous genuine footage, privacy and freshness checks intact. | D1 | A short real capture that yields a valid live frame. |
| D3 | Refresh the stage: owned demo profile, clean signed-out two-window composition, new IDs, empty public demo session `ses_e837…` re-confirmed. | C3, D2 | Current stage metadata + empty inbox check. |
| D4 | Record real simultaneous OpenCode + app actions (real prompt, tool activity, completed result). No pre-rendered chat, no idle footage counted. | D3 | One continuous recording + logged real outcomes. |
| D5 | Produce a short real action/motion preview and get explicit user approval before replacing any main demo. | D4 | Preview artifact + approval. |
| D6 | Final media: encode versioned GIF/still, decode every frame, check loop seam, add still/text alternative and honest sample/timing disclosures; route only approved media in the README. | D5 | Decoded-frame report + README review. |

## 6. Workstream E — docs and consistency

| # | Task | Notes |
| --- | --- | --- |
| E1 | Keep [`docs/demo/README.md`](demo/README.md) drafts-labelled until D5 approval. | No premature “accepted” claim. |
| E2 | `docs/goals/*` are exported records; do not regenerate or hand-edit them for this plan. | Historical only. |
| E3 | Preserve branding, root README < 170 physical lines (currently 98), and all existing local links. | Check after any doc edit. |

## 7. Ordering and dependencies

```text
A1 → A2 → A3 → A4 → A5        (friction removed first; A2 needs approval)
C1 → C2 → C3 → C4
D1 → D2 → D3 (needs C3) → D4 → D5 (approval) → D6
B3 (needs a live goal) ; B4 (needs access) ; B2 (needs user decision) ; B6 last
```

Work that can proceed in parallel: C1/C2 and D1 are read-only and independent;
A3/A4 are text-only.

## 8. True blockers

1. **Screenshot findings 1/3/4/5/6** — explicit user deferral; needs a capture
   contract decision. Not a technical dead end.
2. **PR #2** — GitHub MCP lockdown blocks changed-file reads. Needs permitted
   access or a supplied patch.
3. **Live capture root cause** — unknown until D1; diagnose before promising a
   demo date.
4. **Continuation model run (B3)** — needs a live goal + explicit approval; the
   earlier approval lapsed with the cancelled goal.
5. **Demo replacement** — needs D5 preview approval.
6. **Release actions** — commit, push, PR publication, deployment and merges
   each remain separately gated.

## 9. Conflicts and deduplication

- **Two capture systems, one rule set.** The screenshot backend (findings 1–6)
  and the native GNOME recorder (demo) are separate. Recorder work must never be
  used to justify relaxing screenshot ownership/cleanup requirements.
- **v1 vs v2 window tools.** Treat `512d114e` as historical; v2 acceptance is
  the live criterion. Do not reopen the unmet v1 goal.
- **Two handoff surfaces.** The TUI producer (`/handoff`) and the Markdown
  continuation command (`/handoff_resume`) stay distinct; only the command is
  used to continue work.
- **README ownership.** PR #3 content, later additive edits, and demo routing all
  stay; no whole-file replacement.
- **Goal records.** `docs/goals/` exports show `cancelled` for both active
  efforts — that is transfer bookkeeping, not completion.

## 10. Immediate next step

Create one new goal carrying this consolidated scope (the only way to make the
plan actionable through goal tools), then start with A1 (read-only) while C1/C2
and D1 can run in parallel. Without a new goal, only read-only planning work is
possible.
