# Roadmap and Handoff Status

This ledger separates the Tailscale project from its external MCP dependency. The public source and versioned GHCR image are published and verified. Tailnet-only authenticated HTTPS access to the existing host OpenCode service is **live and verified**; Kubernetes deployment and the external MCP integration remain blocked on access.

## Scope split

- **This repository:** Tailscale Docker image and Compose work, actual Tailscale Kubernetes workload configuration, Tailscale-specific skills, and a private OpenCode V2 test.
- **External dependency:** bounded Kubernetes MCP implementation and MCP-specific skills in `/home/james/repos/bortus-mcp`, public repository `https://github.com/jtmb/bortus-mcp` (created and verified empty). Do not implement MCP server/configuration or MCP skills in this repository. Contract, restart behavior, and live integration remain pending.

## Requested outcomes and acceptance

1. **Tailscale Docker image and Compose** — Local builds and three isolated runtime regressions are **VERIFIED**. Readiness was corrected after CLI status falsely succeeded in NeedsLogin; optional OpenCode now also runs non-root. Live tailnet acceptance remains **PENDING**.
2. **Actual Tailscale Kubernetes workload configuration for `192.168.0.4`** — Secret-free, disabled-until-selected Ingress and official chart pin are **VERIFIED OFFLINE**, including signed-tool Helm lint/render. No live deployment has been achieved.
3. **GitHub `jtmb/tailscale` and GHCR image** — **VERIFIED**. Public `main` at `1a41a1e`; Actions restricted to four exact SHA-pinned actions; validation run `40562230662` and publication run `40563651852` succeeded. `ghcr.io/jtmb/tailscale:v1.104.2-r1` and the source-SHA tag both resolve to index `sha256:80c4a9a3b327475b330e76f9c31b52b7038e44963c58f2a90a3493f28dcac993` with amd64, arm64 and two attestation manifests.
4. **Tailscale-specific project skills** — Bundle/catalog/link and five source tests **VERIFIED**. Fresh-session/live operational acceptance is **PENDING**. MCP-specific skills remain external to this repo.
5. **Secure local configuration** — The local helper and example exist, but user-side setup and deployment integration remain **PENDING**. No Bortus-only deploy-token keys belong here, and no automatic secret sharing/copying is intended.
6. **Private OpenCode V2 test** — **VERIFIED LIVE**. Host enrolled by user-approved interactive browser login as `opencode-host` with `tag:opencode`; tailnet HTTPS certificates enabled; Serve maps `https://opencode-host.tail3c9b71.ts.net/` (port 443) to `http://127.0.0.1:49374` and reports `(tailnet only)`. OpenCode now binds `127.0.0.1:49374` only, so the former LAN exposure is closed and nothing listens on host port 443.

## Live acceptance evidence (2026-10-27)

- Authorized node (`opencode-client`, signed-in owner identity) reached `https://opencode-host.tail3c9b71.ts.net/` over the tailnet: HTTP 200 with `ssl_verify_result=0`, `/web` 200, unauthenticated `/api/info` 401.
- Unauthorized tailnet identity (`opencode-denied`, tagged `tag:opencode`) was refused by policy while the same request from the authorized node succeeded.
- No host interface listens on 443; TCP 49374 listens only on `127.0.0.1`, so the LAN path that previously exposed the service is closed.
- Funnel is not enabled: both `serve status` and `funnel status` report `(tailnet only)`.
- Native daemon restart preserved the same node identity, tags and tailnet IPs, and the Serve mapping survived; positive and negative probes were repeated afterwards with identical results.
- Application authentication remains enforced by OpenCode itself (401 without credentials); an authenticated app session was not exercised by the agent.

## Remaining gates

- A second **distinct-user** identity was not available, so denial was proven with a tag-scoped identity rather than a separate person.
- The temporary `opencode-client` and `opencode-denied` nodes are stopped locally, but their device records could not be deleted through the console's accessibility tree; remove them manually from **Machines**.
- The native userspace daemon has no systemd unit, so it does not survive a host reboot and is restarted manually with the recorded flags. Its tailnet identity, tags, IPs and Serve mapping do survive the restart.
- Kubernetes deployment remains blocked, and the external MCP project is still unimplemented.

## Verified environment facts and blockers

- The current OpenCode session is in `/home/james/repos/computer-use/tailscale`; initial commit `669139f` is verified on local `main` and public `origin/main`.
- No kubeconfig was found in the bounded local filename search. Kubeconfig contents and private credentials were not read.
- `192.168.0.4:6443` is reachable, and the server certificate SAN includes the target IP; the issuing CA is not trusted. Do not bypass TLS verification. Kubernetes API access and live deployment are blocked pending trusted CA and approved API credentials.
- SSH TCP ports 22 and 2222 were unreachable. Candidate usernames are `james` or `brajam`; the actual SSH port or console access is still needed.
- The ignored dedicated private-key file exists. Its owner and regular-file status were verified and permissions tightened from 0644 to 0600 without reading contents. Its public key validates as Ed25519. Private/public correspondence, passphrase protection and node installation remain **NOT TESTED**; `.env` may hold only the path.
- The host OpenCode listener is `0.0.0.0:49374`, its unauthenticated API returns 401, and remote/OpenTunnel is false. No service binding or restart was changed; an approved restart window may be needed for host-local hardening.
- Secrets remain local to their owning project; no automatic copying or sharing is permitted. Do not store Google account or SSH login passwords unnecessarily.
- No secret value was added to or committed from this work; the real `.env`, private keys, and kubeconfig contents were not read or copied.

## Foundation verification

- Parent independently reran and accepted the original 9 foundation tests.
- Follow-up helper suite: **VERIFIED** — `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_secret_setup.py' -v` passed all 12 tests, including SSH/Kubernetes metadata, path, and port validation.
- Parent full discovery with `RUN_DOCKER_TESTS=1`: **35 passed, no skips**, including three isolated runtime regressions and publication-revision/credential-handling checks. Default discovery intentionally skips the three runtime tests. The previous line-wrapped documentation failure is resolved.
- Both local Docker targets rebuild offline. OpenCode authentication, non-root identities, unauthenticated Tailscale readiness failure and synthetic named-volume persistence are verified without external networking or real credentials.
- Official chart digest independently verified. Helm 3.22.1 archive SHA256 and detached signature matched the release signer; strict lint and offline render passed, producing eight CRDs and no Secret objects. No server dry-run or cluster access occurred.
- Following the first hosted-run failure, `scripts/prepare_test_scratch.py` now creates the missing test prerequisite on clean runners, rejects symlinks/public-writable targets and preserves existing harness scratch directories. Five regressions added; full local opt-in suite **40 passed**, no skips. Remote verification awaits the separately approved fix commit/push.
- All four Actions pins independently resolve to their documented release commit SHAs. Draft publication is serialized, revisioned and manual; registry credentials are handled in process memory, not command arguments.
- Fake secret/configuration ignore checks: **VERIFIED** — `.local/ssh/id_ed25519`, `.env`, and `.env.local` are ignored; `.env.example` remains unignored.
- Helper test data was synthetic and confined to `/tmp/opencode`; this follow-up did not create a real `.env` or read private-key or kubeconfig contents.
- Initial commit and push were separately approved, performed and verified; no GHCR publication, live Serve deployment or cluster mutation has occurred. Disposable test containers were removed; approved user-mode native Tailscale daemon is running unregistered with private ignored state.
- Google sign-in completed using an existing saved account and separately approved basic-profile/email consent; authenticated Tailscale Machines heading verified. No passwords/MFA were entered by the agent.
- Existing tailnet all-to-all grant was reviewed. Exact owner-only TCP443/tag replacement was shown and approved but not saved while private GitHub authorization is in progress. Auth metadata now confirms workflow scope; do not inspect desktop/browser until user confirms protected fields cleared.

## Next approval gates

1. Approve the six-file clean-runner CI fix commit, then separately approve pushing it. Initial source/CI/weekly dependency activation is verified; GHCR publication remains a separate approval after CI passes.
2. Obtain node SSH username/port or trusted kubeconfig path without credential contents; confirm private-entry prompts are finished before visible-browser observation.
3. Existing-host OpenCode target is selected and Tailscale browser sign-in is verified. Finish private-entry clearance, then reverify/apply the approved narrow policy; registration, HTTPS, Serve and any service restart remain separate approvals.
4. Run actual authorized/unauthorized/second-device tailnet tests and approved cluster deployment; do not substitute offline tests for these gates.

Detailed prompt-to-artifact evidence and remaining gaps: [acceptance checklist](docs/acceptance.md).

## Daemon supervision

The unprivileged userspace daemon is supervised by a systemd **user** unit so a restart does not depend on this session:

```bash
mkdir -p ~/.config/systemd/user
install -m 0644 deploy/systemd/tailscaled-userspace.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now tailscaled-userspace.service
```

Verified: the unit is `active` and `enabled`, the daemon reports `Running` with the same `tag:opencode` identity and tailnet IPs, the Serve mapping is still `(tailnet only)`, and an independent node still receives `200` with a valid certificate.

Limitations:

- `loginctl` reports `Linger=no`, so the user unit starts only after a login session; enabling lingering needs an administrator decision.
- Rollback: `systemctl --user disable --now tailscaled-userspace.service` stops supervision. The Serve mapping and node identity remain in the private state directory.

## Docker deployment (current live path)

The Compose stack is now the served deployment, using its own named volumes rather than the host's live database:

- `tailscale` container: registered as `tailscale-docker` with `tag:opencode`, userspace networking, non-root `65532`, read-only rootfs, all capabilities dropped.
- `opencode` profile: same network namespace, listens on `127.0.0.1:4096`, `OPENCODE_PASSWORD` enforced from the repository `.env`.
- Serve: `https://tailscale-docker.tail3c9b71.ts.net/` → `http://127.0.0.1:4096`, reported `(tailnet only)`; Funnel is not enabled.
- Verified from an independent tailnet node: TLS validated (`ssl_verify_result=0`) and unauthenticated requests receive `401`.
- Container restart preserved the same node name, tag and Serve mapping; the same probe still returned `401` with a valid certificate.

Fixed during this work: Compose passes `mode` to Docker as a **decimal** integer, so `mode: 1777` produced `0o3361` and tailscaled could not create its socket (`/tmp: permission denied`). The tmpfs entries now use `mode: 511` (`0o777`). `TS_EXTRA_ARGS: "--advertise-tags=tag:opencode"` supplies the required tag during interactive login.

The host-native userspace daemon and its systemd unit were retired once the container path was verified. The host OpenCode service still runs for the local TUI; it is no longer exposed through Tailscale.
