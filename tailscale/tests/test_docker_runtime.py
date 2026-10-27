"""Exercise local images without credentials, external networking, or host mounts."""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import tempfile
import time
import unittest
import uuid


@unittest.skipUnless(os.environ.get("RUN_DOCKER_TESTS") == "1", "opt-in local container tests")
class DockerRuntimeTests(unittest.TestCase):
    """Run bounded synthetic probes, never loading the project's runtime .env."""

    def setUp(self) -> None:
        """Isolate Docker client configuration from saved credentials."""
        self.scratch = tempfile.TemporaryDirectory(prefix="tailscale-test-", dir="/tmp/opencode")
        self.addCleanup(self.scratch.cleanup)
        self.environment = {
            "PATH": os.environ["PATH"],
            "HOME": self.scratch.name,
            "DOCKER_CONFIG": self.scratch.name,
        }

    def docker(self, arguments: list[str], *, timeout: int = 20) -> subprocess.CompletedProcess[str]:
        """Call only the local Docker daemon with a bounded operation."""
        return subprocess.run(
            ["docker", "--host", "unix:///var/run/docker.sock", *arguments],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=self.environment,
        )

    def isolation(self, network: str = "none") -> list[str]:
        """Return a common set of restrictions for disposable test containers."""
        return [
            "--pull=never", "--network", network, "--read-only",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
            "--cpus", "1", "--memory", "256m", "--pids-limit", "128",
            "--stop-timeout", "2",
        ]

    def private_tmpfs(self, path: str, size: str = "32m") -> list[str]:
        """Create private writable scratch for the tested non-root identity."""
        return ["--tmpfs", f"{path}:rw,nosuid,nodev,size={size},mode=0700,uid=65532,gid=65532"]

    def start(self, image: str, options: list[str], command: list[str] | None = None) -> str:
        """Start a disposable local image and register exact-container cleanup."""
        result = self.docker(["run", "--detach", "--rm", *self.isolation(), *options, image, *(command or [])])
        self.assertEqual(result.returncode, 0, result.stderr)
        container = result.stdout.strip()
        self.assertRegex(container, r"^[a-f0-9]{64}$")
        self.addCleanup(self.docker, ["rm", "--force", container])
        return container

    def test_unauthenticated_daemon_is_not_ready_even_when_status_exits_zero(self) -> None:
        """Reject NeedsLogin as ready while retaining the non-root daemon probe."""
        options = []
        for path in ("/var/lib/tailscale", "/var/run/tailscale", "/var/cache/tailscale", "/tmp"):
            options.extend(self.private_tmpfs(path))
        for setting in (
            "TS_USERSPACE=true", "TS_AUTH_ONCE=true", "TS_STATE_DIR=/var/lib/tailscale",
            "TS_ENABLE_HEALTH_CHECK=true", "TS_LOCAL_ADDR_PORT=127.0.0.1:9002",
        ):
            options.extend(["--env", setting])
        container = self.start("jtmb/tailscale:dev", options)
        deadline = time.monotonic() + 20
        state = None
        while time.monotonic() < deadline:
            result = self.docker(["exec", container, "tailscale", "status", "--json"], timeout=5)
            if result.returncode == 0:
                state = json.loads(result.stdout).get("BackendState")
                if state == "NeedsLogin":
                    break
            time.sleep(0.25)
        self.assertEqual(state, "NeedsLogin")
        probe = self.docker(["exec", container, "wget", "--quiet", "--spider", "http://127.0.0.1:9002/healthz"])
        self.assertNotEqual(probe.returncode, 0, "An unregistered node must not pass readiness")
        identity = self.docker(["exec", container, "id", "-u"])
        self.assertEqual(identity.stdout.strip(), "65532")

    def test_new_named_state_volume_is_writable_and_persists_for_nonroot(self) -> None:
        """Verify ownership initialization and persistence using synthetic data only."""
        name = "tailscale-test-" + uuid.uuid4().hex
        created = self.docker(["volume", "create", "--label", "tailscale.test=true", name])
        self.assertEqual(created.returncode, 0, created.stderr)
        self.addCleanup(self.docker, ["volume", "rm", name])
        base = ["run", "--rm", *self.isolation(), "--mount", f"type=volume,source={name},target=/var/lib/tailscale", "--entrypoint", "/bin/sh", "jtmb/tailscale:dev"]
        written = self.docker([*base, "-c", "umask 077; printf synthetic-state > /var/lib/tailscale/smoke.marker"])
        self.assertEqual(written.returncode, 0, written.stderr)
        reread = self.docker([*base, "-c", "cat /var/lib/tailscale/smoke.marker"])
        self.assertEqual(reread.returncode, 0, reread.stderr)
        self.assertEqual(reread.stdout, "synthetic-state")

    def http_status(self, container: str, authorization: str | None = None) -> int | None:
        """Probe app loopback through another isolated container, suppressing its body."""
        arguments = [
            "run", "--rm", *self.isolation("container:" + container),
            "--entrypoint", "wget", "jtmb/tailscale:dev",
            "--server-response", "--quiet", "--output-document", "/dev/null",
        ]
        if authorization is not None:
            arguments.extend(["--header", "Authorization: Basic " + authorization])
        result = self.docker([*arguments, "http://127.0.0.1:4096/"], timeout=10)
        match = re.search(r"HTTP/[0-9.]+ ([0-9]{3})", result.stderr)
        return int(match.group(1)) if match else None

    def test_opencode_runs_nonroot_with_application_authentication(self) -> None:
        """Require HTTP401 without credentials and HTTP200 for a synthetic password."""
        options = []
        for path in (
            "/home/opencode/.local/share/opencode", "/home/opencode/.config/opencode",
            "/home/opencode/.local/state/opencode", "/workspace", "/tmp",
        ):
            options.extend(self.private_tmpfs(path, "64m"))
        # This value is synthetic test data and is never loaded from a real .env.
        password = "synthetic-offline-test-password"
        options.extend(["--memory", "1g", "--env", "OPENCODE_PASSWORD=" + password])
        container = self.start(
            "jtmb/tailscale-opencode:dev", options,
            ["serve", "--hostname", "127.0.0.1", "--port", "4096"],
        )
        deadline = time.monotonic() + 25
        status = None
        while time.monotonic() < deadline:
            status = self.http_status(container)
            if status is not None:
                break
            time.sleep(0.25)
        self.assertEqual(status, 401)
        authorization = base64.b64encode(("opencode:" + password).encode()).decode()
        self.assertEqual(self.http_status(container, authorization), 200)
        identity = self.docker(["exec", container, "id", "-u"])
        self.assertEqual(identity.stdout.strip(), "65532")


if __name__ == "__main__":
    unittest.main()
