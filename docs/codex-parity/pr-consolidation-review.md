## Canonical checkout interpretation — 2026-10-29

This is a retained, bounded PR-review report from
`/home/james/repos/computer-use-delivery`; its access results, PR pins, statuses,
and local comparisons are dated observations, not a current remote refresh. The
canonical checkout is `/home/james/repos/computer-use` on `main`. This
consolidation performed no GitHub/remote read or mutation and does not update PR
state, review coverage, or publication authority.

The canonical parent checkpoint is recorded in
[`main-consolidation.md`](main-consolidation.md) and [`features.md`](../features.md).
The selected source checks (120 connector, 81 browser/benchmark/dependency, 42
runtime, 29 capture, 27 fallback, 27 monitor, six native previews, and 55
adjacent) do not substitute for PR review or full goal/native/model/visible
acceptance. Coordination remains 104/105 because AJV is absent; benchmark and
connector strict checking retain missing local SDK/JSON-Schema blockers, while
the connector source graph passes with authentic declarations mapped only in
scratch. Fresh health passes. The newer canonical feature inventory records
separate ChatGPT image and resource-monitor pilot observations; this historical
report does not deny them or treat them as PR acceptance.

# Pinned PR2/3/4 completeness and combined-tree review

**Observed:** 2026-10-28
**Scope:** Read-only, bounded review for PRs #2, #3, and #4 in
[`jtmb/computer-use`](https://github.com/jtmb/computer-use). This is not a
complete review of all three PRs: PR2 and PR4 code/description remain unread,
and lockdown-filtered discussion responses cannot prove discussion completeness.
No unread code was integrated.

## Access and pin verification

- The permitted GitHub MCP was available in this session. `get_me` returned
  `jtmb`; the configured source pin is GitHub MCP `1.12.1`
  (`config/mcp-versions.json`), and `scripts/github-mcp.sh` retains
  `--lockdown-mode`.
- A supported `list_pull_requests` read returned four PR metadata records on
  page 1 and none on page 2. The identities below matched the supplied PR3 pin
  and the recorded PR2/PR4 pins. The list provided titles, state, author, and
  head/base SHAs, but not descriptions or changed-file contents.
- The current delivery worktree is `/home/james/repos/computer-use-delivery`,
  branch `consolidated-delivery`, HEAD
  `c71b8cc57004a65ed4198cf0e5ae8f256e56f532`. Its scoped state was already
  dirty; this review changed no existing file, index entry, or media.

| PR | Current metadata from the permitted list | Pinned head / base |
| --- | --- | --- |
| [#2](https://github.com/jtmb/computer-use/pull/2) | **Closed, not merged**; “Browser fixes, Playwright re-enable, and email-management skill”; author `shakiata` | `96fa9e747809245958dcb8fd24b0e9b4300f0e1e` / `b47765e4a9f5c124c4716deb52962e17d7fb4a2a` |
| [#3](https://github.com/jtmb/computer-use/pull/3) | **Open draft**; “docs: refresh README with Splice mascot and maintenance skill”; author `jtmb` | `11cbb763328f27ae97c03b8e57f832f0fe9fb78b` / `b47765e4a9f5c124c4716deb52962e17d7fb4a2a` |
| [#4](https://github.com/jtmb/computer-use/pull/4) | **Open, not draft**; “feat(skills): add Kubernetes and Rancher operations skill”; author `shakiata` | `7ac2817c8f91cd2b67a9f1511bffda4be3966d82` / `b47765e4a9f5c124c4716deb52962e17d7fb4a2a` |

## Remote content, pagination, and checks

| PR | Content completeness | Status/check evidence |
| --- | --- | --- |
| #2 | `pull_request_read(get)`, `get_diff`, `get_files`, and `get_commits` each returned **“access to pull request is restricted by lockdown mode.”** No description, changed-file list, diff, or commit list was read. Its pinned head object is absent from this local Git object database. | `get_status` matches the pinned head and reports `pending`, zero status contexts. Check-runs page 1 has one completed **GitGuardian Security Checks: success** run (`122003404823`); page 2 is empty. This is not an all-checks-green result and cannot substitute for code review. |
| #3 | Full `get` metadata/body and `get_diff` were available. `get_files` returned 5 entries on page 1 and none on page 2 (metadata also says 5 changed files). `get_commits` returned 8 entries on page 1 and none on page 2 (metadata says 8 commits). The pinned local PR3 commit is available. | `get_status` reports `pending`, zero contexts. Check-runs page 1 has one completed **GitGuardian Security Checks: success** run (`121983861059`); page 2 is empty. The PR description's other validation statements remain author-reported; I did not rerun visual/runtime checks. |
| #4 | `pull_request_read(get)`, `get_diff`, `get_files`, and `get_commits` each returned **“access to pull request is restricted by lockdown mode.”** No description, changed-file list, diff, or commit list was read. Its pinned head object is absent locally. | `get_status` matches the pinned head and reports `pending`, zero status contexts. Check-runs page 1 has one completed **GitGuardian Security Checks: success** run (`123046979433`); page 2 is empty. This is not an all-checks-green result and cannot substitute for code review. |

For all three PRs, `get_comments` and `get_reviews` returned empty page-1
arrays; `get_review_comments` returned `totalCount: 0` and
`hasNextPage: false`. Per
[`docs/github-read-permissions.md`](../github-read-permissions.md), lockdown
filters comments/reviews by author. Those empty/zero results therefore **do not
prove that no other-author discussion exists**. Discussion completeness remains
unverified; page metadata after filtering is not an unfiltered count.

PR2/PR4 denials are the exact access boundary, not a request to change it. No
alternate CLI, credential, HTTP endpoint, raw diff, Git fetch, permission or
security change was used. The fresh MCP reads worked; this was not a missing-MCP
dependency blocker.

## PR3 against the current combined worktree

The fresh PR3 diff and file list cover five paths: `README.md`,
`.opencode/skills/README.md`, the `readme-maintenance` skill and its usage guide,
and `assets/splice.png`. Its eight commits were fully paginated. Local
`git diff --check` passed for the pinned base-to-head diff.

Current combined-tree observations:

- `README.md` is 107 lines and advertises 29 skills; a direct count finds 29
  root skill bundles. The current catalog also says 29 and includes
  `readme-maintenance`. The current README retains Splice, the copyable setup
  prompt, and the demo placement required by the
  [README layout guide](../readme-layout.md).
- The current `readme-maintenance` source and guide are present as untracked
  worktree files. They have been generalized for consumer portability; the
  local README constraints remain in the
  [README layout guide](../readme-layout.md). The catalog is modified. These
  are current combined-tree inputs, not proof they are staged or committed.
- **High — README media targets are missing from this delivery worktree.** Its
  README references `assets/splice.png`,
  `assets/computer-use-showcase-v2.gif`, and
  `assets/computer-use-showcase-v2.png`, but a scoped search found no
  `assets/*` files here. The original `/home/james/repos/computer-use` checkout
  still has these untracked media files. Its `assets/splice.png` Git blob hash
  is `fa88e96fb66a31c8f2d6a041ff846b5f01ab87a1`, exactly the blob in pinned
  PR3. This is consistent with the delivery snapshot excluding media, but the
  current README is not self-contained until the parent reconciles those
  preserved originals into the delivery tree. I did not copy, restore, or edit
  any media.
- **Resolved pinned-text drift:** PR3's pinned README says `/deploy-global`,
  while the pinned base command source is `global/commands/deploy.md` (`/deploy`).
  The current combined README no longer makes that `/deploy-global` claim.
  Do not reuse the pinned README verbatim without retaining this correction.

The current root skill catalog has no `email-management` or Rancher-named
bundle. A separate `tailscale/` subproject has its own Tailscale deployment
skill and `AGENTS.md` explicitly excludes the external Kubernetes MCP/skills;
that is not evidence of PR4 equivalence. Because PR2/PR4 changed-file lists are
unread, exact overlap, compatibility, and local reconciliation for either PR
cannot be determined from titles or local bundle names.

## Completeness checklist and disposition

- **Complete for this bounded inspection:** current PR metadata pins; PR3
  description, complete five-file diff/list and eight-commit pagination; all
  three exposed status/check-run reads and check-run page exhaustion; PR3
  whitespace check; selected local PR3 compatibility comparisons and media
  presence check.
- **Unread / unresolved:** PR2 and PR4 descriptions, changed-file lists, diffs,
  and commits; unfiltered comments/reviews/review threads for all PRs; exact
  local overlap for PR2/PR4; complete CI/check acceptance beyond the single
  GitGuardian run and zero-context pending statuses.
- **No remote mutation:** no review/comment, merge, commit, push, fetch,
  publication, permission/security change, install, or deployment occurred.
- **Disposition:** PR3 has enough exposed code evidence for this bounded
  source comparison, but its discussion and visual claims are not fully
  verified. PR2 and PR4 remain blocked from substantive review; do not declare
  them complete/safe or integrate their unread code. The missing delivery-tree
  media is a separate parent-owned reconciliation item.

**Ownership release:** I release lane 7's bounded review and this file,
`docs/codex-parity/pr-consolidation-review.md`, to the parent for independent
acceptance. No other path was written or claimed. Parent acceptance is still
pending.

## Parent independent acceptance — 2026-10-29

Parent independently reread PR3 through the configured GitHub MCP after `get_me`
identified `jtmb`. The opening and closing `get` calls both returned head
`11cbb763328f27ae97c03b8e57f832f0fe9fb78b`, base
`b47765e4a9f5c124c4716deb52962e17d7fb4a2a`, open/draft/not merged, five changed
files and eight commits. Parent read the complete description and diff. Files,
commits and check-runs used page size 10; each second page was empty. Combined
status is still pending with zero contexts; the one GitGuardian check succeeded.
Comments and reviews were empty, and review threads reported zero/no next page.
Those lockdown-filtered responses still do not establish unfiltered discussion.

The complete permitted MCP diff exactly equals the existing local pinned Git
base-to-head diff (SHA-256
`9a94202b794fac57340e3f4586123ecdc8849bf65f96effe4ea313151935f086`). Its
whitespace check passes. No fetch or alternate endpoint was used. Parent read
the current README and both current README-maintenance documents, and checked
the catalog entry and count. Current source intentionally differs from all four
PR3 text files: it retains consumer-portable maintenance instructions, autonomous
work rules, the corrected command guidance and the later 29-skill catalog. The
root README remains 107 lines, retains Splice and the single-line setup prompt,
and stays below the local 170-line boundary. Do not replace these files with the
older PR text just to obtain byte identity.

**The media finding above is historical and resolved by the parent's earlier
create-only reconciliation.** All three README media targets now exist here and
are byte-identical to the preserved originals:

| Target | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/splice.png` | 1,316,845 | `91ea399b1377d576a960964e7551a050a8cf5fb24c07c776b1fbb9eed91ee05d` |
| `assets/computer-use-showcase-v2.gif` | 2,216,386 | `523fed6325935568de2784a3680df7d5f40b19c01052e298ebe08f7f04201414` |
| `assets/computer-use-showcase-v2.png` | 164,480 | `3c659ab369fb21da97735247e159009bc8e4c79beb28e695ba9ac01636f9232e` |

Splice also exactly matches the pinned PR3 blob. These comparisons establish
source/media preservation, not a newly recorded simultaneous demo, light/dark
rendering, published GitHub rendering or approval to replace the main assets.
Parent accepts lane 7's PR3 source comparison within these limits. Full PR2/PR4
code review and unfiltered discussion remain blocked; no PR, task, phase or goal
is declared complete, and no remote mutation, new integration or release occurred.

## Later permitted-access refresh — 2026-10-29

An interrupted combined tool call yielded no result and was not treated as a
fresh identity check or denial. Parent then completed two separate supported
read-only calls: `get_me` returned `jtmb`, and
`pull_request_read(get, jtmb/computer-use, 4)` again returned exactly **“access to
pull request is restricted by lockdown mode.”** This confirms the current access
blocker, not the freshness of PR4's head/base or completeness of its discussion.
No alternate client, endpoint, credential, fetch or policy change was attempted;
unread integration remains prohibited. The active goal was not mutated by the
already-active `/resume_goal` command.
