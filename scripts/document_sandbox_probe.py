"""Run fixed trusted document-isolation controls, never arbitrary documents."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

BOUNDARY_CONTROL = r"""
import errno, json, os, resource, socket
from pathlib import Path
checks = {}
checks["input_readable"] = Path("/input/control.txt").read_text() == "Sandbox control: café 42\n"
checks["host_sentinel_hidden"] = not Path(HOST_SENTINEL).exists()
checks["home_hidden"] = not Path("/home/james").exists()
checks["runtime_bus_hidden"] = not Path("/run/user").exists()
checks["environment_cleared"] = set(os.environ) <= {"PATH", "HOME", "TMPDIR", "LANG", "LC_CTYPE", "PWD"} and os.environ.get("PWD") == "/work"
checks["capabilities_dropped"] = "CapEff:\t0000000000000000" in Path("/proc/self/status").read_text()
checks["no_new_privileges"] = "NoNewPrivs:\t1" in Path("/proc/self/status").read_text()
checks["private_process_view"] = len([p for p in Path("/proc").iterdir() if p.name.isdigit()]) <= 4
checks["private_network"] = {name for _, name in socket.if_nameindex()} == {"lo"}
with socket.socket() as connection:
    connection.settimeout(0.2)
    checks["network_denied"] = connection.connect_ex(("192.0.2.1", 9)) in {errno.ENETUNREACH, errno.EHOSTUNREACH}
for label, path in [("runtime_read_only", "/usr/document-control-write"), ("input_read_only", "/input/control.txt")]:
    try:
        with open(path, "ab") as output: output.write(b"must-not-write")
    except OSError as error:
        checks[label] = error.errno == errno.EROFS
    else:
        checks[label] = False
Path("/work/positive").write_text("private scratch works")
checks["private_scratch_writable"] = Path("/work/positive").read_text() == "private scratch works"
checks["scratch_size_bounded"] = os.statvfs("/work").f_blocks * os.statvfs("/work").f_frsize == 67108864
checks["core_disabled"] = resource.getrlimit(resource.RLIMIT_CORE) == (0, 0)
checks["single_file_bounded"] = resource.getrlimit(resource.RLIMIT_FSIZE) == (8388608, 8388608)
print(json.dumps(checks, sort_keys=True), flush=True)
raise SystemExit(0 if all(checks.values()) else 2)
"""

CONVERSION_CONTROL = r"""
import hashlib, json, subprocess
from pathlib import Path
profile = Path("/work/profile/user")
profile.mkdir(parents=True)
profile.joinpath("registrymodifications.xcu").write_text(PROFILE)
result = subprocess.run(["/usr/bin/soffice", "-env:UserInstallation=file:///work/profile", "--headless", "--norestore", "--nodefault", "--nofirststartwizard", "--convert-to", "pdf:writer_pdf_Export", "--outdir", "/work", "/input/control.txt"], capture_output=True, timeout=20)
pdf = Path("/work/control.pdf")
if result.returncode or not pdf.is_file():
    print(json.dumps({"conversion": False, "exit": result.returncode, "stderr": result.stderr.decode(errors="replace")[:2000]}))
    raise SystemExit(2)
metadata = subprocess.run(["/usr/bin/pdfinfo", str(pdf)], capture_output=True, check=True, timeout=3).stdout.decode()
text = subprocess.run(["/usr/bin/pdftotext", str(pdf), "-"], capture_output=True, check=True, timeout=3).stdout.decode()
checks = {"conversion": True, "one_page": "Pages:           1" in metadata, "exact_control_text": "Sandbox control: café 42" in text, "pdf_header": pdf.read_bytes().startswith(b"%PDF-")}
print(json.dumps({"checks": checks, "pdf_bytes": pdf.stat().st_size, "pdf_sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(), "limits": "trusted fixed text only; no visual or macro/link adversarial acceptance"}, sort_keys=True))
raise SystemExit(0 if all(checks.values()) else 2)
"""

PROFILE = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting">
<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>
<prop oor:name="DisableActiveContent" oor:op="fuse"><value>true</value></prop>
</item></oor:items>
"""

UNO_BOOTSTRAP = r"""
import json, subprocess, time
from pathlib import Path
import uno
from com.sun.star.connection import NoConnectException
profile = Path("/work/profile/user")
profile.mkdir(parents=True)
profile.joinpath("registrymodifications.xcu").write_text(PROFILE)
office_command = ["/usr/bin/soffice", "-env:UserInstallation=file:///work/profile", "--headless", "--norestore", "--nodefault", "--nofirststartwizard", "--accept=pipe,name=document_control;urp;StarOffice.ComponentContext"]
if globals().get("TRACE_LINKS", False):
    office_command = ["/usr/bin/strace", "-f", "-e", "trace=open,openat,openat2", "-o", "/work/office-trace", *office_command]
office = subprocess.Popen(office_command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
until = time.monotonic() + 10
while True:
    try:
        remote = resolver.resolve("uno:pipe,name=document_control;urp;StarOffice.ComponentContext")
        break
    except NoConnectException:
        if office.poll() is not None or time.monotonic() > until: raise
        time.sleep(0.05)
def prop(name, value):
    item = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
    item.Name, item.Value = name, value
    return item
manager = remote.ServiceManager
provider = manager.createInstanceWithContext("com.sun.star.configuration.ConfigurationProvider", remote)
settings = provider.createInstanceWithArguments("com.sun.star.configuration.ConfigurationAccess", (prop("nodepath", "/org.openoffice.Office.Common/Security/Scripting"),))
checks = {"macros_disabled_readback": settings.getPropertyValue("DisableMacrosExecution") is True, "active_content_disabled_readback": settings.getPropertyValue("DisableActiveContent") is True}
never = uno.getConstantByName("com.sun.star.document.MacroExecMode.NEVER_EXECUTE")
no_update = uno.getConstantByName("com.sun.star.document.UpdateDocMode.NO_UPDATE")
checks["never_execute_constant"] = never == 0
checks["no_update_constant"] = no_update == 0
if not all(checks.values()): raise RuntimeError("Load policy settings were not honored")
desktop = manager.createInstanceWithContext("com.sun.star.frame.Desktop", remote)
"""

LOAD_POLICY_CONTROL = (
    UNO_BOOTSTRAP
    + r"""
document = desktop.loadComponentFromURL("file:///input/control.txt", "_blank", 0, (prop("Hidden", True), prop("ReadOnly", True), prop("MacroExecutionMode", never), prop("UpdateDocMode", no_update), prop("PickListEntry", False), prop("RepairPackage", False)))
arguments = {item.Name: item.Value for item in document.getArgs()}
checks["loaded_read_only"] = document.isReadonly() is True
checks["macro_mode_readback"] = arguments.get("MacroExecutionMode") == 0
checks["update_mode_readback"] = arguments.get("UpdateDocMode") == 0
checks["exact_loaded_text"] = "Sandbox control: café 42" in document.Text.String
document.close(True)
desktop.terminate()
office.wait(timeout=3)
print(json.dumps(checks, sort_keys=True))
raise SystemExit(0 if all(checks.values()) else 2)
"""
)

LINK_POLICY_CONTROL = (
    "TRACE_LINKS=True\n"
    + UNO_BOOTSTRAP
    + r"""
options = (prop("Hidden", True), prop("ReadOnly", True), prop("MacroExecutionMode", never), prop("UpdateDocMode", no_update), prop("PickListEntry", False), prop("RepairPackage", False))
target = Path("/work/external-control.txt")
target.write_text("EXTERNAL_TARGET_MARKER\n")
positive_target = Path("/work/trace-positive.txt")
positive_target.write_text("TRACE_POSITIVE_MARKER\n")
positive = desktop.loadComponentFromURL(positive_target.as_uri(), "_blank", 0, options)
checks["positive_control_readable"] = "TRACE_POSITIVE_MARKER" in positive.Text.String
checks["target_matches_positive_permissions"] = (target.stat().st_mode, target.stat().st_uid, target.stat().st_gid) == (positive_target.stat().st_mode, positive_target.stat().st_uid, positive_target.stat().st_gid)
positive.close(True)
trace = Path("/work/office-trace")
baseline = trace.read_text()
checks["trace_detects_positive_open"] = '"/work/trace-positive.txt"' in baseline
checks["negative_target_not_primed"] = '"/work/external-control.txt"' not in baseline
linked = Path("/work/linked-control.fodt")
linked.write_text('''<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:body><office:text><text:p>Linked document control</text:p>
<text:section text:name="external"><text:section-source xlink:href="file:///work/external-control.txt" text:filter-name="Text"/><text:p>CACHED_LINK_MARKER</text:p></text:section>
</office:text></office:body></office:document>''')
document = desktop.loadComponentFromURL(linked.as_uri(), "_blank", 0, options)
section = document.TextSections.getByName("external")
checks["external_link_recognized"] = section.FileLink.FileURL == target.as_uri()
checks["cached_content_preserved"] = "CACHED_LINK_MARKER" in document.Text.String
checks["external_content_not_loaded"] = "EXTERNAL_TARGET_MARKER" not in document.Text.String
checks["loaded_no_update"] = {item.Name: item.Value for item in document.getArgs()}.get("UpdateDocMode") == no_update
document.close(True)
desktop.terminate()
office.wait(timeout=3)
checks["no_external_target_open"] = '"/work/external-control.txt"' not in trace.read_text()[len(baseline):]
print(json.dumps(checks, sort_keys=True))
raise SystemExit(0 if all(checks.values()) else 2)
"""
)

MACRO_POLICY_CONTROL = (
    UNO_BOOTSTRAP
    + r"""
marker = Path("/work/macro-must-not-run")
if marker.exists(): raise RuntimeError("Control marker existed before trial")
source = '''Sub BlockedOnLoad
 Dim channel As Integer
 channel = FreeFile
 Open "/work/macro-must-not-run" For Output As #channel
 Print #channel, "unexpected macro admission"
 Close #channel
End Sub
'''
script_url = "vnd.sun.star.script:Standard.Probe.BlockedOnLoad?language=Basic&location=document"
created = desktop.loadComponentFromURL("private:factory/swriter", "_blank", 0, (prop("Hidden", True), prop("MacroExecutionMode", never)))
created.Text.String = "Macro control: keep this exact text"
libraries = created.BasicLibraries
library = libraries.getByName("Standard") if libraries.hasByName("Standard") else libraries.createLibrary("Standard")
library.insertByName("Probe", source)
uno.invoke(created.Events, "replaceByName", ("OnLoad", uno.Any("[]com.sun.star.beans.PropertyValue", (prop("EventType", "Script"), prop("Script", script_url)))))
created.storeAsURL("file:///work/macro-control.odt", (prop("FilterName", "writer8"), prop("Overwrite", False)))
created.close(True)
document = desktop.loadComponentFromURL("file:///work/macro-control.odt", "_blank", 0, (prop("Hidden", True), prop("ReadOnly", True), prop("MacroExecutionMode", never), prop("UpdateDocMode", no_update), prop("PickListEntry", False), prop("RepairPackage", False)))
libraries = document.BasicLibraries
libraries.loadLibrary("Standard")
checks["embedded_source_preserved"] = libraries.getByName("Standard").getByName("Probe") == source
event = {item.Name: item.Value for item in document.Events.getByName("OnLoad")}
checks["onload_event_recognized"] = event.get("EventType") == "Script" and event.get("Script") == script_url
checks["macro_mode_readback"] = {item.Name: item.Value for item in document.getArgs()}.get("MacroExecutionMode") == never
checks["exact_loaded_text"] = document.Text.String == "Macro control: keep this exact text"
document.close(True)
desktop.terminate()
office.wait(timeout=3)
checks["execution_marker_absent"] = not marker.exists()
print(json.dumps(checks, sort_keys=True))
raise SystemExit(0 if all(checks.values()) else 2)
"""
)

RESOURCE_CONTROLS = {
    "memory_limit": r"""
import os, time
print("aggregate-memory-negative-control", flush=True)
for _ in range(2):
    if os.fork() == 0:
        blocks = [bytearray(1024 * 1024) for _ in range(160)]
        time.sleep(3)
        os._exit(0)
for _ in range(2): os.wait()
raise SystemExit("Memory control unexpectedly survived")
""",
    "task_limit": r"""
import errno, json, os, time
children = []
blocked = False
try:
    for _ in range(40):
        try: child = os.fork()
        except OSError as error:
            if error.errno != errno.EAGAIN: raise
            blocked = True
            break
        if child == 0:
            time.sleep(2)
            os._exit(0)
        children.append(child)
finally:
    for child in children: os.waitpid(child, 0)
print(json.dumps({"fork_refused": blocked, "bounded_attempts": 40, "children": len(children)}))
raise SystemExit(0 if blocked else 2)
""",
    "runtime_limit": 'import time; print("runtime-negative-control", flush=True); time.sleep(4)',
}

BOUNDARY_CHECKS = {
    "input_readable",
    "host_sentinel_hidden",
    "home_hidden",
    "runtime_bus_hidden",
    "environment_cleared",
    "capabilities_dropped",
    "no_new_privileges",
    "private_process_view",
    "private_network",
    "network_denied",
    "runtime_read_only",
    "input_read_only",
    "private_scratch_writable",
    "scratch_size_bounded",
    "core_disabled",
    "single_file_bounded",
}


def expected_checks(name: str) -> set[str]:
    """Return exact boolean-check names, excluding resource outcome predicates."""
    if name not in {
        "trusted_conversion",
        "boundaries",
        "load_policy",
        "link_policy",
        "macro_policy",
    }:
        return set()
    expected = (
        {"conversion", "exact_control_text", "one_page", "pdf_header"}
        if name == "trusted_conversion"
        else BOUNDARY_CHECKS
    )
    if name == "load_policy":
        expected = {
            "macros_disabled_readback",
            "active_content_disabled_readback",
            "never_execute_constant",
            "no_update_constant",
            "loaded_read_only",
            "macro_mode_readback",
            "update_mode_readback",
            "exact_loaded_text",
        }
    if name == "link_policy":
        expected = {
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
        }
    if name == "macro_policy":
        expected = {
            "macros_disabled_readback",
            "active_content_disabled_readback",
            "never_execute_constant",
            "no_update_constant",
            "embedded_source_preserved",
            "onload_event_recognized",
            "macro_mode_readback",
            "exact_loaded_text",
            "execution_marker_absent",
        }
    return expected


def accepted(name: str, result: subprocess.CompletedProcess[bytes]) -> bool:
    """Require the expected outcome, not merely nonzero exit for a negative trial."""
    if name in {"memory_limit", "runtime_limit"}:
        marker = "oom-kill" if name == "memory_limit" else "timeout"
        start = (
            b"aggregate-memory-negative-control"
            if name == "memory_limit"
            else b"runtime-negative-control"
        )
        return (
            result.returncode != 0
            and start in result.stdout
            and f"Finished with result: {marker}".encode() in result.stderr
        )
    if result.returncode != 0:
        return False
    try:
        value = json.loads(result.stdout)
    except (ValueError, UnicodeError):
        return False
    if not isinstance(value, dict):
        return False
    if name == "task_limit":
        children = value.get("children")
        return (
            value.get("fork_refused") is True
            and type(children) is int
            and 0 < children < 32
        )
    expected = expected_checks(name)
    if not expected:
        return False
    checks = value.get("checks") if name == "trusted_conversion" else value
    return (
        isinstance(checks, dict)
        and checks.keys() == expected
        and all(item is True for item in checks.values())
    )


def command(job: Path, payload: str, *, seconds: int = 30) -> list[str]:
    """Build a fail-closed invocation for an owned fixed-control job.

    Args:
        job: Private scratch directory containing only this probe's fixtures.
        payload: Trusted constant control program, never document/user code.
        seconds: Whole-service lifetime; constrained to this probe's bounds.

    Returns:
        Argument vector with no shell expansion, shared profile or writable host.
    """
    if not job.is_absolute() or type(seconds) is not int or not 1 <= seconds <= 30:
        raise ValueError("Expected an absolute private job and bounded lifetime")
    arguments = [
        "/usr/bin/systemd-run",
        "--user",
        "--wait",
        "--pipe",
        "--collect",
        "--no-ask-password",
        "--expand-environment=no",
        "--property=MemoryMax=268435456",
        "--property=MemorySwapMax=0",
        "--property=TasksMax=32",
        f"--property=RuntimeMaxSec={seconds}s",
        "--property=TimeoutStopSec=1s",
        "--property=KillMode=control-group",
        "--property=OOMPolicy=kill",
        "--property=LimitCORE=0",
        "--property=LimitFSIZE=8388608",
        "--property=LimitNOFILE=128",
        "--property=NoNewPrivileges=yes",
        "--",
        "/usr/bin/bwrap",
        "--die-with-parent",
        "--new-session",
        "--unshare-all",
        "--unshare-user",
        "--unshare-cgroup",
        "--disable-userns",
        "--cap-drop",
        "ALL",
        "--clearenv",
        "--setenv",
        "PATH",
        "/usr/bin",
        "--setenv",
        "HOME",
        "/work/home",
        "--setenv",
        "TMPDIR",
        "/work/tmp",
        "--setenv",
        "LANG",
        "C.UTF-8",
    ]
    for directory in ["/usr", "/lib", "/lib64"]:
        arguments.extend(["--ro-bind", directory, directory])
    for path in [
        "/etc/fonts",
        "/etc/ld.so.cache",
        "/etc/libreoffice/registry/main.xcd",
    ]:
        arguments.extend(["--ro-bind", path, path])
    arguments.extend(
        [
            "--symlink",
            "usr/bin",
            "/bin",
            "--dev",
            "/dev",
            "--proc",
            "/proc",
            "--size",
            "67108864",
            "--tmpfs",
            "/work",
            "--dir",
            "/work/home",
            "--dir",
            "/work/tmp",
            "--symlink",
            "/work/tmp",
            "/tmp",
            "--ro-bind",
            str(job / "control.txt"),
            "/input/control.txt",
            "--chdir",
            "/work",
            "--",
            "/usr/bin/python3",
            "-I",
            "-B",
            "-c",
            payload,
        ]
    )
    return arguments


FIXTURES = ("control.txt", "host-only-sentinel")


def fixture_digests(job: Path) -> dict[str, str | None]:
    """Hash host fixtures, recording a missing file instead of aborting the receipt.

    Args:
        job: Absolute private scratch directory owning this probe's fixtures.

    Returns:
        File name to SHA-256 digest, or None when the fixture is absent.
    """
    digests: dict[str, str | None] = {}
    for name in FIXTURES:
        path = job / name
        digests[name] = (
            hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        )
    return digests


def fixtures_preserved(
    before: dict[str, str | None], after: dict[str, str | None]
) -> bool:
    """Require every fixture to still exist with the digest recorded before the trial."""
    return after == before and all(value is not None for value in after.values())


def probe_digest() -> str | None:
    """Sample this source's identity; unavailable bytes cannot establish provenance."""
    try:
        return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    except OSError:
        return None


def run_control(name: str, job: Path, payload: str) -> dict[str, object]:
    """Run one bounded control, turning a launch failure into a failed outcome.

    A hung or unlaunchable unit must produce an honest failed receipt rather than
    an uncaught exception, and it never falls back to weaker isolation.

    Args:
        name: Fixed control name understood by ``accepted``.
        job: Absolute private scratch directory for the control.
        payload: Fixed trusted control program, never document input.

    Returns:
        Serializable outcome whose ``accepted`` value is never true on an error.
    """
    before = probe_digest()

    def finish(outcome: dict[str, object]) -> dict[str, object]:
        """Retain failed outcomes and refuse a source change across execution."""
        after = probe_digest()
        unchanged = before is not None and before == after
        outcome["evidence"] = {
            "schema_version": 1,
            "probe_sha256_before": before,
            "probe_sha256_after": after,
            "source_unchanged": unchanged,
            "payload_sha256": hashlib.sha256(payload.encode()).hexdigest(),
            "expected_checks": sorted(expected_checks(name)),
            "resource_predicate_in_probe": name in RESOURCE_CONTROLS,
        }
        if not unchanged:
            outcome["accepted"] = False
        return outcome

    if before is None:
        return finish({"accepted": False, "error": "probe source unavailable"})
    try:
        result = subprocess.run(
            command(job, payload, seconds=1 if name == "runtime_limit" else 30),
            capture_output=True,
            timeout=40,
            check=False,
            env={
                "PATH": "/usr/bin:/bin",
                "XDG_RUNTIME_DIR": f"/run/user/{os.getuid()}",
                "LANG": "C.UTF-8",
            },
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as error:
        return finish(
            {
                "accepted": False,
                "error": "timeout",
                "stdout": (error.stdout or b"").decode(errors="replace"),
                "stderr": (error.stderr or b"").decode(errors="replace"),
            }
        )
    except OSError as error:
        return finish(
            {
                "accepted": False,
                "error": f"{type(error).__name__}: {error}",
                "stdout": "",
                "stderr": "",
            }
        )
    return finish(
        {
            "accepted": accepted(name, result),
            "exit": result.returncode,
            "stdout": result.stdout.decode(errors="replace"),
            "stderr": result.stderr.decode(errors="replace"),
        }
    )


def main() -> int:
    """Print evidence from explicitly selected trusted controls; no document input."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-trusted-controls", action="store_true")
    arguments = parser.parse_args()
    if not arguments.run_trusted_controls:
        parser.error(
            "Explicit --run-trusted-controls is required; not an offline CI check"
        )
    job = Path(
        tempfile.mkdtemp(
            prefix="computer-use-document-isolation-", dir=Path.home() / "Documents"
        )
    )
    source = job / "control.txt"
    source.write_text("Sandbox control: café 42\n", encoding="utf-8")
    sentinel = job / "host-only-sentinel"
    sentinel.write_text("not mounted inside the sandbox\n")
    before = fixture_digests(job)
    controls = {
        "boundaries": f"HOST_SENTINEL={str(sentinel)!r}\n" + BOUNDARY_CONTROL,
        "trusted_conversion": f"PROFILE={PROFILE!r}\n" + CONVERSION_CONTROL,
        "load_policy": f"PROFILE={PROFILE!r}\n" + LOAD_POLICY_CONTROL,
        "link_policy": f"PROFILE={PROFILE!r}\n" + LINK_POLICY_CONTROL,
        "macro_policy": f"PROFILE={PROFILE!r}\n" + MACRO_POLICY_CONTROL,
        **RESOURCE_CONTROLS,
    }
    probe_before = probe_digest()
    outcomes: dict[str, object] = {}
    for name, payload in controls.items():
        outcome = run_control(name, job, payload)
        outcomes[name] = outcome
        if outcome["accepted"] is not True:
            break
    after = fixture_digests(job)
    preserved = fixtures_preserved(before, after)
    probe_after = probe_digest()
    probe_preserved = (
        probe_before is not None
        and probe_before == probe_after
        and all(
            isinstance(value, dict)
            and isinstance(value.get("evidence"), dict)
            and value["evidence"].get("source_unchanged") is True
            and value["evidence"].get("probe_sha256_before") == probe_before
            and value["evidence"].get("probe_sha256_after") == probe_before
            for value in outcomes.values()
        )
    )
    success = (
        len(outcomes) == len(controls)
        and all(
            isinstance(value, dict) and value["accepted"] is True
            for value in outcomes.values()
        )
        and preserved
        and probe_preserved
    )
    receipt = {
        "schema_version": 1,
        "status": "passed" if success else "failed",
        "scratch": str(job),
        "unexecuted_controls": sorted(set(controls) - set(outcomes)),
        "expected_controls": list(controls),
        "probe_sha256_before": probe_before,
        "probe_sha256_after": probe_after,
        "probe_source_preserved": probe_preserved,
        "source_preserved": after.get("control.txt") is not None
        and after.get("control.txt") == before.get("control.txt"),
        "host_fixtures_preserved": preserved,
        "fixtures": {"before": before, "after": after},
        "controls": outcomes,
        "untrusted_documents_accepted": False,
        "visual_acceptance": False,
        "macro_causal_blocking_established": False,
        "link_update_path_positive_tested": False,
        "generated_document_bytes_retained": False,
    }
    (job / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    return 0 if success else 2


if __name__ == "__main__":
    raise SystemExit(main())
