# GitOps: Fleet and Flux

Use this reference when Fleet or Flux owns resources, when migrating between
them, or when a GitOps controller reports `NotReady`, `Unknown`, or prunes
something it should not.

## Identify the owner first

```bash
flux get sources git -A
flux get kustomizations -A
kubectl -n fleet-local get gitrepos -o wide 2>/dev/null || true
kubectl -n cattle-fleet-system get pods 2>/dev/null || true
helm list -A
```

For a single object, read its ownership metadata rather than guessing:

```bash
kubectl -n <ns> get <kind> <name> -o json \
  | jq '{labels,annotations,ownerReferences}'
```

Typical owners: a workload controller (`Deployment`/`StatefulSet`), Helm
(`meta.helm.sh/release-name`), Fleet (`objectset.rio.cattle.io/*`), Flux
(`kustomize.toolkit.fluxcd.io/*`), an operator, or a manual apply. Two owners on
one resource is a stop condition.

## Common failure classes

| Symptom | Likely cause | First check |
|---|---|---|
| Source `False` | auth, URL, branch, known_hosts, network | source conditions and controller logs |
| Kustomization `BuildFailed` | invalid manifest, missing path, bad substitution | `flux build`/`kustomize build` locally |
| Kustomization `HealthCheckFailed` | workload not Ready in time | target workload status |
| Decryption failed | SOPS key missing or wrong recipient | controller logs, secret `sops-age` |
| `Unknown` right after a revision change | reconcile in flight | wait and re-check before acting |
| Resources deleted unexpectedly | `prune: true` with drifted inventory | Kustomization inventory and prune annotations |
| GitRepo `1/1` but nothing deployed | malformed status or stale agent | controller logs, CRD schema version |

A transient `Unknown` on the first observation after a source revision change is
normal. Poll for a bounded interval (for example 60 s) before declaring failure,
and record the retry policy in automated checks.

## Migrating ownership between controllers

Never run two controllers over the same resources for longer than the cutover
window, and never delete the old controller's records before the new one is
verified.

Safe sequence per stack:

1. Capture a baseline: object UIDs, pod-template hashes, PVC/PV bindings,
   Secret data hashes, Service IPs, Ingress hosts.
2. Add the new controller's manifests with the same names, namespaces, and
   storage references. Render and diff before applying. Start with the new
   Kustomizations `suspend: true` and `prune: false`; unsuspend one stack at a
   time.
3. Verify adoption: UIDs unchanged, PVCs still Bound, pods not recreated
   unnecessarily, data checks pass.
4. Only then retire the old definition. On Fleet, set `keepResources: true` so
   removing the `GitRepo` does not delete downstream objects.
5. Confirm the old controller's inventory is empty and the new one is `Ready`.
6. Enable prune only after the stack has soaked and the inventory is proven.

Out-of-band drift is the usual cause of an unexpected pod replacement during
adoption. Compare live fields against Git and reconcile deliberately; do not
"fix" drift by adding a restart annotation to Git.

### Adoption diff

Server-side apply fails closed when a field it declares is owned by another
manager with a different value. That is safe, but it looks like a failed
cutover. Diff before applying:

```bash
kubectl diff --server-side -k <path> > /tmp/diff.txt; echo rc=$?
```

Expected: metadata-only additions (prune annotations), no removed lines, no
change to pod templates, selectors, Service ports, or storage specs. The
`kubectl.kubernetes.io/last-applied-configuration` annotation produces textual
noise; read the actual field paths, not the annotation body.

For manifests encrypted at rest, `kubectl diff -k` cannot parse the SOPS
envelope. Decrypt a temporary copy outside the repository, build that copy, and
diff the rendered output. Remove the temporary plaintext afterwards.

### Readiness and `wait`

`wait: true` uses kstatus. An Ingress is ready only when
`status.loadBalancer.ingress` is populated, which some ingress controllers never
set. A ClusterIssuer that is not Ready stalls the whole stack. Before enabling
`wait`, check each object type it covers; otherwise prefer explicit
`healthChecks` for the Deployments that matter and leave `wait: false`.

A root Kustomization that includes the Flux components, its own namespace, and
its own CRDs is self-managing. Keep it `prune: false`, and upgrade Flux through
Git rather than an ad-hoc `flux install` that Git will revert.

## Prune safety

Prune is the most dangerous GitOps setting. Protect stateful and
cluster-scoped objects:

```yaml
metadata:
  annotations:
    kustomize.toolkit.fluxcd.io/prune: disabled
```

Apply this to namespaces, PVCs, PVs, long-lived Secrets, CRDs,
ClusterIssuers, and RBAC that other components depend on. Keep the storage path
in a Kustomization with `prune: false`. Verify the rendered inventory before
enabling prune on an existing stack.

Deleting a namespace through prune deletes everything inside it. Deleting a PV
can delete the backing volume depending on reclaim policy.

## Repository access

- Prefer a read-only deploy key over a personal token for a cluster pulling
  from Git. Scope it to one repository and store the private key only in a
  Kubernetes Secret referenced by `secretRef`.
- Pin `known_hosts`; do not disable host-key checking.
- A token used to create a deploy key can remove it when revoked. Record which
  credential owns which remote object.
- Flux defaults: poll interval often 1 minute, drift correction often 10
  minutes. State may revert within that window after a manual edit.
- Do not delete or force-push a branch that a source tracks until the source is
  repointed and reconciled. A missing branch fails closed: the last applied
  revision stays running, but updates stop.
- Changing repository visibility does not retract existing clones or caches.
  Treat previously public ciphertext as exposed.

### Source failure and visibility changes

A source fetch failure fails closed. Flux keeps the last successfully applied
revision and does not prune, because pruning only happens after a *new*
revision is built and no longer contains a resource. Existing workloads and
storage remain; updates stop until authentication is restored. Do not delete
the Kustomizations or CRDs because the source is unavailable.

Order for making a repository private without an outage:

1. create the read-only credential and reference it from the source manifest;
2. commit that change and verify the controller can authenticate while the
   repository is still readable;
3. flip visibility;
4. reconcile and confirm the source and Kustomizations are Ready and that no
   resource was deleted.

If the source manifest is itself reconciled by a root Kustomization, patching
only the live object will be reverted. Commit the change first.

Any source-authentication or visibility change invalidates a no-change soak.
Restart the observation window after it.

## Fleet-specific notes

- `keepResources` is applied when the agent renders the Helm release. A paused
  `BundleDeployment` is skipped, so setting `paused: true` and
  `keepResources: true` in the same patch can leave the resources unprotected.
  Set `keepResources` while unpaused, wait for the applied deployment ID to match
  the spec, then pause.
- A parent `GitRepo` can own child `GitRepo` objects and namespaces. Bake
  `keepResources` into the parent and pause it first; delete it last, after the
  children, or deleting it cascades through every child.
- After a `GitRepo` is deleted with `keepResources`, its Helm release history is
  gone. Recreating the `GitRepo` is a fresh install, not a rollback. Test
  delete-and-recreate, not only pause-and-unpause.
- Fleet stores embedded Helm release state as `sh.helm.release.v1.*` Secrets,
  often in `default`. Deleting them or letting another controller prune them
  changes Fleet's view of the release.
- Fleet `GitRepo` status is derived. A CRD schema change can make an old status
  shape unreadable and crash the controller. The fix is to normalize the status
  subresource, not to delete workloads:

```bash
kubectl -n <fleet-ns> get gitrepo <name> -o json > before.json
# inspect status.resources[].perClusterState shape
kubectl -n <fleet-ns> replace --subresource=status gitrepo <name> -f fixed.json
```

Keep the pre-change snapshot; a status-only change is reversible by replaying
it. Do not touch PVCs, releases, or workloads for a status-shape bug.

- Fleet core is required by Rancher even when application delivery moves to
  Flux. Retire application `GitRepo` objects, not the Fleet controllers.
- After a Fleet upgrade, check that the agent has the settings the new
  controller expects; a stale agent StatefulSet can lag the controller.

## Verification

- every source and Kustomization `Ready=True` at the expected revision;
- inventory contains exactly the expected objects;
- no object has two owners;
- PVC/PV UIDs unchanged after adoption;
- workloads Ready with no unexplained restarts;
- prune-disabled annotations present on protected objects;
- for a private repo, a fresh reconcile succeeds using only the in-cluster
  credential.
