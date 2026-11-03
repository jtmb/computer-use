# Native orchestration selector

This is a minimal **native TUI source addition**, not a new composer, theme or
dashboard. The selected checkout is the existing
`~/repos/opencode-native-row`, official v2.1.1 pin
`ba546ec1598a70db2570e9c6258028d955ba8f58`. Its unrelated subagent-row changes
remain preserved. The installed client has not been patched or replaced.

## Behavior

- One inline field immediately after Build/Plan and `auto`, before the existing
  model/provider/effort text. No extra toolbar, border, sidebar or layout redesign.
- Click opens the existing native `DialogSelect`; wheel up/down explicitly cycles.
  `/orchestration` and **Select orchestration method** open the same chooser.
- Named methods: **Solo**, **Background subagents**, **Foreground subagent**.
  Independent root-session handoff is not silently substituted for child delegation.
- The setting is one existing native instruction-entry key,
  `orchestration-method`, scoped to the exact selected session and read back after
  save. Mounting a prompt or switching chats performs an authoritative read, and
  opening the chooser or wheel-cycling re-reads before acting, so another client's
  change is honored. A failed read clears the shown method and never permits a
  stale wheel write. The stored entry is the only authority; there is no local
  saved-selection cache.
- The entry includes fixed instructions delivered through OpenCode's native
  `<context key="api/orchestration-method">` mechanism on model steps. This is not
  a synthetic prompt submission, goal resume, permission grant or security boundary.
  Choosing a method does not automatically launch work or cancel current workers.
- No choice means **Orchestration**, not an inferred mode. Failed reads/saves show
  an unconfirmed state. Home requires opening a chat before saving. Child/fork
  inherited entries explicitly do not select that child's method or grant delegation.

## Source scope

In the selected native checkout:

- `packages/tui/src/component/prompt/orchestration-state.ts`: names, exact values,
  chat scoping, decoding and explicit cycle order.
- `packages/tui/src/component/prompt/orchestration.tsx`: native chooser/command,
  native instruction-entry I/O, authoritative mount/navigation reads, fresh reads
  before open/cycle, and cancellation/chat-switch guards. The one lock note belongs
  to the dialog footer, not each option row, and wheel cycling from an unset chat
  starts at Solo in both directions instead of inferring a method.
- `packages/tui/src/component/prompt/metadata.tsx`: inline field only.
- `packages/tui/src/component/prompt/index.tsx`: connects the field.
- `packages/tui/test/orchestration-state.test.ts`: native Bun unit cases.
- `packages/tui/test/orchestration-prompt.test.tsx`: production app-fixture
  hydration and real click-to-chooser path.
- `packages/tui/test/fixture/tui-client.ts`: one explicit default GET for the
  feature's instruction-entry endpoint after the per-test override; other unknown
  endpoints still throw.

## Focused verification

The local harness renders the **actual production metadata component** through
the existing OpenTUI0.6.6 native renderer at44/80/120columns, not a drawing or a
copy of its implementation. A second mode renders the **actual production
`DialogSelect`** and exercises its own option list, move/submit commands and row
click handling; only its layout/config/theme collaborators are explicit test
stubs. A third check runs the production app fixture with a synthetic session, checks
that the persisted method appears without user action, clicks the rendered
field, selects and saves a method with exact PUT/readback, then types
`/orchestration` through the real keymap to reopen the chooser. None of these
modes is a live service, installed
client or human acceptance, and the real-list chrome is still partly stubbed. Its
loader is test-only and does not alter runtime resolution, installed packages or
permissions.

Existing prerequisites: Node26.4.0 with OpenTUI's documented
`--experimental-ffi`, and already installed TypeScript/Babel/Solid/OpenTUI from
`tools/session-coordination/node_modules`. No dependency installation is hidden
in this command:

```bash
OPENCODE_NATIVE_SOURCE=/home/james/repos/opencode-native-row \
TMPDIR=/tmp/opencode /tmp/opencode/image-preview-runtime-yeVSDW/node \
  --experimental-ffi --disable-warning=ExperimentalWarning \
  --import ./test/register.mjs --experimental-strip-types \
  --test test/orchestration.test.mjs
```

For the real-list mode, add `OPENCODE_REAL_DIALOG=1` and select
`test/orchestration-menu.test.mjs` (or `npm run test:all`, which needs a suitable
`node` on `PATH`). The production app-fixture test runs through the native package:

```bash
cd /home/james/repos/opencode-native-row/packages/tui
/home/james/repos/computer-use/tools/opencode-orchestration/runtime/bun-1.4.2-linux-x64/bun \
  test test/orchestration-prompt.test.tsx --timeout 30000
```

Run from this directory. The scratch Node path is a dated verified prerequisite,
not a portable installed-runtime claim. The native package's own Bun test/check
commands, full build and loaded-client acceptance remain separate. Exact inline
placement is not available from the currently installed public plugin slot API;
putting the selector in a footer or above the composer would not satisfy the ask.

2026-10-30: all **19** Node harness tests pass (**16** production-row/controller
plus **3** real-`DialogSelect`), and the native app-fixture test passes. Coverage
includes the actual native row at44/80/120 columns, real click and wheel dispatch,
exact restore without the new control, full method names in the real list, real
move/submit and row-click saves, mount hydration of an already persisted method,
fresh-controller rehydration from the entry without a module hint, per-chat reads
on navigation, a fresh read before wheel cycling after an external change, an
unconfirmed read failure with no stale write, save rejection and late read/save
guards. The real-list render exposed and then verified the fix for a per-row footer
that crushed titles to `Sol`/`Bac`. Native Bun state cases pass **5/5** with27
assertions. Adjacent `prompt-shell-failure`, `prompt-paste` and `prompt-offset`
tests pass **4/4** with `--timeout 30000`; the feature's strict fixture now has an
explicit default GET for the instruction-entry endpoint, while every other unknown
endpoint still throws. The initial missing-Bun/CLI dependency blocker was resolved
by the authorized local installation below; it is no longer the current blocker.
Full native build, package-wide typecheck and client activation have **not** yet
been verified because of the resource limits recorded below, not a passing claim.
No installed-binary replacement, launcher change or shared restart was performed.
The repository health check passes, but that does not prove the selector is loaded.

Parent independent rerun: all16source/3list/5inventory checks pass. A bounded native
batch of10state/app/adjacent-composer tests passed inside the unchanged960MiB,
zero-swap,32-task service limits (269.9MiB peak). The parent's extended actual app
fixture additionally verifies menu save/readback and typed slash dispatch:
1test/6assertions passed,233MiB peak. The entry/HTTP side is synthetic; this is not
installed-client activation, a physical desktop result or a full semantic compile.


The later user request explicitly started a new tracked goal before delegation,
superseding the earlier wait-to-create-goal sequencing. Goal
`8915ecd8-7a22-4f8c-b494-433d29e38f3a` owns continuation; cancelled goals remain
closed. Selector source/native-fixture success still does not establish a loaded
installed-client result. The parent rejected a first child revision's cache-only
hydration: the corrected code reads the durable entry on mount/navigation and
again before actions, with no module-local method hint.

## Bootstrap dependency inventory

[`bootstrap-dependencies.json`](bootstrap-dependencies.json) is the maintained,
machine-readable dependency inventory for this optional native UI work. It records
the exact source commit, manifest/config/lock hashes, Bun1.4.2 vendor package and
archive/binary integrity, local destination, frozen filtered CLI install arguments,
cache placement and the conditional Node26.4.0 requirement. Transitive package
versions/integrities are owned by the pinned native checkout's existing tracked
`bun.lock`, not duplicated or replaced with floating versions here.

This inventory is **not yet wired into `scripts/onboard.sh`**. Bootstrap must
explicitly opt into native UI development; ordinary consumer setup must not build
or replace OpenCode. Installation does not imply activation/client replacement,
shared restart, lifecycle-script execution or publication approval. The earlier
missing-dependency observation above is historical; actual install/check results
are recorded below as they occur. Do not assume a scratch runtime survives restart.

### Installation observed — 2026-10-30

- Local Bun1.4.2 reports revision `1.4.2+744846f84`; both the official npm archive
  integrity and the exact extracted executable SHA-256 match the inventory.
- Runtime location: `runtime/bun-1.4.2-linux-x64/bun` inside this verification
  package. The executable/download/receipt are ignored local artifacts, not vendored
  source. No global PATH/profile or installed OpenCode binary changed.
- A filtered offline install first identified five missing cached packages. The
  authorized normal filtered install then added24packages with scripts disabled.
  Native `bun.lock`, root `package.json` and `bunfig.toml` hashes remain unchanged.
- Actual CLI resolution now finds Vite7.3.6, vite-plugin-solid2.11.10,
  OpenTUI0.6.6, native workspace client2.1.1 and Effect4.0.1. The20-workspace
  dependency/dev-dependency closure contains no direct non-registry/PR sources;
  no excluded web/desktop workspace install was requested.
- Native Bun unit tests now pass **5/5**,26assertions. The package-wide typecheck
  and build are distinct follow-up checks, not inferred from installation.
- All **4** bootstrap-inventory contract tests pass. The first package typecheck
  exhausted its owned service's32-task ceiling after2.509s, with332.9MiB peak
  memory and no swap; it did not report a TypeScript diagnostic or establish a
  typecheck pass. Compiler7.0.2's own `bun run typecheck --help` exposes
  `--singleThreaded`; the retry uses that supported flag, `GOMAXPROCS=1` and a
  `GOMEMLIMIT=700MiB` soft target inside the unchanged960MiB/zero-swap/32-task
  service limits. These concurrency controls do not suppress diagnostics.
- That retry reported missing root-owned `@types/mime-types` declarations and
  then hit the960MiB memory ceiling after33.306s; retain it as an **OOM failure**,
  not a pass. The root-check dependency group is separately listed in the
  inventory: adding the `opencode` root filter installed175packages with the same
  frozen/script-disabled policy, including the already pinned
  `@types/mime-types@3.0.1`. This does not install excluded web/desktop workspaces.
  A further retry limits builders/checkers to1 and lowers Go's soft memory target
  to400MiB inside the unchanged hard service limits.
- The further retry also hit the960MiB hard ceiling after41.156s, with no emitted
  diagnostics before termination; this is **not a typecheck pass**. The root MIME
  declaration now resolves at3.0.1 and all three native input hashes still match.
  The original staged-patch hash remains unchanged. Inventory contracts now pass
  **5/5**, including the separately recorded root-check dependency group.
- The supported Bun build reached `building cli-linux-x64`, then hit the same
  960MiB ceiling after12.381s. It used `--single --skip-install --skip-web-ui`,
  local channel/version and a fresh ignored output directory under this package's
  `artifacts/`; no release download, extra install, web build or client activation
  was requested. There is **no verified build artifact**. Dependency installation
  is complete; package-wide typecheck, build and loaded UI acceptance remain open
  because of observed resource failures, not missing Bun/CLI dependencies.

`npm run test:bootstrap` validates the inventory against the already reviewed
native prerequisite pins, filtered/frozen/script-disabled scope, conditional Node
requirement and setup routing. It does not install anything or attest a live build.

### Build-driver memory investigation — 2026-10-30

The read-only DeepSeek review and parent inspection confirm Bun1.4.2 exposes
`--smol` **before the script path** to slow runtime heap growth by increasing GC.
Official [runtime guidance](https://bun.com/docs/runtime#bun-run-smol) explicitly
says GC already accounts for cgroup limits with or without this flag. Frozen
`build.ts` embeds `--smol` in **output** `compile.execArgv`; this does not establish
the earlier build driver used it. Native bundler/bytecode/minifier/inline-sourcemap
allocations need not be improved by runtime GC tuning.

The initial parent bounded native-history lookup exposed the cursor/order API
restriction, then reached its12MiB acquisition cap without recovering the earlier
invocation. No build was retried on that incomplete evidence. This historical
read did not prove absence of a receipt.

The later D2 read-only return recovered native tool receipt
`sh_18e07723b0019DBOGlUyCkf5cc`: the earlier960MiB attempt invoked
`bun --smol run build`, whose package script starts a second Bun process.
The parent independently inspected/executed the tiny scratch probe in
`/tmp/opencode/smolprobe-c8o3tf`: this launch shape gives the actual driver
`execArgv: []`, while `bun --smol ./inner.ts` gives `execArgv: ["--smol"]` with
identical script arguments. The output executable's baked flags are still a
different layer. The recovered old receipt is child-sourced; the tiny topology
comparison and following new build are independently parent-executed.

### Direct-builder attempt — 2026-10-31

One materially changed direct-driver invocation ran pinned Bun with
`--smol ./script/build.ts --single --skip-install --skip-web-ui`, local channel/
fixed version and a freshly absent output under ignored
`artifacts/direct-builder-51nmltdh/build`. Guards stayed960MiB/zero-swap/32tasks/
120seconds; release download/notes inputs were explicitly empty. Full command,
environment, before/after frozen hashes, bounded932-byte output and metrics are
retained in that directory's `invocation.json`, `output.log` and `result.json`.

It reached `building cli-linux-x64`, then **OOM-killed at the same960MiB ceiling**:
systemd reports `Result=oom-kill`, `ExecMainStatus=9`, `MemoryPeak=1006632960`,
12.520s service runtime (12.585s outer observation), and no artifact. The initial
parent wrapper refused before launch because `artifacts/` was absent; after
creating only that approved ignored output directory, exactly one builder ran.
No old outputs/unit/source/native inputs/installed client were deleted or changed.

The direct-driver candidate is now exhausted, not a pending untried fix. Full
build/types and installed-client acceptance remain blocked; no unchanged retry,
guard increase, bytecode/minification/sourcemap change or release-channel change
is authorized by this outcome. Any genuinely different route still needs its
applicable authority and a fresh absent output: the supported script removes its
selected `--outdir=` before building.

### Native build phase review — 2026-10-31

**Direct parent follow-up:** the bootstrap inventory now records the previously
missing compiler aliases: `@typescript/native` resolves to `typescript@7.0.2`
(`tsc`), while `typescript` resolves to `@typescript/typescript6@6.0.2` (`tsc6`).
It also records `@tsconfig/bun@1.0.9`, the local build's channel/version/team-file
inputs and optional release-download boundary. Parent independently read the
catalog, installed manifests, CLI/core/base configs and release-download source.
No package was installed and no build or test was run in this follow-up.
The declared base config uses `skipLibCheck:true`; that is **not** a substitute
for this delivery's retained full strict/library requirement. Core declaration
and incremental output would write under `node_modules/.ts-dist`, so no checker
is run against the frozen checkout merely to obtain a smaller green result.

Parent independently reads the complete three retained direct-builder receipts
and pinned`packages/cli/script/build.ts:17–232`. The inspected script passes
entrypoint/tsconfig/plugins, minification, bytecode, splitting, local-channel inline
sourcemap, defines and executable compilation into **one**`Bun.build`call at
lines156–201. Its exposed flags select targets, installation, web archive and output
location, not separate heavy stages. Source setup precedes the call; success checks,
simulation/native-architecture verification, metadata and artifact checks follow it.
`build-node.ts:29–32`does expose bundle/archive selectors, but for a different Node
SEA artifact; that does not establish an equivalent native CLI route.

The932-byte retained output ends with`building cli-linux-x64`, emitted immediately
before the fused call, then the960MiB OOM receipt. It does **not** identify which
sub-allocation exhausted memory. Parent accepts the single-call/no-selector finding
for these inspected sources, not the child's universal “no materially different
invocation exists” conclusion. A proposed prebundle/compile split would need new
plugin/define/sourcemap/embedding/verification equivalence and resource evidence;
neither semantic equivalence nor lower peak memory is established. No new build,
probe, release fetch, input/guard change or installed-client replacement follows.

Returned report/facts remain at`/tmp/opencode/d2-phase-report-YFDIkN/`. Its useful
source findings are separate from assignment compliance: the child read targeted
slices of a349,983-byte`bun.d.ts`despite the256KiB whole-file ceiling. Preserve that
scope deviation; do not describe the whole investigation as cleanly bounded.
