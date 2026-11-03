# computer-use-browser

Session-isolated, typed browser backend for the Codex-parity work. It replaces
the shared-current-tab behaviour of a single Playwright MCP process with one
supervised worker per OpenCode session.

The backend is exposed through the `web` tool namespace in
`.opencode/plugins/computer-use/browser-tools.ts` (a distinct name because OpenCode
reserves the `browser` namespace for its own desktop surface).

## Isolation model

| Property | Behaviour |
| --- | --- |
| Worker scope | One child process per session, at most `LIMITS.MAX_BROWSER_WORKERS` (2) concurrently. A third session is refused with `CAPACITY_EXCEEDED` rather than by evicting anyone. |
| Profile | Dedicated directory per project and session under the discovered OpenCode data directory, created `0700`, refused when symlinked, foreign-owned or already locked. |
| Child environment | Explicit allowlist of six base variables (`HOME`, `PATH`, `LANG`, `PLAYWRIGHT_BROWSERS_PATH`, `TMPDIR`, `TZ`) plus up to four display/bus addresses (`DISPLAY`, `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, `XAUTHORITY`). `DEBUG`, `PWDEBUG`, `NODE_OPTIONS` and everything else are dropped before Playwright is imported. |
| Tabs | Opaque per-worker ids with an ownership class. There is no "close all"; only an explicit id closes. |
| Element targets | A `[ref=…]` from `ariaSnapshot({mode:"ai"})` is valid only for the snapshot generation that produced it. Reusing an older ref fails with `STALE_REF`. |
| Crash | Surfaced as a typed error; the last mutation is never silently retried. `restart()` creates a fresh profile generation. |

The worker owns its stdio: stdout carries the protocol and stderr is a dedicated
pipe the parent drains (2 KiB ring buffer, 300-character excerpt on failure). It is
never the parent's inherited descriptor — a daemon's stderr can be a socket whose
reader is gone, and the worker's first diagnostic write would then kill it right
after it reported ready.

Chromium is the bundled Playwright build (`chromium-1243` under
`PLAYWRIGHT_BROWSERS_PATH`) or, when that build cannot sandbox, installed Google
Chrome; both run sandboxed with TLS validation left on. There is no
remote-debugging port, no `--no-sandbox`, and no `ignoreHTTPSErrors`.

### Sandbox strategy and the verified fallback

The worker prefers the bundled Playwright Chromium. When unprivileged user
namespaces are restricted *and* that build's `chrome_sandbox` is not setuid root,
it launches the installed Google Chrome instead, whose
`/opt/google/chrome/chrome-sandbox` **is** setuid root. Both paths keep the
sandbox, TLS validation and a dedicated profile; the sandbox is never disabled.
The chosen channel is reported on stderr as
`browser-worker-ready: channel=<bundled|chrome>`.

Verified on this machine: the worker reaches `{"type":"ready"}` with
`channel=chrome`, including against a copied real profile, so the profile is not
the blocker.

### Sandbox prerequisite (only when no setuid helper exists)

Because the sandbox is enforced, Chromium needs either unprivileged user
namespaces or a setuid-root `chrome_sandbox`. **No system change is needed on
this machine:** the bundled build cannot sandbox here
(`kernel.apparmor_restrict_unprivileged_userns = 1`, its `chrome_sandbox` is
`-rwxr-xr-x james james`), so the worker selects the installed Google Chrome,
whose helper is `rwsr-xr-x root root`, and reaches ready.

The commands below are therefore *not* part of this machine's setup. They apply
only on a host with neither unprivileged user namespaces nor a setuid helper for
any installed browser, and using the bundled build there is an operator choice
that needs its own approval:

```bash
sudo chown root:root ~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome_sandbox
sudo chmod 4755 ~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome_sandbox
```

Dropping the sandbox is never an acceptable fallback: if no sandboxed channel can
start, the tools fail closed.

### Credential redaction

An accessibility snapshot renders an input's value in clear text, so a password would
otherwise be readable by the next `snapshot`. Two layers apply:

- values typed through the privileged credential path are scrubbed from snapshot text,
  titles and URLs (long values everywhere, short values as whole tokens only);
- every snapshot line whose ref is a **password-typed input** is redacted whatever its
  value and regardless of who typed it, which also covers a field the page pre-filled;
- `web.signin` requires the target to actually be `input[type=password]`, so a private
  password cannot be typed into a search box or username field. The general privileged
  fill path still allows text and email fields, since a sign-in form may need them.
  The restriction is validated and carried through both local and framed workers.
  Values are protected before possible mutation; a fill that changes the page and
  then fails acknowledgement reports uncertainty, not that nothing was typed.

Values are retained for the worker's lifetime within a 1 MiB budget measured in UTF-8
bytes; past that budget the oldest value is dropped and would no longer be scrubbed.
Every password-typed input on the page is also collected with a single document query at
snapshot time, so a field whose value never passed through the privileged fill path is
covered too, however many fields exist.

A page that transforms the value into another element (hashing it, say) can still
surface a derivative; the worker does not read page JavaScript or DOM values to hunt
for that. A filled tab refuses `web.screenshot` until a confirmed navigation to a
new URL or close. Because compositor windows cannot reliably be bound to one
browser session, **any** protected tab blocks `desktop.capture` for all sessions.
Protection never expires merely with time; only confirmed lifecycle changes clear
it, and a successful `web.close` clears only that session. An uncertain fill keeps
the sign-in guard blocked until its owning browser is confirmed closed. These
boundaries have offline source regressions, not new human/private-entry acceptance.

## Deliberately absent

- **No arbitrary script or CDP surface.** No `evaluate`, `runCode`,
  `addScriptTag`, `newCDPSession` or download of remote code.
- **No download retrieval.** The context accepts downloads but there is no
  validated output-directory and size contract yet.
- **No upload path allowlist.** Upload checks that the target is a regular file,
  then hands it to `setInputFiles`.
- **No private-sign-in wiring.** `authFlow` only blocks service workers. The
  runtime auth guard is applied by the private-entry stage, which must also gate
  uploads and ensure model actions cannot expose or submit credential data.

For read-only preparation of explicit desktop/browser acceptance targets, see
the runtime package's [source-only preflight](../computer-use-runtime/README.md#read-only-acceptance-preflight).

## Verification

```bash
npm --prefix tools/computer-use-browser ci --ignore-scripts --no-audit --no-fund
npm --prefix tools/computer-use-browser run check
```

The browser suite runs 57 `node:test` cases against injected fake
Playwright boundaries: cross-session id rejection, capacity refusal, stale
snapshot refs, profile-lock refusal, child-environment allowlist, screenshot and
snapshot budgets, and crash surfacing, plus six channel-selection cases. The
bounded benchmark/dependency suite is separate and covers production-source
staging, dependency pins, and offline benchmark contracts.

Validate the lock first with
`node tools/computer-use-browser/benchmark-dependencies.mjs`. Provision only an
explicitly selected disposable/fresh source dependency tree: `ci` replaces its
`node_modules` and must not discard existing modified dependencies. Lifecycle
scripts are disabled; no browser executable is installed by these instructions.
The source verification does not borrow SDK/type declarations from another
package or change the installed runtime/profile. No dependencies were provisioned
by this canonical preflight merge.

The package `check` runs the base typecheck and browser suite, dependency-lock
verification, benchmark TypeScript checking, then benchmark/dependency tests.
The parent independently ran **46/46 browser** and **35/35
benchmark/dependency** cases (**81/81** total), plus the runtime suite documented
in the linked preflight guide. Runtime strict/library checking and the base
browser typecheck passed. The benchmark TypeScript compiler check failed because
the local SDK declarations are missing, with downstream implicit-`any`
diagnostics; the benchmark suite was run separately, and `npm run check` is not
green or evidence of installed-ready strict dependencies.

### Runtime prerequisite discovery

```bash
node --experimental-strip-types tools/computer-use-browser/runtime-prerequisites.mjs \
  [--scratch-parent /absolute/path]
```

Reads filesystem metadata only: it never starts a browser, profile, page or
compositor, and it installs nothing. It resolves Playwright with the same
sanitized child environment the worker receives — including the
`PLAYWRIGHT_BROWSERS_PATH` default of `$HOME/.cache/ms-playwright`, which differs
from Playwright's parent-path resolution when only `XDG_CACHE_HOME` is set. The
report names the effective browser build, both executable/helper identities, the
AppArmor unprivileged-userns policy, the channel the worker would select, and
whether the isolated benchmark's pinned executable, browser installation
directory and (when requested) scratch ancestry satisfy its own validators. The
exit code is non-zero when the worker lane or a requested scratch parent is not
ready.

Observed 2026-10-29 on this host: bundled `chromium-1243` and its non-setuid
helper are present, unprivileged user namespaces are restricted, and the
installed Chrome helper is setuid root, so the worker lane selects
`channel=chrome` and is launch-ready. For the isolated benchmark, the pinned
Playwright executable exists but its installation root
(`~/.cache/ms-playwright`) and `/tmp/opencode` are mode `0775`, so the
benchmark's browser-path and scratch-ancestry checks refuse them
(`BROWSER_PATH_UNSAFE`, `SCRATCH_PARENT_UNSAFE`). A `0700` child of
`/tmp/opencode` still fails on its group-writable ancestor, and the repository
root is refused for the same reason; resolving that needs a permission or
approved-root policy decision, not a source change here. Those are launch
prerequisites, not a loaded worker, a loaded benchmark or human acceptance. Run
the offline fixtures with
`npm --prefix tools/computer-use-browser run prerequisites:test`.

A later source-level run of the current tree reported **57/57** browser cases
(51 existing plus 6 channel cases); the historical parent counts below are left
as recorded.

Parent verification on 2026-10-30 UTC repeats the full package `npm run check`:
strict base and benchmark typechecks, **57/57** browser cases, exact dependency
verification (5 pins/275 lock entries) and **50/50** benchmark/dependency/probe
fixtures, zero skips. The probe has **11** cases; a new real-CLI regression first
showed that a missing `--scratch-parent` value silently omitted the requested
ancestry check, then passed after early argument validation. Actual read-only
discovery still reports Chrome worker prerequisites ready but benchmark
`BROWSER_PATH_UNSAFE` and `SCRATCH_PARENT_UNSAFE`. No permissions changed and no
browser/model benchmark or profile was launched for these checks.

### Isolated benchmark exposure contract

The benchmark comparator accepts only the exact paired exposure it requested:
Code Mode requires all eight production `web` tools registered with
`codemode: true` and the actual dispatch snapshot containing only `execute`;
`directTools` requires all eight registrations with `codemode: false`, exactly
the eight `web_*` tools in the dispatch snapshot, and no `execute`. The loaded
registrations and model-call context are checked; config or tool names alone do
not establish dispatch exposure. Offline tests exercise this contract and
synthetic orchestration boundaries, not an actual model comparison.

Relevant source bounds include 2 MiB per staged source file, 32 MiB total
staging, at most eight comparison pairs, eight message pages of up to 50 rows,
a 16 MiB response bound, and 64 dispatches. A missing or excess exposure or
exhausted bound blocks the comparator rather than relaxing its acceptance.

### Sign-in acceptance (tool level, no human needed)

```bash
node --experimental-strip-types tools/computer-use-browser/signin-acceptance.mjs
```

Runs the real `web.signin` path against a local page: guard transitions, the
whole-surface gate, an auth-flow worker, the manager's fill gate, snapshot redaction
and the status-only result. Only the human is stubbed — a fake dialog returns a
synthetic value, exactly as the GTK dialog would after a person typed. Eight checks:
the field is addressable, sign-in returns `filled`, the dialog is used once, the value
never appears in the result, the guard returns to idle, the page confirms the typed
length, the snapshot shows `[redacted]`, and a consumed generation cannot reopen the
dialog.

What it does **not** prove: the GTK dialog window or a real person typing into it.
That stays an operator step, recorded in the Codex-parity status.

### Live acceptance (operator-run, needs a graphical session)

Unit tests use fakes. To prove the tools work against real Chrome on this machine:

```bash
node --experimental-strip-types tools/computer-use-browser/live-acceptance.mjs
```

It imports the real `web` registrations in a throwaway process, opens
`https://example.com/`, and checks fourteen things in three groups:

- **Surface:** opaque tab id, a snapshot with element refs, an inline PNG
  screenshot file part.
- **Isolation:** distinct tab ids across two sessions, the second session's own
  snapshot, refusal of a cross-session tab id, refusal of a third concurrent
  worker, private `0700` profiles.
- **Contracts:** a mid-flight screenshot cancellation, the surface still working
  afterwards, acceptance of an action with the current snapshot generation,
  refusal when that generation is reused, and the per-worker tab limit at 8.

It closes its workers and deletes the profiles it created. It exits non-zero if any check fails,
and it is deliberately not part of `npm test` because it needs a display.

What is verified where:

| Level | State |
| --- | --- |
| Worker startup | **Verified on this machine.** A standalone worker with the sanitised child environment *plus* display variables launched the installed Chrome and reached `{"type":"ready"}` with `channel=chrome`. Without display variables it fails with the error the plugin reported. |
| Page work (navigate, snapshot, screenshot) | **Verified at tool level.** Driving the real `web` tool registrations from a fresh process opened `https://example.com/`, produced a 1,283-byte snapshot with 8 refs, and returned a 175,274-byte inline PNG (2036×1366). Two live sessions were also shown to keep separate workers and `0700` profiles, with a cross-session tab id refused and a third worker rejected. |
| In-session `web.*` and Code Mode image delivery | **Verified.** On the live service, `web.open` returned a tab id and title, `web.snapshot` returned 1,283 bytes with 8 refs, `web.screenshot` delivered the PNG to the model through Code Mode (the page was actually visible in the conversation), and `web.close` discarded the worker. |

The source cases are contracts; the live table above is separate evidence from a
scratch harness that is not part of the repository.
