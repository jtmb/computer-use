# Conditional session title — unapplied core + transport artifact and bounded proof

Status: **source integration proof**, not an installed fix or a claim that a native patch is
mandatory. This directory ships **unapplied** patches for the pinned OpenCode 2.1.1 sources plus
bounded tests that prove the contract against the **real** core Bus/SQLite, the real HTTP handler
(in-process, no listener) and the real plugin host.

`opencode-native-row` is read-only input. The pin is checked by commit, selected-tree cleanliness
and `SOURCES.sha256`; nothing is written to it. Code generation runs only in a staged copy.

## Artifacts

| File | Scope |
| --- | --- |
| `conditional-rename.patch` | Core: `Bus.PublishOptions.guard` evaluated inside the durable commit transaction, `Session.TitleConflictError`, and a separate `Session.renameConditional({title, expectedTitle})` with the precondition checked before projection. The existing `Session.rename({title})` signature, implementation and `NotFoundError`-only error channel are untouched. |
| `transport.patch` | Protocol `PATCH /api/session/:sessionID` gains `expectedTitle` and declares `InvalidRequestError`/`ConflictError`; the server handler validates and dispatches the conditional branch to `Session.renameConditional` (legacy branch keeps `Session.rename`); the core plugin host does the same dispatch. |
| `capability.patch` | Optional plugin-host `session.capabilities()` handshake: declared on both the Effect and Promise `SessionDomain`, answered by the core host with `Effect.succeed({ conditionalTitleUpdate: 1 })`, and bridged through `fromPromise`. Absence, a malformed result or a rejection means unsupported. No HTTP endpoint, version heuristic, probe write or new store. |
| `negative-control.patch` | Removes only the guard evaluation; the manual-title assertion must fail. |
| `negative-forwarding.patch` | Drops the conditional dispatch so the handler and host call the legacy `Session.rename`; the same manual-title assertions must fail (the guard is never reached, so this is not a guard-rejection test). |
| `negative-conflict.patch` | Removes only the 409 mapping; the status assertion must fail while the title stays preserved. |

### Contract

- **204 success**: `expectedTitle` equal to the stored title commits the title and applies the
  other supplied mutable fields through the existing update path. This does not make all those
  separate field operations one atomic transaction.
- **409 conflict**: stable message `Session title changed before the conditional rename.`
  (`resource` = session id, no title text, no SQL/internal detail), manual title preserved, and
  **no accompanying `metadata`/`permissions`/`archived` is applied**.
- **400**: `expectedTitle` without a title, or with `title: ""` (the HTTP regeneration trigger).
  Nothing is renamed and no generation is invoked.
- **404**: missing session, conditional or legacy.
- **Legacy preserved**: HTTP empty title still takes the generation path; the plugin host's empty
  title is still a plain rename to `""`. That difference is intentional and asserted.
- **Legacy error contract**: existing callers of `Session.rename` keep `{title}` and
  `Effect<void, NotFoundError>`. The conflict error exists only on `Session.renameConditional`, so
  no unconditional caller's error channel widens.
- **ABA limitation**: expected-title equality cannot distinguish a rename away and back, so
  `A -> B -> A` is accepted. Explicitly tested; no sequence guarantee is claimed.

### Generated client

`transport.patch` is the protocol change; the client is regenerated, never hand-edited. Staged
`bun run generate` (from `packages/client`) produces:

- `src/promise/generated/client.ts`: `expectedTitle: input["expectedTitle"]` in the PATCH body and
  `declaredStatuses: [400, 401, 404, 409]` for `session.update`;
- `src/promise/generated/types.ts`: `SessionUpdateInput.expectedTitle?: string`;
- `src/effect/api/api.ts`: `SessionUpdateInput.expectedTitle?: string` (the Effect plugin domain
  picks it up through the client API);
- `src/effect/generated/client.ts`: the same request field.

Recorded in `logs/generated-shapes.txt` with SHA-256 digests for this run. The harness proves the
staged client resolves the staged `packages/protocol` (never the pin) via `Bun.resolveSync`, and
the generated shape assertions confirm the modified protocol was the input.
Two additional tests execute the actual generated Promise `session.update` with an injected fetch
boundary: the conditional PATCH body is checked and a409 is recognized as the declared
`ConflictError`. These are client-method behavior, not a real network/authentication test.

### Not implemented / gated

- No activation, deployment, service restart, installed-client build or live server request.
- The conditional method and the staged plugin→client chain were not typechecked; no compiler or
  full graph was run, and no type pass is claimed. The legacy `rename` contract is preserved at the
  source level (signature and implementation are diff context, not changed lines).
- Human UX, TUI rename wiring and installed 2.1.1 behaviour remain unobserved.

## Harness safety

- `run.sh` validates the pin (commit `ba546ec…`, selected-tree cleanliness, `SOURCES.sha256`), then
  allocates a **shell-level** `mktemp -d /tmp/opencode/title-cas-XXXXXX` before any Bun process.
  It refuses a symlinked scratch root and pre-existing workspace outputs, and never deletes,
  reuses or chmods earlier workspaces or native/user inputs (`umask 077`). Generators write
  only in the new owned stage; OpenAPI regeneration replaces its copied baseline there.
- Every native test/generation subprocess goes through the reviewed `runner.ts`: a 256 KiB
  **retained-output** cap (shared stdout+stderr, i.e. kept bytes, not the size of each read — pinned
  Bun raises a stdout BYOB TypeError, so acquisition is not strictly pre-read chunk-capped),
  45 s deadline, exclusive `wx` logs, only its own child handle.
  Raw bytes prevent invalid-UTF8 log expansion, capture read errors are incomplete, and readers
  are bounded even if descendants hold pipes after the root exits. Observed root exit/capture
  flags are not a descendant-reaping guarantee; owned fixture descendants self-exit.
- Staged copies are limited to the required core/protocol/client/plugin/server trees. Staged
  `node_modules` are real directories with absolute links to pinned dependencies and explicit
  overrides for modified packages; that is dependency resolution, not sandboxing.
  The three generated output trees are excluded from the source copy, then checked as real,
  empty private directories before generation. The writer's obsolete-manifest pruning therefore
  has no prior files to remove; no old workspace, native file or previous generated byte is deleted.
- Children run with private `HOME`, `XDG_{CACHE,CONFIG,DATA,STATE}_HOME`, `TMPDIR`,
  `BUN_RUNTIME_TRANSPILER_CACHE_PATH`, `OPENCODE_DB=:memory:` and the native offline-fetch guard.
  The only PATH addition is the pinned bun directory for the codegen child.

## Tests run

| Suite | Where | Asserts |
| --- | --- | --- |
| `runner.test.ts` (11) | staged runner | allocation/refusal, cap, deadline, descendant-pipe bound, invalid UTF-8, limit envelope, capture-error classification, sentinel retention |
| `cas.test.ts` (9) | staged core | conditional success, exact title, deterministic Store.get interleave, legacy, missing session, ABA, named export, non-durable/publishAll guard rejection |
| `codegen.test.ts` (6) | staged client | staged-protocol resolution, emitted shapes, actual generated PATCH body and declared409 behavior |
| `resolution.test.ts` (3) | staged core | core resolves the staged plugin, the staged plugin resolves the staged regenerated client, and that client owns the `expectedTitle` types |
| `transport-http.test.ts` (6) | staged server, in-process fetch | success including mixed fields, conflict with real permission payload + no other fields +409 body hygiene,400 invalid preconditions, HTTP empty-title generation path, legacy/404 |
| `transport-host.test.ts` (6) | staged core plugin layer | host forwarding, conflict preservation + core error, empty-title difference, invalid precondition fails, expectedTitle + empty title refused with title/metadata preserved, missing session |
| `adapter-boundary.test.ts` (3) | staged core, public promise boundary | staged promise adapter conflict rejection + preservation, conditional success with other fields, pinned-adapter fall-through control |
| `capability.test.ts` (2) | staged core, public promise boundary | capability handshake returns exactly `{conditionalTitleUpdate: 1}` with no write, and the pinned adapter exposes no capability (absence, not a version guess) |
| `controller-boundary.test.ts` (6) | exact copied root and handoff-worker controllers → real Promise adapter/core | supported publication, manual rename between final read and publication, and unsupported adapter refusal for each path; worker policy remains enabled |
| `openapi.test.ts` (5) | regenerated staged protocol document | optional precondition,409/error schema, legacy request/response preservation, complete local reference resolution and distinct pinned baseline |
| negatives | staged copies | guard removal, dropped conditional dispatch (HTTP and host), dropped409mapping, typed-chain before-state, and separate root/worker controller mutations removing only the precondition or capability gate; copied OpenAPI baseline fails the owning freshness check before regeneration |

Recorded evidence (this checkout, pinned bun 1.4.2, workspace retained under `/tmp/opencode`):

```
runner 11/11; core 9/9; core negative at manual-title assertion
client protocol /tmp/opencode/.../transport/packages/protocol/src/client.ts
codegen ok; generated shapes + digests; generated 6/6
staged core -> staged plugin -> staged client: resolution 3/3
http 6/6; host 6/6; adapter 3/3; capability 2/2
dropped conditional dispatch: manual-title assertion fails (HTTP and host)
dropped 409 mapping: status assertion fails (409 vs 500), title preserved
typed-chain before-state: pinned plugin link fails the staged-plugin assertion
```

The transport tests use the owning native fixture `ServerFetch.make` (in-process web handler, no
port, no listener, no service request) against the real core database and Bus. The plugin host test
uses the native `PluginTestLayer`/`PluginHost.make` fixture. Neither replaces the handler,
controller or Bus with a fake.

### Promise adapter boundary and empty-title refusal — 2026-10-31

Two source gaps from the previous round are closed in the staged artifact only; the served API, the
installed client/plugin and the current controller are unchanged.

- **Host/HTTP empty-title parity.** `transport.patch` now refuses `expectedTitle` with `title: ""`
  in the plugin host before the conditional rename, matching the HTTP precondition refusal. A new
  `transport-host` case supplies a *current* expected title plus a metadata and permission payload,
  and asserts the manual title, metadata and permissions survive. It was genuinely red first: with
  the earlier patch the same request committed `title: ""` (workspace `title-cas-vr9xi5`,
  `logs/host.log`, `5 pass / 1 fail` at the manual-title assertion, received `""`). The
  empty-title guard runs after `sessions.get`, so a missing session still reports
  `NotFoundError`; the legacy empty-title path (no `expectedTitle`) is unchanged and still
  asserted separately.
- **Real promise boundary.** `adapter-boundary.test.ts` registers a promise plugin, runs it through
  the real `fromPromise` adapter (`@opencode/core/plugin/promise` → staged plugin package) against
  the real core host, and lets the adapter compile the staged payload schema before calling
  `host.session.update`. No endpoint schema, decoder or host method is replaced. The measured
  rejection is the real error instance:
  `{"constructor":"TitleConflictError","tag":"Session.TitleConflictError","name":"Session.TitleConflictError","message":"Session title changed before the conditional rename committed: ses_…","keys":["_tag","sessionID"]}`.
  That is this run's observation at the promise boundary, not a declared public contract; the HTTP
  409 text still differs (`Session title changed before the conditional rename.`).
- **Fall-through control.** The same scenario through the pinned adapter and the unpatched protocol
  schema resolves with no error and overwrites the manual title
  (`pinned adapter fallthrough: {"observed":"resolved","title":"Plugin chosen · ses_…"}`). That is
  negative evidence: `expectedTitle` is dropped during payload decoding and the host takes its
  legacy branch. It asserts the overwrite, so it fails if the drop stops happening; it is not a
  preservation claim, and no capability negotiation exists yet.

Workspace `/tmp/opencode/title-cas-ZzZthe` (red run `title-cas-vr9xi5`). Counts this round:
11 runner + 9 core + 6 generated + 3 resolution + 6 HTTP + 6 host + 3 adapter = 44 passing tests:
43 positive cases plus the explicit unsafe fall-through observation, with the same five
assertion-specific expected-failure controls. Parent independently reruns this proof in
`/tmp/opencode/title-cas-G9J917` and observes the same promise rejection and old-adapter overwrite.
Not run: any compiler or typecheck, the
full library graph, OpenAPI regeneration, an installed client/plugin, model, network, service, GUI
or deploy/restart. The remaining limits stand: no full strict type result, no served-schema change,
and controller-side adoption of the capability handshake remain unfinished.

Parent independent run: `/tmp/opencode/title-cas-w9cjbB`, all positives and four intended
negatives inspected. Before correction, the added mixed-success case actually failed
(HTTP5pass/1fail, workspace `title-cas-rZBC2j`): the title committed but metadata stayed
`source:create`. The early return was removed without adding a second unconditional rename.
The conflict request now actually supplies permissions, instead of asserting an unchanged field
that was absent from its input. The initial returned14files remain separately preserved.

This round: the core artifact keeps the legacy `Session.rename` untouched and adds
`Session.renameConditional` for the conditional transport branch; the positive stage now resolves
the staged plugin and the staged regenerated client, with the pinned-link before-state failing the
same staged-plugin assertion.

### Plugin-host capability handshake — 2026-10-31

`capability.patch` adds an explicit, read-only host capability so a caller never has to infer
support from a version or probe with a write. Shared contract (same wording the controller side
uses):

- **OPTIONAL** plugin `session.capabilities()` returns an object `{ conditionalTitleUpdate: 1 }`.
  Only the exact numeric `1` supports conditional title publication.
- A missing method, a malformed or unknown result, or a rejection all mean **unavailable**: no
  generation, storage or update is attempted, and there is no legacy fallback.
- After a successful handshake the caller sends
  `update({ sessionID, title, expectedTitle: lastReadTitle })`. A rejection carrying
  `{ _tag: "Session.TitleConflictError", sessionID }` for that exact session is benign
  concurrent-edit/manual handling — not a permanent failure, retry or compensating rename.
- Native legacy rename/update semantics are otherwise unchanged.

The patch declares `capabilities` on both the Effect and Promise `SessionDomain`, has the core host
answer `Effect.succeed({ conditionalTitleUpdate: 1 })`, and bridges the method through
`fromPromise`'s `ctx.session`. It adds no HTTP endpoint, version heuristic, probe write or store,
and it does not claim published-SDK support: the generated-client conditional update remains the
`transport.patch` change.

Evidence (workspace `/tmp/opencode/title-cas-2PDF4w`):

- **Before** the capability patch, the staged public promise adapter has no `session.capabilities`
  at all: the handshake case failed with the caught error (workspace `/tmp/opencode/title-cas-PFRLcw`,
  `logs/capability.log`, `1 pass / 1 fail`) while the pinned-adapter absence control passed.
- **After**: `capability 2/2`. The staged bridge answers exactly `{ conditionalTitleUpdate: 1 }`,
  and the session's title, metadata, permissions and `time` are asserted unchanged afterwards; the
  plugin body calls only the handshake, so no generation, storage, update or config access exists
  on that path.
- **Control**: through the pinned adapter the same plugin observes
  `typeof session.capabilities === "undefined"`; no version is inferred and no conditional update
  is attempted against it.

Counts at the child checkpoint: 11 runner + 9 core + 6 generated + 3 resolution + 6 HTTP + 6 host + 3 adapter + 2 capability
= **46 passing tests**, including one unsafe old-adapter observation, with the same five assertion-specific negative controls. Limits: this is a
source API only — it is not deployed, not proven to be present in the running runtime, and the
controller's own adoption of the handshake is parent-owned and unfinished. No compiler, typecheck,
full library graph, OpenAPI regeneration, installed client/plugin, model, network, service, GUI or
deploy/restart was run.

### Current-controller integration — parent verified, 2026-10-31

Parent copies the actual `task-titles.ts`, `session.ts`, `automation.ts`,
`source-handoff.ts` and `model.ts` into each fresh staged transport tree and records
their hashes in `logs/controller-inputs.sha256`. No controller logic, payload
decoder, host update or core publication is replaced. The test wraps only the
update boundary to inject a second real Promise-adapter rename after the
controller's final read; generation is explicitly unused for the initial concise
label, and storage is a synthetic in-memory boundary, not deployed storage.

Three cases verify publication with the exact last-read precondition, preservation
of the concurrent human title/metadata with `manual`/not-suspended status and no
retry, and complete generation/write/update refusal through the pinned adapter.
Two isolated baseline-first controls alter only the copied controller: dropping
`expectedTitle` overwrites the human title; dropping only the capability gate
renames through the old adapter. Both fail the actual title assertion, not an
import, missing method or counter-only check.

Fresh parent workspace `/tmp/opencode/title-cas-o9rbQY` passes **49tests**:
48positive cases plus the explicitly unsafe adapter observation, with **seven**
assertion-specific expected-failure controls. Parent also reproduced two source
errors hidden by the first returned controller: state/session-read exceptions
during conflict reconciliation were silently swallowed. Those failures now
propagate while genuine ownership moves skip the stale record;25focused and
187full goal-docs cases pass. Source full types, served OpenAPI, loaded host
capability, generation/model quality and installed concurrency/manual acceptance
remain separate and unfinished. No native source, profile or installed binary was
patched; these proofs use fresh owned staged copies only.

### Handoff-worker guard and OpenAPI artifact — parent verified, 2026-10-31

The second publication path in `automation.ts` now also requires the capability
and last-read title precondition. Unsupported capability skips only the title
write, leaving policy/settings and one-shot source requests intact. Parent first
reproduces seven stale fixture failures, then explicitly advertises the conditional
API and asserts preconditions inside those fixtures without removing old naming/
settings assertions. A new post-handshake moved-target regression then fails:
fresh ownership/lineage/Plan/revert/title checks fix that additional race. All
59focused and196full goal-docs cases pass; the other five handshake-change variants
pass after the fix but are not misreported as separately observed red failures.

Three additional real adapter/core cases cover handoff-worker success, final-read/
write conflict and unsupported legacy API. Goal state is absent and no handoff is
sent. Removing only the worker precondition or only its capability gate in fresh
copied controllers fails the actual stored-title assertion. Together with the root
cases and earlier tests, fresh workspace `/tmp/opencode/title-cas-odB6rF` passes
**57tests**(56positive plus one unsafe old-adapter observation) with **nine**
assertion-specific title/transport/resolution failure controls.

The unchanged copied OpenAPI baseline independently fails the owning generator's
`check:generated` with its exact stale-document message. Local generation in the
new staged protocol copy then passes the same canonical check and five schema
tests, including all local component references and preserved legacy fields/
responses. Generated SHA256:
`6b3d442ed0d6e8f2574a4b1a00f80f74ec82815cb65f66edef69644b035d225a`.
The native baseline remains the separate pinned588,830byte document; the manifest
pins it and both reviewed generator scripts. This is a generated artifact proof,
not deployment, a served-schema observation or full type checking. The stale
baseline check is an additional generator control, separate from the nine title
failure controls.

### Loaded diagnostic, not loaded publication — 2026-10-31

The existing authenticated2.1.1 service returns the new status field for the exact
coordinator/location: `publicationCapability:unavailable`, eligible, not suspended
or pending. [Readiness observation](loaded-readiness-2026-10-31.json) records
1,654acquired bytes under64KiB/10s and unchanged sampled title/time. The probe
calls only the read-only status method and session/info reads; no generation,
update, settings change, start, reload, restart or deployment is issued. It proves
loaded diagnostic availability and the absence of advertised conditional support,
not safe installed title publication or the loading mechanism.

## Sources and limits

### Full-type staging prerequisite — synthetic source accepted; real stage blocked

**Latest parent acceptance:**49synthetic cases pass, including11independently
reproduced parent regressions and a private scratch-bootstrap control. Required
offline CI now runs this suite with only Node/`mkfifo`, no native checkout or
compiler, and passes10/10steps. This accepts the helper's reviewed synthetic
behavior, not a complete input closure, actual native stage or full types.

The [dated metadata closure](workspace-closure-2026-10-31.json) now corrects the
initial13-set to15: core/ai need the dev dependency`http-recorder`, and the root
needs`script`. Parent independently re-reads/hashes all48metadata files(38,125bytes),
checks36links/37manifest references/3project references and scoped clean pin/tracked
identity. No observed reference leaves this selected set; this does not enumerate
the actual compiler program or full monorepo. A new regression first fails on the
13-set, then checks both recorder dev bindings, the root script link and its absent
version field. Old unselected-workspace refusals remain for genuinely outside
packages. The imported5,855,270byte snapshot still blocks the unchanged2MiB cap;
no new real preflight, stage or compiler was run to repeat that known refusal.

### Guarded read-only input prerequisite — synthetic source only

[readonly-input.mjs](readonly-input.mjs) exports
`createReadonlyInput({roots, cwd?, limits?, signal?, io?, now?})`. Its frozen result
provides`readFile`, `fileExists`, `directoryExists`, `getAccessibleEntries`,
`realpath`and`report`; the first five match the inspected7.0.2callback interface.
It is **not wired to a native API or compiler**. The`io`and`now`options are trusted
synthetic test seams, not an authentication mechanism. No writer or fallback is
exposed. Missing reads return`null`, empty files return`""`; known oversized
existence/read requests refuse instead of pretending the file is missing. Listings
retain oversized names, classify internal/cross-approved-root links truthfully,
and refuse escaping/dangling/special entries rather than silently hiding inputs.

Limits are frozen/reduce-only:2MiB/file,64MiB actual content reads,10000shared
callback/entry/read allowances,2MiB metadata and30s cooperative deadline using a
monotonic production clock. Paths/roots and symlink traversal are bounded. Content
uses no-follow/nonblocking regular-file descriptors and UTF-8 decoding; directory
names also require valid UTF-8. Every refusal latches the adapter. All roots are
checked before/after callbacks; requested aliases/components, file and enumerated
directory identities are checked around IO, including final close/cancellation.

Directory reads request`bufferSize:1`and reserve16KiB of remaining metadata capacity
before requesting the next name, even if it would be shorter or EOF. This is a
conservative maximum UTF-8 input-component reservation, not a raised2MiB cap;
budgets near exhaustion may refuse early. Node/kernel buffering is outside the
client-visible accounting claim. Readlink length is sampled before acquisition
and identity rechecked afterward; filesystem races are **not atomic snapshots**,
and synchronous syscalls cannot be preempted. These limits need review before any
real graph use; a graph can refuse far before10000source files because calls,
entries and link walks also consume allowances. No graph count/coverage is inferred.

The [synthetic suite](readonly-input.test.mjs) uses only fresh private scratch
fixtures, not native inputs. Parent reproduced eight initial failures(23/31pass),
then independently confirmed their correction and reproduced five more(38/43pass):
late close/deadline, close cancellation, name capacity checked after acquisition,
in-place enumerated-directory mutation and origin-root replacement across a link.
Parent corrects those without changing limits and adds invalid/valid Unicode name
coverage. Earlier failures remain evidence, not erased by the corrected source.
Required offline CI includes this suite after a genuine omission regression.
Latest parent focused run passes44adapter/49staging/21CI/7feature cases(121total).
The subsequent full CI is **7/10**, not green: tmpfs `EDQUOT`/122 disrupts staging/
private/Office fixture creation, while all44adapter cases pass. Free root-disk
space does not remove `/tmp`'s per-user quota. No cleanup, guard change or fixture
relocation is inferred; final combined verification remains pending remediation.

The prior source investigation's shipped JS/d.ts establishes five callbacks and
`readFile:null`no-fallback versus`undefined`fallback. It does **not** prove the asset
must be read, that every partial proxy must fall back, or that missing delegated
write callbacks prevent every native write. Stock`createVirtualFileSystem`is a
closed tree, not an assumed partial proxy. Project-reference/default-library/
asset-read behavior, option/library coverage, full diagnostics and resource fit
remain unverified. The existing5,855,270-byte asset refusal is unchanged; this
prerequisite neither fixes it nor authorizes a native adapter/API/compiler trial.

### Pure overlay preparation — source prerequisite only

[overlay-set.mjs](overlay-set.mjs) exports
`prepareOverlaySet({root, entries, limits?, signal?, now?})` and `OverlaySetError`.
Entries are exact `{path, kind, original, result}` records with relative POSIX
paths and `source`, `config` or `generated` kinds. Present originals and results
use `{text, sha256}` with exact UTF-8 hashes; only generated originals may use
`{absent:true}`. Empty text and claimed absence remain distinct. The output freezes
copied entries, sorted unique direct-child directory inventories, usage and limits.

Limits are reduce-only:2MiB for **each original and result**,64MiB combined text,
10000files plus virtual directories(including root),2MiB accounted metadata and
30s cooperative time. Replacing large text with a tiny result never discounts
the original. Structure/count/metadata are checked before hashing; metadata counts
root/path/kind/digest slots and unique directory inventory as documented in source.
These are logical accounting limits, not a hard JavaScript heap bound: descriptor
enumeration, sorting and synchronous operations are not preempted. Ordinary own
data records/arrays are supported; accessors and malformed Unicode are refused.
`signal`/`now` are trusted seams, not a hostile-proxy sandbox.

Parent independently verifies37[pure-memory cases](overlay-set.test.mjs), including
six initial inventory/input/budget regressions and two later startup cancellation/
deadline regressions. Those failures remain history, not erased by the fixes.
Required offline CI includes the suite; no scratch fixture or native input is used.
The accepted read-only adapter and its tests retain their exact earlier hashes.

This accepts only supplied-data preparation. `root` is lexical; absence is a caller
claim. No source provenance, real absence/pin/disk validation, patch application,
generation, config semantics or filesystem callback integration is established.
Shared lifetime budgeting with all five callbacks and actual full-type diagnostics
remain separate prerequisites. No asset stub/omission, cap increase or fallback
is introduced; the known snapshot refusal and resource gates remain unchanged.

A subsequent bounded read-only candidate check uses the retained positive stage
`/tmp/opencode/title-cas-odB6rF/transport`:18native manifest hashes, four staged
generated-client receipt hashes and the OpenAPI hash match. All four generated
originals actually exist and are tracked/clean; no absence claim is substituted.
`httpapi-codegen` is not copied into this stage: the first attempted uniform
stage read refuses`ENOENT`. The corrected mapping verifies the exact client
dependency link to the native checkout, rechecks its identity, and explicitly
uses that unchanged external source instead of silently falling back.

The22selected records prepare successfully:29virtual directories,1364212original
bytes plus1372022result bytes,4863accounted metadata bytes. Acquisition is46reads/
2739504bytes/173ms under8MiB/64reads/15s, with2,000,001bytes remaining reserved
before each reader capped at2,000,000bytes. This is not an atomic whole-set snapshot;
the final whole set is not rehashed. Later read-only Git checks confirm native
HEAD`ba546ec…` and the four generated originals' tracked/clean status. Canonical
patch derivation, generation reproduction, full config semantics, whole graph
and shared callback lifetime remain unverified. No compiler or filesystem write
is performed by either qualification attempt.

### Selected patch derivation — source bytes only

[patch-provenance.mjs](patch-provenance.mjs) verifies exact supplied original/result
text through an ordered plain unified-diff stack. It checks complete path sets,
all unchanged files, exact hunk body counts and unique ordered context matches.
Line positions are hints; offsets are audited, never resolved with fuzzy context.
Only existing newline-terminated targeted files and LF patches are supported;
add/delete/rename/mode/binary/no-newline constructs refuse. Output is frozen hash
and hunk metadata, never patched source or a filesystem write interface.

Parent independently passes23[pure-memory cases](patch-provenance.test.mjs) after
two genuine deadline regressions: long candidate comparisons and the diagnostic
earlier-context scan did not check time sufficiently. The correction checks both
search directions by comparison work, retaining all original assertions.
Reduce-only defaults are2MiB per text/intermediate,8MiB combined originals/results/
patches/every per-hunk intermediate,64files/patches per collection,512hunks,
256KiB accounted metadata and15s cooperative time. Synchronous string operations
and object overhead are not hard-preempted/heap-metered; trusted clock/signal seams
do not sandbox hostile callers. Exact source declarations are not file-type proof.

The parent then independently verifies actual selected17non-generated manifest
inputs against the retained positive stage and the three canonical patches in
order:29hunks/10changed files,17offset hunks, all17complete result texts equal.
The corrected verifier repeats this proof in38bounded reads/679540bytes/101ms;
1,406,970accounted bytes include729262intermediate bytes, plus5471metadata bytes.
The external codegen link is checked before and after; per-file identities remain
sampled, not a final whole-set rehash/atomic snapshot. The initial pre-fix proof
also matched bytes, but does not erase the two deadline failures.

This qualifies **selected source derivation only**. Generated OpenAPI/four clients
retain separate receipt observations; they are not derived by these three patches.
No source generator/compiler/native API is invoked, native pin is not revalidated
by this check, and full config semantics/complete graph/shared callback lifetime/
full types/loaded title publication remain open. Required CI includes this suite.

### Shared input lifetime — pure accounting only

[input-budget.mjs](input-budget.mjs) exports `createInputBudget({limits?,signal?,now?})`.
One instance exposes frozen `check`, `reserve`, `remaining` and `snapshot` methods;
there is no reset/refund/refill. Reservations atomically consume declared
`contentBytes`, `metadataBytes` and `units`; optional `fileBytes` checks per-file
size only and does not charge content. All operational methods observe one
monotonic lifetime and retain the exact first failure, including caught reentrant
clock/signal/cost hooks. Startup refuses cancellation before/after its clock read.
`snapshot()` invokes no hooks and remains available after refusal: it is diagnostic
data, **not a fresh health, permission or IO-authentication check**.

Defaults remain reduce-only:2MiB/file,64MiB cumulative content,10000logical units,
2MiB metadata and30s cooperative time. Caller-declared costs are not authenticated
filesystem sizes or hard heap limits. Future integration must reserve original
and result content/metadata and real reads/callbacks/dirents before acquisition,
using the same instance; creating separate instances would restart allowances.

Parent independently passes37[pure cases](input-budget.test.mjs) after seven
genuine lifecycle/atomicity regressions. Two original cancellation triggers move
after stronger factory checks while retaining reservation/final-check coverage.
The suite is required CI. Accepted read-only/overlay/provenance helpers remain
unchanged. At that checkpoint the budget was not wired to callbacks; the next
section records the separately reviewed composition, not native integration.

### Composed five-callback input — source and synthetic filesystem boundary

[overlay-input.mjs](overlay-input.mjs) composes the actual accepted read-only
adapter, prepared overlay set and **one** input budget. It exposes frozen
`readFile`, `fileExists`, `directoryExists`, `getAccessibleEntries`, `realpath`
and diagnostic `report`. Supplied IO must provide all eight methods; no missing
method falls back to production FS. With no IO override, it uses Node's read-only
filesystem methods. No write or `undefined` native-fallback response is exposed.

Actual physical original text/hash and sampled generated absence are checked
during construction. Existing and new virtual directories, source/config result
text and physical entries share one namespace across all five callbacks, including
approved aliases. Startup-bound identities/absence witnesses are sampled before
and after callbacks. Temporary per-operation identities bridge the initial alias
resolution and delegated operation; physical delegates also retain the original
requested path rather than discarding it in favor of the canonical target.

Reduce-only defaults remain2MiB/file,64MiB content,10000logical units,2MiB metadata
and30s cooperative time. One ledger charges prepared originals/results/inventory,
physical requested read bytes before acquisition (no short-read refund), returned
overlay text, public calls, opens, links, directory-read attempts including EOF,
and watched records. Each new watch costs128+UTF-8-path bytes and one unit;
temporary records are charged again on later calls, never refunded or promoted
to global watches. Directory names require16KiB remaining headroom before the
next acquisition, then charge actual name bytes. Known link size is reserved
before readlink. Under tight reduced caps the base adapter can refuse first with
its own call/file budget; that does not replenish the shared allowance.

Parent reads the full1110-line child source and1414-line suite, independently
passes49returned cases, then reproduces three requested-alias mutation failures
for physical reads, physical inventories and overlay inventories. Raw-path
delegation fixes those cases. The first temporary-watch correction samples the
empty table before the body; three additional existence/realpath tests expose
that placement error, corrected to sample after the body. **57pure-memory cases**
now pass, retaining all failures and coverage. Two exact accounting expectations
are updated for new temporary-watch costs while still asserting EOF charging and
actual directory-name bytes. Required CI includes the suite after a real
missing-registration red. Earlier accepted helper bytes remain unchanged.

Parent also invokes production Node FS over a newly owned synthetic tree at
`/tmp/opencode/overlay-input-parent-TpEM9r`, exercising all five callbacks,
source/config replacements, generated physical absence, aliases, empty/missing
distinctions, merged inventory and sticky mutation/false-absence refusals. The
65ms observation retains its facts receipt (`13cc05af…db0f6f`) and fixture.
This is a real filesystem boundary over synthetic inputs, **not** native
compiler execution, actual graph/config/pin/patch/generated-lineage acceptance,
full types or loaded title publication. Report flags keep those unverified.
Checks are cooperative and sampled, not an atomic snapshot, hostile-provider
sandbox, hard heap bound or permission receipt. Real graph resource fit and the
imported5,855,270-byte snapshot's unchanged2MiB refusal remain unresolved.

The initial [staging helper](typecheck-stage.mjs) and
[synthetic suite](typecheck-stage.test.mjs) are separate from the accepted runtime
proof. Its initial23cases passed, but four added parent regressions failed: growth
after metadata bypasses acquisition accounting, the final read can finish after
the deadline, an ancestor alias is accepted as a source root, and a checked plan
can be redirected before allocation. Exact two-file correction is assigned; no
real stage or compiler pass was claimed from that prototype.

The first correction independently passes36/36, including those four regressions.
Further parent boundary review adds three failures: late dependency-link completion
can report success, cached ancestry misses a later directory rebind, and a source
root rebound after preflight is rejected only after allocating. Those exact two
files are assigned for further correction. Prior fixes remain verified narrowly;
the helper is still unaccepted and not yet required CI.

The next correction independently passes41/41including all seven prior parent
regressions. A further receipt-write deadline case then fails: the call refuses
timeout but the retained primary receipt still says`success`. Same two-file
correction is assigned for truthful failure publication and concurrent-replacement
preservation. This is an artifact-integrity failure, not a full-stage result.

The final child correction passes44/44independently. Parent adds three more genuine
reds: same-inode concurrent receipt edits are overwritten, a FIFO recovery open can
block, and short primary writes retry without a deadline. Parent corrects these
with bounded published-content/size/identity checks before truncation,
`O_RDWR|O_NOFOLLOW|O_NONBLOCK`recovery and fixed-bound single writes that refuse
short progress. All47cases pass. Failure sidecars explicitly override stale primary
success claims and preserve concurrent replacements/edits. This is sampled
ownership/readback, not atomic CAS or a hard wall-clock guarantee for filesystem
syscalls; failure publication is bounded best effort after normal expiry. A48th
startup control creates an absent private test base and refuses aliases without
chmod-ing existing directories. CI registration genuinely fails before adding it.

The child's extra metadata-only real preflight allocated nothing and read no file
content, but exceeded the intended synthetic-execution scope and remains a limit.
It reports2,141tracked files/36,335,628bytes, with11generated files excluded. The
5,855,270byte`models-dev/snapshot.txt` exceeds the unchanged2MiB per-file guard;
parent confirms it is explicitly imported with`type:"text"`, so it cannot be
silently omitted. Real workspace links also include`@opencode/http-recorder` and
`@opencode/script` outside the initial13-package reviewed set. That set is **not**
a proved complete closure. No guard increase, source omission, forced graph count
or workaround is accepted to turn either refusal green. Package/config staging,
the actual full graph and full compiler/type diagnostics remain unfinished.

`SOURCES.sha256` pins the patched and copied inputs (core bus/session/error/host, protocol session
group, server handler, client build script and client api, plugin package/session/adapter, core test
helper, codegen writer).
The input manifest additionally pins the local protocol OpenAPI generator,
stabilizer and original document. The runner checks the stale copied baseline
before generation and runs the same generator's canonical freshness check after
generation, only inside the newly allocated stage. Schema verification passes
at the checkpoint above; that does not change the
served `/openapi.json` or establishes full types.

Bun:
`tools/opencode-orchestration/runtime/bun-1.4.2-linux-x64/bun`
`a83d263767d839e4d2649ca8e35d07159c7afc99afdc96d731ced29e056dda0c`.

- Source/type: Bun strips types; the conditional method and the generated types were not
  typechecked. The handler/host code is exercised at runtime only. `resolution.test.ts` proves
  module identity (staged core → staged plugin → staged client), not that the typed chain compiles;
  the full type gate remains open. The legacy `rename` contract is preserved at source level.
- HTTP: status/body assertions cover the protocol encoding observed in-process; no live HTTP
  client, service or auth was exercised. The local staged OpenAPI artifact is now regenerated
  and checked; the running service's OpenAPI remains unverified for these changes.
- Generated bytes are specific to this pin/definition set; digests change with any protocol or
  codegen change. They prove provenance, not API stability.
- The plugin host surface has no protocol error mapping in core, so the invalid precondition there
  fails as a defect rather than a 400; that choice is explicit, not silent.
- `resolution.test.ts` runs only in the typed positive stage. Runtime-only negative stages keep the
  pinned plugin link and are documented as a split: they prove dispatch/status behavior, not the
  typed chain.
- If the session row disappears between the handler's `get` and the conditional rename, the
  conditional call reports a conflict rather than 404 (safe direction, untested race).
