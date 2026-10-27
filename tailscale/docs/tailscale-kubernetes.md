# Tailscale Kubernetes Operator and private Ingress

This guide describes a source-only, tailnet-only deployment of the official
Tailscale Kubernetes Operator and one standalone Layer 7 Ingress. It does not
deploy OpenCode, create a Service or Pod, change the tailnet policy, provision
credentials, or access a cluster. The backend must already exist and be selected
explicitly before the Ingress template is enabled. Bortus MCP is a separate
project and is not part of these artifacts.

**No live deployment is verified.** The supplied cluster endpoint has not been
validated through a trusted, authenticated Kubernetes context. The session in
which these files were prepared had no installed `kubectl` or `helm`; no cluster
credentials, kubeconfig contents, or real secrets were read.

The parent later validated the pinned chart offline with temporary Helm
`v3.22.1`, after verifying its archive checksum and detached signature against
release signer `208DD36ED5BB3745A16743A4C7C6FBB5B91C1155` from an independent
Keybase public key. `helm lint --strict` and `helm template --include-crds`
passed using an isolated home and `KUBECONFIG=/dev/null`. The render contained
eight CRDs, one Deployment, one IngressClass, one ClusterRole/Binding, two
Roles/Bindings, and two ServiceAccounts. It created no Secret and referenced
the external `operator-oauth` Secret. This was not a server dry-run, cluster
compatibility test, installation, or live acceptance test.

## Design and files

- The official stable Operator chart is pinned to version `1.104.2`; its chart
  archive SHA-256 matches the digest in Tailscale's official Helm index.
- `deploy/kubernetes/operator/values.json` enables the chart's CRDs, sets
  separate Operator and default proxy tags, and explicitly leaves Kubernetes API
  proxy and impersonation disabled. It contains no OAuth values.
- `deploy/kubernetes/ingress/opencode-ingress.json` is a deliberately disabled
  template. Its namespace, hostname, backend Service, and Service port are
  placeholders, and its ingress class is not `tailscale`. It creates no backend
  workload and names no image.
- `deploy/kubernetes/ingress/opencode-networkpolicy.json` is an optional,
  placeholder-only backend ingress policy. It is not applied by the Operator
  install workflow.

When intentionally enabled, the Ingress is standalone L7: Tailscale Serve
terminates HTTPS on TCP 443 and forwards to an existing backend `Service` of
type `ClusterIP`. No internet-facing ingress class, public `LoadBalancer`,
`NodePort`, Funnel annotation, subnet route, exit node, Kubernetes API proxy, or
`ProxyGroup` is configured. Tailscale Ingress is tailnet-facing by default, but
access still depends on the tailnet policy and must be reviewed.

Keep the application's own authentication enabled. Confirm the existing
backend's actual Service, port, health checks, and listener before editing the
template. An Operator proxy is a separate Pod: it cannot reach an application
that listens only on `127.0.0.1` inside another Pod. Do not widen the listener or
remove app authentication as a workaround; stop and request an approved
topology if the Service cannot reach the authenticated application.

## Chart provenance and verification

`deploy/kubernetes/operator/chart-pin.json` records the official index URL,
chart and app versions, archive URL, index digest, and independently checked
archive SHA-256. On 2026-10-27, the stable index listed chart `1.104.2`,
appVersion `v1.104.2`, and digest
`cf215d52f3a20fae4c77b14a191957ccb12e46b0f2ff2263c6f51c8a472cd505`. The
downloaded archive produced the same SHA-256. The pin is not a claim that the
chart has been rendered against this cluster.

Download and verify the exact archive before rendering it:

```bash
mkdir -p /tmp/opencode/tailscale-kubernetes
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  'https://pkgs.tailscale.com/helmcharts/tailscale-operator-1.104.2-1792591623-cf215d52f3a20fae4c77b14a191957ccb12e46b0f2ff2263c6f51c8a472cd505.tgz' \
  --output /tmp/opencode/tailscale-kubernetes/tailscale-operator-1.104.2.tgz
printf '%s  %s\n' \
  'cf215d52f3a20fae4c77b14a191957ccb12e46b0f2ff2263c6f51c8a472cd505' \
  '/tmp/opencode/tailscale-kubernetes/tailscale-operator-1.104.2.tgz' \
  | sha256sum --check -
```

The checksum command must report `OK` before using the archive. Stop if the
official index digest or downloaded archive differs. The tested source paths for
the pinned Operator are Tailscale's versioned
[`ingress.go`](https://github.com/tailscale/tailscale/blob/v1.104.2/cmd/k8s-operator/ingress.go),
[`userspace-proxy.yaml`](https://github.com/tailscale/tailscale/blob/v1.104.2/cmd/k8s-operator/deploy/manifests/userspace-proxy.yaml),
[`proxy.yaml`](https://github.com/tailscale/tailscale/blob/v1.104.2/cmd/k8s-operator/deploy/manifests/proxy.yaml),
[`operator-rbac.yaml`](https://github.com/tailscale/tailscale/blob/v1.104.2/cmd/k8s-operator/deploy/chart/templates/operator-rbac.yaml),
and
[`proxy-rbac.yaml`](https://github.com/tailscale/tailscale/blob/v1.104.2/cmd/k8s-operator/deploy/chart/templates/proxy-rbac.yaml).

## Prerequisites and TLS-safe target inspection

Before any cluster command, choose the exact context and namespace, then inspect
only the active context name and API endpoint:

```bash
kubectl config current-context
kubectl config view --minify \
  -o jsonpath='{.clusters[0].cluster.server}{"\n"}'
```

Confirm the output identifies the intended cluster and its HTTPS endpoint. Do
not use `kubectl config view --raw`, print CA or credential data, or set
`--insecure-skip-tls-verify`. Once the target is approved and valid credentials
and CA trust are configured, a read-only API check can confirm TLS and
authentication:

```bash
kubectl --context "$KUBE_CONTEXT" get --raw=/version
```

Stop on any certificate or authentication error. Do not work around a missing
trusted CA. The cluster must meet Tailscale's current Kubernetes compatibility
requirements; the documented minimum is Kubernetes 1.23. The tailnet must have
MagicDNS and HTTPS certificates enabled for L7 Ingress.

Before enabling the Ingress, an owner must confirm all of the following:

1. The backend namespace and an existing, authenticated OpenCode Service have
   been selected. The Service is `ClusterIP` (not `LoadBalancer` or `NodePort`),
   its port maps to the intended application listener, and the Operator can
   reach that listener across Pod networking.
2. The selected Service continues to enforce OpenCode authentication. Tailnet
   access is an additional boundary, not a replacement for app authentication.
3. The TLS hostname is unique and approved. The HTTPS/TLS certificate for the
   generated Tailscale name can be provisioned by the tailnet.
4. The operator OAuth client has only the Tailscale API scopes required by the
   official Operator setup (Services, Devices/Core, and Auth Keys), with the
   required tag ownership described below.
5. The cluster owner has reviewed chart-created CRDs, IngressClass, RBAC, and
   namespace effects. A separate application deploy identity is ready for the
   named Ingress only; it does not receive the Operator's cluster-wide rights.

## OAuth Secret and runtime state

Provision the Operator OAuth Secret separately, using a cluster-owner-approved
interactive or external secret-management process. The chart's default name is
`operator-oauth` in namespace `tailscale`; it must contain the keys `client_id`
and `client_secret`. The JSON values file intentionally leaves the `oauth`
values absent, so the Helm release and `helm --set` arguments never contain
either credential. The chart's Operator Deployment references this pre-existing
Secret and will not become ready if it is absent.

Do not put credential values in source, command arguments, shell history,
rendered manifests, CI logs, or Helm release values. A repository `.env` with
mode `0600` may be a protected bootstrap input if the owner chooses, but it is
not a substitute for Kubernetes runtime protections. Kubernetes stores the
OAuth Secret and Operator/proxy Tailscale state in the cluster; enable API-server
encryption at rest and/or use an approved external secret manager, restrict
backup access, and protect state backups. Do not print Secrets or their values
to inspect readiness.

## Tailnet tags and narrow access grant

Merge reviewed entries into the existing tailnet policy; this is not a complete
policy file. Use separate tags for the Operator, generic Operator proxies, and
this one Ingress proxy:

```json
"tagOwners": {
  "tag:k8s-operator": ["autogroup:admin"],
  "tag:k8s-proxy": ["tag:k8s-operator"],
  "tag:opencode-ingress-proxy": ["tag:k8s-operator"]
},
"grants": [
  {
    "src": ["<approved-user-or-group>"],
    "dst": ["tag:opencode-ingress-proxy"],
    "ip": ["tcp:443"]
  }
]
```

Replace the source placeholder with one actual authorized user or group from
the tailnet; do not use `*`, an all-members group, or an allow-all ACL. The
Ingress annotation assigns only `tag:opencode-ingress-proxy` to its standalone
proxy; the ungranted `tag:k8s-proxy` remains the chart default for other proxy
resources. The Operator's OAuth identity must be permitted to use its operator
tag and own the proxy tags. A grant to a tag covers every current and future
device carrying it, so do not reuse the app-specific tag for unrelated
services. No `nodeAttrs` Funnel permission or auto-approver for L3/HA services
is needed by this standalone L7 example.

## Bootstrap boundary and exact Operator RBAC

The first installation is a one-time bootstrap operation for a cluster owner or
an administrator explicitly authorized to create the chart's cluster-scoped
resources. The install command creates the `tailscale` namespace with
`--create-namespace`; the official chart adds the Operator Deployment and
ServiceAccounts, namespace Roles/RoleBindings, a ClusterRole and
ClusterRoleBinding, the `tailscale` IngressClass, and the CRDs shipped by this
chart version. Review their exact rendered forms before applying. This chart
does **not** bind any identity to `cluster-admin`.

The pinned `operator-rbac.yaml` defines ClusterRole `tailscale-operator` and a
ClusterRoleBinding to ServiceAccount `operator` in `tailscale`. Its exact
cluster-scoped rules are:

| API group | Resources | Verbs / scope |
|---|---|---|
| Core (`""`) | `nodes` | `get`, `list`, `watch` |
| Core (`""`) | `events`, `services`, `services/status` | `create`, `delete`, `deletecollection`, `get`, `list`, `patch`, `update`, `watch` |
| `networking.k8s.io` | `ingresses`, `ingresses/status` | `create`, `delete`, `deletecollection`, `get`, `list`, `patch`, `update`, `watch` |
| `networking.k8s.io` | `ingressclasses` | `get`, `list`, `watch` |
| `discovery.k8s.io` | `endpointslices` | `get`, `list`, `watch` |
| `tailscale.com` | `connectors`, `connectors/status`, `proxyclasses`, `proxyclasses/status`, `proxygroups`, `proxygroups/status`, `dnsconfigs`, `dnsconfigs/status`, `tailnets`, `tailnets/status`, `peerrelays`, `peerrelays/status`, `proxygrouppolicies`, `proxygrouppolicies/status`, `recorders`, `recorders/status` | `get`, `list`, `watch`, `update` |
| `apiextensions.k8s.io` | `customresourcedefinitions` | `get`, `list`, `watch` only for `servicemonitors.monitoring.coreos.com` |
| `admissionregistration.k8s.io` | `validatingadmissionpolicies`, `validatingadmissionpolicybindings` | `list`, `create`, `delete`, `update`, `get`, `watch` |

The same chart's `operator-rbac.yaml` adds a Role/RoleBinding only in namespace
`tailscale`. There, ServiceAccount `operator` can create, delete, bulk-delete,
get, list, patch, update, and watch `secrets`, `serviceaccounts`, and
`configmaps`; create the `operator` ServiceAccount token; get/list/watch/update
Pods and update Pod status; create/delete/bulk-delete/get/list/patch/update/watch
Deployments and StatefulSets; get/list/watch/create/update/bulk-delete
EndpointSlices; get/create/patch/update/list/watch/bulk-delete Roles and
RoleBindings; and get/list/update/create/delete ServiceMonitors. The
`proxy-rbac.yaml` separately grants ServiceAccount `proxies` a namespaced Role
in `tailscale`: the same secret CRUD verbs plus `create`, `patch`, and `get` on
Events. These are broad permissions over **all** Secrets in `tailscale`, not
resource-name-limited access to only generated state. Both service accounts can
therefore access the Operator OAuth Secret as well as Operator/proxy runtime
state. Treat that namespace-wide Secret access as a material security
exception; it is not permission for the application deploy identity.

The Operator ClusterRole is cluster-wide and includes resources for features
this minimal L7 deployment does not enable. Do not describe this chart's
Operator identity as namespace-scoped or least-privileged for only one Ingress.
The bootstrap administrator needs rights to install the chart's CRDs,
ClusterRole/Binding, IngressClass, namespace resources, and associated release
metadata. An ongoing app deploy identity should instead be scoped to get/list/
watch/create/patch/update/delete `Ingress` resources in the one approved app
namespace (and `NetworkPolicy` only if separately approved). It does not need
Secret, Tailscale CRD, cluster-scoped RBAC, or `cluster-admin` rights; the
Operator, not that identity, updates Ingress status.

For a read-only permission preview, use the chosen context and ask the
administrator to verify their existing rights; do not create a
`cluster-admin` binding:

```bash
kubectl --context "$KUBE_CONTEXT" auth can-i create namespaces
kubectl --context "$KUBE_CONTEXT" auth can-i create customresourcedefinitions.apiextensions.k8s.io
kubectl --context "$KUBE_CONTEXT" auth can-i create clusterroles.rbac.authorization.k8s.io
kubectl --context "$KUBE_CONTEXT" auth can-i create clusterrolebindings.rbac.authorization.k8s.io
kubectl --context "$KUBE_CONTEXT" auth can-i create ingressclasses.networking.k8s.io
```

## L7 proxy privilege review

For the pinned v1.104.2 source, standalone L7 Ingress uses
[`userspace-proxy.yaml`](https://github.com/tailscale/tailscale/blob/v1.104.2/cmd/k8s-operator/deploy/manifests/userspace-proxy.yaml):
it sets `TS_USERSPACE=true`, uses ServiceAccount `proxies`, and does not declare
`hostNetwork`, a privileged init container, or a privileged main container.
This L7 proxy therefore does not request `NET_ADMIN` or a TUN device in that
manifest. The separate `proxy.yaml` used by other proxy types does declare a
privileged init container and privileged Tailscale container. Do not generalize
the L7 observation to all Operator proxies, and do not claim the L7 container
runs non-root: its manifest does not set `runAsNonRoot` or a user. No custom
security context or restricted namespace labels are added here. Review the
rendered chart and actual generated Pod against the cluster's Pod Security and
admission policies before deployment; do not remove upstream-required
privileges or weaken a policy to bypass a denial.

## Optional backend NetworkPolicy

The optional JSON policy selects only explicitly labelled backend Pods, allows
TCP ingress from Pods in the `tailscale` namespace on one named/numbered
backend Pod port, and sets `policyTypes` to `Ingress` only. It has no egress
rule, does not select the Operator or proxy Pods, and therefore does not itself
block backend DNS or Operator/Tailscale control-plane egress. Its namespace,
selector, and port are sentinels; replace them only after checking the actual
backend labels, the Service `targetPort`, and the generated proxy placement.
The source selector allows any Pod in the `tailscale` namespace; narrow it to
the reviewed ingress proxy labels if the cluster's policy design supports that.
Audit other existing policies, health checks, and internal callers before
applying it, because NetworkPolicies are additive and may block traffic that
this template does not permit.

This bundle deliberately includes no policy that selects Operator/proxy Pods
and no default-deny egress policy. If the cluster already restricts egress,
pause and separately review the pinned Operator's DNS, HTTPS control-plane, and
relay connectivity requirements against the cluster's CNI; do not guess static
endpoint allowlists. This guide does not claim to enumerate or test those
dynamic egress paths.

NetworkPolicy enforcement depends on the CNI; some CNIs ignore these objects.
This template's enforcement is untested. Check Tailscale's current
[CNI compatibility guidance](https://tailscale.com/docs/kubernetes-operator/reference/compatibility)
and your cluster's CNI documentation. In particular, the documented Cilium
kube-proxy-replacement socket-load-balancing caveat concerns L3 Service
exposure; this configuration does not create an L3 Service.

## Render, preview, apply, and verify

After verifying the archive checksum, set non-secret local paths and names:

```bash
KUBE_CONTEXT='<exact-reviewed-context>'
APP_NAMESPACE='<approved-app-namespace>'
INGRESS_MANIFEST='<path-to-reviewed-ingress.json>'
CHART=/tmp/opencode/tailscale-kubernetes/tailscale-operator-1.104.2.tgz
```

Render offline and review every resource, especially the ClusterRole, Role,
bindings, CRDs, Namespace, IngressClass, and the OAuth Secret reference. The
rendered output must not contain OAuth values:

```bash
helm template tailscale-operator "$CHART" \
  --namespace tailscale \
  --values deploy/kubernetes/operator/values.json \
  > /tmp/opencode/tailscale-kubernetes/operator-rendered.yaml
```

Before a server-side dry run, confirm the exact context and CA-verified HTTPS
endpoint again. Server dry run is read-only but requires cluster
authentication and permissions to discover/validate the target resources:

```bash
helm upgrade --install tailscale-operator "$CHART" \
  --kube-context "$KUBE_CONTEXT" \
  --namespace tailscale --create-namespace \
  --values deploy/kubernetes/operator/values.json \
  --dry-run=server --hide-secret
```

**Do not apply the Operator until the owner has reviewed the rendered resources,
RBAC changes, tailnet OAuth/tag configuration, namespace, context, and rollback
target and explicitly approved this exact bootstrap change.** After that
approval, and after the owner has provisioned `tailscale/operator-oauth` through
the separately approved process, install the same checksum-verified archive:

```bash
helm upgrade --install tailscale-operator "$CHART" \
  --kube-context "$KUBE_CONTEXT" \
  --namespace tailscale --create-namespace \
  --values deploy/kubernetes/operator/values.json \
  --wait --timeout 5m
```

Do not `helm --set` credentials, add the API-server proxy, install a
`ProxyGroup`, or apply the optional NetworkPolicy in this step.

Only after the backend namespace, Service, Service port, TLS hostname, and
application authentication have been confirmed, create a reviewed copy of the
Ingress JSON and replace every sentinel. Set `ingressClassName` to exactly
`tailscale`; keep the app-specific tag and do not add a Funnel annotation. The
chosen app deploy identity may preview the secret-free manifest:

```bash
kubectl --context "$KUBE_CONTEXT" diff -f "$INGRESS_MANIFEST"
kubectl --context "$KUBE_CONTEXT" apply --dry-run=server -f "$INGRESS_MANIFEST"
```

`kubectl diff` exit status 1 means a difference is present, not necessarily an
error; inspect the full diff. Server dry-run validates without storing the
object. **Applying is a separate mutation:** request explicit approval for the
named context, namespace, Ingress, hostname, backend, tailnet grant, and
rollback before running:

```bash
kubectl --context "$KUBE_CONTEXT" apply -f "$INGRESS_MANIFEST"
```

After each approved change, verify readiness without printing Secrets or
credentials:

```bash
kubectl --context "$KUBE_CONTEXT" -n tailscale \
  rollout status deployment/operator --timeout=5m
kubectl --context "$KUBE_CONTEXT" -n "$APP_NAMESPACE" \
  get ingress opencode-tailnet
```

Confirm the Ingress has its expected Tailscale HTTPS address, then test valid
HTTPS and the application's own auth from an authorized tailnet device. Verify
denial for an unauthorized tailnet identity and from outside the tailnet, and
repeat the authorized check from a second tailnet device. Review the generated
proxy Pod's actual security context and the Operator's readiness. If any test
or second device is unavailable, report acceptance as incomplete. Source tests,
rendering, or a server dry run do not prove live tailnet isolation.

## Rollback

Before applying anything, record the reviewed prior state and rollback plan.
For the application, remove only the named Ingress (and optional policy, if it
was separately applied) after approval; let the Operator reconcile its
generated resources. Do not delete generated StatefulSets, proxy Secrets,
Tailscale state, or the whole namespace directly.

For an existing Helm release, inspect `helm history` and compare the old
version's CRDs and rendered RBAC before requesting approval to roll back to an
explicit prior revision:

```bash
REVISION='<reviewed-prior-revision>'
helm history tailscale-operator \
  --kube-context "$KUBE_CONTEXT" --namespace tailscale
helm rollback tailscale-operator "$REVISION" \
  --kube-context "$KUBE_CONTEXT" --namespace tailscale
```

Rollback can alter chart-managed RBAC and CRDs; do not run it automatically or
assume it restores OAuth, tailnet policy, or runtime state. Do not uninstall the
Operator, delete CRDs, or delete namespace `tailscale` as a generic rollback.
Repeat the positive and negative access checks after an approved rollback.

## Upstream references

- [Install the Kubernetes Operator](https://tailscale.com/docs/kubernetes-operator/install-operator)
- [Operator Ingress overview](https://tailscale.com/docs/kubernetes-operator/ingress)
- [Operator RBAC and proxy permissions](https://tailscale.com/docs/kubernetes-operator/reference/rbac)
- [Kubernetes compatibility and CNI notes](https://tailscale.com/docs/kubernetes-operator/reference/compatibility)
- [Tailnet grants](https://tailscale.com/docs/features/access-control/grants)
