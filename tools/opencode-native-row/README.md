# Native subagent-row patch

Source-only patch for official `anomalyco/opencode` **v2.1.1**, pinned to
`ba546ec1598a70db2570e9c6258028d955ba8f58`. This changes the existing native
composer subagent rows, not a plugin panel. Nothing here installs, deploys,
restarts, or changes the running OpenCode installation.

The separate [native Git index-protection artifact](native-git-index.md) carries
the process-local porcelain-diff refresh suppression into the pinned native Git
provider. It remains **unapplied to native**; exact pinned-file scratch
check/apply/reverse and refusal cases are now verified. This is not covered by the
row preview or an installed/native-provider/type acceptance result.

Patch SHA-256:
`2825d876035054ee46f71f7d9c6815918bad32569242832e31174325633f86fe`.

The exact original worker return is preserved as `native-row.worker.patch`
(SHA-256 `bed8bbd1032b26b76a4186d42ce2a2a313bffa34fdfbf38db33c32b1ca6497e6`).
The current patch adds the parent's independently reproduced idle-timestamp fix.

## Behavior and limits

The separate [native active-session bridge](session-active.md) and
[source-check package](package.json) cover the server/plugin liveness seam,
not the composer row patch below. Its corrected contextual patch and exact worker
return are retained separately. New bridge checks use real adapter/host-expression
execution, genuine local declaration packages and strict library checking;
parent runtime checks pass 4/4 and public type-surface checks pass. The broader
2,826-file host graph exhausts the bounded compiler heap and remains unverified.
See that guide for exact prerequisites
and commands. Neither patch is shipped, loaded or activated by source checks.

The additive [response-observation producer and row consumer](provider-observation.md)
have separate pinned patches and actual native red/green checks. They label
response-reported metadata separately and leave execution-effective values unknown;
their passing fixtures do not resolve the documented semantic/live acceptance gaps.

The separate [declaration compatibility preparation](declaration-compatibility.md)
backports a published callable-contract correction and verifies explicit Node26
declarations without editing installed dependencies. Its full-source compatibility
result is distinct from the failed original tuple. The complete type config now
also passes with a test-directive-location patch and valid-input negative controls;
both are separately observed compatibility results, not an unchanged-lock,
combined-all, full-host or installed pass.

- Task uses the latest cached dispatch description joined by exact child ID,
  then the child title, a bounded cached prompt excerpt, or `Subagent task`.
- `Model (selected)` comes only from the child's `SessionInfo.model` header;
  the full provider/model ID avoids ambiguous names. Requested references are
  separately labelled `Model (requested)` and never fill missing selection.
- Variants remain `Variant`, including variants named `high`. Arbitrary model
  overlays do not establish reasoning effort. **Effort is explicitly unknown**;
  **execution-effective model/effort is explicitly unknown**. Header selection
  is not provider-execution evidence. This patch does not add such evidence or
  claim to resolve effort from provider configuration.
- Canonical running state overrides a previous outcome. An outcome without the
  session's qualifying `time.idle` remains unknown. Inactive rows say
  `Succeeded`, `Failed`, `Interrupted`, or `Idle (outcome unknown)`.
- Task/status stay on the first line; metadata wraps. Scrolling measures real
  row bounds in a bounded ten-line viewport and remeasures after resize. Selection
  retains exact child identity when a preceding child leaves the active filter.
  Native navigation, interruption,
  hover/click and active/inactive controls remain intact.
- Dispatch/prompt fallback uses data already cached by the native client; it
  does not fetch all child/ancestor transcripts. Unloaded history falls back to
  the title or neutral label. The separate transcript `Subagent` component is
  deliberately unchanged and may still display only requested model metadata.

## Preview a selected checkout

Prerequisites: Node 22+, Git, and an explicitly selected **clean source checkout**
of the official repository at the pin above. No default checkout is selected.
From this directory, replace the example path with that checkout:

```bash
node preview.mjs --checkout /absolute/path/to/pinned/opencode
```

The read-only utility verifies origin, exact HEAD, clean tracked/untracked state,
patch hash, the four-file scope, and `git apply --check --whitespace=error-all`.
It never applies anything. A dirty checkout is refused without altering it;
do not discard user work to satisfy that guard. Applying the reviewed patch is
a separate, explicitly authorized source operation, not installation approval.
Review the complete patch before any application. Do not apply it to a deployed
profile or a main/running installation.

For a separately authorized clean checkout, the manual source-only apply is:

```bash
checkout=/absolute/path/to/pinned/opencode
patch="$PWD/native-row.patch"
node preview.mjs --checkout "$checkout" && git -C "$checkout" apply -- "$patch"
```

The utility tests clone a **temporary scratch checkout** from the explicitly
selected local source, never change that source, and remove only their own scratch:

```bash
NATIVE_ROW_SOURCE_CHECKOUT=/absolute/path/to/pinned/opencode node --test preview.test.mjs
```

Without that variable, four checkout-dependent tests are explicitly skipped.

## Native verification

### Runtime prerequisites (exact private locators)

Do not infer a missing runtime from `PATH`. Verify the private runtime first:

```bash
node runtime-prerequisites.mjs \
  --bun /absolute/path/to/bun \
  [--bun-tarball /absolute/path/to/bun.tgz] \
  [--node /absolute/path/to/node] \
  [--checkout /absolute/path/to/pinned/opencode]
```

It accepts only a canonical regular Bun file that reports exactly `1.4.2`.
With `--bun-tarball`, it checks the authentic npm SHA-512 archive integrity and
the selected binary's pinned SHA-256 bytes **before executing** `--version`;
an unrelated executable cannot borrow an authentic archive's identity. The binary
pin was independently derived from `package/bin/bun` in that authenticated archive.
Without the archive flag, the probe is explicitly version-only, not artifact
authentication; use the archive mode before native-suite execution. It also checks
the isolated Node `26.4.0` identity, and reports the checkout HEAD/origin/clean
state. Any mismatch, symlink or missing path exits non-zero. It runs no Bun test,
starts no session and writes nothing; the offline fixtures are
`npm run test:prerequisites`.

Parent verification on 2026-10-30 UTC passes **9/9** prerequisite cases after
two counterfeit/pre-execution failures and a missing-value CLI failure reproduced
the old defects. A requested missing flag value now fails before discovery.
Official npm metadata and existing archive/member bytes were independently
checked; the actual selected Bun is authenticated at the hash below. Existing
Node26 matches its separately verified official archive. These are sampled
same-user consistency checks, not atomic protection against hostile path races.

Serial native reruns now execute rather than skip: producer **3 pass / 6 fail**
before its patch, then **33/33**; row consumer **2 pass / 45 fail** before its
patch, then **82/82**. Both wrappers pass with zero skips and preserve the selected
source checkout. Preview also passes **6/6**. These use actual native code and
renderers with injected HTTP/events, not a real provider, loaded user TUI,
effective execution metadata or a full-host compiler pass.

Observed 2026-10-29:

- `@oven/bun-linux-x64@1.4.2` at
  `/tmp/opencode/provider-observation-runtime-oc8H85/package/bin/bun`, SHA-256
  `a83d263767d839e4d2649ca8e35d07159c7afc99afdc96d731ced29e056dda0c`, with its
  tarball matching npm integrity
  `sha512-9/E/UXOTpSo3YsV5g+FhtTd/qTpiWoKuxS12cqtuYA1ssu9fRAoPQnipFgGyck3tWO63iUdxBiygq+kELFawng==`.
- Node `v26.4.0` at
  `/tmp/opencode/voice-render-runtime/node-v26.4.0-linux-x64/bin/node`.
- The isolated checkout is at the pin with the four native-row files applied
  (dirty), so `preview.mjs` refuses that working tree directly while
  `preview.test.mjs` clones a clean scratch at the same pin and passes **6/6**.
  Provider native tests accept it because the target protocol file is unchanged
  at the pin.

Bun is still absent from `PATH`; the earlier "no Bun" note was a PATH-only
observation, not an absence of the private runtime. Provider suites that skip
without `NATIVE_ROW_BUN` can therefore be run under this exact binary.

With the verified exact Bun `1.4.2` from the locator above — prefix `PATH` in
this shell only, never install it globally — acquire dependencies in the isolated
clone only:

```bash
export BUN_INSTALL_CACHE_DIR=/tmp/opencode/native-row-cache
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/opencode/native-row-transpiler
bun install --filter @opencode/tui --frozen-lockfile --ignore-scripts --cache-dir /tmp/opencode/native-row-cache
cd packages/tui
TMPDIR=/tmp/opencode bun test --timeout 30000 test/subagent-row.test.ts test/subagent-row.view.test.tsx test/cli/tui/composer-keymap.test.tsx
bun typecheck
```

Worker observed 2026-10-28 on Linux: **32 tests passed** (25 new, 7 existing native
composer regressions), then **320/320 passed** with `--rerun-each 10` and
1,400 assertions. Real OpenTUI `0.6.6` rendered the production `Composer` /
`SubagentsTab` at 44 and 120 columns with fake fetch/event I/O, not a copied row.
Package `bun typecheck` passed. A deliberately wrong running label made both
native layout cases fail; the mutation was restored before the passing runs.
The Node preview utility passed all **6 tests**, including real patch applicability
against a pristine scratch clone and preservation of dirty fixture work.
No full-repository check, Windows run, GUI/live-service test or provider execution
was performed. These results are not deployed/runtime installation acceptance.

Parent review independently reproduced the original 32 native cases, package
typecheck, exact four-file patch identity and six preview tests. Three added
regressions then failed on succeeded/failed/interrupted outcomes lacking an idle
timestamp. The corrected helper and qualified renderer fixtures pass **35 native
cases** and package `bun typecheck`; the current patch exactly matches all four
source files. These source/production-renderer fixture outcomes are not a loaded
user TUI or evidence of actual provider model/effort.

The filtered dependency install initially omitted the root's already-pinned
`@types/mime-types@3.0.1`. For this verification only, its npm tarball was
SHA-512 checked, extracted under `/tmp/opencode/native-row-runtime`, and linked
into the clone's ignored `node_modules/@types`. No manifests or lockfiles changed.
Bun itself was acquired as the integrity-checked `@oven/bun-linux-x64@1.4.2`
tarball in that scratch directory; nothing was installed globally. A missing
declaration after a filtered install is a prerequisite gap, not a reason to
change production source, manifests, or suppress the type error.

Patch scope is exactly:

```text
packages/tui/src/routes/session/composer/subagents-tab.tsx
packages/tui/src/routes/session/composer/subagent-row.ts
packages/tui/test/subagent-row.test.ts
packages/tui/test/subagent-row.view.test.tsx
```

To remove an uncommitted application, first preserve later/user edits and review
`git apply --reverse --check native-row.patch` from the selected checkout with
the patch's actual absolute path. Reverse application is a separate authorized
change; never reset or overwrite unrelated work. Keep the original installation
untouched throughout review.
