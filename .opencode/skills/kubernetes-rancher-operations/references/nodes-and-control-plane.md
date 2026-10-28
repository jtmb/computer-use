# Nodes and Control Plane

Use this reference for NotReady nodes, kubelet/runtime failures, etcd problems,
control-plane crash loops, and drain/reboot work.

## Node triage

```bash
kubectl get nodes -o wide
kubectl describe node <node>
kubectl get pods -A -o wide --field-selector spec.nodeName=<node>
```

Check:

- `Ready`, `MemoryPressure`, `DiskPressure`, `PIDPressure`, `NetworkUnavailable`;
- kubelet version and container runtime;
- taints such as `node.kubernetes.io/not-ready:NoExecute`;
- pods stuck terminating or unable to mount volumes;
- node clock, disk, memory, and network.

On the node, read-only:

```bash
systemctl status kubelet
journalctl -u kubelet --since "30 min ago" --no-pager
systemctl status containerd 2>/dev/null || true
crictl info 2>/dev/null || true
df -h
free -h
dmesg --ctime | tail -100
```

Determine whether the kubelet is posting but the API cannot see it, the
kubelet is down, the runtime is down, or the node itself is unreachable.

## Runtime failures

Distributions may bundle their own containerd instead of using the OS service.
Check the active socket and process tree before assuming which one is running.

```bash
ps -eo pid,ppid,cmd | grep -E 'containerd|kubelet' | grep -v grep
ls -l /run/containerd/containerd.sock /run/k3s/containerd/containerd.sock 2>/dev/null
crictl --runtime-endpoint <socket> ps 2>/dev/null || true
```

Orphaned `containerd-shim` processes with `PPID 1` after a runtime crash can
leave stale containers and unmanaged control-plane processes. Do not kill them
blindly. First preserve node and cluster evidence, confirm etcd snapshots, then
prefer a controlled node reboot over ad hoc process surgery.

A socket file that exists is not proof that containerd is serving. Test it.

## etcd

Identify the distribution's etcd model: static pods, a bundled process, or an
external cluster.

```bash
kubectl -n kube-system get pods -o wide
kubectl get --raw='/readyz?verbose'
```

If `etcdctl` is available and the endpoint is known:

```bash
etcdctl --endpoints=<endpoint> endpoint health
etcdctl --endpoints=<endpoint> endpoint status --write-out=table
etcdctl --endpoints=<endpoint> member list --write-out=table
```

Check quorum, leader, raft index, applied index, and disk latency. A single
unhealthy member is not quorum loss; two unhealthy members in a three-member
cluster are.

### Snapshots

Take or copy a snapshot before touching a control-plane node when possible:

```bash
rke2 etcd-snapshot save --name pre-change-<timestamp>
```

Record the path, size, and SHA-256. Copy it off-cluster and verify the checksum
on both ends. A snapshot that exists only on the failing node is not a recovery
point.

### RKE2 crash loop

Symptoms:

- `rke2-server` in `activating (auto-restart)` with a high restart count;
- containerd socket connection refused;
- orphaned shims or an unmanaged etcd process holding the etcd ports;
- node `Ready=Unknown` and a NoExecute taint;
- bootstrap reconciliation deadline exceeded.

Read-only first:

```bash
systemctl status rke2-server
journalctl -u rke2-server --since "30 min ago" --no-pager
ls -l /run/k3s/containerd/containerd.sock
ps -eo pid,ppid,cmd | grep -E 'containerd-shim|etcd' | grep -v grep
ss -lntp | grep -E '2379|2380'
```

Before a reboot, confirm etcd quorum and fresh snapshots on healthy servers.
A controlled reboot often clears orphaned shims and lets the bundled runtime
start cleanly. After reboot, verify:

- `rke2-server` active with restart count zero;
- runtime socket serving;
- node Ready with no unexpected taint;
- etcd members healthy and caught up;
- pods and Longhorn volumes recovering;
- no forced detach, PDB change, or CRD deletion was needed.

### Full etcd restore

This is a cluster-wide, destructive operation. Require explicit approval and a
fresh backup of the current state first.

For a multi-server distribution, the documented pattern is:

1. Stop the server service on every control-plane node.
2. On one server, run the distribution's cluster-reset/restore command with the
   snapshot path.
3. Start that server normally.
4. Start the other servers so they rejoin.
5. Start the agents/workers.
6. Verify members, quorum, workloads, storage, and management-plane health.

Do not invent flags. Use the installed distribution's documented restore
procedure and verify the exact binary and config first. Do not pass
cluster-reset more than once.

## Drains and PDBs

```bash
kubectl get pdb -A
kubectl get pdb -A -o wide
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
kubectl uncordon <node>
```

Stop when:

- a PDB reports `ALLOWED=0`;
- a stateful workload has a last replica on the node;
- a storage controller reports volumes degraded or unknown;
- a drain would evict the only copy of data.

Never use `--disable-eviction`, `--force`, or delete a PDB to make a drain
proceed. For storage, use the storage vendor's documented node-maintenance
mode and verify replicas before and after.

## Linux node health

Check the layer the distribution does not own:

```bash
uname -r
apt list --installed 2>/dev/null | grep -E 'linux-image|containerd|runc' || true
test -f /var/run/reboot-required && cat /var/run/reboot-required || true
systemd-analyze 2>/dev/null | head
```

Installed kernel is not running kernel. A patched package is not a patched
process. If the kernel or runtime changed, plan a reboot with the same care as
a control-plane change.

## Verification

A node is recovered only when:

- it reports Ready;
- the kubelet and runtime are healthy;
- pods can schedule and mount their volumes;
- etcd quorum is intact (control-plane nodes);
- storage is attached/healthy;
- no unexpected taints remain;
- the original workload is healthy.

Record node versions, restart counts, etcd member status, and storage state
before and after.
