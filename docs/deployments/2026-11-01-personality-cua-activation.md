# Personality activation and desktop acceptance — 2026-11-01

**Latest outcome:** approved personality activation, native reminder delivery,
local-browser workflows and actual desktop/app-handle workflows are verified.
The later supported accessibility recovery and user-unlocked replacement-process
test below supersede the earlier restart/login blockers. Those failures remain
historical evidence, not current instructions to restart anything.

## Authority and scope

The user approved the previously reported global-personality and desktop-bridge
activation gates, then explicitly resumed the existing goal. This covers the
narrow reviewed deployment and bounded sample acceptance. No shared service or
desktop restart, logout, permission change, commit or push was performed. The
resume command explicitly forbade editing/completing the goal in that turn, so
the activation was first recorded here. The subsequent continuation reconciles
the saved plan through goal tools; no goal completion is claimed.

## Global personality: applied and active

The reviewed `scripts/deploy-personality.py` changed only the personality plugin
entry in `/home/james/.opencode-v2-pilot/config/opencode.jsonc`:

- Before SHA256: `c3cff07b93ef9a947c63a8df9a949648a19bbdb826fd6ca9543c146bdc05c792`.
- After SHA256: `5bf24c83bce2563553cdfccc4f21cd56969ff63b34df5bf44e797645130f521a`.
- Adjacent backup/receipt basename:
  `.mcp-config-transaction-6ad6f83e6c0d7e6bdd3338aabf85c0ad`.
- Independent JSONC comparison confirms every unrelated setting and plugin is
  preserved. The actual receipt-based restore preview validates the original
  digest with `applied:false`; no live rollback was performed.

The service loaded `computer-use.personality` directly from the canonical
`tools/personality/index.ts` without a shared restart. The real exposed
`personality.current` returned `personality-plain-english`, `origin:default` and
revision `655d49ea6803827082abab5e174ff8fa97c7ef93b2330717fa9643f3b16b19e8`.
Native plugin inventories also show active canonical loading in both owned QA
projects; neither project contains a local personality declaration.

## Actual model samples

Used the already connected `opencode-go/deepseek-v4.1-flash#high` through supported
native session APIs, with inherited operator configuration and no credential copy
or permission edits. Two clearly labelled QA chats were created:

- `ses_e67c66486ffe7w0KbuP1iYlhBS`: fresh reply, resumed reply, completed real-model
  native manual compaction and a post-compaction reply.
- `ses_e67c650fcffeEAwMwgPi2LG0hr`: second-project reply and two bounded follow-ups.

The samples use only invented helper/window-preview questions. Fresh/resumed/
post-summary replies use ordinary words and the requested short forms without a
pushback persona. The original generic preview-token question allowed a different
token interpretation; the next answer also overreached into viewing permissions.
These are **not accepted as this tool's technical semantics**. After the sample
explicitly states that a preview is only a freshness guard, the reply correctly
keeps authorization separate and explains why a moved target needs a new preview.
No claims of universal compliance or reduced model cost follow from these samples.

The first four native assistant messages finish with `stop` and contain no tool
calls. Actual native compaction is `status:completed`, `reason:manual`, using the
selected real model. This is not automatic token-threshold compaction acceptance.
Raw QA evidence is in `/tmp/opencode/personality-live-LZa5aK/`; the visible-only
review and follow-up files separate response text from provider reasoning. Scratch
may expire; the labelled native sessions retain the sample history.

## Desktop: actual capture/click, then a real typing defect

The initial seven-file bridge preview differed only in two comments in
`policy.mjs`; exact comparison found no behavioral difference. Its approved
deployment retains backup `.backups/20261101T174456.582535Z-r9op6qhh` beside the
installed extension. GNOME Shell PID2269 started at13:06:56UTC, after the behavioral
capture/input/launch modules were installed; those files' ctimes precede that
process. The only later change at this preflight was the policy comment.

A task-created Calculator was launched and only its exact window captured:

- Initial PNG: 820×1332, 54,688 bytes,
  SHA256 `b631eeab26cfc161ec6227a75b7080c52e01ffe299c114f14022f04a8d07c68f`.
- A bounded pointer click used that request's observation and screenshot pixels.
  Fresh PNG visibly shows `7`: 55,364 bytes,
  SHA256 `b403211d8cba97522489ea80c37963d30586c189750e2af9e93cd2fd7e78fb55`.
- Typing `+5` failed `INVALID_REQUEST`; no alternate input route was used to claim
  successful typing.

The real Shell key resolver lowercased literal text, split `+` as a chord, and
did not accept standalone modifier names needed by click options. Existing input
tests supplied a different parser and therefore hid these failures. Tests now
extract the actual production method and constants, not a replacement parser.
The red run produced nine failures, including the existing uppercase and modifier
tests. The fix preserves all95printable ASCII characters, supports only the named
modifiers, and still refuses malformed/control/unsupported input. Focused39/39,
the full GNOME suite,215computer-use checks and full health pass.

The canonical fix changes only `extension.js`, deployed SHA256
`03e21d4d93320ee56427f1ce0316d402228411f614aa75da8a29906ca3f06820`.
Backup: `.backups/20261101T175818.750253Z-3nicwuoq`. All seven installed files now
match source. One approved disable/enable changes the bridge epoch from
`9f0d1d6f-d1a6-4afa-b59f-14567aa00122` to
`a73ecc66-82bc-4538-899b-49cf2a486b73`, but the fresh-window `+5` retry still returns
`INVALID_REQUEST`. The new method is therefore **not accepted as loaded**; matching
files and a new epoch do not establish module refresh.

Both disposable Calculator windows were closed through named accessibility
controls, with compositor readback confirming no Calculator remains. This cleanup
is not substituted for compositor typing. The old remembered CUA application
handle correctly refused after its process exited instead of targeting the new
Calculator. Held input was released; the original terminal window remains.

## Earlier remaining gate (resolved in later acceptance)

The deployed typing fix needs a fresh, user-controlled desktop login before live
`+`, uppercase, modifier and ordinary typing checks can establish loaded behavior.
No logout or Shell restart is authorized by this record. Do not retry through an
unsafe alternate backend, weaken guards or mark the desktop workflow complete.

The following continuation rechecks GNOME50.1/PID2269 and both deployment
previews: the global target is unchanged from the approved after-digest, and
all seven bridge files match. The actual exposed Extensions D-Bus interface
declares `ReloadExtension`, but that declaration is not usable-reload proof.
Read-only extraction of the installed `/usr/lib/gnome-shell/libshell-18.so`
resource `/org/gnome/shell/ui/shellDBus.js` shows `ReloadExtensionAsync` always
returns `Gio.DBusError.NOT_SUPPORTED` with
`ReloadExtension is deprecated and does not work`. The installed
`/org/gnome/shell/ui/extensionSystem.js` imports the stable extension URI and
marks it `isImported`, explicitly noting that it can be imported only once.
The `gnome-extensions` CLI also has no reload command. No further toggle, unsafe
Shell evaluation or repeat typing attempt is performed against unchanged state.

The separate opt-in fresh/headless-Shell harness is not an owning-desktop reload;
its private bus/seat results cannot prove that this existing Shell loaded the new
method. It is not started as an unrequested alternate desktop. User-controlled
fresh login remains the actual pending dependency.

Earlier native contract/request-path checks were rerun successfully before apply:
44host checks plus9outgoing-request checks at
`/tmp/opencode/personality-native-D4hsqQ/acceptance.json`. The earlier scratch
manifests had expired, so their absence was not treated as source verification.
Current actual global activation supersedes the old unchanged-global checkpoint;
the original source/staged-work preservation requirement still applies.
Final staged-patch SHA256 is
`91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805`, matching the
recorded original. Canonical/deployed extension hashes agree, full GNOME and
computer-use suites pass, final focused39/39 and selected48/48 pass, local links
in the six touched guides resolve, and `git diff --check` is clean. These do not
clear the remaining loaded-new-typing gate.

## Independent real-model performance follow-up

The next waiting review required the still-available matching model/counter
experiment, not another desktop retry. Six fresh owned native sessions ran the
same local form/navigation/cleanup task through direct `web` or persistent CUA
methods, both inside Code Mode, with `opencode-go/deepseek-v4.1-flash#high` and
unchanged inherited permissions. Actual tool results prove all six outcomes;
native token classes/costs, per-step sums and prompt-to-idle times are recorded
in [the architecture evidence](../codex-parity/codex-runtime-architecture.md#matched-real-model-local-page-runs--2026-11-01).
Direct median101,690ms/$0.005137014 versus CUA127,664ms/$0.005811996 is **not** a
CUA performance advantage. Discovery/source detours and recovered navigation/
pre-open-tab refusals remain counted; outer completed status is not error-free
browser proof. Four corrupted-evidence controls are rejected. All task tabs and
workers plus the fixture server are closed; zero exact-session browser processes
remain. Source/permissions/staged-patch readback is unchanged. GNOME still has
PID2269/start13:06:56UTC; the loaded-typing/fresh-login gate is unchanged.

## User reboot and changing-session follow-up — 2026-11-01

The user explicitly resumed the existing goal and reported completing a reboot.
The resume command permits resumption/work but forbids goal editing/completion
in this turn, so this receipt records the new evidence without changing the saved
plan or marking the goal complete. No agent-performed restart/logout follows.

Initial current owning Shell PID4764 starts20:21:00UTC (the greeter is a separate
PID2022). The seven-file deployment preview has no changes and still matches
extension SHA256 `03e21d4d93320ee56427f1ce0316d402228411f614aa75da8a29906ca3f06820`.
Inventory is unlocked/unblocked, epoch `995e6795-b201-42d7-aa51-0b925871e33c`.
Only the task-owned Calculator is launched, PID7972/window`:5`; its request-owned
capture is410x666/16,324bytes, SHA256
`534463ca6eeededde832d3ab1d83c62463b204961765a987c5c85eb2e9d8c9e4`.
The PNG is inspected, but no successful click or typing is claimed: a bounded
click refuses `FOCUS_CHANGED` because another window holds focus. A supported
exact-window focus preview is obtained; apply refuses `InvalidPreview` after
window/display state changes. No refused action is blindly repeated.

The session then actually changes again during the checks: inventory briefly
reports zero monitors, followed by owning Shell PID9101/start20:29:59UTC and epoch
`f204ca8f-7149-424c-b0a2-e9f72a1e6218`. Task Calculator PID7972 exits with that old
session; final fresh compositor inventory shows no Calculator/TextEditor. Existing
unrelated windows are not inspected or controlled. No text-editor instance is
launched (`--help` only). Actual app inventory now refuses with the AT-SPI
accessibility-bus connection error; one fresh read confirms it. The accessibility
service itself is running in the new session, and narrow read-only D-Bus queries
reach its current socket, so the evidence is not treated as missing installation.

The actual OpenCode `/api/info` identifies service PID6628/start20:22:14UTC,
**before** this second Shell. Its selected session-address/Xauthority environment
differs from the current CLI PID10336. The persistent native bridge's launch and
held-input-release calls both return `The connection is closed`. No new app is
launched by that failed call, and no successful input/hold has been dispatched in
this trial. A failed release is not relabeled successful cleanup.

Canonical `desktop.ts` subprocesses inherit the service environment; `bridge.ts`
also reuses its owned daemon and derives its allowlisted address/display variables
from that same service environment. Current window inventory uses its separate
fresh-process path and remains readable. Resetting CUA bindings would not refresh
the service environment or this shared bridge connection. No environment/GUID
stripping, unsafe backend fallback, permission change, plugin reload trick or
unapproved shared restart is attempted.

The original reboot prerequisite has been performed; final typing is still
**unverified**, now behind a stale shared-service desktop connection after the
observed additional session change. The supported recovery is to restart OpenCode
from the current logged-in desktop (separate shared-restart authority, or a
user-performed `opencode service restart` when other chats are ready), then resume
and repeat the exact disposable-app plus/uppercase/modifier/ordinary-typing
checks with fresh capture/readback. Matching installed bytes and new Shell
processes alone still do not establish successful loaded typing.

## Current-style native verification after reboot

The independent continuation verifies the user's added numbered Next steps
rules at actual Plain English revision
`bf1a117b0a39f5ad5cad88f5615b77036732db740f23cbefc30e941b5a7e7833`.
Review of the initial rerun finds the old verifier only checked Plain English's
first sentence. A new regression fails with a truncated body; the verifier is
corrected to require the entire bounded instruction body from the byte-verified
canonical source copy, including rejection of added trailing instructions.
No production reminder, permission, environment or shared-service code changes.

Corrected actual installed2.1.1 evidence is
`/tmp/opencode/personality-native-eqahp8/acceptance.json`:44host+9request checks
pass across3owned boots/2projects. Raw review confirms all8current source hashes
and the new rules in4Plain English outgoing requests; project-two reset also
replays the native summary after private restart/project move. All private hosts
and deterministic endpoint are stopped;48source/instruction tests and full health
pass. Actual operator `personality.current` returns the same new revision/default.
No new paid-model or desktop trial, operator credential copy, shared restart,
deployment, commit or push occurs in this independent verification.

## Owned transport recovery and actual typing — 2026-11-01

The revision30 waiting review correctly rejects the assumption that retiring the
owned bridge transport could not help. The earlier blanket shared-restart
diagnosis above is superseded for **compositor capture/input**, not for AT-SPI.
An isolated real D-Bus fixture now replaces its own private bus at the same
fixture-created address while running the production `desktop-windows.py` server.
The cached connection fails, matching the live symptom. Before the fix the test
fails because no structured closed-transport indication is returned. A separate
framed-client regression also fails because the old owned child remains current.

Canonical Python serve replies now add `transportClosed:true` only to a failed
operation when its actual connection reports `is_closed()`. The TypeScript
client returns that same failure to the original caller and retires only its
owned child. It never replays the request or starts a replacement on that caller's
behalf. A later fresh request starts a new owned transport. The real private-bus
test proves the failed request reaches the replacement service zero times and a
later fresh request reaches it once. Ordinary target/policy refusals keep healthy
transports. No environment/GUID stripping, changed allowlist, permission change,
shared-service restart or GNOME deployment follows.

Eight focused cases,218full plugin cases,21Python helper tests, strict bridge/test
types and full health pass. The first typecheck command incorrectly chose
NodeNext/CommonJS for these unmarked sources; ESNext/bundler is the corrected
command. It also exposed a pre-existing unknown array in the old environment test,
now narrowed by an actual array assertion. Fixture children/buses are task-owned;
the helper refuses non-private address prefixes and never touches the user bus.

Actual exposed `desktop.release` now succeeds without changing shared service
PID6628. Through the same approved native compositor tools:

- Calculator window`f204ca8f-7149-424c-b0a2-e9f72a1e6218:5`, PID21739, is
  launched/focused with a fresh preview/apply. A remembered CUA window handle
  captures across cells. The first zero-hold pointer dispatch does not visibly
  enter7 and is **not** accepted as successful clicking; no blind click retry.
- Compositor `type_text("7+5")` visibly shows exactly`7+5`; Enter visibly
  evaluates it to`12`. Ctrl+W closes that task Calculator; fresh inventory confirms
  absence. The old remembered handle's returned focus result refuses the missing
  window, not a replacement. One unreturned focus result was initially silent;
  explicitly returning it surfaces the actual refusal.
- A new scratch file is opened with installed Text Editor `--standalone`, avoiding
  restoration of user documents. An initial10second launcher timeout stops its
  own instance; absence is checked before a proper no-timeout background launch.
  The new window`:7`/PID24481 contains only
  `/tmp/opencode/desktop-typing-HwfDTm/typing-check.txt`.
- Literal typing visibly yields`Plain English: ABC xyz + 5`. A fresh,100ms
  Shift-modified click visibly selects that complete line. Ctrl+S saves it;
  independent byte readback equals`Plain English: ABC xyz + 5\n` exactly, proving
  case, plus, spacing and the editor's newline. The saved screenshot has no dirty
  indicator. This verifies named click modifiers as well as keyboard chords.
- One old close observation expires and refuses without action. A fresh capture
  plus Ctrl+W closes the saved document; the resulting empty task window is then
  quit with fresh capture/Ctrl+Q. One close-bound frame was black and is not used
  as visual proof. The later welcome-window capture is visible, the background
  process exits, final inventory has neither task app, and input release succeeds.

Request-owned PNG evidence (images remain tool attachments, not manually copied):

| Observed state | Size/bytes | SHA256 |
| --- | --- | --- |
| Calculator `7+5` |820x1332 /56,478|`4b1538b07dbe3d67373a1ba962cd68e76109773e7b83762500f297282d546f27`|
| Calculator result12 |820x1332 /58,924|`309afca58e4cd86cb35e571a37711e7bacf0a296e01230c16cc521e9cda539b1`|
| Exact mixed-case text |1500x1140 /49,328|`e243f3d09062cb81e306fc3e2e09b66290fca1468c460b611bc08746047a246d`|
| Shift-click selection |1500x1140 /48,785|`a7ffe81bcb50db2bcdf076975274a66af1584ae8c7882800bd48e7e65d3226df`|
| Saved document |1500x1140 /48,634|`4ab8bd0fe4ee2b57eddb40be479a4c76a2aba2b2959dc6a7b67a805e8fe44184`|

**Then-unresolved boundary (superseded below):** `desktop.apps` still fails its AT-SPI
connection. Read-only `dbus-send` checks, preserving each complete address, fail
to register using service6628's inherited session identity and succeed using the
current login's identity. The actual server PID stays6628; identities are not
stripped or replaced. This is concrete evidence that the current app-reading
path needs a newly authorized/current-login connection, unlike the recovered
Gio compositor transport. Refreshing the shared service from the current login
retains its separate authority/user-action gate. No extra reboot is requested.
The live typing requirement is now observed; current AT-SPI app enumeration and
process-bound app-handle acceptance remain pending under that refreshed connection.
The installed2.1.1 plugin `ToolContext` adds only cancellation/progress to schema
call/session/agent IDs; it supplies no current-login environment/connection
capability. The plugin session domain likewise exposes no environment operation.
No newer SDK API, ambient identity replacement or alternate app reader is invented
to bypass this remaining boundary.

## Supported accessibility recovery and app acceptance — 2026-11-01

The revision35 waiting review identifies a supported alternative that the old
session-address failure alone did not rule out. Installed libatspi2.60.4 contains
`AT_SPI_BUS_ADDRESS`; installed pyatspi is2.58.1. An actual private-bus fixture
proves this per-process setting accepts the complete authenticated accessibility
address while retaining the helper's old complete session address. Its production
discovery variant genuinely fails with the original native bus error before the
fix, then passes. A GNOME raw-source fetch returned406 and is not source evidence;
the installed-library execution is the relevant semantic proof.

`scripts/accessibility_bus.py` now reads `org.a11y.Bus.GetAddress` from its verified
same-user unique owner using bounded, non-activating calls. It validates a single
unaliased owned Unix socket, its protected parent and intact GUID, and supplies
the exact address only through the fresh Python helper's supported
`AT_SPI_BUS_ADDRESS` before registry use. Explicit bindings are preserved, not
replaced; missing session context refuses autolaunch. No parent/global environment,
session GUID, native permission or shared service is changed. This is the existing
exposed accessibility provider, not an alternate reader around a refusal.

Actual `desktop.apps` succeeds on unchanged shared service PID6628. The earlier
claim that app reading required a shared restart is explicitly withdrawn.
Through the registered persistent CUA tool:

- `qaApp` binds Calculator identity
  `app:7ddbfaf5bc47ffcaf536e759c19fd92aa7d5bd488c7118dff75e1621a9974881`.
  Full traversal visits107nodes. A depth8 view is incomplete, so it is not used
  for target selection. The actual role is `button`, not `push button`.
- Named `7` click dispatches; a fresh request-owned window capture visibly shows7.
  A later cell's `qaApp.type("7+5", {role:"text", showing:true, nth:2})` replaces
  the editable field with verified text, then a fresh PNG visibly shows`7+5`.
  The first text match is read-only; the second is the inspected editable field.
- Named Close dispatches, fresh window inventory shows no Calculator, and the
  old process-bound handle refuses subsequent reads as stale.
- The next launch fails `NameHasNoOwner`. Read-only checks show extension
  enabled=true/INACTIVE, no extension errors, unchanged Shell9101 and
  `org.gnome.ScreenSaver.GetActive=true`: the screen is locked. No extension
  toggle, app launch, capture, input or unlock attempt follows that finding.
- The user wakes the screen and explicitly requests keeping it awake during
  testing. Fresh ScreenSaver=false and bridge `locked:false` show recovery,
  epoch`4f956d02-0a80-4ec7-9923-0f568c5d164f`. A temporary installed
  `gnome-session-inhibit --inhibit=idle` request, bounded by a30minute child,
  is listed as `org.opencode.PersonalityCuaAcceptance`. Saved lock/power settings
  remain unchanged; only this owned request is to be removed after testing.
- The replacement Calculator has window`:12` and distinct identity
  `app:8966e677dad97b53f7b013474cff3b369a1e299637778969e68d215669d88406`.
  The old persistent `qaApp.click(7)` refuses stale identity before dispatch.
  A fresh request-owned PNG visibly shows a blank expression, not an entered7.
  A fresh `qaReplacementApp` inspects the new app and clicks its named Close.
  Fresh app/window inventories show neither task Calculator nor Text Editor;
  input release succeeds. No unrelated window is operated on.

| App-handle visual result | Size/bytes | SHA256 |
| --- | --- | --- |
| Named7 click |820x1332 /55,364|`2132713a8c6ba5088c7b6c1298c87d678eeb5c2e47b9fade0d4cbce2a4cd8e72`|
| Editable field set to7+5 |820x1332 /56,382|`6d2667d46d4bed8c6bee9da21e612f1330affaac1601d741f1a11ca2565bc1f3`|
| Replacement untouched after old-handle refusal |820x1332 /54,688|`257321d31e0f59aaf64d86fbdb36967b21baaf2f2194d076a7ef50d935bffd34`|

Final checks pass:220computer-use cases,48personality/instruction cases,
93GNOME cases,7accessibility-bus units,26desktop Python cases and6personality
deployment/restore cases; strict bridge/source/test types,5Python syntax checks
and full health. All8current personality source hashes match the retained native
44host+9full-body-request fixture. The exact mixed-case/plus scratch file still
matches. Read-only deployment preview finds no changes to the seven bridge files;
approved global digest`5bf24c83...`, staged original`91d6022a...` and shared
service6628 remain unchanged. No private fixture host/bus or task app remains.
No new deployment, shared restart, logout, commit or push occurred.

Documentation coverage also exposes and fixes stale31/32skill counts and missing
task-owned package/script/fixture links. The unchanged inventory contract then
passes7/7; GNOME documentation contracts pass14/14. The root README changes only
its catalog count to34, preserving its107lines, Splice, setup prompt and warnings.
All531local links across the seven touched documents resolve; the new acceptance
anchors also resolve. Markdown rendering was not separately visually tested.

Testing is finished. The owned idle-inhibitor child PID33527 is verified against
its exact parent/argv/UID, held by pidfd and stopped; both it and wrapper33521
exit. `gnome-session-inhibit --list` confirms the task inhibitor is gone while the
unrelated foreground-process logout inhibitor remains. Normal saved lock/power
settings were never edited. `cua.reset` then discards this session's finished
handles/worker; shared OpenCode service remains PID6628.

## Full objective audit

| Unchanged completion requirement | Verified artifacts and outcomes | Limit retained |
| --- | --- | --- |
| Parent personality and original Plain English style | Sibling SKILL/README bundles, AGENTS/catalog routes, semantic examples and actual skill loads/current default revision`bf1a117b...` | No added adviser/pushback persona; style changes no authority. |
| Safe inspect/select/save tool | Canonical `tools/personality/` core/entry, native44host checks and owning cases: all operations, chat isolation/durability, native ask/deny, exact permission paths, conflict/revision/partial-write handling | Native write acceptance occurs only in a byte-verified disposable source copy; no arbitrary production skill was saved for testing. |
| Cross-project/long-chat reminders | Approved global declaration, actual current/default, two-project real-model samples/manual compaction,9actual outgoing-request checks with8matching current source hashes | Whole-body delivery is verified; sampled model adherence is not universal compliance or automatic token-threshold triggering. |
| Persistent CUA/browser/lifecycle/app identity |220plugin cases plus strict source/entry/worker types retained; actual private-bus no-replay/installed-lib checks and7address units; process-incarnation5case suite | Tokenizer/worker are not a full JS parser or security sandbox; dispatched actions cannot be rolled back. |
| Actual desktop/browser workflows | Local form/snapshot/PNG/same-tab navigation/cleanup; compositor plus/case/modifier/save-byte proof; persistent app named-click/text and same-name replacement refusal/untouched PNG/fresh-handle cleanup | Bounded task targets only, no signed-in profile or general desktop parity claim. Earlier failed/expired/unverified actions remain excluded. |
| Checks, measurements, docs, rollout and safety | Fresh source/Python/health checks above, current manifests/deployed7file readback, six actual native-counter benchmark runs, corrected inventory/checklist, approved backup/restore preview, staged/global preservation and temporary-inhibitor cleanup | No CUA speed/cost advantage demonstrated. Unrelated historical portability failure remains recorded, not edited. No unapproved deployment/restart/logout/commit/push; changes remain uncommitted. |

No required deliverable or live prerequisite remains for this goal. Publication
or broader application acceptance would be separate work, not an implied next step.
The benchmark scratch directory is now absent. Supported read-only metadata reads
of its six exact owned native session IDs still match all recorded cost/token
classes; no new generation is triggered. Original monotonic timing/tool-outcome
rows remain the durable experiment receipt, not newly rerun performance evidence.
