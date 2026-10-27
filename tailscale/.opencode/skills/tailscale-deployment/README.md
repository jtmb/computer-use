# Tailscale deployment skill

This project-owned OpenCode skill guides tailnet-only Tailscale Docker and Kubernetes ingress operations and private OpenCode V2 serving. It does not deploy anything by itself. Its canonical source is `.opencode/skills/tailscale-deployment/`; this project does not install the bundle outside the repository.

OpenCode discovers the skill through `.opencode/skills` and loads `SKILL.md` when selected. This README and [the operations reference](./references/operations.md) are not loaded automatically; read them explicitly before acting.

## How to request it

Use a request such as:

> Review the proposed Tailscale Serve path for my Docker-hosted OpenCode V2 UI. Keep it tailnet-only, preserve localhost binding and app authentication, show me a redacted preview, and do not apply it until I approve.

> Review a Tailscale Kubernetes L7 ingress for this workload. Identify the exact cluster context, operator RBAC and proxy privileges, tailnet policy changes, verification plan, and rollback before asking me to approve a live change.

These are representative natural-language requests, not commands; neither was executed while writing this guide. The skill does not provide MCP tooling. Bortus MCP is a separate project and can only be treated as an already configured external dependency.

## Prerequisites

- A Tailscale tailnet where MagicDNS and HTTPS certificates are available for Serve/Operator ingress. Any consent, DNS, HTTPS, tag, OAuth, ACL/grant, or RBAC change requires a separately reviewed preview and explicit approval.
- An identified Docker host and the finalized project Docker deployment documentation. The project identity is `jtmb/tailscale` and its expected image is `ghcr.io/jtmb/tailscale`; this guide does not build or publish that image and does not define its deployment interface.
- For Kubernetes, the intended cluster/context, namespace, installed Tailscale Kubernetes Operator (or an approved install plan), required CRDs, authorized bootstrap administrator, scoped application deploy identity, and a security review of the operator's actual generated proxies.
- OpenCode V2 served with application authentication enabled and bound to `127.0.0.1`. Know the actual local endpoint from the documented OpenCode V2 status flow; do not assume a fixed port or `/web` route.
- A second tailnet device plus a way to test an identity not authorized by the tailnet policy and a client outside the tailnet. Without those, live acceptance is incomplete.

## Worked workflow

1. State the target precisely: Docker host and reviewed Compose file, or Kubernetes context/namespace and named resources; identify the OpenCode endpoint and intended authorized identities. Do not include secrets in the request.
2. Read the finalized project Docker guide before any Docker operation. For Kubernetes, read the current official [ingress](https://tailscale.com/docs/kubernetes-operator/ingress) and [RBAC](https://tailscale.com/docs/kubernetes-operator/reference/rbac) material and inspect the exact target resources and generated proxy security context. If OpenCode's localhost-only listener cannot be reached without changing its binding or authentication, stop and request an approved topology instead of weakening either control.
3. Prepare a read-only plan. Confirm tailnet HTTPS, the tailnet-only exposure mode, the policy identity allowed to connect, secret handling, and a scoped rollback. Show the real target/context and redacted diff; remove secret values and private identity details from anything displayed.
4. Ask for explicit approval before applying the change or altering OAuth credentials, tailnet policy, HTTPS/TLS, Kubernetes RBAC, application auth, or other security settings. Ask separately before image publication and before Git commit/push.
5. After approval, use only the finalized project instructions. The following are generic Docker Compose examples with placeholders, not project commands; they were not executed here:

   ```sh
   docker compose -f <reviewed-compose-file> config --quiet
   docker compose -f <reviewed-compose-file> ps
   docker compose -f <reviewed-compose-file> up -d
   ```

   `config --quiet` validates without printing the resolved configuration. Never display or capture non-quiet Compose configuration output. Do not substitute guessed custom flags, service names, environment variables, or helper commands. Do not run `up -d` until the exact target and change have been previewed and approved.

   These generic Kubernetes command forms are also representative, not executed. Use `diff` only for a reviewed manifest that contains no secrets; never print secret-bearing diffs:

   ```sh
   kubectl --context <reviewed-context> diff -f <secret-free-reviewed-manifest>
   kubectl --context <reviewed-context> apply -f <approved-reviewed-manifest>
   ```

6. Verify service health without exposing logs or credentials. From an authorized tailnet device, confirm valid HTTPS and OpenCode's own authentication. Confirm denied access from an unauthorized tailnet identity and from outside the tailnet, then repeat the authorized check from a second tailnet device. Record which tests ran and which were unavailable.
7. Report the before/after state, target, approval, evidence, limitations, and the exact reviewed rollback. Do not call local source checks or a configuration preview a live acceptance test.

## Verification and limitations

- Verify actual exposure is Tailscale Serve or Operator ingress for the tailnet only. Tailscale Serve requires tailnet HTTPS. Tailscale's Serve documentation says Funnel is enabled by default; independently verify that this service has no Funnel route and check the mode currently configured for each port.
- Keep OpenCode's app password/session auth enabled. OpenCode V2 serves its web UI from the same server; pairing uses a one-time link and a session cookie. Treat both as credentials. The documented V2 web page does not guarantee a literal `/web` route.
- A Docker sidecar's loopback is not host loopback. A proxy in a separate network namespace cannot reach OpenCode through that namespace's `127.0.0.1`; require a finalized, reviewed topology that preserves the app's localhost binding. Do not invent a Compose network or custom option.
- A Kubernetes Operator ingress proxy is a separate pod and routes to backend Services. A localhost-only listener is not automatically reachable through a Service. If the selected architecture cannot preserve the listener and application auth, stop and ask for an architecture decision.
- The Operator's Kubernetes RBAC and the Tailscale tailnet identity/policy are separate controls. Official proxy defaults can be privileged; inspect the exact version and generated resources. Do not claim a blanket least-privilege configuration or silently add/remove capabilities to make a failure disappear.
- Source edits, unit tests, and dry-run previews do not prove tailnet reachability or denial. A second device and negative unauthorized/non-tailnet checks are mandatory; report missing devices or unavailable test networks as a limitation.
- This bundle does not implement Docker project-specific commands, Kubernetes/MCP code, host setup, image builds/publication, or a live deployment. Bortus MCP remains external.

## Troubleshooting

- If HTTPS or a MagicDNS name is unavailable, stop before changing tailnet settings. Confirm the current Tailscale Serve/Operator prerequisites, preview any consent or policy change, and ask for approval.
- If OpenCode is unreachable through a Docker bridge or Kubernetes Service, check whether the proxy and app actually share a network namespace. Do not change the app to `0.0.0.0`, add a public port, or add privileges to mask the topology issue.
- If an Operator-created proxy is blocked by Pod Security or admission policy, inspect the generated pod and current official RBAC guidance. Report the privilege requirement for independent review instead of weakening cluster policy.
- If authentication redirects fail, use the actual documented OpenCode V2 server address and pairing flow. Do not assume `/web`, disable app authentication, or share the one-time pair URL or cookie.
- If a second tailnet device or controlled negative test is unavailable, report live acceptance as incomplete rather than inferring that access is private.

## Rollback

- Before approval, name the exact previously reviewed Compose file or Kubernetes manifest/resource state that restores the prior configuration. Do not use broad cleanup, prune, namespace deletion, or an unreviewed reset.
- For Docker, restore only the previously reviewed Compose source and use the generic `docker compose -f <previous-reviewed-compose-file> up -d` form only after the rollback target is approved. Do not print its resolved configuration.
- For Kubernetes, restore the previously reviewed manifest for the named resources and context only after approval. Check the Operator's reconciliation behavior before attempting to modify generated proxy resources directly.
- A Tailscale Serve reset can remove existing Serve configuration. Treat it as destructive: preview what it would remove and obtain approval before using the current official recovery procedure.
- Verify restored tailnet-only exposure, HTTPS, and OpenCode authentication, including the same positive and negative network checks. If verification is incomplete, say so and leave the service in the safest confirmed state.

## Safety and approval

- Never enable Funnel or OpenTunnel. Do not publish a public port, use `hostNetwork`, change OpenCode to `0.0.0.0`, remove app auth, or add root/`NET_ADMIN` to hide a connectivity failure.
- Official Tailscale Kubernetes proxy pods can require substantial privileges. Independently review operator RBAC, generated Pod security contexts, init containers, device access, and any proposed privilege change against current upstream docs and cluster policy. The documented device-plugin/ProxyClass alternative is a specific design requiring its own installation and review, not a universal claim that proxies run unprivileged.
- Use distinct identities: a human bootstrap administrator for one-time operator/cluster setup, a narrowly scoped application deploy identity for workload resources, and the Operator's separate Tailscale OAuth identity where needed. Verify required tag ownership/auto-approver grants; do not reuse bootstrap credentials as runtime credentials. Never assume every resource can be namespace-scoped if the actual API requires broader rights.
- Do not read, print, log, screenshot, transcribe, or paste secrets. Do not create `.env` during scaffolding, source it, or expose `docker compose config` output. Any user-managed dotenv file containing credentials must be mode `0600`.
- The repository's local helper writes repository `.env` only after `--apply` and interactive prompts. Read its finalized documentation first; do not guess additional flags or run it without an approved plan.
- If Google sign-in requires a password or MFA, have the user enter it in a visible browser. Pause screenshots, OCR, and other observation while protected values are being entered; resume only after those fields are cleared.
- Preview the actual target, context, redacted diff, expected exposure, identities, and rollback. Ask before every live deployment or OAuth/security change. Image publication, commit, and push each require separate explicit approval.

## Related documentation

- [Operations reference](./references/operations.md)
- [Skill instructions](./SKILL.md)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Docker configuration parameters](https://tailscale.com/docs/features/containers/docker/docker-params)
- [Kubernetes ingress](https://tailscale.com/docs/kubernetes-operator/ingress)
- [Kubernetes Operator RBAC](https://tailscale.com/docs/kubernetes-operator/reference/rbac)
- [OpenCode V2 skills and discovery](https://opencode.ai/v2/docs/skills/)
- [OpenCode V2 web UI](https://opencode.ai/v2/docs/cli/web/)
