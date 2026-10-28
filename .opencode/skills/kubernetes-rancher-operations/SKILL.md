---
name: kubernetes-rancher-operations
description: Diagnose and operate Kubernetes and Rancher clusters across distributions, including nodes, control plane, etcd, storage, GitOps, networking, secrets, upgrades, backups, restores, and production migrations. Use when a cluster is unhealthy, an upgrade or migration is planned, or Fleet/Flux, Longhorn, ingress, or node behavior needs evidence-based diagnosis and rollback.
metadata:
  schema-version: "1"
  category: "troubleshooting"
  tags: "kubernetes,rancher,cluster,gitops,longhorn,backup,troubleshooting"
---

# Kubernetes and Rancher Operations

Diagnose and operate a cluster without guessing, without bypassing safety
controls, and without confusing a symptom for the root cause. This skill covers
cluster and infrastructure layers. Use `system-troubleshooting` for the Ubuntu
desktop itself and `opencode` for the OpenCode harness.

## Core rules

1. **Identify the target before running anything.** Record the kubeconfig
   context, cluster API endpoint, distribution, version, and whether a
   management plane such as Rancher runs in the same cluster.
2. **Read-only first.** Inventory the actual state before changing it. Do not
   treat an old handoff or a previous chat as live evidence.
3. **Find the layer.** Separate node, runtime, control plane, storage,
   networking, GitOps ownership, application, and credential failures.
4. **One testable cause, one reversible change.** Do not combine upgrades,
   storage changes, and GitOps ownership changes in one window.
5. **Define the rollback before acting.** A backup is not a rollback until it
   has been restored and verified. A Helm rollback may not reverse CRDs,
   schemas, or storage metadata.
6. **Verify the user-visible outcome.** Exit code zero is not proof. Repeat the
   original check and compare identity, data, and health before and after.
7. **Protect data and credentials.** Never print kubeconfigs, tokens, Secret
   values, private keys, or raw cloud credentials. Redact evidence.
8. **Respect ownership.** Never let two controllers manage the same resource.
   Never delete a resource to hide a reconciliation conflict.
9. **Stop on unsafe conditions.** More than one unhealthy control-plane node,
   etcd quorum risk, degraded or unknown storage, a blocked PodDisruptionBudget,
   or unknown ownership is a stop condition, not a puzzle to force through.
10. **Commit and push are separate approvals.** A repository change is not a
    deployment approval; a commit approval is not a push approval.

## Triage loop

1. **Scope the symptom.** What is broken, for whom, since when, and what
   changed? Record the exact error and the smallest reproduction.
2. **Establish the cluster identity.** Context, distribution, Kubernetes
   version, node count, management plane, and the component that owns the
   failing object.
3. **Capture a baseline.** Nodes, pods, events, storage, GitOps, ingress,
   versions, and recent changes. Save only the fields needed.
4. **Classify and hypothesize.** Choose one layer and write one testable cause.
5. **Set the gate.** Define success, stop conditions, rollback, data-safety
   requirements, and the maintenance window.
6. **Change the smallest thing.** Take a fresh recovery point first when the
   change can affect data or control-plane availability.
7. **Verify and record.** Compare before and after, then write the evidence and
   residual risk.

## Baseline commands

Run only the commands that fit the environment; do not assume a tool is
installed.

```bash
kubectl config current-context
kubectl cluster-info
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl get events -A --sort-by=.lastTimestamp | tail -n 50
kubectl get pvc -A
kubectl get ingress -A
```

Add the matching tooling only when present:

```bash
flux get sources git -A
flux get kustomizations -A
helm list -A
kubectl -n longhorn-system get volumes.longhorn.io
```

## Reference routing

Read only the reference that matches the problem. Do not load every reference.

| Reference | Read it when |
|---|---|
| [`references/triage-and-evidence.md`](references/triage-and-evidence.md) | Starting any incident, choosing a layer, or designing before/after evidence. |
| [`references/nodes-and-control-plane.md`](references/nodes-and-control-plane.md) | A node is NotReady, kubelet or containerd is unhealthy, etcd is degraded, a control-plane process is crash-looping, or a drain/reboot is needed. |
| [`references/storage-longhorn.md`](references/storage-longhorn.md) | PVCs/PVs, Longhorn volumes, backups, restores, RWO attachments, reclaim policies, or storage-aware drains are involved. |
| [`references/gitops-fleet-flux.md`](references/gitops-fleet-flux.md) | Fleet or Flux owns resources, a GitOps migration is planned, prune/suspend/keepResources matters, or repository visibility/authentication changes. |
| [`references/upgrades-and-migrations.md`](references/upgrades-and-migrations.md) | Upgrading Kubernetes, Rancher, storage, or add-ons; planning a production migration; or checking version skew and support matrices. |
| [`references/networking-ingress-tls.md`](references/networking-ingress-tls.md) | Ingress, Service, DNS, TLS, cert-manager, Cloudflare tunnel, Rancher proxy, or upstream health is failing. |
| [`references/secrets-and-repo-security.md`](references/secrets-and-repo-security.md) | Secrets are stored in Git, a repo changes visibility, a deploy key or token is introduced, or credential exposure is suspected. |
| [`references/workload-rollouts.md`](references/workload-rollouts.md) | A Deployment/StatefulSet is stuck, an image tag or pull policy is wrong, a rollout deadlocks on storage, or Helm/SSA ownership conflicts. |
| [`references/incident-response.md`](references/incident-response.md) | The blast radius is larger than one workload, data loss is possible, or a change must be frozen and rolled back. |

## Stop conditions

Stop and report before changing anything when:

- two or more control-plane nodes are NotReady, or etcd has lost quorum;
- a PVC, PV, or Longhorn volume is degraded, unknown, or detached when it
  should be attached;
- a PodDisruptionBudget reports `ALLOWED=0` and the drain is not clearing
  through a documented storage-maintenance path;
- the same resource is owned by Fleet, Flux, Helm, an operator, and a manual
  apply at the same time;
- the only proposed fix is deleting a namespace, PVC, PV, CRD, PDB, finalizer,
  or etcd data directory;
- a credential or plaintext secret may have been exposed;
- the recovery point is missing, unverified, or older than the last known good
  state.

## Safety and approval

Ask immediately before a node drain, reboot, control-plane change, storage
upgrade, Rancher upgrade, CRD change, namespace/PVC/PV deletion, security or
permission change, repository visibility change, commit, or push.

Never use these as shortcuts:

- `kubectl drain --disable-eviction` or `--force`;
- deleting a PDB, finalizer, CRD, or namespace to unblock a rollout;
- deleting a PVC or PV to "reset" storage;
- uninstalling Rancher, Fleet, cert-manager, or Longhorn to reset Helm;
- force-pushing over a shared branch to "fix" GitOps;
- disabling TLS validation, admission, sandboxing, or authorization;
- printing a credential to prove that it exists.

## Verification

A fix is complete only when the original symptom is gone, the same
reproduction passes, and the surrounding state is unchanged or intentionally
changed:

- node conditions and versions;
- pod UIDs, readiness, and restart counts;
- PVC phase and bound volume;
- Longhorn volume state and robustness;
- GitOps Kustomization readiness and inventory;
- ingress/service endpoint behavior;
- Rancher HTTP response;
- secret data hashes, without values;
- a fresh backup when the change affected data.

Record the command, context, timestamp, version, exit status, and result.
Separate observed facts from inference.

## Usage guide

When the user asks how to use this skill, read
[README.md](./README.md) for request examples, prerequisites, verification,
limitations, and safety. Reference files are not loaded automatically.
