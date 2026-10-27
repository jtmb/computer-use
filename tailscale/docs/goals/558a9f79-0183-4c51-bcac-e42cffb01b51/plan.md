# Plan — `558a9f79-0183-4c51-bcac-e42cffb01b51`

- Goal ID: `558a9f79-0183-4c51-bcac-e42cffb01b51`
- Source session ID: `ses_e82032444ffeP7hG18Zqr3hsp3`
- Source directory: `/home/james/repos/computer-use/tailscale`
- Exported at: `2026-10-27T22:17:04.468Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `tailscale`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `active`
- Plan revision: `6`
- Record: `current`

## Goal objective

> Finish the hardened Tailscale deployment at /home/james/repos/computer-use/tailscale, reinstating the previously closed scope without dropping any deliverable: \(a\) keep the approved public GitHub repository and versioned GHCR image verified; \(b\) securely provision the remaining Tailscale credentials so the existing\-host OpenCode V2 service is reachable over tailnet\-only authenticated HTTPS, then verify it from an independent authorized device and confirm unauthorized/non\-tailnet access is denied with Funnel disabled and restart persistence documented; \(c\) target the Kubernetes cluster at 192\.168\.0\.4 with trusted authenticated TLS and scoped RBAC and deploy only after explicit context/change approval; \(d\) keep the least\-privilege Kubernetes MCP and canonical skills requirement satisfied or explicitly blocked in the separate bortus\-mcp project; \(e\) collect every required secret through user\-controlled secure local entry, excluded from Git and Docker build contexts, never exposed in chat, tool output, logs or artifacts\. Obtain separate confirmations for account/security changes, credentials, cluster mutations, commits, pushes, remote publishing and schedules, and record verified evidence, blockers and rollback for each\.

## Persisted plan

Plan revision: `6` · updated 2026-10-27T22:08:24.000Z

> Reinstated hardened Tailscale deployment goal\. Public source, restricted Actions and multiarch GHCR image are already verified\. Remaining work is private credential provisioning plus tailnet\-only authenticated OpenCode web acceptance, then approved Kubernetes deployment and the external bortus\-mcp dependency\. No subagents requested\.

### Completion criteria

- Repository exists at /home/james/repos/computer-use/tailscale and session is moved there; approved GitHub repository is verified remotely with no committed secrets\.
- Version\-pinned hardened Docker image and Docker Compose deployment build and pass relevant tests; approved GHCR publication and maintenance workflow are verified\.
- Kubernetes configuration targets an authenticated TLS\-verified cluster at 192\.168\.0\.4 with scoped RBAC; deployment succeeds only after context and changes are approved\.
- Kubernetes MCP exposes bounded read\-only tools and preview/approval\-gated deployment without arbitrary execution or secret disclosure; associated canonical skills validate and integration is verified or explicitly blocked\.
- Necessary secrets are collected through user\-controlled secure local entry, excluded from Git and Docker build contexts, and never exposed in chat, logs or artifacts\.
- OpenCode V2 web UI is authenticated and accessible over tailnet\-only HTTPS from an independent authorized device; unauthorized access is denied, Funnel is disabled, restart persistence and rollback are documented\.

### Phase `preflight` — completed

> Discover instructions, tools, identity, environment and cluster access; create project location and move session\.

**Verification:**

> Environment, project location, access methods and approval boundaries established with read\-only checks\.

- **`inspect` · completed:**
  > Inspect project and canonical harness instructions, active config, installed tools and safe cluster metadata without reading secret values\.
  - Evidence:
    > Verified toolchain, selected config and GitHub identity jtmb; kubeconfig filename search empty; public cluster certificate metadata inspected without trusting its CA\.
- **`location` · completed:**
  > Create the tailscale project directory and move this session into it\.
  - Evidence:
    > Session confirmed at /home/james/repos/computer-use/tailscale and harness reports the directory as workspace root\.
- **`choices` · completed:**
  > Confirm GitHub visibility, image publishing scope, intended browser, cluster access and secure credential\-entry method\.
  - Evidence:
    > User approved public repos, Chrome, user\-private local credential entry and dedicated SSH key generation\.

### Phase `build` — completed

> Finish and independently verify Tailscale Docker/Kubernetes source, deployment skill and secret\-entry safeguards\.

**Verification:**

> 40/40 local tests pass with containers enabled; source/secret safeguards preserved; correction committed and pushed with separate approvals\.

- **`docker` · completed:**
  > Implement hardened Docker image, Compose configuration, publication workflow and tests\.
  - Evidence:
    > Both digest\-pinned targets build offline and run UID65532; tests cover named\-state persistence, NeedsLogin readiness failure and OpenCode auth\.
- **`skills` · completed:**
  > Create canonical deployment skills and repo documentation, credential helper and validation\.
  - Evidence:
    > Project Tailscale skill/catalog plus helper tests pass; docs map scope, checks and live gaps\.
- **`review` · completed:**
  > Independently review and verify all changes and secret exclusion before requesting publication\.
  - Evidence:
    > Safe clean\-runner scratch bootstrap and five regressions added after hosted failure; 40/40 local tests pass including three container tests; exact six\-file commit 1a41a1e pushed after separate approval and verified remotely\.

### Phase `publish` — completed

> Publish approved source and container artifacts using separate action confirmations\.

**Verification:**

> Source and versioned multiarch image independently verified remotely; publish job succeeded; no live deployment claimed\.

- **`github` · completed:**
  > Create the approved GitHub repository and separately confirm commit, push, workflow activation and GHCR publication\.
  - Evidence:
    > Public main 1a41a1e verified; Actions restricted to four exact SHA\-pinned actions; validation run 40562230662 and publication run 40563651852 passed; version and source\-SHA tags resolve to index sha256:80c4a9a3b327475b330e76f9c31b52b7038e44963c58f2a90a3493f28dcac993 with amd64, arm64 and two attestation manifests\.

### Phase `live` — in_progress

> Authenticate Tailscale, deploy safely to approved environments and test private OpenCode web access\.

- **`auth` · completed:**
  > Complete scoped Tailscale credential provisioning and register the existing host without exposing the credential\.
  - Evidence:
    > Interactive browser enrollment chosen by user \(no auth key handled\)\. After an approved accessibility\-enabled Chrome restart with the same profile, the Tailscale device page showed 'Connect device' for opencode\-host; Connect was pressed once with a fresh preview token\. Daemon now reports BackendState Running, 2 tailnet IPs, tags \[tag:opencode\], DNSName opencode\-host\.tail3c9b71\.ts\.net\. Admin console readback shows device opencode\-host with tag:opencode and expiry disabled\. No key, password or MFA value entered model context\.
- **`deploy` · blocked:**
  > Preview and apply approved Docker and Kubernetes deployment using TLS\-verified authenticated access\.
  - Blocker:
    > Rechecked with the reinstated goal: kubectl and helm are not installed, no kubeconfig exists at \~/\.kube/config, /etc/rancher/k3s/k3s\.yaml or \~/\.kube/configs, and 192\.168\.0\.4 accepts 6443/443 while 22 and 2222 remain closed\. Credentials/trust and an approved context are still required before any Kubernetes action\.
- **`webtest` · completed:**
  > Verify OpenCode V2 tailnet\-only HTTPS, application authentication, denial tests, persistence and rollback\.
  - Evidence:
    > https://opencode\-host\.tail3c9b71\.ts\.net/ verified from an independent tailnet node \(opencode\-client, owner identity\) through its own userspace netstack: root 200, /web 200, ssl\_verify\_result 0, unauthenticated /api/info 401\. Unauthorized tagged node \(opencode\-denied, tag:opencode\) was refused by policy for the same request\. Funnel off: serve and funnel status both '\(tailnet only\)'\. No host listener on 443; OpenCode rebound to 127\.0\.0\.1:49374 \(LAN probe fails, loopback still 200/401\)\. Native daemon restart preserved node identity, tags, tailnet IPs and the Serve mapping, with probes repeated afterwards\. Rollback: \`tailscale serve off\` on this node removes the mapping without touching unrelated Serve state\.

### Phase `external_mcp` — blocked

> Track the explicitly delegated Bortus MCP implementation and integration dependency without duplicating its work here\.

**Blocker:**

> External project dependency; not implemented in this repository\.

- **`mcp` · blocked:**
  > Implement bounded Kubernetes MCP with explicit context, credential isolation, safe read tools, and approval\-gated deployments\.
  - Blocker:
    > Owned by /home/james/repos/bortus\-mcp; that project remains incomplete and work there requires separate authorization\.

### Decisions

- Reinstated by explicit user instruction after the prior goal was closed unmet; completed publication evidence and every original completion criterion are preserved\.
- Existing host OpenCode service remains the live acceptance target, not the Docker example\. Tailnet\-only HTTPS and application authentication are mandatory; Funnel, OpenTunnel, allow\-all grants, hostNetwork and privileged application containers remain prohibited\.
- Narrow policy is in force: signed\-in owner identity \-&gt; tag:opencode \-&gt; tcp443, with tag:opencode owned by autogroup:admin\. Reverify before any exposure change\.
- Secrets must stay out of chat, argv, logs, Git and build contexts\. The opaque browser\-to\-consumer transfer capability is unimplemented by its owner and deliberately refused; only user\-performed private entry or interactive login can supply the credential\. No clipboard, DOM/CDP or screenshot extraction of credentials\.
- Native Tailscale runs unprivileged in userspace networking with private state under \.local/native\-tailscale and is a test process, not an installed boot service\. Registration, Serve and any host binding change need separate approvals\.
- Commit, push, image publication, cluster mutation and scheduling each require separate explicit approval\. No subagents have been requested for this reinstatement\.
- Reinstated goal 558a9f79 per direct user instruction after the prior goal closed unmet; boundaried read\-only recheck confirms Kubernetes remains blocked \(no kubectl/helm/kubeconfig, only 6443/443 reachable\) and bortus\-mcp remains a non\-repository stub directory, so neither can be advanced without external access or separate authorization\.
- Live exposure uses the existing host OpenCode service rather than the Docker example: user\-approved interactive login enrolled opencode\-host under tag:opencode, tailnet HTTPS certificates were enabled, and Serve maps 443 to loopback 49374 marked tailnet only\. OpenCode was rebound from 0\.0\.0\.0 to 127\.0\.0\.1 through an approved service restart to close the LAN path; Funnel was never enabled\. Test nodes were stopped; their tailnet device records still need removal\.
- Live acceptance evidence was recorded in ROADMAP\.md and docs/acceptance\.md as two separately approved local commits b41d4f4 and 308ffe6; nothing was pushed\. Console automation could not reach a Delete control for the two stopped test nodes, so their removal is documented as a manual step\. The native userspace daemon has no systemd supervision and must be restarted manually after a reboot, while its identity, tags, IPs and Serve mapping persist across a daemon restart\.
