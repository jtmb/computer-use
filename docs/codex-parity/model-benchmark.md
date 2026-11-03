# Isolated real model-exposure benchmark

`tools/computer-use-browser/isolated-model-benchmark.mjs` compares native
OpenCode model dispatch with Code Mode enabled and with the production browser
tools directly exposed. This is distinct from `efficiency-acceptance.mjs`, which
calls production tools itself and cannot prove model-visible exposure or native
session usage.

## Safe entry point

**Current path-gate review — 2026-10-31:** parent independently read the scratch,
browser-root and orchestrator predicates and confirmed mode0775/UID1000 for
`/tmp/opencode`, `/home/james/repos`, the canonical repo and the default Playwright
cache root. No private repo child can bypass the unsafe ancestor, and a canonical
executable does not fix a writable installation root. The read-only worker reports
the pinned default-root Chromium is now present, unlike the historical pilot-path
absence below; its binary hash/pin claim is not a parent-verified launch outcome.

The immediate path refusals require exact permission-change authority or another
legitimately approved safe environment; neither was granted by this review. No
chmod, ownership change, install/copy/link, fallback root, runner or browser launch
occurred. Group membership does not grant operator authority. “Permission-only”
describes these immediate metadata predicates, not the whole benchmark: exact
binary, private provider/isolation, headed browser, native model exposure and real
alternating-order usage/latency/recovery outcomes remain unverified.

Parent also found an offline test tied to the real default root's current unsafe
mode; after a legitimate host change it could create a run directory before the
assertion failed. The returned one-file fixture-only correction is independently
accepted: focused1/1 and owning33/33cases pass, zero skips. Parent also corrected
the adjacent ownership/unsafe-ancestor test's same host assumption with a
task-owned0770ancestor and private parent; both focused cases and the final33/33
suite pass. The separate fake approved-root positive/ancestor matrix and cleanup
capability/sentinel assertions remain. Only task-owned fixture modes changed;
production predicates/approved roots and actual shared-path modes are unchanged.
These are test-quality results, not benchmark acceptance or host-remediation
authority. The worker's original read-only report and its overbroad
“permission-only” conclusion remain historical, qualified above.

Preflight is the default. It verifies the selected executable is a regular
OpenCode V2 binary, redirects OpenCode/XDG paths to a private task-owned root,
refuses inherited system configuration before invoking the native CLI, and checks
the paths reported by that CLI. It does not start a model
session, provider request, shared service, or browser.

```bash
node --experimental-strip-types tools/computer-use-browser/isolated-model-benchmark.mjs \
  --preflight \
  --binary /absolute/path/to/opencode-v2
```

`/tmp/opencode` must be owned by the current user, owner-accessible, and not
group/other writable. The optional `--scratch-parent` must be an absolute
canonical directory under the approved scratch or repository roots; the runner
also checks its full ancestry for symlinks and unsafe write permissions. It
does not create a fallback directory, change permissions, or remove anything
without the exact in-process run capability and matching ownership marker.

On the observed host (2026-10-28), `/tmp/opencode` is mode `0775`, so preflight
returns `SCRATCH_PARENT_UNSAFE` before creating a run directory or invoking the
binary. No eligible private scratch parent has been verified. The installed
Playwright Chromium executable path also does not exist on this host; no browser
was launched and no installation was attempted.

Read-only prerequisite observations from 2026-10-29 also found
`/home/james/repos` and the delivery checkout UID 1000/mode `0775`, so none of
those selected roots passed the full-ancestry guard. The exact Chromium candidate
`/home/james/.opencode-v2-pilot/cache/ms-playwright/chromium-1243/chrome-linux64/chrome`
was absent and its installation root was `0775`. `/run/user/1000` being `0700`
does not establish browser/provider readiness. No chmod, alternate-profile use,
credential copy or exhaustive private-home scan was performed. Consolidating
source onto canonical `main` does not by itself clear these runtime gates.

On2026-10-30 a read-only source/ancestry check confirms both permitted roots still
fail: `/tmp/opencode`, `/home/james/repos` and the canonical checkout are0775.
The validator permits only scratch/repository descendants and checks full ancestry,
so a private child directory cannot hide an unsafe ancestor. No runner, browser,
provider request, fallback root or permission change was used. Separate native
[compiler control results](../../tools/opencode-native-row/session-active.md#unfinished-negative-controls-completed--2026-10-30-utc)
are not benchmark evidence.

## Run flow (gated; not yet executed)

Only after isolation preflight succeeds does `--run` inspect the native model
catalog in a private `opencode models --standalone` process. The benchmark
plugin reports enabled/tool-capable models and non-secret provider readiness
metadata from that private location. It selects the exact native default or
validates an explicit `--model provider/model#variant`; it does not read or copy
provider credentials. A connected private integration or enabled local Ollama / LM
Studio provider is required. Provider readiness is metadata-based; any actual
provider rejection remains a failed/incomplete condition.

The native default's variant is not guessed from the model catalog. When no
explicit model is requested, the runner records the variant from the first
native dispatch and requires that exact provider/model/variant for every later
condition.

After provider readiness, the runner requires the existing headed-browser
environment (Wayland, a private runtime directory, and a secure existing
Playwright Chromium installation). It stages bounded production source copies
under a fresh private workspace, validates the browser package's exact public
HTTPS npm/SHA-512 lock closure and package-local installed SDK/Playwright manifests
without borrowing another package's dependencies, and launches one native
standalone session at a time. Every measurement receives a fresh profile and
private run root. The browser may visit only the exact synthetic loopback URL;
plugin permission assertions additionally restrict operations to open that
URL, read its owned text snapshot, and close that session. There is no headless,
shared-profile, `--auto`, or shared-server fallback.

```bash
node --experimental-strip-types tools/computer-use-browser/isolated-model-benchmark.mjs \
  --run \
  --binary /absolute/path/to/opencode-v2 \
  --pairs 2
```

Pairs alternate Code Mode/direct-tools order. Each pair covers both a normal
loopback page and a deterministic first-request connection reset followed by a
same-URL retry, for four sessions per pair. The report requires the loaded
production registrations, every native model-call tool snapshot, exact session
and model identity, tool outcomes, native token/cost counters, monotonic
prompt-to-idle and failure-to-recovery timings, and verified browser/run-root
cleanup. It emits Code Mode versus direct-tools deltas only when every paired
condition is complete; otherwise the result stays incomplete or blocked.

The effective model-visible set must be **exactly `execute`** for Code Mode,
and exactly the eight `web_*` browser tools **without `execute`** for directTools.
Private permissions and hard policies allow the executor only in the Code Mode
condition; browser grants stay identical. Native executor synthesis depends on
permissions, so editor removal alone is not sufficient. Dispatch attestation and
receipt acceptance reject leaked executors or any other tool-set mismatch.

The staged plugin's source and the native session hooks have not yet been loaded
against a real OpenCode process. No model dispatch, provider request, or browser
benchmark has been run on this host.

## Source verification and current installed boundary

**Receipt publication correction, 2026-10-29:** tool/context hooks and the idle
observer previously used overlapping truncate/write/sync operations on one
descriptor. Two deterministic regressions failed against that implementation:
a later save truncated during a suspended earlier write, and a save after an
I/O failure resumed publication. The production plugin now uses
`benchmark-runtime/receipt.ts` to capture bounded JSON at each call, serialize
publication, handle short writes and reject subsequent queued writes after an
I/O failure. Four focused cases pass, including actual scratch-file overlap,
UTF-8 bounds and malformed byte-count controls. The staging test also imports
and executes the exact copied helper. Actual `benchmark:verify` passes its
strict/library graph, all 275 lock entries and **39/39** benchmark/dependency
cases. Health passes separately. No model/provider/browser dispatch occurred.
This is not atomic crash-safe publication: a process interruption can leave a
partial receipt, which must fail receipt acceptance rather than imply a result.

**Later canonical source closure, 2026-10-29:** parent provisioned only absent
locked package trees from a separate public-SHA-512 scratch install, preserving
all 423 existing canonical entries. The real package `npm run check` now passes
base typing, 46 browser cases, all 275 lock entries, the full strict/library
benchmark graph and 35 benchmark/dependency cases. The installed-bundle verifier
also passes. No sibling module tree, shim or diagnostic filter was substituted.
This resolves the dependency failure in the earlier checkpoint below, not safe
scratch ancestry, actual Chromium/provider readiness, loaded exposure or model
measurements. No paired run has been observed.

Earlier delivery verification independently reproduced descriptor-read growth
failures, then accepted capped JSON/staged-source acquisition with identity
rechecks, authentic strict checking and 46 browser + 35 benchmark/dependency
cases. Those dated checks do not prove that canonical dependencies are installed.
During canonical consolidation the parent reran **81/81** offline cases, including
the three exclusive-comparator regressions and staging into the owner's existing
private empty workspace. Base browser checking passes; the real benchmark strict
check **fails** for missing local SDK declarations and downstream implicit-any
errors. No diagnostic filter, shim or compiler pass is claimed.

`benchmark-dependencies.mjs` validates five exact pins and all 275 lock entries.
The selected production staging graph is checked by `tsconfig.benchmark.json`
with strict/noEmit/library checking. `benchmark:verify` performs the real installed
dependency and compiler checks before its offline tests; it is expected to refuse
incomplete canonical dependencies, not silently borrow another tree.

## Offline verification

```bash
npm --prefix tools/computer-use-browser run benchmark:verify
```

The tests cover argument/model validation, safe scratch ancestry, bounded
subprocess termination, bounded session collection, the loopback fixture, dispatch
attestation, provider-readiness gating, production browser registration, and
paired orchestration through an injected fake native-I/O boundary. The fake
boundary verifies orchestration only; it is not benchmark evidence. Node's
strip-types syntax checks are not a TypeScript type-check. The package command
also requires the genuine strict check; the earlier dependency failure above is
retained history and superseded by the canonical source closure note.
A full plugin load,
native dispatch, model usage result, and browser outcome remain unverified until
the isolation and readiness gates can pass.
