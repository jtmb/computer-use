# Exact read-only GitHub permissions (source only)

## Approved boundary

On 2026-10-27 the user selected **Approve source only** for exact exceptions for
29 reviewed read-only GitHub MCP tools in `global/opencode.jsonc`. This approval
does not authorize deployment/reload, remote mutation, broader autoaccept, a
commit or a push. MCP lockdown is unchanged; these rules cannot unlock a PR diff
that the GitHub server refuses.

The [canonical config](../global/opencode.jsonc) keeps `github_*` as `ask`, then
allows only the 29 exact tool IDs. The [regression inventory and source-policy
probe](../scripts/github-permissions.test.mjs) records all 46 reviewed tool names:
29 reads, 17 mutations. No `github_get_*`, `github_list_*` or other prefix allow
was introduced; a future tool still asks until separately reviewed. All current
mutation tools and separate `repo_commit`/`repo_push` checks still resolve to
`ask` in the source-policy probe.

Evidence for action IDs and ordering:
[official V2 permissions](https://opencode.ai/v2/docs/permissions) specifies
`<server>_<tool>` MCP actions and last-matching-rule wins. The actual repo-scoped
Build policy and complete available GitHub MCP tool schemas were read before
the source edit. The [wrapper](../scripts/github-mcp.sh) still passes
`--lockdown-mode`.

## Verification actually performed

- New permission tests failed on the old config (read tools still asked and
  exact exceptions were missing), then passed after adding only the approved
  rules. The continuation-guidance check also failed before its source update.
- Six new tests cover all 29 reads/17 writes, unknown future get/list tools,
  exact unique exceptions, rule ordering, separate commit/push gates, unchanged
  goal-plugin/lockdown controls, and retained continuation safety guidance.
- **149 combined tests passed** (desktop, goal-docs, health fixtures, planning
  and permission source contracts); Node syntax and staged/unstaged whitespace
  checks passed. Whole-config comparison confirmed no changes except the 29
  Build read exceptions. The original staged patch/index was preserved.
- Read-only live Build-policy readback **after** the source edit still had zero
  exact GitHub read allows, `github_*: ask`, `repo_commit: ask` and
  `repo_push: ask`. This confirms the source change has **not** been rolled out;
  it does not claim routine runtime reads stopped prompting.
- `AGENTS.md` now clarifies that an explicit request covers routine in-scope
  operations without repeat continuation approval. The canonical
  [continuation command](../global/commands/handoff_resume.md) adds the same rule
  and explicitly rejects nonexistent-receipt paperwork. Existing source IDs,
  unrelated-goal refusal, paused/closed state, worker-overlap/unknown-coverage
  checks and separate consequential gates remain intact. The handoff skill's
  named-chat deliver-first workflow was not modified.

These are source-policy and instruction-contract tests, not the server's native
permission resolver, a live model-behavior test or proof of rendered prompts.
No remote write was invoked to test a gate. After a separately approved rollout,
re-read effective Build policy and test routine reads plus a safe non-mutating
native policy probe for writes/commit/push before claiming runtime acceptance.

## Pending rollout

Deploying the canonical source requires a separately approved, explicitly
selected target and bounded field-preserving change. Do not copy the whole
global source over the active profile: it includes unrelated machine-specific
paths/model settings. Verify effective policy after any approved rollout and
preserve the pre-change profile for rollback. No deployment or restart has been
performed for this change.

## PR author-trust diagnosis — 2026-10-28

Fresh permitted reads authenticate as `jtmb` and identify PR4's author as
`shakiata`, head `7ac2817c8f91cd2b67a9f1511bffda4be3966d82`, base
`b47765e4a9f5c124c4716deb52962e17d7fb4a2a`. Description, files and commits
remain refused by server lockdown; the prior diff request was also refused.
GitGuardian reports success, while combined commit status has zero contexts.
Neither check result proves review completeness or code safety.

The [configured pin](../config/mcp-versions.json) selects GitHub MCP v1.12.1.
Inspection of that tag's upstream
[PR guard](https://github.com/github/github-mcp-server/blob/v1.12.1/pkg/github/pullrequests.go),
[author check](https://github.com/github/github-mcp-server/blob/v1.12.1/pkg/github/lockdown.go)
and [trust cache](https://github.com/github/github-mcp-server/blob/v1.12.1/pkg/lockdown/lockdown.go)
shows that this is an author-trust refusal, not an authentication failure:
private repositories, authors with push access, viewer-authored content and
trusted bots are permitted. The inspected guard has no per-PR exception.

**Discussion completeness correction:** issue comments and reviews are filtered
by author under lockdown. Their empty responses do not prove there is no hidden
discussion. The review-thread response reported totalCount0 and hasNextPagefalse,
but that does not make the unread description/code reviewable. Complete access
must be re-established and all discussion reread before consolidation.

The remaining access boundary needs an exact complete user-supplied pinned export
or separately authorized policy remediation. Do not grant the contributor push
access or change repository visibility merely to read a PR. Do not use another
endpoint/client/credential, a raw diff URL or Git fetch to route around denial.
No lockdown/config/account/security change, unread integration or remote write
was performed. PR4 remains unresolved; independent source preparation does not
mean this gate has passed.
