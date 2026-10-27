---
name: tailscale-deployment
description: Operate tailnet-only Tailscale Docker and Kubernetes ingress, and privately serve OpenCode V2 over Tailscale Serve. Use when reviewing or deploying these paths.
metadata:
  schema-version: "1"
  category: infrastructure
  tags: "docker,kubernetes,tailscale,ingress,serve,opencode,security"
---

# Tailscale deployment

Use this project-owned skill only for hardened Tailscale Docker and Kubernetes ingress operations and private OpenCode V2 serving. The canonical source is `.opencode/skills/tailscale-deployment/`; do not install or edit a global/deployed copy as part of this work.

Before any operational action, read [the user guide](./README.md) and [the operations reference](./references/operations.md) explicitly. Supporting files are not automatically loaded with this skill.

## Boundaries

- Keep service access tailnet-only over HTTPS. Never enable Tailscale Funnel or OpenTunnel.
- Preserve OpenCode's application authentication and its `127.0.0.1` binding. Tailscale Serve is an additional network boundary, not a replacement for app authentication.
- A container's `127.0.0.1` is its own network namespace (or a deliberately shared namespace), not the host's loopback. Do not guess a bridge, sidecar, or project-specific Docker interface; read the finalized project Docker guide first.
- Do not add public ports, `hostNetwork`, root, or `NET_ADMIN` as an unexplained workaround. Review the actual Tailscale Kubernetes Operator proxy privileges separately against current official documentation; do not claim they are absent or safely removable by default.
- Separate one-time bootstrap administration from scoped application deployment identities. Treat OAuth, tailnet policy, TLS/HTTPS, authentication, RBAC, and other security changes as explicit approval gates.
- Preview the exact target, context, non-secret diff, expected exposure, and rollback before asking for approval. Do not perform a live change, publish an image, commit, or push without separate explicit approval.
- Never read or print real secrets. Do not source `.env` or display `docker compose config` output. Keep dotenv files at mode `0600`; use only a finalized, user-approved interactive secret-entry path. Pause observation while the user enters a Google password or MFA in a visible browser.
- A second tailnet device and negative unauthorized/non-tailnet checks are required for live acceptance. If unavailable, report verification as incomplete.
- Bortus MCP is maintained in a separate project/session. It may be an already configured external dependency, but do not implement MCP behavior, inspect its partial implementation, or invent its tool names or commands.

## Workflow

1. Confirm the requested topology, exact Docker project or Kubernetes context/namespace/resources, OpenCode endpoint, intended tailnet identities, and the user-authorized rollback target.
2. Read the finalized project Docker instructions before operating containers. For Kubernetes, inspect current operator/ingress/RBAC requirements and the exact generated proxy security context. Stop if the design requires weakening localhost binding or app authentication without an approved architecture change.
3. Prepare a read-only plan. Check tailnet HTTPS, MagicDNS, narrow access policy, absence of public exposure, secret handling, and the relationship between the Serve proxy and OpenCode's network namespace.
4. Show the actual target/context and redacted diff. Ask for approval before any live, OAuth, identity, policy, TLS, RBAC, or authentication change. Keep image publication and Git commit/push as separate approval requests.
5. After approval only, apply the reviewed change using the finalized project instructions. Do not infer project-specific flags, service names, image tags, or helper commands.
6. Verify HTTPS and application authentication from an authorized tailnet device, then verify denial from an unauthorized tailnet identity and a non-tailnet client. Repeat from a second tailnet device. Never claim tests that were unavailable or not run.
7. Report the exact changes, evidence, residual risks, and rollback action. Source updates and passing local tests are not live deployment acceptance.

## Authoritative references

- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Tailscale Docker configuration parameters](https://tailscale.com/docs/features/containers/docker/docker-params)
- [Tailscale Kubernetes ingress](https://tailscale.com/docs/kubernetes-operator/ingress)
- [Tailscale Kubernetes Operator RBAC and permissions](https://tailscale.com/docs/kubernetes-operator/reference/rbac)
- [OpenCode V2 web UI and pairing](https://opencode.ai/v2/docs/cli/web/)
