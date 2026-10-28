# Triage and Evidence

Use this reference at the start of any cluster incident. The goal is to find
the failing layer before changing it.

## Symptom to layer

| Symptom | First suspects | First evidence |
|---|---|---|
| Node NotReady | kubelet, runtime, disk, network, control plane | node conditions, kubelet logs, runtime socket, node resources |
| Pod Pending | scheduling, taints, resource requests, PVC | pod events, node capacity, PVC phase, affinity |
| Pod ContainerCreating | volume attach/mount, CNI, image pull, Secret/ConfigMap | pod events, PVC/PV, Longhorn volume, CNI logs, image events |
| CrashLoopBackOff | application config, Secret, dependency, runtime | previous logs, exit code, events, config/Secret existence |
| Ingress 5xx | backend endpoints, TLS, ingress controller, DNS | ingress status, Service endpoints, controller logs, curl with Host |
| Storage degraded | replica/disk/node, backup target, network | Longhorn volume/replica state, backup target, node disks |
| GitOps NotReady | source fetch, build, decryption, dependency, health check | source status, Kustomization conditions, events, inventory |
| Upgrade stuck | version skew, PDB, failed Helm release, pending CRD | release status, node versions, drain state, controller logs |
| Backup failed | schedule, group selector, target, volume state | CronJob/RecurringJob, Backup CRs, target availability |
| API slow or errors | etcd, control-plane load, admission, network | etcd health/latency, API server logs, node pressure |

## Baseline evidence

Capture only what the case needs.

```bash
kubectl config current-context
kubectl cluster-info
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl get events -A --sort-by=.lastTimestamp | tail -n 50
kubectl get pvc -A
kubectl get ingress -A
```

For a specific workload:

```bash
kubectl -n <namespace> get deploy,sts,ds,pod,svc,ingress,pvc -o wide
kubectl -n <namespace> describe pod <pod>
kubectl -n <namespace> logs <pod> --all-containers --tail=200
kubectl -n <namespace> logs <pod> --previous --all-containers --tail=200
```

For the control plane:

```bash
kubectl -n kube-system get pods -o wide
kubectl get --raw='/readyz?verbose'
```

For GitOps:

```bash
flux get sources git -A
flux get kustomizations -A
kubectl -n <gitops-namespace> get <source-kind>,<kustomization-kind> -o wide
```

## Classify before changing

Ask:

1. Is the object absent, pending, failing, or present but not ready?
2. Is the failure at scheduling, image, volume, network, application, or
   controller level?
3. Is the object owned by a workload controller, Helm, Fleet, Flux, an
   operator, or a manual apply?
4. Did the failure begin after a specific event: rollout, upgrade, node reboot,
   credential change, or repository change?
5. Is the failure local to one node/namespace or cluster-wide?

Write one testable cause, for example:

- "The pod is pending because the RWO volume is attached to another node."
- "The node is NotReady because the kubelet cannot reach a dead containerd
  socket."
- "Flux cannot reconcile because the source artifact is absent, not because the
  manifest is invalid."

## Evidence record

Record:

- timestamp and operator;
- kubeconfig context and cluster identity;
- distribution and component versions;
- exact command and exit status;
- observed output, trimmed of secrets;
- what was expected versus what happened;
- whether the result was observed, inferred, or unavailable.

Use the same evidence before and after a change. Compare identities and data,
not just command success.

## Before/after inventory

For migrations or cutovers, capture:

- object UIDs;
- Deployment pod-template hashes;
- PVC names, volume names, phases;
- PV UIDs and reclaim policies;
- Longhorn volume state and robustness;
- Service cluster IPs and ports;
- Ingress hosts and TLS secret names;
- Secret data hashes, never values;
- pod UIDs and restart counts.

A UID change on a resource that should have been adopted is a finding. A
missing object is a stop condition until proven intentional.

A baseline is a point-in-time snapshot, not a live source of truth. Counts can
change while you capture them (a backup completes, a pod reschedules). Record
the capture timestamp and the command, and re-check anything surprising before
concluding that state changed because of your action.

## Redaction

Do not collect:

- raw kubeconfigs or bearer tokens;
- Secret values or decoded base64;
- cloud, registry, or Git credentials;
- private keys;
- full application data;
- unrelated personal logs.

Hash secret data when identity must be compared. Print key names, not values.

## Stop conditions

Stop and report when:

- two or more control-plane nodes are unhealthy;
- etcd quorum is at risk;
- storage is degraded or unknown;
- a PDB is `ALLOWED=0`;
- ownership is ambiguous;
- the only fix is deletion of persistent data;
- credentials may have been exposed.
