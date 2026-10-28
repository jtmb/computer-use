# Workload Rollouts

Use this reference when a Deployment or StatefulSet is stuck, an image tag or
pull policy is wrong, a rollout deadlocks on storage, or a controller fights
over ownership.

## Diagnose before restarting

```bash
kubectl -n <ns> get deploy,sts,ds,pod -o wide
kubectl -n <ns> rollout status deploy/<name> --timeout=120s
kubectl -n <ns> describe deploy/<name>
kubectl -n <ns> describe pod <pod>
kubectl -n <ns> get events --sort-by=.lastTimestamp | tail -30
```

Read the condition, not just the phase:

- `ProgressDeadlineExceeded` - new pods never became Ready;
- `ContainerCreating` - volume, CNI, image, or Secret/ConfigMap;
- `ImagePullBackOff` - registry auth, tag, or policy;
- `CrashLoopBackOff` - application or config; read `--previous` logs;
- `Pending` - scheduling, resources, taints, or unbound PVC;
- `Terminating` stuck - finalizer or a node that cannot confirm deletion.

## RWO volume deadlock

A single-replica Deployment with a ReadWriteOnce volume can deadlock on a
rolling update: the new pod is created first and cannot attach while the old pod
still holds the volume.

Symptoms: new pod `ContainerCreating`, `FailedAttachVolume` or multi-attach
events, old pod still Running, rollout never completes.

Fix in this order:

1. confirm the claim is RWO and only one pod should use it;
2. temporarily set the strategy so the old pod goes away first:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 0
      maxUnavailable: 1
```

   or use `type: Recreate` for a genuinely single-instance workload;
3. roll out and wait for the new pod to mount;
4. restore the original strategy and record the temporary change.

For a StatefulSet, respect ordered startup and the volume claim template. Do not
scale a database down to force a mount without a data-safe plan.

## Image tags and pull policy

- `:latest` (or no tag) with `IfNotPresent` silently keeps an old image.
- Pin a digest or an immutable version tag for reproducibility.
- `imagePullPolicy: Always` only helps if the registry actually has a new image
  under that tag; it is not a deployment strategy.
- Check init containers and sidecars too, not just the main container.
- Private registries need an `imagePullSecret` in the pod's namespace, and the
  Secret must be referenced by the pod spec.

A "redeploy latest" operation should change the image reference or the pull
policy *and* trigger a rollout, then verify the running image ID, not just the
pod phase. A workload on `:latest` can also change on any reschedule, which
confounds a "no drift, no restarts" soak: the running image is no longer
reproducible from Git.

## Manifest hygiene

- Duplicate mapping keys in YAML (for example a second `volumeMounts:` in one
  container) are a hard error for strict parsers and can silently drop the
  first block in lenient ones. Consolidate into one list.
- Validate rendered output, not only the source: `kustomize build`, `helm
  template`, or `kubectl apply --dry-run=server`.
- Long-running commands need a timeout. Wrap `kubectl rollout status` with
  `timeout 180 kubectl ...` in scripts so a stuck watch cannot hang an
  automated check.
- A Deployment that reports success while the watch lingers is not proof of
  readiness; check `status.observedGeneration`, `availableReplicas`, and pod
  conditions.

## Config drift and GitOps adoption

The most common adoption surprise is live state that is not in Git:

- a `securityContext` added by hand;
- a `kubectl rollout restart` annotation (`kubectl.kubernetes.io/restartedAt`)
  that Git does not contain;
- resources, probes, or env vars edited in place;
- a Service selector or port changed manually.

Before letting a controller adopt a workload, diff live against rendered
manifests. Decide per field: keep it in Git, or intentionally revert it. Do not
add a restart annotation to Git to reproduce a one-off restart; it will trigger
again on every reconcile in some setups.

Missing `securityContext` is not cosmetic. A pod that ran as one user can fail
to start or lose access to its volume when the field is applied later.

## Ownership conflicts

Server-side apply and Helm both track field ownership. Symptoms include
`conflict with ...`, fields reverting, or a release refusing to upgrade because
resources already exist.

- identify the current manager:

```bash
kubectl -n <ns> get <kind> <name> -o json \
  | jq '.metadata.managedFields[] | {manager,operation,fields}'
```

- prefer reconciling through the owning controller;
- use force ownership only with a backup and a clear statement of what will be
  overwritten;
- never delete a CRD or release Secret to clear a conflict.

## Stale mounts and node-level attachment errors

`already mounted or mount point busy`, or a mount that fails only on one node
after a reboot, usually means a stale global mount or an orphaned attach, not
corrupt data.

Safe response:

1. confirm the device and filesystem are healthy read-only;
2. confirm no other pod legitimately uses the volume on that node;
3. reschedule the pod to a different node to force a fresh attach/mount;
4. verify data and application health.

Do not format, wipe, or recreate the volume to clear a mount error.

## Verification

- rollout reports complete and the observed generation matches;
- pods Ready with the expected image digest;
- restart counts stable after a short observation window;
- PVC still Bound to the same PV;
- application health endpoint and a real request succeed;
- no `FailedAttachVolume`, `FailedMount`, or `ImagePull` events remain;
- the temporary strategy or annotation change was reverted or recorded.
