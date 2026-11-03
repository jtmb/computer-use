"""Check invocation, receipt and preservation policy without launching services."""

import ast
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from document_sandbox_probe import (
    BOUNDARY_CHECKS,
    BOUNDARY_CONTROL,
    CONVERSION_CONTROL,
    LINK_POLICY_CONTROL,
    LOAD_POLICY_CONTROL,
    MACRO_POLICY_CONTROL,
    PROFILE,
    RESOURCE_CONTROLS,
    accepted,
    command,
    fixture_digests,
    fixtures_preserved,
    main,
    run_control,
)


class DocumentSandboxProbeTests(unittest.TestCase):
    """Offline checks do not stand in for actual namespace/resource trials."""

    def test_required_boundaries_are_not_optional_fallbacks(self) -> None:
        """Neither namespace failure nor missing resource controls can relax policy."""
        arguments = command(Path("/tmp/opencode/private job"), "pass")
        for flag in [
            "--unshare-all",
            "--unshare-user",
            "--unshare-cgroup",
            "--disable-userns",
            "--clearenv",
            "--new-session",
            "--property=MemoryMax=268435456",
            "--property=MemorySwapMax=0",
            "--property=TasksMax=32",
            "--property=RuntimeMaxSec=30s",
            "--property=NoNewPrivileges=yes",
            "--property=KillMode=control-group",
            "--property=OOMPolicy=kill",
            "--property=LimitFSIZE=8388608",
        ]:
            self.assertIn(flag, arguments)
        self.assertNotIn("--share-net", arguments)
        self.assertNotIn("--bind", arguments)
        self.assertNotIn("--unshare-user-try", arguments)
        self.assertIn("/tmp/opencode/private job/control.txt", arguments)
        self.assertEqual(arguments[-1], "pass")

    def test_only_selected_input_and_runtime_are_host_mounts(self) -> None:
        """No home, session bus, credentials, host process view or writable output."""
        arguments = command(Path("/tmp/opencode/job"), "pass", seconds=2)
        mounts = [
            tuple(arguments[index + 1 : index + 3])
            for index, value in enumerate(arguments)
            if value == "--ro-bind"
        ]
        self.assertEqual(
            mounts,
            [
                ("/usr", "/usr"),
                ("/lib", "/lib"),
                ("/lib64", "/lib64"),
                ("/etc/fonts", "/etc/fonts"),
                ("/etc/ld.so.cache", "/etc/ld.so.cache"),
                (
                    "/etc/libreoffice/registry/main.xcd",
                    "/etc/libreoffice/registry/main.xcd",
                ),
                ("/tmp/opencode/job/control.txt", "/input/control.txt"),
            ],
        )
        self.assertIn("--property=RuntimeMaxSec=2s", arguments)
        index = arguments.index("--tmpfs")
        self.assertEqual(
            arguments[index - 2 : index + 2], ["--size", "67108864", "--tmpfs", "/work"]
        )

    def test_invalid_job_or_runtime_is_refused_before_execution(self) -> None:
        """An absent explicit absolute location or unbounded service is an error."""
        with self.assertRaises(ValueError):
            command(Path("relative"), "pass")
        for seconds in [0, 31, True]:
            with self.assertRaises(ValueError):
                command(Path("/tmp/opencode/job"), "pass", seconds=seconds)

    def test_fixed_controls_have_valid_syntax_and_explicit_macro_policy(self) -> None:
        """Syntax checks run offline; settings are not operational macro acceptance."""
        ast.parse("HOST_SENTINEL='/not-mounted'\n" + BOUNDARY_CONTROL)
        ast.parse(f"PROFILE={PROFILE!r}\n" + CONVERSION_CONTROL)
        ast.parse(f"PROFILE={PROFILE!r}\n" + LOAD_POLICY_CONTROL)
        ast.parse(f"PROFILE={PROFILE!r}\n" + LINK_POLICY_CONTROL)
        ast.parse(f"PROFILE={PROFILE!r}\n" + MACRO_POLICY_CONTROL)
        for payload in RESOURCE_CONTROLS.values():
            ast.parse(payload)
        self.assertIn('oor:name="DisableMacrosExecution"', PROFILE)
        self.assertIn('oor:name="DisableActiveContent"', PROFILE)
        self.assertIn("<value>true</value>", PROFILE)

    def test_failed_launch_is_not_memory_or_time_enforcement(self) -> None:
        """A missing bridge/program or a generic error is not an expected denial."""
        failure = subprocess.CompletedProcess(["control"], 1, b"", b"command not found")
        for name in ["memory_limit", "runtime_limit", "task_limit", "boundaries"]:
            self.assertFalse(accepted(name, failure))
        for name, reason in [
            ("memory_limit", "oom-kill"),
            ("runtime_limit", "timeout"),
        ]:
            marker = (
                b"aggregate-memory-negative-control"
                if name == "memory_limit"
                else b"runtime-negative-control"
            )
            expected = subprocess.CompletedProcess(
                ["control"], 1, marker, f"Finished with result: {reason}".encode()
            )
            self.assertTrue(accepted(name, expected))

    def test_empty_partial_false_or_malformed_receipts_cannot_pass(self) -> None:
        """A green exit without all required positive controls is insufficient."""
        for payload in [b"{}", b"not-json", b"[]", b'{"only_check":true}']:
            result = subprocess.CompletedProcess(["control"], 0, payload, b"")
            self.assertFalse(accepted("boundaries", result))
        for good in [False, True]:
            payload = json.dumps(dict.fromkeys(BOUNDARY_CHECKS, good)).encode()
            result = subprocess.CompletedProcess(["control"], 0, payload, b"")
            self.assertEqual(accepted("boundaries", result), good)

    def test_load_policy_readback_requires_all_eight_exact_properties(self) -> None:
        """Require the declared readbacks, not proof that a policy caused blocking."""
        checks = dict.fromkeys(
            [
                "macros_disabled_readback",
                "active_content_disabled_readback",
                "never_execute_constant",
                "no_update_constant",
                "loaded_read_only",
                "macro_mode_readback",
                "update_mode_readback",
                "exact_loaded_text",
            ],
            True,
        )
        positive = subprocess.CompletedProcess(
            ["control"], 0, json.dumps(checks).encode(), b""
        )
        self.assertTrue(accepted("load_policy", positive))
        checks.pop("macro_mode_readback")
        partial = subprocess.CompletedProcess(
            ["control"], 0, json.dumps(checks).encode(), b""
        )
        self.assertFalse(accepted("load_policy", partial))

    def test_same_count_with_wrong_check_names_is_not_accepted(self) -> None:
        """An arbitrary green manifest cannot replace the actual required controls."""
        payload = json.dumps({str(index): True for index in range(16)}).encode()
        result = subprocess.CompletedProcess(["control"], 0, payload, b"")
        self.assertFalse(accepted("boundaries", result))

    def test_cli_requires_explicit_live_trial_flag(self) -> None:
        """Default invocation refuses before creating fixtures or user services."""
        result = subprocess.run(
            [
                sys.executable,
                "-B",
                str(Path(__file__).with_name("document_sandbox_probe.py")),
            ],
            capture_output=True,
            timeout=5,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"Explicit --run-trusted-controls is required", result.stderr)

    def test_external_link_denial_requires_a_positive_trace_control(self) -> None:
        """No content change alone cannot establish that the target was not read."""
        checks = dict.fromkeys(
            [
                "macros_disabled_readback",
                "active_content_disabled_readback",
                "never_execute_constant",
                "no_update_constant",
                "positive_control_readable",
                "target_matches_positive_permissions",
                "trace_detects_positive_open",
                "negative_target_not_primed",
                "external_link_recognized",
                "cached_content_preserved",
                "external_content_not_loaded",
                "loaded_no_update",
                "no_external_target_open",
            ],
            True,
        )
        for traced in [True, False]:
            checks["trace_detects_positive_open"] = traced
            result = subprocess.CompletedProcess(
                ["control"], 0, json.dumps(checks).encode(), b""
            )
            self.assertEqual(accepted("link_policy", result), traced)
        checks.pop("no_external_target_open")
        result = subprocess.CompletedProcess(
            ["control"], 0, json.dumps(checks).encode(), b""
        )
        self.assertFalse(accepted("link_policy", result))

    def test_primed_target_or_an_untraced_open_cannot_pass(self) -> None:
        """A direct positive read must not prime LibreOffice's negative-target cache."""
        self.assertIn("trace=open,openat,openat2", LINK_POLICY_CONTROL)
        self.assertIn("positive_target.as_uri()", LINK_POLICY_CONTROL)
        self.assertIn("negative_target_not_primed", LINK_POLICY_CONTROL)
        self.assertNotIn("loadComponentFromURL(target.as_uri()", LINK_POLICY_CONTROL)

    def test_absent_marker_without_recognized_macro_event_is_not_a_pass(self) -> None:
        """Do not confuse a document without a working event binding with blocking."""
        checks = dict.fromkeys(
            [
                "macros_disabled_readback",
                "active_content_disabled_readback",
                "never_execute_constant",
                "no_update_constant",
                "embedded_source_preserved",
                "onload_event_recognized",
                "macro_mode_readback",
                "exact_loaded_text",
                "execution_marker_absent",
            ],
            True,
        )
        for recognized in [True, False]:
            checks["onload_event_recognized"] = recognized
            result = subprocess.CompletedProcess(
                ["control"], 0, json.dumps(checks).encode(), b""
            )
            self.assertEqual(accepted("macro_policy", result), recognized)

    def test_launch_timeout_and_os_error_are_failed_outcomes(self) -> None:
        """A hung or unlaunchable service must not escape before the receipt exists."""
        job = Path("/tmp/opencode/job")
        timed_out = subprocess.TimeoutExpired(
            ["control"], 40, output=b"partial", stderr=b"still running"
        )
        with mock.patch("document_sandbox_probe.subprocess.run", side_effect=timed_out):
            timeout = run_control("boundaries", job, "pass")
        self.assertIs(timeout["accepted"], False)
        self.assertEqual(timeout["error"], "timeout")
        self.assertEqual(timeout["stdout"], "partial")
        self.assertEqual(timeout["stderr"], "still running")
        with mock.patch(
            "document_sandbox_probe.subprocess.run",
            side_effect=FileNotFoundError(2, "missing systemd-run"),
        ):
            missing = run_control("boundaries", job, "pass")
        self.assertIs(missing["accepted"], False)
        self.assertIn("FileNotFoundError", str(missing["error"]))
        good = subprocess.CompletedProcess(
            ["control"],
            0,
            json.dumps(dict.fromkeys(BOUNDARY_CHECKS, True)).encode(),
            b"",
        )
        with mock.patch("document_sandbox_probe.subprocess.run", return_value=good):
            passed = run_control("boundaries", job, "pass")
        self.assertIs(passed["accepted"], True)
        self.assertEqual(passed["exit"], 0)

    def test_missing_or_changed_host_fixture_is_not_preserved(self) -> None:
        """Deleting the host sentinel must fail preservation, not read as hidden."""
        scratch = Path("/tmp/opencode")
        with tempfile.TemporaryDirectory(
            dir=str(scratch) if scratch.is_dir() else None
        ) as directory:
            job = Path(directory)
            (job / "control.txt").write_text("Sandbox control: café 42\n")
            (job / "host-only-sentinel").write_text("host sentinel\n")
            before = fixture_digests(job)
            self.assertTrue(fixtures_preserved(before, fixture_digests(job)))
            (job / "host-only-sentinel").unlink()
            self.assertIsNone(fixture_digests(job)["host-only-sentinel"])
            self.assertFalse(fixtures_preserved(before, fixture_digests(job)))
            (job / "control.txt").write_text("tampered\n")
            self.assertFalse(fixtures_preserved(before, fixture_digests(job)))
        self.assertFalse(
            fixtures_preserved({"control.txt": None}, {"control.txt": None})
        )

    def test_failed_control_writes_an_honest_failed_receipt(self) -> None:
        """A timeout must persist status, execution gaps and fixture state."""
        scratch = Path("/tmp/opencode")
        with tempfile.TemporaryDirectory(
            dir=str(scratch) if scratch.is_dir() else None
        ) as directory:
            job = Path(directory)
            timed_out = subprocess.TimeoutExpired(
                ["control"], 40, output=b"", stderr=b"stalled"
            )
            with (
                mock.patch(
                    "document_sandbox_probe.tempfile.mkdtemp", return_value=str(job)
                ),
                mock.patch(
                    "document_sandbox_probe.subprocess.run", side_effect=timed_out
                ),
                mock.patch(
                    "sys.argv", ["document_sandbox_probe.py", "--run-trusted-controls"]
                ),
                mock.patch("sys.stdout", new_callable=io.StringIO),
            ):
                status = main()
            receipt = json.loads((job / "receipt.json").read_text())
            self.assertEqual(status, 2)
            self.assertEqual(receipt["status"], "failed")
            self.assertEqual(list(receipt["controls"]), ["boundaries"])
            self.assertEqual(receipt["controls"]["boundaries"]["error"], "timeout")
            self.assertNotIn("boundaries", receipt["unexecuted_controls"])
            self.assertEqual(len(receipt["unexecuted_controls"]), 7)
            self.assertTrue(receipt["source_preserved"])
            self.assertTrue(receipt["host_fixtures_preserved"])
            self.assertEqual(
                receipt["fixtures"]["before"], receipt["fixtures"]["after"]
            )

    def test_control_receipt_binds_probe_payload_and_exact_check_names(self) -> None:
        """A green native result retains which source and expectations assessed it."""
        good = subprocess.CompletedProcess(
            ["control"], 0, json.dumps(dict.fromkeys(BOUNDARY_CHECKS, True)).encode(), b""
        )
        with mock.patch("document_sandbox_probe.subprocess.run", return_value=good):
            outcome = run_control("boundaries", Path("/tmp/opencode/job"), "pass")
        evidence = outcome["evidence"]
        self.assertIsInstance(evidence, dict)
        assert isinstance(evidence, dict)
        probe = Path(__file__).with_name("document_sandbox_probe.py")
        self.assertEqual(
            evidence["probe_sha256_before"],
            hashlib.sha256(probe.read_bytes()).hexdigest(),
        )
        self.assertEqual(evidence["probe_sha256_before"], evidence["probe_sha256_after"])
        self.assertEqual(evidence["payload_sha256"], hashlib.sha256(b"pass").hexdigest())
        self.assertEqual(evidence["expected_checks"], sorted(BOUNDARY_CHECKS))
        self.assertIs(evidence["source_unchanged"], True)
        self.assertIs(outcome["accepted"], True)

    def test_source_change_cannot_preserve_a_green_control_receipt(self) -> None:
        """Even a valid native boundary result fails when its probe bytes change."""
        good = subprocess.CompletedProcess(
            ["control"], 0, json.dumps(dict.fromkeys(BOUNDARY_CHECKS, True)).encode(), b""
        )
        with (
            mock.patch("document_sandbox_probe.subprocess.run", return_value=good),
            mock.patch(
                "document_sandbox_probe.probe_digest",
                create=True,
                side_effect=["a" * 64, "b" * 64],
            ),
        ):
            outcome = run_control("boundaries", Path("/tmp/opencode/job"), "pass")
        self.assertIs(outcome["accepted"], False)
        evidence = outcome["evidence"]
        assert isinstance(evidence, dict)
        self.assertIs(evidence["source_unchanged"], False)
        with (
            mock.patch("document_sandbox_probe.subprocess.run") as launch,
            mock.patch("document_sandbox_probe.Path.read_bytes", side_effect=OSError),
        ):
            unavailable = run_control("boundaries", Path("/tmp/opencode/job"), "pass")
        launch.assert_not_called()
        self.assertIs(unavailable["accepted"], False)
        self.assertEqual(unavailable["error"], "probe source unavailable")

    def test_complete_receipt_names_all_controls_and_retains_causal_limits(self) -> None:
        """Fake service outcomes exercise receipt assembly, never live acceptance."""
        expected = [
            "boundaries",
            "trusted_conversion",
            "load_policy",
            "link_policy",
            "macro_policy",
            "memory_limit",
            "task_limit",
            "runtime_limit",
        ]
        digest = hashlib.sha256(
            Path(__file__).with_name("document_sandbox_probe.py").read_bytes()
        ).hexdigest()
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            job = Path(directory)
            with (
                mock.patch(
                    "document_sandbox_probe.tempfile.mkdtemp", return_value=str(job)
                ),
                mock.patch(
                    "document_sandbox_probe.run_control",
                    return_value={
                        "accepted": True,
                        "evidence": {
                            "source_unchanged": True,
                            "probe_sha256_before": digest,
                            "probe_sha256_after": digest,
                        },
                    },
                ) as run,
                mock.patch(
                    "sys.argv", ["document_sandbox_probe.py", "--run-trusted-controls"]
                ),
                mock.patch("sys.stdout", new_callable=io.StringIO),
            ):
                self.assertEqual(main(), 0)
            receipt = json.loads((job / "receipt.json").read_text())
        self.assertEqual([call.args[0] for call in run.call_args_list], expected)
        self.assertEqual(list(receipt["controls"]), expected)
        self.assertEqual(receipt["expected_controls"], expected)
        self.assertEqual(receipt["unexecuted_controls"], [])
        self.assertIs(receipt["probe_source_preserved"], True)
        self.assertEqual(receipt["probe_sha256_before"], digest)
        self.assertEqual(receipt["probe_sha256_after"], digest)
        self.assertIs(receipt["macro_causal_blocking_established"], False)
        self.assertIs(receipt["link_update_path_positive_tested"], False)
        self.assertIs(receipt["generated_document_bytes_retained"], False)
        self.assertIs(receipt["untrusted_documents_accepted"], False)

    def test_mixed_probe_epochs_cannot_form_a_passing_combined_receipt(self) -> None:
        """Individually green outcomes must share the combined source snapshot."""
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            job = Path(directory)
            with (
                mock.patch(
                    "document_sandbox_probe.tempfile.mkdtemp", return_value=str(job)
                ),
                mock.patch(
                    "document_sandbox_probe.run_control",
                    return_value={
                        "accepted": True,
                        "evidence": {
                            "source_unchanged": True,
                            "probe_sha256_before": "f" * 64,
                            "probe_sha256_after": "f" * 64,
                        },
                    },
                ),
                mock.patch(
                    "sys.argv", ["document_sandbox_probe.py", "--run-trusted-controls"]
                ),
                mock.patch("sys.stdout", new_callable=io.StringIO),
            ):
                status = main()
            receipt = json.loads((job / "receipt.json").read_text())
        self.assertEqual(status, 2)
        self.assertEqual(receipt["status"], "failed")
        self.assertIs(receipt["probe_source_preserved"], False)
        self.assertTrue(all(item["accepted"] for item in receipt["controls"].values()))


if __name__ == "__main__":
    unittest.main()
