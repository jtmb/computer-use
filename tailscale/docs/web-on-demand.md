# Existing OpenCode web access through Docker on demand

**Current status: corrected source implemented; gateway migration/deployment and
native/remote acceptance remain pending.** The two legacy Docker containers stay
stopped, with their volumes intact. Host OpenCode remains unchanged.

## What the plugin does

- `/tailscale-web` discovers the **existing** authenticated OpenCode
  service and selected chat, then starts only the reviewed Docker Tailscale
  gateway. No second OpenCode server or copied/mounted live database is used.
- After readiness and identity rechecks, it displays a native single-use pairing
  link for that same backend over private HTTPS. Pairing codes stay in native UI,
  not model tools, logs or storage. Do not capture the UI while a real link is open.
- `/tailscale-web stop` stops only the gateway. Your OpenCode backend and chats keep running.
- If the backend identity changes or cannot be re-verified after the route is
  published during the command, no pairing link is shown and the plugin stops **only the gateway**
  (even one that was already running), so a stale route cannot keep proxying
  whatever later reuses that loopback port. Checks are sampled during the command,
  not continuous monitoring after it returns; stop explicitly when finished.
- Registration/reload is passive. Matching requests share one operation; other
  requests are refused while busy. A private real `flock` excludes other plugin
  processes; the persistent lock inode is not deleted in normal operation.
- Docker restart policy is `no`: there is no always-on/reboot auto-start or idle
  timer. Stop explicitly when finished. Foreground Serve ends with the container;
  a later `/tailscale-web` must rediscover and revalidate before publishing again.

This is a custom OpenCode TUI plugin, not a Docker-managed plugin or native
OpenCode tunnel feature. The only network-isolation exception proposed is Linux
host networking for the **containerized Tailscale gateway**, so it can reach the
host's loopback listener. No host Tailscale daemon is used. Host networking reduces
network isolation; it does not require host filesystem access, root, NET_ADMIN,
TUN, Docker socket, OpenCode rebinding, Funnel or OpenTunnel.

## Setup and loading

The [reviewed architecture/migration/rollback](existing-instance-gateway.md) owns
the exact live gate. [compose.gateway.yaml](../compose.gateway.yaml) is the
separate, digest-pinned `tailscale-web` project, service `gateway`, explicit
`gateway-reviewed` profile. **Do not provision it until migration is authorized.**
The legacy node has a saved 4096 route that must be cleared in its bridge namespace
before its identity volume is reused with host networking. Starting that state
unchanged could expose a different host service briefly. No real migration has
been performed, and the helper cannot provision/recreate containers as a fallback.

Required: Linux Docker Engine/Compose, Node, `flock`, accessible native `opencode`
CLI, and the existing enrolled node's approved tailnet HTTPS/access policy.
User login/device approval, policy, DNS/HTTPS consent and live networking remain
separate gates. Native discovery compares connected/local PID, version, advertised
explicit non-zero loopback port and selected session ID. It refuses unrelated,
ambiguous, implicit/default-port and zero-port targets; neither 4096 nor 49374 is a
fallback port.

OpenCode V2 discovers `.opencode/plugins/tailscale-web/tui.js` locally. Check
`/plugins` for `computer-use.tailscale-web`; the command is described as **Open
Docker web over private Tailscale**. If needed, reopen only the TUI, not the shared
backend. Source discovery does not prove a running TUI loaded the command. The
gateway has its own `/tailscale-web` slash name; native `/web` and `/pair` are not
replaced, so they keep working without Docker or Tailscale. No duplicate slash
entry or disconnected-backend pairing fallback is registered. No global CLI
configuration was changed.

Only private, pinned, non-root/read-only/drop-ALL/no-new-privileges gateway
metadata is accepted. The runtime check requires the exact single
`no-new-privileges:true` security option and refuses host PID/UTS/user namespaces,
non-private IPC, added groups or capabilities and any device. Its only named volume
is Tailscale identity state; other mounts must be the approved tmpfs locations.
The helper never reads `.env`, exports
`Config.Env`, collects app logs, builds/pulls images, starts legacy OpenCode, or
changes app credentials. The existing UI's 200 response and protected API's 401
challenge are checked separately. Persistent/additional/differing Serve or Funnel
routes are refused without overwriting. Startup failure/cancellation stops only a
  gateway this operation attempted to start — including when the daemon started it
but the client command failed, timed out or was cancelled — with explicit
unconfirmed-cleanup reporting; it does not stop a pre-existing gateway or the
  OpenCode backend.

Cleanup is armed at start dispatch only after lock verification and final
cancellation/deadline checks. Failure before dispatch issues neither start nor
compensating stop. Chat navigation cannot bypass backend verification, and a
failed pairing call rechecks identity before leaving the gateway running.

## Verification — parent continuation 2026-10-30 UTC

The [requirement-to-evidence checklist](gateway-acceptance.md) separates every
source/local/native/remote result and the remaining deployment gate.

- **PASS, source/fixtures:** 76 cases across discovery, real-filesystem/process
  locking, lifecycle, native-UI contracts and actual offline Compose parsing.
  Wrong endpoints/instances, implicit/default ports, selected-chat mismatch, state
  writers, auth/UI failures, unsafe mounts/privileges/security options/namespaces,
  stale routes, deadlines, cancellation, start-attempt cleanup, unverified Serve,
  duplicate/stale pairing and cleanup failure have distinct assertions. Three
  pre-dispatch cleanup and two identity/early-return regressions failed before
  their fixes; existing start-dispatched cleanup remains covered.
- **PASS, adjacent inventory:** the same command plus
  `scripts/features-contract.test.mjs` is **83/83**, zero skips. Parent integration
  resolved the earlier worker result of 78 pass / 1 inventory failure; the prior
  72-case gateway-only result is historical, not a live acceptance receipt.
- **Historical PASS, actual read-only native discovery (2026-10-29):** the helper verified the then-current
  existing OpenCode PID/version/address and this chat's exact session ID without
  reading credentials or changing the server.
- **PENDING:** actual host-network gateway fixture, identity backup/tested restore,
  reviewed migration/deployment, effective foreground Serve runtime shape,
  loaded native command, distinct-device HTTPS/same-chat sign-in, unauthorized
  tailnet/non-tailnet denial and live stop/restart/rollback.
- **Known live UI limit:** a previous desktop input attempt returned INPUT_FAILED;
  the composer remained empty. There is no fresh native-dispatch success claim.
- **Historical only:** the earlier 20 tests and actual Docker cold-start validated
  the separate isolated OpenCode backend. They do **not** prove existing-instance
  access and do not satisfy the current remote deliverable.

From the parent checkout, source tests (no live host-network container) are:

```bash
node --test tailscale/tests/gateway-*.test.mjs tailscale/tests/web-on-demand.test.mjs
```

## Rollback

`/tailscale-web stop` stops only the approved gateway and ends its foreground Serve process.
Disabling the plugin leaves Docker unchanged and removes only `/tailscale-web`;
native `/web` and `/pair` pairing remain available either way. Follow the reviewed
state backup/restore path
before reverting migration; source changes alone are not identity rollback. Never
delete volumes, reset unrelated Serve state, restart host OpenCode, reactivate host
Tailscale or start the legacy app as an implicit rollback.
