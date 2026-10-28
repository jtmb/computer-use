# Networking, Ingress, and TLS

Use this reference for Ingress, Service, DNS, TLS, cert-manager, tunnel, and
management-proxy failures.

## Triage order

Work from the client inward; do not change the ingress before proving the
backend is healthy.

1. DNS: does the name resolve to the expected address?
2. Edge: tunnel, load balancer, or node port reachable?
3. TLS: certificate valid, chain complete, SNI correct?
4. Ingress controller: does it have a matching rule and a Ready backend?
5. Service: selector matches pods, endpoints populated, port correct?
6. Pod: Ready, listening on the expected port, not crash-looping?
7. Application: correct host header, base path, redirects?

```bash
kubectl get ingress -A
kubectl -n <ns> describe ingress <name>
kubectl -n <ns> get svc,endpoints,endpointslices -o wide
kubectl -n <ns> get pods -o wide --show-labels
kubectl -n <ingress-ns> logs deploy/<controller> --tail=200
```

Test from inside and outside the cluster, and always send the intended Host:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/
curl -sS -o /dev/null -w '%{http_code}\n' --resolve <host>:443:<ip> https://<host>/
kubectl run curl --rm -it --image=curlimages/curl --restart=Never -- \
  curl -sS -o /dev/null -w '%{http_code}\n' http://<service>.<ns>.svc:<port>/
```

A `200` from the management UI is a useful end-to-end check but does not prove
every application route works.

## Ingress rule review

One Ingress can expose several hostnames, and a single rule can accidentally
publish an internal service. Read every host and TLS entry before assuming an
app is private.

- Separate internal and public hostnames into different Ingress objects, or
  remove the public host explicitly.
- Check annotations that change behavior: rewrite, auth, CORS, body size,
  timeouts, proxy protocol, and external auth.
- A default backend or wildcard host can capture traffic you did not intend.
- Verify TLS secret names exist and match the hosts.

## cert-manager

```bash
kubectl -n cert-manager get pods
kubectl get clusterissuer,issuer -A
kubectl get certificate,order,challenge -A
kubectl -n <ns> describe certificate <name>
```

Common causes:

- issuer not Ready (bad account key, DNS01 credentials, ACME rate limit);
- challenge cannot be solved because the solver service or DNS record is wrong;
- a failed Helm install leaves cert-manager half-created; recover the release
  before creating more Certificates;
- a Certificate references a Secret in another namespace without the right
  permissions.

Do not disable TLS verification or switch to a self-signed issuer to "make it
work" in production.

## Tunnels and external proxies

When a tunnel (for example Cloudflare Tunnel) fronts the cluster:

- confirm the tunnel pod is Ready and connected;
- confirm the public hostname maps to the right in-cluster service;
- check that the origin certificate and the tunnel's TLS mode agree;
- test both the public name and the internal service;
- remember that removing a public hostname from the Ingress does not remove
  cached DNS or an existing tunnel route.

## Management-plane proxy

A Rancher-style proxy path such as `/k8s/clusters/<id>` uses a token or session.
Test the UI endpoint and the API separately, and never paste the kubeconfig or
token into a repository. For automation, use a scoped token stored outside Git
and redact it from logs.

## Verification

- DNS resolves as intended from an external resolver;
- TLS chain valid with the expected SNI;
- Ingress has exactly the intended hosts;
- Service endpoints are non-empty and point at Ready pods;
- internal-only names are not reachable from outside;
- management UI and API return the expected status;
- no controller log shows repeated 502/503 or certificate errors.
