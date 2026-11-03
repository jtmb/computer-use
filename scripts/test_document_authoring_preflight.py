"""Exercise the read-only document dependency preflight with real temp inputs."""

from __future__ import annotations

import contextlib
import copy
import glob
import hashlib
import io
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import sysconfig
import tempfile
import time
import unittest
from pathlib import Path
from typing import cast
from unittest.mock import Mock, patch

import document_authoring_preflight as preflight
from document_authoring_preflight import (
    DEFAULT_LIMITS,
    EXIT_CLEAR,
    EXIT_GATES_OPEN,
    EXIT_REFUSED,
    KNOWN_CANDIDATES,
    Limits,
    PreflightRefused,
    inspect_candidates,
)


class DocumentAuthoringPreflightTests(unittest.TestCase):
    """Use only synthetic records and site roots in approved private scratch."""

    def setUp(self) -> None:
        """Create one isolated scratch directory for each test."""
        scratch = Path("/tmp/opencode")
        try:
            scratch.mkdir(mode=0o700)
        except FileExistsError:
            self.assertTrue(stat.S_ISDIR(scratch.lstat().st_mode))
        self.temporary = tempfile.TemporaryDirectory(
            prefix="authoring-preflight-", dir=scratch
        )
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def record(self, version: str = "1.0.0") -> dict[str, object]:
        """Build one strict synthetic candidate record for the selected stack."""
        packages: list[dict[str, object]] = []
        for distribution, module in KNOWN_CANDIDATES.items():
            escaped = distribution.replace("-", "_")
            packages.append(
                {
                    "distribution": distribution,
                    "module": module,
                    "version": version,
                    "metadataURL": (
                        f"https://pypi.org/pypi/{distribution}/{version}/json"
                    ),
                    "metadataBytes": 100,
                    "requiresPython": ">=3.9",
                    "declaredLicense": "MIT",
                    "baseRequiresDist": [],
                    "wheel": {
                        "filename": (
                            f"{escaped}-{version}-py3-none-any.whl"
                        ),
                        "sha256Declared": "a" * 64,
                        "bytesDeclared": 1000,
                        "yanked": False,
                        "uploaded": "2026-10-30T00:00:00Z",
                    },
                }
            )
        return {
            "schemaVersion": 1,
            "status": (
                "metadata-only candidates; not approved pins or an installation lock"
            ),
            "checkedDate": "2026-10-30",
            "target": {
                "interpreter": sys.executable,
                "versionObserved": platform.python_version(),
                "implementation": platform.python_implementation(),
                "machine": platform.machine(),
                "soabiObserved": sysconfig.get_config_var("SOABI"),
                "allNineModuleSpecsAbsent": True,
            },
            "parentAcquisition": {
                "source": "exact-version official registry JSON only",
                "perResponseCapBytes": 2097152,
                "aggregateCapBytes": 10485760,
                "socketTimeoutSeconds": 5,
                "artifactDownloads": 0,
            },
            "childReview": {"status": "synthetic test provenance"},
            "limits": {
                "installationAuthorizedByThisRecord": False,
                "installed": False,
                "artifactBytesVerified": False,
                "resolvedTransitiveClosure": False,
                "licenseFilesAudited": False,
                "vulnerabilityReviewComplete": False,
                "importsTested": False,
                "python314RuntimeAcceptance": False,
                "abiOrGlibcCompatibilityVerified": False,
                "authoringOrHardenedXmlReady": False,
                "latestVersionVerifiedByParent": False,
                "extrasSelected": [],
                "note": "synthetic declaration only",
            },
            "packages": packages,
        }

    def write(
        self, record: dict[str, object], name: str = "candidates.json"
    ) -> Path:
        """Write the exact JSON candidate bytes selected by the test."""
        target = self.root / name
        target.write_text(json.dumps(record), encoding="utf-8")
        return target

    def empty_site(self) -> Path:
        """Create an empty explicit scan root standing in for a clean host."""
        site = self.root / "empty-site"
        try:
            site.mkdir()
        except FileExistsError:
            self.assertTrue(stat.S_ISDIR(site.lstat().st_mode))
        return site

    def site(self) -> Path:
        """Create a private synthetic site-packages directory."""
        site = self.root / "site"
        site.mkdir()
        return site

    def add_distribution(
        self, site: Path, distribution: str, version: str
    ) -> None:
        """Create real importlib-readable distribution metadata only."""
        directory = site / f"{distribution.replace('-', '_')}-{version}.dist-info"
        directory.mkdir()
        (directory / "METADATA").write_text(
            f"Metadata-Version: 2.1\nName: {distribution}\nVersion: {version}\n",
            encoding="utf-8",
        )

    def metadata_path(
        self,
        site: Path,
        distribution: str = "python-docx",
        version: str = "1.0.0",
    ) -> Path:
        """Return the exact METADATA path for one synthetic distribution."""
        return (
            site
            / f"{distribution.replace('-', '_')}-{version}.dist-info"
            / "METADATA"
        )

    def add_module(
        self, site: Path, module: str, sentinel: Path | None = None
    ) -> None:
        """Create a real package whose import would reveal itself."""
        directory = site / module
        directory.mkdir()
        body = "VALUE = 1\n"
        if sentinel is not None:
            body = (
                "from pathlib import Path\n"
                f"Path({str(sentinel)!r}).write_text('imported')\n"
            )
        (directory / "__init__.py").write_text(body, encoding="utf-8")

    def packages(self, result: dict[str, object]) -> dict[str, dict[str, object]]:
        """Index reported packages by distribution for direct gate assertions."""
        reported = cast(list[dict[str, object]], result["packages"])
        return {
            str(package["distribution"]): package for package in reported
        }

    def cli_interpreters(self) -> list[Path]:
        """Return the invoked interpreter plus genuinely available ports."""
        interpreters = [Path(sys.executable).resolve()]
        for name in ("python3", "python3.11"):
            found = shutil.which(name)
            if found is not None:
                interpreters.append(Path(found).resolve())
        return list(dict.fromkeys(interpreters))

    def test_declaration_record_reports_every_missing_dependency(self) -> None:
        """A valid declaration record never becomes an installed/ready claim."""
        candidate = self.write(self.record())
        before = candidate.read_bytes()
        site = self.empty_site()
        result = inspect_candidates(candidate, scan_roots=[site])

        self.assertEqual(result["status"], "inspected")
        self.assertEqual(result["mode"], "inspect-only")
        self.assertEqual(
            result["record"]["sha256"], hashlib.sha256(before).hexdigest()
        )
        self.assertEqual(result["environment"]["scan_roots"], [str(site)])
        self.assertEqual(
            result["environment"]["scope"], "explicit diagnostic roots"
        )
        self.assertEqual(result["summary"]["dependency_presence"], "incomplete")
        self.assertIn(
            "cooperative", result["acquisition"]["deadline_scope"]
        )
        self.assertIn(
            ".dist-info", result["environment"]["distribution_discovery"]
        )
        self.assertIn(
            "symlinked", result["environment"]["symlink_policy"]
        )
        self.assertEqual(
            result["acquisition"]["cli_output_bytes_limit"],
            preflight.MAX_CLI_OUTPUT_BYTES,
        )
        self.assertEqual(set(result["summary"]["install_states"]), {"missing"})
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)
        self.assertIs(result["authoring_ready"], False)
        self.assertIs(result["hardened_xml_ready"], False)
        self.assertIs(result["evidence"]["third_party_modules_imported"], False)
        self.assertIs(result["evidence"]["files_written"], False)
        self.assertIs(result["evidence"]["caller_declarations_used_as_evidence"], False)
        states = {
            package["distribution"]: package["install_state"]
            for package in result["packages"]
        }
        self.assertEqual(set(states), set(KNOWN_CANDIDATES))
        self.assertEqual(candidate.read_bytes(), before)

    def test_unknown_duplicate_and_malformed_candidates_refuse(self) -> None:
        """Schema, selection and field defects fail before any host scan."""

        def unknown(record: dict[str, object]) -> None:
            package = record["packages"][0]
            package["distribution"] = "python-evilxml"
            package["module"] = "evilxml"

        def mismatched_module(record: dict[str, object]) -> None:
            record["packages"][0]["module"] = "evilxml"

        def duplicate(record: dict[str, object]) -> None:
            record["packages"].append(copy.deepcopy(record["packages"][0]))

        def omitted(record: dict[str, object]) -> None:
            record["packages"].pop()

        def bad_digest(record: dict[str, object]) -> None:
            record["packages"][0]["wheel"]["sha256Declared"] = "A" * 64

        def bad_url(record: dict[str, object]) -> None:
            record["packages"][0]["metadataURL"] = (
                "https://pypi.org/pypi/python-docx/9.9.9/json"
            )

        def bad_version(record: dict[str, object]) -> None:
            record["packages"][0]["version"] = "latest"

        def yanked(record: dict[str, object]) -> None:
            record["packages"][0]["wheel"]["yanked"] = True

        def extra_field(record: dict[str, object]) -> None:
            record["packages"][0]["unexpected"] = 1

        def boolean_size(record: dict[str, object]) -> None:
            record["packages"][0]["wheel"]["bytesDeclared"] = True

        def unsafe_filename(record: dict[str, object]) -> None:
            record["packages"][0]["wheel"]["filename"] = "../evil.whl"

        def approved_status(record: dict[str, object]) -> None:
            record["status"] = "approved pins and an installation lock"

        def bad_target(record: dict[str, object]) -> None:
            record["target"]["versionObserved"] = "latest"

        def missing_field(record: dict[str, object]) -> None:
            del record["packages"][0]["wheel"]["uploaded"]

        cases = [
            (unknown, "unknown candidate distribution"),
            (mismatched_module, "does not match the selected distribution"),
            (duplicate, "duplicates a selected distribution"),
            (omitted, "does not exactly match the selected distributions"),
            (bad_digest, "lowercase hex"),
            (bad_url, "does not match the declared exact version"),
            (bad_version, "exact dotted version"),
            (yanked, "yanked"),
            (extra_field, "unexpected field"),
            (boolean_size, "must be an integer"),
            (unsafe_filename, "safe exact wheel"),
            (approved_status, "metadata-only candidates"),
            (bad_target, "not a dotted version"),
            (missing_field, "missing a required field"),
        ]
        for mutate, message in cases:
            record = self.record()
            mutate(record)
            candidate = self.write(record, name=f"{mutate.__name__}.json")
            with self.subTest(case=mutate.__name__), self.assertRaisesRegex(
                PreflightRefused, message
            ):
                inspect_candidates(candidate, scan_roots=[self.empty_site()])

    def test_duplicate_json_keys_are_not_silently_overwritten(self) -> None:
        """Repeated JSON keys make the declaration ambiguous."""
        record = self.record()
        text = json.dumps(record)
        candidate = self.root / "duplicate-keys.json"
        candidate.write_text(
            text[:-1] + ', "schemaVersion": 1}', encoding="utf-8"
        )
        with self.assertRaisesRegex(PreflightRefused, "duplicate JSON keys"):
            inspect_candidates(candidate, scan_roots=[self.empty_site()])

    def test_non_finite_and_deeply_nested_json_refuse(self) -> None:
        """Python JSON extensions and pathological nesting are not accepted."""
        non_finite = self.root / "non-finite.json"
        non_finite.write_text(
            '{"schemaVersion": NaN, "status": "metadata-only"}',
            encoding="utf-8",
        )
        with self.assertRaisesRegex(PreflightRefused, "non-finite"):
            inspect_candidates(non_finite, scan_roots=[self.empty_site()])
        nested = self.root / "nested.json"
        nested.write_text(
            '{"value":' + "[" * 100000 + "]" * 100000 + "}",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(PreflightRefused, "deeply nested"):
            inspect_candidates(nested, scan_roots=[self.empty_site()])

    def test_caller_positive_claims_are_not_package_or_rights_evidence(self) -> None:
        """Every positive limit flag is ignored in favour of observation."""
        record = self.record()
        for key in record["limits"]:
            if key not in {"extrasSelected", "note"}:
                record["limits"][key] = True
        candidate = self.write(record)
        result = inspect_candidates(candidate, scan_roots=[self.empty_site()])
        self.assertEqual(set(result["summary"]["install_states"]), {"missing"})
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)
        self.assertIs(result["authoring_ready"], False)
        self.assertIs(result["hardened_xml_ready"], False)
        self.assertIs(result["evidence"]["caller_declarations_used_as_evidence"], False)
        for package in result["packages"]:
            for gate in ("license", "transitive", "import", "runtime", "format"):
                self.assertEqual(package["gates"][gate]["status"], "unverified")

    def test_metadata_only_wrong_version_module_only_and_missing_are_distinct(
        self,
    ) -> None:
        """Each contradictory install state remains individually visible."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_distribution(site, "lxml", "0.9.0")
        self.add_module(site, "lxml")
        self.add_module(site, "xlsxwriter")
        result = inspect_candidates(self.write(self.record()), scan_roots=[site])
        packages = self.packages(result)

        self.assertEqual(packages["python-docx"]["install_state"], "metadata-only")
        self.assertEqual(
            packages["python-docx"]["gates"]["distribution"]["status"], "pass"
        )
        self.assertEqual(
            packages["python-docx"]["gates"]["module"]["status"], "missing"
        )
        self.assertEqual(packages["lxml"]["install_state"], "wrong-version")
        self.assertEqual(
            packages["lxml"]["gates"]["version"]["status"], "wrong-version"
        )
        self.assertEqual(packages["xlsxwriter"]["install_state"], "module-only")
        self.assertEqual(
            packages["xlsxwriter"]["gates"]["distribution"]["status"], "missing"
        )
        self.assertEqual(
            packages["xlsxwriter"]["gates"]["module"]["status"], "pass"
        )
        self.assertEqual(packages["pypdf"]["install_state"], "missing")
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)
        self.assertIs(result["authoring_ready"], False)

    def test_matching_metadata_and_regular_paths_do_not_execute_package_code(
        self,
    ) -> None:
        """Observing a regular path is not importing code or writing its cache."""
        site = self.site()
        sentinel = self.root / "imported.sentinel"
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_module(site, "docx", sentinel)
        result = inspect_candidates(self.write(self.record()), scan_roots=[site])
        package = self.packages(result)["python-docx"]

        self.assertEqual(package["install_state"], "installed")
        self.assertEqual(package["gates"]["module"]["status"], "pass")
        self.assertEqual(package["gates"]["module"]["origin"], "docx/__init__.py")
        self.assertFalse(sentinel.exists())
        self.assertEqual(list(site.rglob("__pycache__")), [])
        self.assertEqual(package["gates"]["import"]["status"], "unverified")
        self.assertEqual(package["gates"]["runtime"]["status"], "unverified")
        self.assertEqual(package["gates"]["format"]["status"], "unverified")
        self.assertIs(result["authoring_ready"], False)
        self.assertIs(result["hardened_xml_ready"], False)

    def test_working_directory_module_is_not_scanned_or_imported(self) -> None:
        """A module beside the caller is not package evidence for the interpreter."""
        sentinel = self.root / "imported.sentinel"
        self.add_module(self.root, "docx", sentinel)
        candidate = self.write(self.record())
        previous = os.getcwd()
        self.addCleanup(os.chdir, previous)
        os.chdir(self.root)
        result = inspect_candidates(candidate, scan_roots=[self.empty_site()])
        package = self.packages(result)["python-docx"]

        self.assertEqual(package["install_state"], "missing")
        self.assertEqual(package["gates"]["module"]["status"], "missing")
        self.assertFalse(sentinel.exists())
        self.assertNotIn(str(self.root), result["environment"]["scan_roots"])

    def test_full_synthetic_environment_is_clear_but_not_authoring_ready(self) -> None:
        """Only metadata plus module presence closes the dependency gate."""
        site = self.site()
        sentinel = self.root / "imported.sentinel"
        for distribution, module in KNOWN_CANDIDATES.items():
            self.add_distribution(site, distribution, "1.0.0")
            self.add_module(site, module, sentinel)
        result = inspect_candidates(self.write(self.record()), scan_roots=[site])

        self.assertEqual(result["summary"]["install_states"], {"installed": 9})
        self.assertEqual(result["summary"]["open_gates"], [])
        self.assertEqual(result["exit_status"], EXIT_CLEAR)
        self.assertFalse(sentinel.exists())
        self.assertIs(result["authoring_ready"], False)
        self.assertIs(result["hardened_xml_ready"], False)
        for package in result["packages"]:
            self.assertEqual(package["gates"]["import"]["status"], "unverified")
            self.assertEqual(package["gates"]["artifact"]["status"], "unverified")

    def test_recorded_target_interpreter_mismatch_opens_the_gate(self) -> None:
        """A different recorded interpreter cannot inherit presence claims."""
        record = self.record()
        record["target"]["versionObserved"] = "0.0.1"
        result = inspect_candidates(
            self.write(record), scan_roots=[self.empty_site()]
        )
        self.assertEqual(result["interpreter_gate"]["status"], "mismatch")
        self.assertIn(
            "version", result["interpreter_gate"]["mismatched_fields"]
        )
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)
        self.assertIn("interpreter:mismatch", result["summary"]["open_gates"])

    def test_wheel_bytes_are_not_installation_or_artifact_evidence(self) -> None:
        """A downloaded wheel alone remains missing and unverified."""
        record = self.record(version="0.7.1")
        site = self.site()
        declared = next(
            package["wheel"]["filename"]
            for package in record["packages"]
            if package["distribution"] == "defusedxml"
        )
        wheel = site / declared
        wheel.write_bytes(b"placeholder wheel bytes")
        result = inspect_candidates(self.write(record), scan_roots=[site])
        package = self.packages(result)["defusedxml"]

        self.assertEqual(package["install_state"], "missing")
        self.assertEqual(package["gates"]["artifact"]["status"], "unverified")
        self.assertEqual(
            package["gates"]["artifact"]["declared_filename"], declared
        )
        self.assertIs(result["evidence"]["wheel_or_source_bytes_read"], False)
        self.assertEqual(wheel.read_bytes(), b"placeholder wheel bytes")

    def test_acquisition_refuses_symlink_fifo_directory_and_oversize(self) -> None:
        """Unsafe or oversized candidate inputs never reach JSON parsing."""
        candidate = self.write(self.record())
        empty = self.empty_site()
        link = self.root / "linked.json"
        os.symlink(candidate, link)
        fifo = self.root / "fifo.json"
        os.mkfifo(fifo)
        directory = self.root / "directory.json"
        directory.mkdir()
        absent = self.root / "absent.json"
        for path, message in [
            (link, "readable regular file"),
            (fifo, "bounded regular file"),
            (directory, "bounded regular file"),
            (absent, "readable regular file"),
        ]:
            with self.subTest(path=path.name), self.assertRaisesRegex(
                PreflightRefused, message
            ):
                inspect_candidates(path, scan_roots=[empty])
        with self.assertRaisesRegex(PreflightRefused, "bounded regular file"):
            inspect_candidates(
                candidate,
                limits=Limits(candidate_bytes=64),
                scan_roots=[empty],
            )

    def test_growing_candidate_stops_at_the_byte_budget(self) -> None:
        """Concurrent growth cannot turn bounded acquisition into a full read."""
        candidate = self.write(self.record())
        initial = candidate.stat().st_size
        original = preflight._read_chunk
        state = {"grow": True}

        def growing(descriptor: int, size: int) -> bytes:
            """Append real bytes after the first bounded read."""
            chunk = original(descriptor, size)
            if state["grow"]:
                state["grow"] = False
                with candidate.open("ab") as output:
                    output.write(b"x" * 4096)
            return chunk

        with (
            patch.object(preflight, "_read_chunk", growing),
            self.assertRaisesRegex(PreflightRefused, "byte budget"),
        ):
            inspect_candidates(
                candidate,
                limits=Limits(candidate_bytes=initial + 64),
                scan_roots=[self.empty_site()],
            )

    def test_replaced_candidate_fails_identity_recheck(self) -> None:
        """A same-sized replacement with a new inode is not accepted."""
        candidate = self.write(self.record())
        replacement = self.write(self.record(), name="replacement.json")
        original = preflight._read_chunk
        state = {"replace": True}

        def replacing(descriptor: int, size: int) -> bytes:
            """Swap the selected path after the first bounded read."""
            chunk = original(descriptor, size)
            if state["replace"]:
                state["replace"] = False
                os.replace(replacement, candidate)
            return chunk

        with (
            patch.object(preflight, "_read_chunk", replacing),
            self.assertRaisesRegex(PreflightRefused, "changed during acquisition"),
        ):
            inspect_candidates(candidate, scan_roots=[self.empty_site()])

    def test_deadline_refuses_without_finishing_acquisition(self) -> None:
        """The cooperative deadline is a real refusal, not an ignored option."""
        candidate = self.write(self.record())
        calls = {"count": 0}

        def clock() -> float:
            """Advance virtual time after the deadline is calculated."""
            calls["count"] += 1
            return 0.0 if calls["count"] == 1 else 100.0

        with (
            patch.object(preflight.time, "monotonic", clock),
            self.assertRaisesRegex(PreflightRefused, "deadline"),
        ):
            inspect_candidates(
                candidate,
                limits=Limits(seconds=1.0),
                scan_roots=[self.empty_site()],
            )

    def test_limits_cannot_be_disabled_or_widened(self) -> None:
        """The public call cannot silently raise or disable hard budgets."""
        candidate = self.write(self.record())
        empty = self.empty_site()
        for limits in [
            Limits(candidate_bytes=DEFAULT_LIMITS.candidate_bytes + 1),
            Limits(seconds=float("nan")),
            Limits(seconds=float("inf")),
            Limits(candidate_bytes=True),
            Limits(seconds=0),
        ]:
            with self.subTest(limits=limits), self.assertRaisesRegex(
                PreflightRefused, "limits"
            ):
                inspect_candidates(candidate, limits=limits, scan_roots=[empty])

    def test_actual_cli_is_read_only_and_reports_its_exit_status(self) -> None:
        """The real CLI writes nothing and keeps JSON statuses deterministic."""
        workspace = self.root / "workspace"
        workspace.mkdir()
        candidate = workspace / "candidates.json"
        candidate.write_text(json.dumps(self.record()), encoding="utf-8")
        before = candidate.read_bytes()
        script = Path(preflight.__file__).resolve()
        cache_pattern = str(
            script.parent / "__pycache__" / "document_authoring_preflight*.pyc"
        )
        cache_before = set(glob.glob(cache_pattern))
        environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        result = subprocess.run(
            [
                sys.executable,
                "-s",
                "-B",
                str(script),
                "--candidates",
                str(candidate),
            ],
            cwd=workspace,
            capture_output=True,
            check=False,
            timeout=30,
            env=environment,
        )
        self.assertEqual(result.stderr, b"")
        self.assertIn(result.returncode, {EXIT_CLEAR, EXIT_GATES_OPEN})
        output = json.loads(result.stdout)
        self.assertEqual(output["status"], "inspected")
        self.assertEqual(output["exit_status"], result.returncode)
        self.assertEqual(
            result.returncode == EXIT_CLEAR,
            output["summary"]["dependency_presence"] == "complete",
        )
        self.assertIs(output["authoring_ready"], False)
        self.assertIs(output["hardened_xml_ready"], False)
        self.assertEqual(candidate.read_bytes(), before)
        self.assertEqual(list(workspace.iterdir()), [candidate])
        self.assertEqual(set(glob.glob(cache_pattern)), cache_before)

        invalid = workspace / "invalid.json"
        invalid.write_text("{", encoding="utf-8")
        refused = subprocess.run(
            [
                sys.executable,
                "-s",
                "-B",
                str(script),
                "--candidates",
                str(invalid),
            ],
            cwd=workspace,
            capture_output=True,
            check=False,
            timeout=30,
            env=environment,
        )
        self.assertEqual(refused.returncode, EXIT_REFUSED)
        refusal = json.loads(refused.stdout)
        self.assertEqual(refusal["status"], "refused")
        self.assertEqual(refusal["mode"], "inspect-only")
        self.assertIn("not valid JSON", refusal["reason"])
        self.assertEqual(invalid.read_text(encoding="utf-8"), "{")
        self.assertEqual(
            sorted(workspace.iterdir()), sorted([candidate, invalid])
        )

    def test_fifo_distribution_metadata_cannot_hang_inspection(self) -> None:
        """A candidate FIFO is not the only file acquisition needing a bound."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        metadata = site / "python_docx-1.0.0.dist-info" / "METADATA"
        metadata.unlink()
        os.mkfifo(metadata)
        candidate = self.write(self.record())
        script_root = str(Path(preflight.__file__).resolve().parent)
        code = (
            f"import sys; sys.path.insert(0, {script_root!r}); "
            "from pathlib import Path; import document_authoring_preflight as p; "
            f"r=p.inspect_candidates(Path({str(candidate)!r}), "
            f"scan_roots=[Path({str(site)!r})]); "
            "assert r['environment']['metadata_scan_errors']; "
            "assert r['exit_status']==1"
        )
        result = subprocess.run(
            [sys.executable, "-s", "-B", "-c", code],
            capture_output=True,
            timeout=2,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_oversized_distribution_metadata_is_not_read_as_presence(self) -> None:
        """Header discovery must not acquire arbitrary installed-package bodies."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_module(site, "docx")
        metadata = site / "python_docx-1.0.0.dist-info" / "METADATA"
        with metadata.open("a") as output:
            output.write("\n" + "x" * 65536)
        result = inspect_candidates(self.write(self.record()), scan_roots=[site])
        self.assertTrue(result["environment"]["metadata_scan_errors"])
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)
        self.assertNotEqual(
            self.packages(result)["python-docx"]["install_state"], "installed"
        )

    def test_metadata_presence_never_invokes_cached_import_finders(self) -> None:
        """A custom finder can execute code even without importing a package."""
        site = self.site()
        finder = Mock()
        finder.find_spec.return_value = None
        with patch.dict(sys.path_importer_cache, {str(site): finder}):
            inspect_candidates(self.write(self.record()), scan_roots=[site])
        finder.find_spec.assert_not_called()

    def test_duplicate_same_version_distributions_are_still_ambiguous(self) -> None:
        """Equal version strings cannot hide two independent metadata records."""
        first = self.site()
        second = self.root / "second-site"
        second.mkdir()
        for site in [first, second]:
            self.add_distribution(site, "python-docx", "1.0.0")
            self.add_module(site, "docx")
        result = inspect_candidates(
            self.write(self.record()), scan_roots=[first, second]
        )
        package = self.packages(result)["python-docx"]
        self.assertEqual(package["install_state"], "ambiguous")
        self.assertEqual(package["gates"]["distribution"]["status"], "ambiguous")

    def test_metadata_reads_share_one_scan_deadline(self) -> None:
        """Every selected METADATA read uses the one absolute scan deadline."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_distribution(site, "lxml", "1.0.0")
        until = time.monotonic() + 5.0
        seen: list[float | None] = []
        original = preflight._acquire

        def recording(
            path: Path, limits: Limits, *, until: float | None = None
        ) -> tuple[bytes, str]:
            """Record the absolute deadline supplied for each read."""
            seen.append(until)
            return original(path, limits, until=until)

        with patch.object(preflight, "_acquire", recording):
            index, errors = preflight._distribution_index([site], until, 5.0)
        self.assertEqual(errors, [])
        self.assertGreaterEqual(len(seen), 2)
        self.assertEqual(set(seen), {until})
        self.assertEqual(set(index), {"python-docx", "lxml"})

    def test_expired_metadata_deadline_prevents_read(self) -> None:
        """An already-expired shared deadline refuses before reading METADATA."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        metadata = self.metadata_path(site)
        calls: list[tuple[int, int]] = []

        def read(descriptor: int, size: int) -> bytes:
            """Record an unexpected read of metadata bytes."""
            calls.append((descriptor, size))
            return b""

        with patch.object(preflight, "_read_chunk", read):
            with self.assertRaisesRegex(PreflightRefused, "deadline"):
                preflight._acquire(
                    metadata,
                    Limits(),
                    until=time.monotonic() - 1.0,
                )
        self.assertEqual(calls, [])

    def test_deadline_is_not_downgraded_to_metadata_error(self) -> None:
        """A scan deadline must stop inspection, not become a soft gate error."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        with patch.object(
            preflight,
            "_acquire",
            side_effect=preflight.DeadlineExceeded("inspection deadline exceeded"),
        ):
            with self.assertRaises(preflight.DeadlineExceeded):
                preflight._distribution_index([site], time.monotonic() + 5.0, 5.0)

    def test_inspection_uses_one_deadline_for_candidate_and_scan(self) -> None:
        """Candidate acquisition and metadata reads share one absolute deadline."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_module(site, "docx")
        candidate = self.write(self.record())
        seen: list[float | None] = []
        original = preflight._acquire

        def recording(
            path: Path, limits: Limits, *, until: float | None = None
        ) -> tuple[bytes, str]:
            """Record every acquisition deadline in the full inspection."""
            seen.append(until)
            return original(path, limits, until=until)

        with patch.object(preflight, "_acquire", recording):
            result = inspect_candidates(candidate, scan_roots=[site])
        self.assertGreaterEqual(len(seen), 2)
        self.assertIsNotNone(seen[0])
        self.assertEqual(set(seen), {seen[0]})
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)

    def test_symlinked_scan_root_is_refused(self) -> None:
        """An explicit scan root cannot redirect discovery through a symlink."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_module(site, "docx")
        alias = self.root / "site-alias"
        alias.symlink_to(site, target_is_directory=True)
        with self.assertRaisesRegex(PreflightRefused, "symbolic link"):
            inspect_candidates(self.write(self.record()), scan_roots=[alias])

    def test_symlinked_distribution_members_and_module_paths_are_not_followed(
        self,
    ) -> None:
        """Symlinked dist-info, METADATA and module paths never count as presence."""
        site = self.site()
        real_dist = self.root / "real-dist-info"
        real_dist.mkdir()
        (real_dist / "METADATA").write_text(
            "Metadata-Version: 2.1\nName: python-docx\nVersion: 1.0.0\n",
            encoding="utf-8",
        )
        (site / "python_docx-1.0.0.dist-info").symlink_to(
            real_dist, target_is_directory=True
        )
        result = inspect_candidates(self.write(self.record()), scan_roots=[site])
        package = self.packages(result)["python-docx"]
        self.assertTrue(result["environment"]["metadata_scan_errors"])
        self.assertNotEqual(package["install_state"], "installed")
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)

        metadata_site = self.root / "site-metadata"
        metadata_site.mkdir()
        self.add_distribution(metadata_site, "python-docx", "1.0.0")
        metadata = self.metadata_path(metadata_site)
        target = self.root / "metadata-target"
        target.write_text(
            "Metadata-Version: 2.1\nName: python-docx\nVersion: 1.0.0\n",
            encoding="utf-8",
        )
        metadata.unlink()
        metadata.symlink_to(target)
        result = inspect_candidates(
            self.write(self.record()), scan_roots=[metadata_site]
        )
        package = self.packages(result)["python-docx"]
        self.assertTrue(result["environment"]["metadata_scan_errors"])
        self.assertNotEqual(package["install_state"], "installed")
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)

        module_site = self.root / "site-module"
        module_site.mkdir()
        sentinel = self.root / "symlink-import.sentinel"
        self.add_distribution(module_site, "python-docx", "1.0.0")
        real_module = self.root / "real-docx"
        real_module.mkdir()
        (real_module / "__init__.py").write_text(
            "from pathlib import Path\n"
            f"Path({str(sentinel)!r}).write_text('imported')\n",
            encoding="utf-8",
        )
        (module_site / "docx").symlink_to(real_module, target_is_directory=True)
        result = inspect_candidates(
            self.write(self.record()), scan_roots=[module_site]
        )
        package = self.packages(result)["python-docx"]
        self.assertEqual(package["gates"]["module"]["status"], "unverified")
        self.assertNotEqual(package["install_state"], "installed")
        self.assertFalse(sentinel.exists())
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)

    def test_scan_root_aliases_are_deduplicated(self) -> None:
        """The same root listed twice is observed once, not as two records."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_module(site, "docx")
        result = inspect_candidates(
            self.write(self.record()), scan_roots=[site, site]
        )
        package = self.packages(result)["python-docx"]
        self.assertEqual(result["environment"]["scan_roots"], [str(site)])
        self.assertEqual(package["install_state"], "installed")
        self.assertEqual(
            package["gates"]["distribution"]["metadata_records"], 1
        )

    def test_disabled_user_site_is_not_discovered(self) -> None:
        """User-site packages are ignored when the interpreter disables it."""
        empty = self.empty_site()
        user_site = self.root / "user-site"
        user_site.mkdir()
        sentinel = self.root / "user-site-import.sentinel"
        self.add_distribution(user_site, "python-docx", "1.0.0")
        self.add_module(user_site, "docx", sentinel)
        candidate = self.write(self.record())

        def inspect_with_user_site(enabled: bool) -> dict[str, object]:
            """Run environment discovery with user-site toggled explicitly."""
            with (
                patch.object(
                    preflight.sysconfig,
                    "get_path",
                    side_effect=lambda key: str(empty)
                    if key in {"purelib", "platlib"}
                    else None,
                ),
                patch.object(
                    preflight.site, "getsitepackages", return_value=[str(empty)]
                ),
                patch.object(preflight.site, "ENABLE_USER_SITE", enabled),
                patch.object(
                    preflight.site,
                    "getusersitepackages",
                    return_value=str(user_site),
                ),
            ):
                return inspect_candidates(candidate)

        disabled = inspect_with_user_site(False)
        self.assertNotIn(str(user_site), disabled["environment"]["scan_roots"])
        self.assertEqual(
            self.packages(disabled)["python-docx"]["install_state"], "missing"
        )
        self.assertFalse(sentinel.exists())

        enabled = inspect_with_user_site(True)
        self.assertIn(str(user_site), enabled["environment"]["scan_roots"])
        self.assertEqual(
            self.packages(enabled)["python-docx"]["install_state"], "installed"
        )
        self.assertFalse(sentinel.exists())

    def test_scan_root_and_entry_budgets_are_enforced(self) -> None:
        """Root and directory-entry ceilings are real observed boundaries."""
        candidate = self.write(self.record())
        roots = [self.root / f"root-{index}" for index in range(17)]
        for root in roots:
            root.mkdir()
        with self.assertRaisesRegex(PreflightRefused, "too many"):
            inspect_candidates(candidate, scan_roots=roots)
        allowed = inspect_candidates(candidate, scan_roots=roots[:16])
        self.assertEqual(allowed["status"], "inspected")
        self.assertEqual(allowed["exit_status"], EXIT_GATES_OPEN)

        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_module(site, "docx")
        for index in range(preflight.MAX_SITE_ENTRIES - 2):
            (site / f"filler-{index}").touch()
        self.assertEqual(
            len(list(site.iterdir())), preflight.MAX_SITE_ENTRIES
        )
        at_limit = inspect_candidates(candidate, scan_roots=[site])
        self.assertNotIn(
            "site-entry-budget",
            at_limit["environment"]["metadata_scan_errors"],
        )
        self.assertEqual(
            self.packages(at_limit)["python-docx"]["install_state"],
            "installed",
        )
        (site / "filler-over").touch()
        self.assertEqual(
            len(list(site.iterdir())), preflight.MAX_SITE_ENTRIES + 1
        )
        over = inspect_candidates(candidate, scan_roots=[site])
        self.assertIn(
            "site-entry-budget", over["environment"]["metadata_scan_errors"]
        )
        self.assertEqual(over["exit_status"], EXIT_GATES_OPEN)

    def test_metadata_byte_budget_boundary(self) -> None:
        """Exactly 64 KiB of METADATA is usable; one more byte is not presence."""
        site = self.site()
        self.add_distribution(site, "python-docx", "1.0.0")
        self.add_module(site, "docx")
        metadata = self.metadata_path(site)
        header = (
            b"Metadata-Version: 2.1\nName: python-docx\nVersion: 1.0.0\n\n"
        )
        metadata.write_bytes(
            header + b"x" * (preflight.MAX_METADATA_BYTES - len(header))
        )
        at_limit = inspect_candidates(self.write(self.record()), scan_roots=[site])
        self.assertEqual(at_limit["environment"]["metadata_scan_errors"], [])
        self.assertEqual(
            self.packages(at_limit)["python-docx"]["install_state"],
            "installed",
        )
        metadata.write_bytes(
            header
            + b"x" * (preflight.MAX_METADATA_BYTES - len(header) + 1)
        )
        over = inspect_candidates(self.write(self.record()), scan_roots=[site])
        self.assertTrue(over["environment"]["metadata_scan_errors"])
        self.assertNotEqual(
            self.packages(over)["python-docx"]["install_state"], "installed"
        )
        self.assertEqual(over["exit_status"], EXIT_GATES_OPEN)

    def test_malformed_selected_metadata_never_becomes_installed(self) -> None:
        """Malformed identity headers are gated, even with a module present."""
        cases = {
            "missing-name": "Version: 1.0.0\n",
            "missing-version": "Name: python-docx\n",
            "duplicate-name": (
                "Name: python-docx\nName: python-docx\nVersion: 1.0.0\n"
            ),
            "duplicate-version": (
                "Name: python-docx\nVersion: 1.0.0\nVersion: 1.0.0\n"
            ),
            "folded-name": (
                "Name: python-docx\n continuation\nVersion: 1.0.0\n"
            ),
            "folded-version": (
                "Name: python-docx\nVersion: 1.0.0\n continuation\n"
            ),
            "wrong-name": "Name: lxml\nVersion: 1.0.0\n",
            "bad-version": "Name: python-docx\nVersion: latest\n",
            "empty-version": "Name: python-docx\nVersion:\n",
            "body-only": (
                "Metadata-Version: 2.1\n\nName: python-docx\nVersion: 1.0.0\n"
            ),
        }
        for name, content in cases.items():
            with self.subTest(case=name):
                site = self.root / f"site-{name}"
                site.mkdir()
                self.add_distribution(site, "python-docx", "1.0.0")
                self.add_module(site, "docx")
                self.metadata_path(site).write_text(
                    content, encoding="utf-8"
                )
                result = inspect_candidates(
                    self.write(self.record()), scan_roots=[site]
                )
                package = self.packages(result)["python-docx"]
                self.assertEqual(
                    result["environment"]["metadata_scan_errors"],
                    ["malformed-metadata-header"],
                )
                self.assertNotEqual(package["install_state"], "installed")
                self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)
                self.assertIs(result["authoring_ready"], False)

    def test_malformed_metadata_cannot_be_hidden_by_a_valid_root(self) -> None:
        """One malformed selected record keeps an otherwise complete stack open."""
        bad_site = self.root / "bad-site"
        bad_site.mkdir()
        self.add_distribution(bad_site, "python-docx", "1.0.0")
        self.add_module(bad_site, "docx")
        self.metadata_path(bad_site).write_text(
            "Name: python-docx\nVersion: latest\n", encoding="utf-8"
        )

        good_site = self.root / "good-site"
        good_site.mkdir()
        for distribution, module in KNOWN_CANDIDATES.items():
            self.add_distribution(good_site, distribution, "1.0.0")
            self.add_module(good_site, module)
        result = inspect_candidates(
            self.write(self.record()), scan_roots=[bad_site, good_site]
        )
        self.assertEqual(result["summary"]["install_states"], {"installed": 9})
        self.assertTrue(result["environment"]["metadata_scan_errors"])
        self.assertEqual(result["exit_status"], EXIT_GATES_OPEN)
        self.assertEqual(result["summary"]["dependency_presence"], "incomplete")

    def test_cli_output_is_bounded(self) -> None:
        """An oversized inspection result becomes a bounded refusal."""
        oversized = {
            "status": "inspected",
            "exit_status": EXIT_CLEAR,
            "padding": "x" * (preflight.MAX_CLI_OUTPUT_BYTES + 1),
        }
        output = io.StringIO()
        with (
            patch.object(preflight, "inspect_candidates", return_value=oversized),
            contextlib.redirect_stdout(output),
        ):
            code = preflight.main([])
        refusal = json.loads(output.getvalue())
        self.assertEqual(code, EXIT_REFUSED)
        self.assertEqual(refusal["status"], "refused")
        self.assertIn("output exceeds", refusal["reason"])
        self.assertLessEqual(
            len(output.getvalue().encode("utf-8")),
            preflight.MAX_CLI_OUTPUT_BYTES,
        )

    def test_cli_subprocess_isolated_from_synthetic_user_site(self) -> None:
        """Offline CLI runs must not observe a synthetic or real user site."""
        userbase = self.root / "userbase"
        userbase.mkdir()
        home = self.root / "home"
        home.mkdir()
        environment = dict(
            os.environ,
            PYTHONUSERBASE=str(userbase),
            HOME=str(home),
            PYTHONPATH="",
            PYTHONDONTWRITEBYTECODE="1",
        )
        user_site = Path(
            subprocess.check_output(
                [
                    sys.executable,
                    "-s",
                    "-B",
                    "-c",
                    "import site; print(site.getusersitepackages())",
                ],
                env=environment,
                text=True,
                timeout=10,
            ).strip()
        )
        user_site.mkdir(parents=True)
        sentinel = self.root / "user-site-import.sentinel"
        self.add_distribution(user_site, "python-docx", "1.0.0")
        self.add_module(user_site, "docx", sentinel)
        workspace = self.root / "workspace-user-site"
        workspace.mkdir()
        candidate = workspace / "candidates.json"
        candidate.write_text(json.dumps(self.record()), encoding="utf-8")
        before = candidate.read_bytes()
        result = subprocess.run(
            [
                sys.executable,
                "-s",
                "-B",
                str(Path(preflight.__file__).resolve()),
                "--candidates",
                str(candidate),
            ],
            cwd=workspace,
            capture_output=True,
            check=False,
            timeout=60,
            env=environment,
        )
        self.assertEqual(result.stderr, b"")
        output = json.loads(result.stdout)
        self.assertEqual(output["status"], "inspected")
        self.assertNotIn(
            str(user_site), output["environment"]["scan_roots"]
        )
        self.assertFalse(sentinel.exists())
        self.assertIs(output["authoring_ready"], False)
        self.assertEqual(candidate.read_bytes(), before)
        self.assertEqual(list(workspace.iterdir()), [candidate])

    def test_available_cli_interpreters_are_read_only_without_imports(
        self,
    ) -> None:
        """Exercise the invoked interpreter and any genuine additional ports."""
        invoked = Path(sys.executable).resolve()
        interpreters = self.cli_interpreters()
        self.assertIn(invoked, interpreters)
        with patch.object(shutil, "which", return_value=None):
            fallback = self.cli_interpreters()
        self.assertEqual(fallback, [invoked])
        python311 = shutil.which("python3.11")
        if python311 is not None:
            self.assertIn(Path(python311).resolve(), interpreters)
        fake_path = self.root / "pythonpath"
        fake_path.mkdir()
        sentinel = self.root / "pythonpath-import.sentinel"
        self.add_module(fake_path, "docx", sentinel)
        script = Path(preflight.__file__).resolve()
        cache_pattern = str(
            script.parent / "__pycache__" / "document_authoring_preflight*.pyc"
        )
        for index, interpreter in enumerate(interpreters):
            with self.subTest(interpreter=str(interpreter)):
                workspace = self.root / f"cli-{index}"
                workspace.mkdir()
                candidate = workspace / "candidates.json"
                candidate.write_text(
                    json.dumps(self.record()), encoding="utf-8"
                )
                before = candidate.read_bytes()
                cache_before = set(glob.glob(cache_pattern))
                environment = dict(
                    os.environ,
                    PYTHONDONTWRITEBYTECODE="1",
                    PYTHONPATH=str(fake_path),
                )
                result = subprocess.run(
                    [
                        str(interpreter),
                        "-s",
                        "-B",
                        str(script),
                        "--candidates",
                        str(candidate),
                    ],
                    cwd=workspace,
                    capture_output=True,
                    check=False,
                    timeout=60,
                    env=environment,
                )
                self.assertEqual(result.stderr, b"")
                self.assertIn(
                    result.returncode, {EXIT_CLEAR, EXIT_GATES_OPEN}
                )
                self.assertLessEqual(
                    len(result.stdout), preflight.MAX_CLI_OUTPUT_BYTES
                )
                output = json.loads(result.stdout)
                self.assertEqual(output["status"], "inspected")
                self.assertEqual(output["exit_status"], result.returncode)
                self.assertIs(output["authoring_ready"], False)
                self.assertIs(output["hardened_xml_ready"], False)
                self.assertNotIn(
                    str(fake_path), output["environment"]["scan_roots"]
                )
                self.assertFalse(sentinel.exists())
                self.assertEqual(candidate.read_bytes(), before)
                self.assertEqual(list(workspace.iterdir()), [candidate])
                self.assertEqual(set(glob.glob(cache_pattern)), cache_before)
                version = subprocess.check_output(
                    [
                        str(interpreter),
                        "-s",
                        "-B",
                        "-c",
                        "import platform; print(platform.python_version())",
                    ],
                    text=True,
                    timeout=10,
                ).strip()
                self.assertEqual(output["interpreter"]["version"], version)
                if version != platform.python_version():
                    self.assertEqual(
                        output["interpreter_gate"]["status"], "mismatch"
                    )
                    self.assertIn(
                        "version",
                        output["interpreter_gate"]["mismatched_fields"],
                    )
                    self.assertEqual(result.returncode, EXIT_GATES_OPEN)


if __name__ == "__main__":
    unittest.main()
