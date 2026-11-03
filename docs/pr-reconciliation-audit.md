# PR reconciliation audit

**Observed:** 2026-10-27

**Scope:** Read-only review of preserved PR3 and safe prerequisites for PR2. No remote mutation or source/index edits were made. This file is the only new write from this review.

## Current combined-tree refresh — 2026-10-28

This section supersedes old current-HEAD/count wording below, preserving the
earlier audit. Supported GitHub MCP reads, authenticated as jtmb, freshly return
PR3 open/draft, unchanged head `11cbb763328f27ae97c03b8e57f832f0fe9fb78b` and
base `b47765e4a9f5c124c4716deb52962e17d7fb4a2a`. One GitGuardian check is successful;
combined status remains pending with zero contexts, and no reviews were returned.
This is not all-checks-green, merge or publication approval.

Parent reread the full pinned four-text-file diff; the fifth file is Splice.
Local HEAD is **c71b8cc57004a65ed4198cf0e5ae8f256e56f532**, not the old base.
The asset still equals pinned blob `fa88e96fb66a31c8f2d6a041ff846b5f01ab87a1`,
SHA-256 `91ea399b1377d576a960964e7551a050a8cf5fb24c07c776b1fbb9eed91ee05d`.
The pinned diff whitespace check passes. No fetch/checkout/merge/remote mutation
or unread PR2 integration occurred.

Current combined source retains the 224×224 Splice hero, copyable gated setup
prompt, 107-physical-line README and consumer-neutral maintenance skill. Catalog
and inventory now cover 29 bundles. The README's link still said 26: a new dynamic
bundle-count assertion **failed 26≠29 before correction**; only that number changed
to 29, with branding/prompt/media/layout otherwise preserved. This is approved
source documentation maintenance, not a new render or main-demo acceptance.
Original staged patch/index entries and raw index `492cdf87…` remain preserved.

One fresh permitted metadata-only PR2 MCP read again returned **restricted by
lockdown mode**. The supplied head `96fa9e747809245958dcb8fd24b0e9b4300f0e1e`
is still absent locally (cat-file exit 128). No alternate gh/web/fetch/content route
was tried. Its current head/content/checks cannot be established; substantive
review remains blocked. All changes remain uncommitted/unpushed.

## PR3 — preserved draft

- Repository/PR: [`jtmb/computer-use#3`](https://github.com/jtmb/computer-use/pull/3), open and draft.
- Base: `main` at `b47765e4a9f5c124c4716deb52962e17d7fb4a2a`.
- Head: `11cbb763328f27ae97c03b8e57f832f0fe9fb78b` (`docs/readme-splice-maintenance`). Live MCP metadata matched both supplied SHAs; local `HEAD` is the base SHA and the PR3 commit is available in the local object database.
- The pinned diff contains five files (352 additions, 41 deletions): root `README.md`, `.opencode/skills/README.md`, the new `readme-maintenance` skill and usage guide, and `assets/splice.png`. `git diff --check BASE HEAD` was clean.
- The README snapshot is 168 physical lines. The direct skill-bundle count is 23 at base and 24 at PR3 head; the PR3 catalog says 24 and includes the new skill. The README/catalog/skill additions preserve the described documentation-and-branding intent; no runtime source or config is in this PR3 diff.
- **Asset preservation:** the committed `assets/splice.png` blob is `fa88e96fb66a31c8f2d6a041ff846b5f01ab87a1`, equal to the local file's Git object hash. This confirms byte identity only; the asset was not decoded or visually inspected here.

### Finding

**README command drift:** PR3 `README.md:135–136` says the deployment flow is available through `/deploy-global`. At the pinned base, the command source is `global/commands/deploy.md`, which names the command `/deploy`. Correct the README command name during parent-owned integration; this review did not edit it.

### Remote review/check evidence

- No submitted reviews or review threads were returned for PR3.
- The head has one completed check run, **GitGuardian Security Checks: success**. The combined status endpoint reports `pending` with zero status contexts.
- PR3's description reports additional source, Markdown, link, and visual checks. Those are author-reported claims, not independently re-run or observed here. No rendered-page or screenshot verification is claimed in this audit.

## PR2 — blocked from substantive review

- Supplied identity: head `96fa9e747809245958dcb8fd24b0e9b4300f0e1e`; intended base `main` at `b47765e4a9f5c124c4716deb52962e17d7fb4a2a`.
- The permitted MCP `get_files` attempt was reported refused by lockdown. My metadata-only `get` request was also refused with `access to pull request is restricted by lockdown mode`.
- The PR2 head object is absent from this local Git object database (`git cat-file` could not resolve it). No PR2 contents, diff, changed-file list, reviews, or checks were read. No `gh`, web, fetch, or alternate content route was used.
- **Conclusion:** PR2 is genuinely blocked for this reviewer: its content cannot be verified against the supplied SHA under the active access boundary. Do not integrate or declare it safe based on metadata alone. Safe next prerequisite is an allowed read-only source becoming available (MCP access no longer lockdown-restricted, or an already-authorized local pin/object); then confirm the live head/base, inspect the file list and diff, and check overlap with PR3 before any combined integration review.

## Concurrent workspace and preservation note

The checkout was already dirty on `main` at the supplied base. In particular, `README.md` and `.opencode/skills/README.md` were modified, and `.opencode/skills/readme-maintenance/` was untracked, alongside substantial unrelated work. These are not stable copies of PR3's committed snapshot. Later `readme-maintenance` skill additions are acknowledged as separate, legitimate integration work; other children are editing shared skill material and the catalog remains parent-owned. This report therefore audits the pinned PR3 commit, not a final merged worktree state. Preserve all concurrent edits and perform a combined README/catalog/skill review after those edits settle.

No source, index, branch, remote PR, or other working-tree content was changed by this audit. No files were staged, committed, pushed, fetched, or merged.

## Parent combined-tree refresh — 2026-10-27

The parent independently re-read the full pinned documentation diff and current
README, catalog, maintenance skill/usage and local layout rules after source
integration. Permitted GitHub MCP reads still report PR3 **open/draft**, head
`11cbb763328f27ae97c03b8e57f832f0fe9fb78b`, base
`b47765e4a9f5c124c4716deb52962e17d7fb4a2a`. No reviews or review threads were
returned; one GitGuardian check succeeded and combined status is still pending
with zero contexts. This is not an all-checks-green or merge approval.

- Local `HEAD` remains the base; the pinned five-file diff and whitespace check
  are unchanged. No PR branch was checked out, fetched, merged or published.
- The current Splice asset is byte-identical to PR3's blob
  `fa88e96fb66a31c8f2d6a041ff846b5f01ab87a1`; SHA-256 is
  `91ea399b1377d576a960964e7551a050a8cf5fb24c07c776b1fbb9eed91ee05d`.
- The combined README retains the 224×224 Splice hero, single-line copyable
  setup prompt, preview/apply and replacement/backup/credential/publication
  boundaries. It has 107 physical lines and correctly links all 26 skills.
  All 23 local README link/image/anchor targets resolve. No fresh rendered
  light/dark/narrow or image-decoding inspection is claimed here.
- The pinned `/deploy-global` drift is not present in the current README; source
  and the inventory name the actual `/deploy` template. No unnecessary command
  rename was made.
- The maintenance skill/usage now discovers the consumer project's source,
  tools and conventions. Computer-use-only Splice, setup-prompt, line-budget
  and genuine-demo requirements remain in local `AGENTS.md`/layout guidance;
  portability did not discard the PR's maintenance purpose or local branding.
  The catalog's exact category/tag rows match all 26 canonical bundles.
- Fresh integration checks: 74 script tests; 167 plugin/bridge tests; 51 script
  Python tests; the three optional package typechecks and 88 tests; read-only
  health check; and whitespace checks pass. These are not live demo or capture
  acceptance. The original staged binary patch and index entries remain exactly
  equal to their preserved baseline, including the original command rename.

PR2's head object remains absent locally (`git cat-file` exits 128). One fresh
metadata-only read through the permitted MCP again returned **restricted by
lockdown mode**. No alternate client, web, fetch or content route was used; its
current head/content/checks cannot be established and substantive review remains
blocked. The combined PR3 source review is accepted independently, not completion
of the all-PR criterion. All changes remain uncommitted and unpublished.
