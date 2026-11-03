# Native Git diff index protection — unapplied source correction

Status: **unapplied to native; scratch application verified**. No native source, installed client, repository
configuration or user index is changed by this artifact.

## Source and correction

The frozen OpenCode2.1.1 input is commit
`ba546ec1598a70db2570e9c6258028d955ba8f58`, file
`packages/core/src/plugin/vcs/git.ts`, Git blob
`d44ba281352789914e3c08a50d7f3b19d5b146d4`.

Parent read all752lines. The common `cfg` array already disables optional locks,
but does not disable `diff.autoRefreshIndex`. Every `makeGit` command is built
from `[...cfg, ...args]`, including tracked-name/numstat/patch queries and the
temporary-index untracked batch. The initial432byteartifact adds the process-local
`-c diff.autoRefreshIndex=false` pair. The current correction also filters stat-only
names against complete numstat results and refuses incomplete diff statistics,
preserving valid zero-count changes. It does not persist a Git setting, alter
pathspecs, remove existing protections or authorize a checkout.

This carries the same mitigation used by the independently accepted local
`scripts/checkout-preflight.mjs` correction into the native provider source.
Earlier Git2.53.0 observations demonstrate that porcelain diff can refresh index
stat/checksum bytes despite `--no-optional-locks` or `GIT_OPTIONAL_LOCKS=0`, while
the process-local config suppression preserved the original raw index. See
[the retained local mechanism and failure history](../../docs/session-consolidation-2026-10-29.md).
Those observations establish the reason for the patch, **not** a fresh native
provider runtime result or the cause of the earlier actual-model index mutation.

## Scratch verification — 2026-11-02

After the later verification instruction, the unchanged432bytepatch passes exact
pinned-file check, scratch-only apply, reverse check and byte-exact reverse.
Whole patched source differs only by the intended118bytes/three added lines.
Four deliberate duplicate/wrong-preimage/malformed-hunk cases refuse and preserve
their target bytes. Complete selected-file TypeScript6.0.3syntax parsing passes;
an explicit malformed suffix yields three syntax errors. This is not full types,
native adapter execution or an old model/index-control rerun. See the
[actual commands, identities and limits](../../docs/native-git-index-verification-2026-11-02.json).

## Limits and remaining acceptance

### Provider-path correction — 2026-11-02

New actual-provider/synthetic-repository tests find a real flaw in the initial
patch: status passes, but two working-diff paths include a content-identical file
with stale timestamps. Disabling Git's automatic refresh exposes stat-only names.
Those failures are retained, not corrected by weakening the expected file list.

The current2511bytepatch retains the protected prefix, carries internal stats
validity, rejects incomplete diff statistics and filters names only against a
complete content-compared numstat list. Binary, mode-only and staged-empty changes
remain included even with zero line counts. Status keeps its existing interface.

The materially changed patch checks/applies to scratch and yields the exact whole
27285bytes consumed by five passing cases, plus a separately passing new unborn
repository case for the changed empty-stat default. They exercise real Git subprocesses
from the actual adapter/helpers and compare complete synthetic index/config bytes,
temporary-index routing and cleanup. Five exact source faults fail across the two
recorded batches. One accidental
patch-context space is refused and preserved before its narrow correction.
See the [actual failures, correction and boundary](../../docs/provider-git-index-verification-2026-11-02.json).

### Explicit-base committed/branch follow-up — 2026-11-02

Two additional cases exercise the unchanged corrected source against an explicit
earlier base, committed changes and staged/unstaged/untracked distractions.
Committed mode selects only HEAD changes; branch mode includes the working state.
Both verify exact file/patch selection, actual base/target arguments and unchanged
complete synthetic index/config bytes. Three new mode/base faults fail; earlier
accepted cases and controls are not rerun. No further production correction is
needed. See the [follow-up evidence and limits](../../docs/provider-git-review-modes-verification-2026-11-02.json).

### Best-effort status follow-up — 2026-11-02

The original provider already parses partial statistics even after a failed or
cut-short count command. Status keeps the independent file list, uses available
counts, recovers missing added-file counts and defaults missing tracked counts to
zero without calling the file clean. It does not use diff's explicit error API.

Two new partial-stat cases pass against both original and unchanged corrected
scratch source, preserving complete synthetic index/config bytes. Four new faults
fail; earlier accepted cases/controls are not rerun. No further production change
is justified. See the [status fallback evidence and limits](../../docs/provider-git-status-fallback-verification-2026-11-02.json).

### Still required

- The frozen provider and native pin remain untouched. This is a separate source
  artifact, not part of the native-row patch or that patch's existing preview.
- At the 2026-10-31 source-only checkpoint no tests/check/application followed the
  earlier no-more-tests direction. The later instruction supersedes that testing
  restriction only; the new scratch result does not apply the patch to native,
  install, activate, restart, commit or push anything.
- Application must first confirm the exact pinned source identity and intended
  one-file scope under applicable authority; do not apply to a running/deployed
  profile or discard dirty work to make a check pass.
- Loaded native plugin/AppProcess/service and full strict verification remain
  outstanding. The new scratch adapter/subprocess results are not installed,
  model or real-user-checkout acceptance. Strategy-closure and oversized-dist
  review limits remain unchanged.
- No future Git-version guarantee, atomic filesystem protection, broad no-write
  claim or release readiness is inferred from adding one config pair.
