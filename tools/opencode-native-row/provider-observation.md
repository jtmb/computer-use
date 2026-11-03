# Native response-reported model observation

Source-only follow-up at upstream pin
`ba546ec1598a70db2570e9c6258028d955ba8f58`. This does not install, activate,
restart or modify the selected source checkout or the running OpenCode profile.

## Producer contract

[`provider-observation.patch`](provider-observation.patch), SHA-256
`8982ae7988a3902c7ce586427672887f95349e7b7dd26de475f33ac81c5ca45d`, changes
only `packages/ai/src/protocols/open-responses.ts`. Completed/incomplete final
response fields populate the existing provider metadata subrecord:

```ts
type ModelObservation = {
  source: "open-responses",
  model?: string,
  reasoningEffort?: string,
}
```

Model and effort come only from final `response.model` and
`response.reasoning.effort`. Missing, malformed, whitespace/control-bearing and
overlong values are omitted. Bounds are256/64 UTF-16 code units respectively;
safe future identifiers are not translated into guessed effort levels. No
request/config/variant fallback, earlier `response.created` fields, prompt,
headers or full body is copied. Existing response ID/tier, usage, finish reason
and event lifecycle remain intact.

This is **response-reported**, not execution proof. Transport hooks can rewrite
responses, aliases may differ from selection, other protocols remain unsupported
by this patch, and omitted effort stays unknown. The existing publisher selects
the route's metadata namespace; `Step.Ended.native` is projected onto the exact
session/assistant message and cleared on a new attempt. Those downstream bindings
were source-inspected, not accepted through a loaded service or database run.

## Actual offline native verification — 2026-10-29

Parent read the complete returned patch/tests and added a step-finish versus
finish metadata equality assertion. The nine new native protocol fixtures run
against the actual decoder/`LLMClient` with injected HTTP/SSE responses. The
unpatched source produced **3 passes /6 failures** for missing observations;
applying the patch only in a fresh scratch clone produced **33 passes /0 failures,
234 assertions**, including existing final/lifecycle regressions. No test was
skipped and no real HTTP/provider/model/session request occurred.

```bash
NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/pinned/opencode \
NATIVE_ROW_BUN=/absolute/path/to/bun-1.4.2 \
node --test tools/opencode-native-row/provider-observation.test.mjs
```

The wrapper verifies pin/origin, unchanged protocol blob, reviewed patch hash and
one-file scope. It uses a fresh local clone, read-only links to existing native
dependencies, a private environment, disabled dotenv/auto-install, bounded
subprocesses and original-source preservation checks. Both explicit paths are
required; without them the test is **skipped**, not native acceptance. Nothing
installs automatically. The private Linux-x64 Bun used here came from the exact
public npm SHA-512 package; its acquisition receipt is retained in
`Documents/computer-use-native-host-20261029/provider-observation-runtime-acquisition.json`.

The initial wrapper correctly rejected a zero-output/zero-exit invocation where
Bun parsed pre-command spaced `--config` without running tests. An intentional
failing probe reproduced that dispatch issue; command-first `test` and
`--config=value` fixed it. The wrapper now verifies exact native case counts,
so an empty run cannot pass. Bun test execution is **not semantic typechecking**;
no new complete AI-package or full-host compiler pass is claimed.

## Consumer acceptance — 2026-10-29

The accepted [base row patch](README.md) remains byte-for-byte unchanged and
continues to label selected/requested/variant separately, with execution-effective
model/effort unknown. The separate additive
[`provider-observation-row.patch`](provider-observation-row.patch), SHA-256
`5f61c02073c192d3f05c33053f736b0b213e5b7ac7d5c77f9eaf8b65ed25f43d`, changes
two native composer source files and adds two native test files after the base
patch. It reads only the latest cached child assistant's explicit observation;
missing/malformed reports never fall back to older reports or selection. A bounded
safe `msg_` ID binds provenance. Response-reported model/effort and latest message
ID have separate labels. No transcript fetch or execution-proof claim is added.

The original 614-line worker return is preserved as
[`provider-observation-row.worker.patch`](provider-observation-row.worker.patch),
SHA-256 `424c2e6348f6511f7f34b855d6d23afd13acdd086e26ce13d2592eec11ef6b99`.
Parent regressions first reproduced three defects: rejection of producer-safe
punctuation and promotion without safe message provenance in two cases. Parent
corrected both contracts and added maximum-length report layouts at44/120 columns.
Native helper/production-renderer tests cover latest-message precedence, malformed
metadata, missing cache, field separation, wrapping, scrolling and navigation.

```bash
NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/pinned/opencode \
NATIVE_ROW_BUN=/absolute/path/to/bun-1.4.2 \
npm --prefix tools/opencode-native-row run test:provider-row
```

This final entrypoint actually ran: **2 passes/45 failures across47 new cases**
before consumer-source application, then **82/82 passes** including all35 accepted
base cases. The wrapper pins both patches, asserts exact counts, uses a private
scratch clone and verifies original source hashes/status unchanged. The final
patch differs from the preceding82-case run only in Git blob-index metadata;
the final-hash entrypoint passed again. No skip was accepted as verification.

## Semantic check and remaining boundaries

A distinct complete AI-package source check finished all six public diagnostic
groups for218 roots/1,268 files with the producer overlaid only in the compiler
host. It **failed with six declaration errors**, not a strict pass: TS2694 for
`node:util.TextEncoderEncodeIntoResult`; TS2552/TS2304 for missing
`ConnectionOptions`, `KeyObject` and `TLSSocket`; and two TS2416 gaxios fetch
incompatibilities with Bun's required `preconnect`. No declaration, diagnostic,
root set or `skipLibCheck` bypass was used. The corrected workflow stops on its
failed `tsconfig.json`, so `tsconfig.types.json` did not run.

Compiler identity was verified: native alias `@typescript/typescript6@6.0.2`
reexports the locked `typescript@6.0.3`. An earlier version-guard refusal occurred
before program creation. A later verifier omitted `configFilePath` and resolved
Bun types from scratch, then hit its deadline; that context error was corrected,
not accepted. Corrected checking used the package directory/config path, strict,
noEmit, noCheck false and skipLibCheck false. It took65.200791 seconds, with peak
owned RSS888.222656 MiB and minimum available memory1,729.386719 MiB, within its
1,024 MiB RSS/768 MiB heap/1,280 MiB system-floor/90-second guards.

The durable `Documents/computer-use-native-host-20261029/provider-ai-semantic-checks.json`
receipt (SHA-256 `1c7d953ca40412fe492f5dcfa6d61879029c97ca8fa36b1ed42bb0d884fc495f`)
preserves actual outcomes and scripts, including verifier mistakes. This package
failure is distinct from the unfinished full-host checks.

A separate **declaration-localization control**, not a smaller acceptance graph,
loaded232 files and reproduced all six identical diagnostics (code/file/offset/
message) **without loading the producer**. Its single virtual fixture imports both
authentic gaxios declaration entrypoints; no fixture was written into native
source. The initial CJS-only control found five errors and correctly failed its
six-error expectation; adding the ESM entrypoint reproduced the second TS2416.
The locked tuple is `@types/bun@1.4.0`, overridden `bun-types@1.4.2`,
`@types/node@24.12.2` and `gaxios@7.3.1`. Node util exports `EncodeIntoResult`,
while Bun references `TextEncoderEncodeIntoResult`; Bun's `node:tls` augmentation
uses unresolved unqualified types; gaxios's CJS/ESM `typeof fetch` compliance
requires Bun's `preconnect` property. The inherited native config enables
skipLibCheck; these checks explicitly kept it **false**. A compatible dependency
declaration tuple or reviewed upstream declaration correction is still needed,
then both complete configs and their controls must run again. No pin was changed.
Later [compatibility preparation](declaration-compatibility.md) backports the
published callable-contract fix and verifies the entire source config with
explicit authentic Node26 types; type-config/full-host acceptance remains separate.
The compatibility source run finished218 roots/1,329 files with zero diagnostics
across all six groups. The combined command initially failed: the unsharded type
config exhausted its heap, and the later four-part route refused before spawn.
Subsequent scoped checking completed all35 type roots/1,334 files with zero
diagnostics after moving three existing expectations to their actual callsites.
Making those three inputs valid produces three unused-expectation errors. All-file
graph readback binds both separately observed compatibility results; no completed
source check was repeated. Neither is an unchanged-lock, combined-all or host pass.

Localization took9.112102 seconds/peak367.734375 MiB within the same guards. Actual
results, scripts and declaration hashes survive in
`Documents/computer-use-native-host-20261029/provider-ai-declaration-localization.json`,
SHA-256 `715c2b0a54fcc08849c1c4b31d692e6ed8f75dbe06925a27ebfd870719aabeda`.
This proves the six errors can occur independently, not a strict package pass.
Neither producer nor
consumer fixtures establish loaded native rows, real provider reports, participant
behavior or the original live/model acceptance. No deployment or activation ran.
