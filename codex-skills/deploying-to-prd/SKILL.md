---
name: deploying-to-prd
description: Deploy requested applications to James's existing production Kubernetes cluster through the established WSL SSH and Flux workflow, preserving existing data and verifying the live rollout. Use for requests to deploy to PRD or to my Kubernetes cluster.
---

# Deploying to PRD

Deliver the requested application to James's actual Kubernetes cluster and verify
the resulting workload. Use the supplied cluster addresses without repeatedly
asking for them. An explicit deployment request authorizes its scoped execution;
do not ask for the same authorization again. Apply current project acceptance,
resource, data-preservation and publication requirements, together with the latest
direct human instructions. Creating or invoking this skill alone does not deploy.

## Established target and access

| Host | Address | Role |
| --- | --- | --- |
| masternode | 192.168.0.4 | Control plane |
| workernode2 | 192.168.0.5 | Worker |
| workernode1 | 192.168.0.6 | Worker |

- SSH user `james`, port `2002`, existing WSL identity
  `/home/brajam/.ssh/id_ed25519`; retain strict host-key verification.
- The Kubernetes API is `https://192.168.0.4:6443`; retain TLS verification.
- Run the master user's existing `kubectl` over SSH. Local Windows/WSL kubectl
  and a local kubeconfig are not required. Do not overwrite another kubeconfig.
- Use the existing user configuration first. On 2026-10-20 it worked while
  `sudo -n kubectl --kubeconfig /etc/kubernetes/admin.conf` required a password.
  Do not infer an access failure from that sudo refusal.

From Windows PowerShell:

```powershell
wsl --exec ssh -o BatchMode=yes -o ConnectTimeout=10 -i /home/brajam/.ssh/id_ed25519 -p 2002 james@192.168.0.4 kubectl get nodes -o wide
```

Recheck the live target at the start of each deployment. Addresses identify the
intended cluster; old snapshots do not establish current readiness or image state.

## Identify the actual delivery owner

For this BORTUS project, the saved workspace is:
`C:/Users/james/OneDrive/Documents/ChatGPT/kubernetes migration`.
Read its current `AGENTS.md`, `PLAN.md`, `MIGRATION_STATUS.md` and the relevant
deployment/operations documentation before changing the delivery.

Use current handoff owner bindings where supplied. Verify actual repository
top-level, branch, local HEAD, explicit remote tracking ref, live remote ref,
configured upstream and dirt separately. Do not treat the wrapper checkout's
frontend as the current application owner. Preserve intentional local commits,
dirty files and rollback sources; never reset or clean to obtain a deployment.

Current owner locations, to verify rather than assume:

- Application: `C:/Users/james/.codex/worktrees/bortus-parent-stat-a15-evaluation/kubernetes migration`;
  frontend under `k8s-rewrite/front-end`.
- Charts: `C:/Users/james/AppData/Local/BORTUS/repos/branconet-charts`.
- Charts delivery manifest: `flux/releases/bortus.yaml`.

## Prepare the exact change

1. Capture fresh workload metadata, current immutable image digest, rollout
   revision, Helm/Flux ownership, health, PVC identities and backing volumes.
   Inspect Secret references and metadata only; never print Secret values,
   kubeconfig credentials, application passwords or signing keys.
2. Identify the exact requested source revision and its built immutable image.
   Bind the image digest and packaging to that revision. A local build, export,
   tag, unrelated successful CI run or old chart image is not proof of the image
   being available and qualified for this rollout.
3. Determine which existing acceptance gates apply and which have actual proof.
   Preserve unresolved gates honestly. A general deployment instruction does not
   establish missing backup, migration, recovery or security evidence. Follow an
   explicit change to requirements from the human without inventing a waiver.
4. Prepare and review the smallest exact chart/values change and its rendered
   resources using existing project tooling. Check schema compatibility,
   effective service-account RBAC/admission, resource limits, namespace scope,
   probes, routes, PVC references and immutable image availability.
5. Establish the rollback revision and data-compatible rollback procedure before
   a stateful migration. Preserve users, credentials, aliases, identities,
   existing PVCs/Longhorn/SMB media, originals and encrypted backups. A workload
   image rollback is not proof that a schema or data migration is reversible.

Do not run `k8s-rewrite/reset-and-deploy.sh`, reset kubeadm, re-provision hosts,
force recreation, delete/rebind PVCs, generate replacement production credentials
or retire rollback data as a shortcut to application deployment.

## Execute through the existing publisher

Use the established private charts-to-Flux pipeline and the intended existing
remote. Do not introduce a second publisher or mix direct Helm/kubectl changes
with Flux ownership. Stage and commit only the reviewed authorized files; verify
the actual remote SHA after an authorized push. Keep wrapper/root documentation
local when required. Preserve draft/unmerged PR and publication boundaries unless
the human explicitly changes them.

For BORTUS, the HelmRelease is `flux-system/bortus`, with release and storage
namespace `bortus`, source `flux-system/branconet-charts`, and chart path
`./charts/bortus`. Inspect these current values before writing. A suspended
HelmRelease or `nativeKv.guardedAdoption: false` is an intentional control, not a
missing cluster. Do not silently unsuspend it, turn on adoption, bypass admission
or enable native writes to make a rollout pass. Resolve the applicable project
prerequisites and use the exact authorized promotion procedure.

Native Secrets remain authoritative: explicit alias/namespace/name/key and
resourceVersion contracts; no values in SQLite, argv, Git, errors or logs.
Preserve unrelated keys, types, metadata and empty objects. Readonly access is
metadata-only; values and mutations require a fresh write role. Keep the stable
external JWT secret and bootstrap independent from cluster creation.

## Verify on the actual cluster

Observe reconciliation and rollout against the specific release and new revision.
Verify actual Pod image IDs/digests, Ready/Available state, restart counts,
readiness/liveness, Services/endpoints and the intended ingress/HTTP behavior.
Check schema/startup and intended application functionality within the authorized
data scope. Verify preserved PVC identities and existing data access. Capture
sanitized evidence tied to the observed revision and time.

Do not use synthetic local fixture success, a CI pass, a Ready HelmRelease or
unauthenticated HTTP reachability as a substitute for required live application
or data verification. If a rollout fails, retain failure evidence and apply the
prepared compatible rollback within the authorized scope; do not repeatedly
reconcile or change unrelated resources without understanding the failure.

An IAB initialization failure is a browser-tool problem, not evidence that this
cluster is down. Continue permitted cluster discovery, deployment preparation and
Kubernetes/HTTP verification. If browser or actual assistive-technology acceptance
is an explicit gate, keep it distinct and resolve it with the required tool;
never fabricate that evidence or weaken the gate.

Update affected project documentation alongside source/config changes. Report
what is deployed, the exact live digest/revision, actual verification and any
remaining gates. Complete the current deployment task and review its results
before a feature handoff. The full delivery goal remains incomplete until all
requested requirements and final PRD deployment verification have actual proof.
