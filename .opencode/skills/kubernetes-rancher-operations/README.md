# Kubernetes and Rancher Operations Usage

This guide explains how to use the `kubernetes-rancher-operations` skill. The
agent-facing operating rules remain in [SKILL.md](./SKILL.md); OpenCode does not
automatically load this usage guide or the reference files when the skill loads.

Category: `troubleshooting`

Tags: `kubernetes`, `rancher`, `cluster`, `gitops`, `longhorn`, `backup`,
`troubleshooting`

## Purpose and when to use it

Use this skill for cluster and infrastructure work across distributions and
environments, including:

- an unhealthy node, control plane, etcd member, or storage layer;
- a stuck Deployment, StatefulSet, rollout, or image pull;
- GitOps reconciliation failures with Fleet or Flux;
- a planned Kubernetes, Rancher, Fleet, Longhorn, or add-on upgrade;
- a migration between delivery systems or between clusters;
- ingress, Service, DNS, TLS, cert-manager, or tunnel failures;
- secrets in Git, repository visibility changes, or credential exposure;
- backup, restore, and disaster-recovery validation.

It is intentionally environment-agnostic. Distribution-specific commands are
shown as options to confirm, not as assumptions.

## Prerequisites and environment verification

Before acting, identify the target:

```bash
kubectl config current-context
kubectl cluster-info
kubectl get nodes -o wide
kubectl version -o yaml
```

Record whether the cluster is managed by Rancher or another platform, which
GitOps controller owns the resources, and whether Longhorn or another storage
system provides the PVCs. Check which CLIs actually exist; do not assume
`flux`, `helm`, `etcdctl`, or `longhornctl` is installed.

Access should be least-privilege for the task. Read-only diagnosis must not be
performed with a cluster-admin credential when a narrower one is available.

## How to request it

Ask in ordinary language and include the observable symptom.

Example requests:

- "This node is NotReady after a reboot. Find the cause without deleting data."
- "A pod is stuck in ContainerCreating on a Longhorn volume."
- "Flux says the Kustomization is not ready. Diagnose it."
- "Plan an upgrade from this Kubernetes version to the next supported one."
- "Check whether our backups would actually restore."
- "We committed a token by mistake. Contain it and tell me what to rotate."

The agent should choose one layer, one testable cause, and one reversible
change, and ask before any state-changing step.

## Worked workflow and expected result

A representative workflow:

1. Capture the symptom, scope, and recent change.
2. Establish cluster identity, versions, and ownership.
3. Collect a narrow baseline: nodes, pods, events, PVCs, GitOps, ingress.
4. Classify the failing layer and state one testable cause.
5. Define success, stop conditions, rollback, and data-safety requirements.
6. Take a fresh recovery point if data or the control plane could be affected.
7. Apply the smallest reversible change after approval.
8. Repeat the original check and compare identities and data.
9. Record evidence, residual risk, and anything not verified.

Expected result: the original symptom is gone, the same reproduction passes,
and surrounding state is unchanged or intentionally changed.

## Verification and known limitations

Verification must compare before and after, not just report a zero exit code:

- node conditions and versions;
- pod UIDs, readiness, and restart counts;
- PVC phase, bound PV, PV UID;
- Longhorn volume state and robustness;
- GitOps source/Kustomization readiness and inventory;
- ingress and Service endpoint behavior;
- management UI HTTP status;
- Secret data hashes, never values;
- a fresh backup when data was at risk.

Known limitations:

- Some vendor recovery procedures differ by distribution and version; use the
  installed version's documentation rather than guessing flags.
- A controller `Unknown` state may be transient; observe before acting.
- Old handoffs, chats, and reports are context, not live evidence.
- Backup success does not prove restorability; only a restore test does.
- A private repository change does not retract already-cloned ciphertext.

## Troubleshooting the troubleshooting work

- No clear layer: re-read events and compare against the last known good state.
- Multiple plausible causes: test them separately; do not combine fixes.
- Fix reverts: a controller is re-applying drift; find the owner before editing
  live objects again.
- Rollout stuck only on one node: inspect volume attachment and stale mounts.
- GitOps healthy but app broken: move to workload, ingress, and application
  layers.
- Storage healthy but data wrong: check the application, not the volume.

## Safety, confirmation, and elevation

Ask immediately before a node drain or reboot, control-plane change, storage
upgrade, Rancher upgrade, CRD change, namespace/PVC/PV deletion, security or
permission change, repository visibility change, commit, or push.

Never use these as shortcuts:

- forced drain or deleting a PDB to unblock eviction;
- deleting a PVC, PV, namespace, CRD, or finalizer to reset state;
- uninstalling Rancher, Fleet, cert-manager, or Longhorn to reset Helm;
- force-pushing a shared branch to fix GitOps;
- disabling TLS validation, admission, sandboxing, or authorization;
- printing a credential to prove it exists.

Stop when more than one control-plane node is unhealthy, etcd quorum is at risk,
storage is degraded or unknown, a PDB reports zero allowed disruptions,
ownership is ambiguous, or the only fix destroys persistent data.

## Related skills and documents

- [`system-troubleshooting`](../system-troubleshooting/README.md) covers the
  host operating system rather than the cluster.
- [`github-operations`](../github-operations/README.md) handles repository and
  pull-request actions with approval gates.
- [`handoff`](../handoff/README.md) records live cluster state for the next
  session.
- [`routine-automation`](../routine-automation/README.md) turns verified checks
  into scheduled jobs.
- The canonical catalog entry is in `skills/README.md`.
