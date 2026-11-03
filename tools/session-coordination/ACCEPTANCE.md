# Coordination requirement-to-evidence checklist

Goal `464c3066-1eb6-452a-bbe5-4c138dc9e899`, parent audit on2026-10-27.
Goal tools hold the authoritative plan; this is evidence, not a goal export or
completion declaration. Deliverables are the portable skill, scoped durable
channel/native view, observation-only watchdog, recipient policy/Ctrl+P controls,
regressions, actual live acceptance and bounded operating-procedure notices.

## Feature retired — 2026-10-31

The user explicitly removed the custom agent inbox/mailbox, superseding earlier
retention of the optional mailbox feature. Canonical source now has two refusing
loader entrypoints: [index.ts](index.ts) and [tui.ts](tui.ts) throw the retirement
error before touching context, so setup registers no coordination tool,
message/inbox/delivery/receive-settings RPC, TUI command/keymap/dialog, event
subscription, poll or context hook, and performs no state read/write or network
request — even with an unsafe `stateDirectory`. `package.json` no longer exports
an RPC subpath.

Source evidence from this package on 2026-10-31:

- Initial child `npm test`: **161 tests,155pass/6fail**, exposing old
  [protocol-docs](test/protocol-docs.test.ts) expectations. Parent reconciled
  obsolete custom-mailbox/UI policy assertions with the approved removal while
  preserving eight separate provenance/authority/permission/receipt/transport/
  ownership boundaries and harmless line-wrap tolerance. Independent parent
  **25focused/161full** tests pass, zero skips; the six initial failures remain
  historical, not erased or converted into earlier success.
- `npm run typecheck`: strict TypeScript 5.9.3 with library checking passes.
- [normal-chat-isolation](test/normal-chat-isolation.test.ts) proves zero context
  access, zero state creation and zero network calls for both entrypoints, and
  that the manifest exposes only `./index.ts` and `./tui.ts`.
- [activation-preflight](activation-preflight.mjs) is read-only, always returns
  `activationPreflight: "blocked"` with `retirement.activation: "refused"` and
  `proposal: null`, and reports a still-present retired entry as a blocker. Its
  tests prove the selected config is never rewritten.

Retained inert for evidence: service, store, tool, result, policy, RPC and TUI
sources plus the distinct store-lock, message-body, path-ownership and inbox
security regressions. They are not imported by either loader entrypoint and are
not evidence of loaded registration. Stored `.session-coordination/` history is
preserved. The parent owns the canonical config plugin entry, skills, shared docs
and stored state; this package work changed none of them.

Limits: source tests and strict types do not prove absence in a running client.
The parent must verify loaded inventory after its config change. No service
restart, reload, activation, deployment or credential change was performed here.
Parent subsequently observed the package absent from exact-location server
inventory and required health passing without issuing a reload/restart. A current
own-TUI capture failed `NameHasNoOwner` despite successful window metadata;
no key/input was sent and actual palette/dialog removal remains unverified.

## Canonical runtime reconciliation — 2026-10-30 UTC

The older inactive/missing-dependency statements below describe their dated
checkpoints, not the current runtime. The retained
[deployment record](../../docs/deployments/2026-10-29-goal-plugin.md#inbox-follow-up-escaped-regression-and-containment)
already records project activation, the outside state-path repair/restart,
successful native post/read/inbox/mailbox-deliver/seen-only ACK/settings reads,
and a mailbox-only notice leaving an approved recipient idle with an empty native
pending queue. Those accepted bounded outcomes are carried forward, not rerun or
replaced by source fixtures. Optional visible dialogs, the full policy/participant/
restart matrix and execution-effective/native-row behavior remain unaccepted.

Fresh read-only verification resolves exactly one active
`computer-use.session-coordination` at
`/home/james/repos/computer-use/tools/session-coordination/index.ts`, with advertised
server/TUI/RPC parts. The selected caller's native session ID, project and exact
location agree. Its model-facing policy/inbox calls succeed with peer-origin and
seen-only disclaimers. Settings RPC reports inherited revision0, inbox-only,
idleWake:false. The current four unread messages include legacy pending/mailbox
metadata; reads do not convert pending to delivered, seen or accepted work.

A bounded 12-call authenticated local API trial reconstructs the unread set via
limit1/cursor pagination and observes unchanged IDs/receipts/ACKs/counts and policy
on the final sampled reads. Both settings and inbox read RPCs refuse two malformed
session IDs that fit the length-only native schema. Their generic HTTP500
`rpc.internal` result does not expose the internal validation stage; it is not a
native permission-denial or no-effects trace. Reviewed service code validates
syntax before permission/session/store access; do not weaken schemas to avoid
the refusal. Canonical config/source hashes and file identities remain unchanged.

Redacted metadata, commands/times/output hashes, assertions and the exact harness
snapshot are preserved at
`~/Documents/computer-use-coordination-read-20261030-Iy861T/receipt.json`.
No message bodies/private conversations/raw store or credentials were saved.
No write/deliver/ACK/policy update/peer wake/restart/activation ran in this trial.
Advertised TUI features and tool text are not visible dialog/client acceptance;
sampled equality is not an atomic snapshot or proof of all peer quiescence.

### Mixed-result source follow-up — after the read-only trial

The trial above captured the earlier `result.ts` identity; it is not evidence of
this later source change being loaded. A real-store/synthetic-native-boundary test
reproduced a result with one mailbox and one admitted recipient mislabeled simply
`mailbox`. A second test failed because receipt counts were absent. The presenter
now emits explicit status `mixed` for that all-final combination and counts
admitted/mailbox/pending/unknown receipts. Unknown wins over pending, and pending
wins over the all-final summary. Homogeneous statuses remain unchanged. Replay
does not call the fake prompt twice, the actual output schema accepts the new
status, and existing output budgets/peer/seen-only disclaimers are retained.

Full package **134/134**, zero skips, and actual strict/noEmit/library checking
pass. The reviewed fingerprint for `result.ts` alone was refreshed after full-file
review and fresh identity/hash checks; all other 26 reviewed source hashes match.
No real delivery/ACK/policy update, reload or restart was requested to test this
source fix. Actual mixed native/client presentation and the remaining live matrix
still need their own observation/authority.

## Actual ownership visibility failure — 2026-10-30

Parent reserved exact worktree-relative
`.opencode/plugins/goal-docs/automation-settings.ts` with native claim
`goal8915-parent-ownership-observation`. This is a real temporary source reservation,
not a mailbox fixture, source edit or authorization for another writer. The claim
remains parent-owned until explicit release, never a watch deadline.

Fresh real DeepSeek Flash high child `ses_e71304380ffehaTiwzqcgDmz8S` was assigned
only read/policy observation and normal bounded startup reads. Parent independently
verified exact parent/project/worktree and inspected10projected assistant messages
in67,416bytes under1MiB. Three completed direct native coordination calls show:

| Native assistant message | Call / observed result |
| --- | --- |
| `msg_18ed09fde001A1kFz570fEnAHI` | policy: inherited revision0/inbox-only/no idle wake |
| `msg_18ed0c822001zL2Bacm4kNLXao` | read limit20: only `Showing 0 messages`, no claim/owner/path rendered |
| `msg_18ed0f388001Z4Q2eXn7T3zrNg` | read unknown harmless thread/limit5: same visible content, no claim disclosure |

Final `msg_18ed14465001GET3lUqwwK4woh` correctly reports **ownership unknown, not
unowned**, does not infer the parent is owner from the assignment, and declines
edit authority. Parent source review confirms the seam: service returns active
claims structurally but native `content` omits them. This is genuine negative
model/native visibility evidence, not a full synchronization or policy pass.

One additional failed Code Mode attempt guessed unavailable `tools.coordination`
before switching to direct calls; it made no coordination call. Keep this error
and the startup tools in the observation rather than claiming the whole execution
had only three calls. No shell, raw-store/API workaround, source write, claim/
release, post/delivery/ACK, wake, policy change or restart appears in the child
sequence. No raw event replay was captured for this trial; projected native
records are not fabricated into an event export or measured benchmark.

The observation and source children are now terminal/released, watches stopped.
Parent reviewed all four production diffs/new tests and added initially failing
regressions: last short path falsely called whole-claim coverage; claim-heavy
message cursor skipped unshown summaries; valid500-character BMP paths rejected
by an inconsistent byte-based output check. After fixing the validator, the
multibyte case exposed a stranded message page too. The intermediate30/31 failure
for a missing summary hint is retained, not counted as acceptance.

Current source uses read-only exact `ownership` chunks and independent
`claimsAfter` discovery (two claims/page). Literal-path validation matches input/
state rules; all existing byte guards remain. `complete` is end reached, not proof
earlier paths/chunks were seen. Claim/message hints reserve visible bytes, raw
message cursors do not skip omitted summaries, and a claim-filled page supplies a
message-budget recovery call. Parent31focused, additional maximum actor/project/
owner/claim identity boundary and final159/159full tests pass, zero skips;
fresh strict5.9.3/noEmit/library checks pass. No distinct prior test or permission
guard was removed.

### Actual recipient retrial and explicit release

The same real child was explicitly reassigned direct read/policy/ownership only.
Parent verified the native range after prior terminal anchor
`msg_18ed14465001GET3lUqwwK4woh`: four assistant records/45,454acquired bytes
under1MiB, exactly three completed direct calls:

| Native assistant message | Actual result |
| --- | --- |
| `msg_18ee8c16a001CFLIdezQEKMcgc` | read discovers exact parent claim/owner/path-count with zero messages |
| `msg_18ee8ca860019hHn8DKWg04E7G` | ownership returns active owner, exact50-codepoint literal path and fingerprint |
| `msg_18ee8d6c2001jsrkrnNzsX9h2j` | policy remains inheritedrev0/inbox-only/no idle wake |

Final `msg_18ee8f1a0001JcsjuxOqURKscM` correctly reconstructs the one path and
distinguishes recorded parent ownership from its own absent edit authority. Active
fingerprint: `2ad1526676b377bf6f98290464ee8332811f34a52997c933a4e2d8448a3baab3`.
No source/claim/release/message/ACK/wake/policy/settings or other action call appears
in this bounded retrial. The child released its reassignment; parent stopped its
watch, explicitly released only its own temporary claim, then read the historical
snapshot: releasedAt1793399051832, active:false, fingerprint
`b28cfcde025175c10a6db4ee5987f5ea281d2e21adfebb881be46a5b28728bcc`.
The record/path is retained, not deleted. No activation/reload/restart command was
issued; why new source became callable is not inferred. This closes the narrow
model-visible ownership defect, not GUI/settings/restart/mixed/unknown coverage.

Selected durable evidence:11baseline/current source/test/hash files under
`/home/james/Documents/computer-use-native-host-20261029/ownership-visibility-20261030-rivnua67/`;
`receipt.json` SHA256:
`b11e3bd4114809dd247c5da6121faaf543c566f98231f4983448db9fa4eb4a66`.
This is not a full checkout or runtime/room-state backup. Fresh required offline
CI8/8 and health pass after reconciliation. Coverage retains75IDs/10lanes and
zero input/mapping/review errors; the original483f6755 archive-plan mismatch still
causes exit1 and freshness is unverified. Only the four independently reviewed
model/service/tool/result source fingerprints were refreshed, never archive bytes.

## Current-goal read-only acceptance preflight — 2026-10-30

Goal `8915ecd8-7a22-4f8c-b494-433d29e38f3a` retains all original requirements;
this preparation neither completes its selector phase nor reopens an older goal.
Parent accepted the lock source fix (5focused/138full/strict-library checks) and
method guidance (45independently rerun source contracts). No reload of these
later source identities is established by an active plugin listing.

### Exact participants and native location

Fresh authenticated `GET /api/session/{id}` reads confirm this root parent
`ses_e78fdcc9affeNOlKMRek7Yobo3` and its four children from the current
[ownership registry](../../docs/session-consolidation-2026-10-29.md#current-phased-goal-and-child-ownership--2026-10-30).
Every child has that exact `parentID`, project
`3e1e6f73bded105bf412f16b6aea04e05f44d605`, directory
`/home/james/repos/computer-use`, no archived timestamp and saved
`deepseek/deepseek-flash#high`. The parent remains `openai/gpt-6.1-sol#high`.
No model was changed. Native ownership RPC returns7assignments, none truncated,
all with `stoppedAt`; worker reports explicitly released their paths. One native
active-map sample contains only the parent. Neither observation proves all
descendants/processes stopped or authorizes reusing terminal children as trials.

Use the exact location header from the pinned client/server contract:
`x-opencode-directory: %2Fhome%2Fjames%2Frepos%2Fcomputer-use`. An initial unscoped
plugin read resolved `/home/james`, not this worktree, so its absence result was
rejected as irrelevant. The corrected location-bound read confirms one active
canonical `computer-use.session-coordination` with server/TUI/RPC advertised.
It does not confirm TUI attachment or the loaded module's content hash. The
settings **read** RPC returns inherited revision0, inbox-only, idleWake:false,
allowedSenders:null, steerLimit:4. No update RPC was called.

Read-only activation preflight confirms the exact config entry is already
present (no proposal), private state mode0700, compiler/SDK pins, and
`ready-source`/`preview-ready`/`actionTaken:none`. Selected config SHA-256 is
`903508e66ba335bf72e55e9c26c9a955694c69d70bf1cf2cdd7dfbc07d580722`;
the preflight source-tree digest is
`6dd1a1cd3737ea942e0fafb307115df40bcc148d7c9323dd127d16eea1bca07f`.
This digest covers the preflight's selected package files, not the loaded server
module graph, and predates this acceptance-document update.

### Remaining actual-acceptance matrix

| Surface / case | Established evidence | Required next observation and gate |
| --- | --- | --- |
| Native rows and full peer bodies | Tool text has actor/project/origin/seen-only disclaimers; lists are120-character previews. Later real DeepSeek retrial below verifies exact `message` chunks, complete745-character reading, explicit ACK and unread0. | Visible native rows/dialog rendering and broader comprehension remain required. Full-body tool access is now observed, not inferred from invisible structured output; it does not imply GUI acceptance. |
| Agent inbox | Source registers palette **Agent inbox** and `/agent_inbox`; RPC pagination/unread and explicit seen-only ACK have retained live evidence. | Open the actual dialog on an approved disposable participant; inspect unread/filter/pagination/body and explicit Mark seen, then verify durable receipt. Closing must not ACK. GNOME bridge unavailable; no blind input or unrelated composer draft. |
| Settings | Source registers **Cross-session communication settings**, separate from built-in Open settings. Revision0 read works. | Observe view-only dialog first; cancel, chat switch and conflict/no-retry paths. Any policy write retains separate operator/security authority, exact target/revision, readback and rollback. |
| Inbox-only / idle participant | Retained accepted mailbox-only delivery left an approved idle recipient's native queue empty and did not wake it. | Carry that result forward. A new model trial must name a fresh bounded DeepSeek child and exact harmless scope; terminal children and unrelated roots are not automatic participants. |
| Off / allowed senders / native denial | Source policy and denial-before-effects regressions pass. | Actual operator-approved policy transitions and permission negative paths, retaining old readable inbox and unchanged inputs. No model-facing policy-write operation or permission grant is implied. |
| Running steer / separate idle wake | Source dispatch pins explicit policy/transport and finite rates; notices/status remain mailbox-only. | With exact participant and policy authority, observe native running admission at a safe boundary and no unintended idle wake. Test idle wake only under its separate approval; foreground active-map snapshots cannot guarantee no wake race. |
| Mixed receipts | Parent accepted source `mixed` plus admitted/mailbox/pending/unknown counts. | Actual all-final mixed result in installed native view, using exact allowed recipients; preserve each receipt. No synthetic all-final result is promoted to live acceptance. |
| Unknown admission / replay | Source pins stable ID/envelope/transport/revision across restart; unknown outranks pending/final. | Safely obtain genuine uncertain admission, reconcile exact original ID without new-ID replay or forced service failure. No available authorized fault-injection/live participant path established. |
| Restart / unread / ACK | Source restart/concurrency cases and earlier deployed operation receipts retained. | Shared restart requires its own exact authority/quiescence and preservation/rollback; afterward observe same-ID dedupe, unread/ACK and policy persistence. No restart occurred here. |
| Model provenance / ownership / task preservation | Source guidance distinguishes peer text from user authority and explicit owner from thread starter. | Real authorized child run must consume the actual mailbox result, retain its task/method/goal boundaries and report outcome. Saved model preference is not execution-effective metadata or measured comprehension. |

Preparation used only native metadata/plugin/settings-read/ownership reads and
the read-only source preflight. No peer body/private transcript was saved; no
post/deliver/seen/policy update, wake, new participant, activation, restart,
permission change, raw-state edit or process termination occurred. The already
accepted bounded mailbox tests above were not repeated. Full live acceptance
remains open rather than inferred from138source tests or advertised TUI features.

### Real DeepSeek body-visibility failure — subsequent bounded trial

After the read-only preflight, the parent explicitly assigned the same released
DeepSeek child `ses_e71b98b08ffeXaek3TBpAsTXYF` a new read-only observation. It
posted one harmless synthetic notice `goal8915-native-body-probe-1`, with an
end marker beyond120characters, then resumed the child through the authorized
asynchronous subagent mechanism. No deliver or policy update was used; parent
post/watch operations are real mutations and are **not** part of the earlier
no-write preflight. The child had no file or goal-management authority.

The child reported only a120-character `preview`, no full body, length or usable
body continuation. It did not guess the unseen marker or ACK. Parent independently
read a bounded six-message native history page, inspected only three completed
coordination tool records and verified their recorded executed model was
`deepseek/deepseek-flash#high`:

| Native message | Actual call | Persisted model-visible result |
| --- | --- | --- |
| `msg_18e5624cd001WXXIQW3HZpSGLA` | `policy` | Inherited revision0, inbox-only, idleWake:false |
| `msg_18e5630580016ETcda4KULay5L` | `read`, exact thread, limit1 | One record, pending/unseen,120-character preview only |
| `msg_18e563f0a001acqH2f3ONkA5Bf` | `inbox`, exact thread, limit1, unreadOnly:true | One unread/matching record, same preview only |

Both read records have `metadata.truncated:false` but no full message body.
That metadata describes host output truncation, not body completeness. Source
`result.ts` returns full structured `output`, but the pinned core's
`tool/runtime.ts` uses explicit `content` when provided; the native recorded
tool-success content matches the abbreviated text. Thus full-body visibility is
a **reproduced native/model failure**, no longer just an untested assumption.
This is not an empty mailbox, an authenticated human instruction, a model success
or a no-model inbox acceptance fixture. No private text or reasoning was saved.

The read-only assignment is terminal/released and its watch stopped. Goal
revision15 schedules a bounded source correction on exact model/service/tool/
result and focused test paths: an additive exact-message chunk reader, escaped
native content, strict offsets/scope/permissions and unchanged2048content/
32768response/8192body limits. Existing preview/list semantics stay separate.
Source correction and a later authorized loaded-schema/model retrial remain
pending; no deployment/reload/restart is inferred from the source assignment.

### Independently reviewed body-reader source and current native calls

The child released its exact source/test scope. Parent read the complete four
changed production files and focused tests, retained the existing limits and
replaced the nested input `anyOf` workaround with a plain13-operation `oneOf`.
The obsolete12-branch assertion now checks actual operation identities instead.
Two parent regressions first failed: reading only a suffix said "complete message
body", and a final structured page could hide records4+without a visible summary
continuation. Those are corrected, with distinct summary versus page cursors.
Additional coverage reconstructs an8192-byte all-control body and rejects
out-of-budget output totals. The full147-case source suite passes; after an
initial unknown-typed test-property diagnostic, the explicit type cast and strict
library rerun pass. No failed check is counted as a pass.

The new `message` operation then became directly exposed/callable in this
session. The parent issued **no activation, reload or restart command** and does
not infer the loading mechanism or every client's loaded content hash. Two actual
native calls on the same original harmless notice returned offsets0..510 and
510..745, total745codepoints/745UTF-8 bytes, fingerprint
`502b3c4147f2609a46d048ce41efb75c619a2ed8ffb319a20868c4609ca94537`, including its
original unseen end marker. The final chunk explicitly says earlier codepoints
are omitted rather than calling the suffix a whole message. These are observed
native content results, not source-only fixture output; they do not prove visible
GUI rows, restart persistence, every policy case or general agent comprehension.

Revision17 explicitly assigns the original actual recipient child a fresh native
retrial on that same message, with no new post/delivery/policy/file/goal effects.
It may record one exact seen-only ACK **only after** reading every contiguous
chunk under the same fingerprint, then one filtered unread readback. That trial
is now independently verified below. The preceding negative result remains
preserved, not rewritten as if it had succeeded.

### Recipient DeepSeek native retrial — independently verified

The recipient returned terminal/released. Parent inspected a bounded ten-message
native page and extracted only six completed tool records from this assigned run,
with recorded executed model `deepseek/deepseek-flash#high` in every record:

| Native message | Call / actual result |
| --- | --- |
| `msg_18e6a0802001BGK37YRYPC9Xsx` | Policy remains inherited revision0, inbox-only, idleWake:false |
| `msg_18e6a1cd8001O3PfTTlgtQUTOL` | Exact thread read finds the pending/unseen probe; preview explicitly routes to `message` |
| `msg_18e6a3568001cMYtgi32X1gmbJ` | Exact body offset0 returns codepoints0..510, total745, next510 |
| `msg_18e6a558a001sCmnTf0KZ85ALt` | Exact body offset510 returns510..745 and the actual terminal marker, end reached with suffix disclaimer |
| `msg_18e6aaa79001z5NphbPi9SFc3W` | Exact notice ACK returns `seen-only`, not accepted work |
| `msg_18e6ae1d4001frrRaM6OtYnezj` | Same-thread unread view returns0unread/0matching |

Both chunk records carry the fingerprint above and745total UTF-8 bytes; all
offsets are contiguous. The ACK result does not expose a fingerprint, so stability
is verified **across the two chunks**, not asserted from the ACK response. The
child final report identifies the actually observed original marker. This proves
bounded recipient-model content access and explicit seen/unread behavior on this
one real notice; no read-only preview was itself treated as seen. Parent stopped
the retrial watch after release. No new post/deliver/steer/policy/permission/
activation/reload/restart action occurred in this retrial. The only child mutation
was the exact authorized seen-only ACK.

The final source rerun passes147/147 with zero skips, strict library types pass,
and repository health passes. Source fingerprints were refreshed only for the
four fully reviewed production files. Native rows/GUI dialogs, broader policy/
mixed/unknown/restart outcomes and other goal lanes remain unfinished.

## Historical parent source review — 2026-10-28

The68-row successor coverage now retains C01–11/T01–05 explicitly; optional
loading does not make this historical priority optional. Current parent goal is
`50e7f33e-103e-4385-855e-ebb56845b277`, not a reopened464c/0d96goal. All source
preparation here is read-only except this acceptance record. No message, claim,
policy update, model wake, runtime state directory or plugin activation occurred.

Fresh `npm test` with the documented test-only AJV resolution root
`COORDINATION_TEST_DEPENDENCY_PACKAGE=/home/james/repos/computer-use/tools/chatgpt-connector/package.json`
passes **65/65**, zero failures/skips. Parent inspected tool-bound caller/native
permission wiring, stable pinned delivery/seen-only ACK, durable unread view,
claims, policy/settings/RPC and observation-only watchdog. Tests exercise real
serialization/files/flock while native permissions/session admission/UI are faked.
They do not establish actual rendering, no-idle-wake delivery or comprehension.

Fresh strict checking is **not accepted**: the package's configured command exits127
because its local compiler is absent. Selecting the already installed TypeScript
5.9.3/SDK declarations in resource-monitor through task scratch, retaining
`strict:true`, `noEmit:true`, **skipLibCheck:false**, reports two external TS7016
errors for missing `json-schema` declarations in `@ai-sdk/provider`. No own-source
diagnostic was reported, but the check failed. The older19-root pass below remains
historical. No package install, fabricated shim, library-check bypass or runtime
dependency change was made. Reprovisioning verified declarations is a separate
prerequisite before renewed strict-library acceptance.

The exact-location native plugin inventory still contains **no**
`computer-use.session-coordination`. One supported active-session snapshot showed
only the current parent running. This is foreground evidence, not proof every
historical descendant/background tool stopped. Export worker
`ses_e82458cbdfferAj34qmm7Hyz5r` still owns its reserved
`docs/goal-docs-verification.md` pending independent report acceptance; this review
does not edit or release it. Separate activation/client/participant gates below
remain intact. No outside repository or Tailscale operation was adopted.

## Withdrawn activation delta — never applied (superseded 2026-10-31)

The feature is retired: do not apply this delta and do not re-add the entry.
`activation-preflight.mjs` now refuses and emits no proposal. The text below is
retained only as historical record of what was once prepared.

Reviewed against source package exports and official V2 config/plugin
documentation. If separately authorized for this exact checkout, the prospective
**single additive element** in the existing project `plugins` array would have
been:

```json
{
  "package": "./tools/session-coordination",
  "options": {
    "stateDirectory": "/home/james/repos/computer-use/tools/session-coordination/local-state"
  }
}
```

This is not a replacement configuration, authorization or loader acceptance.
Preserve unrelated settings; select the actual configuration layer before any
apply. Package `exports` provided server, TUI and RPC parts; one approved entry
selected those parts, not an invented native settings page. Server setup required
the explicit in-worktree state directory; source `.gitignore` excludes it. Do not
precreate it or chmod paths as a hidden preview.

Before apply: verify exact config/source hashes, owners and lock/state provenance;
back up that selected config next to itself and review the bounded semantic delta.
Then require separate authority for activation and harmless exact participants.
After apply: verify native registration, visible room/structured output, settings
readback, Off/Inbox/Steer, restart/stable-ID/unread/ACK, running/idle and no-unapproved-
wake outcomes. Keep admission, seen ACK and accepted/completed work separate.
Source passes or a generic native send cannot substitute for that chain.

Rollback proposal: remove only the approved array element from the same config,
preserve unrelated edits and private room state, verify unloading/disposal through
supported inventory/client observations and retain historical claims/messages.
Do not delete room.lock, local-state or sessions, interrupt workers, downgrade
security or infer stopped descendants from observer cancellation. A shared
restart/logout or exact data removal would need its own authority. Neither
activation nor rollback was executed by this preparation.

## Original completion criteria

| # | Deliverable / artifacts | Verified evidence and remaining gap |
| --- | --- | --- |
| 1 | [Envelope/model](model.ts), [service](service.ts), [provenance tests](test/channel.test.ts), [skill](../../.opencode/skills/cross-session-coordination/SKILL.md) | Escaped hostile/quoted/mixed user-peer bodies remain peer-context with native sender; unsupported goal/interrupt/settings operations refuse. Not proof a live model preserves its task. |
| 2 | [Portable guide](../../.opencode/skills/cross-session-coordination/README.md), [protocol](../../.opencode/skills/cross-session-coordination/references/protocol.md), catalog/adjacent routing | Current complete skill body discovered at three exact locations; global source registration verified, no routine questions or child goal authority added. Native discovery is not every old turn reloading it. |
| 3 | [Tool](tool.ts), [structured result](result.ts), [inbox tests](test/inbox-result.test.ts), [terminal view](view.ts) | Threaded post/read/reply/seen-only ACK, claims/warnings and bounded recipient unread view share one store. Actual AJV covers all12operations. Native client rendering and full-chain user-visible room remain unverified. |
| 4 | [Scope/permissions](service.ts), [private store](store.ts), channel/policy tests | Native tool-bound sender, exact canonical directory/project/workspace, moved/archived recipient refusal, no caller sender fields and native deny-before-effects. Default exact-worktree room; other-worktree/project membership is not implemented or implied by separately authorized direct notices. SameUID/API and move/admission race limits remain explicit. |
| 5 | Store/model/service, concurrency/inbox/policy tests | Stable IDs, immutable per-recipient envelope hash/transport/revision, unknown-before-send, scoped seen state, restart and concurrent ACK/delivery, bounds and no auto-reply. Actual native stable-ID admission is an adapter fake; full live uncertain-admission test remains pending. |
| 6 | Claims in service/model, channel/process tests | One overlapping path owner, owner-only release, no age/idle/timeout takeover; committed claims survive owned process crash. Historical/manual owners remain external prerequisites. No automated handover or stopped-descendant proof claimed. |
| 7 | [Watchdog](watchdog.ts), [11 lifecycle tests](test/watchdog.test.ts) | Separate progress/waits/deadlines, finite triggers, one in-flight plus one coalesced observation, generation checks, late-event deduplication, permanent per-registration timeout disable. SDK adapter reports foreground unknown; no background-completion inference. |
| 8 | Service/watchdog refusal paths, skill recovery protocol | No interrupt/retry/transfer API added. Monitor stop retains claims. Safe automated recovery remains unavailable without stop/background evidence and exact authority; interrupt acknowledgement never counts as quiescence. |
| 9 | [Audit](AUDIT.md), package tests, strict SDK checker, repository health check |65package tests pass5.27s; strict19actualSDK/library roots0diagnostics44.02s;34focused catalog/portability/autonomy/goal checks;7real-file global-deployer tests; read-only health passes. Meaningful filesystem/process races and failed-before/fixed-after lifecycle regressions. Live agent/UI evidence still separate. |
| 10 | Operating-procedure notices / native admission receipts | Final procedure rollout is pending. Previous bounded user-requested corrections and Tailscale guidance used verified direct native APIs, not this inactive package. Admission, queue/running snapshot, explicit ACK and adopted work must be reported separately. |
| 11 | Baseline in approved scratch, preservation checks, source ownership | Staged binary patch matches original SHA256`91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805`; project config unchanged. Only global `skills` differs from its adjacent backup. No historical lifecycle, PR2, screenshots, media, commits or pushes changed. Export-audit child receipt is pending independent acceptance, not automatic ownership release. |

## Added steering and queued-message requirements

- [Policy](policy.ts): Off / Inbox-only(default) / Steer-running, separate
  default-off idle wake, project/chat/inherit scope, optional exact-sender list,
  bounded persistent rates and revision conflicts. Model operation is read-only;
  authenticated settings RPC is not cryptographic proof of a human operator.
- **Retired, source retained:** [settings controller](settings.ts),
  [TUI entry](tui.ts), [RPC](rpc.ts) and
  [controller tests](test/settings.test.ts) were a dedicated palette command, not
  an insertion into the unsupported built-in Open settings page. Cancel/unload/
  route move/native denial/no companion/conflict did not silently write or retry.
  The TUI entrypoint now refuses activation and the RPC subpath is no longer
  exported.
- [Skills-only deployer](../../scripts/deploy-global-skills.py) with its
  [seven tests](../../scripts/test_deploy_global_skills.py): user-authorized
  global canonical source registration preserves unrelated settings, references,
  modes and backups. The package was not activated. Current full skill body
  SHA256`90f92d3441bd2d941a13e873036f497bbdc3605cc0e53e5194e284fa9937463b`
  was verified at computer-use, documentation and Tailscale locations.
- Guidance distinguishes actionable/awaited replies (`steer,resume:true` when
  authorized), no-new-execution steering and passive notices. An exact existing
  native pending-item PATCH may wake; never use it as a no-wake guarantee or
  clone unknown/user inputs. This is not an automatic upgrade of pinned delivery.

## Original live gates and later bounded evidence

Read the later reconciliation above before interpreting this original checklist.
Project server/RPC activation and selected native mailbox operations are now
observed; the original full client/participant/lifecycle outcome remains open.

1. Separate authority to load this optional server/TUI/RPC package at an exact
   selected location/state path, with reviewed config diff and rollback. The
   native plugin inventory currently has no coordination registration.
2. Actual native tool registration and visible structured result/room in an
   authorized client, plus read/ACK/unread behavior after absence/restart.
3. Visible Ctrl+P dialog/effective-policy readback and harmless consented native
   delivery into approved running/idle participants: no idle wake, separately
   enabled wake, same-ID dedupe and no implicit goal/ownership acceptance.
4. Final notices to freshly verified relevant existing peers, no idle wake or
   unrelated goal changes; exact per-recipient admission versus explicit ACK.
5. Historical backlog reassessment only after this priority; closed goals and
   deferrals are not reopened by a green source suite.

Global skill deployment authority does not supply optional-plugin activation,
security, model-wakeup, publication, commit or push authority. Do not call the
overall objective complete while any required live gate lacks evidence.
