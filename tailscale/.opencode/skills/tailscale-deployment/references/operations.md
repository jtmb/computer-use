# Tailscale operations reference

Read this reference together with the user-facing [README](../README.md) before changing a deployment. It contains operational constraints, not authorization to make a live change. Current upstream documentation wins if implementation details change.

## Exposure and identity boundaries

1. Keep the service reachable only over the tailnet and HTTPS. Tailscale Serve requires HTTPS certificates enabled for the tailnet. Tailscale's Serve documentation notes that Funnel is enabled by default as a feature; independently verify that this service has no Funnel route. Serve and Funnel are different exposure modes; never enable Funnel or OpenTunnel. Do not infer that HTTPS alone means private: verify the actual Serve/Ingress mode and tailnet policy.
2. Use the narrowest tailnet policy that admits intended users/devices to the service. Review device tags, `tagOwner`, service tags, auto-approvers, and grants against the actual topology. A broad tag-based grant may cover present and future services sharing that tag. Any policy, OAuth, TLS consent, or identity change is security-sensitive and needs an explicit preview and user approval.
3. Keep OpenCode V2's app password/session authentication enabled. Its web UI is served by the same server, and pairing creates a one-time, short-lived URL plus a session cookie. Do not paste, log, capture, publish, or reuse a pairing URL/cookie. Do not assume a `/web` path exists. Use the current V2 documentation and the actual local server address.
4. Preserve OpenCode's `127.0.0.1` listener. Serve can proxy a local port, but the proxy must share the listener's network namespace to use that loopback address. A container's loopback is not the host's. A separate Docker bridge container or Kubernetes Operator ingress pod cannot reach another namespace's loopback merely by using `127.0.0.1`.
5. For an Operator L7 Ingress, the controller creates a proxy pod that forwards to a backend Kubernetes Service. Confirm the app is reachable by that backend without changing OpenCode binding/authentication. If loopback-only OpenCode cannot be reached with the approved topology, stop; do not silently open the listener to all interfaces. Any alternative same-namespace serving design must use the finalized project documentation and receive architecture/security approval.

## Docker Compose boundary

- Before Docker operations, read the finalized Docker guide in the project. The Docker integration is maintained separately and its project-specific interface must not be inferred from partial source or this skill. Do not guess service names, image tags, environment variables, helper paths, flags, network settings, or volume layout.
- The expected project identity is repository `jtmb/tailscale` and image `ghcr.io/jtmb/tailscale`; that is not proof that an image exists, is trusted, or is approved for publication. Never build or publish an image without explicit authorization.
- Only generic Compose forms are documented here: `docker compose -f <reviewed-compose-file> config --quiet`, `ps`, and `up -d`. The placeholders must be replaced only from finalized project documentation and a reviewed target. `config --quiet` validates without printing resolved values; never display/capture ordinary `docker compose config` output because environment expansion can disclose secrets.
- Do not add public port mappings, `network_mode: host`, root, or `NET_ADMIN` to work around an unreachable local service. Do not change OpenCode's loopback binding or disable app auth. Resolve namespace topology through the reviewed design first.
- Do not run Compose logs, inspect commands, or diagnostics that may expose credentials without a redaction plan. Do not read `.env`; never source it. Do not create it while scaffolding. User-managed dotenv credentials must be protected with mode `0600`.
- The repository's local helper writes repository `.env` only after `--apply` and interactive prompts. Read its finalized documentation and do not guess additional flags.

## Kubernetes Operator ingress and RBAC

- Separate Kubernetes RBAC from Tailscale ACL/grant policy. Kubernetes roles determine what the operator, proxy pods, bootstrap administrator, and application deploy identity can do inside the cluster. Tailnet policy determines which tailnet identities can reach advertised services.
- A one-time bootstrap administrator may be needed to install CRDs/operator components and establish cluster RBAC. Use a different application deploy identity for the approved workload resources, with only the API permissions the actual resources need. The Operator's Tailscale OAuth identity is separate again. Review credential scope, tags it may own, and required service auto-approvers. Do not store bootstrap admin credentials in a workload or use them for ongoing deployment.
- Review current official ingress and RBAC instructions for the chosen Operator version and mode (standalone or `ProxyGroup`, L7 or L3). The operator creates/updates proxy resources; do not treat generated objects as hand-owned application manifests or modify them directly without understanding reconciliation.
- Do not claim Operator proxies are automatically unprivileged. Tailscale's RBAC reference states that, in v1.78 and later, the main and init containers in the documented proxy pod types run privileged by default. It describes a specific alternative using a generic device plugin and `ProxyClass` to grant the main Tailscale container `NET_ADMIN`/`NET_RAW` and a `/dev/net/tun` device. That alternative has cluster-wide implications and must be independently reviewed for the exact Operator version, proxy type, init container, device plugin, capabilities, Pod Security policy, and threat model. Do not adopt it automatically or claim it eliminates all privilege.
- Never add `hostNetwork`, root, public ports, or `NET_ADMIN` to the application as an unexplained workaround. Do not remove Operator-required privileges or declare them reduced without proving the exact generated security context and behavior. If the necessary privilege is not approved, stop and report the blocker rather than bypassing policy.
- For L7 ingress, review the selected `Ingress` host/name, `ingressClassName`, backend `Service` and port, TLS certificate behavior, tags, tailnet grants, and any `ProxyGroup` association. Tailscale Operator ingress is tailnet-facing by default; do not add an internet-facing ingress class or Funnel configuration.
- Use `kubectl diff` only with a reviewed secret-free manifest. Secret-bearing manifests/diffs, `kubectl get secret`, and unredacted diagnostics are out of bounds. Before `kubectl apply`, preview the actual context, namespace, resource names, diff, permission changes, and rollback; ask for approval.

## Preview, approval, and verification

Before an operation, show a concise redacted preview containing:

- Exact Docker host/project/file or Kubernetes context/namespace/resource names.
- Current and intended exposure mode, local listener, target service, and tailnet identity scope.
- Non-secret config diff and any OAuth, tailnet policy, HTTPS, application authentication, Kubernetes RBAC, Pod security, or image changes.
- Expected health checks, positive and negative access tests, second-device availability, and an exact rollback target.

Ask for explicit approval immediately before applying a live change. The approval must name the target and change. A general request to create documentation, edit source, run unit tests, or prepare a preview is not approval to deploy. Obtain separate approval for a subsequent image publication, commit, or push.

After an approved change, verify without disclosing sensitive URLs, hostnames, IP addresses, cookies, passwords, environment values, or logs:

1. Confirm the service has valid HTTPS and is reachable from an authorized Tailscale client.
2. Confirm OpenCode's own authentication challenge still works; tailnet membership/TLS does not replace app authentication.
3. Confirm an unauthorized tailnet identity is denied by policy and an unauthenticated client outside the tailnet cannot reach the service. Do not attempt public access if that would risk exposing credentials; use a controlled test client and stop if the result is unexpected.
4. Repeat the authorized check from a second tailnet device. If the second device, unauthorized identity, or outside-tailnet test is unavailable, state the acceptance gap explicitly; do not infer success.
5. Confirm no Funnel/OpenTunnel route or public listener was introduced and that the actual listener and proxy namespace match the reviewed design.

Never include raw command output or transcripts if they could contain secrets. Redact hostnames, tailnet IPs, auth URLs, cookies, user identity, OAuth metadata, environment values, and private policy details before sharing evidence.

## Rollback

- Before deployment, identify the previously reviewed Compose source or exact Kubernetes resources/manifests to restore. Do not use broad prune/delete commands, remove a namespace, or reset unrelated Tailscale Serve state.
- Docker rollback uses only the approved prior Compose source and generic Compose syntax documented by the finalized project guide. Restore the prior reviewed service configuration; do not print resolved configuration.
- Kubernetes rollback restores only the approved previous manifest and named resources in the reviewed context. Operator-managed resources may be reconciled; understand the owning Ingress/Service/ProxyGroup resource before rollback and avoid editing generated children as if they were authoritative.
- Resetting Tailscale Serve can remove existing configuration. Treat it as destructive and use only the current official recovery procedure after the exact impact is previewed and approved.
- Repeat positive and negative access tests after rollback. If exposure cannot be verified, report the uncertainty and keep to the safest confirmed state.

## Official documentation

- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Docker configuration parameters](https://tailscale.com/docs/features/containers/docker/docker-params)
- [Kubernetes Operator ingress](https://tailscale.com/docs/kubernetes-operator/ingress)
- [Kubernetes Operator RBAC and permissions](https://tailscale.com/docs/kubernetes-operator/reference/rbac)
- [Layer 7 workload ingress guide](https://tailscale.com/docs/kubernetes-operator/ingress/expose-workload-to-tailnet-l7)
- [OpenCode V2 web UI and pairing](https://opencode.ai/v2/docs/cli/web/)
