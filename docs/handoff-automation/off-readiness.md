## Canonical checkout interpretation — 2026-10-29

This is a retained 2026-10-28 delivery source/API report from
`/home/james/repos/computer-use-delivery`. The canonical checkout is now
`/home/james/repos/computer-use` on `main`; dated CLI, dependency, API and
runtime observations below remain tied to their stated delivery snapshot and
must not be generalized to the canonical runtime.

The canonical source/acceptance trail is maintained separately in
[`acceptance.md`](acceptance.md) and [`features.md`](../features.md). The
separately recorded independent receiver processing and later source/test changes
are not negated by this older report, and they do not prove visible Ctrl+P,
native same-chat compaction while OFF, or live model continuation. The canonical
feature inventory also records separate ChatGPT image and resource-monitor pilot
observations; they are not handoff acceptance. This consolidation performed no
goal operation, deployment, or live handoff/compaction action.

The parent’s current scoped checks are recorded in
[`main-consolidation.md`](../codex-parity/main-consolidation.md): 120 connector,
81 browser/benchmark/dependency, 42 runtime, 29 capture, 27 fallback, 27 monitor,
six native-preview, and 55 adjacent checks, plus fresh health. Coordination is
104/105 because AJV is absent and four readiness cases were not run. These
results do not establish full goal/native/model/visible acceptance.

# Handoff OFF and continuation readiness

Last checked: 2026-10-28. This is bounded source/API evidence, not live TUI
acceptance.

## Supported native boundary

The local CLI reports OpenCode `v2.1.1`. The official [V2 CLI settings
guide](https://opencode.ai/v2/docs/cli/config) describes `Ctrl+P` → **Open
settings** as the native terminal settings dialog and says those CLI settings
live in the user's global `cli.json`. The [V2 TUI plugin
guide](https://opencode.ai/v2/docs/build/plugins/cli) separately documents
`keymap.layer`, palette commands, and `ui.dialog.select`. Accordingly,
**Handoff settings** is a custom palette command in the **Settings** group; it is
not a native Open settings page and does not edit `cli.json`.

The [V2 server plugin guide](https://opencode.ai/v2/docs/build/plugins/server)
documents `session.hook("compaction")` as a checkpoint-summary model request.
A hook can provide the summary result and skip that model call; the documented
callback is not a cancel/defer/redirect boundary before compaction. Automatic
handoff therefore remains best-effort at normal context boundaries. OFF leaves
native compaction enabled; no pre-compaction transfer guarantee is claimed.

This read-only check also observed `opencode --version` → `opencode v2.1.1`.
The worktree has no local `node_modules` declaration bundle for `@opencode/plugin`,
so this check used the official V2 API documentation plus the repository's
existing [native capability audit](../codex-parity/native-capability-audit.md),
not a fresh package-declaration or runtime-hook inspection. No settings file,
TUI runtime/UI state, service state, or deployed plugin was read or changed.

## Source behavior and regression

- OFF suppresses automatic source requests only. Native compaction, manual
  `/handoff`, and a separately explicit `/handoff_resume` remain available.
- A `resume: false` seed remains passive when received, opened, read, or focused.
  Only explicit `/handoff_resume` requests continuation.
- `.opencode/plugins/goal-docs/handoff-off-readiness.ts` is a pure readiness
  adapter: it distinguishes passive seeds, eligible automatic requests, and
  readiness for the exact explicit command. Readiness is not invocation
  deduplication: the adapter never sends a prompt, creates or wakes a session,
  or changes goal state. Its tests use synthetic session,
  settings, and status values; there are no plan fixtures or goal-tool calls.
- The settings controller now persists an explicit OFF even when the displayed
  effective value is already false (for example, an ineligible role can mask a
  stored ON). When enabling, it re-reads role, revision, and the one-shot request
  latch after the selector closes, refusing when that read observes a request
  issued while the dialog was open.

The new regression tests failed before the controller change: an OFF selection
with an already-false effective view made no write, and a request latched during
the open dialog still reached `update`. Both pass after the correction. The
client re-read narrows but cannot eliminate the race: `automation.context()` can
persist `requested` without advancing the settings revision. Since
`.opencode/plugins/goal-docs/automation.ts` is outside this lane's ownership, the
parent should add an atomic server-side guard inside its serialized `update`:
reject `enabled: true` whenever the freshly loaded state has `requested !== null`.
Advancing the revision when the latch changes would also invalidate stale dialogs,
but the in-queue request-latch check is the essential safety condition.

Parent follow-up corrected that server gap: serialized enable now refuses a
consumed `requested` latch, and persisting a new request advances the settings
revision. Two independent regressions failed before the fix; explicit OFF still
works without clearing/replaying the request, including across a controller restart.
The actual combined automation/settings/readiness/title/TUI/command batch passed
76 cases before the additional native-goal-receipt regression. Authentic strict
TypeScript checking of the later nine integration roots passes using read-only
original-checkout dependencies, not a new local installation or loaded runtime.

The readiness adapter is not wired into the runtime. The command source and
settings controller are source-covered; adapter tests are a pure policy check.
Neither proves palette visibility, a loaded plugin, native same-chat compaction,
model behavior, exactly-once invocation, or an actual one-command continuation.

## Verification boundaries

Executed only these synthetic/source tests:

```bash
node --experimental-strip-types --test \
  .opencode/plugins/goal-docs/automation-settings.test.ts \
  .opencode/plugins/goal-docs/handoff-off-readiness.test.ts
node --experimental-strip-types --test \
  .opencode/plugins/goal-docs/tui-wiring.test.ts
node --test scripts/handoff-resume-contract.test.mjs
```

They verify settings-controller behavior, passive-vs-explicit readiness rules,
command-source obligations, and the actual TUI plugin's manual `/handoff` wiring
against an in-memory fake client. They do not invoke a goal tool, touch a live
participant session, issue a live prompt, load/deploy the plugin, touch runtime
settings, or exercise native compaction. No TypeScript compiler or SDK declaration
bundle is present in this worktree; the TypeScript files were executed through
Node's type stripping, not type-checked. Parent review and independent re-running
remain required.
