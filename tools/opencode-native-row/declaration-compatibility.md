# Native AI declaration compatibility preparation

Source-only work at native pin `ba546ec1598a70db2570e9c6258028d955ba8f58`.
This does not install a patched dependency, change the native lock/config,
upgrade a runtime or establish full-host/loaded-provider acceptance.

## Exact correction and provenance

The pinned tuple (`@types/bun@1.4.0`, overridden `bun-types@1.4.2`,
`@types/node@24.12.2`, `gaxios@7.3.1`) has six library-check errors documented in
the [observation guide](provider-observation.md). Current public gaxios7 still
ends at7.3.1; a compatible major7 patch cannot be assumed available.

Public `gaxios@8.3.2` contains the upstream callable-contract correction:

```ts
// Before: also requires runtime-specific static properties such as Bun.preconnect.
fetch: typeof fetch;
// Upstream correction: still checks the parameters and Promise<Response> result.
fetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
```

The integrity-checked public tarball was35,493 bytes, SHA-512 SRI
`sha512-7VsaTExxjbDv2ZK1YuC4jbgfN33NI/6/7zdYWUHB6mcg51v4tCBZe+xzjqPzOpVzI+C5k1Kk9OQ80WVrXAHOqw==`.
Its CJS/ESM declaration SHA-256 is
`4cc8823bd4988aea5d90991533b4cdfaec9501597ec3d4fec3d84f238ba1afc9`.
No major8 package was installed or substituted into native resolution.

[`gaxios-fetch-compliance.patch`](gaxios-fetch-compliance.patch), SHA-256
`323b8fe19f185ed53358309dc9668ee618651945d3552bef71e3b51114873643`,
backports only that line into the two emitted gaxios7 declarations. It changes
no method implementation, public call signature, response type or other file.
Both original declaration hashes must equal
`7b77539db0683e287a0424a8a9eb2255a52054b2a7ba6ec477a67f594293abe0`.
This is a proposed dependency correction, not an installed package-manager patch.

The compiler explicitly selects this package's already-provisioned, pinned
`@types/node@26.6.6` and its dependency closure. Those authentic declarations
export the missing TextEncoder result and declare `node:tls` directly. The native
catalog/lock remains unchanged, so a compatibility pass must never be labelled
an unchanged-lock native pass. No handwritten shim or library-check bypass is used.

[`type-expectation-placement.patch`](type-expectation-placement.patch), SHA-256
`f6bf8d846a77966d212fc4a2f911ee5ed4dbdd7942a785a4892206592a22d37c`,
moves three **existing** `@ts-expect-error` comments to their rejected overloaded
calls in two native type fixtures. The invalid provider-option and endpoint-only
capability inputs do not change. The checker requires byte-identical non-directive
source and identical directive texts/counts. These are test-location repairs,
not added suppressions, widened APIs or discarded negative coverage.

## Runnable checks

From the canonical computer-use checkout, select the official native source:

```bash
NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/pinned/opencode \
npm --prefix tools/opencode-native-row run test:declarations

NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/pinned/opencode \
npm --prefix tools/opencode-native-row run test:provider-types
```

The first runs whole-graph declaration controls and two-part sharding controls.
The second additionally checks **all218 source roots** and **all35 type-test
roots**, with the accepted producer and two gaxios declarations overlaid only
in the compiler host. Type checking additionally overlays the two test-location
postimages, then makes the three inputs valid and requires three unused-expectation
diagnostics. The original complete `npm test` contract is unchanged.
Missing source selection skips the checker, not acceptance. No network access,
automatic dependency install or user service is started by either test.

For a separately recorded unfinished config, `NATIVE_DECLARATION_SCOPE=source`
or `types` selects only that complete config. This is a partial command, not a
replacement for the other config or its controls. `all` is the combined run;
`controls` is the default without `NATIVE_DECLARATION_FULL=1`.

Each worker retains strict/noEmit/noCheck false/skipLibCheck false, a768 MiB heap,
1,024 MiB owned-process-tree RSS cap,1,280 MiB system-available floor,90-second
deadline and bounded stdout/stderr. It needs2,304 MiB available before spawning.
The590-second outer watchdog covers the serial batch; it is not the original
private workflow's90-second combined budget. Cancel/termination/exit cleanup
targets only the owned child process group. A refused spawn or incomplete worker
fails the command; neither skipped work nor partial output becomes a pass.

## Sharding preserves the complete graph

Each type-test worker constructs the **same entire program**, not a smaller root
set. Config/options/syntax/global diagnostics remain whole-program queries.
Semantic and declaration queries partition every program file, including external
declarations, deterministically across four serial workers. The parent verifies
identical root and graph/text hashes, disjoint assignments and exact coverage of
the complete file set before accepting the aggregate. All diagnostic text remains
in receipts. Whole-versus-sharded negative controls compare every diagnostic's
code/category/file/offset/length; TypeScript can reorder rendered union members
when checker caches are populated in a different order.

Aggregation also checks exact shard identities/counts and equality of whole-program
diagnostics in **every** shard. A parent regression first showed that a later
shard's global error could vanish when only the first result was retained. The
corrected aggregator rejects that mismatch, missing/duplicate assignments and
invalid shard identities, while retaining later semantic/declaration errors.
Its focused regression passes, and replay of the immutable actual compiler
receipts through the current aggregator preserves both zero-diagnostic configs
and the three expected valid-input errors without rerunning the compiler.

Each completed or failed worker emits a base64-encoded JSON receipt before later
assertions. This avoids TAP backslash escaping corrupting nested JSON. Program
creation and all six diagnostic-group milestones are retained even on failure.

## Actual outcomes — 2026-10-29

- Six initial compiler controls passed: original tuple six errors; Node26 alone
  two gaxios errors; the backport zero errors. Wrong parameter/return mutations
  still produced two TS2416 errors each; an external `.d.ts` error produced TS2304.
- A combined full check failed when the unsharded type-test config exhausted its
  768 MiB heap:35 roots/1,334 files,57.169461 s,peak896.328125 MiB,SIGABRT.
  Earlier receipts were initially withheld by the harness; no missing receipt was
  retrospectively invented. The reporter now preserves partial outcomes.
- Early sharding verifier runs failed on rendered union order, then diagnostic
  ordering. Those are recorded verifier defects, not native source failures;
  all errors and their sites are still checked, never filtered.
- The corrected run verified whole-versus-sharded negative controls and completed
  the **entire source config:218 roots/1,329 files,all six groups zero diagnostics**,
  85.979944 s,peak896.488281 MiB,minimum available1,474.007813 MiB. Its Node26 and
  three explicit overlays are part of that result. It is not an original-lock pass.
- That combined command still **failed**: the next type-config launch refused at
  2,011.242188 MiB available, below2,304 MiB. No type shard spawned in that run;
  sharded type-config completion remains unverified. A later explicit `types`
  scope also refused before spawn at2,245.253906 MiB. No cap/floor was relaxed,
  no memory was freed by terminating unrelated work, and no further retry ran.

**Subsequent scoped acceptance after interruption:** a fresh2,904 MiB availability
observation met the unchanged guard. All four actual type shards completed, but
the command correctly failed on three TS2769 callsite errors paired with three
unused existing directives. After the test-location-only correction:

- The explicit `types` scope **passes**: all35 roots/1,334 files in each of four
  workers, complete six-group coverage, disjoint exact file union, zero diagnostics.
- Four further complete-program workers make those three inputs valid and produce
  exactly three TS2578 unused expectations. Expected invalidity is still enforced;
  no test was made permissive just to obtain green output.
- The scoped command took163.258094 seconds including both conditions; peak owned
  RSS was736.480469 MiB and minimum available memory2,252.976563 MiB. All per-worker
  limits stayed unchanged. No completed source-config diagnostics were rerun.
- Independent readback of **every current program file**, using exact reviewed
  postimages, matches both the preserved source graph and accepted type graph
  hashes. This binds the separately observed configs without claiming a new
  combined-all command pass.

Durable acceptance: `Documents/computer-use-native-host-20261029/provider-ai-compatible-configs-acceptance.json`,
SHA-256 `09754dae7f0a1e3ef2eb864b02a9a7273db3de69a52a504c682f8e6f356e0898`.
It retains actual worker receipts, all-file/root hashes, valid-input controls,
unchanged native/dependency bytes and exact staged/config hashes. The type-command
output is `provider-ai-compatibility-type-placement-command.txt`, SHA-256
`fd6fa66b560a68d456084dfb6eadc458501f0c80541464dcc5e9b1d0856cf074`.
The subsequent aggregation audit is `provider-ai-compatible-aggregation-audit.json`,
SHA-256 `24211890145536e4e262bebe8d00b4e669c4ef7c3d461f5ff4bf2d9075e31c66`.

Actual command outputs are preserved in
`Documents/computer-use-native-host-20261029/provider-ai-compatibility-*.txt`.
The unchanged-lock six-error result, type-config OOM, full-host resource failures,
native row/provider/model/live gates and all historical provenance limits remain
explicit. Both complete configs now have separately observed **compatibility**
results. The unchanged-lock native package and combined-all command are not
claimed green. Dependency integration, full-host and runtime acceptance remain
separate work.
