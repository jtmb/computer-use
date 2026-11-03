# Existing-instance Docker gateway: reviewed design and deployment gate

Status: **source implementation; not deployed** (2026-10-29). Coordinator:
`ses_e78fdcc9affeNOlKMRek7Yobo3`, goal
`fb884e3f-2e6c-435a-9974-ede2b04d717f`.

## Selected topology

Run only Tailscale in a new `tailscale-web-gateway-1` Docker container with Linux
`network_mode: host`. Its userspace network stack can proxy the existing host
OpenCode **loopback** HTTP service. OpenCode itself is neither moved nor restarted.
Host networking deliberately removes the container's network namespace boundary;
it does not grant host filesystem, PID namespace, root or administrative access.
This exception requires exact networking/deployment authorization before apply.

Keep UID/GID `65532`, read-only rootfs, dropped capabilities, no-new-privileges,
userspace networking, bounded memory/CPU/PIDs and private writable state/tmpfs.
No published ports, Docker socket, host database/config/credential mounts,
`NET_ADMIN`, TUN device, Funnel or OpenTunnel. Runtime identity validation also
requires the exact single `no-new-privileges:true` security option and rejects
host PID/UTS/user namespaces, non-private IPC, added groups/capabilities and any
device. The Tailscale daemon may open its
encrypted transport UDP socket on host networking; this is not a public OpenCode
listener. Run `tailscaled` directly rather than `containerboot`: no dotenv/auth-key
environment and no loopback health HTTP listener are required. Docker restart
policy is `no`; only an explicit `/tailscale-web` invocation wakes the gateway.

The old `tailscale-tailscale-1` and `tailscale-opencode-1` containers stay stopped,
not removed. The gateway exclusively reuses `tailscale_tailscale-state`, preserving
the enrolled node identity. No two daemon containers may mount/use that state
concurrently. OpenCode's four old Docker volumes remain untouched and unused.

Alternative considered: bridge networking plus a narrow host relay/socket. That
retains a network namespace but adds a host relay process and socket lifecycle/
access policy. A `host-gateway` address alone cannot reach a listener bound only
to host loopback. Do not add a broad app binding or silently fall back to the
retired host-native Tailscale daemon. Revisit a relay only under its own review.

## Discovery and authentication contract

At invocation, public `context.client.server.info()` provides the connected
server's PID/version/advertised URLs. Compare it to supported local
`opencode service status` and authenticated `opencode api get /api/info` results.
When a chat is selected, also verify its exact ID through the local native API.
Require one unambiguous `http://127.0.0.1:<port>` endpoint with an explicit
non-zero port and no userinfo, query, fragment or path prefix, and matching
identity. A default (:80), zero or implicit port is not a reviewed listener.
Never search arbitrary processes, ports, environments or credential files. Never
fall back to `4096` or `49374`.

The actual current backend serves `/web` as public UI assets (HTTP 200), while
unauthenticated `/api/info` returns 401. Therefore requiring 401 from `/web`, as
the old isolated-container helper did, is incorrect. Require protected API 401
plus authenticated native instance/session identity; verify the UI separately.
Recheck identity immediately before enabling the route. A mismatch fails closed.

Use a **foreground** Serve process inside Docker, launched with detached
`docker exec`, not persisted `serve --bg`. It lives only for that container run;
after daemon/container restart `/tailscale-web` must rediscover and revalidate the backend
before publishing again. Refuse other/extra/persistent Serve or Funnel routes.
Bound startup, verify the exact effective HTTPS route and retain no stale default
target. A running differing route is a refusal, not permission to overwrite it.

The status parser accepts only the reviewed shape: no top-level persistent
`TCP`/`Web`/`Services` routes, exactly one foreground session whose single
`HTTPS:443` handler maps only `/` to the exact discovered target under the
daemon's own `<name>.ts.net:443` authority. Top-level routes are refused as
unmigrated persistence; the pinned daemon's effective foreground JSON remains a
live-gate check, not a source claim. If a cold start publishes but the route cannot
be verified, the gateway this operation attempted to start is stopped; on a
pre-existing gateway the helper leaves it running and reports that `/tailscale-web stop` is
required. The plugin's separate identity-change stop is described under Rollback.

Native V2 `server.pair()` can issue a one-time link for the same backend. If used,
generate it only on the user's explicit command, replace only its origin with the
verified private HTTPS origin, and present it directly in native UI. Never return
codes/cookies/passwords to model tools, diagnostics or storage; avoid observation
while a real pairing link is visible. Preserve expiry/single-use semantics and
keep native `/web` and `/pair` unreplaced rather than duplicating their entries.

## Exact migration preview — NOT EXECUTED

Reviewed source: [compose.gateway.yaml](../compose.gateway.yaml) (a separate Compose project,
not an edit/recreate of the legacy application). Image:
`ghcr.io/jtmb/tailscale@sha256:80c4a9a3b327475b330e76f9c31b52b7038e44963c58f2a90a3493f28dcac993`,
already present locally and inspected. One external state volume; no builds,
pulls, app containers or secret interpolation.

The earlier state contains a persistent Serve route to container port 4096.
**Do not boot that state on host networking unchanged:** it could momentarily
proxy a different host service before validation. The approved migration must:

1. Reverify exact container/image/volume identities, both legacy containers
   stopped, no other state-volume writer, and OpenCode unchanged/loopback-only.
2. Make a private, opaque backup of the stopped Tailscale volume in the approved
   project-local ignored backup directory. Do not print/read its contents. Verify
   restore against a disposable volume before relying on it; keep originals.
3. Start only the legacy **bridge-networked Tailscale** container under the exact
   migration authority. Confirm its sole old private route; disable just that
   root HTTPS route with `tailscale serve --bg --https=443 off`, retaining the
   original route's background/port flags in the documented off form.
   Do not reset all Serve state or start the old OpenCode container. Stop the
   legacy Tailscale container only after confirming no persisted routes remain.
   Any unrelated route blocks migration.
4. Provision only the reviewed gateway, with the same state volume, on host
   networking. Do not enroll another node or change tags/policy/HTTPS consent.
   Require `/tailscale-web` to revalidate the existing service before foreground Serve.
5. Verify app binding/authentication, the exact private route, and that old
   application containers remain stopped. Complete distinct remote and denied
   access tests separately; a local 401 is not remote acceptance.

No migration/network-mode test, backup of real identity, account/policy change,
container recreation or shared service restart is authorized by this document
or a generated goal record. Missing exact authority is a blocked live action,
not a reason to interrupt independent authorized source work.

## Rollback and acceptance

Stop only the new gateway; foreground Serve ends with it. Preserve gateway and
legacy state volumes and the opaque pre-migration backup. Reverting source alone
does not restore identity/state. Restore only the reviewed backed-up gateway
state under exact rollback authority, with all writers stopped. Do not implicitly
start either legacy application or host Tailscale. Verify that host OpenCode and
its existing session IDs remained available throughout.

The plugin stops only the gateway (never OpenCode) when its in-command identity
checks detect a backend change or cannot re-verify it after publishing. This is
sampled verification, not continuous monitoring once the command returns.
Navigation does not bypass those checks; pairing failures recheck identity too.
A selected-chat change alone suppresses the pairing link and leaves the
still-valid gateway running. Cleanup of a cold-start failure is armed only when
start is dispatched, never on failed lock/cancellation/deadline preconditions.

Acceptance requires the loaded native `/tailscale-web` command, cold/warm/concurrent/error/stop paths,
the same pre-existing session ID over authenticated HTTPS from a distinct device,
and denial for an unauthorized tailnet identity and a non-tailnet client. Keep
private login/MFA user-controlled. Prior helper tests concerned a separate backend
and cannot satisfy this design's loaded/remote acceptance.

Sources: [Docker host networking](https://docs.docker.com/engine/network/drivers/host/),
[Docker exec lifecycle](https://docs.docker.com/reference/cli/docker/container/exec/),
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve),
[OpenCode V2 web/pairing](https://opencode.ai/v2/docs/cli/web/), and
[public TUI APIs](https://opencode.ai/v2/docs/build/plugins/cli).
