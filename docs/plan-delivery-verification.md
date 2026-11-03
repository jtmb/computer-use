# Consolidated plan delivery: verification and inclusion scope

Goal: `53eacb15-7fd9-4c20-b4d4-038111b68e6f`.
Source session: `ses_e8275dbd2ffe5vkgrWh4gVCnVB`.
Repository: `github.com/jtmb/computer-use`, local `main`, HEAD
`b47765e4a9f5c124c4716deb52962e17d7fb4a2a` at verification on 2026-10-27.

**[Open the actual goal plan](goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/plan.md)**
and [handoff](goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/HANDOFF.md).
These are generated exports, not hand-maintained plans. Update through goal
tools and the supported companion, not by modifying their contents directly.

## What actually ran

- The existing session was moved to `/home/james/repos/computer-use`; the live
  session API verified that exact location and `build` agent. Its ID and goal
  were preserved. The user explicitly requested implementation; the goal was
  resumed using the goal tool, not by editing its state file.
- The supported active-session API returned only this session running; neither
  historical source session nor another worker was active at that observation.
- Location-scoped plugin inventory verified `computer-use.goal-docs` active
  from canonical repository source, alongside goal-plugin `0.1.67` and desktop
  tools. The home-scoped plugin inventory was not substituted for this check.
- The observer created this goal's package after relocation/resume. An explicit
  repo-scoped `computer-use.goal-docs/export` RPC returned `exported` for this
  session and goal only. No `/handoff` producer or model invocation was run.
- Initial export verification checked active status, plan revision 2, exact
  source/session/worktree identity, all 18 saved criteria (including the
  original 10+5), mandatory Plan/Historical documentation, the four manifest
  hashes and index. Later goal-tool changes advance the generated revision;
  this is a historical checkpoint, not a promise that revision 2 stays current.
- Checks verified older goal package bytes, original Git index and staged
  rename, project/global source configuration and the persistent empty
  singly-linked process-lock inode remained unchanged.
- Added source-only Plan-mode inline-plan and clickable-link instructions to
  `AGENTS.md` and the complete planning skill bundle. Existing dirty content
  was retained; no global agent configuration, runtime copy or service changed.
- `node --test scripts/planning-contract.test.mjs`: three new source-contract
  tests failed before the instruction change; all four tests passed afterward.
- Combined companion, desktop, health-fixture and planning-contract suites:
  **143 tests passed**. Actual `bash scripts/health-check.sh` passed with
  OpenCode v2.1.1, both MCPs connected and repo-scoped required plugins active.
- Node syntax and staged/unstaged whitespace checks passed. Planning bundle
  metadata, ASCII/length bounds and local links passed its source-contract test.

## Proposed selective Git inclusion (not staged or committed here)

The original index is deliberately unchanged. Review these exact files for any
later staging/commit; do not use a blanket `git add docs/` or claim ownership of
all existing hunks in `AGENTS.md` or the planning bundle:

```text
AGENTS.md                                      # only this task's new section
.opencode/skills/planning/SKILL.md              # pre-existing untracked bundle + bounded update
.opencode/skills/planning/README.md
.opencode/skills/planning/references/examples-and-review.md
scripts/planning-contract.test.mjs
docs/plan-delivery-verification.md
docs/goals/README.md
docs/goals/.goal-docs-manifest.json
docs/goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/plan.md
docs/goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/HANDOFF.md
docs/goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/work-history.md
docs/goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/snapshot.json
```

The index and manifest also describe older, currently untracked goal packages.
They must not be committed as dangling references: a later release review must
include/verify those referenced historical packages or choose a supported
complete export scope. Do not hand-trim the generated manifest/index. The source
planning skill and exporter implementation are also pre-existing untracked
work, not solely this task's additions. Any whole-file commit must review that
combined content. Lock/temporary coordination files remain Git-ignored.

## Limits and remaining acceptance

- The instructions are implemented in canonical source; a **fresh Plan-mode
  model response and user/client link-opening check have not run**. Static
  regex/link checks are not behavioral or visual acceptance. Delegation remains
  off; no extra model/fixture session, client focus or restart was used to
  manufacture that evidence. Current source changes do not alter the global
  OpenCode Plan agent or guarantee every client handles local Markdown links.
- Repo-local files exist but remain untracked unless a later explicit staging
  action changes that. No commit, push, PR publication/merge, deployment or
  permission/security change was performed. Commit and push approvals remain
  separate.
- Screenshot findings remain user-deferred, PR #2 remains restricted until a
  fresh permitted read succeeds, handoff continuation remains unverified, and
  loaded-v2 visual acceptance and the genuine action demo remain outstanding.
  This first-fix checkpoint does not complete the consolidated goal.

Preservation baseline: `/tmp/opencode/plan-delivery-baseline-d1cg7w3n` (scratch,
not a durable final artifact). It records original source bytes, index, goal
packages and staged/unstaged patches for comparison, not authority to reset work.
