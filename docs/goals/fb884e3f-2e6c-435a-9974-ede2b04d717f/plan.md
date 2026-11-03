# Plan — `fb884e3f-2e6c-435a-9974-ede2b04d717f`

- Goal ID: `fb884e3f-2e6c-435a-9974-ede2b04d717f`
- Source session ID: `ses_e78fdcc9affeNOlKMRek7Yobo3`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T14:14:27.321Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `8`
- Record: `archive`

## Goal objective

> Finish Docker\-only, on\-demand private Tailscale HTTPS access to the user's EXISTING OpenCode V2 instance and chats when /web is invoked\. Docker must be a gateway to the already\-running service, not a second isolated OpenCode server, a copied database, or a host\-installed Tailscale daemon\. Discover and validate the actual existing endpoint using supported OpenCode mechanisms rather than fixed ports or broad scans\. Prepare and review a Linux Docker host\-networking topology for the Tailscale container only \(or a separately reviewed narrow relay if host networking cannot meet the safeguards\), preserving OpenCode's localhost binding, application authentication, host routing/DNS and least\-privilege container controls\. Update the plugin, lifecycle helper, tests and owning documentation; make /web wake only the approved gateway and /web stop stop only that gateway, preserving all sessions, volumes and tailnet identity\. Verify actual loaded native command dispatch, cold/warm/concurrent/error/stop/restart behavior, and authenticated HTTPS access from an authorized remote tailnet device to the SAME existing session IDs, plus unauthorized and non\-tailnet denial\. Keep unmet acceptance visibly pending with concrete blockers; local/helper/source success does not complete remote acceptance\. Preserve unrelated dirty/staged/untracked work and the old Docker OpenCode data without deleting or mounting live database/credential directories\. Goal creation/planning is not permission for live networking/security/account changes, shared OpenCode restart, host Tailscale, publication, commit or push; retain exact applicable approval gates and make no live topology changes in the planning turn\.

## Persisted plan

Plan revision: `8` · updated 2026-10-29T11:32:25.000Z

> One\-shot completion plan, parent\-owned in ses\_e78fdcc9affeNOlKMRek7Yobo3: discover the existing authenticated localhost OpenCode service; review Docker\-only gateway topology and its exact networking gate; implement on\-demand discovery/lifecycle/native TUI integration; verify source and isolated topology before approved rollout; prove the remote browser reaches the same existing sessions; audit security, stop/restart/rollback and remaining blockers\. No live implementation/deployment in this planning turn\. No new agents, inferred budgets or blanket permissions\.

### Completion criteria

- /web targets the already\-running OpenCode instance and an authorized remote browser can see a known pre\-existing session with the same session ID; no second OpenCode server, copied database or mounted live OpenCode data/credential directory is required\.
- The gateway runs in Docker only, with no host Tailscale daemon\. The exact reviewed topology permits access to the existing loopback endpoint without rebinding OpenCode to 0\.0\.0\.0, disabling authentication, enabling Funnel/OpenTunnel, granting root/NET\_ADMIN or exposing a public OpenCode listener\. Any reduced Docker network isolation has separate explicit approval\.
- Supported endpoint discovery verifies the intended local service/connection at every start and refuses unknown, ambiguous, non\-loopback or unrelated targets\. No hard\-coded 4096/49374 assumption or broad process/environment/port scan substitutes for discovery\.
- The actual loaded native /web command cold\-starts only the approved gateway, verifies readiness and private Serve, and provides the correct usable URL\. Warm/repeated/concurrent/failure/cancel/expired\-login paths are tested\. /web stop stops only gateway resources and leaves the existing OpenCode backend/chats running\.
- Authorized remote\-device HTTPS validates certificates and supports authentication, session cookies/redirects and a harmless read\-only existing\-session check\. An unauthorized tailnet identity and a non\-tailnet client are denied\. Missing devices or human private entry remain explicit pending/blocked acceptance, not local\-test substitutes\.
- The old isolated Docker OpenCode container and its data remain preserved and are not started by the corrected workflow\. Gateway identity/state/Serve and cold\-start/stop/restart behavior persist as intended; rollback restores only the reviewed gateway state without deleting volumes, changing accounts, or interrupting the existing OpenCode service\.
- Relevant source/behavior/security/documentation/inventory/health checks pass with independently reviewed evidence\. Loaded TUI, local topology, authenticated remote access and negative network tests are recorded separately\. Unrelated dirty/staged/untracked work and all separate security/deployment/restart/commit/push/publication gates remain intact\.

### Phase `baseline` — completed

> Verify source identity, ownership, the actual existing OpenCode endpoint and preserved Docker state before changing the earlier isolated\-instance implementation\.

**Verification:**

> Current source/container/index baseline and supported nonsecret API identity were independently inspected\. Existing host service remains localhost\-only, native Tailscale inactive, both legacy containers stopped and volumes preserved\. Prior fixed\-port/two\-container helper is correctly identified as topology to replace, not accepted same\-instance access\.

- **`baseline-preservation` · completed:**
  > Owner: coordinator\. Recheck active peer/file ownership and scoped Git/index/diffs, plugin/helper/Compose source, existing containers and named\-volume metadata without reading secrets\. Preserve the old Docker OpenCode container/data; record a precise baseline of task\-owned changes\.
  - Evidence:
    > Verified canonical root/HEAD70e0477496e25655911341a07e00d55b2a5a61d9, active\-session map \(coordinator plus unrelated main\-work peer\), scoped source/diffs and exact stopped container IDs/mount metadata\. Preserved Tailscale volume tailscale\_tailscale\-state plus all4 OpenCode volumes\. Baseline10fileSHA/modes and staged\-patchSHA91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805 saved exclusively at /tmp/opencode/tailscale\-web\-goal\-fb884e3f/baseline\.json; no secrets/state contents read\.
- **`discover-existing-service` · completed:**
  > Owner: coordinator\. Verify supported OpenCode service/connected\-client discovery and a nonsecret identity check\. Current planning observation is http://127\.0\.0\.1:49374 with a loopback\-only listener; treat this as observed, not a fixed future port\. Define refusal behavior for remote, ambiguous, unavailable or mismatched instances and an existing\-session\-ID acceptance check\.
  - Evidence:
    > Actual opencode service status=http://127\.0\.0\.1:49374; authenticated GET/api/info reports version2\.1\.1,pid100227,urls\[loopback\]\. GET/api/session/ses\_e78fdcc9affeNOlKMRek7Yobo3 verifies exact existing ID/location\. Public2\.1\.1 TUI Context exposes client\.server\.info\(\)/session\.get\(\); discovery contract will compare connected server info and selected session against native authenticated localCLI discovery, refusing any mismatch/nonloopback/ambiguity\. No service setting/start/restart was changed\.

### Phase `topology` — completed

> Select and review a gateway\-only Docker architecture which reaches the actual existing loopback service without weakening OpenCode authentication or binding\.

**Verification:**

> Architecture, stale\-route risk, migration/rollback and same\-instance/auth contract reviewed in source with official current docs and actual nonsecret runtime facts\. This verifies source design only; exact host\-network deployment and migration authority are still absent and must block live effects, not authorized source work\.

- **`review-gateway-topology` · completed:**
  > Owner: coordinator\. Prepare the exact Linux Docker host\-networking topology for the non\-root userspace Tailscale container only\. Explain that it shares host networking but not host OpenCode storage; assess transport UDP/loopback health ports, collisions, capabilities, routing/DNS, no published app port and no host daemon\. If safeguards cannot be met, compare a narrowly scoped relay; do not silently substitute host\-installed Tailscale or a broadly bound app\.
  - Evidence:
    > Reviewed Docker's host\-network and detached\-exec lifecycle docs, actual pinned image digest80c4a9a3\.\.\., existing volume metadata and current free9002port\. Added tailscale/docs/existing\-instance\-gateway\.md: one non\-root userspace gateway, host network only, no host OpenCode storage, no app/public port, no capabilities/TUN/root, direct tailscaled/nohealthHTTPserver, restart=no, legacy containers stopped\. Narrow relay tradeoff explicit; live network exception not granted\.
- **`preview-migration-rollback` · completed:**
  > Owner: coordinator\. Produce a nonsecret exact Compose/container/Serve diff and state\-preserving backup/rollback procedure\. Preserve the existing Tailscale identity and avoid simultaneous writers to its volume\. Do not start or delete the old isolated OpenCode server or its volumes\. Identify the exact additional live networking/deployment authority required; goal creation does not grant it\.
  - Evidence:
    > Design document names exact newgateway/container/project/image/externalvolume and ordered backup/restore\-gated migration/rollback\. Identified critical stale4096Serve hazard: legacy persisted route must be cleared through its bridge namespace before reusing state on host networking\. Proposed foreground Docker\-exec Serve does not auto\-republish stale targets on restart\. No backup/legacy start/Serve reset/newcontainer/network mutation executed; exact generated manifest/diff will be reviewed before gated apply\.
- **`define-instance-auth-contract` · completed:**
  > Owner: coordinator\. Verify public native TUI command/alias and OpenCode authentication/pairing/session\-cookie/origin contracts\. Define how /web selects the existing backend, shows a private URL without model\-visible tokens, and keeps native pairing usable\. Document and test any unavoidable /pair alias effects rather than introducing duplicate ambiguous /web commands\.
  - Evidence:
    > Read public2\.1\.1 client/server\.info/session\.get and native DialogPair/server handler source\. Current host /web=200 assets,/api/info=401; new readiness must not require UI401\. Authenticated localCLI PID/version/URL plus exactselectedsession comparison defines same\-instance refusal contract\. Native server\.pair issues one\-time codes; browser redemption returns relative / redirect and HttpOnly/SameSite=Lax cookie\. Plan user\-triggered UI\-only HTTPS\-origin pairing, no real codes generated/captured and no auth/account settings changed\. Native server\.pair alias replacement is explicit\.

### Phase `implementation` — completed

> After implementation is authorized, replace the earlier two\-container/fixed\-port helper with tested gateway\-only discovery and lifecycle behavior; do not deploy the new topology in source tests\.

**Verification:**

> Gateway\-only discovery/lifecycle, passive public TUI adapter and pinned reviewed manifest are source\-ready under65verifiedsource/fixture/parser/inventorychecks plusactualnativeidentity andrealflock\. Original isolated\-backend behavior is no longer a fallback\. RuntimeforegroundJSON/native\-dispatch/remote checks remain explicit separate required layers, not inferred from source passes\. Prompt\-to\-artifact audit is tailscale/docs/gateway\-acceptance\.md\.

- **`implement-discovery-lifecycle` · completed:**
  > Owner: coordinator\. Update tailscale/scripts/web\-on\-demand\.mjs and tests to resolve and validate the existing endpoint on each startup, operate only the approved Docker gateway, preserve unrelated Serve routes and state, and require protected API/private Serve readiness\. Add bounded start/stop/failure/cancel and cross\-command/instance concurrency protection\. Refuse account/policy prerequisites rather than auto\-consenting\.
  - Evidence:
    > Replaced fixed\-port/two\-container helper with existing\-instance nativePID/version/URL/session discovery; one strict pinned/hardened host\-network gateway only; no legacyapp fallback; immutable\-ID start/stop; exclusive state\-volume writer check; foreground\-only Serve; monotonic deadline; same\-request dedupe; bounded cancel/failure cleanup\. Added gateway\-discovery\.mjs/gateway\-lock\.mjs and updated tests preserving prior failure categories\.50/50 tests pass incl realcross\-process flock and lockreplacement/symlink/mode/hardlink checks\. Actual read\-only native discovery confirmed pid100227/version2\.1\.1/loopback49374/exactcurrentchat\. Node syntax/diff checks pass\. Foreground Docker runtime shape/live topology remain separately unverified/gated\.
- **`implement-native-command` · completed:**
  > Owner: coordinator\. Update \.opencode/plugins/tailscale\-web/ through public TUI APIs so /web starts the gateway and /web stop stops only it\. Registration/reload must remain passive\. Preserve backend identity, error privacy, stale\-dialog cleanup, and intended native pairing behavior\. No LLM\-driven shell fallback or host Tailscale path\.
  - Evidence:
    > Public TUI adapter now reads connected server\.info and selected route, passes exact identity to gateway, rechecks backend before/after native pairing, keeps single\-use code only in native dialog, redacts upstream errors and suppresses stale/duplicate/unloaded actions\. /web and native /pair alias explicitly share gateway behavior; stop performs no backend discovery or pairing\.56/56 combined tests pass, including6new native\-UI contract/privacy/race cases and strengthened unload\-during\-start handshake; controller syntax passes\. No real pairing code, native command dispatch, GUI account action or remote acceptance was claimed\.
- **`implement-reviewed-compose-source` · completed:**
  > Owner: coordinator\. Add/change the smallest reviewed gateway\-only Compose source and pinned runtime configuration, retaining non\-root/read\-only/drop\-ALL/no\-new\-privileges/userspace controls and the approved network exception only\. Preserve existing isolated\-instance resources; no root, Docker socket or live database/credential mount inside the gateway\.
  - Evidence:
    > Added separate tailscale/compose\.gateway\.yaml: projecttailscale\-web/servicegateway/explicitgateway\-reviewedprofile; inspected immutable image digest; userspace directtailscaled, UID65532, hostnetwork only, stateexternalvolume\+tmpfs, read\-only/dropALL/nonewprivileges/boundedCPU\-RAM\-PIDs/restartno\. No app/env/ports/bindmounts/build/pull\. Actual DockerCompose parser2/2tests and config\-\-quiet pass with \-\-env\-file/dev/null; legacycompose\.yaml/ROADMAP hash\-identical to this goal's baseline\. No container creation/network change/state migration performed\.
- **`verify-source-and-fixtures` · completed:**
  > Owner: coordinator\. Independently review the combined diff including untracked source; run meaningful Node tests, syntax checks, relevant existing Tailscale tests, inventory/doc checks and health\. Add adversarial target/identity/security/timeout/concurrency/rollback coverage\. Existing 20 tests and prior Docker cold\-start concern the OLD isolated topology and do not complete these tasks\.
  - Evidence:
    > Independently reread actual helper/controller, preserved distinct failure coverage, and ran combined58gateway\+7inventory=65/65PASS\. Actual offlineComposeparser/quiet validation pass; originalPython37PASS/3explicitopt\-in skips \(40discovered\); fullhealthPASS; selectedNode syntax/diffchecksPASS\. In\-memory removal of productionPIDidentityguard acceptswronginstance, productionrejects; no source modified by negativecontrol\. Real native read\-only discovery confirms current chat/pid100227/version2\.1\.1\. Acceptance/checklist\+qualityaudit\+guides/inventory updated\. Final stagedpatchSHA unchanged; legacyCompose/ROADMAP/nativeentry bytes unchanged; hostTailscaleinactive; oldcontainersstillstopped; existingOpenCodePID/URLunchanged\. No realpairing/network/state/deploy effects\.

### Phase `rollout` — blocked

> Under exact implementation/deployment authority, validate the new topology and load the real TUI command without a shared OpenCode restart\.

**Blocker:**

> Exact separate authority for the Docker host\-network isolation exception and real identity backup/tested\-restore/stale4096Serve migration has not been provided\. A generic goal continuation does not grant that security/deployment change\. No new gateway exists; both legacy containers remain stopped\. Cannot run the host\-network fixture or provision against real state without this external authorization\.

- **`verify-isolated-topology` · blocked:**
  > Owner: coordinator\. Use an explicitly scoped synthetic localhost fixture and the reviewed Docker image/network mode to prove gateway\-to\-loopback access, TLS/proxy behavior, app\-auth preservation, no public app listener and resource cleanup before touching the real target\. Distinguish synthetic checks from same\-instance acceptance; any network\-mode test retains its exact authority gate\.
  - Blocker:
    > Even the proposed synthetic fixture requires the specifically reviewed host\-network mode; exact authority for this reduced\-isolation runtime test is absent\. OfflineCompose/parser/mock checks do not replace it\.
- **`apply-approved-gateway` · blocked:**
  > Owner: coordinator; operator owns any required consequential authorization/private account action\. Recheck the exact approved nonsecret diff, preserve device state, and recreate/configure only the gateway against the discovered real endpoint\. Leave old Docker OpenCode stopped and volumes intact; leave the existing host OpenCode service and Tailscale accounts/policy unchanged unless separately authorized\.
  - Blocker:
    > Requires exact authorization for host\-network gateway provision plus opaque identity backup/tested restore and clearing only the stale old background rootServe route in legacybridge namespace\. No implied authority from goal creation/continuation; live host app/network/account settings untouched\.
- **`verify-loaded-tui-lifecycle` · blocked:**
  > Owner: coordinator with operator only for inaccessible native UI\. Verify plugin discovery/command dispatch in the actual TUI, cold/warm/repeated/conflicting requests and /web stop\. Demonstrate that stopping gateway does not interrupt the existing service/session\. Prior desktop input bridge returned INPUT\_FAILED; do not treat source registration/helper execution as native TUI acceptance or repair unrelated desktop security as a workaround\.
  - Blocker:
    > Depends on approved gateway provision\. Native UI command dispatch additionally remains unobserved because the previous desktopinputbridge refused input; fixtureadapter success is not native acceptance\.

### Phase `remote-acceptance` — blocked

> Prove the user's actual same\-instance remote workflow and private network boundary, not merely a local proxy response\.

**Blocker:**

> Depends on approved topology/migration/deployment and actual nativecommand readiness; also needs an operator\-controlled authorized distinct tailnet device, unauthorized/off\-tailnet test clients and human\-only private sign\-in\. None of these remote acceptance observations has occurred\.

- **`authorized-device-same-session` · blocked:**
  > Owner: coordinator for nonsecret verification; operator controls remote device and all private login/MFA\. From an authorized distinct tailnet device validate HTTPS, complete normal application sign\-in without exposing tokens/cookies/passwords, open a known pre\-existing chat and verify the exact same session ID with harmless read\-only behavior\. Verify redirects/cookies and any streaming needed to display that existing chat\. No second\-device peer was online during planning; keep pending if unavailable\.
  - Blocker:
    > No deployed existing\-instance gateway yet; distinct authorized remote\-device browser/private sign\-in is operator\-controlled and not available as a verified observation in this session\. Existing local session identity is proven, remote same\-session access is not\.
- **`unauthorized-and-off-tailnet` · blocked:**
  > Owner: coordinator with operator\-controlled test identities/devices\. Confirm policy denial for an unauthorized tailnet identity and lack of service access from outside the tailnet; confirm no Funnel/OpenTunnel/public OpenCode listener\. Do not broaden or edit policy just to make the positive test pass\. Record which tests actually ran and any unavailable distinct\-user identity\.
  - Blocker:
    > No approved/deployed gateway or verified controlled unauthorized/off\-tailnet test clients\. Source noFunnel/route refusals are not live policy/network denial\.
- **`remote-stop-restart-rollback` · blocked:**
  > Owner: coordinator\. Repeat the authorized check after gateway stop/start; verify offline\-on\-stop, unchanged existing service/chats, retained device identity and expected Serve mapping\. Exercise the reviewed bounded rollback under its exact authority and verify no host daemon or unrelated container/service was started/stopped\. Do not infer reboot persistence from a single restart\.
  - Blocker:
    > Requires approved identity backup/restore, deployed gateway and positive remote baseline\. Cannot replace those with old isolated\-backend restart evidence or perform a gated real rollback now\.

### Phase `final-audit` — blocked

> Finish with truthful user instructions and layered evidence; no whole\-goal completion while required remote/native checks remain unfinished\.

**Blocker:**

> Source\-level audit and truthful draft guides are prepared, but final reconciliation and whole\-goal completion require the missing native/live/remote/rollback evidence above\.

- **`update-guides-inventory` · pending:**
  > Owner: coordinator, respecting shared\-file ownership\. Update tailscale/docs/web\-on\-demand\.md, the Docker guide, docs/features\.md and documentation index to describe gateway\-only existing\-instance behavior, on\-demand/stop semantics, prerequisites, exact networking exception, auth, data preservation and rollback\. Replace earlier isolated\-instance claims without erasing historical evidence\.
  - Evidence:
    > Current source guides, rootinventory/docindex and qualityaudit already describe existing\-instance gateway, exact exception/migration gates and historical oldbackend distinction\. tailscale/docs/gateway\-acceptance\.md maps all7criteria and explicit artifacts/commands/gates\. Final live evidence reconciliation remains pending\.
- **`audit-all-acceptance` · blocked:**
  > Owner: coordinator\. Audit immutable completion criteria against actual source, loaded native TUI, local topology, authorized same\-session remote use, unauthorized/off\-tailnet denial and lifecycle/rollback evidence\. Rerun affected checks/diff preservation, list residual blockers explicitly, and close complete only if all required evidence exists\. No commit/push/publication or unrelated goal/session mutation is included\.
  - Evidence:
    > Completed the current blocked\-state prompt\-to\-artifact audit in tailscale/docs/gateway\-acceptance\.md; all source/local claims are qualified and every required native/remote layer remains recorded\. No whole\-goal success claimed\.
  - Blocker:
    > Cannot verify immutable same\-session remote/native/negative\-network/lifecycle/rollback criteria without the missing exact deployment authority and operator\-controlled remote/private\-entry observations\.

### Decisions

- Planning observations: existing host OpenCode responds at loopback 127\.0\.0\.1:49374; both earlier tailscale Docker containers are stopped\. No host Tailscale daemon should be used\. The corrected gateway must serve those existing host sessions, not run a second backend\.
- Recommended topology is Linux host networking for the containerized userspace Tailscale gateway only\. Docker documents that this shares the host network namespace, allowing loopback reachability but reducing network isolation\. This is a proposal, not a live change or granted security exception; exact deployment review/authority precedes apply\.
- Do not mount or copy the live OpenCode database/config/credentials into Docker and do not run two OpenCode servers against one database\. Preserve the existing isolated Docker server's data, stopped, rather than deleting or migrating it implicitly\.
- Discover the actual endpoint at invocation through supported native service/client mechanisms\. Fixed 4096/49374 values, host\-gateway assumptions and broad host scans are not endpoint identity proof\.
- The current plugin overrides server\.pair, thereby affecting /pair as well as /web\. Revisit that public command contract explicitly, preserving secure pairing usability and avoiding duplicate slash registrations; do not fabricate a supported alias\-intercept API\.
- Source tests, actual helper cold\-start of the old topology, loaded TUI dispatch, same\-instance identity, authenticated remote use and denied network access are distinct evidence layers\. Earlier 20\-test/helper passes are retained as historical baseline only\.
- Coordinator owns all planning, edits, integration and acceptance\. No subagents are authorized or spawned\. Operator involvement is limited to unavailable remote\-device/private\-entry actions and exact consequential approvals; ordinary technical decisions do not become routine handback questions\.
- No implementation or live topology mutation in the planning turn\. No inferred token budget, duration cap or auto\-turn cap\. Separate network/account/security/deployment/shared\-restart/commit/push/publication gates and native permission denials remain effective\.
- At the actual source/rollout boundary, all meaningful independent source work is verified\. Current code intentionally refuses the missing reviewed gateway instead of restarting the legacy isolated server or choosing a host daemon\. Remaining mandatory blockers are exact host\-network/migration authority and real native/remote/private\-entry observations; do not silently weaken requirements or repeat source passes as acceptance\.

