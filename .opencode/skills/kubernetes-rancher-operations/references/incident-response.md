# Incident Response

Use this reference when the blast radius is larger than one workload, data loss
is possible, or a change must be frozen and rolled back.

## First ten minutes

1. **Freeze changes.** Stop upgrades, migrations, and GitOps edits that are not
   part of the response.
2. **State the impact.** What is unavailable, for whom, since when, and is data
   at risk?
3. **Protect the recovery point.** Confirm etcd snapshots and volume backups
   exist off-cluster before touching a failing node.
4. **Preserve evidence.** Capture node conditions, pod states, events, and
   relevant logs before restarting anything.
5. **Pick one hypothesis and one reversible action.** Do not stack fixes.

## Triage by blast radius

| Scope | First question |
|---|---|
| One pod | application, config, or volume? |
| One node | kubelet/runtime, disk, network, or hardware? |
| One namespace | quota, RBAC, NetworkPolicy, or a shared dependency? |
| Whole cluster API | etcd, control-plane quorum, or certificate expiry? |
| Management plane only | Rancher/webhook/cert-manager, while workloads still run? |
| Storage | replica/disk failure, backup target, or network to the target? |

Workloads can be healthy while the management plane is down. Say which one is
actually broken instead of treating them as the same outage.

## Control-plane emergency

Stop and escalate when two or more control-plane nodes are NotReady or etcd has
lost quorum. Do not reboot the remaining healthy member "to be consistent".

```bash
kubectl get --raw='/readyz?verbose'
kubectl -n kube-system get pods -o wide
etcdctl --endpoints=<endpoint> endpoint health
etcdctl --endpoints=<endpoint> member list --write-out=table
```

Signs of a wedged member: its raft index does not advance while peers do, the
server service times out bootstrapping, and the kubelet never returns. Recovery
is a controlled restart of that member after confirming the other members are
healthy and a fresh snapshot exists - not a full cluster reset.

## Storage emergency

- Never delete a PVC, PV, or Longhorn volume to unblock a pod.
- Never remove a finalizer while the storage controller is healthy.
- If a volume is degraded, identify the failing replica or disk and whether a
  healthy replica exists elsewhere before any node action.
- If a backup target is unreachable, fix the target path and credentials; do not
  delete backup CRs to clear errors.

## Rollback

Write the rollback before the change, and execute it as one step:

- revert the Git revision or restore the previous manifest set;
- confirm the controller reconciles and does not prune the objects you need;
- restore data only from a verified backup, into temporary resources first when
  possible;
- verify the original symptom is gone and no new symptom appeared.

A rollback that recreates a PVC with the same name can bind to a different PV.
Check the binding, not just the phase.

## Communication and record

Keep a timestamped log:

- observation (what you saw, with the command);
- inference (what you think it means);
- action (what you changed and why);
- result (what changed afterward);
- next check.

Separate observed facts from guesses. A stale handoff or an earlier chat is not
live evidence; re-check the cluster before acting on it.

## Recovery order

1. control plane and etcd;
2. nodes and runtime;
3. storage and network;
4. management plane (Rancher, GitOps, cert-manager);
5. applications, least critical first or dependency order;
6. backups and monitoring.

Do not restore applications before storage and DNS are healthy; you will create
a second incident.

## After the incident

- verify every layer, not just the one that failed;
- record the root cause and the evidence that proves it;
- record what made it worse (forced eviction, deleted PDB, restarted healthy
  nodes);
- add a check that would have caught it earlier;
- keep the recovery point until the system has soaked;
- state residual risk and anything that could not be verified.
