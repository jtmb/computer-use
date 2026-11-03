# Native `session.active` bridge patch

Source-only integration for official OpenCode **v2.1.1** at
`ba546ec1598a70db2570e9c6258028d955ba8f58`. Current patch SHA-256:
`91ff1912ab3bfd9a10ec2114ff30dd43f10e793de3e7d9df9929269a833a6e55`.

The worker's exact return is preserved as `session-active.worker.patch`, SHA-256
`0b09a3765c71acbda620cfada384e324c47684b10f0995a857b61daa116b13e3`.
Its reported initial 4-test pass does not verify its final serialization. Parent
review found that ordinary `git apply --check` accepts the zero-context artifact,
but ordinary application places additions at incorrect locations and produces
an invalid adapter. The corrected patch uses native context and exact postimages.
The preserved worker patch requires `--unidiff-zero` even to test its intended
placement; it is not the deliverable or an accepted cancellation implementation.

## Behavior and scope

The core host maps `Session.active`'s foreground read-only set to a fresh record
with exactly those IDs and `{ type: "running" }` values, matching the HTTP API.
Background resources and descendants remain separate. An empty map is not proof
that all work stopped, an ownership release or accepted/completed work.

The patch adds the existing public API's `active` type to both plugin Session
domains and exposes it in the core host and Promise adapter. A dedicated no-input
adapter validates output through the real endpoint schema, rejects pre-abort
before invoking the native method, and passes in-flight cancellation to the
native Effect runtime. Other generic API adapters are unchanged. Their existing
cancellation limitations are not silently fixed or claimed resolved here.

Exactly four upstream files change:

```text
packages/core/src/plugin/host.ts
packages/plugin/src/effect/session.ts
packages/plugin/src/promise/adapter.ts
packages/plugin/src/promise/session.ts
```

Unpatched v2.1.1 still lacks this plugin bridge. Consumers must feature-detect it
and retain unknown foreground state when unavailable. The coordination observer
outside this package does that; there is no event cache or UI imitation here.

## Reproducible source checks

Prerequisites: Node 22+, Git, an explicitly selected pinned upstream checkout with
its native compiler/dependencies already installed, and the local declaration
packages in this package's exact public-integrity lock. Provisioning those local
types does not edit the selected upstream checkout or install a runtime plugin:

```sh
npm ci --ignore-scripts --no-audit --no-fund
NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/opencode-v2.1.1 npm test
```

For bounded layer-specific evidence, use the same explicitly selected checkout:

```sh
NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/opencode-v2.1.1 npm run test:runtime
NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/opencode-v2.1.1 npm run test:surfaces
```

`test:runtime` selects the four mapping/adapter fixture-runtime cases only; it does
not construct the full host or load native participants. `test:surfaces` selects
the ambient compatibility and two public-contract compiler cases and needs its
own adequate resource envelope. Neither command replaces `npm test`: that original
full command is unchanged and still includes the unverified full-host check.
Do not use layer selection to call the package, native integration or UI accepted.

The test requires the exact pin and clean four target files, stages only selected
`git show` bytes in task-owned `/tmp/opencode` scratch, and leaves unrelated
native-row edits untouched. It runs the actual patched Promise adapter and
extracts/executes the actual host mapping expression; only the coordinator set
and native I/O boundaries are fixtures. It checks fresh maps/schema rejection,
failures, pre/in-flight abort and cleanup, plus worker negative controls. Tests
do not depend on another test applying the patch first.

Type checks run in separate bounded compiler processes with strict/no-emit and
`skipLibCheck:false`. Genuine `@types/json-schema@7.0.15` and
`@types/mime-types@3.0.1` are locally pinned, integrity-locked and byte-checked;
the scratch compiler resolves these missing declarations through explicit paths.
The selected upstream `bun-types@1.4.2` also conflicts with its installed
`@types/node@24.12.2`: four real ambient diagnostics concern TextEncoder, TLS and
KeyObject declarations. A genuine local `@types/node@26.6.6` / `undici-types@8.9.0`
closure supplies the compatible ambient type root, without changing the installed
upstream types or the running Node version. A dedicated compiler regression
reproduces all four old-root errors and passes with the new root. These are type
checking inputs, not a claim of Node 22/native runtime compatibility.
No handwritten module shim, filtered diagnostic, upstream dependency edit or
library-check bypass is used.

Parent runtime checks now pass **4/4**, including the actual mapping/adapter,
misplaced-worker and ignored-pre-abort negative controls, schema/error rejection,
and pre/in-flight cancellation with native Effect cleanup. The adjacent six
existing preview tests also pass. The first combined run hit Node's 180-second
whole-file timeout before delivering compiler results and is not a bridge pass.
The command now has a bounded 600-second outer / 580-second file limit; each
compiler subprocess is separately bounded and runs serially. The first three
strict checks failed with the genuine Bun/Node diagnostics (surface checks) or
a 170-second timeout (full host), so none was accepted. After the separately
passing ambient compatibility regression, the two public surface checks pass:
unpatched types fail only for the missing `active`, and patched Promise/Effect
contracts pass authentic strict/library checking. The full-host graph contains
2,826 files and exhausts the bounded 2 GiB compiler heap after about 225 seconds.
That broader graph check remains failed/unverified, not omitted or filtered into
success. The complete package command therefore does not have a passing result.
Compiler children now use a 2 GiB V8 heap cap, and full-host program-size/memory
diagnostics are retained on failure; no unrelated process is stopped to free RAM.
Do not call a missing dependency, timeout or interrupted run a pass.

### Upstream-declared native compiler investigation — 2026-10-29

The pinned upstream root/plugin manifests also declare `@typescript/native` as
an alias of official `typescript@7.0.2`; the partial installed dependency tree
does not contain it. Parent verified that exact public npm artifact's SHA-512,
read its real synchronous/virtual-filesystem API, and provisioned only a private
development probe under `/tmp/opencode`. Its 21-entry public SHA-512 lock installs
two platform packages with lifecycle scripts disabled. Neither repository's
manifest, dependencies or running integration was changed by this probe.

Three actual native-API controls passed with all seven non-suggestion diagnostic groups queried:
valid source has no diagnostics; a virtual source type error produces TS2322;
an external declaration error produces TS2304 with library checking enabled.
Each control contains 65 source files and closes its API instance. These controls
verify compiler/overlay/error-reporting capability, not bridge or host acceptance.

Two host-rooted trials used the exact contextual four-file patch and config/source
overlays, leaving the upstream targets clean. Both loaded 2,826 files and all
four patched files; config/program diagnostics were empty. A sampled owned-process
RSS guard stopped each before global/semantic diagnostics finished:

| Go process settings | Stop | Elapsed | Observed peak owned-tree RSS |
| --- | --- | ---: | ---: |
| `GOMEMLIMIT=512MiB`, two processors | 1 GiB RSS budget | 21.97 s | 1,025.54 MiB |
| `GOMEMLIMIT=256MiB`, `GOGC=25`, two processors | Same RSS budget | 23.94 s | 1,025.64 MiB |

Both supervisors retained the same 768 MiB system-available-memory floor,
90-second deadline and bounded output, killing only their dedicated worker group.
Go's memory setting is a soft GC target, not a hard limit; the sampled RSS guard
is not atomic either. Lower GC tuning did not finish the check. Matching graph
counts do not establish byte or semantic equivalence between compiler versions.
No complete native diagnostic receipt or passing native-host result was produced.
The original TypeScript 6 heap failure and complete package failure remain
explicit; no diagnostic/source filtering, larger heap, upstream edit, activation,
unrelated-process termination or native-participant/UI outcome follows.

A third bounded probe verified the actual project options `singleThreaded:true`
and `checkers:1` through API readback and the same three positive/type/library
controls. CLI flags cannot be passed through API mode (the direct wrapper failed
before any host check); no RPC error was treated as a pass. With the verified
project settings and explicit `noCheck:false`/`skipDefaultLibCheck:false`, the
2,826-file host probe still hit the unchanged RSS guard at **32.64 s / 1,024.47
MiB**, before global/semantic completion. It produced no passing receipt. All
three host probes are terminal; no guard, diagnostic scope or source was weakened.

These checks do not instantiate the full `PluginHost.make` service graph or real
`Session.Service.active`, exercise user sessions, integrate upstream, install or
activate a plugin, or change the user's running OpenCode. A cancellation fixture
proves the tested native Effect finalizer ran, not that every real background
resource or descendant stopped.

### Read-only verification-route review — 2026-10-29

A bounded read-only child review and independent parent source inspection retain
the exact patch hash and pinned upstream commit, with all four bridge targets
clean. The parent reread the actual full-host checker and private native-API
probe: the host root still traverses the unfiltered program; all seven native
non-suggestion diagnostic groups remain requested. The API's optional per-file
syntax/bind/semantic/declaration methods still operate on that same project;
global/program diagnostics remain project-wide. Their presence is not evidence
that iterating files would fit the unchanged resource envelope.

Neither expected native-host receipt exists in the inspected probe directory.
No compiler was rerun, no cap enlarged and no source/diagnostic filtering or
dependency/upstream edit was performed. The dated heap/RSS failures above remain
failures; this review found no **verified** memory-saving route, not a proof that
every possible compiler implementation is impossible. Actual host/service graph
construction and real native-participant/UI acceptance also remain separate,
unfinished evidence even if a later full type check succeeds.

### Canonical dependency closure and resource preflight — 2026-10-29

Canonical `node_modules` was absent. Parent validated its four public npm SHA-512
lock entries, then provisioned only that new declaration tree with lifecycle
scripts disabled, empty explicit npm configs and a secret-free environment.
The lock remains `c98bfd0f08393e084522908de024bdef9b9886eecb5211fa6c2e851cfe5cedd3`.
The manifest subsequently adds only the two layered scripts above; direct pins
and the original full test command remain unchanged. No upstream dependency was
replaced. The real canonical **`npm run test:runtime` passes 4/4**, including both
worker negative controls, schema/error rejection and cancellation cleanup. Its
upstream four-target cleanliness assertion passes after execution.

Parent also provisioned a new private official TypeScript 7.0.2 compiler from the
previously reviewed 21-entry public SHA-512 lock, scripts disabled. Three fresh
controls each loaded 65 files and requested all seven diagnostic groups: valid
source had none; a source overlay produced TS2322; a broken external declaration
produced TS2304. This confirms the compiler's checking capability, not the host.

The proposed full-host probe uses canonical patch/types, all four overlays and
the same unfiltered 2,826-file contract. A 1,536 MiB owned-worker RSS allowance
with a stronger 1,280 MiB system-available-memory floor requires 2,816 MiB before
spawn. Available memory fell below that threshold, so the guard refused **before
spawning**. Reducing only the worker allowance to 1,280 MiB kept that floor and
required 2,560 MiB; this preflight also refused before spawn. No full-host compiler
ran in either attempt, no guard was relaxed further, and no host diagnostic receipt
exists. These are resource-preflight refusals, not new semantic host failures or
passes. The earlier TS6 heap and three TS7 RSS failures remain unchanged history.

Probe setup is under `/tmp/opencode/native-host-canonical-aNBGW3`; it preserves the
old compiler probe unchanged. The canonical `test:surfaces` and full `npm test`
were not rerun. No real host/service graph, session participant, native UI, model,
runtime profile, installed application, activation, shared service or user process
was changed. Complete native-host verification is still an engineering task.
Durable setup/result receipts are in
`/home/james/Documents/computer-use-native-host-20261029/{before,after}.json`;
they are observations, not a missing host diagnostic receipt.

### Later actual canonical host trial — 2026-10-29

A fresh available-memory observation of 3,105 MiB satisfied the prepared guard,
so one actual canonical host check ran with the existing 1,280 MiB worker RSS cap,
1,280 MiB available-memory floor and 90-second deadline. It loaded **2,826 files**
and every canonical overlay. Config/program diagnostic groups returned zero;
global/semantic checking did not finish. The owned-worker RSS guard stopped it
at **48.362 seconds**, sampled peak **1,281.449 MiB**, minimum observed available
system memory **1,696.789 MiB**. The dedicated worker group was terminated; no
unrelated process was signalled. This is a real failed/resource-incomplete host
trial, unlike the earlier no-spawn refusals.

The measured system margin supported a distinct 1,536 MiB proposal with the same
floor/deadline/diagnostic scope, but its 2,816 MiB prelaunch requirement was not met
when invoked; it refused before spawn. No second actual host check ran. Both
results remain distinct and no further retry or floor reduction followed.
The complete native diagnostic receipt still does not exist, source/diagnostic
coverage was not filtered, and the selected upstream four targets remain clean.
These sampled RSS/floor guards are not atomic resource limits or compiler-byte
equivalence proofs. The full package/loaded native/UI outcome remains unverified.

The exact failed supervisor receipt and follow-up observations are preserved as
`canonical-host-1280-supervisor.json` and `canonical-host-follow-up.json` beside
the durable setup receipts above. Earlier `before.json`/`after.json` remain their
original no-spawn checkpoint, not overwritten by the later trial.

### Subsequent 1,536 MiB result recovered after restart

A later invocation did run and hit the 1,536 MiB owned-RSS guard at
**50.805582344 seconds /1,536.71875 MiB**, minimum available system memory
**1,530.99609375 MiB**. It loaded all2,826 sources/four overlays and completed
only config/program diagnostics (zero); global/semantic groups did not finish.
The 1,280 MiB system floor and90-second deadline were unchanged. This is a second
actual resource failure, not the intervening no-spawn refusal and not a host pass.

The temporary workspace was subsequently absent, cause unestablished. Exact
output was recovered from completed native message `msg_18776680d001wD8hGtPOgh6ebe`,
tool `call_7154a26cc77e41eeb0706e198aded401`; tool-text SHA-256 is
`969eda77d745ec3c22d032e03bb1248b40e7b9610147d5162c0104a1b0797c35`.
`canonical-host-1536-recovered-tool-result.json` beside the durable receipts
above explicitly identifies itself as recovered tool output, **not the original
filesystem receipt**. No compiler rerun or full-host/native/UI acceptance follows.

### Prepared TypeScript 6 file-check feasibility probe — not executed

Under continuation goal `f37a5099-9f81-4daa-9819-e45e37ee1c90`, parent prepared a
distinct source-only experiment using the existing actual TypeScript6.0.3 API.
The earlier full TypeScript6 check accumulated the complete diagnostic graph;
the proposed pilot would retain the entire host-rooted program and all four
exact bridge overlays, but request semantic/declaration diagnostics for the host
file alone. Config/options/syntax/global queries remain whole-program. That
single-file assignment is deliberately **not full-host diagnostic coverage**.
It would measure feasibility before considering an exact all-file partition.

Three authored controls require valid source to pass, a source error to yield
TS2322 and an external declaration error to yield TS2304, with per-file results
matching whole-program diagnostics across all six public groups. Both scratch
scripts pass `node --check`; their compiler behavior is **not yet verified**.
The controls must finish before any host pilot, and a successful pilot alone
would still leave all unassigned files, full host construction and loaded native
UI/participants unaccepted. No source or diagnostic omission may become a pass.

The actual first control launch refused **before spawn**: available memory was
2,048.609375 MiB against the unchanged2,304 MiB requirement. The probe retains
768 MiB heap/1,024 MiB owned-tree RSS/1,280 MiB available floor/90-second limits.
No compiler or host pilot ran, no guard was lowered, and unrelated work was not
terminated. These are sampled guards, not an atomic resource guarantee.

Durable evidence is preserved as non-executable JSON under
`/home/james/Documents/computer-use-native-host-20261029/`:

- `host-file-check-controls.json`: actual no-spawn supervisor result.
- `host-file-check-preparation.json`, SHA-256
  `8c342eaf4644e7153aca90947c21bc5f646f2fda9871e03a1d788b4f6ef201db`:
  exact authored scripts, selected patch postimages, baseline and unchanged-source
  observations. This is preparation evidence, not an accepted executable package
  entrypoint or a passing compiler receipt.

The selected upstream four targets, existing native TUI work, staged R100 patch
and project config are unchanged. No dependency installation, runtime-profile
change, activation, PR integration, shared restart or loaded outcome followed.
Resume this prepared experiment only when a fresh resource observation satisfies
the existing guard; do not rerun already completed AI-config diagnostics or the
unchanged failed whole-program host trial as a substitute.

### Subsequent controls executed; host pilot still refused

A fresh continuation observed2,443.773438 MiB available. The actual guarded
control process then launched at2,392.304688 MiB and passed all three69-file
controls with all six diagnostic groups: valid source zero, source error TS2322,
external declaration error TS2304. Whole/per-file query results agreed in each
control program. Elapsed12.768303 seconds, peak336.281250 MiB, minimum available
2,214.640625 MiB; all limits remained unchanged. These are API/error-reporting
controls, not a host graph, native service construction or model/runtime outcome.

The following pilot launch refused **before spawn** at1,990.152344 MiB available,
below the unchanged2,304 MiB requirement. No host graph, partial semantic result
or new full-host result was produced. Completed AI-package checks were not rerun.

Parent also corrected a receipt-reuse defect in the **scratch supervisor**, not
the installed native runtime. It now requires a bounded attempt label and rejects
an existing result path before launching. An actual old-versus-current regression
reproduces the old code attempting a child launch, while the current code refuses
before that boundary and preserves the result bytes. Only memory/process I/O is
stubbed in this regression, so no compiler is launched by it; the one test passes.

The original preparation and no-spawn receipt remain unchanged. New durable
`host-file-check-controls-continuation1.json` and
`host-file-check-pilot-continuation1.json` retain the actual results. Their audited
record `host-file-check-control-acceptance.json`, SHA-256
`a9b2ecbbc74a8c6885f7658e2ff0ab73692e70892dc9911fa54603a7087ac82e`,
preserves the new supervisor and regression source alongside actual control output
and unchanged-source/index/config evidence. Despite the filename, its acceptance
is **control-only**, not host feasibility or full native acceptance. No guard,
permission, dependency, profile, source patch or native target was changed.

### Actual host-file pilot — heap failure, not another prelaunch refusal

Continuation goal `94b75188-d64c-459a-8eac-560595802012` observed3,260.687500 MiB
available; the prepared pilot launched at3,214.609375 MiB under the unchanged
768 MiB heap/1,024 MiB RSS/1,280 MiB system floor/90-second limits. It terminated
with **SIGABRT and V8 heap exhaustion** after44.809923 seconds, peak897.105469 MiB
owned RSS and minimum available2,313.757813 MiB. The supervisor did not hit its
RSS/floor/deadline guards. This actual compiler failure is distinct from the
earlier no-spawn refusals and does not justify increasing limits automatically.

The program-created record reports one host root,2,826 input files and four
bridge overlays. Its large asynchronous stdout record was truncated at146,176
bytes when V8 aborted, so only its complete header prefix is recoverable. This
is **not** a complete received graph manifest, diagnostic-group completion or
host semantic result. Even a successful host-file pilot would be partial coverage;
this failed pilot establishes neither feasibility nor full-host acceptance.

Parent reproduced the evidence-publication defect independently of the compiler:
the original `console.log` of a1 MiB JSON record followed by immediate exit loses
bytes and fails parsing. A bounded synchronous stdout publisher preserves that
same full record. Two tests pass, including short UTF-8 writes, zero/invalid
progress, I/O failure and pre-write byte-limit refusal. The scratch probe now uses
that helper; **the failed compiler was not rerun** and no result was retroactively
filled in. The helper repair fixes evidence delivery, not compiler memory use.

Actual failure receipt `host-file-check-pilot-94b75188.json`, SHA-256
`01573e234841275e4a9d4fbaafc355a36e309437f60e512797c082468b019116`,
is retained unchanged in the durable Documents directory above. Audited evidence
`host-file-check-pilot-94b75188-audit.json`, SHA-256
`4762887a441bc398d689b525a0b8c54177255e2812d7c6a04a975e670560ea90`,
preserves the exact partial-output recovery method, failure, publication helper/
tests and unchanged native/index/config observations. The worker hash after the
publication-only repair is `d0399c37cd22ce85a9ab64aa331e3d35b931b4c8d95f7f4890ba2b11568ad593`;
the original actual-run worker remains preserved in the prior control receipt.
All earlier positive controls, compatibility passes and original whole-host
failures remain distinct. No dependency, native target, running profile or loaded
service was changed; no full-host/native/UI acceptance is claimed.

### Direct official TypeScript 7 CLI route — investigated, not accepted

A later read-only source inspection found an already-installed official TypeScript
7.0.2 CLI in the pinned upstream checkout: the `@typescript/native` alias resolves
to the real `typescript` package, whose locator resolves
`@typescript/typescript-linux-x64/lib/tsc`. This is materially different from the
resident JavaScript/native API route. No package was installed or replaced.

The exact public npm SHA-512 tarballs for `typescript@7.0.2` and
`@typescript/typescript-linux-x64@7.0.2` were downloaded and compared **in memory**
with the installed bytes: 416 and114 published regular files matched respectively.
The executable SHA-256 is
`4f2de678286401759b3fb4475bafe35b8f32b4b3a07d92642bbf37eadc9b34a4`;
`--version` reported `Version 7.0.2`, and `--help --all` documented
`--singleThreaded`, `--checkers`, `--listFilesOnly`, `--noCheck`,
`--skipLibCheck` and `--skipDefaultLibCheck`. This establishes package identity
and CLI capability, not host-program equivalence or acceptance.

A guarded scratch supervisor reserved a bounded receipt before each launch,
tracked only the new process group, sampled owned RSS/available memory, and
preserved output with synchronous full-write publication. One **positive**
three-file control passed in1.35 s at81.2 MiB peak owned RSS. Its next
**source-error** control was refused before spawn when available memory fell to
2,724.1 MiB against the unchanged2,816 MiB prelaunch requirement. A later
list-only attempt also refused before spawn. At the last observation available
memory was1,140.4 MiB, below the1,280 MiB floor; no guarded compiler process was
started. These are resource refusals, not passes or semantic failures.

The same-version API produced a complete **program graph** for the original
config: **2,826 files**, root `packages/core/src/plugin/host.ts`, 87 default-library
entries, 1,962 external-library entries, `strict:true`, `noCheck:false`,
`skipLibCheck:false`, `singleThreaded:true`, `checkers:1`, and graph SHA-256
`794780d2303226b131b87a88e9fb76c3b44f7392014027c1bb7c76248d8b41be`.
That original-config graph cannot contain the four overlays by construction; it is
a baseline only. The run was **not** under the guarded supervisor, which is a
limitation of this probe. A task-owned sparse source mirror with all8,597 tracked/
untracked entries, four patched overlays, 38 workspace and223 dependency links was
prepared for the mirror comparison. Its integrity audit reread all8,597 entries
with zero failures: every copied byte matches its source (or declared overlay),
all43 file symlinks and261 module links are accounted for, and the pinned native
status is unchanged. A compare verifier now binds exact relative/absolute file
sets, per-file hashes, the four overlays, root files, compiler identity/options
and both CLI file lists; its refusal controls cover missing/extra/duplicate files,
overlay drift, non-overlay drift, option/root drift and non-absolute/duplicate CLI
entries. **Nine** mirror/compare tests pass, with a genuine red iteration before
the assertion-order and expectation fixes.

Both CLI file lists then ran under a work-specific512 MiB/1,280 MiB-floor/
60-second guard: each resolved exactly2,826 paths, exit0, no stderr, peaking
about369 MiB. A normalized comparison (compiler libraries inside the original
checkout are external to the mirror but denote the same files) found the original
API graph, original CLI list and mirror CLI list **identical at2,826**, with zero
duplicates. Because the integrity audit separately proves every mirror byte equals
its source or declared overlay, the mirror's resolved graph is content-equivalent
to the original graph except the four intended overlays. That constructive result
was later confirmed by a real second API graph. A mirror API-graph attempt under a512 MiB cap was stopped at517.85 MiB after6.57 s;
a later640 MiB attempt stopped at650.55 MiB after9.86 s. Neither produced a graph.
Under a work-specific **768 MiB cap / 1,280 MiB floor**, the mirror graph then
completed: **2,826 files**, `strict:true`, `noCheck:false`, `skipLibCheck:false`,
graph SHA-256 `4931caa97d988d1faea0da3c3a6c0894c50ea185b2042054eaf06aec80d8d83f`,
peak owned RSS **755.60 MiB**,12.68 s. The strict `compareGraphs` verifier, after
normalizing root-bound `configFilePath`/`outDir`, then passed: **4 overlays,
2,822 identical non-overlay entries, both CLI lists2,826, zero mismatch**. Its
five tests pass, including a real red on unnormalized path options and a semantic
`outDir` drift control. This is a real second API graph, not the earlier
constructive comparison, and closes graph/overlay equivalence.

The full CLI **diagnostic** run was attempted. Caps of1,024 and992 MiB refused
prelaunch (available2,107.1 and2,091.7/2,244.98 MiB). A960 MiB cap actually
spawned: it ran **26.199 s**, peaked at **960.57 MiB** and was killed by its owned-
RSS guard with no stdout. A later **940 MiB** run with `GOMEMLIMIT=256MiB` and
`GOGC=10` also ran **29.6 s** and was killed at **940.84 MiB**, with no output;
lower GC did not fit the smaller envelope. This proves the full diagnostic footprint
exceeds960 MiB; these are resource-incomplete runs, not a semantic failure or pass. The1,024 MiB cap
needs2,304 MiB prelaunch and the1,536 MiB host cap needs2,816 MiB, so neither ran.
No host semantic result, full package check, native service, loaded UI or participant
outcome follows, and the resource limits were not relaxed. Prepared scratch and exact
identities are under `/tmp/opencode/native-host-cli-J6gwjl`; durable receipts are
under `Documents/computer-use-native-host-20261029/direct-cli-route/`: manifest
`241f5f70…`, extensions `13b784bc…`, `d3c496eb…`, strict-equivalence/refusal
`572e5fc4…`, actual 960 MiB run `full-cli-v4.json` SHA `3981948e…` under
`MANIFEST-EXTENSION-4.json` SHA `8ed26b39…`, and lower-GC 940 MiB run
`full-cli-v7-gc.json` SHA `c5014060…` under `MANIFEST-EXTENSION-5.json` SHA
`ab68235e…`. Earlier verifier bytes remain untouched.

### Direct-CLI control continuation — 2026-10-30 UTC

A single fresh prelaunch observation was **2,287.402344 MiB**, below the existing
2,816 MiB full-host threshold (1,536 MiB worker plus 1,280 MiB system floor).
No full-host compiler was launched, no limit increased, and no memory polling or
unchanged failed-graph retry followed. The prepared direct-CLI directory still
exists; source inspection does not make its incomplete diagnostics a pass.

The selected compiler remains a regular file with the exact authenticated SHA-256
`4f2de678286401759b3fb4475bafe35b8f32b4b3a07d92642bbf37eadc9b34a4`, checked
before execution. A new private control-only copy reuses the supervisor's exact
bytes with a **smaller** 512 MiB worker allowance, unchanged 1,280 MiB floor,
1,792 MiB prelaunch sum and 90-second deadline. The valid control passes exit0,
empty output, **1.294385 s /83.773438 MiB peak**. The subsequent source-error
control refuses before spawn at **1,790.843750 MiB**; the declaration-error control
does not run. This is an incomplete direct-CLI control suite, not a host result
or a semantic failure. Earlier controls/receipts are unchanged.

The exact source snapshots and actual receipts are retained as non-executable
JSON at `~/Documents/computer-use-native-host-20261029/direct-cli-route/controls-20261030-kL1gNz/receipt.json`.
No installed package, upstream target, running profile, service or unrelated
process was changed. Full-host semantics/construction and native UI/participants
retain their original unfinished evidence layers.

### Unfinished negative controls completed — 2026-10-30 UTC

The earlier tiny positive remains accepted and was not rerun. Fresh private
scratch restored the supervisor byte-for-byte (`3cfecd72…`), with unchanged512MiB
owned-RSS/1280MiB available-floor/1792MiB prelaunch/90s limits and strict/noEmit/
noCheck:false/skipLibCheck:false/skipDefaultLibCheck:false controls. Pinned native
compiler7.0.2 still hashes `4f2de678…b34a4`.

The asynchronous DeepSeek child ran the previously unexecuted source-error case:
exact TS2322, empty stderr, exit1/signalnull,1.312733s/78.390625MiB. Its original
harness expected classic tsc's exit2 and failed that assertion; the run, receipt
and script remain preserved, not retroactively marked successful. Parent checked
the native receipt and corrected the expectation to **observed exact native
exit1**, not arbitrary nonzero acceptance or a claimed published exit spec.

A new library-only harness inspected the unchanged source receipt without
rerunning its compiler, then ran the still-unexecuted declaration-error case:
exact TS2304 in external.d.ts, empty stderr, exit1/signalnull,
0.998564s/79.035156MiB. Both receipts reject duplicate publication with EEXIST
before another compiler spawn and retain identical bytes. The initial harness
failure remains separate from this verified source/library diagnostic outcome.

Final non-executable12-file source/receipt snapshot:
`~/Documents/computer-use-native-host-20261029/direct-cli-route/negative-controls-20261030-C7mT48/receipt.json`,
SHA256 `ed70e0338b168dfb21a27c8c657f9603e0089b2d9b8d40902f46cd1202cbe46b`.
Earlier receipt still hashes `3c62395e…7e14c`. No accepted positive, native full-host
graph/diagnostics, build, installed inputs/profile or service was rerun/changed.
These tiny fixtures establish source **and declaration** error detection, not a
strict full-host or loaded-client pass.

### Fresh current-tree route and actual1536MiB full-CLI result — 2026-10-30 UTC

Parent independently verified33archived manifest hashes/all2826historical graph
file hashes and regenerated the four exact overlays from pinned originals plus
the canonical local patch. A fresh mirror copies all8601current native entries
(8558files/43symlinks,138,075,906bytes) with zero exclusions, preserving newer
selector/subagent-row work instead of reverting or filtering it to match8597.
Native status/list, frozen inputs and original host bytes remain unchanged.

Nine restored mirror/comparator tests pass. The graph helper changed only its
obsolete private identity-file lookup, not graph/options/diagnostics. Its first
driver failed a stale2826count assertion: actual current graph has2827files.
All old files/hashes remain; the only added entry is the already-pinned
buffer6.0.3/index.d.ts. No file was removed to satisfy the historical count.

Fresh actual original API graph:738.176MiB/11.056s. Mirror-only continuation:
752.730MiB/11.507s, no original rerun. Both actual CLI lists pass at370.270MiB/
4.201s and346.387MiB/3.444s. Strict comparator verifies2827files, four exact
overlays,2823identical entries, equal normalized roots/options and both CLI sets.
Graph/list resource envelopes stay unchanged from the retained route.

With graph prerequisites met, one previously unrun **full direct-CLI** diagnostic
attempt used the original `eee5618d…` supervisor's1536MiB ownedRSS/1280MiB floor/
2816MiB prelaunch/90s deadline. It actually spawned at2917.930MiB available,
ran70.873589s, and was SIGKILLed by the RSS guard at1537.800781MiB (705samples).
Minimum available stayed1713.531MiB. Stdout/stderr are empty; this is resource
failure, **not a semantic/typecheck pass or failure**, and not a selector build.
No unchanged retry, cap ratchet, diagnostic suppression or installed-client change.

Exact29-file non-executable helper/overlay/graph/receipt snapshot:
`~/Documents/computer-use-native-host-20261029/direct-cli-route/restored-current-20261030-raOU9t/receipt.json`,
SHA256 `0f8fbeb89ecaac2ed6cd364d56df6cc5eddeb3887b4ef7b37817826938113b9c`.
It includes the stale-count failure's driver, current manifests and actual terminal
receipt (`e59bdcbe…`), but **not a complete backup of the138MB source mirror**.
Historical receipts/failed attempts remain intact. Full-host diagnostics stay
unfinished under current limits; benchmark, selector-build and loaded outcomes
remain distinct unverified layers.
