# Hardened Tailscale

Version-pinned, non-root Tailscale containers, private Kubernetes Ingress configuration,
and an authenticated OpenCode V2 deployment example. **Live tailnet and cluster acceptance
is still pending.** See the [acceptance checklist](docs/acceptance.md).

## Build and check locally

These commands do not load `.env`, join a tailnet, publish ports, or deploy to Kubernetes:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/prepare_test_scratch.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
docker build --target tailscale --tag jtmb/tailscale:dev .
docker build --target opencode --tag jtmb/tailscale-opencode:dev .
docker compose --env-file /dev/null --profile opencode config --quiet
RUN_DOCKER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_docker_runtime.py -v
```

The default test run skips the three opt-in container tests; the final command runs
them using disposable, network-isolated containers and synthetic data. Docker's
existing local daemon is required. No private key, kubeconfig, or real secret is read.

## Deployment guides

- [Docker and optional non-root OpenCode profile](docs/docker.md): userspace networking,
  read-only root filesystems, dropped capabilities, persistent state and tailnet-only Serve.
- [Kubernetes Operator and Ingress](docs/tailscale-kubernetes.md): checksum-pinned official
  chart, external OAuth Secret, reviewed RBAC and a disabled-until-selected backend template.
- [Tailscale deployment skill](.opencode/skills/tailscale-deployment/README.md): operational
  checks, approval boundaries and rollback. Project skill sources stay in this repository.
- [Acceptance and outstanding approvals](docs/acceptance.md).
- [Roadmap](ROADMAP.md).

Do not run deployment commands until the exact target, exposure, identity, non-secret
diff and rollback are approved. Never enable Funnel or OpenTunnel. Keep OpenCode's
application authentication enabled; tailnet access does not replace it.

The optional Compose OpenCode service shares Tailscale's network namespace and listens
on loopback. It is a separate instance, not this host's existing OpenCode service.
An Operator proxy cannot reach a different Pod's loopback without an approved topology.

## Local configuration

`.env.example` contains names and nonsecret defaults only. Preview selected keys:

```bash
python3 scripts/secret_setup.py --key TS_AUTHKEY
```

After approval, run the helper in your own terminal and enter values there:

```bash
python3 scripts/secret_setup.py --apply --key TS_AUTHKEY --key OPENCODE_PASSWORD
```

Secrets use no-echo prompts. The helper atomically writes mode-`0600` `.env`, preserves
unselected keys, rejects symlinks/unsafe modes, and never displays values. It does not
make secret backups. Its literal format allows ASCII letters, digits, `.`, `_`, `/`,
`:`, `@`, `+` and `-`; it is not shell syntax. Never source `.env`, pass secrets in
command arguments, or display expanded Compose configuration.

| Keys | Owner/use |
| --- | --- |
| `TS_AUTHKEY` | Docker node registration; one-off, tagged key preferred. |
| `TS_CLIENT_ID`, `TS_CLIENT_SECRET` | Protected Kubernetes Operator bootstrap input; not automatically deployed. |
| `OPENCODE_PASSWORD` | Optional local OpenCode server password, not a Google password. |
| `KUBE_API_SERVER`, `KUBE_NAMESPACE` | Deployment metadata; example endpoint `https://192.168.0.4:6443`. |
| `KUBE_TOKEN` | Optional protected Kubernetes API credential; never an SSH password. |
| `KUBE_CA_FILE`, `KUBE_CONFIG_FILE` | Absolute path references, not file contents. |
| `SSH_HOST`, `SSH_USER`, `SSH_PORT`, `SSH_PRIVATE_KEY_FILE` | Node-access metadata; port must be 1–65535 and key path absolute. |

The helper stores metadata but does not establish SSH or Kubernetes access. The dedicated
ignored `.local/ssh/id_ed25519` file exists with mode `0600`, and its public key is valid
Ed25519. Private contents, passphrase protection and node installation have not been
inspected or verified. A real `.env` was not created during development.

Google passwords, MFA and CAPTCHAs are entered only by the user in the visible browser;
observation pauses during protected entry. Keep each project's credentials local to that
project. Kubernetes runtime OAuth/state Secrets still require cluster-side protection.

## GitHub and maintenance

The public [jtmb/tailscale](https://github.com/jtmb/tailscale) repository contains initial
commit `669139f`, verified on `origin/main`. No GHCR image is published. The first
hosted validation run found a missing clean-runner scratch prerequisite; the local fix
is awaiting its own commit/push approval and remote verification. The workflow validates
changes and publishes only after explicit manual
opt-in on `main`. Publication is serialized and checks that version/SHA tags do not exist.
Derivative tags include a revision, initially `v1.104.2-r1`, plus the full source SHA.

The optional OpenCode helper image is built locally, not published by this workflow.
Weekly Dependabot proposals cover Docker bases and GitHub Actions; nothing auto-merges
or auto-deploys. Initial push, CI and weekly proposals were explicitly approved and activated.
Subsequent commits, pushes and image publication require their own approvals.

## External MCP boundary

The Kubernetes MCP and its companion skills belong to the separate
[bortus-mcp](https://github.com/jtmb/bortus-mcp) project. Its session was moved to
`~/repos/bortus-mcp`. Its functional server and integration remain pending; this repository
does not contain or implement them. Work here proceeds without launching more subagents.
