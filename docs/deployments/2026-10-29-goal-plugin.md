# Enhanced goal plugin deployment — 2026-10-29

## Scope and live result

The user explicitly authorized deployment of the enhanced goal plugin and other
ready pending changes. The earlier implementation goal stayed closed; deployment
is tracked by goal `50dd49c6-e25b-4f58-9c7f-6b0f1fab107a` in the requesting chat.
The same active goal now also tracks the subsequently requested inbox repair.

- Running OpenCode: **v2.1.1**, unchanged executable/launcher.
- Active enhanced source: `/home/james/repos/opencode-goal-plugin/server.js`.
- Live commands: `/yolo`, `/goal`, `/pause_goal`, `/resume_goal`, `/checkout`,
  and `/handoff_resume` are present. `/yolo status` executed successfully.
- Settings RPC reports enhanced, project config `opencode.json`, built-in
  unavailable on this host. YOLO RPC reports available; saved/current mode
  remains off until explicitly enabled. Deployment did not toggle it or resume goals.
- Native idle/built-in selection requires stable 2.2.1+; compatibility continuation
  remains selected automatically on the installed host. No binary upgrade was attempted.

## Preservation and rollback

The deployed global configuration differed substantially from the source template.
Only the goal-plugin entries were merged; actual model, permissions, voice,
providers, MCPs, skills and other plugin declarations were retained. Both
non-plugin documents were compared against their backups and match exactly.

Active profile: `/home/james/.opencode-v2-pilot/config`.
The existing transaction helper retains these adjacent backups and receipts:

| Target | Transaction token |
| --- | --- |
| `opencode.jsonc` | `452482b6850b644a6fb238e3acb67108` |
| `cli.json` | `94edfd2650c20944131a8b669be018fa` |

For each token, the profile contains `.mcp-config-transaction-<token>.backup`
and `.receipt`. Restore only after inspecting the exact receipt/current digest
using the existing transaction restore API; do not blindly replace a newer config.
Goal data was copied to the adjacent
`goals.json.backup-plugin-deploy-20261029T192217Z` before global activation.
No raw goal contents or lifecycle were edited for deployment.

Ready command files were deployed with the existing commands-only deployer after
confirming no target-only files would be lost. Backup:
`backup-20261029-152654/commands` beneath the same profile.
No agents directory, model template or permission-rule expansion was deployed.

## Loader and goal-docs integration

Actual deployment exposed an old-host local-directory discovery requirement that
the earlier temporary smoke loader had masked. The package now ships root
`server.js`/`tui.js` plugin entry files plus its root export. The smoke uses the
actual selected directory instead of generating a loader. Both original package
peer-runtime/engine-range tests are retained alongside the new entrypoint test.

Goal-docs keeps its published-release 0.1.67 validation and adds a separate local
identity: one active `local.goal-mode.server`, real absolute nonsymlink package
entry/metadata, actual version 0.1.1 and exact `enhanced-state-v3-1` contract.
The local contract requires v3 state. Bare version 0.1.1, unknown markers,
ambiguous/inactive identities and incompatible layouts are refused. No version
was forged and no task-title module was changed.

Core companion tests pass 57/57; the full companion suite passes 166/166.
An actual scoped plugin inventory resolves the local identity and reads the
current deployment goal with the expected ID/status/revision, without writing it.

## Other ready deployment and held activation

The GNOME bridge deployer verified all seven owned files and changed only
`extension.js` and `input.mjs` at
`~/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local`.
Its adjacent rollback directory is
`.backups/20261029T192241.941691Z-fk66bch6`. Source cases pass 59/59 and deployment
tests pass 6/6. No extension enable/disable, desktop logout or Shell refresh ran.
The new on-disk files are not proof the current Shell has loaded them; a separately
authorized refresh/login and live input acceptance remain required.

Global skill registration already points to the complete canonical source;
preview reports unchanged, so no copied skill deployment was necessary.
Unfinished optional coordination/native-host/Tailscale work was not broadly
activated merely because files are dirty. No commit, push or publication ran.

## Verification and separate inbox follow-up

- Scoped health passes: required server plugins, GitHub/Playwright MCPs, skills
  and source suites. It is not a GUI or real-model compliance test.
- Five plugin-only deployer tests pass, including preservation, stale CAS,
  symlink, FIFO and byte bounds. Twenty-five command/checkout checks pass.
- Direct-directory isolated smoke passes on the unchanged executable: 17 model
  requests, 2 automatic continuations, 3 independent reviews, premature-wait
  rejection, YOLO inheritance and persistence through private-server restart.
- OpenCode SHA-256 is still
  `cd03022601e4848a957999a2a7b1c1ccf18b94f9a084a44719f62abaacebe83c`.

At the initial deployment checkpoint, native pending peer messages were read through the API but were not consumed by
that read. This caused the user-visible queued-prompt clutter. No more peer
coordination messages are sent through the user's prompt queue. Existing entries
are not silently steered or deleted. The plan subsequently tracked a proper
agent mailbox/read-acknowledgement workflow and explicit task-owner/coordinator
provenance. The later results and newly reported write regression are recorded below.

## Inbox follow-up, escaped regression and containment

The inbox work above subsequently activated the optional coordination package by
adding only its entry to project `opencode.json`; every prior plugin and non-plugin
setting was compared with `opencode.json.backup-inbox-20261029` and preserved.
That initial proposed state path was **wrong**: the existing ACL-shared `tools/`
ancestors are group-writable, which the private store correctly refuses. An
automatic context hook let that optional read failure abort model preparation.
The user had to obtain an outside repair. That repair changed only this package's
state path to owner-only `.session-coordination/` and restarted the shared service.
This deployment chat did not perform that restart and does not relabel it as a
successful acceptance step. The unsafe ancestor checks were not weakened.

The root cause needed containment, not merely a new directory: automatic
`ctx.session.hook("context", ...)` registration has now been removed. Actual
plugin-setup regression with a group-writable ancestor proves it registers **no
model/prompt hooks**; explicit inbox access still rejects the unsafe path. A
separate source-only discovery helper is not registered or a delivered runtime
feature. No idle polling, automatic wake or mandatory mailbox read was added.

Two live integration failures missed by initial source tests were also repaired:

- SDK2.1.1's native Effect RPC compiler refuses patterns and JSON Schema
  conditionals. RPC IDs still receive strict service validation; policy schemas
  now express the same idle-wake/project-null constraints as disjoint full-object
  alternatives. Actual installed Effect compilation/decoding and AJV test both
  positive and negative cases. No native validator was disabled.
- Tool/RPC outputs contained optional `undefined` fields, which native validation
  rejected **after** a post had durably stored. Outputs now become actual JSON
  before validation; retry reconciliation reads the exact existing message ID
  instead of making duplicates. No data or pending human input was removed.

Current independent verification:

- Goal plugin full regression: **458 pass / 0 fail**, 1,888 assertions across14
  files. The earlier rerun was cancelled by the outside service restart; only the
  later completed `sh_18998ff8b001Oib8x1uO0SpElu` is a full pass.
- Coordination before the late preflight repair: **128/128**, no skips; strict TypeScript/library checking passes.
  Includes real files/flock, cancellation/scope/permissions, mailbox receipts,
  legacy unknown transport, JSON results, native Effect schemas, UI controller,
  adapter and normal-chat-hook isolation. An isolated mutation restoring default
  queue delivery is rejected by the regression; production source stayed unchanged.
- Actual registered native tool post/read/inbox/mailbox-deliver/seen-only ACK and
  settings RPC reads succeed. Three real selected peers stored their replies in
  the channel. The voice report was read and explicitly marked seen-only.
- A mailbox-only notice `voice-output-repair-receipt-20261029` left that recipient
  idle with an **empty native pending queue**. This verifies no queue clutter/wake,
  not notification, agent processing, work acceptance or completion.

The user separately requested steering the other three open project chats and
switching them to DeepSeek Flash while this chat stayed Sol. Exact model-catalog
lookup, supported per-session switches/readbacks, native `steer,resume:true`
admissions and one active-map snapshot verified all three running on
`deepseek/deepseek-flash` high; this chat remained `openai/gpt-6.1-sol` high.
That was explicit operator-requested activation, not autonomous mailbox delivery.
The skills chat reported its audit complete; the voice goal remained terminal
with live GNOME/physical acceptance outstanding; the consolidated-plan owner
reported its own active unfinished goal and blockers. No foreign goal was edited.

This useful model/resume procedure is now preserved in the canonical
`cross-session-coordination` skill and discovered by native skill inventory;
22 adjacent skill/inventory/portability checks pass. It needs no mailbox plugin,
new coordinator layer, arbitrary worker limits or shared restart. **Mailbox
storage is optional bookkeeping, not delivery into an agent's working context.**

Visible optional Ctrl+P inbox/settings dialogs are not claimed accepted. The
request-owned capture confirmed this chat and an empty composer; a later fresh
observation showed the user editing an unsent spoken request, so no key was sent
to it. One earlier malformed key request was rejected before input. GNOME on-disk
deployment remains verified, but no Shell refresh/login or loaded-new-input claim
follows from screenshots. All original GNOME activation gates remain intact.

## Final audit checklist

| Requested outcome | Verified evidence / limit |
| --- | --- |
| One enhanced engine, `/yolo`, goal commands and settings | Fresh native inventory has exactly one `local.goal-mode.server` and no `opencode.goal`; six named commands present. Engine RPC is enhanced, `reloadRequired:false`; YOLO is available and remains off as selected. |
| Preserve live settings and goal history | Both live global/CLI non-plugin documents still equal their exact transactional backups. Goal tools retain this active goal/history and peer-owned goals; no raw goal edit. Adjacent goal backup retained. |
| Real local loader/state compatibility | Package root entries/exports and exact local state marker validated without forged version. Full goal suite458/458; companion166/166 at integration and fresh scoped health re-runs its required suites. |
| Package, type and lifecycle checks | Final ESLint/typecheck exit0; npm pack dry-run11files. Packed direct-directory private-server smoke repeated successfully:17modelcalls/2continuations/3reviews, YOLO persistence; artifacts `/tmp/opencode/goal-v2-lifecycle-smoke-u7ExQL`. Not a live2.2.1+ native-idle test. |
| Ready commands and GNOME files | Original command snapshot deployed with two command backups; GNOME preview now changes[] across all7managed files, no enable/restart. New concurrent peer-owned `global/commands/checkout.md` drift is not silently redeployed or claimed current: source5abcd145..., deployed72af752c.... Its remaining native/template/source-readiness work stays with its owner. |
| Fix internal traffic clutter and truthful receipts | Native channel post/read/inbox/mailbox-deliver/ACK/settings verified; actual voice native pending[]/idle preserved for mailbox-only notice. Stored is not agent notification or activation. Explicit operator-requested peer steering is separate and this chat's human queue was not used for new coordination. |
| Prevent optional inbox failure from locking chats | Actual plugin setup registers no prompt/model hooks. Native Effect compilation/decoding, JSON output and unsafe-ancestor tests supplement AJV. Final coordination131/131; strict/library typecheck passed. Final preflight is preview-ready, exact root-private entry present/mode700, no writes. |
| Preservation and consequential gates | Both executable hashes unchanged: old `opencode2` cd030226... and running ELF0e81c77f...90450. Original staged patch SHA91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805 retained. No commit/push/publication/logout, permission weakening or shared restart by this chat. Outside incident repair/restart remains explicitly recorded. |
| Additional explicit user requests | Three selected session model readbacks/native running snapshot verified; model/resume skill source and discovery verified. Candid-advice/work-continuity preference saved/read back at `docs/memory/interaction-preferences.md`, indexed and routed once at startup through AGENTS.md; memory/instruction tests15/15. New Queue/Shift+Enter/Copy/Hearing expansion/composer-anchoring request admitted with steer/resume to exact voice owner and observed running, not claimed implemented by this chat. |

Final scoped health passes. Adjacent feature/GitHub permissions/health/memory/
instruction/portability suites pass **41/41**. A late activation-preflight check
correctly exposed its old hardcoded path and missing ancestor inspection; three
new real-file tests cover the repair and final coordination count is **131/131**.
That helper change is read-only and needs no plugin reload or service restart.
Visible optional inbox dialogs, GNOME loaded-new-input/physical voice acceptance,
new peer-owned checkout work, stable2.2.1+ native-idle and other independent goals
are explicitly not completed by this deployment audit.

## Reopened live acceptance: reported write dispatch failure

After the checks above, the user reported that **Skills Audit and Adoption**
(`ses_e788b549bffe8cyPIPC9FRsmJY`) could read the coordination channel but four
`post` attempts returned `unsupported coordination operation`. The earlier stored
reply `resume-flash-reply-msg-189902b8b001-skills` must not be duplicated or
mistaken for proof that later writes work. Previous successful post observations
do not establish acceptance of this reported post-reload failure.

The user explicitly requested immediate background investigation and remediation.
Child `ses_e7649be49ffeAY5AErkZa19ITG` owns only coordination package source/tests;
the parent retains independent live acceptance and goal closure. No prompt-queue
fallback, automatic model hooks, security weakening or shared restart is authorized.
At that checkpoint, final goal acceptance remained open pending reproduction,
repair and verification.

Parent verification found the caller error in the affected session's actual
stored tool inputs: **five** recent failed writes omitted the required `op`
field entirely; successful read/inbox/status/policy calls included it. The
failed message IDs are `msg_189adbaac00199AyVdcsw3plLE`,
`msg_189aefc71001fKpkEMKZ822kLl`, `msg_189b0eb830016ZsXXoG3QhsGlP`,
`msg_189b1ea42001h6EuTx64z2odNW` and `msg_189b2f575001mKvNCHLAUWsYSm`.
The old stored original reply explicitly had `op:"post"` and the separate old
JSON-output error. There is no evidence these five failures rejected valid posts.

The child's valid live probe succeeded without source changes. The parent also
stored and read back `skills-missing-op-correction-20261029-v1` in the existing
thread with the exact `op:"post"` call shape and unchanged adoption gates. The
affected session's native pending queue remains empty; no activation or reading
of that correction is claimed. The child is adding a clear missing-operation
diagnostic and fail-closed regression, not a default/inferred post or weakened
schema. At that checkpoint, acceptance awaited independent review of that bounded
improvement.

### Independent closure of the reported write incident

The child changed only `tool.ts` and `test/channel.test.ts`. The parent inspected
both: the operation remains mandatory, unsupported/non-string values are refused,
and no write is inferred. The reported write-shaped payload now receives an
explicit missing-`op` correction before service, permission, session, storage or
native-prompt effects. The new regression retains a successful real-store
explicit post. The child observed the targeted regression fail with the old
generic guard; the parent independently reran the full package **132/132**, zero
skips, and strict/library typecheck successfully. Adjacent JSON/native-compiler/
hook-isolation coverage remains intact. No test or safety coverage was removed.

Parent also repeated scoped health successfully, adjacent suites **41/41**, and
native inventory/command/settings reads: exactly one active enhanced engine,
six commands, enhanced selection with `reloadRequired:false`, YOLO available/off.
Both non-plugin settings documents still equal their deployment backups; both
executable hashes and original staged patch hash are exact. `git diff --check`
passes. The final coordination count is **132/132**; earlier counts above describe
their checkpoints rather than another outstanding test run.

The caller omission is diagnosed and corrected guidance is stored/read back.
No shared reload/restart was needed to make valid posts work. The clearer error
is verified in source, not claimed loaded in every existing session. Mailbox-only
guidance remains unacknowledged and is not notification or activation. All GUI,
GNOME, newer-host and independent-peer limits in the audit remain unchanged;
none is silently represented as completed deployment work.

## Read-only preservation follow-up — 2026-10-31

This is a selected identity recheck, not another deployment or renewed authority.
Running PID12584is v2.1.1; its213648864-byte ELF still hashes
`0e81c77fcc27b263708b133bbf9880cd641060c20e22d3dec8a79b9a8db90450`.
The old47-byte`/home/james/.opencode/bin/opencode2`shim retains
`cd03022601e4848a957999a2a7b1c1ccf18b94f9a084a44719f62abaacebe83c`.
The current313-byte`~/.local/opt/opencode-v2/bin/opencode`launcher is observed at
`0255c36705a0d1a60fd528034870301247b27125d4a702adcc28300ad88065ce`,
without a historical exact-path baseline comparison.

Both live profile documents' parsed non-plugin values match their exact tabled
transaction backups, excluding only the top-level`plugins`field. No private
configuration values or credential material are emitted or copied. Voice HEAD
`906e8dd51192adc0d32a39c0406077dbc5e5507c`matches the unchanged parent Gitlink;
48dirty paths remain and its staged diff is empty. This does not verify all
dirty-source bytes, media, plugin storage or branches/history. No voice/source,
configuration, launcher or executable write, deployment, restart, audio/GUI action
or permission change occurs. Historical mailbox outcomes above stay historical;
the current feature-removal decision is owned by the consolidated delivery record.
