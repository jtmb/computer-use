# Codex computer-use / browser-use runtime — reverse-engineering notes

Inspected 2026-11-01 on this machine, read-only. Nothing from the OpenAI
distribution was copied into this repository: the proprietary packages are
described, not vendored, and the local implementation is independently written
against this repository's existing tools.

## What is actually installed

| Piece | Location | Version |
| --- | --- | --- |
| ChatGPT desktop app | `/usr/lib/chatgpt` | `26.1027.30824` |
| Bundled Codex CLI | `/usr/lib/chatgpt/resources/codex` (not on `PATH`) | — |
| Codex home | `~/.codex` | config, plugins, sessions |
| CUA Node runtime | `/usr/lib/chatgpt/resources/cua_node` | Node `24.22.1-cua.1`, runtime `0.0.35` |
| Bundled plugins | `~/.codex/plugins/cache/openai-bundled/` | `unified-computer-use`, `browser`, `codex-app-tools`, `visualize` |

Relevant packages inside `cua_node/lib/node_modules/@oai`: `cua` (the object
API), `cua-repl` (the MCP server and its instructions), `sky` (native desktop
control), `browser-desktop` (browser client/service).

## The interaction model — this is the part worth copying

Codex does **not** expose a tool per action. It exposes one MCP server,
`node_repl`, with one main tool, `js`. The tool description embedded in the
binary is explicit:

> Execute JavaScript in a persistent `node_repl` with top-level await. Top-level
> bindings persist until `js_reset` and can be redeclared. Use `const` for stable
> values and `let` for changing values. … Use `nodeRepl.write(value)` for output
> and `await nodeRepl.emitImage(image)` for images. The default timeout is 30000
> ms.

Observed properties:

- **One cell, many actions.** A model turn can bind an app, inspect it, click,
  and screenshot without another tool round trip.
- **State survives turns.** `const app = await cua.getApp("Calculator")` remains
  usable in the next cell.
- **Progressive documentation.** The first `cua.getApp`/`getTab`/`getState` call
  returns the complete API documentation and the initial UI state. Nothing is
  read until the surface is used.
- **Small object graph.** `cua.getState()`, `cua.getApp(name)`,
  `cua.getBrowser({url})`, `cua.getTab(...)`, `cua.createBrowserTab(...)`; handles
  expose read/act/verify methods.
- **Hooks.** `Stop`, `Interrupt` and `SubagentStop` call `turn_ended` on the same
  server, so the runtime knows when a turn is over.

`@oai/cua-repl` ships the injected instruction files. The Linux set is
`instructions/linux/{description,computer,browser,output}.md`; the browser
plugin adds `skills/control-in-app-browser/SKILL.md` and a `docs/` bundle
(`api.json`, `api-use-behavior.md`, `browser-safety.md`, troubleshooting). The
behavioral rules that make the agent look competent are ordinary prose, for
example:

- collect the cheapest state check that answers the next question; avoid both a
  snapshot and a screenshot by default;
- if an interaction has no effect, inspect for a blocker instead of repeating it
  or dropping to coordinates;
- treat one authoritative signal (selected option, toast, basket line, URL
  parameter) as the answer instead of re-verifying through other surfaces;
- do not call `goto` on the URL a tab already shows;
- proof of work: embed the screenshot that shows the result.

### The kernel

`node_repl` is a Rust stdio MCP server that supervises a separate Node process.
Strings in the binary show a `kernel.js` with `--experimental-vm-modules`,
`vm.SourceTextModule`, a `trusted-worker.js`, an environment allowlist and a
30 s execution timeout. This is why it gets both top-level await and persistent
top-level bindings: the kernel keeps the VM context alive between cells.

## Backends (and why they do not transfer)

**Computer use** is `@oai/sky` plus the native `sky_linux_x64` helper. The helper
has a full CLI (`list_apps`, `list_windows`, `get_window_state`, `click`,
`type_text`, `press_key`, `scroll`, `clipboard_*`, `launch_app`, `server`) and
talks to `x11-full-desktop`. On this machine the session is Wayland
(`XDG_SESSION_TYPE=wayland`): the helper listed only two X11 windows, a 1×1
window and the mutter guard. It cannot see the native Wayland windows that the
repository's GNOME Shell bridge lists correctly. **Copying Sky's backend would be
a regression here.** The useful part is its handle model (`list_apps` →
`get_window_state` → element-id actions), not its transport.

**Browser use** is `@oai/browser-desktop`. `scripts/browser-client.mjs` exports
`setupBrowserRuntime()`; `scripts/browser-service.mjs` is registered as a
trusted service (`NODE_REPL_TRUSTED_SERVICES`). `BROWSER_USE_AVAILABLE_BACKENDS`
is `chrome,iab,mcpapps`: the in-app browser, the user's Chrome/Edge through the
ChatGPT extension, and MCP-app panels. `~/.codex/browser/config.toml` sets
`approval_mode = "never_ask"`. Playwright is bundled inside `cua_node` and is
reached through `tab.playwright`, not through a separate Playwright MCP.

## Where the perceived speed comes from

Historical backend measurements on the same desktop: `desktop-control.py apps`
0.27–0.36 s, `tree --app ptyxis` 0.54–0.56 s. A plausible source of perceived
speed is **fewer model-visible round trips and less repeated context**:

1. one tool instead of a large catalog;
2. bindings that survive turns;
3. documentation revealed on first use instead of in every prompt;
4. one-shot mutations (Codex's confirmation policy is separate from a
   preview-token protocol);
5. explicit "cheapest check / don't repeat" rules.

This explanation is not an end-to-end model benchmark. The following small
scripted comparison measures tool paths, not model reasoning or token savings.

### Matched local-page measurement — 2026-11-01

On the same warmed isolated browser worker and disposable loopback sample page,
each run opened a new owned tab, took a snapshot, filled the sample note, took a
fresh snapshot, clicked Show note, verified the result in a fresh snapshot, and
closed that exact tab. All six runs verified the expected note. Order alternated
between paths. Both paths were batched inside one outer `execute` call; each
used seven underlying browser-tool calls. CUA used five higher-level methods
because its two `act` calls include fresh snapshots.

| Pair | Direct `web` methods | Persistent CUA methods |
| --- | ---: | ---: |
| 1 (direct first) | 9,004 ms | 7,098 ms |
| 2 (CUA first) | 10,230 ms | 7,726 ms |
| 3 (direct first) | 12,149 ms | 10,174 ms |
| Median of these samples | 10,230 ms | 7,726 ms |

This is only three pairs, with a warm browser, no screenshots in the timed task,
and elapsed tool time rather than prompt-to-answer time. It does not establish
a general speedup, fewer model turns, or lower model cost. Task-scoped model
token/cost counters were not measured; no values are inferred from output bytes.
The separate cold CUA open/snapshot sample measured 5,068/489 ms inside the cell
(6,457 ms around the whole call). It is not mixed into the warm table.

Two exploratory benchmark scripts failed before these accepted runs: malformed
newline escaping, then treating `act`'s combined action/snapshot text as one JSON
object. The final script parses the last JSON line; those failed attempts are
excluded, and their owned tab was closed. A full model comparison remains a
different experiment, not something established by that tool-only table.

### Matched real-model local-page runs — 2026-11-01

Six fresh native sessions ran sequentially from18:40–18:53UTC with
`opencode-go/deepseek-v4.1-flash#high`, agent `build`, the same repository location,
unchanged inherited permissions and the same account-free loopback fixture. No
permission rules, plugin exposure, configuration, credentials or shared service
were changed/copied. Sessions were created without permission overrides or goals.
Order was direct/CUA, CUA/direct, direct/CUA. Each started its own browser worker;
provider cache warmth and concurrent machine/provider load were not controlled.

Both paths used Code Mode: direct called `web` methods; CUA called `cua.js` and
remembered browser/tab handles. This does **not** compare `directTools:true` with
Code Mode. Prompts differed only in the required path. The task opened a new
owned tab, snapshotted, filled `Matched model test`, re-read, clicked Show note,
verified the exact status text, navigated the **same** tab to `/second`, verified
its heading, closed that explicit tab, then closed that session's worker. No
screenshots were included. This is a larger, cold-worker task than the earlier
warm seven-call experiment; its times are not mixed with that table.

Elapsed time uses `performance.now()` immediately before the authenticated
`opencode api` prompt call through completion of native `session.wait`. It
includes CLI request/wait overhead, discovery, model reasoning, tools, retries
and the final answer; creation, context retrieval and verification are outside
the timer. Usage and USD cost are **native reported counters**, not character
estimates or an invoice. Per-assistant-message sums match each fresh session.
Reasoning is its own native field; no assumption about overlap with output is
used to construct a total.

| Run | Path | Prompt-to-idle ms | Assistant steps | Outer tool calls | Nested browser calls | Native USD cost |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| 1 | Direct |144,358|10|9|11 `web.*`|0.005780160|
| 2 | CUA |189,167|17|16|8 `cua.js`|0.008407722|
| 3 | CUA |97,318|8|7|6 `cua.js`|0.004913178|
| 4 | Direct |88,394|8|7|10 `web.*`|0.004685676|
| 5 | Direct |101,690|9|8|13 `web.*`|0.005137014|
| 6 | CUA |127,664|11|10|8 `cua.js`|0.005811996|

Outer counts include skill/read/grep/execute calls, not just actions. Nested
counts come from actual `execute.state.metadata.toolCalls`, excluding catalog
searches. A `cua.js` call can issue zero or several backend calls, so these are
**not equal-work backend-call counts**; CUA internals are not separately metered
there. Direct runs avoided CUA; CUA runs used no direct `web` operations.

| Run | Native input | Output | Reasoning | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 |27,040|1,417|455|200,320|0|
| 2 |36,955|1,735|810|445,824|0|
| 3 |23,331|1,125|468|152,576|0|
| 4 |24,166|1,004|19|148,992|0|
| 5 |25,181|1,322|83|172,288|0|
| 6 |27,482|1,197|503|223,232|0|

All six completed the actual page checks. Tool-result snapshots prove initial
generation1, exact filled text at2, expected status at3, then the second-page
heading at4 (run5 at5 after its refused request), bound to one tab identity per
run. Explicit close and `cancelled:true`/discarded-worker results prove cleanup;
a separate `/proc` scan found zero processes bearing these six session IDs.
The fixture server was closed. Initial `about:blank` tabs were not explicitly
closed; they remained until session-worker cleanup.

Imperfections remain included rather than selecting clean runs:

- Run2 used four grep calls and one read to understand CUA actions, plus
  catalog/no-op detours. One grep searched `/home/james`, wider than needed;
  bounded returned matches were project source. This unnecessary model choice
  remains timed/counted, not a recommended workflow.
- Run5 supplied both `action` and `url` to navigation. The tool refused with
  `Supply exactly one of url or action`; a fresh snapshot showed the old page,
  then URL-only navigation succeeded. Both attempts remain counted.
- Run6 unnecessarily loaded `browser-headless` but actually used the same
  configured backend, not a headless substitute. Listing tabs before opening
  one returned `SESSION_STATE`; opening the task tab then succeeded. Its final
  claim of "no real errors" is not accepted as evidence of zero errors.
- Outer tool status `completed` does not mean a nested browser operation
  succeeded. Raw content reveals those refusals despite zero outer-state errors.

Three-sample medians are direct101,690ms/$0.005137014 and
CUA127,664ms/$0.005811996. These samples **do not demonstrate a CUA speed or cost
advantage**. Cache differences, discovery/source detours, retries, verbose final
answers and small sample size prevent a general performance claim. No detours
or failed requests were removed to improve either result.

Native session evidence, in table order:

1. `ses_e67966d65ffeWobdqpiB9vDD5S`
2. `ses_e679427b7ffeKft7cAE5yhIISZ`
3. `ses_e6791316cffezQEG8znj6alwQl`
4. `ses_e678fa41bffe9fd37ys70ECsEG`
5. `ses_e678e3837ffekHSSiS9T0JZF7F`
6. `ses_e678c97ecffelOHwLnQxTsb60m`

Raw prompt/create/context/session/per-step counters, actual tool inputs/results,
runner, verifier and permission readback are at `/tmp/opencode/cua-model-amwBAh/`.
The verifier checks returned snapshots, not final answers, and rejects four
negative controls: corrupted expected status, missing cleanup, changed usage
sum and wrong path. Six source hashes, effective build permissions and staged
patch SHA256 `91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805`
remain unchanged. This document retains results/session locators if transient
raw files expire; expired scratch evidence is not freshly verified evidence.

The final audit confirms that scratch directory has expired. Read-only metadata
reads of the six exact owned native sessions still reproduce every cost and token
class in the tables above. No context/message import, new model generation or
benchmark rerun is performed. The recorded monotonic timings and inspected GUI/
tool outcomes remain the original experiment's durable receipt, not fresh trials.

## What changed in this repository

A new `cua` surface in `.opencode/plugins/computer-use`:

| Tool | Purpose |
| --- | --- |
| `cua.js` | persistent JavaScript cell with top-level await, `nodeRepl.write`, `nodeRepl.emitImage` |
| `cua.reset` | discard that session's bindings |

`cua.ts` and its sibling `cua-worker.ts` implement a per-session worker-owned
`vm` context and a tokenizer-assisted declaration transform:
top-level `const`/`let`/`var` become assignments to hoisted script bindings
inside an async wrapper, and the last expression is returned, so cells behave
like a REPL. App, window, browser and tab handles are plain objects whose methods
call the **already-registered** `desktop.*` and `web.*` tool executions. That is
deliberate: validation, permission assertions, sign-in blocking, per-session
serialization, preview tokens and redaction stay single-sourced.
`desktop.appIndex` (and `--app-index`) initially let the caller choose between
identically named apps. Follow-up source now binds the resulting handle to
`appId` (transport plus process incarnation), not that shifting list position.

Limits and honest differences:

- `vm` is **not** a security sandbox. A cell has the same authority as the tool
  session, and the session already has shell authority. Code generation from
  strings is disabled and `process`/`require`/`import`/`fetch` are not exposed,
  but this is containment, not isolation. A separate child process with its own
  sandbox would be the next step if that boundary matters.
- Intended limits are 25 000 output characters, 30 s default, 120 s maximum,
  8 sessions LRU. Follow-up review reproduced late-work and post-await CPU-loop
  hazards that the original fake-backend suite missed. Execution now lives in a
  terminable worker, with main-thread watchdogs and an idle-yield acknowledgement;
  parent CPU/late-work/registration tests pass. Actual source loading also starts
  the worker and preserves a simple binding across calls. Neither worker nor VM
  is a security sandbox; worker loss clears bindings.
  An action already dispatched may have completed even after cancellation.
- `app.click`/`type`/`focus` preview and apply inside one cell. The permission
  prompt and single-use token still run; the difference from `desktop.act` is
  only that the model does not spend a second turn on the token.
- `app.screenshot()` is not exposed because AT-SPI applications are not mapped to
  compositor window ids; use `cua.getWindow(...).capture()`.
- The compositor bridge was unavailable during the original live check
  (`NameHasNoOwner`), so window capture/input and `cua.getWindow` are source- and
  unit-verified but not live-accepted in that pass. Desktop reads and browser
  opening/snapshot/inline screenshot were observed; the earlier broad claim of
  live desktop control was not independently established. The later read-only
  preflight sees apps and windows again, but installed policy drift and exact
  loaded capture/input acceptance remained open at that checkpoint. Later separately
  approved acceptance now verifies actual capture/click/type, remembered windows,
  named app actions and same-name replacement refusal with cleanup. Supported
  process-local accessibility binding and no-replay owned-transport retirement
  avoid a shared restart. See the [qualified current receipt](../deployments/2026-11-01-personality-cua-activation.md#supported-accessibility-recovery-and-app-acceptance--2026-11-01);
  these bounded results do not establish universal desktop parity.

### Actual local browser acceptance — 2026-11-01

The registered CUA tool opened the disposable sample page and kept its tab handle
across cells. Filling the note produced generation2; clicking Show note produced
generation3. The fresh snapshot and attached 80,294-byte PNG both showed
`Verified note: Plain English test`; the screenshot was visually inspected.
The same handle navigated to `/second`, with the expected title/heading and
generation4. Tab close succeeded, and final browser close reported
`cancelled:true`, discarding its worker/tabs while retaining isolated profile data.
No account, external page or signed-in browser profile was used.

The first retries exposed a genuine tool-registry lifecycle bug, not a reason
to bypass a lock: registration replay recreated manager/ref/sign-in state.
Definitions are now built once per plugin load, replayed without rebuilding
that state, and disposed on unload. A real-entry regression fakes only browser
I/O and checks replay, ref use and teardown. The exact old session-owned orphan
was identified by UID, session-profile path and parent process before cleanup;
no lock/profile file or unrelated browser was removed.
