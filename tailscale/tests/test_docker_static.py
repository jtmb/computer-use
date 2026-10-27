"""Static checks for the hardened Docker delivery files."""

from __future__ import annotations

import ast
import os
import re
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).absolute().parents[1]


class DockerStaticTests(unittest.TestCase):
    """Check safe defaults without parsing or loading local secret files."""

    def read_project_file(self, relative_path: str) -> str:
        """Read one checked-in Docker deliverable as UTF-8 text."""
        return (PROJECT_ROOT / relative_path).read_text(encoding="utf-8")

    def test_base_image_is_official_versioned_and_digest_pinned(self) -> None:
        """Pin the official multi-architecture base and preserve containerboot."""
        dockerfile = self.read_project_file("Dockerfile")
        match = re.search(
            r"^FROM ghcr\.io/tailscale/tailscale:v(?P<version>[0-9]+\.[0-9]+\.[0-9]+)"
            r"@sha256:(?P<digest>[a-f0-9]{64}) AS tailscale$",
            dockerfile,
            re.MULTILINE,
        )

        self.assertIsNotNone(match, "Dockerfile must use a versioned digest-pinned upstream image")
        assert match is not None
        self.assertIn('ARG RELEASE_REVISION=1', dockerfile)
        self.assertIn('org.opencontainers.image.version="' + match.group("version") + '-r${RELEASE_REVISION}"', dockerfile)
        self.assertIn('org.opencontainers.image.source="https://github.com/jtmb/tailscale"', dockerfile)
        self.assertIn("USER 65532:65532", dockerfile)
        self.assertNotRegex(dockerfile, r"(?m)^(ENTRYPOINT|CMD|COPY|ADD)\b")
        self.assertNotIn("TS_AUTHKEY", dockerfile)

    def test_docker_context_is_an_allowlist(self) -> None:
        """Keep secrets and unrelated repository files outside the build context."""
        rules = [
            line.strip()
            for line in self.read_project_file(".dockerignore").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

        self.assertEqual(rules, ["**", "!Dockerfile"])

    def test_tailscale_compose_service_uses_persistent_userspace_hardening(self) -> None:
        """Require persisted identity and least-privilege container defaults."""
        compose = self.read_project_file("compose.yaml")
        dockerfile = self.read_project_file("Dockerfile")
        base_match = re.search(
            r"^FROM ghcr\.io/tailscale/tailscale:v(?P<version>[0-9]+\.[0-9]+\.[0-9]+)",
            dockerfile,
            re.MULTILINE,
        )
        image_match = re.search(
            r"image: ghcr\.io/jtmb/tailscale:\$\{TAILSCALE_VERSION:-v"
            r"(?P<version>[0-9]+\.[0-9]+\.[0-9]+)-r[1-9][0-9]*\}",
            compose,
        )

        self.assertIsNotNone(base_match)
        self.assertIsNotNone(image_match)
        assert base_match is not None and image_match is not None
        self.assertEqual(image_match.group("version"), base_match.group("version"))
        self.assertIn("TS_AUTHKEY: ${TS_AUTHKEY:-}", compose)
        self.assertIn('TS_AUTH_ONCE: "true"', compose)
        self.assertIn('TS_USERSPACE: "true"', compose)
        self.assertIn("TS_STATE_DIR: /var/lib/tailscale", compose)
        self.assertIn("TS_HOSTNAME: tailscale-docker", compose)
        self.assertIn("hostname: tailscale-docker", compose)
        self.assertIn('user: "65532:65532"', compose)
        self.assertIn("source: tailscale-state", compose)
        self.assertIn("target: /var/lib/tailscale", compose)
        self.assertIn("read_only: true", compose)
        self.assertIn("- ALL", compose)
        self.assertIn("no-new-privileges:true", compose)
        self.assertIn("cpus: 1.0", compose)
        self.assertIn("mem_limit: 256m", compose)
        self.assertIn("pids_limit: 128", compose)
        self.assertIn('TS_ENABLE_HEALTH_CHECK: "true"', compose)
        self.assertIn('TS_LOCAL_ADDR_PORT: "127.0.0.1:9002"', compose)
        self.assertIn('test: ["CMD", "wget", "--quiet", "--spider", "http://127.0.0.1:9002/healthz"]', compose)
        self.assertNotIn('test: ["CMD", "tailscale", "status", "--json"]', compose)

    def test_compose_does_not_grant_host_or_device_access(self) -> None:
        """Reject host networking, published ports, devices, and Docker sockets."""
        compose = self.read_project_file("compose.yaml")
        forbidden = (
            "network_mode: host",
            "privileged: true",
            "devices:",
            "/dev/net/tun",
            "/var/run/docker.sock",
            "ports:",
            "env_file:",
        )

        for setting in forbidden:
            with self.subTest(setting=setting):
                self.assertNotIn(setting, compose)

    def test_opencode_profile_is_pinned_private_and_v2(self) -> None:
        """Keep the optional official V2 image isolated behind loopback and Tailscale."""
        compose = self.read_project_file("compose.yaml")
        dockerfile = self.read_project_file("Dockerfile")

        self.assertIn("profiles:\n      - opencode", compose)
        self.assertRegex(
            dockerfile,
            r"FROM ghcr\.io/anomalyco/opencode:2\.[0-9]+\.[0-9]+@sha256:[a-f0-9]{64} AS opencode",
        )
        self.assertIn("image: jtmb/tailscale-opencode:dev", compose)
        self.assertIn("target: opencode", compose)
        self.assertEqual(compose.count('user: "65532:65532"'), 2)
        self.assertNotIn("target: /root/", compose)
        self.assertIn("ENV HOME=/home/opencode", dockerfile)
        self.assertIn('command: ["serve", "--hostname", "127.0.0.1", "--port", "4096"]', compose)
        self.assertIn("network_mode: service:tailscale", compose)
        self.assertIn("OPENCODE_PASSWORD: ${OPENCODE_PASSWORD:-}", compose)
        self.assertIn("source: opencode-data", compose)
        self.assertIn("source: opencode-config", compose)
        self.assertIn("OPENCODE_PASSWORD", self.read_project_file("docs/docker.md"))
        self.assertIn("serve --bg --https=443", self.read_project_file("docs/docker.md"))

    def test_publication_registry_check_keeps_credentials_out_of_process_arguments(self) -> None:
        """Compile the embedded checker and prevent a return to secret-bearing curl argv."""
        workflow = self.read_project_file(".github/workflows/docker.yml")
        lines = workflow.splitlines()
        start = lines.index("          python3 - <<'PY'")
        end = lines.index("          PY", start + 1)
        checker = textwrap.dedent("\n".join(lines[start + 1:end]))
        ast.parse(checker, filename="registry-tag-check.py")
        self.assertIn("method='HEAD'", checker)
        self.assertIn("error.code != 404", checker)
        self.assertNotIn("subprocess", checker)
        self.assertNotIn("--user", checker)
        self.assertNotIn("curl", checker)

    def test_publication_revision_validation_accepts_only_bounded_positive_integers(self) -> None:
        """Execute only the non-networking version step with synthetic environment data."""
        workflow = self.read_project_file(".github/workflows/docker.yml")
        start = workflow.index('          version="$(sed')
        end = workflow.index("\n      - uses: docker/setup-buildx-action", start)
        step = textwrap.dedent(workflow[start:end])
        for revision, valid in (("1", True), ("9999", True), ("0", False), ("01", False), ("10000", False), ("1;false", False)):
            with self.subTest(revision=revision), tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
                output = Path(directory) / "github-output"
                result = subprocess.run(
                    ["bash", "-e", "-o", "pipefail", "-c", step],
                    capture_output=True,
                    text=True,
                    cwd=PROJECT_ROOT,
                    env={"PATH": os.environ["PATH"], "GITHUB_OUTPUT": str(output), "RELEASE_REVISION": revision},
                    timeout=5,
                )
                self.assertEqual(result.returncode == 0, valid)
                if valid:
                    self.assertRegex(output.read_text(), rf"^value=v[0-9]+\.[0-9]+\.[0-9]+-r{revision}\n$")
                else:
                    self.assertFalse(output.exists())

    def test_publish_workflow_is_manual_opt_in_and_uses_full_action_shas(self) -> None:
        """Keep routine CI non-publishing and scope registry write permission."""
        workflow = self.read_project_file(".github/workflows/docker.yml")
        action_refs = re.findall(r"^\s+- uses: [^@\s]+@([^\s#]+)", workflow, re.MULTILINE)

        self.assertIn("push:", workflow)
        self.assertIn("pull_request:", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("default: false", workflow)
        self.assertIn("inputs.publish == true", workflow)
        self.assertIn("github.ref == 'refs/heads/main'", workflow)
        self.assertTrue(action_refs)
        self.assertTrue(all(re.fullmatch(r"[a-f0-9]{40}", reference) for reference in action_refs))
        self.assertEqual(workflow.count("packages: write"), 1)
        self.assertIn("Refuse to overwrite existing version or commit tags", workflow)
        self.assertIn("ghcr.io/jtmb/tailscale:sha-${{ github.sha }}", workflow)
        self.assertIn("provenance: mode=max", workflow)
        self.assertIn("sbom: true", workflow)
        self.assertIn("group: tailscale-ghcr-publication", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("RELEASE_REVISION: ${{ inputs.revision }}", workflow)
        self.assertIn("RUN_DOCKER_TESTS=1", workflow)
        self.assertIn("target: tailscale", workflow)
        self.assertIn("build-args: RELEASE_REVISION=${{ inputs.revision }}", workflow)
        self.assertNotIn("ghcr.io/jtmb/tailscale:latest", workflow)

    def test_dependabot_proposes_image_and_action_updates(self) -> None:
        """Enable reviewable weekly dependency update proposals."""
        dependabot = self.read_project_file(".github/dependabot.yml")

        self.assertEqual(dependabot.count("package-ecosystem:"), 2)
        self.assertIn("package-ecosystem: docker", dependabot)
        self.assertIn("package-ecosystem: github-actions", dependabot)
        self.assertEqual(dependabot.count("interval: weekly"), 2)


if __name__ == "__main__":
    unittest.main()
