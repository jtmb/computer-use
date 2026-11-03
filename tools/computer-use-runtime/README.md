# computer-use-runtime

Shared contract layer for the desktop and browser surfaces added by the
Codex-parity work. It is dependency-free TypeScript with no runtime side
effects: importing it never touches the desktop, the browser, the filesystem or
the network.

Consumers today:

- `tools/gnome-window-control` — capture, input and launch controllers import the shared limits and error codes through `runtime-contract.mjs`.
- `tools/computer-use-browser` — the manager, worker and profile code import `LIMITS`, the auth guard and this package's error types.
- `scripts/browser-auth-dialog.py` and `secret-entry.ts` — the private-entry transport.
- `.opencode/plugins/computer-use` — registration, permissions and the exposure rollback.

Wiring a contract into a consumer is not live acceptance. Corrected desktop input
source remains undeployed; older installed/loaded bridge observations are scoped
in the [feature inventory](../../docs/features.md). Browser-worker and visible-page
observations remain scoped in the [browser package guide](../computer-use-browser/README.md).

## Why it exists

Every surface needs the same four guarantees, so they are defined once instead
of drifting per backend:

1. **Attribution** — an operation is bound to the session, agent, message and
   call that requested it; a model-supplied identifier is never authority.
2. **Boundedness** — every cross-process message and every returned artifact has
   a hard size, depth and count limit checked before allocation.
3. **Serialization** — one owner's mutating operations run in order, bounded in
   depth, and release their slot on success, failure, cancellation or disconnect.
4. **Sign-in exclusion** — while a private sign-in is in progress, observation,
   capture, screenshot, console/network access and competing control are refused.

## API

```ts
import {
  LIMITS,
  createIdentityFactory,
  validateCallerAttribution,
  createPermissionRequest,
  createProtocolCodec,
  createOwnerOperationQueue,
  createAuthGuard,
  RuntimeError,
  formatRuntimeError,
} from "./src/index.ts"
```

| Export | Purpose |
| --- | --- |
| `LIMITS` | Frozen bounds: `PNG_MAX_BYTES` 6 MiB, `CAPTURE_MAX_PIXELS` 8,388,608, `CAPTURE_CHUNK_BYTES` 48 KiB, `CAPTURE_DEADLINE_MS` 15000, `TIMED_INPUT_MAX_MS` 2000, `MAX_BROWSER_WORKERS` 2, `MAX_TABS_PER_WORKER` 8. |
| `createIdentityFactory()` | Mints opaque ids (`window`, `tab`, `observation`, `request`) and validates only ids it minted, rejecting foreign, blank, control-character and over-length values. |
| `validateCallerAttribution()` | Validates `{sessionID, agent, messageID, callID}` and rejects missing or blank fields. |
| `createPermissionRequest()` | Builds the `ctx.permission.assert` shape with a `{type:"tool", messageID, id}` source. |
| `createProtocolCodec(keys)` | Length-prefixed framing with a 64 KiB frame cap, allow-listed keys at every level, nesting/array/string limits and trailing-byte rejection. |
| `createOwnerOperationQueue(maxDepth?)` | Per-owner FIFO with `mutate`/`read` modes, bounded depth, `AbortSignal` release and exactly-once completion. |
| `createAuthGuard()` | Capability-split sign-in state machine: `guard` (model-facing, read-only), `signInPath` (privileged transitions), `userActions.cancel`, `operatorActions.recover`. |
| `spawnSecretEntry(spec, options?)` | Opens the local dialog helper and receives one bounded UTF-8 value over inherited fd 3; the non-secret prompt spec is temporary, abort/timeouts terminate the helper, and cleanup is attempted before resolution. |
| `RuntimeError`, `formatRuntimeError()` | Typed error codes with a redaction rule so backend output never reaches model text. |

`SecretEntrySpec.minLength` and `maxLength` count Unicode code points; the
transport separately caps the value at 4,096 UTF-8 bytes. On success,
`spawnSecretEntry` returns a distinct `Buffer` that remains live after resolution;
the transport clears its internal frame but leaves that returned value live. If
temporary-file cleanup fails, the returned value is cleared and the result is a
cleanup failure. The current browser-tool consumer clears successful values in
`finally`. Whether every future caller must be explicitly required to clear
returned buffers remains an API policy decision; this documentation describes
current behavior, not a new cross-consumer cleanup requirement.

### Sign-in guard asymmetry

The model-facing `guard` exposes no transition at all, including
`handleUntrustedModelCommand()`, which always returns `false`. Only the
privileged `signInPath` can advance state, and leaving a blocked or
`submitted-uncertain` state additionally requires `userActions.cancel` or
`operatorActions.recover`. Keep `signInPath`, `userActions` and
`operatorActions` out of any model-reachable surface.

## Read-only acceptance preflight

[`acceptance-preflight.mjs`](./acceptance-preflight.mjs) prepares a source-only
manifest from explicit inputs: one exact compositor window ID, one exact
`.desktop` ID, and an already-existing empty private directory directly under
`/tmp/opencode`. The required CLI flags are `--window-id`, `--desktop-id`, and
`--browser-data-dir`; `--extension-dir` and `--expect-target-fingerprint` are
optional. The caller must set `OPENCODE_DATA_DIR` to that exact directory and
`TMPDIR=/tmp/opencode`. The browser directory is inspected but never created or
populated. Optional extension-byte inspection is delegated to the canonical
[GNOME preflight](../gnome-window-control/acceptance-preflight.mjs), including
its source identity and target-fingerprint checks.

This command does **not** inventory windows, inspect a desktop entry, start a
browser worker, perform input/capture, deploy, restore, or accept any live,
model-visible, or human outcome. Selected IDs are reported as
`selected_not_observed`; source and installed-byte checks remain distinct from
loaded integration evidence. The offline fixtures are in
[`acceptance-preflight.test.mjs`](./acceptance-preflight.test.mjs).

## Verification

```bash
npm --prefix tools/computer-use-runtime ci --ignore-scripts --no-audit --no-fund
npm --prefix tools/computer-use-runtime run check
```

`check` runs `tsc --noEmit` and 42 `node:test` cases covering forged and stale
ids, protocol overflow and trailing bytes, queue cancellation and deadlock
avoidance, auth-guard transition refusals and error redaction.

The parent also independently ran the 42-case runtime suite and a strict,
no-emit TypeScript check with library checking enabled; the latter is separate
from this package's configured `skipLibCheck: true` setting. A separate 29-case
capture-logic/held-source batch passed without querying a desktop or invoking the
held screenshot backend.

Provision only an explicitly selected disposable/fresh source dependency tree;
`ci` replaces its `node_modules`, so it is not a preservation operation for an
existing modified tree. To reproduce the separate library check explicitly:
`npm --prefix tools/computer-use-runtime run typecheck -- --skipLibCheck false`.
No dependency provisioning was performed by this canonical preflight merge.

The secret-entry subset has 13 cases, including four previously reproduced
failures where an exited helper's descendant held fd 3 beyond timeout/abort/
overflow or survived success. POSIX process-group escalation/final cleanup is
covered using Linux test subreapers/watchdogs and synthetic helpers. Windows
still targets only the direct child; no crash-proof or human-entry guarantee
is claimed. Full package and focused counts overlap and must not be added.

Run the source-only preflight fixtures from the repository root with:

```bash
node --test tools/computer-use-runtime/acceptance-preflight.test.mjs
```

These are source-level contracts. They are not desktop, browser, GUI or
credential-flow acceptance.
