# Retired local peer-session coordination

**Retired 2026-10-31.** The custom agent inbox/mailbox is removed on explicit
user request: the `coordination` tool, message/delivery/inbox and
recipient-settings RPCs, Ctrl+P TUI controls, observation/watchdog hooks and
automatic inbox reads are no longer part of any loader surface. Delegated work
reports through native child completion; do not add this package to a `plugins`
array.

The package stays in the tree as historical evidence. [index.ts](index.ts) and
[tui.ts](tui.ts) are refusing entrypoints: setup throws the retirement error
before touching context, so activation registers **zero** tools, RPCs, hooks,
UI, event subscriptions or state and makes no network request, even with unsafe
state options. [activation-preflight.mjs](activation-preflight.mjs) stays
read-only and always blocks; it never proposes a configuration entry. The
service, store, tool, RPC and TUI implementation below and the stored
`.session-coordination/` data remain inert for audit. Historical live-acceptance
and deployment records describe earlier behavior, not current registration.

## Retained historical source (inert, not loaded)

These modules implement the removed feature and are kept for audit. No entrypoint
imports or registers them.

- [Service](service.ts): native tool-bound sender; exact project, canonical
  worktree and workspace checks; participant-scoped threads. Peer text never
  grants user authority, changes goals or replaces a task.
- [Store](store.ts): private, checksummed, bounded JSON; Linux kernel `flock`
  exclusion and atomic fsync/rename. Never remove `room.lock` to unlock a live
  writer. No history deletion or age-based ownership release.
- [Tool](tool.ts): `read`, `inbox`, `policy`, `post`, `deliver`, `ack`, `claim`, `release`, `watch`,
   `progress`, `unwatch`, `status`, `message`, `ownership`. Every call requires explicit `op`; message writes
  require `op: "post"`. Malformed calls are rejected, never inferred. Post only stores; deliver uses stable native
  IDs and recipient policy (default mailbox-only, **no native prompt call**). Acknowledgement means seen, not accepted
  work. The tool was available only after separately approved configuration and
  is now unreachable: the loader entrypoints refuse activation.
- [Dedicated native result](result.ts): explicit versioned output schema,
  structured `output`, escaped human-readable summary and metadata. Results show
  the operation, actual actor/scope, message/thread IDs and receipt/seen-only
  state. This is native tool output, not a prose imitation of a tool. Its exact
  appearance has been observed as native readable tool results. No native
  goal-widget clone or custom renderer is claimed.
  Source follow-up: all-final mailbox/admitted combinations now have status
  `mixed`, while unknown/pending receipts keep uncertainty priority. Delivery
  summaries count all four receipt states. This is source/fixture-verified,
  not an actual mixed native-delivery/client acceptance result.
- **Exact body reads:** direct `read`/`inbox` text is an abbreviated preview, not
  full structured content delivered to the model. For a returned exact message ID,
  call `{"op":"message","id":"EXACT_ID","offset":0}` and follow `nextOffset`.
  The native text contains the actual JSON-escaped chunk, stable fingerprint,
  Unicode-codepoint offsets, total codepoints/UTF-8 bytes and end indication.
  Each chunk's serialized body is at most 512 bytes; existing 2 KiB visible/32 KiB
  whole-result limits are unchanged. `complete:true` means **end reached**: a
  suffix-only read is not the whole body. Reconstruct contiguous chunks under
  one fingerprint before treating it as fully read. There is no automatic ACK.
  This read-only operation requires the same exact caller/scope/native read
  permission as ordinary reads; inaccessible IDs disclose no body. Abbreviated
  lists expose a separate summary continuation so unseen records are not skipped.
  A real DeepSeek trial first reproduced the old 120-character-only result; the
  parent subsequently read the same 745-character probe in two native chunks.
  Recipient-side model retrial is recorded separately in [acceptance](ACCEPTANCE.md).
- **Model-visible ownership:** `read` renders active claim IDs, recorded owners
  and path counts even when no messages exist. Claims paginate independently in
  insertion order (at most two per page) with `claimsAfter`; retain original
  message filters/cursors. Released prior claims remain usable cursor anchors.
  For an observed claim ID, `{"op":"ownership","id":"EXACT_ID"}` reads one
  JSON-escaped literal-path chunk, with optional `pathIndex`/codepoint `offset`.
  Follow `nextOffset`/`nextPathIndex` under one fingerprint; `complete:true`
  means end reached, not proof earlier paths/chunks were read. Active/released
  snapshots omit release evidence explicitly, and never grant edit authority.
  Existing 512-byte escaped chunks/2 KiB visible/32 KiB full-response guards remain.
  Large claim pages provide a message-budget recovery cursor; abbreviated message
  summaries never skip unshown records via the raw page cursor. Read-only native
  parent and actual DeepSeek recipient observations are in [acceptance](ACCEPTANCE.md#actual-ownership-visibility-failure--2026-10-30).
- **Inbox is a view, not another queue:** `inbox` returns messages addressed to
  the native invoking session, unread by default. It derives exact counts from
  the bounded durable store, not from OpenCode's consumable delivery queue.
  Reading never ACKs, deletes, accepts work or wakes a session. Explicit `ack`
  means seen-only. `unreadOnly:false` includes acknowledged incoming messages.
  Stable message cursors survive an ACK between pages; a restart retains unread
  state. Pending/mailbox/unknown/admitted transport state remains visible separately.
- [Watchdog](watchdog.ts): registration/deadline/terminal-event observations,
  configurable warnings (10 minutes without reported progress; 45 minutes wall
  time by default), five-second API observation bounds, bounded registrations,
  deduplication and unload cancellation. No polling conversation, automatic
  interruption, retry, generation or reassignment.
  Each assignment has at most one in-flight observation and one coalesced
  follow-up. Busy terminal events are retained, stale-generation results are
  discarded and timed-out observers stay disabled across progress updates.
- [View](view.ts): bounded read-only terminal output, with control characters
  JSON-escaped. Run `node --experimental-strip-types view.ts --help` here for its
  explicit `--worktree`, `--project`, `--state` and optional `--workspace` inputs.
  This is a local-user reader, not an authenticated agent-write interface.

Limits: 8KiB message body, eight recipients, 16 messages per thread, 256 room
messages, 64 claim records, 32 assignment records, 2MiB state, 20-message/32KiB
reads. Raw page payloads reserve 24KiB, human summaries at most 2KiB, and the full
native result at most 32KiB. JSON-expanding legal bodies (for example control-heavy
text) get explicit `bodyTruncated:true` / `bodyBytes` previews so a page can still
advance; full durable content is untouched. Capacity refuses rather than silently
deleting history. Claims and
assignments remain retained after release/monitor stop. No background retention
job is installed. Use stable IDs; conflicting reuse fails. Inspect claims before
accepting a truncated view as complete ownership coverage.

## Prerequisites and activation boundary

**Activation is refused.** There is no approved `plugins` entry and no supported
way to re-enable this package: both loader entrypoints throw the retirement
error. `activation-preflight.mjs` remains only for read-only inspection of source
identity, pinned dependencies, historical state permissions and any stale config
reference; it always exits nonzero with `activationPreflight: "blocked"` and
`proposal: null`. Keep the historical `.session-coordination/` (or older
package-local `local-state/`) data private and untouched unless its deletion is
separately authorized. User-approved global skill-source registration is a
separate concern.

## Verification and honest limits

Prerequisites: Node 22.6 or newer, Linux `/usr/bin/flock`, scratch files under
`/tmp/opencode`, and the package-local lock (pins `@opencode/plugin` 2.1.1, AJV
8.20.0, TypeScript 5.9.3, Node declarations 24.12.2 and the exact TUI
declarations). Provision the locked development dependencies without lifecycle
scripts, audit, or funding requests, then run the bounded checks:

```bash
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/ --cache=/tmp/opencode/npm-cache --userconfig=/dev/null --globalconfig=/proc/self/fd/9 9</dev/null
npm test
npm run typecheck
```

The test command has an external 60-second deadline and three-second kill
grace; tests have ten-second individual bounds. Typechecking has a separate
90-second bound because the actual SDK/declaration graph can be expensive. The
pinned `@opentui/core` 0.6.6 declares Node `>=26.4.0`, above the observed Node
22.22.2 source-test runtime, so tests and typechecking do not establish TUI
execution, rendering, or activation.

The initial 2026-10-31 child return reported **161 source tests: 155 pass, 6
fail**, exposing pre-retirement instruction expectations in
[protocol-docs](test/protocol-docs.test.ts). Parent reconciled those expectations
with the approved inbox removal, retaining all eight distinct provenance,
authority, receipt, permission, transport and ownership contracts and normalizing
harmless line wrapping. Independent parent verification now passes **25 focused
and 161 full tests**, zero skips, plus strict TypeScript 5.9.3 with library checking
enabled. The initial six failures remain historical, not erased or skipped. The
retired-entrypoint tests prove the server and TUI setups touch no context,
register nothing and create no state; the activation-preflight tests prove no
config proposal is emitted and existing config is never rewritten.

Passing these tests does not establish live loading or behavior in any running
client. Current package-local outcomes are recorded in
[source readiness](READINESS.md); [acceptance](ACCEPTANCE.md) records the
retirement and retained historical evidence; [audit findings](AUDIT.md) retain
failed-before/fixed-after security regressions.


## Retained historical policy, RPC and TUI source

[Policy source](policy.ts) and server enforcement implemented Off, Inbox-only
(default), and Steer-running before retirement. Idle wakeup was separate and
default-off. Project defaults and at most 64 exact-chat overrides shared the
room store, with revision-checked updates and optional eight-sender allowlists
(`null`: any scoped sender; `[]`: none). The model tool only read its effective
`policy`; it could not change it. Settings paths still require native read/edit
permissions. Authenticated same-user/API access is **not** proof that a human
invoked settings.

Actionable question/reply/ownership delivery uses the enabled recipient policy;
notice/status inputs remain mailbox-only even when wake is enabled. Native permission
denials remain binding. Before uncertain admission, delivery pins mode, resume,
policy revision, time and the immutable envelope hash. Retries retain the same
native ID/text/transport; policy upgrades never upgrade a parked input. Current
revocation blocks a retry and retains unknown state, rather than resending a
disallowed wake. Policies cannot retract already admitted native inputs. Policy
and session metadata checks are not transactional with native admission: a racing
change after the last check remains a same-user/API trust limitation.

Steering reserves a persistent per-recipient budget across senders/restarts:
default four, configurable 1–16, per 60 seconds. Unknown attempts consume a
reservation. Rate refusal leaves the message pending; it never silently parks
actionable guidance. Legacy uncertain passive deliveries cannot gain steering.
The native `steer,resume:false` no-new-execution contract still needs live
acceptance; pending-item PATCH steer can wake and is deliberately not used here.

The inspected SDK supports a dedicated Ctrl+P palette command/dialog, but has no
extension point for adding fields inside the built-in Open settings page. Do not
invent ignored `cli.json` keys or claim that exact native-page placement works.
Before retirement, [tui.ts](tui.ts) registered **Cross-session communication
settings** in the palette without rebinding Ctrl+P. The [controller](settings.ts)
read the freshly validated selected chat's server policy, edited
project/default or chat override, mode, separate idle wakeup, exact sender
allowlist and 1–16/60s budget, confirmed scope and performed revision-checked
save plus readback. Escape/cancel wrote nothing; route changes, unload,
unavailable companion, native denial and revision conflicts failed without
automatic retry. Other settings/sidebar/commands were not replaced. The
[RPC](rpc.ts) exposed policy read/update and separate recipient-scoped inbox
read/seen-only/assignment-owner facts; it could not send peer messages or accept
work. The native communication tool could not edit recipient policy.
Authenticated same-UID/API callers remained inside the explicit trust boundary.

The package no longer exports an RPC subpath. It exports only the server and TUI
loader entrypoints, both of which refuse activation; no native inventory
registration is claimed or expected for this checkout. Historical records of
earlier activation and live mailbox-only delivery describe the removed feature,
not the current package.

## Global skill visibility and queued-message fix

The skill is independent from this package. On 2026-10-27, API inspection
confirmed it was present here but absent in the documentation and Tailscale
locations: the active global config had no shared `skills` source, and deployed
bundles were older. Canonical guidance now gives exact `delivery`/`resume`
combinations, awaited-reply handling, same-input activation and safe-boundary
pending semantics. Passive no-action notices intentionally do not wake chats.

Use the bounded [skills-only deployer](../../scripts/deploy-global-skills.py) to
preview or register the complete canonical bundle globally without replacing
models, permissions or plugins:

```sh
python3 -B scripts/deploy-global-skills.py
python3 -B scripts/deploy-global-skills.py --apply
```

Run these from the repository root. It discovers the active global config path,
requires strict JSON (refuses commented JSONC), preserves existing skill sources,
backs up next to the config, compares before atomic replacement and verifies
readback. Preview and repeat apply are no-ops. The advisory lock does not prevent
every hostile/noncooperating editor race. Rollback is a separately approved
restoration/removal of only that source entry, not deletion of skill bundles.
Current global registration was user-authorized and verified through the native
skill list at three locations without a restart. It does not activate this
package or prove every old model turn has loaded the revised instructions.

Important boundaries:

- SDK 2.1.1's plugin SessionDomain does **not** expose the HTTP active-session
  method, despite its presence in the service API. The [observer](native-observation.ts)
  feature-detects that actual method using the public client contract. Without it,
  foreground stays **unknown** with basis `sdk-unavailable`; saved outcomes remain
  historical. With it, the observer validates a maximum 1,024-entry native running
  map and exact selected scope before/after lookup, with a five-second aggregate
  deadline. `native-active-snapshot` identifies foreground evidence only. This
  response-validation cap is not an upstream transport/allocation cap. Preparing
  a native bridge does not ship or activate it.
- A warning bounds the coordinator's wait; it does not prove the child stopped.
  Automatic interruption/retry is intentionally absent because foreground idle
  cannot rule out background tools or descendants. An external command timeout
  likewise needs verified descendant cleanup before ownership changes.
- Monitoring is explicitly registered. Persisted assignments are reconciled on
  the owner's or worker's next `status` call after plugin restart, not by waking sessions.
  Each explicit status checks current worker-read permissions before returning
  cached or in-flight evidence, updates the permission context for subsequent
  observation and refreshes the sample (coalescing concurrent reads).
  Either participant must have current read permission for both owner and worker.
  Timeout/error disables automatic reinspection for that in-memory registration;
  explicit refresh cannot revive it. Failed observation clears the old sample;
  it does not accumulate requests when an adapter ignores cancellation.
- Meaningful progress is a **reported evidence change**, not independently
  verified completion. Repeating the same evidence does not reset the clock.
  Terminal events are evidence for the parent, never automatic acceptance.
- Native permissions are reasserted before observer reads. A genuine pending
  permission is distinct from a deadlock; the caller's bounded wait does not grant
  permission or imply that an uncooperative underlying adapter was cancelled.
- Native inbox transport calls peer input `user`. The explicit envelope is a
  warning, not cryptographic proof. Verify the matching channel record; do not
  trust an arbitrary pasted header or caller-provided inbox metadata as origin.
- Same-user hostile filesystem replacement and atomic session moves during native
  prompt admission are not eliminated. Checks fail closed on observed mismatch;
  fresh scope readback is not a transactional move/admission guarantee.
- Existing/manual ownership registries are not automatically imported. Consult
  them before claiming paths; old missing workers are not freed by this package.

## Node-command investigation — 2026-10-27

The requested general agent found three service-parented Playwright MCP Node
servers sleeping in `ep_poll` at 0.0% CPU. The parent independently rechecked
those PIDs and the launcher's `exec` path. Long-lived connected stdio servers are
not, by themselves, hung commands. The **specific reported stuck invocation
remains unidentified**; no process kill, restart or launcher fix was justified.
No generic promise that every command/subagent now terminates is made.

## Should children control goals?

Recommended: scoped read-only goal context, **no goal-management command**.
Children need their assignment, relevant acceptance criteria, ownership and
source revision, not unrestricted access to every session's goals. If the native
read API cannot enforce that scope, supply a bounded parent snapshot instead.

Full child access could overwrite shared plans, reorder tasks, stop/resume
automation, create an independently self-continuing goal, or declare unverified
completion. A revision guard prevents stale writes, not an unauthorized decision.
No visibility at all reduces alignment and increases context requests. Children
should instead submit structured progress/evidence/blocker reports; only the
parent independently accepts work and writes plans or lifecycle state. Do not
make parent disappearance an automatic promotion rule.

This repository's parent-only rule is instructional guidance, **not verified
runtime denial**. Tool visibility, slash commands, shell/API alternatives and
effective native action IDs require a separate enforcement audit and permission
approval. No goal access, global permission or other session's goal was changed
for this evaluation.
