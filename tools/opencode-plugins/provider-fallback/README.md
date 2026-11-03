# OpenCode v2 provider fallback

This is a bounded, opt-in package source. It is stored under `tools/`, not an
OpenCode plugin discovery directory, and no project/global configuration loads
it. A future integration must explicitly register the server and TUI parts.

The fallback chain defaults to empty. With no configured chain the server
reports `inactive` and never switches a provider. A configured chain is only
used after a qualifying retry error: quota-style failures by default, or other
retryable errors when `triggerOn: "any-retryable"` is explicitly set. The
sidebar says `configured` while waiting; it does not claim a route is active.

This adaptation has no proactive quota checks, credential readers, OAuth
handling, provider setup, or account setup. `proactive` and other unsupported
options fail closed as invalid configuration. Fallback history is in-memory
and scoped to this plugin instance; the status RPC is read-only. A typed
`changed` notification asks the sidebar to refresh after a successful fallback.

The package exports `./server`, `./tui`, and `./rpc`. Its TUI contribution
appends to OpenCode's `sidebar.content` slot and leaves existing sidebar
contributions intact. The RPC status values are `inactive`, `configured`, and
`last-fallback`; the TUI reports `loading` or `unavailable` separately if the
server status cannot be read.

## Prerequisites and compatibility

The local development pin includes `@opentui/core` 0.6.6. Its installed
manifest declares Node.js `>=26.4.0` or Bun `>=1.3.14`. The local typecheck and
tests passed under Node.js 22.22.2, but static checks do not establish TUI
runtime compatibility. OpenTUI was not installed into OpenCode's runtime, this
package was not activated, and no live render was performed.

## Supported options

- `defaultChain`: ordered `provider/model[#variant]` IDs; defaults to `[]`.
- `agents`: per-agent `mode`, `chain`, `triggerOn`, and cooldown overrides.
- `triggerOn`: `"quota"` by default, or `"any-retryable"`.
- `failureCooldownSeconds`: defaults to `300`.
- `sourceCooldownSeconds`: defaults to `10800` and applies to classified quota
  failures. There is no upstream quota/reset lookup.

Configuration is validated as a whole. Unknown keys, malformed entries,
duplicates, or invalid bounds disable routing instead of partially applying a
chain. Per-agent `mode: "off"` opts that agent out.

## Local checks

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The delivery source now pins SDK/theme **2.1.1**, authentic JSON Schema
declarations **7.0.15**, and TypeScript **5.9.3** locally. Library checking is
enabled (`skipLibCheck:false`); no sibling package supplies aliases or shims.
The new dependency-readiness suite checks the private manifest/public SHA-512
lock, local installed roots, authentic declaration bytes, and a real compiler
negative control for a broken external declaration.

On 2026-10-28, **30/30** tests pass and a direct 180-second-bounded strict check
passes (634 files, 80.50s compiler time, about 1.5 GiB compiler memory). The first
`npm run check` reached its typecheck's 90-second limit without a diagnostic;
that invocation remains inconclusive, not a pass. Tests then ran separately.
No install scripts, runtime configuration, provider calls, TUI loading or plugin
activation were performed. The OpenTUI engine limitation above still applies.

The canonical consolidation reran only the **27/27** behavior tests in
`test/*.test.ts`. The three dependency-readiness/compiler-control cases and a new
strict typecheck were deliberately not rerun; the historical full results above
remain delivery-checkpoint evidence.

See [PROVENANCE.md](PROVENANCE.md) for the pinned source, adaptation boundary,
official OpenCode references, and license status.
