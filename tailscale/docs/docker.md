# Hardened Docker deployment

This guide runs the official Tailscale container through a small, non-root
derivative. The default Compose service uses userspace networking, does not
publish ports, and does not require `/dev/net/tun`, extra capabilities, host
networking, a Docker socket, or host-mounted state.

## Prerequisites and pinned images

- Docker Engine with the Compose v2 plugin.
- A Tailscale account and permission to create an auth key for the initial
  registration.

The Tailscale base is pinned to upstream `v1.104.2` and the multi-architecture
GHCR manifest digest
`sha256:b11583ad2e93e4671128538c88cf11f460444a5d7e449311dd1933a400ab849d`.
At implementation time, the upstream `stable` and `v1.104.2` GHCR tags resolved
to this same digest. The base image is built by the official
[Tailscale Docker image build script](https://github.com/tailscale/tailscale/blob/v1.104.2/build_docker.sh).
The derivative preserves the official `containerboot` command, creates a
dedicated UID/GID `65532`, and makes the persistent state directory writable by
that identity before switching to it.

The optional `opencode` profile builds a local non-root derivative from the official V2 image
`ghcr.io/anomalyco/opencode:2.0.0` pinned to
`sha256:c714c5ca046223a782faac0a5fdd3971cf3a57f39bd45eaf7d1a8b82f37ad183`.
The tag was pulled and its binary reported `opencode v2.0.0`; it is not a V1
image or a floating `latest` tag. The `opencode` Dockerfile target prepares
private data/config/state/workspace directories and runs as `65532:65532`.
This local helper image is named `jtmb/tailscale-opencode:dev`; the GHCR workflow
publishes only the `tailscale` target, not this optional application image.

## Configure the runtime secret

Create a single-use Tailscale auth key suited to your tailnet policy. Prefer a
dedicated device tag and the narrowest available permissions; avoid ephemeral
registration for this persistent service. Keep the auth key out of command
arguments, source control, build arguments, and image layers. The repository's
local helper prompts without echoing and writes a private `.env` only after
explicit application:

```bash
python3 scripts/secret_setup.py --apply --key TS_AUTHKEY
```

Before using the optional OpenCode profile, also set a strong OpenCode server
password through the same helper:

```bash
python3 scripts/secret_setup.py --apply --key OPENCODE_PASSWORD
```

Compose interpolates `TS_AUTHKEY` into the running service environment only.
It is not in the Docker build context, Dockerfile, or published image. The
`.dockerignore` is an allowlist that sends only `Dockerfile` as build context.
Do not run `docker compose config` with a real `.env` when capturing output; a
resolved Compose configuration can include environment values.

## Start Tailscale

```bash
docker compose --env-file .env up -d --build
docker compose ps
docker compose exec tailscale tailscale status
```

The `tailscale-state` named volume persists the device identity, so
`TS_AUTH_ONCE=true` authenticates only when the volume does not already contain
an authenticated state. Keep this volume private and back it up before changing
the image or host. `docker compose down` preserves named volumes; **do not** add
`-v` unless you intend to erase the Tailscale identity and OpenCode data.
After the node is registered, remove the one-time key from the runtime
environment file if it is no longer needed. The stored state is still required
for restarts to retain the same tailnet device.

The service sets a fixed Tailscale hostname, `tailscale-docker`. Change both
`hostname` and `TS_HOSTNAME` together if that name is already in use. The
published HTTPS name is assigned by the tailnet and is not hard-coded here.

## Optional OpenCode V2 service

The profile runs the pinned OpenCode V2 derivative in the Tailscale
container's network namespace. OpenCode listens only on that shared namespace's
loopback address; no Docker host port is published. Its data, config, and state
are stored in separate named volumes. Its workspace is a separate named volume;
no personal host directories or Docker socket are mounted. Both containers run
as the non-root UID/GID `65532` with read-only root filesystems.

```bash
docker compose --env-file .env --profile opencode up -d --build
```

The server uses OpenCode V2's supported `OPENCODE_PASSWORD` setting and remains
password-protected. Authenticate to the UI with that value. OpenCode's V2
pairing can also create a one-time URL and session cookie; treat both as
credentials, and never copy them into logs or tickets. The profile does not
inject provider keys; configure provider credentials through OpenCode's own
supported authentication flow and protect its persistent volumes. Treat the
OpenCode container log stream as sensitive and do not capture or forward it.
See the [OpenCode V2 web and authentication guide](https://opencode.ai/v2/docs/cli/web/).

An existing OpenCode service running on the Docker host is **not** reachable as
`127.0.0.1` from a bridge-network Tailscale container. That address means the
container's own network namespace. For a host-local OpenCode service, use the
host-native Tailscale daemon and the Serve command below instead.

## Tailnet-only HTTPS Serve

Serve is not enabled automatically. For the optional Compose OpenCode service,
run the current Tailscale CLI command inside its Tailscale namespace:

```bash
docker compose exec tailscale tailscale serve --bg --https=443 http://127.0.0.1:4096
docker compose exec tailscale tailscale serve status
docker compose exec tailscale tailscale serve get-config --all
```

The CLI-provided URL uses the tailnet's actual device name and HTTPS domain.
Do not replace it with a guessed `.ts.net` hostname or use Funnel. For an
OpenCode server already listening on host loopback, run the corresponding
command with the host-native client instead:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:4096
tailscale serve status
tailscale serve get-config --all
```

The guide intentionally does not ship a static Serve config: the target
hostname is tailnet-specific, and the current CLI can persist and export its
own configuration. Use `tailscale serve get-config --all` to retrieve the
current configuration accepted by `tailscale serve set-config`; `serve status`
and `serve status --json` are status views, not interchangeable config exports.
The explicit `--bg` setting persists the Serve configuration in Tailscale state.
Restart persistence still needs an authenticated live acceptance test.

In the tailnet policy, grant only the intended users or group access to the
Tailscale device tag and TCP port 443. Tailscale Grants use deny-by-default
rules and can restrict access by source, destination, and port; avoid broad
`*`/all-member grants. Serve stays within the tailnet: this setup does not
enable Funnel or OpenTunnel and has no published Docker port. See the upstream
[Tailscale Grants guide](https://tailscale.com/docs/features/access-control/grants)
and [Serve CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Hardening and tested limits

The default service enables `TS_USERSPACE=true`, drops all Linux capabilities,
sets `no-new-privileges`, uses a read-only root filesystem, and limits the
container to one CPU, 256 MiB, and 128 processes. Only the private state volume
and bounded `/tmp`, runtime-socket, and cache tmpfs mounts are writable. The
health check requests `/healthz` on `127.0.0.1:9002` inside the container. This
endpoint is not published or bound to external interfaces and requires a
tailnet IP before it reports ready. `tailscale status --json` is deliberately
not used as readiness: it can exit successfully while the node needs login.
Readiness is not a test of end-to-end Serve connectivity or application health.

The upstream image defaults to root, so this derivative adds a non-root
identity rather than claiming the upstream image is already non-root. A
bounded local probe ran the inherited entrypoint as UID/GID `65532`, created the
Tailscale socket, and returned success from `tailscale status --json` without
authentication or network access. A read-only rootfs also worked with
writable state/runtime/cache/`/tmp` scratch mounts. The persistent named-volume
path is prepared with matching ownership in the image so the Compose service
can keep the same non-root identity.

### Verification status

The following checks were verified locally:

- The full Python suite passes with
  `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v`.
- Compose syntax and interpolation validate with synthetic values, without
  loading `.env` or printing resolved configuration:
  `TS_AUTHKEY=placeholder OPENCODE_PASSWORD=placeholder docker compose --env-file /dev/null config --quiet`.
- The image builds locally as `jtmb/tailscale:dev`. An isolated, network-disabled
  probe ran it as UID/GID `65532`, verified the Tailscale socket and writable
  persistent state volume, and got a successful `tailscale status --json`
  response without authenticating or contacting a tailnet.
- The pinned OpenCode image reported version `2.0.0`; an isolated local probe
  received HTTP 401 without a password and succeeded at `/` with a synthetic
  test password.
- Parent runtime regressions verified both containers run as UID `65532`, a
  fresh named state volume is writable and survives a second container, and
  the unauthenticated Tailscale daemon fails the HTTP readiness probe even
  though its status command exits zero. OpenCode returns HTTP 401 without
  credentials and HTTP 200 with a synthetic password at its UI root.

After building both local targets, rerun these opt-in, network-isolated probes:

```bash
docker build --target tailscale --tag jtmb/tailscale:dev .
docker build --target opencode --tag jtmb/tailscale-opencode:dev .
RUN_DOCKER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_docker_runtime.py -v
```

They create and remove their own disposable containers and synthetic state
volume, never load `.env`, publish no ports, and use no external networking.

These checks do not register a tailnet node, verify live Serve connectivity,
execute the GitHub workflow, publish to GHCR, or prove a Kubernetes deployment.
Those remain pending; no claim of a live authenticated service is made.

## Updates and rollback

Inspect the upstream registry before changing the version or digest:

```bash
docker buildx imagetools inspect ghcr.io/tailscale/tailscale:stable
docker buildx imagetools inspect ghcr.io/tailscale/tailscale:v1.104.2
docker run --rm --network none ghcr.io/tailscale/tailscale:v1.104.2 tailscale version
```

The first two commands show registry manifest metadata; the third reports the
binary version without joining a tailnet. For an update, verify the upstream
release and multi-platform digest, then change the pinned `FROM` reference and
OCI version label in `Dockerfile` and the Compose default tag together. The
derivative release tag adds a revision, initially `v1.104.2-r1`; increase the
manual workflow's `revision` input for changes at the same upstream version.
Run the
Docker static tests, Compose validation, and a bounded local build/smoke test.
Review Dependabot's Docker and GitHub Actions update PRs manually: Dependabot
proposes changes, but does not itself publish or deploy this image.

After changing and reviewing those pins, rebuild and recreate the service while
preserving its named volumes:

```bash
docker compose --env-file .env up -d --build tailscale
```

To roll back to a version that has already been published, pull and recreate it
without building the current Dockerfile under the older version tag. Replace the
example version with the exact published tag you intend to restore; `v1.104.2-r1`
below illustrates the syntax and is not yet a published artifact from this
workflow:

```bash
TAILSCALE_VERSION=v1.104.2-r1 docker compose --env-file .env pull tailscale
TAILSCALE_VERSION=v1.104.2-r1 docker compose --env-file .env up -d --no-build tailscale
```

If OpenCode is running, recreate it against the restored Tailscale network
namespace after separately reviewing that change. `--no-deps` avoids changing
the Tailscale version again as a side effect:

```bash
docker compose --env-file .env --profile opencode up -d --no-deps --no-build --force-recreate opencode
```

The optional OpenCode derivative is built locally and is not pulled from GHCR.
For future local builds at the rolled-back version, restore the matching
Dockerfile digest/version label and Compose default tag as well.

Publishing is a separate manual `workflow_dispatch` action with `publish`
defaulting to false. It publishes only after an explicit opt-in on `main`,
serializes publication jobs, refuses existing version/SHA tags, and emits BuildKit provenance and SBOM
attestations. It creates version and full commit-SHA tags only; no `latest` tag,
scheduled publish, or automatic deployment is configured.
These workflow checks are not registry-enforced tag immutability. Once an image
is published, record its verified digest and use a digest-qualified image
reference for deployment. The revision permits security fixes without reusing
an existing tag. The registry check handles credentials in process memory,
not command arguments or output.

Retain a secure backup of `tailscale-state` before changing versions. Removing
the state volume creates a new Tailscale device identity.
