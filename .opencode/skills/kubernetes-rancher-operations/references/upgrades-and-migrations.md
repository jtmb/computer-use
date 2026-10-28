# Upgrades and Migrations

Use this reference for Kubernetes, Rancher, Fleet, Longhorn, cert-manager, and
add-on upgrades, and for any planned production migration.

## Preconditions

Do not start an upgrade until all of these are true:

- the target version is inside the vendor support matrix for the *current*
  Kubernetes version and distribution;
- the exact patch release publishes artifacts for your distribution,
  architecture, and installation method; an announced version may have no
  downloadable build yet;
- every node is Ready and on a supported runtime;
- control-plane etcd is healthy with quorum;
- storage is attached/healthy with no degraded or unknown volumes;
- no PDB blocks eviction;
- a fresh recovery point exists and has been restored once in a test;
- the rollback path is written down and does not depend on the upgrade
  succeeding.

Check the matrix before choosing a version. A controller or GitOps tool may
require a newer Kubernetes API than the cluster provides; installing it anyway
produces a permanent `NotReady` and a misleading error.

```bash
kubectl version -o yaml
kubectl get nodes -o wide
kubectl -n <mgmt-ns> get pods
helm list -A
```

## Version sequencing

- Upgrade one minor version at a time unless the vendor documents a supported
  jump.
- Upgrade the management plane and its CRDs before the components that depend
  on them, and the cluster runtime before the management plane that manages it,
  unless the vendor says otherwise.
- Check each component's support matrix separately. A storage controller or
  add-on may require a newer Kubernetes version than the cluster currently
  runs; sequence the runtime first, then the component, and re-check the matrix
  after every hop.
- During a rolling control-plane upgrade, add-on charts may require the target
  Kubernetes version while an old API server still serves. Add-on jobs can
  crash-loop until the last control-plane node is upgraded; finish the window
  and verify the final API server version instead of rolling the add-on back.
- Verify after every hop: API health, nodes Ready, management UI over HTTPS,
  GitOps reconciliation, storage health, and the workloads that matter.
- Do not combine a runtime upgrade, a storage upgrade, and a GitOps ownership
  change in one window. If it breaks, you will not know which change caused it.

## Recovery gate pattern

Before a risky change, require all of:

1. a completed full backup of every attached volume, after the change window
   was announced;
2. an off-cluster copy of the etcd snapshot with matching SHA-256 on both ends;
3. an application-level dump for stateful apps (database export, config file);
4. a restore test into temporary resources that matches live data;
5. the backup timestamp is newer than the last known good state.

A backup that has never been restored is a hypothesis, not a recovery point.
A snapshot that exists only on the node being changed is not off-cluster.

## Helm release conflicts

`UPGRADE FAILED: release: already exists` or a release stuck in
`pending-upgrade` usually means an earlier operation was interrupted, not that
the chart is broken.

```bash
helm list -A
helm history <release> -n <ns>
kubectl -n <ns> get secret -l owner=helm
```

Recover by reconciling the release state with the installed chart and CRDs
before changing anything else. Do not uninstall a management-plane chart to
"reset" it; that can cascade into CRD and workload loss. Prefer the vendor's
documented recovery, and take a backup before touching release secrets.

After a management-plane upgrade, re-check the bundled components (Fleet,
webhook, cert-manager, storage) because their versions may have moved even when
you did not request it.

## Node and kernel upgrades

- Installed package version is not the running kernel. Check `uname -r` against
  the installed kernel package (`linux-image-*` on Debian/Ubuntu, `kernel-core`
  on Fedora/RHEL).
- A kernel or container-runtime change needs a reboot to take effect.
- Drain one node at a time; verify storage replicas and PDBs first.
- After reboot, confirm the runtime socket is serving, the node is Ready, etcd
  (if control plane) has rejoined, and storage volumes recovered.
- A node can go NotReady during the window because kubelet or the runtime did
  not restart cleanly. Confirm quorum and storage safety first, then complete
  the runtime step with a controlled reboot; do not abandon the window with the
  node half-upgraded.
- Never use forced eviction to get past a PDB or a volume with its last
  replica on that node.

## Migration between delivery systems

Treat a delivery migration as a series of independent, reversible cuts:

1. inventory what is actually deployed and who owns it;
2. preserve namespaces, PVCs, PVs, and Secrets by name and binding;
3. stand up the new controller alongside the old one;
4. migrate one stack, verify, then the next;
5. retire the old definition only after the new one is proven;
6. keep the old controller's core installed if a management plane depends on it.

Serial cutover is slower but localizes failure. Parallel cutover across every
stack at once turns one mistake into an outage.

## Rollback design

A rollback is a tested procedure with an owner and a trigger, not a wish.

- Know the exact command and the expected state after it.
- Know what cannot be rolled back: CRD schema changes, storage format upgrades,
  and data written by a newer application version.
- Keep the previous manifests and the previous controller definition until the
  soak passes.
- For GitOps, reverting a commit is a rollback only if the controller has not
  already pruned the old objects.

## Rancher management plane

- Rancher bundles and can upgrade Fleet, the webhook, and other system charts.
  After a Rancher upgrade, check the bundled component versions separately;
  they can move without an explicit request.
- A Rancher Helm release in `failed` or `pending-install` state blocks later
  upgrades. Reconcile the release before adding changes, and do not uninstall
  Rancher to clear it.
- The Rancher proxy path (`/k8s/clusters/<id>`) may not expose every API
  endpoint, for example `/readyz`. Use a direct kubeconfig for low-level health
  checks and the proxy for user-facing verification.
- Rancher returns HTTP 200 from its UI even when some downstream cluster or
  workload is unhealthy. Treat it as one check, not the whole health verdict.
- Rancher's `local` cluster is both the management plane and a workload
  cluster. A change there can affect the UI, Fleet, and applications at once;
  scope the blast radius before acting.

## Verification

- target versions reported by the component, not by the package manager;
- nodes Ready with expected kernel and runtime;
- etcd members healthy and caught up;
- storage attached/healthy, PVCs Bound, PV UIDs unchanged;
- management UI returns HTTP 200 over TLS;
- GitOps sources and Kustomizations Ready at the intended revision;
- application health checks and data checks pass;
- no new restarts or evictions attributable to the change.
