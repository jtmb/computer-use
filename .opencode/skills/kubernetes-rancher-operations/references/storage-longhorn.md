# Storage and Longhorn

Use this reference for PVC/PV lifecycle, Longhorn health, backups, restores,
RWO attachments, reclaim policies, and storage-aware drains.

## Inventory

```bash
kubectl get pvc -A
kubectl get pv
kubectl -n longhorn-system get volumes.longhorn.io
kubectl -n longhorn-system get replicas.longhorn.io
kubectl -n longhorn-system get backups.longhorn.io
kubectl -n longhorn-system get backuptargets.longhorn.io
kubectl -n longhorn-system get recurringjobs.longhorn.io
```

Record:

- PVC phase, bound PV, requested size;
- PV reclaim policy and CSI driver;
- Longhorn volume state, robustness, size, node;
- replica state and node distribution;
- backup target availability and latest backup per volume.

`attached` is not the same as `healthy`. `detached/unknown` may be intentional
or orphaned; determine whether a workload needs it.

## Backup correctness

A schedule is not a backup. A catch-up or manual run is not proof of the cron
schedule. Require:

- the scheduler's last schedule and last successful time;
- a completed backup for every attached volume after the target time;
- no error-state backup in the window;
- backup target availability;
- an observed completion time per volume.

Check the group selector. A recurring job that runs but matches no volumes
completes successfully while backing up nothing. An empty `groups: []` is the
classic silent no-op: the job, its schedule, and its history all look healthy.

A full backup and its incremental chain are different recovery units. A latest
incremental is only useful if the chain and full backup are intact.

### Recurring-job checks

```bash
kubectl -n longhorn-system get recurringjob -o yaml
kubectl -n longhorn-system get volumes.longhorn.io \
  -o json | jq -r '.items[] | [.metadata.name,
      (.metadata.labels["recurring-job-group.longhorn.io/default"] // "none")] | @tsv'
kubectl -n longhorn-system get backups.longhorn.io \
  -o json | jq -r '.items[] | [.metadata.creationTimestamp,
      .status.state, .status.volumeName, .metadata.name] | @tsv' | sort
```

Verify:

- `groups` is non-empty and matches a label every intended volume carries;
- `task` is `backup`, not only `snapshot`;
- `retain` and `full-backup-interval` match the retention policy;
- `status.executionCount` advances after a scheduled window; a static count
  means the job never ran or never matched;
- each volume's `backup-target` label points at an available target. One backup
  run can legitimately split across targets.

Cron timezone is the scheduler's, not the host's. For Longhorn, cron is
evaluated inside the `longhorn-manager` container; check its `/etc/localtime`
or `date`, not the node's timezone. Confirm empirically with the creation times
of past snapshots or backups before trusting a new schedule.

`VolumeRecurringJobInfo` labels are not populated in every Longhorn version.
When that check is unavailable, say so; spec correctness plus volume labels is
not the same as observing a completed backup.

### Forcing a run

For an immediate backup, trigger the existing scheduler rather than rewriting
the schedule:

```bash
kubectl -n longhorn-system get cronjob
kubectl -n longhorn-system create job \
  --from=cronjob/<recurring-job-name> backup-$(date -u +%Y%m%dT%H%M%SZ)
```

A one-off Job inherits the concurrency policy. If volumes back up sequentially,
allow time proportional to data size and do not start a second run. If a full
backup is required, set `full-backup-interval` temporarily and restore it after
the run. Verify completion per volume, then confirm the schedule is back to its
intended value.

Scope "no errors" to the run window. Old `Error` backups from a previous
incident are historical; do not let them block or falsely fail a new run, and
do not delete them to make a dashboard green.

### Restore test

Restore to temporary resources, never over production:

1. Create a temporary Longhorn volume from the backup URL.
2. Create a temporary PV/PVC pointing at that volume.
3. Mount read-only in a temporary pod.
4. Compare file hashes or database row counts with the live source.
5. Delete only the temporary pod, PVC, PV, volume, and namespace.
6. Verify production volumes, pods, and health are unchanged.

Some CSI/volume-attach paths fail on the first mount after restore. If a fresh
mount fails, inspect the device and controller logs; retry with a fresh
temporary volume name before assuming the backup is corrupt.

Two backup targets on the same NAS/server are not two failure domains.

## Reclaim policy and deletion risk

- `Delete`: deleting the PVC can delete the PV and the backing volume.
- `Retain`: deleting the PVC can leave the PV and data, but do not treat that as
  permission to delete.
- **Reclaim policy governs PVC deletion, not PV deletion.** A GitOps prune, a
  bundle deletion, or a manual `kubectl delete pv` can remove a `Retain` PV.
  Depending on the driver and whether the PV is statically defined, the backing
  volume may then be cleaned up or left orphaned. This is why cluster-scoped
  PVs must be prune-disabled even when they are `Retain`.
- Detached or unused volumes still count as data.
- Cluster-scoped PVs may be owned by a Helm release or GitOps bundle. Inspect
  `ownerReferences`, `managedFields`, and controller labels before changing one.

Never delete a PVC, PV, namespace, or Longhorn volume to "reset" a workload.
Never remove a finalizer while the storage controller is healthy.

## RWO attach and rollout deadlocks

A Deployment using a single-replica RWO volume can deadlock during a rolling
update: the new pod is created first and cannot attach while the old pod holds
the volume.

Symptoms:

- new pod `ContainerCreating`;
- `FailedAttachVolume` / multi-attach error;
- old pod still Running;
- Deployment `ProgressDeadlineExceeded`.

Options, in order:

1. Confirm the volume is RWO and only one pod should use it.
2. Temporarily set the Deployment strategy to `maxSurge: 0` and `maxUnavailable:
   1`, or use a `Recreate` strategy for the single-replica workload.
3. Roll out, wait for the old pod to terminate and the new pod to mount.
4. Restore the original strategy and verify it.

For StatefulSets, respect ordered startup and the volume claim template. Do not
scale down a database to force a mount without a data-safe plan.

## Storage-aware drain

Before draining a node:

```bash
kubectl get pdb -A
kubectl -n longhorn-system get volumes.longhorn.io -o wide
kubectl -n longhorn-system get replicas.longhorn.io -o wide
```

Check whether every volume has a healthy replica elsewhere. If a volume has a
last replica on the node or a PDB reports `ALLOWED=0`, stop. Use the storage
vendor's documented maintenance mode rather than bypassing eviction.

A PDB can also be held at zero by a detached or unused volume's last replica.
Before choosing a maintenance mode, confirm whether that volume is actually in
use. If the storage vendor exposes a node-drain policy, scope a temporary change
to that node and window, record it, and restore the original policy immediately
after the drain.

After the drain, verify volumes are attached/healthy on the remaining nodes and
that the workload recovered. Uncordon and verify again.

## GitOps and storage

When a GitOps controller adopts storage objects:

- annotate namespaces, PVCs, and PVs with
  `kustomize.toolkit.fluxcd.io/prune: disabled`;
- keep the storage Kustomization or path `prune: false`;
- never let a GitOps prune remove a PVC/PV;
- confirm rendered output does not rename or recreate storage;
- protect cluster-scoped PVs and storage-owned CRDs;
- preserve the live `volumeName`, `claimRef`, `storageClassName`, and reclaim
  policy.

A diff that only adds metadata is acceptable; a diff that changes a binding,
capacity, access mode, or reclaim policy is a stop condition.

## Orphaned volumes and claims

An unattached volume or unbound claim may be an orphan, but it may also be the
only copy of data. Before proposing cleanup:

```bash
kubectl get pvc -A -o json | jq -r '.items[] | [.metadata.namespace,
  .metadata.name, .status.phase, .spec.volumeName, .metadata.uid] | @tsv'
kubectl get pv -o json | jq -r '.items[] | [.metadata.name, .status.phase,
  (.spec.claimRef.name // "none"), .spec.persistentVolumeReclaimPolicy] | @tsv'
kubectl -n longhorn-system get volumes.longhorn.io -o json \
  | jq -r '.items[] | [.metadata.name, .status.state, .status.robustness,
      (.status.currentNodeID // "none"), .spec.size] | @tsv'
```

Match by `spec.volumeName` and `claimRef`, not by name similarity. A volume with
no PV/PVC reference, no workload mount, and no completed backup is a cleanup
candidate; record it and ask before deleting. A volume referenced by a running
pod is not an orphan regardless of its name.

## Verification

- all expected PVCs Bound;
- every needed PV present with the same UID;
- every attached Longhorn volume `attached/healthy`;
- replicas healthy and distributed;
- application data checks pass;
- no new pod restarts caused by storage;
- temporary restore resources are gone.
