"""Static checks for the Tailscale Kubernetes deployment artifacts."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).absolute().parents[1]
DEPLOY_ROOT = PROJECT_ROOT / "deploy/kubernetes"
PIN_PATH = DEPLOY_ROOT / "operator/chart-pin.json"
VALUES_PATH = DEPLOY_ROOT / "operator/values.json"
INGRESS_PATH = DEPLOY_ROOT / "ingress/opencode-ingress.json"
NETWORK_POLICY_PATH = DEPLOY_ROOT / "ingress/opencode-networkpolicy.json"
EXPECTED_ARCHIVE_SHA256 = (
    "cf215d52f3a20fae4c77b14a191957ccb12e46b0f2ff2263c6f51c8a472cd505"
)


class TailscaleKubernetesStaticTests(unittest.TestCase):
    """Validate pinned provenance and fail-closed private deployment defaults."""

    def read_json(self, path: Path) -> dict[str, object]:
        """Load a checked-in JSON artifact without reading local credentials."""
        parsed = json.loads(path.read_text(encoding="utf-8"))
        self.assertIsInstance(parsed, dict)
        return parsed

    def test_official_chart_pin_matches_index_provenance_and_sha256(self) -> None:
        """Require a versioned official chart and the independently verified digest."""
        pin = self.read_json(PIN_PATH)
        self.assertEqual(pin["chart"], "tailscale-operator")
        self.assertEqual(pin["repository"], "https://pkgs.tailscale.com/helmcharts")
        self.assertEqual(
            pin["indexUrl"], "https://pkgs.tailscale.com/helmcharts/index.yaml"
        )
        self.assertEqual(pin["version"], "1.104.2")
        self.assertEqual(pin["appVersion"], "v1.104.2")
        self.assertEqual(pin["indexDigest"], EXPECTED_ARCHIVE_SHA256)
        self.assertEqual(pin["archiveSha256"], EXPECTED_ARCHIVE_SHA256)
        self.assertRegex(str(pin["archiveSha256"]), r"^[a-f0-9]{64}$")
        self.assertRegex(str(pin["verifiedAt"]), r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$")
        self.assertRegex(
            str(pin["archive"]),
            rf"^tailscale-operator-1\.104\.2-[0-9]+-{EXPECTED_ARCHIVE_SHA256}\.tgz$",
        )
        self.assertTrue(str(pin["archive"]).endswith(f"{EXPECTED_ARCHIVE_SHA256}.tgz"))
        self.assertEqual(
            pin["archiveUrl"],
            f"{pin['repository']}/{pin['archive']}",
        )

    def test_operator_values_are_secret_free_and_disable_unrequested_features(self) -> None:
        """Keep credentials out of Helm values and disable API-server proxying."""
        values = self.read_json(VALUES_PATH)
        contents = VALUES_PATH.read_text(encoding="utf-8")
        self.assertNotIn("oauth", values)
        self.assertNotRegex(contents, r"(?i)client[_-]?(?:id|secret)|tskey-")
        self.assertIs(values["installCRDs"], True)

        operator_config = values["operatorConfig"]
        proxy_config = values["proxyConfig"]
        api_server_proxy = values["apiServerProxyConfig"]
        self.assertIsInstance(operator_config, dict)
        self.assertIsInstance(proxy_config, dict)
        self.assertIsInstance(api_server_proxy, dict)
        self.assertEqual(operator_config["defaultTags"], ["tag:k8s-operator"])
        self.assertEqual(proxy_config["defaultTags"], "tag:k8s-proxy")
        self.assertNotEqual(
            operator_config["defaultTags"][0], proxy_config["defaultTags"]
        )
        self.assertEqual(api_server_proxy["mode"], "false")
        self.assertEqual(api_server_proxy["allowImpersonation"], "false")
        self.assertNotIn("tailscale.com/funnel", contents.lower())

    def test_ingress_template_is_explicit_and_fails_closed_until_reviewed(self) -> None:
        """Require a Tailscale-only class opt-in and explicit backend placeholders."""
        ingress = self.read_json(INGRESS_PATH)
        self.assertEqual(ingress["apiVersion"], "networking.k8s.io/v1")
        self.assertEqual(ingress["kind"], "Ingress")
        self.assertEqual(ingress["metadata"]["namespace"], "choose-existing-app-namespace")
        annotations = ingress["metadata"]["annotations"]
        self.assertEqual(
            annotations["tailscale.com/tags"], "tag:opencode-ingress-proxy"
        )
        self.assertNotIn("tailscale.com/funnel", annotations)

        spec = ingress["spec"]
        self.assertEqual(
            spec["ingressClassName"], "tailscale-disabled-until-reviewed"
        )
        self.assertNotEqual(spec["ingressClassName"], "tailscale")
        self.assertEqual(
            spec["tls"][0]["hosts"][0], "replace-with-approved-hostname"
        )
        backend = spec["rules"][0]["http"]["paths"][0]["backend"]["service"]
        self.assertEqual(
            backend["name"], "replace-with-existing-opencode-service"
        )
        self.assertEqual(backend["port"]["name"], "replace-me")
        self.assertEqual(spec["rules"][0]["http"]["paths"][0]["path"], "/")

    def test_optional_network_policy_does_not_isolate_egress(self) -> None:
        """Limit the optional template to selected backend ingress only."""
        policy = self.read_json(NETWORK_POLICY_PATH)
        self.assertEqual(policy["apiVersion"], "networking.k8s.io/v1")
        self.assertEqual(policy["kind"], "NetworkPolicy")
        self.assertEqual(policy["metadata"]["namespace"], "choose-existing-app-namespace")
        spec = policy["spec"]
        self.assertEqual(spec["policyTypes"], ["Ingress"])
        self.assertNotIn("egress", spec)
        self.assertEqual(
            spec["podSelector"]["matchLabels"]["app.kubernetes.io/name"],
            "replace-with-verified-opencode-pod-label",
        )
        ingress_rule = spec["ingress"][0]
        namespace_selector = ingress_rule["from"][0]["namespaceSelector"]
        self.assertEqual(
            namespace_selector["matchLabels"]["kubernetes.io/metadata.name"],
            "tailscale",
        )
        self.assertEqual(ingress_rule["ports"][0]["port"], "replace-me")

    def test_manifests_reject_public_exposure_and_literal_credentials(self) -> None:
        """Reject broad/public exposure, unsafe host access, and embedded secrets."""
        artifact_paths = (VALUES_PATH, INGRESS_PATH, NETWORK_POLICY_PATH)
        forbidden = (
            "tailscale.com/funnel",
            "hostnetwork",
            "loadbalancer",
            "nodeport",
            "subnetroutes",
            "exitnode",
            "kube-apiserver",
            "0.0.0.0/0",
        )
        secret_pattern = re.compile(
            r"(?i)client[_-]?(?:id|secret)|tskey-(?:client|auth)-[a-z0-9-]+"
        )

        for path in artifact_paths:
            contents = path.read_text(encoding="utf-8")
            with self.subTest(path=path.relative_to(PROJECT_ROOT)):
                self.assertTrue(path.resolve().is_relative_to(DEPLOY_ROOT.resolve()))
                self.assertIsNone(secret_pattern.search(contents))
                for marker in forbidden:
                    self.assertNotIn(marker, contents.lower())

    def test_documentation_preserves_review_tls_grant_and_rollback_gates(self) -> None:
        """Document approval, TLS verification, least-access grant, and rollback."""
        documentation = (PROJECT_ROOT / "docs/tailscale-kubernetes.md").read_text(
            encoding="utf-8"
        )
        required = (
            "--dry-run=server",
            "--insecure-skip-tls-verify",
            "<approved-user-or-group>",
            '"ip": ["tcp:443"]',
            "NetworkPolicies are additive",
            "helm rollback",
            "second tailnet device",
            "explicitly approved",
            "Bortus MCP is a separate",
        )
        for marker in required:
            with self.subTest(marker=marker):
                self.assertIn(marker, documentation)
        self.assertNotIn('"src": ["*"]', documentation)
        self.assertNotIn('"dst": ["*"', documentation)


if __name__ == "__main__":
    unittest.main()
