# Canonical-main consolidation — 2026-10-29

Later, the user consolidated project-session continuation into
`ses_e78fdcc9affeNOlKMRek7Yobo3`; see the
[current single-chat record](../session-consolidation-2026-10-29.md).
The ownership/worker observations below are dated source-consolidation evidence,
not a second current execution queue or permission to remove the old worktree.

User-directed source consolidation in `/home/james/repos/computer-use`, branch
`main`. The session was moved through the supported API. The old
`/home/james/repos/computer-use-delivery` worktree is a read-only input now; remove
only that old worktree after all unique work/history is preserved, source merges
are independently reviewed and applicable checks finish. No commit, push,
publication, deployment or real profile change is authorized by consolidation.

Initial comparison is captured at
`/tmp/opencode/canonical-consolidation-2ydaac_x/baseline.json`, with exact staged
patches. It records 473 identical, 52 delivery-only, 193 main-only and 127 differing
file/mode entries. Generated dependency/cache trees, Git metadata and the separate
`voice-assistant` repository are excluded from this source comparison, not silently
proven preserved by it. Final old-folder removal needs a separate inventory and
preservation disposition for those entries too.

## Peer context and preservation

- `ses_e7b2588f9ffex9fhCMGyFF15LJ`: canonical-root identity verified; latest six
  assistant messages concern microphone startup and include a running shell;
  selected foreground map also reports running. Preserve `voice-assistant` and
  do not infer descendant quiescence from an old successful outcome.
- `ses_e7bc63eaeffeOdexMk6GFp6VE7`: canonical-root identity verified; latest six
  assistant messages concern image-only previews, ChatGPT/direct integration and
  source tests. Saved idle/success and active-map absence are not full process
  quiescence proof. Preserve all canonical-only direct/image/skill work.
- Retrieval was read-only and bounded, not a message or activation. An initial
  message output included unnecessary native payloads; subsequent reconciliation
  filters text, file paths and tool-state metadata only. Imported claims remain
  historical until verified against actual source and commands.
- Canonical `main` starts at `70e0477496e25655911341a07e00d55b2a5a61d9`, ahead
  three commits, with unrelated dirty/untracked work and exact staged R100
  `resume.md` → `handoff_resume.md`. Delivery starts at `c71b8cc57004a65ed4198cf0e5ae8f256e56f532`.
  Do not stage, reset, switch, reintroduce deleted commands, or overwrite newer
  source merely because a delivery file exists.
- Generated `docs/goals` and nested historical archives are not merge targets.
  Preserve discrepant delivery originals separately without rewriting manifests,
  lifecycle records or source/worktree identity. Native goals remain tool-owned.

## Current literal source ownership

Parent owns all goal planning, shared docs, scripts/global/plugin reconciliation,
preservation inventory, final verification and any old-worktree removal. Three
Luna/xhigh implementation lanes have non-overlapping canonical write scopes:

| Lane | Exclusive canonical write scope | Expected return |
| --- | --- | --- |
| 24 Browser/runtime | `tools/computer-use-browser/`, `tools/computer-use-runtime/`, `.opencode/plugins/computer-use/` | Reviewed union of delivery bounds/benchmark comparator/private-entry/held-source fixes and canonical changes; offline behavioral tests; no native/browser/profile run |
| 25 Coordination/native/import UI | `tools/session-coordination/`, `tools/opencode-native-row/`, `tools/opencode-plugins/provider-fallback/`, `tools/opencode-plugins/resource-monitor/` | Preserve canonical monitor improvements while merging delivery identity/liveness/declaration/native-source work; tests, exact conflict dispositions and typecheck prerequisites |
| 26 Connector | `tools/chatgpt-connector/` ONLY | Preserve all newer canonical image/backend behavior, integrate compatible delivery verifier/library-readiness protections; leave `tools/chatgpt-direct/` and live profiles untouched |

All other paths, generated archives, dependency trees and nested repositories are
excluded from child writes. No descendants, goal operations/planning fixtures,
installs, runtime/profile/account/credential actions, permission changes, native
host/compiler reruns, deployment, publication, commits or pushes. Children inspect
per-file status/diffs, preserve unrelated work, check for concurrent edits, and
report uncertain merges rather than overwriting them. Parent runs expensive
compiler checks serially after source review; children may run bounded offline
behavioral checks after confirming their real I/O boundaries.

Reports must include every copied/merged/preserved/conflicting path, exact commands
and counts, limitations, and terminal ownership release. A child's green report
is not independent acceptance or permission to delete the old folder.

## Parent acceptance checkpoints

### Connector lane 26 — source accepted with installed-readiness blocker

`ses_e794e23a1ffewK7L22nVrXkB3h` returned terminal and released its scope.
Parent compared all connector baseline hashes: exactly the six reported paths
changed/removed; canonical backend/image/direct-adapter source stayed unchanged.
The merge retains canonical runtime pins and 112 existing tests, adds eight real
verifier cases (oversize acquisition, growth, FIFO/replacement and lock metadata),
and checks the JavaScript implementation rather than a handwritten declaration.
Parent reran `npm test`: **120/120**, zero skipped. No provider/account call.

Parent also retained delivery's two distinct declaration/compiler-readiness tests
as `test/dependency-readiness.test.mjs`, with a separate bounded
`npm run test:readiness` entry. The local-dependency test currently **fails**:
canonical `node_modules/@types/json-schema` is absent. The library negative
control passes: actual configured compiler rejects `MissingExternalContract`.
The direct strict TypeScript 5.9.3 invocation likewise exits 2 with two TS7016
errors for the missing declaration; this is not an installed-ready package.

A public npm tarball at the exact lock URL/SHA-512 was downloaded only to
`/tmp/opencode/connector-strict-B5MZli`; its declaration SHA-256 is
`f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1`.
Adding only scratch `typeRoots` did not fix module resolution (same two errors).
An explicit scratch `paths.json-schema` mapping to those authentic bytes then
passed the complete inherited package config: strict, noEmit, skipLibCheck false,
allowJs/checkJs, unchanged source/test include graph. No source config bypass,
declaration shim, dependency installation or shared `node_modules` edit occurred.
That is source compatibility evidence, **not installed or loaded readiness**.

### Browser/runtime lane 24 — parent behavior checks accepted

`ses_e794e23e6ffer6EQ2JCYKKM5fM` returned terminal and released its three scopes.
Parent compared all baseline hashes: exactly the reported 15 files changed/added.
The staging correction accepts the run owner's pre-created private empty workspace
and retains checks against nonempty/symlinked/foreign/public paths. Production
still defaults to real dependency verification; offline fixtures explicitly inject
their fake dependency projection. Comparator exposure is exactly `execute` for
Code Mode and the eight browser tools without `execute` for directTools.

Independent bounded runs passed **81/81** browser/benchmark/dependency tests
(46 + 35), **42/42** runtime tests (including all fake-helper descendant cases),
and **29/29** capture logic/held-source tests. Runtime strict/library and base
browser checking pass. The benchmark's real strict compiler exits 2 for missing
local SDK declarations and their downstream implicit-any errors; it is not
accepted as an installed-ready strict bundle. No real browser, provider, dialog,
capture or model dispatch occurred. Runtime `acceptance-preflight.mjs` and its
test still need parent import/review against the existing GNOME preflight;
the child correctly left that cross-package utility out of its merge.

### Coordination/native lane 25 — partial acceptance, dependency failures retained

`ses_e794e23eaffeSjgSMR1JwxSXQ6` returned terminal and released all four scopes.
Baseline comparison confirms 17 additions, 28 changed files and no deletions.
Monitor source retains canonical thread traversal, ELF/auxv unit discovery and
root TUI entry while adding PID/parent/start-identity checks. Parent independently
passed **27/27** monitor and **27/27** fallback behavioral tests, and **6/6**
native-row previews using a disposable clone of the exact official upstream pin.
The upstream checkout itself was not edited. Native full-host compiler/OOM/RSS
and loaded UI limits remain open.

Parent's selected coordination batch returned **104/105**, not the child's claimed
105/105: real AJV schema validation fails because canonical local `ajv` is absent.
That failure remains binding; the batch excluded the separately identified four
dependency-readiness cases explicitly, not a failing behavior case. The package's
actual AJV test was run and failed, not filtered. Remaining source diff review,
installed-readiness checks and serial compilers are pending. No native active
participants or package activation is claimed. All lanes are now terminal;
parent has sole consolidation write ownership. No new child assignments exist.

## Complete old-tree preservation

The non-excluding inventory records 115,355 entries: **102,815 regular files**,
**114 symlinks**, no special files, and 1,033,078,837 regular-file bytes. The first
asynchronous-stream inventory timed out without producing a manifest; a complete
synchronous bounded-buffer scan succeeded and is the actual retained evidence.

Backup directory:
`/home/james/Documents/computer-use-delivery-preservation-20261029/`.

- `computer-use-delivery.tar`: SHA-256
  `84fd74d7dc00460b3bbcef7a3daded4eeef01ef44f9438fea036cd9c01ee91b4`.
  Includes dependency/cache trees, all divergent generated archives and obsolete
  command originals verbatim; nothing is overwritten into active canonical source.
- `worktree-git-metadata.tar`: SHA-256
  `5e014d8d9715db4df7383b3c1a59feb7ec27166c2a6a875281b7fc6f01138f71`.
  Preserves linked-worktree index/HEAD/log metadata separately from the `.git`
  pointer in the main archive. Shared history remains in the canonical common
  Git directory; `refs/heads/consolidated-delivery` is still `c71b8cc…`.
- `delivery-complete-inventory.json`, two-root `baseline.json`, staged patches,
  `parent-imports.json` and `preservation-receipt.json` are retained alongside.
- `tar --compare` succeeded. A complete extraction under
  `/tmp/opencode/delivery-restore-check-W1AXNn` then matched every inventory entry,
  regular-file SHA/size/mode and symlink target, with no extra paths. No Git
  operation was run in the restored tree (its `.git` is only preserved data).

Canonical-only README/catalog/coordination-skill improvements, `.gitignore`,
`global/cli.json`, direct-image work and the Tailscale tag/decimal-mode fix stay
canonical; older delivery counterparts are retained only in the backup. No
`handoff.md` or `resume.md` command is resurrected. Generated goal bytes/manifests
are never manually merged or rehashed. This backup proves current old-tree
preservation, not the lost initial 637-path baseline or historical provenance.
The old folder has **not** been removed: shared guide/coverage reconciliation,
remaining cross-package source imports, full checks and final identity/index
comparison still precede that explicitly authorized conditional operation.

### Read-only preservation-evidence follow-up — 2026-11-01

The [bounded preservation investigation](../preservation-evidence-investigation-2026-11-01.json)
checks actual task-owned backup/receipt manifests and saved index snapshots,
not only current source hashes. The878Bpreservation receipt retains the historical
115,355-entry/full-restore claim; that large tar/restore was **not** rerun. A
complete read of the406,214Btwo-root baseline refuses the unchanged256KiBfile
cap. Its one forward256KiBprefix contains a complete793-key path/size/mode/hash
object, not the lost original637-path baseline. The first array-only projection
missed this object; the corrected reread overlaps the same bytes and is not a
full-file hash, second partition or unique-content total. The34.6MBfull inventory
and1.24GBmain tar are not read/rehashed here.

The40,960BGit-metadata tar **is** read as inert data and matches its prior hash.
Its exact29,686Blinked-worktree index matches the historical`f830a1ae…47ae`
anchor, not the later model fixture's missing before-index. No archive is
extracted to disk or restored. For actual model case AGR-PS-027, the8150Bbefore
manifest preserves a342Bindex hash`39632427…c5f2b`, while saved/current after-index
bytes both hash`683ef8d1…708c7`. Fourteen retained later control snapshots match
their own receipt and none matches that original-before hash. Static after-index
mode/object/stage entries agree with the outcome receipt; this does not identify
the changed fields or actor without the original before bytes.

The known`/tmp/opencode/consolidated-752bcef4`path is absent; its loss cause is
unknown. No replacement original baseline or guessed index is manufactured.
Original failed model/preservation outcomes remain, as do full-history/settings/
media/executable/launcher and final old-tree quiescence limits. No tests, fixture
Git commands, implementation/index mutation, large restore, network or peer action
occurs in these evidence jobs; only the factual record and this guide are edited.

#### Archive-check and selected voice preservation — 2026-11-01

The same [evidence record](../preservation-evidence-investigation-2026-11-01.json)
now reconciles the exact `canonical-archive-check-LqmUsg` capture and all three
`voice-assets-parent-YmasER` manifests. All six captured files match their receipt;
the selected bundle, manifest integrity, semantic/plan fingerprints and README
**managed-block** hash agree. The capture is historical active revision96 of
goal`752bcef4…`; its current repository export is later cancelled revision129.
Both are internally consistent bounded exports, not live goal state, a repair of
the earlier reported mismatch/483f failure, or the missing637-path raw inventory.
No closed goal or generated file is changed. Full-file README ownership and a
self-entry for the manifest were never required; initial raw comparisons were
inapplicable, not new integrity failures.

Fresh read-only jobs also compare all63selected voice source files(761,601B),
all11stored model assets(498,149,620B), the213,648,864Binstalled ELF and both
existing313B/3274Blaunchers with their saved records. Their hashes agree; current
11-entry/retained4-entry/8-entry asset manifests and all backup entries agree too.
Source, asset and binary jobs keep their **separate original bounds**:2MiB/256KiB
source,512MiB/256MiBasset and256MiBbinary/job respectively. No model, installer,
executable, test or audio device runs; no launcher or preference is added/changed.

**Retained difference:** the nested voice Git index is now2591B/`0a2da647…a4ec`,
not the dated1946B/`193b2062…f47f`receipt. It stays byte-identical throughout both
current observations; its29stage entries match current HEAD and cached diff is
empty. Without the old raw body this does not prove historical stage/byte
preservation or a stat-cache-only cause. No actor/time/cause is assigned and no
index is restored. This is separate from AGR-PS-027's342Bsynthetic-index failure.

These selected-byte results do not establish every history/settings/ignored-media/
expanded-Vosk/desktop-launcher or loaded/physical/human outcome. Original missing
evidence, current verification restrictions and all consequential gates remain.
Only this guide and the factual record are edited; peer integration stays untouched.

#### Native source-session recovery route — 2026-11-01

The owning [preservation record](../preservation-evidence-investigation-2026-11-01.json)
now also checks the source-qualified original session`ses_e7d3c547dffeCv5RIH5zPCmbN0`
through the supported managed CLI. Its exact metadata GET returns
**SessionNotFoundError/HTTP404**. The same existing2.1.1server responds to info and
the exact current-coordinator GET with this canonical directory/project. This is
not evidence of a general outage or global history deletion; the cause and other
copies are unknown. No source-message page or original637-path body is acquired.

An initial explicit`--server`attempt fails during health authentication; the
ordinary documented managed connection corrects that caller-mode error without
password extraction, new credentials, permission changes or another server/profile.
The exact native resolver/message contracts and retained12-message model audit are
read as source/data only. No pagination trial, fixture/model rerun, raw database
access, import/export/restore, reconstructed baseline or closed-goal change occurs.
All earlier failed outcomes, missing original bodies and full preservation gates
remain; only this guide and the factual record change.

The later revision198waiting review identifies one still-available source check,
not another unexplained abort: whether public message reads require metadata.
Parent now traces that exact path against six files matching frozen`ba546ec`.
`Session.messages` awaits the same metadata`get` **before** message storage;
the public known-ID single-message handler also calls`session.get` first.
Internal storage readers do not impose that check themselves, but invoking them
directly is not the supported API route or an authorized database bypass.

This establishes the pinned public-reader prerequisite without another failed
metadata/message request, new test, model trial or database access. It does not
attest loaded code, prove no orphaned rows/history copies exist, identify a
deletion cause or recover the original637-path inventory. The exact call sites,
six source hashes/Git-blob matches and limits are in the same owning record.
The goal remains active until an actual supported lifecycle transition succeeds.

### Shared checks after reconciliation

Parent restored the canonical reviewed-source table: 21 fingerprints exactly
retain independently accepted delivery bytes; the reviewed monitor union has a
new hash. No requirement row or required acceptance layer was removed. Initial
adjacent failures identified stale fingerprints and inventory omissions, including
preserved canonical-only self-learning work; their actual source/guide routes are
now inventoried without claiming host acceptance or touching that peer's files.
The final selected adjacent batch passes **55/55**. Fresh health passes with
GitHub and Playwright connected, 31 skills and both companion suites. The real
canonical coverage audit has zero input/mapping/crosswalk/reviewed-byte errors,
68 requirements, seven findings and 75 IDs; it still exits 1 for the untouched
`483f…/plan.md` mismatch among 24 bundles. Freshness is not established.
Original staged binary patch remains byte-exact SHA-256 `91d6022a…`; no new
staging, commit, push, deployment or old-folder removal occurred.

## Final reconciliation ownership — bounded follow-up

After all three earlier lanes returned terminal, the parent assigns two small
disjoint follow-ups under the user's existing delegation approval. Runtime
concurrency capacity is not independently exposed; two bounded workers is a
conservative batch, not a claim of a ten-worker native limit. Current Luna/xhigh
availability was rediscovered before dispatch.

- Lane 27 exclusively owns `tools/computer-use-runtime/acceptance-preflight.mjs`,
  `tools/computer-use-runtime/acceptance-preflight.test.mjs`, and the runtime and
  browser package `README.md` files. Import the omitted cross-package utility
  after checking the actual canonical GNOME helper contract; reconcile only the
  documented benchmark/private-entry/capture source boundaries. Offline fixtures
  only; no dependencies, native browser/model/dialog or held capture.
  Owner: `ses_e792e1584ffeHXikeNnP4DU1VH`, currently executing; parent must not
  overlap these four files until terminal release and independent verification.
- Lane 28 exclusively owns the seven previously absent guides:
  `docs/codex-parity/branch-release-workflow.md`, `checkout-readiness.md`,
  `memory-import-readiness.md`, `pr-consolidation-review.md`,
  `private-entry-safety.md`, `docs/demo/delivery-preview.md`, and
  `docs/handoff-automation/off-readiness.md`. Preserve delivery reports with their
  dates/identity and add explicit current-canonical interpretation, not fresh
  outcome claims. No goal planning, registry, coverage or shared inventory edits.
  Owner: `ses_e792e1542ffe45aVvRc2SoDXfK`, currently executing; parent must not
  overlap those seven files until terminal release and independent verification.
- Parent retains all other source/docs, goal planning, full-tree disposition,
  source/installed verification, shared indexes, archived history and the final
  conditional old-folder removal. Children have no Git/deployment/account/
  publication/permission/removal authority, no descendants, and release ownership
  only with a terminal file/test/disposition report. No overlapping parent edits.

### Follow-up parent acceptance

Both lanes returned terminal and released their exact scopes. Parent verified the
runtime preflight source is byte-identical to delivery and reviewed its added CLI
no-write regression/minimal test environment. **16 runtime preflight + 14 GNOME
preflight cases pass independently (30/30)**. Parent reconciled both READMEs
without erasing canonical browser live history, corrected the blanket "bridge
undeployed" wording and retained the separate library/descendant-cleanup limits.

All seven imported guides retain their full original report bytes as a suffix;
parent independently compared those bytes and reviewed their canonical-status
notes. Two larger historical ownership/gap reports remain verbatim in the archive
with canonical, hash-qualified locator documents instead of resurrecting old
execution queues. Model/native/private-entry/archive/runbook records now retain
their delivery findings with explicit current interpretation. Fifteen selected
documents resolve 78 local links; the broad script suite passes **151/151**, zero
skips, including the real 30-second unfinished-stdin boundary. Combined tracked
whitespace checks are clean. No native/live/model/provider operation was added.

The two broader canonical live helper scripts are intentionally **not** replaced
with delivery's narrower capture-only variants. Parent inspection established
that `live-desktop-acceptance.mjs` still releases inputs and launches Calculator,
while `resilience-acceptance.mjs` captures/signals its daemon despite its old
"only lists windows" comment. The runbook now warns against treating either as
an exact-target read-only helper. Their original functionality and both versions
are preserved; safe effect gating/caller integration remains a distinct source
engineering task, not claimed complete by preserving them.

## Final removal precheck — running integration still owns the old cwd

Fresh complete native metadata pagination found 23 selected old-directory
sessions, all with stored idle timestamps, none in the current foreground map.
This is not descendant-stop proof. An own-UID process-cwd scan (no argv,
environment or descriptor contents read) found **PID 171560 `github-mcp-serv`**,
parent **100227**, still rooted in `/home/james/repos/computer-use-delivery`.
It had no open descriptor paths beneath that root, but that does not prove that
removing its working directory is safe. No process was signaled or connection
changed. Pinned native `Worktree.remove` removes Git/saved-worktree state; it
does not itself dispose the old location's MCP clients.

The documented runtime offers location-qualified MCP disconnect, distinct from a
shared service restart. Its exact scope/effects must be reconciled before use;
do not silently stop a shared connection, alter config, weaken lockdown or delete
the live process's cwd. The old folder is still intact and no forced worktree
removal has been attempted. This is a remaining scoped cleanup item, not a reason
to relabel the whole goal complete/unmet or discard its native/model/live work.

A repeat `tar --compare` still matches the entire old tree. Current canonical-only
baseline comparison found 188/193 files unchanged, four generated goal files
changed independently, and one deliberately replaced verifier declaration absent.
The exact 64-byte original declaration was recovered by matching its captured
size/SHA-256 (`d13844f5…`) and preserved beside the archive as
`canonical-verify-dependencies.d.mts`; source JSDoc now replaces it. No peer goal
export was hand-edited. Staged R100 patch and project config remain byte-exact.
The latest real coverage audit retains all 75 IDs/reviewed bytes with zero input
errors, **25 bundles**, and only the original `483f…/plan.md` mismatch (exit 1);
bundle growth is a new observation, not proof of historical completeness.

## Bounded source-safety and dependency closure follow-up

At dispatch all earlier children were terminal. Under the retained delegation approval,
lane 29 owned only the two live acceptance harnesses, `bridge.ts` and
`bridge.test.ts`, a new internal `acceptance-safety.mjs` helper and its new
`acceptance-safety.test.ts`, plus the existing `fresh-shell-acceptance.sh` caller.
The goal is to preserve existing registration/PNG/refusal/launch/release checks
behind an explicit mutation opt-in, make default invocation capture-only with
exact target validation, and eliminate global `pgrep`/process-environment reads
and broad proc scanning. Owned daemon control must come from the actual local
bridge client, never an arbitrary PID/name. Caller compatibility must remain
explicit and offline-tested. No real GNOME, process signal, provider or model run.
Parent owns all shared docs, dependency provisioning, integration and goal work.
Lane 29 owner: `ses_e7918a3b4ffe01XKCHlB3kLNCv`; it returned terminal and released
all seven paths before parent follow-up. No active child owns those paths now.

At that checkpoint coordination's canonical `node_modules` was absent. Parent could provision
that new package-local development tree from its reviewed public SHA-512 lock,
with lifecycle scripts, user/global npm config and inherited secrets disabled.
This is source dependency closure only, not deployment or runtime activation.
Do not run `ci` against any existing modified dependency tree; other package trees
remain untouched. Check resources and run compilers serially with bounded memory.
The old GitHub MCP working-directory cleanup remains a separate unresolved item;
no shared restart, connection change or deletion follows from these source checks.

### Parent dependency closure accepted

Coordination's reviewed 386-entry public HTTPS/SHA-512 lock provisioned 380
platform-applicable packages into the previously absent local development tree.
Lifecycle scripts were disabled; explicit empty npm configs, a secret-free
environment and `/tmp/opencode/coordination-canonical-deps-O8qMRc` cache/receipts
were used. The first minimal PATH lacked npm (exit 127, no install); discovery
then selected the existing Node/npm directory without changing it. Manifest,
lock and project config remain byte-identical. **109/109** full package tests,
zero skips, and the actual package-local strict/library compiler command pass
without a dependency-root/type-root override (1,536 MiB heap, serial deadline).
OpenTUI 0.6.6's Node >=26.4/Bun >=1.3.14 warning is retained on Node 22.22.2;
this is source closure, not FFI/native/UI/runtime activation.

The existing reviewed acquirer fetched and authenticated the exact public
`@types/json-schema@7.0.15` tarball. Its four files were copied exclusively into
new, previously absent connector/browser declaration directories; no pre-existing
file, source pin or lock was replaced and no alias/shim/borrowed module path was
introduced. Full receipt: `/tmp/opencode/coordination-json-schema-rNta41/canonical-install-receipt.json`.
Connector's two actual local-readiness cases now pass, as do all 120 behavioral
cases. A real 1 GiB-heap `npm run check` failed at the compiler with OOM (tests did
not run in that failed command). The subsequent serial complete strict/library/
checked-JS compiler passes at 1.5 GiB: **603 files**, 38.25 seconds compiler time,
1,255,249 KiB reported compiler memory, no source/diagnostic filtering. Behavioral
tests were then run separately and passed. Browser's missing SDK remains open;
adding declarations alone is not acceptance of its compiler or installed bundle.

During these checks the exposed catalog briefly removed shared skills and the
direct connector, then restored them. Parent performed no reload/config/service
or account action and does not attribute the cause or infer loaded source identity
from that availability change. Lane 29 was still running during those checks;
its later terminal release and parent follow-up are recorded below.

### Harness integration follow-up and browser closure

Parent read the actual seven-path return and reproduced **133/133** plugin tests.
New `acceptance-harness.test.ts` executes the actual CLI harnesses in subprocesses
using module hooks that replace only process I/O, not registration, serialization,
permissions, capture validation or cleanup. Its initial run had **4/7 passing**:
the real live harness measured exact permission order against tool invocation,
not bridge dispatch; a stream error also discarded the capability for a still
suspended owned child without killing it. Parent now records the actual capture
executor boundary and terminates the owned child on stdout/stdin/child transport
errors before losing cleanup ownership. All seven checks then passed, including
the actual 11-second capture timeout, replacement/recovery, stale controls,
SIGTERM resume/exit-143 cleanup, capture-only defaults and exact inventory refusal.

An additional baseline-failure regression first failed: opted-in release/input/
launch still ran after PNG dimension validation failed. The harness now stops
before effects on failed baseline checks. The Fresh-Shell selection and both
actual invocation snippets also execute against fake transport; exact current
IDs, explicit launch ID and freeze selection pass. This is caller-wiring evidence,
not execution or acceptance of the full private GNOME Shell or its isolation.
No user process was signalled, real capture performed or native permission grant
claimed. The original functionality remains selectable, not replaced by a narrower
helper. Updated combined results and health are recorded at the verification step.

Browser's authentic 275-entry lock was installed with scripts disabled in a new
scratch package, never by `ci` over its existing canonical tree. Only 242 absent
package roots (270 absent locked packages, 17,033 files and two package-internal
relative symlinks) were copied with exclusive creation. All **423 pre-existing
entries** retain file hashes/modes or symlink targets, and both manifest/lock plus
project config remain exact. Receipts and the complete before inventory are under
`/tmp/opencode/browser-canonical-deps-WRSsyc/`. No bin link was replaced or sibling
module bundle borrowed. The real canonical **`npm run check` now passes**: base
typecheck, 46 browser cases, all 275 lock entries, full strict/library benchmark
graph and 35 benchmark/dependency cases. The serial compiler heap was 1.5 GiB.
This repairs source dependency closure only. Safe-root ancestry, actual Chromium,
private provider readiness and observed paired model/exposure results remain open;
no browser/provider/model/runtime activation occurred.

The later live-harness signal regression separately reproduced a missing
SIGTERM handler (11-second timeout, exit 1 rather than 143). Parent added request
abort and owned-daemon shutdown with handler cleanup and preserved signal status.
Full source verification uses a 60-second per-file watchdog: the earlier
25-second command cancelled the two-timeout harness file and remains a failed
command, not a relabeled pass. Production capture deadlines are unchanged.

Fresh health and **151/151** script tests pass. Coverage still maps all 68+7/75
IDs with zero input/mapping/review errors across 25 bundles. A transient extra
current-goal snapshot mismatch was preserved with manifest/index and all four
generated files under the Documents backup's `canonical-archive-check-LqmUsg`;
the captured manifest/snapshot match and a subsequent audit again reports only
the historical `483f…/plan.md` mismatch (exit 1). No generated archive was edited,
rehash-repaired or claimed fresh. Staged R100 patch remains `91d6022a…`, project
config `9fcd0b08…`, canonical `main` HEAD `70e04774…`. Old-location lifecycle and
conditional removal remain unresolved; no MCP disconnect, shared restart,
deployment, commit, push or deletion occurred.

Final independent plugin run passes **143/143**, zero failures/cancellations/skips,
including all ten actual-harness/caller tests (60-second file / 100-second suite
watchdogs). Fresh health passes again after the live cancellation correction,
with location-scoped plugins, connected GitHub/Playwright, 31 skills and both
companion suites. JavaScript syntax, Fresh-Shell `bash -n` and tracked whitespace
checks pass. Lane 29's source return plus parent safety corrections are accepted
at this source/offline layer; no worker retains ownership. Live/native/full-Shell
and whole-goal acceptance remain unfinished.

## Cleanup-scope refresh and read-only audit correction

The exact original user turns were recovered through the supported, user-only
message projection of this session: `msg_186a655dc001Yj6OHOWdeAjDAm` names canonical
main and the two peers; `msg_186a7180e001Xp7v2QN3wabsdv` says to remove the old folder
after moving and consolidating. No separate forced-worktree-removal or connection-
change approval was present. Fresh native metadata pagination (four pages,
including terminal empty coverage) still finds 23 old-location sessions, all idle,
none in the foreground map, plus zero running shells and zero PTYs. The full
old-tree `tar --compare` passes again. PID 171560/parent 100227 still has the old
cwd; canonical GitHub/Playwright are connected, while old-location GitHub is
connected and Playwright reports its missing old package dependency.

The actual runtime OpenAPI and V2 documentation expose location-qualified MCP
disconnect; pinned `ba546ec1` source confirms directory middleware and per-location
server-entry scope cleanup. It is not credential logout or a config write.
Debug location eviction disposes a broader cached service set and was not chosen.
No disconnect, eviction, signal, shared restart, forced removal or deletion ran.
The conditional old-folder cleanup remains open rather than inferred authority.
PR4's supported refresh (`get_me=jtmb`, exact PR get) still returns lockdown denial.

The audit race observed in the prior checkpoint became concrete source work.
Four real-file regressions first failed: short reads, identical-byte replacement,
manifest advancement and earlier-file replacement during archive acquisition.
Bounded complete reads plus descriptor/path/ancestor and archive read-set
revalidation now reject those changes without certifying mixed lineage or hiding
stable corruption. **32/32** coverage tests pass; the real CLI still retains all
75 IDs/25 bundles with only the original `483f…/plan.md` mismatch (exit 1).
No generated byte, manifest, writer, lock, lifecycle or source fingerprint was
altered to make that result pass. Sampled checks are not atomic snapshot proof.

The combined script run passes **155/155**, zero skips/failures; syntax and tracked
whitespace checks pass. Canonical `main` remains at `70e0477496e25655911341a07e00d55b2a5a61d9`,
project config at SHA-256 `9fcd0b08…`, and the exact original staged R100 patch at
`91d6022a…`. Prior package, health, native and model evidence retains its dates and
limits; none was silently rerun or promoted by this source-only correction.

## Native-host follow-up — canonical closure, fixture layer and guarded refusal

Parent verified canonical `tools/opencode-native-row/node_modules` absent and
provisioned only that new tree from four reviewed public SHA-512 lock entries,
scripts disabled, empty explicit npm configs and a secret-free environment.
Lock SHA remains `c98bfd0f…`; the manifest adds only two explicit layer scripts,
retaining all direct pins and the original full `test` command unchanged.
Actual canonical `npm run test:runtime` passes **4/4**, zero skips/failures, with
the pinned upstream four targets clean before and after. It exercises actual
mapping/adapter and negative controls, not full native host/service construction.

The new private TypeScript 7.0.2 probe at
`/tmp/opencode/native-host-canonical-aNBGW3` uses the reviewed 21-entry public lock
(two applicable platform packages), scripts disabled, without modifying the older
probe or upstream. All three real 65-file controls pass across seven diagnostic
groups: positive clean, source TS2322, external declaration TS2304.

Both proposed full-host checks stopped at prelaunch memory guards **before spawn**:
1,536 MiB worker + 1,280 MiB available floor needed 2,816 MiB; then a reduced
1,280 MiB worker with the same floor needed 2,560 MiB. Available memory fell below
each requirement. No full-host trial or host diagnostic receipt resulted, and no
further cap/floor changes or unchanged retries followed. The canonical full-host
patch/types/2,826-file/seven-group contract was not narrowed. Earlier TS6 heap and
three TS7 RSS failures remain failed history. The surface/full package commands
remain unrun here; loaded native participant/UI/effective-metadata outcomes and
all separate activation gates remain open. No unrelated process was stopped.

The setup/result receipts are preserved under
`/home/james/Documents/computer-use-native-host-20261029/`, not only scratch.
The seven inventory/link contracts pass after documentation updates. Exact staged
R100 patch and project config hashes remain `91d6022a…` and `9fcd0b08…`; the native
lock is unchanged, and the manifest's intentional script-only change is recorded
in the receipt. No previous package/health result was silently freshened.

## Whole-scope evidence reconciliation and actual host resource result

The current [delivery audit](open-gates.md) maps all eight immutable completion
criteria to their actual artifacts, commands, evidence layers and missing outcomes;
the detailed75-ID map remains in request coverage. Historical rationale is retained
beside current corrections, rather than deleting old failures. O21/O27/F04 now
close their source-only findings; O13/O18/S06, O28 and every other original live/
model requirement retain their required layer and unfinished outcome.

Supported goal tools record three fulfilled bounded source-preparation tasks
complete: native row patch, legacy-capture regressions and memory/import readiness.
The exact three patch hashes still match their accepted values. Fresh legacy+
logic tests pass **29/29** with only injected triggers/task-owned scratch files;
the held backend was not invoked. Adjacent coverage/inventory/instruction checks
pass **44/44**. The real audit retains68 requirements/seven findings/75 crosswalk
IDs/22 reviewed fingerprints without input/mapping/review errors and now observes
**27 bundles**; it still exits1 for the original483f plan mismatch. Bundle growth
does not prove historical completeness or freshness.

With freshly observed3,105 MiB availability, the prepared canonical host compiler
actually ran once: all2,826 files/four overlays loaded, config/program diagnostics
zero, then the1,280 MiB owned-tree RSS guard stopped it at48.362 s /1,281.449 MiB.
Minimum system availability was1,696.789 MiB. Global/semantic checking never
completed, so there is no full-host diagnostic receipt/pass. A distinct1,536 MiB
proposal with the same1,280 MiB floor refused before spawn; no second actual host
trial or further retry followed. Exact supervisor output and separate follow-up
observations are durably preserved as `canonical-host-1280-supervisor.json` and
`canonical-host-follow-up.json` in `Documents/computer-use-native-host-20261029`.
The original no-spawn before/after receipts remain intact.

Canonical main HEAD70e04774, staged R100 patch91d6022a and project config9fcd0b08
remain exact; all four upstream active-bridge targets are clean. Source preparation
completion does not close native host/resource engineering, permitted PR access,
benchmark execution, loaded/visible/human acceptance, real archive application,
demo or conditional old-folder cleanup. The overall goal remains active/incomplete;
no deployment, activation, shared restart, permission change, commit/push or
deletion occurred.

## Restart checkpoint and recovered 1536 MiB outcome

After the preceding checkpoint, a subsequent 1,536 MiB host trial actually ran:
**50.805582344 seconds**, peak owned RSS **1,536.71875 MiB**, minimum available
system memory **1,530.99609375 MiB**. Its 1,280 MiB system floor and 90-second
deadline were unchanged. The owned-RSS guard stopped it with SIGKILL/exit1.
All **2,826 sources/four overlays** loaded; config/program diagnostics were zero,
but global/semantic groups did not complete. This is a second actual resource
failure, distinct from the earlier 1,536 MiB no-spawn refusals. No pass or
unchanged compiler retry is claimed.

After the reported server restart, the original compiler workspace and temporary
canonical-baseline workspace were absent; cause is unestablished. The exact
completed native tool output was recovered through the supported session API:

- Session: `ses_e7d3c547dffeCv5RIH5zPCmbN0`.
- Message: `msg_18776680d001wD8hGtPOgh6ebe`.
- Tool: `call_7154a26cc77e41eeb0706e198aded401`, status `completed`.
- Tool-text SHA-256: `969eda77d745ec3c22d032e03bb1248b40e7b9610147d5162c0104a1b0797c35`.
- Preserved record: `/home/james/Documents/computer-use-native-host-20261029/canonical-host-1536-recovered-tool-result.json`.

That record is explicitly **not the original filesystem receipt**, whose hash
is unknown. Earlier durable setup/1,280 MiB/follow-up receipts remain intact.
Worker PID251043 and former MCP PID171560 were absent in the restart inspection;
this does not prove current old-cwd/all-descendant quiescence. The original
637-path baseline/provenance limit remains, not retrospectively reconstructed.

Post-restart supported discovery reported canonical GitHub and Playwright
connected. Desktop and goal-docs plugins reported active canonical local source
paths, and `local.goal-mode.server` reported active package version0.1.67.
Those are discovery/status observations, not exact loaded-byte or model/visible
acceptance. The 11-command catalog lists `/handoff_resume` but not `/checkout`;
no command was invoked and no worktree created. PR4 read returned the lockdown
refusal, distinct from the pre-restart `Permission.DeclinedError`. No cause or
permission change was inferred. The old delivery GitHub connection remained
connected; its Playwright reported a missing local dependency. No disconnect,
restart, dependency repair or old-folder removal was performed.

Canonical main HEAD70e04774, original staged R100 SHA91d6022a and config9fcd0b08
survived; canonical native, coordination, browser and connector dependency trees
were present. Goal revision108 remained active, retaining completed source tasks
and all 68 requirements/F01–F07. One disjoint read-only factual metadata worker
owns native producer/consumer inspection; the parent owns this reconciliation.
Its return is not acceptance until independently verified. No completed test or
compiler trial was repeated for this checkpoint.

## Benchmark receipt publication source correction

The parent independently found overlapping receipt saves in the benchmark
plugin's tool/context hooks and idle observer. The original save loop was
extracted unchanged; deterministic real-file overlap and post-I/O-failure
regressions both failed. `benchmark-runtime/receipt.ts` now serializes bounded
call-time snapshots and keeps publication failed after an I/O error. Four
focused cases pass; the production-staging case also imports and executes the
exact copied helper. Actual `benchmark:verify` passes the unchanged strict/
library graph, all275 locked public dependencies and **39/39** cases. Fresh
health passes (31 source skills observed). No provider, browser or model was
dispatched; no benchmark measurement, atomic crash-safety or loaded native/UI
acceptance is claimed. Missing eligible runtime ancestry/browser/provider
readiness remains separate from this source repair.

## Peer review source-fix acceptance

Peer dispatch `review-fixes-20261029-integration` from
`ses_e788b549bffe8cyPIPC9FRsmJY` cited exact user-source message
`msg_188223656001kXRQ8PE0qYSE9h`; supported reads verified that text and both
canonical session/project locations. It remains peer context, not a new human
instruction or live authority. A passive queue/resume-false ownership notice was
admitted as `msg_review_fixes_20261029_integration_acceptance_e7d3`.

| Scope | Owner / terminal disposition | Independently verified source outcome |
| --- | --- | --- |
| #1 password-only transport: manager/protocol/worker-child and two tests | Parent | Three original failures reproduced; boolean restriction reaches local and framed actual worker dispatch, with true/false/absent and invalid-type coverage;16 focused pass |
| #2/#3/#4/#9 capture/fill/lifecycle: three plugin modules, ops/errors and two tests | Luna `ses_e77d3ec0fffejgiOTYu7PWOyWQ`, released; parent accepted | Foreign-session compositor capture blocked; values protected before mutation; uncertain fills never claim nothing typed; no timed expiry; only confirmed close clears its own flags. Child six-red record, parent29 green plus meaningful in-memory old-guard failure |
| #5/#6/#7 three launcher/relogin scripts and new script test | Parent | Five pre-fix failures; display context and validated selected `GH_CONFIG_DIR` retained, unrelated secrets excluded; atomic private autostart staging must succeed before logout, failed write/rename preserves prior entry. Six new/eight hygiene cases pass, shell syntax passes; no real logout |
| #10 connector server and server test only | Luna `ses_e77cddd49ffeYSCn0ohDDK22Kn`, released; parent accepted | Reset epochs captured at queue admission; stale chat rejected before dispatch and cannot restore history. Parent reproduced old-code failure in memory, server21/full121 pass and full strict/library graph passes; newer image/direct/backend work retained |

The combined browser package check passes **51 browser +39 benchmark cases**,
both compiler stages and all275 lock entries. Full plugin verification initially
passed147/149: the old session-specific refusal text assertion and unsafe
30-minute expiry expectation were corrected to the reviewed lifecycle contract,
preserving capture-resume checks. The final full plugin run passes **149/149**.
These scopes overlap and are not an additive test total. No dependencies/profile,
runtime settings, credentials, live browser/seat/provider/audio, logout, deployment,
activation, restart, commit or push was used for this batch. Peer Codex-import
redaction and voice ownership were untouched. All original acceptance layers stay
open where required; the overall goal is not complete.

The separate read-only native metadata worker also returned terminal facts without
writes. Its selected/wire/provider-reported model distinctions still await parent
source acceptance; the nine-fix batch does not turn unknown execution-effective
metadata into an observed value or authorize native activation.

## Native response producer acceptance

The parent verified the read-only metadata report against pinned alias resolution,
transport hooks, selected-ref step publication and exact session/assistant native
projection/cache bindings. The missing response channel became bounded source
work, not a claim that selection equals provider execution.

Luna `ses_e77b6864cffeIinQJTv6MqAEgg` returned/released exactly two new canonical
files: a one-protocol producer patch and native fixture source. Parent read both
in full, bound patch SHA8982ae7988a3902c7ce586427672887f95349e7b7dd26de475f33ac81c5ca45d,
and added a real step-finish/finish metadata equality assertion. Actual Bun1.4.2
execution against a fresh local clone produced **3 passes/6 failures** unpatched,
then **33/33 native cases/234 assertions** patched, including existing final and
lifecycle cases. Original protocol bytes/status and all accepted row/bridge work
remain unchanged. No provider, HTTP, model, native session or live TUI ran.

The wrapper rejected an initial empty zero-exit run; an intentional failing
probe identified Bun's pre-command spaced-config dispatch behavior. Corrected
command ordering/config syntax ran the actual tests, and the wrapper now binds
exact counts as well as failure signatures. No empty run was accepted. The
private integrity-verified Bun acquisition has a durable provenance receipt;
there was no global install, dependency/config change or full-host retry.

The separate additive consumer was assigned only to Luna
`ses_e77a45f0affezNvN8Rck8uGmYH` in
`tools/opencode-native-row/provider-observation-row.patch`; the parent owns its
verification wrapper and shared docs. Its later terminal release and independent
acceptance follow. Source-only response reports remain distinct from selected/wire
settings and unknown execution-effective values.

## Native response consumer acceptance and honest semantic result

The worker returned terminal and released ownership. Parent reread its614-line
patch and preserved the exact original as `provider-observation-row.worker.patch`,
SHA424c2e6348f6511f7f34b855d6d23afd13acdd086e26ce13d2592eec11ef6b99.
Three added actual native regressions failed: producer-safe punctuation rejected,
and two invalid message IDs permitted report promotion. Parent aligned producer/
consumer identifier safety and required safe `msg_` provenance, then added longest
model/effort layouts at44/120 columns. Native helper/production-Composer fixtures
cover malformed/latest/missing-cache behavior, independent labels, wrap, scroll
and navigation. The final corrected patch is
SHA5f61c02073c192d3f05c33053f736b0b213e5b7ac7d5c77f9eaf8b65ed25f43d.

The actual final `test:provider-row` package entrypoint, with explicit checkout and
Bun paths, reports **2 passes/45 failures across47 new native cases** before source
application and **82/82 passes** afterward, including all35 accepted base cases.
It verifies exact counts/hashes and unchanged original source/status. This rerun
binds the final Git blob-index normalization; no changed postimage was accepted
merely on the earlier passing hash. Base row/active bridge remain unchanged. All
children are now terminal/released; no current child write ownership remains.

A distinct complete AI-package graph check finished all six public diagnostic
groups for218 roots/1,268 files but **failed on six Bun/gaxios declaration errors**:
2694/2552/2552/2304/2416/2416. The native alias6.0.2 reexports locked TypeScript6.0.3.
An initial identity guard exited before program creation; an intermediate verifier
resolved Bun types from scratch without `configFilePath` and timed out. Corrected
package-cwd/config checking exposed the real declarations, without suppressions,
shims, library-check bypass or source omissions. The failed first config correctly
prevented `tsconfig.types.json` from running. Actual65.200791 seconds/peak888.222656
MiB/minimum available1,729.386719 MiB respected1,024 MiB RSS/768 MiB heap/1,280 MiB
system-floor/90-second guards. Exact outcomes/scripts survive in the durable
`provider-ai-semantic-checks.json` receipt, SHA1c7d953ca40412fe492f5dcfa6d61879029c97ca8fa36b1ed42bb0d884fc495f.

A separate232-file declaration-only control reproduced the same six diagnostics
exactly without the producer. CJS-only first found five and correctly failed its
six-error expectation; importing the ESM entrypoint accounted for the second
gaxios error. The locked Bun1.4.2/Node-types24.12.2/gaxios7.3.1 declaration tuple
is incompatible under full library checking; inherited skipLibCheck is true,
but the check kept false. Actual9.112102 s/peak367.734375 MiB, no resource guard
hit, no dependency/source/config edit. Durable localization scripts/results/
declaration hashes: `provider-ai-declaration-localization.json`,
SHA715c2b0a54fcc08849c1c4b31d692e6ed8f75dbe06925a27ebfd870719aabeda.
This localizes the failure; it does not waive either complete config or prove
native host compatibility.

These are source/fixture outcomes, not a strict AI/full-host pass, loaded rows,
real provider reports or native participant acceptance. See the
[observation guide](../../tools/opencode-native-row/provider-observation.md).
PR access, benchmark isolation/model measurements, loaded/visible/human outcomes,
real archive recovery, genuine demo and conditional old-folder removal remain
unfinished. No activation/deployment/shared restart/logout/security/permission
change, commit, push, merge, publication or removal was performed.

## Upstream-derived declaration compatibility preparation

Parent inspected an integrity-verified public gaxios8.3.2 tarball and backported
its callable FetchCompliance correction into a separate two-file patch artifact,
SHA323b8fe19f185ed53358309dc9668ee618651945d3552bef71e3b51114873643.
Actual controls with the native compiler retain6 original errors,2 with explicit
authentic Node26 types,0 with the backport; bad return/parameter mutations still
fail TS2416 and an external `.d.ts` error still fails TS2304. Whole-versus-sharded
negative controls retain the complete graph and every diagnostic site, without
filtering library errors. No existing dependency tree or native pin was changed.

The first combined AI command failed with type-config heap OOM35 roots/1,334 files,
57.169461 s/peak896.328125 MiB. Parent corrected withheld partial receipts and TAP
nested-JSON escaping; two subsequent verifier ordering failures remain preserved.
The later complete **source-config compatibility check passes218 roots/1,329 files,
all six diagnostic groups zero**,85.979944 s/peak896.488281 MiB/minimum available
1,474.007813 MiB. It explicitly selects Node26 and producer+two gaxios overlays,
not the original unchanged tuple. The combined command still fails: the next
type-config route refused before spawn at2,011.242188 MiB; the separately selected
unfinished type config later refused at2,245.253906 MiB. No type shard executed,
cap/floor change, automatic retry or whole-package pass was claimed.

The [compatibility guide](../../tools/opencode-native-row/declaration-compatibility.md)
and portable entrypoints retain all218/35 roots, all external declarations and
whole config/options/syntax/global checks; proposed four-part semantic/declaration
coverage is disjoint and exact, not a reduced program. Type-config completion,
dependency integration and full-host/native/model/live outcomes remain open.

### Complete type-config compatibility accepted separately

After interruption, fresh2,904 MiB availability allowed the previously refused
four-part type check without changing guards or rerunning completed source work.
All35 roots/1,334 files completed in each shard, revealing three rejected overload
calls and three misplaced existing expectation comments. Parent read the94/129-line
fixtures; the separate patch SHAf6bf8d846a77966d212fc4a2f911ee5ed4dbdd7942a785a4892206592a22d37c
moves only those comments. The wrapper verifies identical invalid inputs and
directive texts/counts. No API or native source/dependency file was changed.

The subsequent explicit types scope **passes**: four complete-program shards,
all six groups, exact disjoint1334-file coverage and zero diagnostics. Four more
workers make the three calls valid and require exactly three TS2578 errors.
Actual163.258094 seconds/peak736.480469 MiB/minimum available2,252.976563 MiB remain
within unchanged per-worker guards. Parent all-file readback exactly reproduces
both source and type graph hashes, binding the separately observed configs.
The durable `provider-ai-compatible-configs-acceptance.json` receipt is
SHA09754dae7f0a1e3ef2eb864b02a9a7273db3de69a52a504c682f8e6f356e0898;
actual successful scoped command output is SHAfd6fa66b560a68d456084dfb6eadc458501f0c80541464dcc5e9b1d0856cf074.
These are compatibility-overlay results, not an unchanged-lock, fresh combined-all,
full-host, installed native UI or real provider pass. Earlier six-error/OOM/
no-spawn/verifier results and every remaining original layer stay preserved.

Parent review additionally reproduced an aggregation guard defect: a later shard's
global error was discarded when only the first whole-program group was retained.
The focused regression failed, then passed with all-shard diagnostic equality,
exact shard identities/counts and complete disjoint coverage. Replaying the actual
immutable receipts through the current aggregation function preserves source/type
zero and all three valid-input errors, without a compiler rerun. Durable audit
SHA24211890145536e4e262bebe8d00b4e669c4ef7c3d461f5ff4bf2d9075e31c66
records the final checker and replay provenance.
