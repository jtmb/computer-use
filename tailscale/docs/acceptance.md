# Acceptance checklist

Evidence recorded on 2026-10-27. Local source checks are not live deployment acceptance.

| Requested result | Evidence | State / remaining gate |
| --- | --- | --- |
| Repo `tailscale`, session moved there | Local Git `main` at `~/repos/computer-use/tailscale`; session move confirmed by OpenCode. | Verified locally. |
| Public GitHub repository | Initial commit `669139f` and CI correction `1a41a1e` separately approved, committed and pushed; Git remote and GitHub confirmation match the public `main` hash. | Verified. |
| Hardened Docker image | Official Tailscale `v1.104.2` version/digest pin; local `tailscale` target builds; UID/GID 65532, userspace, read-only rootfs, no extra capabilities/host mounts/ports. | Local verification passed; GHCR artifact published and registry-verified. |
| Useful readiness | Network-isolated daemon reports NeedsLogin with CLI exit 0 but fails loopback HTTP `/healthz`. Compose uses that HTTP check, not CLI exit status. | Negative readiness verified; authenticated healthy state still needs live test. |
| Persistent state | Fresh named volume is writable by the non-root image; synthetic marker survives a second container. | Filesystem persistence verified; authenticated identity and Serve restart persistence not tested. |
| OpenCode Docker example | Local `opencode` target runs as UID 65532; UI root returns HTTP 401 without auth and 200 with a synthetic password. No host ports or personal files mounted. | Local authentication passed; provider setup and tailnet UI not tested. |
| Kubernetes deployment support | Official Operator chart `1.104.2` archive matches official index SHA256. Temporary Helm `3.22.1` checksum/signature verified; strict lint and offline render passed. No Secret rendered; external `operator-oauth` reference confirmed. | Cluster compatibility, server dry-run, permissions and deployment not tested. Ingress remains disabled with explicit backend placeholders. |
| Cluster at `192.168.0.4` | TCP 6443 reachable; public certificate metadata includes the target IP. No local kubeconfig found. | Trusted CA, authenticated context, node SSH username/port and approved bootstrap needed. TLS verification must not be bypassed. |
| Kubernetes MCP and skills | Explicit user handoff to separate `bortus-mcp` repo/session; public empty repo verified. Only initial configuration source exists there. | External dependency blocked: functional MCP not implemented; that goal reported budget-limited. No further work there from this session. |
| Tailscale-specific skill | Project bundle, catalog and relative links validated; five skill tests passed. | Source verified; new-session/live operational acceptance not claimed. |
| Secure local secret entry | Twelve synthetic helper tests cover no-echo entry, validation, unsafe paths/modes, atomic writes and dry runs. `.env` variants and local keys/configs ignored; Docker context allows only Dockerfile. | Enrollment was completed by user-approved interactive browser login, so no auth key was handled or stored; `.env` still does not exist. The masked-entry helper was attempted but cancelled and is not claimed as accepted. |
| Dedicated SSH key | Exact ignored private-key path exists, owner verified, mode tightened to 0600 without reading contents; public key validates as Ed25519. | Passphrase protection, private/public correspondence and node authorization not tested; do not claim SSH login works. |
| Tailnet-only OpenCode `/web` test | Host enrolled by user-approved interactive browser login as `opencode-host` with `tag:opencode`. Tailnet HTTPS enabled; Serve maps `https://opencode-host.tail3c9b71.ts.net/` to `http://127.0.0.1:49374` and reports `(tailnet only)`. OpenCode now binds `127.0.0.1:49374` only. From an independent tailnet node: root 200 and `/web` 200 with `ssl_verify_result=0`; unauthenticated `/api/info` 401. | Verified, including restart persistence. Authenticated in-app browser use was not exercised by the agent, and a distinct second *user* identity was unavailable. |
| Deny unauthorized access / no Funnel | Unauthorized tagged node (`tag:opencode`) was refused while the authorized owner node returned 200 for the same request. `serve status` and `funnel status` both report `(tailnet only)`; no host listener on 443; 49374 is loopback-only, so the former LAN path is closed. | Verified; residual gap is the missing distinct-user denial test. |
| Maintain image on GitHub | SHA-pinned Actions restricted to four exact actions; validation run `40562230662` and publication run `40563651852` passed; `v1.104.2-r1` and source-SHA tags resolve to index `sha256:80c4a9a3b327475b330e76f9c31b52b7038e44963c58f2a90a3493f28dcac993` (amd64, arm64, two attestations). | Verified. Tags are not registry-enforced immutable: deploy a verified digest. |
| Rollback | Docker state-preserving rollback and Kubernetes named-resource/Helm revision guidance documented. | Select and approve actual prior state before live deployment. No broad cleanup or namespace deletion. |

## Commands actually run

- Initial full standard-library suite: 35 passed locally. After adding fresh-runner bootstrap regressions, `RUN_DOCKER_TESTS=1` with bytecode disabled passes all 40 tests without skips. The correction still needs a successful hosted run.
- `docker build --network none --target tailscale --tag jtmb/tailscale:dev .`.
- `docker build --network none --target opencode --tag jtmb/tailscale-opencode:dev .`.
- Compose validation using `--env-file /dev/null`, with no resolved configuration printed.
- `RUN_DOCKER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_docker_runtime.py -v`: three runtime regressions passed.
- Strict chart lint and offline template render with isolated Helm paths and `KUBECONFIG=/dev/null`, after verifying the tool's detached signature and the chart digest.
- Public GitHub creation readbacks, Git ignore checks and nonsecret file metadata checks.
- Candidate source scan: 27 nonignored files checked for known private-key, Tailscale-key and GitHub-token patterns, unsafe paths and trailing whitespace; no findings. This is not a guarantee against every possible secret.

No credential values, pairing links, cookies, raw kubeconfigs, private keys or real app logs
are acceptance evidence. A green local test suite does not satisfy the remaining live gates.
