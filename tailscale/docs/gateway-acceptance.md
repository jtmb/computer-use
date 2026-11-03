# Existing-instance gateway: requirement-to-evidence checklist

Date: 2026-10-29. Owner: coordinator `ses_e78fdcc9affeNOlKMRek7Yobo3`.
Goal: `fb884e3f-2e6c-435a-9974-ede2b04d717f`.
Continued source acceptance: 2026-10-30 UTC, execution goal
`4cbaf68c-9b82-43bd-a8da-154811dd61eb`; original goal/evidence lineage retained.
**The requested end-to-end deliverable is not complete.**

| Requirement | Artifact/evidence | Current disposition |
| --- | --- | --- |
| Reach the existing OpenCode and chats, not a second backend | [Discovery](../scripts/gateway-discovery.mjs) compares connected/local PID, version, one loopback URL and selected session ID. Actual read-only native discovery confirmed this existing chat. | PASS local native discovery; PENDING same-session remote browser proof. |
| Find the actual endpoint, without hard-coded ports or broad scans | [Discovery tests](../tests/gateway-discovery.test.mjs) exercise a non-default port, PID/URL/status/session mismatch, missing/ambiguous endpoints, unsafe URLs, and implicit/default or zero ports. Native CLI commands are `opencode service status`, `opencode api get /api/info` and the exact selected-session GET. | PASS source and local native check. An in-memory removal of the production identity guard accepts the wrong PID while production rejects it; no source was modified by that negative control. |
| Docker gateway only; no host Tailscale or duplicated database | [Gateway manifest](../compose.gateway.yaml), [lifecycle](../scripts/web-on-demand.mjs), [reviewed topology](existing-instance-gateway.md). One gateway, only external Tailscale state plus tmpfs; no app service, dotenv, Docker socket, live database or credential mount. Runtime identity requires the exact `no-new-privileges:true` option, empty PID/UTS/user namespaces, default/private IPC, no added groups/capabilities and no devices. | PASS source/actual offline Compose parser; PENDING live deployment and confirmation that the pinned image exposes those exact inspect values. |
| Reach host loopback without making OpenCode LAN/public-facing | Proposed Linux host network namespace for the non-root userspace gateway only; host app binding remains unchanged. | BLOCKED live host-network test/deployment until exact network-isolation exception is authorized. No substitute 0.0.0.0 bind, NET_ADMIN, TUN or host daemon. |
| Preserve enrolled identity and old application data | Existing stopped container IDs and five named volumes inspected without state/credential contents. Legacy Compose/ROADMAP remain byte-identical to this goal's baseline. | PASS metadata/preservation so far; PENDING opaque identity backup plus tested restore, exact stale-route migration and live persistence/rollback. |
| Prevent stale Serve from proxying an unrelated host port | [Migration review](existing-instance-gateway.md) requires clearing only the old background root route inside the legacy bridge namespace before reusing state. New helper accepts only the exact foreground private route after rediscovery. | PASS source refusal tests; BLOCKED real state/Serve migration. Effective foreground status JSON still needs live validation. |
| `/tailscale-web` wakes only the gateway; `/tailscale-web stop` leaves OpenCode running | [Native entry](../../.opencode/plugins/tailscale-web/tui.js), [adapter](../../.opencode/plugins/tailscale-web/controller.mjs), [lifecycle tests](../tests/web-on-demand.test.mjs). Actions target only validated immutable gateway IDs, never the legacy app or host service. | PASS source/fixture behavior; PENDING loaded native command plus actual existing-instance Docker lifecycle. |
| Cold/warm/repeated/concurrent/failure/cancel/timeout/expired-enrollment behavior | Lifecycle tests preserve earlier distinct failure categories and add wrong-instance rechecks, state-writer checks, cleanup failure, monotonic deadlines and cleanup of a container the daemon started even when the client start command fails, times out or is cancelled. Cleanup is armed only at start dispatch, after lock, cancellation and deadline checks; pre-dispatch failures issue no compensating stop. [Lock](../scripts/gateway-lock.mjs) and [real subprocess/filesystem tests](../tests/gateway-lock.test.mjs) serialize cooperating plugin processes, including pre-cancelled acquisition. | PASS bounded source/real-lock tests; PENDING live foreground lifecycle. External Docker changes remain a sampled, non-atomic boundary. |
| Preserve authentication and usable pairing, without exposing secrets to the model | Native adapter uses public authenticated client APIs, confirms backend before/after issuing a one-time code, displays it only in user-triggered native UI, redacts upstream errors, suppresses duplicate/stale dialogs, and stops only the gateway when the backend identity changes or cannot be re-verified after publishing. [UI contract tests](../tests/gateway-native-ui.test.mjs) use synthetic tokens only. | PASS source/fixture checks. Native `/web` and `/pair` are not replaced; the gateway has its own slash name. PENDING real user-controlled sign-in/cookie/redirect/streaming acceptance. No real pairing code was requested during verification. |
| Valid HTTPS from an authorized second device to the same chat | [Runbook](web-on-demand.md) retains distinct-device TLS/app authentication/existing-session-ID checks. | PENDING deployment and an operator-controlled authorized remote device/private sign-in. No local/helper pass substitutes for it. |
| Unauthorized tailnet identity and non-tailnet client denied; no Funnel/OpenTunnel | Lifecycle rejects public/persistent/additional/different routes. Manifest has no public application port. | PASS source refusal checks; PENDING actual policy/network negative tests. No account/policy/HTTPS consent was changed. |
| Stop/restart/rollback without session loss or unintended auto-start | Restart policy `no`, nonpersistent foreground Serve, exact migration/rollback review; data/containers preserved. | PASS source/parser; PENDING actual identity backup/restore and same-session stop/restart/rollback checks. Reboot behavior is not inferred from a restart. |
| Preserve unrelated work and separate consequential authority | Scoped baseline at `/tmp/opencode/tailscale-web-goal-fb884e3f/baseline.json` records ten source hashes/modes, original staged-patch hash and HEAD. Only bounded patches in the owned feature/docs sections; unrelated peer work is not attributed to this goal. | PASS checks so far; no commit, push, publication, shared restart, host daemon activation or live gateway provisioning. |

## Commands verified in this source pass

Parent continuation on 2026-10-30 UTC:

- Gateway suites: **76/76 PASS**, zero skips. With adjacent
  `scripts/features-contract.test.mjs`: **83/83 PASS**, zero skips, including the
  actual offline Compose parser. The earlier inventory failure below is resolved
  by parent CI/inventory integration, not hidden or still outstanding.
- Three pre-dispatch cleanup regressions failed before moving cleanup arming:
  lock identity failure, cancellation after verification and deadline exhaustion
  after verification. Start-dispatched failure/cancellation cleanup still passes.
- Two UI regressions failed before correction: navigation could skip backend
  verification after startup/pairing, and pairing failure could leave an
  unverifiable backend's route running. Identity checks now precede chat-based
  early returns; failed pairing also rechecks. A valid gateway is still left
  running when only the selected chat changes or pairing fails with stable identity.
- These are synthetic command/client/UI boundaries plus real lock/parser tests,
  not live Docker or native dispatch. Backend identity is sampled during the
  command; no continuous post-command backend/port monitoring is implemented.

Earlier worker/source-pass observations (retained as dated history):

- `node --test --test-reporter=spec tailscale/tests/gateway-*.test.mjs tailscale/tests/web-on-demand.test.mjs`:
  **72/72 PASS** (source/fixture/parser/lock cases). Offline source checks only;
  no container, tailnet, pairing code or real state was used.
- The same command plus `scripts/features-contract.test.mjs`: **78 pass / 1 fail**.
  The failure is the concurrent, untracked `scripts/ci-offline.mjs` not yet named in
  `docs/features.md`; it is unrelated to this feature and its shared inventory was
  not edited here. The previously recorded `65/65` included those seven inventory
   cases before that new script appeared. Superseded by the parent pass above.
- `docker compose --env-file /dev/null --file tailscale/compose.gateway.yaml --profile gateway-reviewed config --quiet`:
  PASS, no deployment or real dotenv read.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -q` from
  `tailscale/`: **37 PASS, 3 opt-in runtime tests skipped**, 40 discovered.
- Selected Node syntax checks and `git diff --check`: PASS.

Previously recorded, not re-run during this source pass: `scripts/health-check.sh`
and the read-only native PID/version/loopback/session discovery. They remain dated
2026-10-29 evidence for their own layers; neither is a substitute for the live gates
below, and the earlier observed pid/port is not reused as a current runtime claim.

## Blocked-action audit

Remaining live work requires an exact, reviewed authorization for the Docker
host-network exception, opaque identity backup/tested restore and old-route
migration before provisioning. A generic goal continuation does not supply that
separate security/deployment gate. The proposed source/sequence is in
[existing-instance-gateway.md](existing-instance-gateway.md). No hidden permission
grant, profile/security edit, native ask/deny bypass or host-daemon fallback is used.

After that gate, native command loading and authorized/unauthorized/off-tailnet
remote tests still require actual observations. The prior desktop bridge refused
input; source-only UI tests are not a replacement for that layer. Human login/MFA
and a distinct remote device remain user-controlled. Keep these tasks pending or
explicitly blocked, never complete merely because source checks pass.
