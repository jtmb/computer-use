# Read-only Office ZIP inspection

[`scripts/office_package.py`](../scripts/office_package.py) is an independently
authored, standard-library-only prerequisite helper. It does **not** create/edit
DOCX/XLSX, parse XML, open hyperlinks, extract files, execute embedded content or
establish converter isolation. It is not an OpenCode-native tool or plugin.
This repository implementation targets Linux/Python3.10+; the exercised
interpreter is `/usr/bin/python3`3.14.4. Other platforms are not accepted here.

## Usage

From this repository, select one exact source and inspect metadata:

```bash
python3 -B scripts/office_package.py /absolute/path/selected.xlsx
```

Exit0 reports `status: inspected`; exit2 reports `status: refused` and a non-quoting
reason. Output includes source/inventory SHA-256, member count, declared expanded
size and named-part feature indicators, never member bodies or a full name list.
An Office suffix requires the expected main part and container relationship/type
parts. That is presence checking, **not** validation of their XML contents.

Every successful summary explicitly says:

```json
{
  "inspection_only": true,
  "xml_inspected": false,
  "payloads_verified": false,
  "external_relationships": "not_inspected",
  "safe_to_render": false,
  "authoring_ready": false
}
```

For a separately authorized parser integration, the Python `read_member(Path,
exact_name, max_bytes=...)` function returns only that member's bytes. It validates
the container first, refuses oversized declared members, counts actual streamed
bytes with a limit-plus-one probe and verifies completed selected reads through
ZipFile's CRC and size checks. It does **not** parse or sanitize those bytes.
A hardened XML parser and reviewed converter sandbox remain separate prerequisites.

## Hard defaults and refusals

| Boundary | Limit / behavior |
| --- | --- |
| Source |32MiB regular file; final symlink/FIFO/directory refused; read-only held descriptor |
| Central directory |512KiB,5000 entries, validated before constructing ZipFile |
| Expansion |50MiB per member,512MiB total declared size,100:1 declared ratio |
| Selected read |8MiB maximum, callers may select less; actual bytes bounded |
| Time |5s cooperative checks; not a kernel-I/O/subprocess interruption guarantee |
| Source races |Descriptor/path inode, size and change timestamps checked before success |
| Names |Traversal, backslashes, drive/colon names, controls/NUL, duplicate and Unicode/case-normalized collisions refused |
| Types/layout |Symlinks/special members, overlapping ranges, local/central mismatches refused |
| Unsupported ZIP |ZIP64, multi-disk, encryption, non-stored/non-deflate codecs, trailing/ambiguous layouts refused |

Budgets may be reduced, not raised through this API. ZIP64 locators are checked
at their absolute position even when the maximum comment pushes them outside the
end-record search window. No file is extracted. Parent symlink traversal and a
hostile filesystem are not sandboxed; source rechecks are not an atomic lock.
Feature flags only indicate recognized names: an absent external-link part does
not establish that relationship XML has no external target. A metadata success
does not verify every compressed payload or certify an Office document.

## Verification — 2026-10-30

The20 real-ZIP tests exercise Office/generic ZIP positives, streamed descriptors,
traversal/alias/NUL/duplicate names, file types, bounds, invalid envelopes/codecs,
CRC versus metadata, overlap, deadlines, real source mutation/replacement, CLI
non-quoting output and descriptor cleanup. Three extra regressions first failed:
hidden ZIP64 locator, forced-small ZIP64 and growth during source hashing. They
pass after the corresponding guards; no dangerous allocation was needed to
demonstrate the hidden-locator defect. All tests use private scratch fixtures.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s scripts -p test_office_package.py -v
```

The suite is required by `node scripts/ci-offline.mjs`. It has no network,
credentials, authoring packages, real-document or desktop dependency. Scratch
setup creates only the approved `/tmp/opencode` directory if absent, preserving
an existing directory and refusing a symlink/non-directory. No source bytecode
is written. Hosted enforcement remains unobserved.

The actual CLI also inspected both earlier trusted Calc workbooks (10 members
each) without rerunning conversion, recalculation or editing:

- baseline source hash `aa85461433a92dfc9a846dd184d1549c6d0e524ee06a07b7d45023987502e3d2`;
- changed-driver source hash `e813db5e10702c702bc9f4b62f2d976149dcc93af5256604e52c8ef457c8ba00`.

Those are metadata/reader observations, not new render or complex-format authoring
acceptance. Existing CSV/Calc evidence and all originals remain preserved.

## Sources and remaining work

### Trusted converter-isolation controls — 2026-10-30

[`scripts/document_sandbox_probe.py`](../scripts/document_sandbox_probe.py) is an
explicit, manual host trial for **fixed, freshly authored trusted fixtures only**.
It accepts no arbitrary source/document argument and is not a document-processing
tool or deployed plugin. Run only when that local host trial is authorized:

```bash
python3 -B scripts/document_sandbox_probe.py --run-trusted-controls
```

Default invocation refuses without creating files or starting services. Trials
retain their two fixtures and JSON receipts in a new private
`~/Documents/computer-use-document-isolation-*` directory. The converter's profile,
temporary files and PDF exist only on the sandbox's private 64 MiB tmpfs; the PDF
is measured and text-checked there, **not exported or visually accepted**.

Observed Bubblewrap 0.11.1, user systemd 259.9, cgroup v2, LibreOffice 26.2.6.3,
Python 3.14.4 and the already installed Python UNO bridge. No installation,
activation, persistent unit, host network-policy change or shared restart occurs.
Required namespace/control failure has no less-isolated fallback.

- Only the fixed input is mounted read-only. Runtime mounts are `/usr`, `/lib`,
  `/lib64`, `/etc/fonts`, `/etc/ld.so.cache` and the installed LibreOffice registry
  file. No home, host `/run/user`, session bus, credential store or host `/proc`.
- Private user/PID/network/IPC/UTS/cgroup namespaces, disabled nested user
  namespaces, dropped capabilities, no-new-privileges, cleared environment and
  new session; all writable work is private. Network denial was actually probed
  against reserved TEST-NET address `192.0.2.1:9`, not an external service.
- Whole-service 256 MiB memory, zero swap, 32 tasks, 30 seconds plus one-second
  stop grace; control-group kill and OOM-kill policy. Each output file has an
  8 MiB bound, core dumps are disabled and descriptors capped at 128.

The retained original five-control receipt is
`~/Documents/computer-use-document-isolation-qeew9our/receipt.json`: all 16 named
boundary checks pass. An actual confined conversion produced a 14,296-byte,
one-page PDF with exact Unicode control text. Aggregate memory was independently
exceeded by **two bounded 160 MiB children** and the owned cgroup was OOM-killed;
the bounded fork control was refused after 29 children (32 tasks including
supervision), and the one-second lifetime control was terminated at 1.003s.
These are actual enforcement observations, not accounting availability.
`namespace-refinement-receipt.json` separately reconfirms all 16 checks with
mandatory explicit user **and cgroup** unsharing rather than their try variants.

The separate `load-policy-receipt.json` in that directory records eight passing
checks from a private-pipe UNO connection inside the same boundary: installed
`NEVER_EXECUTE=0`/`NO_UPDATE=0` constants, actual loaded profile readback of
`DisableMacrosExecution=true`/`DisableActiveContent=true`, and document arguments
read back as `MacroExecutionMode=0`/`UpdateDocMode=0`, read-only state and exact text.
`ReadOnly` is only a UI property; the read-only bind is the source-write boundary.
No host desktop or shared LibreOffice instance was contacted.

Later fixed-fixture receipts in the same directory are also retained:
`link-policy-receipt-2.json` records13checks, including a distinct readable positive
target, observed positive open/openat/openat2 trace, unprimed negative target,
recognized FODT section link, unchanged cached text and no negative-target open.
`macro-policy-receipt-2.json` records9checks: the stored/reloaded ODT retains its
Basic source and OnLoad event, exact text and disabled mode, with no execution
marker. These are real fixed synthetic fixture observations, not arbitrary
untrusted-document acceptance. The macro observation has **no permitted-execution
comparison**, so it does not isolate policy blocking from an inert/uncompilable
macro. The link positive opens a separate document, not the link-update path.
Do not rerun these accepted observations merely to refresh documentation.

The older `*-receipt-1.json` files remain unchanged (including the failed macro
binding attempt and earlier link check names). The original `receipt.json` has
five controls; the separate policy receipts do not prove one current eight-control
full run. None of those historical receipts records a source hash/schema version;
current source identity cannot be retroactively inferred from `accepted:true`.

The first manual trials failed closed on a missing explicit `--unshare-user`,
Bubblewrap's added safe `PWD` variable, missing `/bin/sh` runtime symlink and the
installed registry's symlink into `/etc`. Those were diagnosed, not bypassed:
added mandatory user isolation, checked `PWD=/work`, the `/bin` runtime symlink
and exactly one read-only registry file, never a broad home or `/etc` mount.

The initial [nine offline policy tests](../scripts/test_document_sandbox_probe.py) checked
argument/mount boundaries, explicit live opt-in, control syntax and fail-closed
receipt assessment. Same-sized wrong-name/partial/false receipts and generic
launch failures cannot pass. These run in offline CI; the actual service,
namespace, converter and resource trials **do not** run in offline CI.
Final Ruff lint/format, strict mypy, all eight required offline-CI steps and
repository health pass. Original staged-patch, project-config and lighthouse
image hashes were rechecked unchanged; nothing was committed, pushed or deployed.

**Returned-worker integration:** the suite now has15cases. After reading the
returned failure-receipt/preservation changes, the parent independently ran all15,
Ruff lint/format and strict mypy on both files. Timeouts and missing executables
produce failed receipts instead of escaping before evidence is written; absent
or changed input/sentinel fixtures cannot count as preserved. CI's stale12-case
assertion first failed, then was updated to require15 and explicitly name the
three new failure-path tests. All eight required offline-CI steps pass. This did
not rerun the actual service/converter/resource trials or accept arbitrary inputs.

**Still not accepted:** arbitrary/untrusted macro-bearing or externally linked documents,
hardened XML, all converter formats, full filesystem/kernel escape resistance,
content fidelity, exported output/render review and human acceptance. No seccomp
filter or separate-kernel boundary is claimed. There is no arbitrary/untrusted
document route; the helper intentionally remains a trusted control probe.

UNO policy documentation was checked against the installed constants and schema,
with published 26.8 API pages for
[MediaDescriptor](https://api.libreoffice.org/docs/idl/ref/servicecom_1_1sun_1_1star_1_1document_1_1MediaDescriptor.html),
[MacroExecMode](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1MacroExecMode.html)
and [UpdateDocMode](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1UpdateDocMode.html).
Those pages are newer than installed 26.2; the live readbacks above are the local
compatibility evidence, not acceptance of every newer documented feature.

### ZIP sources and remaining document work

Checked against Python3.14.4 and the public
[Python3.14 ZipFile documentation](https://docs.python.org/3.14/library/zipfile.html)
and [PKWARE APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT),
sections4.3.12/14/15/16. No restricted imported implementation was reused.

The selected Python DOCX/PDF/XLSX authoring and hardened-XML modules are still
absent from `/usr/bin/python3`; installation has its separate approval gate.
The [candidate inventory](document-authoring-candidates-2026-10-30.json) now records
exact versions, selected wheel filenames/declared hashes, Python/license fields
and direct dependencies from nine independently reopened **version-specific** PyPI
JSON endpoints. Parent acquired331,749metadata bytes within2MiB/response and10MiB
aggregate bounds, redirects refused and normal TLS retained; no wheel was fetched
during that metadata pass. A later [defusedxml static review](defusedxml-static-review-2026-10-30.md)
checks one exact25KiB wheel's bytes/license without installing/importing it; the
metadata inventory remains a historical declaration record, not a resolved lock.
The target remains CPython3.14.4/x86_64 with all nine module specs absent.

| Candidate | Version | Declared license basis |
| --- | --- | --- |
| python-docx |1.2.0| MIT string/classifier |
| lxml |6.1.3| BSD-3-Clause string |
| defusedxml |0.7.1| PSFL string/PSF classifier |
| pypdf |6.21.4| BSD-3-Clause SPDX expression |
| pdfplumber |0.11.10| MIT classifier only |
| reportlab |5.1.0| BSD string referring to license.txt |
| openpyxl |3.1.5| MIT string/classifier |
| xlsxwriter |3.3.1| BSD-2-Clause SPDX expression |
| pandas |3.1.0| BSD-3-Clause SPDX expression |

Seven selected wheels are universal; lxml/pandas list regular CPython3.14
manylinux-x86_64 wheels. Those are tags, not tested ABI/glibc/import compatibility.
This is **not a resolved lock or rights approval**: transitive artifacts and their
licenses remain unreviewed. In particular pdfplumber declares pdfminer.six==20260107,
Pillow>=12.2.0 and pypdfium2>=5.9.0; pandas on Python3.14 declares numpy>=2.3.3;
python-docx adds typing_extensions, openpyxl adds et-xmlfile, and reportlab adds
Pillow/charset-normalizer. No extras are selected. The old defusedxml release's
declared range is not a verified3.14 hardening boundary; do not replace it with
plain stdlib XML or remove parser/resource requirements. Distribution bytes,
license files, vulnerabilities, full closure, imports and format tests still need
their actual gates. Existing skill reference versions were not rewritten.

The child disclosed acquiring oversized root metadata before checking its cap;
that run is not accepted as bounded. Parent used only independent exact-version
reads for retained facts, corrected its six-versus-seven universal-wheel count,
and makes no independently verified “latest” claim. Code Mode lacked bounded abort
support and made no request; the parent used bounded standard-library HTTPS instead.
The earlier `/usr/bin/true` namespace prerequisite now has the actual trusted
boundary/conversion/resource and load-policy observations above. Untrusted
macro/link negative controls and a reviewed general converter route remain open.
No untrusted document was opened or converted.

### Transitive metadata candidate graph — 2026-10-31

A separate [transitive candidate graph](document-authoring-transitive-candidates-2026-10-31.json)
extends the nine direct candidates without reacquiring them (direct record SHA256
`304601a716b1b04a1f967676b4325249ffede866837d620940afff2a89c58a7f`, unchanged).
It targets CPython3.14.4/Linuxx86_64 with no extras.

Only official PyPI exact-version JSON carried package metadata; small per-project
release feeds were used only for version discovery. The pass recorded24 HTTP
requests (12 version,12 discovery) and a734,485-byte after-the-fact receipt sum.

**Correction:** an earlier draft said the caps were enforced before reads and
shared across one budget. That was inaccurate. The fetcher checked a present
`Content-Length` before reading, but each `resp.read(65536)` chunk was received
before the per-response/aggregate comparison ran; five separate invocations each
started their counters at zero. The734,485-byte total is a sum of saved receipts,
not one enforced budget, and the raw response bodies were not retained, so the
projections' SHA256 claims cannot be independently reverified from them. No
observed response exceeded2MiB and no receipt sum exceeded10MiB, but hard
pre-acquisition or shared-budget enforcement is not claimed. No reacquisition,
cap increase or batching was used; the observed request/byte history is retained.

Metadata-selected transitive candidates: typing_extensions4.16.0,
pdfminer.six20260107, Pillow13.0.0, pypdfium2 5.14.0, charset-normalizer3.5.2,
et-xmlfile2.0.0, numpy2.5.4, python-dateutil3.0.0, six1.17.0, cryptography50.0.2,
tzdata2026.6 and cffi2.1.1. Exact filenames, declared SHA256s/sizes and wheel
tags are in the JSON.

Every requirement string in the saved projections has an explicit edge:49 of49
(15 included,33 excluded,1 unresolved). The33 excluded split into28 extra-only
edges — 26 for Pillow13's full extras (`docs`, `fpx`, `mic`, `test-arrow`,
`tests`, `xmp`), plus pdfminer.six `image` and cryptography `ssh` — and5
marker-false edges (pypdf and cryptography pre3.11 typing-extensions, pandas
pre3.14 numpy, pandas win32/emscripten tzdata). Exact marker spelling is
preserved. Extra requirement strings for the nine direct nodes were not saved by
the parent record and are not claimed covered.

`pdfminer.six==20260107` selects cryptography and charset-normalizer;
cryptography selects cffi; cffi's `pycparser` edge applies on CPython but remains
**unresolved** because the recorded12-request ceiling was already reached. That
is a recorded stop, not actual closure; no batching, cap increase, root-document
substitute or unofficial source was used.

This is metadata selection, not an installed lock, dependency closure, or
rights/ABI/security approval, and no latestness claim. New transitive wheel
bytes/notices, vulnerability review, glibc/ABI/import and
authoring/format/render/human gates remain open. The pandas3.1.0 notice-selection
refusal (16-member bound) is unchanged; it was not retried or partitioned.

### Selected CFFI wheel provenance and notice — 2026-11-01

The [CFFI artifact record](document-authoring-cffi-wheel-2026-11-01.json) adds actual
bytes for the already-selected2.1.1CP314/Linuxx86_64 wheel:221,525B, matching both
the saved SHA256 and BLAKE2b-256. One HTTPS GET uses an explicitly **derived content
address** from the preserved projection, not a recovered publisher URL or new
release-metadata response. Normal TLS/no redirects/no retries,512KiB body cap and
20s job remain;0new PyPI JSON/feed requests and no spent-budget renewal.

The validated ZIP has34entries/730,993B declared expansion. Four complete members
(METADATA/RECORD/WHEEL/LICENSE) use6214B payload/6218B reserved including probes
under the unchanged16-member/64KiB selected-text ceiling. Their relevant RECORD
hashes/sizes agree; this is internal consistency, not signed build provenance.
Parent reads the complete **MIT No Attribution** permission/disclaimer, including
its opening exception for other LICENSE files/per-file information. That actual
text is stronger than a label but not full native/transitive-rights clearance.

Metadata confirms`pycparser; implementation_name != "PyPy"`; its version/artifact
remains unresolved under the spent metadata allowance. WHEEL declares non-pure,
CP314/manylinux_2_17 tags, not measured ABI/glibc compatibility. The344,680B native
backend is inventory-only, with no payload/linkage/version/security/rights proof
or64KiB scope bypass. Other transitive wheels, pandas notice refusal, lxml named
exceptions and install/author-render-reopen/human gates remain. No candidate code,
tests, install, model/worker, peer, deployment, commit or push runs.

### Remaining transitive wheel bytes and partial notices — 2026-11-01

The [bounded batch record](document-authoring-transitive-wheel-bytes-2026-11-01.json)
adds actual byte evidence for **ten** further retained selections:23,056,157B,
all matching saved size/SHA256/BLAKE2b-256. Ten derived-content-address HTTPS GETs
use normal TLS/no redirects/retries,8MiB per artifact,24MiB aggregate and one20s
job (actual1291ms). No new metadata/feed request, version selection, install or
test occurs. NumPy's declared16,721,710B exceeds this batch's8MiB scope and is
not downloaded; that scoped refusal is not universal infeasibility.

Nine containers pass inventory; Pillow's bytes match but its container refuses
**Member expansion budget exceeded**, with no larger-cap or unguarded retry.
One shared16-member/64KiB selected-payload allowance reserves57,077B and reads
57,061B across typing_extensions, pdfminer.six, et-xmlfile and python-dateutil.
Full selected files/RECORD bindings are preserved, but this is **not four complete
rights approvals**:

| Selection | Actually read notice / remaining boundary |
| --- | --- |
| typing_extensions4.16.0 | Complete layered PSF/BeOpen/CNRI/CWI/0BSD notice; retention/change-summary/no-endorsement/disclaimer terms, not a plain MIT/GPL shortcut |
| pdfminer.six20260107 | Complete MIT notice; retain copyright/permission/disclaimer; actual dependency headers agree |
| et-xmlfile2.0.0 | AUTHORS/metadata only: selector **missed British-spelled LICENCE.python and LICENCE.rst** despite declarations/RECORD; both remain unread, so the MIT label is not clearance |
| python-dateutil3.0.0 | Complete supplied Apache-reference/BSD notice; contributor/other-file applicability is not silently resolved |

Pypdfium2's21-member/202,754B set exceeds the whole bounds; charset-normalizer's
49,575B set does not fit the remaining byte budget. Six/cryptography reach zero
member slots; tzdata's68,153B set exceeds the whole64KiB ceiling. These sets have
**zero payload reads**, no partition, refund or reset. The parent selector defect
is preserved in a separate addendum, not hidden by extra reads or rewritten raw
receipts. Future notice coverage needs declared-License-File reconciliation, both
spellings and inline/native exceptions. All original full-rights/ABI/security/
dependency/installation/XML/author-render-reopen/human gates remain.

### Pillow refusal source trace — 2026-11-01

The [batch record's additive follow-up](document-authoring-transitive-wheel-bytes-2026-11-01.json)
now identifies the earlier refusal's member and guard, rather than leaving them
unknown. The unchanged [reader](../scripts/office_package.py) raises that exact
message at lines164-168 for either member size or declared compression ratio,
before`ZipFile`construction or any selected-member decompression. The original
receipt records only the generic exception, not a partial inventory/traceback.

Read-only checksum/header inspection of the **same retained wheel** finds one
central-directory candidate: entry117 (zero-based116),
`pillow.libs/libXau-154567c4.so.6.0.0`. Its declared2,100,545expanded bytes and
9,389compressed bytes give about**223.724:1**, exceeding the unchanged**100:1**
ratio limit. It is below the16MiB member cap; preceding entries and the
hypothetical total including this entry are below64MiB. Matching whole-wheel and
reader hashes bind this **source-supported inference**, not a new refusal run.

The diagnostic reads7,218,203archive bytes including a whole-artifact checksum
and10,067B central directory, within the original8MiB/256KiB/5s guards (actual55ms).
It does not import/run the reader, instantiate`ZipFile`, open/decompress a member,
accept the container, verify CRC/native contents or spend/reset a notice slot.
The original nine accepted inventories, Pillow refusal and zero selected payload
reads remain unchanged; no larger cap or parser bypass upgrades acceptance.

The ratio cause is now explained, **not repaired or waived**. High compression
alone proves neither malice nor safety, and the member filename does not prove a
linked native version or licence. All original rights/dependency/native/ABI/XML/
authoring/human and installation gates remain. No tests, downloads, source/guard
change, model/child, deployment, commit or push occurs.

### Transitive native declarations and an advisory lead — 2026-11-01

The [qualified native-source record](document-authoring-transitive-native-declarations-2026-11-01.json)
adds four primary documentation reads and one discovery search, **not** another
wheel/member/PyPI/OSV acquisition, test or licence-budget reset.

- Cryptography's [exact50.0.2 changelog](https://cryptography.io/en/50.0.2/changelog/)
  declares wheels compiled with **OpenSSL4.0.3**. Its [versioned installation guide](https://cryptography.io/en/50.0.2/installation/)
  describes statically linked wheels. These are publisher declarations, not
  measured linkage of the saved wheel. Updating/checking host OpenSSL alone
  cannot attest or update a statically bundled copy; no install/build command runs.
- Pypdfium2's [5.14.0 release block](https://github.com/pypdfium2-team/pypdfium2/releases#release-5.14.0)
  declares PDFium pin **8076** and lists `manylinux_x86_64` under its PBIN strategy.
  The full PDFium version, selected-wheel build/patch identity and attestation
  remain unmeasured; the release page's editable notes are not binary proof.
- The [primary CVE-2026-113022 record](https://cveawg.mitre.org/api/cve/CVE-2026-113022)
  describes PDFium memory corruption in **Chrome** before156.0.8078.47. It does
  **not** supply a standalone pypdfium2 affected/fixed range. Do not mechanically
  compare Chrome's custom version entry with PDFium pin8076 or promote an
  unverified search snippet into a wheel-vulnerability verdict. Native revision,
  fix/backport and reachability mapping remain open.

The saved native members are still inventory-only: cryptography's14,396,752B
`_rust.abi3.so` and pypdfium2's7,834,920B`libpdfium.so` are not decompressed or run.
All refused/unread notices and original rights/security/ABI/XML/authoring/human
gates remain. Tool-managed public reads carry no raw-body digest/pre-fetch byte
bound claim; neither native package is cleared or declared vulnerable by this pass.
The source record also reconciles the **already completed10:05:08Z preservation
readback**:11wheel hashes/20saved-text hashes agree, original selected anchors and
raw receipts are unchanged, and the two earlier guide additions reverse exactly.
That dated observation does not hash these later wording additions or prove full
history/settings/media preservation. No model/worker, peer, GUI, deployment,
installation, commit or push occurs.

### Public PDFium advisory follow-up — 2026-11-01

The [same native-source record](document-authoring-transitive-native-declarations-2026-11-01.json)
now records the **completed** follow-up to the revision200 lifecycle review.
Three public fetches out of at most four open the two previously unopened CVE
references: advisory Markdown, issue494352583, and the same advisory's HTML.
The earlier four-fetch declaration epoch and all spent package/notice allowances
remain separate and unchanged.

The [Chrome advisory](https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_02018666648.html)
really contains the article in inert template/noscript blocks; its Markdown
reader omitted it. Local extraction, without page scripts or another fetch,
confirms **CVE-2026-113022: Memory corruption in PDFium**, rated Medium, and the
Chrome156.0.8078.47 Linux release. The target entry links only to
[issue494352583](https://issues.chromium.org/issues/494352583), whose returned
content is **only a Sign in link**. No issue body or patch was obtained; no
HTTP403, private access or reason for that exact restriction is inferred.

The article's other code-host links are a broad`n=10000`Chrome change log and
generic libFuzzer documentation, **not identified CVE fixes**. Neither is fetched
as a substitute, and no fourth fetch is needed merely to spend the allowance.
This is not proof that a public fix exists nowhere else. The saved HTML hash,
complete target entry, access limits and corrected local extraction errors are
retained in the owning record; its template/noscript are not independent sources.

These primary leads are no longer unopened, but selected-wheel fix/backport and
reachability mapping remains **unresolved**. Chrome's affected/fixed version is
not a standalone pypdfium2 range; the wheel is neither cleared nor declared
affected. No package/member acquisition, budget reset, test, installation,
deployment, model/child trial, private sign-in, commit or push occurs.

### Upstream OpenSSL advisory ranges — 2026-11-01

The [native-source record](document-authoring-transitive-native-declarations-2026-11-01.json)
now includes the completed revision205review follow-up: **four bounded public
fetches**, no search, package/member acquisition, OSV query or budget reset.
The [official index](https://openssl-library.org/news/vulnerabilities/) supplies
the [4.0-only view](https://openssl-library.org/news/vulnerabilities-4.0); its
complete saved43-entry range table was read locally, rather than treating the
truncated all-version result as complete coverage.

| Listed4.0affected range | Upstream fixed release | Entries |
| --- | --- | --- |
| >=4.0.0, <4.0.3 | 4.0.3 | 14 |
| >=4.0.0, <4.0.2 | 4.0.2 | 11 |
| >=4.0.0, <4.0.1 | 4.0.1 | 18 |

The [September29advisory](https://openssl-library.org/news/secadv/20260929.txt)
directs4.0users to**4.0.3**, including High**CVE-2026-84782**(DTLS stale-buffer
retransmission) and Moderate**CVE-2026-84783**(concurrent X.509extension-cache
use-after-free). The explicitly linked[DTLS fix](https://github.com/openssl/openssl/commit/d951e02ede8f6a6ff8150546db44b34f0518192c)
shows production changes resetting the retransmission offset and deferring it
during a suspended write. Only the displayed production hunks were reviewed,
not an authenticated Git object, complete patch/test diff or selected-wheel
commit inclusion. No PR, checkout, patch import/application or test run occurs.

**Declared OpenSSL4.0.3is outside those43listed affected ranges.** This is a
dated upstream-version finding, not index completeness, absence of unknown
issues or clearance of the saved cryptography wheel. Its actual bundled bytes,
patches, build options and application reachability remain unmeasured. Host
OpenSSL is not a substitute for the bundled copy. The filtered/unfiltered pages
are one publisher source, not independent corroboration; corrected local field
extraction errors and all43IDs are retained in the owning record.

All original native/transitive rights, dependency, ABI/XML, installation,
author-render-reopen and human gates remain. No wheel/native payload, new
package metadata, test, model/child, private access, deployment, commit or push.

### Selected pypdfium2 release provenance — 2026-11-01

The [native-source record](document-authoring-transitive-native-declarations-2026-11-01.json)
now records the completed revision207 follow-up. Four public discovery fetches
open the [exact tag](https://github.com/pypdfium2-team/pypdfium2/releases/tag/5.14.0),
its HTML and the explicitly linked public asset list, then attempt `matrix.txt`.
The initial Assets33/Loading view was a reader limit, not missing assets. The
complete asset HTML contains33rows/30uploaded release assets and the **exact
selected wheel filename and SHA-256 matching the immutable batch receipt**:
3,799,581B, `11f281613fa22313d9c7ab89947665e84eccf8ebe40e1198a84a88352305648d`.
No second wheel was downloaded or extracted.

The asset list newly exposes three public attestation/strategy references.
A separate three-fetch unit attempts all three, without refunding the four
discovery calls. The actual outcomes are:

| Public reference | Returned evidence |
| --- | --- |
| `matrix.txt` | Unsupported `application/octet-stream`; no body/status supplied |
| `pypdfium2-attestation.json` | Same MIME refusal; no body/status supplied |
| `strategy.json` | Same MIME refusal; no body/status supplied |
| [Release attestation52600866](https://github.com/pypdfium2-team/pypdfium2/attestations/52600866/download) | Sigstore-format bundle; decoded release-inventory statement |

The decoded5,042B statement has31subjects, including the **same selected-wheel
digest**, and predicate type `https://in-toto.io/attestation/release/v0.2`.
Its repository/tag/identifier fields are release inventory, **not an explicit
PDFium source/build mapping**. No signature, certificate/trust chain, timestamp
or transparency verification was performed. The statement digest is not a
raw-response/full-bundle digest; the release-URI SHA1 and displayed tag commit
were not proved equivalent objects or labelled a mismatch.

This ties the saved archive to the publisher-listed release asset, **not to a
verified native build**. Build info still declares pin8076/PBIN; the actual full
PDFium revision/options/backports/reachability and cryptography linkage remain
unmeasured. The three MIME refusals do not prove missing/private content or absent
build fields, and were not retried through another client. All seven calls and
their failures remain spent; original package/notice/source/resource allowances
are unchanged. The earlier unopened-reference wording is historical, not pending
work for these performed reads. All rights/dependency/ABI/XML/install/document/
human gates remain; no tests, package acquisition, runtime operation, delegation,
deployment, commit or push occurs.

### Returned attestation certificate metadata — 2026-11-01

The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
also completes the revision211 review's **existing-certificate** lead, with no
new external fetch. Supported current-session retrieval recovers the exact
completed public attestation result. An initial10-row/page lookup hit a512KiB
caller buffer limit; the changed one-row/page lookup succeeds in15pages/1,281,445B
and4,050ms under unchanged limits. The failure and earlier unknown aggregate
counts are retained, not called an access denial or refunded.

The559B certificate asserts subject **GitHub, Inc. / Attester**, issuer
**GitHub, Inc. / Fulcio Intermediate l1**, and SAN
`https://dotcom.releases.github.com`. Node and host `openssl x509 -text` display
its public metadata and complete six standard extensions. They expose **no
repository, workflow, commit or additional provenance reference**. The SAN is
a release-service assertion, not an authenticated PDFium build identity or a
build-materials link to follow. Encoded validity dates are not verified trust.

This is metadata inspection, **not certificate-chain, DSSE-signature, timestamp
or transparency verification**; the host decoder does not measure the wheel's
bundled library. No package/member read, test, delegation, runtime/deployment,
guard change, commit or push occurs. All previous refusals, rights/native/build/
ABI/document/human and exact approval gates remain.

### DSSE signature integrity, not issuer/build trust — 2026-11-01

The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
adds the completed revision214 integrity check. One exact known-ID current-session
read recovers the existing public bundle; no external refetch/history scan or
software test suite runs. The original5,042B payload and559B certificate hashes
match their earlier observations.

Using exact DSSE pre-authentication encoding and **ECDSA/SHA-256**, the71B DER
signature **does match the included prime256v1 public key**. The record binds the
payload, certificate, signature, public key and5,086B encoded-message digests;
no alternate algorithm/encoding or byte-normalization retry is used (271ms).
Earlier statements that no signature check had occurred remain dated history.

This proves the narrow payload/signature/key relation, **not a trusted issuer,
certificate chain, timestamp/transparency or PDFium build**. The release-inventory
predicate still lacks a native build/materials mapping, and the three metadata
bodies remain MIME-refused. All original package/member/resource limits and
rights/native/ABI/document/human gates remain. No package extraction, new model,
delegation, installation/deployment/security change, commit or push occurs.

### Timestamp metadata and imprint consistency — 2026-11-01

The parent also inspects the remaining already-returned timestamp material,
without waiting for another review or claiming an eighth reviewer verdict.
The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
binds the726B RFC3161 response and169B embedded information. Its SHA-256 message
imprint **matches the DSSE signature's hash**. It encodes time
`2026-10-04T15:19:27Z` and GitHub/TSA name strings, **not authenticated time**.

Exact readback finds a present but **empty0B/0-entry certificate container**.
The bundle does not provide a TSA signer certificate or independently trusted
issuer chain/root in those inspected fields. Names/policy IDs and the separate
release-service certificate cannot supply that authority. This does not prove
no legitimate chain exists elsewhere; no trust root is selected or installed.

The initial bare-CMS format assumption and a later host `openssl ts` input/config
failure are preserved and not blamed on the public response. A pure bounded
metadata decoder resolves the actual structure; no system configuration, guard
or security setting is changed. The earlier DSSE key-match remains true, but
timestamp/issuer/build trust and all native/rights/ABI/document/human gates remain
unverified. No new external fetch, software tests, package extraction, delegation,
deployment, commit or push occurs.

### Official trust policy and distribution — 2026-11-01

The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
records the actual revision218 review and two completed, separate public-document
units: **two searches/eight fetches**, without refunding earlier calls or package
allowances. The [offline guide](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline)
and [trusted-root manual](https://cli.github.com/manual/gh_attestation_trusted-root)
explain trusted inputs, offline revocation limits and securely obtained bootstrap
roots. The [release manual](https://cli.github.com/manual/gh_release_verify)
describes a **GitHub claim about a release/assets**, not automatically a workflow
certificate or native build/materials map. No displayed command was executed.

The [timestamp guide](https://docs.sigstore.dev/cosign/verifying/timestamps/)
names `timestamp.githubapp.com` and requires the TSA certificate chain; the saved
signature-imprint match alone does not supply it. The [custom-components guide](https://docs.sigstore.dev/cosign/system_config/custom_components/)
and [official root-signing project](https://github.com/sigstore/root-signing)
describe embedded bootstrap trust and updated public-good verification material.
That public-good distribution is not silently substituted for GitHub's issuer/TSA.

Fetched `https://tuf-repo.github.com/1.root.json` is **historical TUF metadata**:
version1, encoded expiry `2024-06-23T08:29:18Z`, not an issuer certificate chain.
Its bytes were discovered through a third-party snippet, not authenticated as
a bootstrap root. Past expiry of this historical starting file does **not** prove
the current repository is broken or legitimate root updates impossible. No TUF
bootstrap/update/signature chain is verified and no root is selected or installed.

Official GitHub release-verifier source/distribution references remain a concrete
read-only lead for the actual service/TSA identities. These policy reads are not
an exhaustion claim or a reason to change trust settings. All original failures,
native/rights/ABI/document/human and exact consequential gates remain. No tests,
package extraction, delegation, deployment, commit or push occurs.

### GitHub release-verifier source binding — 2026-11-01

The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
adds revision221's completed **one search/four source fetches**, not repeated after
the reported server restart. The official CLI's release verifier selects GitHub's
trust instance, matches the `https://dotcom.releases.github.com` service name and
requires a signed timestamp. Workflow certificate extensions are not its release
identity requirement. The public-good branch's Rekor/SCT policy is different;
do not invent it as this GitHub branch's missing prerequisite.

The source explicitly associates GitHub's TUF mirror with
`https://tuf-repo.github.com` and an embedded bootstrap-root file. Inspecting those
newly identified metadata/target bytes remains a read-only next lead, **not root
selection or installation**. These are moving upstream source reads, not an
installed CLI run, authenticated bootstrap, trusted time or PDFium build mapping.
All earlier calls/failures/allowances and actual native/rights/human gates remain;
no tests, package extraction, delegation, deployment, commit or push occurs.

### Recovered GitHub material and conditional integrity — 2026-11-01

The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
completes the concrete metadata/issuer/TSA/root-update leads from revisions222-226.
Fourteen new public reads are separately accounted; no earlier call, failed read
or package allowance is refunded. The31,645B authority file exactly matches its
published checksum. It contains actual GitHub issuer/TSA certificate paths, not
just names or the earlier empty embedded timestamp certificate container.

| Evidence layer | Observed result |
| --- | --- |
| Timestamp CMS signature | ECDSA/SHA-384 match against the exact issuer/serial-selected TSA key; signed-content digest and signer-certificate binding also match |
| Release and TSA certificates | Signature links, issuer identifiers, encoded-time windows and selected key-use/path-length/critical-extension constraints agree |
| GitHub metadata | Root3→9 successive old/new signature thresholds match; final root and timestamp/snapshot/targets have future encoded expiry at the recorded time; target size/hash match |
| Next root | Exact `10.root.json` returns404; no repeat or later-version request |
| PDFium build and full acceptance | **Still unproved**; the release inventory is not a native build/materials map |

The first root check used the wrong string encoding for PEM line breaks and
returned0matching signatures. The opened [TUF specification](https://theupdateframework.github.io/specification/latest/)
links the exact canonical-format definition: preserve line breaks, escape only
quote/backslash. The corrected calculation matches without changing algorithms,
dropping fields or overlooking final expiry. The initial failure stays recorded.

These results are **conditional on the inspected bootstrap reference**, not a
self-granted decision to trust or install it. No system trust setting changes,
installed CLI run, software tests, package extraction, delegation or deployment
occurs. Current native build/linkage/fixes, complete rights/dependencies/ABI/XML,
document/human acceptance and every original exact authority gate remain. No
commit or push occurs; completed public reads are not replayed after the restart.

### Exact-version advisory screen — 2026-10-31

The [dated OSV record](document-authoring-vulnerability-screen-2026-10-31.json)
queries only the21already-selected public PyPI name/version pairs. One read-only
batch request sends1,496bytes and returns76bytes in534ms under a shared192KiB/
30second/3-data-request ceiling; normal TLS and redirect refusal remain. The
original request structure and exact response text have independently checked
SHA256/size receipts. Each of21ordered result slots is empty with no pagination
token. No advisory-detail request, PyPI metadata request, wheel download,
candidate import or installation occurs.

This narrows one dated advisory-database question; it is **not security approval**.
The official [batch contract](https://google.github.io/osv.dev/post-v1-querybatch/)
guarantees result ordering and describes per-query pagination. Its
[query contract](https://google.github.io/osv.dev/post-v1-query/) uses normalized
PyPI names and fuzzy version matching. Empty slots do not establish version
recognition, database freshness, absence of vulnerabilities or unpublished issues;
no known-affected positive-control query ran. Bundled PDFium/OpenSSL/XML/XSLT/image/
numeric-library identities and advisories remain unreviewed. This pass does not
resume or replace the spent PyPI budget, resolve`pycparser`, approve pandas notices,
close dependency/artifact/rights/ABI/XML/format gates or establish human acceptance.

Six [offline evidence contracts](../scripts/document-security-contract.test.mjs)
retain all candidate inputs, raw-byte digests, pagination and explicit non-promotion
of security/runtime/installation claims. They run in required CI after an actual
omitted-registration failure; they do not rerun OSV or authenticate its coverage.

### Packaged native version headers — 2026-10-31

The [local header observation](document-authoring-native-header-facts-2026-10-31.json)
narrows the XML/XSLT identity question without loading candidate code. The existing
5,099,355-byte lxml6.1.3wheel matches SHA256`c6c0c131…e1a8`. The accepted stdlib
ZIP reader reads only`lxml/includes/libxml/xmlversion.h`(5112bytes) and
`lxml/includes/libxslt/xsltconfig.h`(2910bytes), under the recorded per-member/
aggregate/deadline guards. In363ms,8022selected header bytes declare libxml2
**2.14.6** and libxslt **1.1.43**, with consistent numeric/string version macros.
Full wheel/member hashes and exact limits are retained; source identity is unchanged.

These are **packaged-header declarations**, not proof that the wheel's extension
links those versions, that all bundled libraries are identified, or that those
versions are safe. No extraction, candidate import/execution, download or native
advisory query occurs. Linked binary versions, ABI, transitive notices/rights and
security review remain unresolved; the earlier PyPI OSV query does not screen
these native libraries. The exhausted metadata pass,`cffi → pycparser`edge and
16-member pandas notice refusal remain unchanged. Offline evidence contracts
preserve those qualifications; they do not independently authenticate the wheel.

### Native advisory ranges and release-note limits — 2026-10-31

The [declaration-only advisory record](document-authoring-native-advisory-screen-2026-10-31.json)
is a distinct follow-up, not a repeated PyPI OSV query or a wheel-safety verdict.
Parent opens all four primary CNA records independently of the returned research
report. The declared libxml2 2.14.6falls inside published ranges for
[CVE-2025-49794](https://cveawg.mitre.org/api/cve/CVE-2025-49794)(`<2.15.0`) and
[CVE-2025-7425](https://cveawg.mitre.org/api/cve/CVE-2025-7425)(`<2.15.2`); declared
libxslt1.1.43falls inside
[CVE-2025-7424](https://cveawg.mitre.org/api/cve/CVE-2025-7424)(`<1.1.44`).
[CVE-2026-0989](https://cveawg.mitre.org/api/cve/CVE-2026-0989)publishes Red Hat
product entries, not a GNOME upstream range, so that declaration is unclassified.
The7425title/description names libxslt while its CNA upstream product is libxml2;
do not silently rewrite the product or assume the component/backport mapping.

**Range boundaries are not automatically first-fixed releases.** Child GitLab
release-page reads return406. Parent instead opens distinct public GNOME
distribution documentation, not those denied pages. The
[1.1.45notes](https://download.gnome.org/sources/libxslt/1.1/libxslt-1.1.45.news)
include the1.1.44section(Nov23,2025)explicitly fixing7424; direct1.1.44news returns404.
The [2.14.5notes](https://download.gnome.org/sources/libxml2/2.14/libxml2-2.14.5.news)
describe Schematron memory-safety fixes and
[2.14.6notes](https://download.gnome.org/sources/libxml2/2.14/libxml2-2.14.6.news)
name an atype-corruption guard, but neither identifies the reviewed CVE IDs.
Exact backport applicability therefore remains unresolved, not inferred from
similar wording. The [2.14.0notes](https://download.gnome.org/sources/libxml2/2.14/libxml2-2.14.0.news)
also document the ELF soname change to`libxml2.so.16`and restricted binary
compatibility; they do not establish this wheel's linked ABI or build options.

This strengthens the unresolved native-security gate; it neither proves the
wheel vulnerable nor clears it. Linked versions/patches, reachability, remaining
advisories, rights and ABI need separate proof. Schema/XSLT-specific descriptions
are not evidence that ordinary parsing is safe. Parent makes12primary fetches;
the child reports2search/6fetch calls, not independently transcript-audited counts.
These tool-managed reads have no pre-fetch byte-bound or retained raw-body digest
claim. No package/archive download, import, exploit, parser run, installation or
change to candidate pins occurs; exhausted metadata and other gates stay intact.

### Selected wheel resource rights and loading — 2026-10-31

The [static resource observation](document-authoring-native-resource-facts-2026-10-31.json)
binds the same5,099,355-byte wheel/source hash and188-entry inventory. The existing
bounded ZIP reader reads all26,072bytes of exactly three resources: `RNG2Schtrn.xsl`,
`XSD2Schtrn.xsl` and `iso-schematron.rng`. Full source/inventory hashes match before
and after; the selected text copies and factual receipt are hash-readback preserved
under Documents`lxml-resource-rights-8b1w4mt1` (receipt`d80cc87b…3512e41`). Actual
observation83ms, with unchanged8MiB archive/256KiB directory/5000entry/16MiB member/
64MiB expanded limits,16selected-member ceiling,64KiB selected aggregate and5s
per-call/20s cooperative job checks. Only these texts are copied, not the whole
archive; no candidate code is imported or executed and no XML parser runs.

Both transforms named **unlicensed** by the full wheel notice are actually
present. Parent reads their complete texts: author/change attribution is present,
but no permission grant is observed in those two texts. The ISO schema instead
contains its own2015ISO/IEC permission, notice/disclaimer retention and specified
modified-copy nonconformance notice. That distinct grant does not grant rights to
the two transforms or establish full distribution compliance. Other resource,
bundled-library and dependency rights remain unresolved; no replacement license,
resource deletion, installation or distribution approval is inferred.

Each selected transform contains two static `document()` call sites using schema
include/external-reference locations (RELAX-NG) or include/import/redefine
`schemaLocation` (XSD), including recursive inclusion. This substantiates the
need for separate XSLT resource-access controls; the calls are **not executed**,
and this is neither a network attempt nor a demonstrated exploit. Initial parser
DTD/entity flags alone are not evidence of a safe later transformation.

Inventory also identifies seven`.so`members by name/declared size only, not ELF
contents, linked library versions or ABI. Three exact GPL-runner path queries
are absent, **not a general GPL-content absence proof**. Full rights/security/
ABI/XML/authoring/render/human gates, exhausted metadata pass, unresolved
`cffi → pycparser` and the16-member pandas notice refusal remain unchanged.

### Exact transform licensing provenance — 2026-11-01

The [rights-provenance follow-up](document-authoring-transform-rights-2026-11-01.json)
opens the release-commit-pinned lxml notice and both exact transform sources.
The notice explicitly excepts these author-copyrighted, **unlicensed** resources
from its general BSD statement. The current generic lxml homepage is not an
exact6.1.3resource grant and does not override the named exceptions. Existing
3172B/`39b79bb0…31a7`and4563B/`430791ac…ec0d`saved copies still match the prior
complete resource observations; public displayed text is not a new raw-byte
digest/build-signature comparison.

The original author's[2004article](https://www.xml.com/pub/a/2004/02/11/relaxtron.html?page=5)
offers the RNG transform through a Topologi ZIP link. This establishes an author/
distribution lead, not an observed reuse grant for the later selected resources.
XML.com's[copyright policy](https://www.xml.com/about/copyright/)is not a blanket
resource license. One HTTPS-only **HEAD** of that exact historic download path
fails local DNS resolution; no body/archive is downloaded, redirect followed,
HTTP downgrade or retry attempted. This is not proof of global unavailability or
that the archive contains no rights information.

The[CSL utilities README](https://github.com/citation-style-language/utilities)
expressly excludes this file from its MIT utilities because its license is
unknown. Public PTXdist/OpenEmbedded review shows why checksum-selected author
comments or aggregate recipe labels are not grants. These downstream statements
are context, not author authority. One guessed lxml license-page404 and an Arch
bot challenge are retained without retry/bypass or source-absence inference.

This separate investigation makes12public fetch attempts, three searches and one
failed header-only request; **zero PyPI requests**, tests, transforms, installs,
rightsholder messages or peer actions. No resource is removed or relabeled. An
applicable authoritative grant/clarification or separately approved functional
alternative is still needed; no universal legal-absence/prohibition or complete
stack-rights approval is claimed. All native/security/ABI/XML/notice/human gates
and the existing metadata allowance/pandas refusal remain.

### Selected ELF-prefix observation — 2026-11-01

The [static ELF-prefix record](document-authoring-native-elf-prefix-facts-2026-11-01.json)
advances the seven native entries beyond the earlier name/size-only inventory,
without loading them. One actual parent job reads exactly4096bytes from each
selected member:28,672returned payload bytes in100ms. The same retained5,099,355B
wheel/source/inventory hashes agree before/after. No candidate import/execution,
binary extraction, XML parse, install, network request or test occurs.

All seven prefixes identify ELF64, little-endian, `ET_DYN`/`EM_X86_64`, with nine
program headers, four load segments and a GNU/type3note descriptor. These are
stored fields, not a full ELF validity, loader, CPython/glibc ABI or security
verdict. The [ELF header](https://gabi.xinuos.com/elf/02-eheader.html),
[program-header](https://gabi.xinuos.com/elf/07-pheader.html),
[dynamic-linking](https://gabi.xinuos.com/elf/08-dynamic.html) and
[machine registry](https://gabi.xinuos.com/elf/a-emachine.html) were opened to check
the interpretation. Those separate public tool-managed fetches have no claimed
pre-fetch byte bound and do not replenish the spent PyPI allowance.

The existing8MiB archive/256KiB directory/5000entry/16MiB member/64MiB expansion/
16selected/64KiB aggregate/5s-per-call/20s-job bounds stay unchanged. The64KiB
payload allowance is shared across all seven reads, not reset. All members are
deflated, and the nearest complete `PT_DYNAMIC` segment ends at114,408bytes;
the others end as far as4,995,424bytes. Even the smallest section-header table
starts at119,264bytes. This job therefore does not seek/decompress-discard past
the budget to inspect dynamic/string/version tables or use a larger default.
It leaves36,864bytes unspent, not an exhausted/failed full-library scan.

Partial prefixes do **not** complete member CRC verification. `DT_NEEDED`,
RPATH/RUNPATH, symbol versions, statically bundled library identities/backports and
actual loader/ABI compatibility remain unverified; no absence is inferred. Full
rights/security/XML/authoring/render/reopen/human and exact installation gates,
unresolved`cffi → pycparser`and pandas16-member refusal remain unchanged. This
qualifies the current bounded sequential method, not every future static design.

### Wheel manifests and release backport provenance — 2026-11-01

The [manifest/provenance record](document-authoring-wheel-provenance-2026-11-01.json)
adds actual complete reads of the retained wheel's exact `WHEEL`(151B)and
`RECORD`(15,144B):15,295selected bytes in69ms, under the same reduced reader/job
bounds. Filename tags match both declared CPython3.14/manylinux x86-64 tags;
`Generator` declares setuptools84.0.0 and `Root-Is-Purelib:false`. RECORD's174rows
declare all seven prior native sizes/hashes. Their full hashes are **not**
measured by the earlier4096Bprefixes, so no false full/prefix comparison is made.
Five declarations instead match the prior complete three-resource/two-header
observations. The manifest CRC/size/source checks complete; this is not a signed
publisher record, all-member verification or loader/ABI result.

The metadata-coverage follow-up finds188ZIPentries:14directories and174regular
files, with174RECORDrows, no missing/extra regular paths and no non-self declared
size mismatch. Only the exact`RECORD.jws`/`RECORD.p7s`paths were absent; no general
signature, attestation or provenance absence is inferred. Its15,144B/104ms RECORD
reread overlaps the earlier manifest payload, so those byte counts are not unique
content totals. Neither observation verifies every member's CRC/hash.

**Supporting-read limitation:** the original manifest script used uncapped
`Path.read_text`for three prior fact JSON files, without its own identity recheck.
The later bounded16,435Breservation(including probes)binds the current8756B ELF,
5582B resource and2094B header fact identities. It does not retroactively repair
the original acquisition claim; the wheel/member reader bounds alone do not cover
all supporting-file reads.

**New specific backport evidence:** the official
[6.1.3 changelog](https://lxml.de/changes-6.1.3.html), in its6.1.1section, says Linux
wheels use patched libxslt1.1.43 fixing CVE-2025-7424 and CVE-2025-11731. The public
tag resolves through unsigned annotated object`9d4b2d4e…2361`to
commit`3c1a4c7f2d5a3c19efe01adfd3c33ac3c8fe52c1`. Parent separately reads that
commit's workflow, `pyproject.toml`, `buildlibxml.py` and exact backport patch.
The Linux recipe selects libxml2 2.14.6/libxslt1.1.43, enables static dependencies,
and maps libxslt1.1.43 to the included patch after unpacking. This narrows the
earlier7424backport ambiguity at **publisher/source-recipe level**, not proof
that the selected binary contains the fix or that1.1.43is generically safe.

No source archive/patch is executed or applied. The recipe's static archives also
mean `DT_NEEDED` alone would not establish incorporated native-library identity.
The libxml2 advisory/backport/component questions remain unresolved; a libxslt
patch does not resolve49794/7425or the prior0989product-scope limit. The newly
named11731has no new CNA/runtime review here. Source-body fetches are tool-managed,
not pre-byte-bounded or a signed wheel build attestation. The spent PyPI budget
is unchanged; no new wheel, install, test, model, worker or peer action occurs.
All full rights/security/ABI/XML/authoring/render/reopen/human gates remain.

One exact unauthenticated public release-metadata lookup at
`https://api.github.com/repos/lxml/lxml/releases/tags/lxml-6.1.3`returns404.
It was not retried or escalated; it does not establish missing official
distribution or provenance. The record now counts17public fetch attempts,
16successful and this one failure, plus two searches.

#### Later advisory-mapping follow-up — 2026-11-01

Ten additional public fetch attempts(nine successful, one406)and two focused
searches narrow the earlier source-level unknowns; the fact record's cumulative
research counts are now27attempts/25successes/two failures and four searches.

- The newly opened[11731CNA record](https://cveawg.mitre.org/api/cve/CVE-2025-11731)
  declares libxslt below1.1.44 affected and describes the EXSLT document-node type
  confusion. This is consistent with lxml's already-read patch/release claim,
  not proof of the selected binary.
- [Debian's49794tracker](https://security-tracker.debian.org/tracker/CVE-2025-49794)
  and an accepted OpenEmbedded backport explicitly associate the Schematron fix
  with commit`71e1e8af…bd7b`. That is a named CVE-to-patch reference, not verified
  containment in the selected libxml2 2.14.6 source or wheel. Direct upstream
  access to that exact commit returns406; no retry or access bypass occurs.
- [Red Hat](https://access.redhat.com/security/cve/cve-2025-7425)and
  [Debian](https://security-tracker.debian.org/tracker/CVE-2025-7425)explain7425as
  underlying libxslt behavior with a possible libxml2 mitigation. Debian names a
  2.14branch mitigation and its`2.14.5+dfsg-0.1`sid landing. This helps reconcile
  component labels; a distro landing is not bare upstream or wheel proof.
- Official[2.15.2news](https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.2.news)
  explicitly names the0989RelaxNG include-limit fix;
  [Debian](https://security-tracker.debian.org/tracker/CVE-2026-0989)also names
  its commit. This advances the earlier upstream-fix-unknown description at
  release-reference level, not the prior CNA's missing upstream range, an
  earliest fixed branch version or this wheel's2.14.6backport state.

The old advisory record is unchanged. No upstream patch/fixture is applied or
executed, no candidate is loaded and no tests run. Source-level mappings,
selected-binary provenance, actual loader/ABI and full rights/security/XML/human
acceptance remain distinct. Repeating unchanged failed reads or duplicate
searches would not supply the missing binary or operational evidence.

#### Retained METADATA reconciliation — 2026-11-01

The exact retained`lxml-6.1.3.dist-info/METADATA`is reread for reconciliation:
3279B/SHA256`aad89f8107bc74045b86c9b7f7c0984196102520dd7faed5e4e45693b7c315ef`.
Its hash/size matches the reread RECORD row. This distinct job uses18,423selected
bytes/108ms with the same64KiBaggregate ceiling and unchanged reader/job bounds;
the15,144B RECORD portion overlaps earlier reads, not new unique content.

It declares metadata2.4, lxml6.1.3, `Requires-Python:>=3.8`, no base dependency and
four extra-guarded requirements: cssselect>=0.7, html5lib, BeautifulSoup4 and
lxml_html_clean. The five extras names match the saved direct/transitive records;
none is selected here. Those records deliberately retained only base requirements
for direct nodes: their zero lxml string counts describe the saved projection,
not all wheel requirements. The graph already documents that limit; this new
observation supplements it without changing the graph or executing a resolver.

`License:BSD-3-Clause`remains a string, not `License-Expression`; no license
classifier is present. The two declared license files are present by ZIP metadata.
These headers do not override the prior complete notice's unlicensed-transform
finding or native/transitive/resource rights gates. No license payload is reread,
extra enabled, candidate imported, network request made, test run or installation
authorized. Supporting108,019Breservation(including probes)binds the two saved
candidate records, resource facts, pre-append provenance and unchanged reader;
it does not repair the earlier uncapped supporting reads or prove actual ABI.

**Historical overlap:** the earlier notice-review receipt already preserved the
same3279B/`aad89f81…315ef`METADATA. A bounded readback of that saved copy and its
2300B/`3aa4d9e2…29672`receipt agrees. This reconciliation adds explicit RECORD
binding and candidate comparison, not first acquisition; its payload is not new
unique historical content. Five small wheels and ReportLab likewise already had
metadata reviews below and were not repeated merely to refresh their evidence.

### Retained pandas declaration-only observation — 2026-11-01

The [pandas metadata record](document-authoring-pandas-metadata-2026-11-01.json)
adds one actual exact METADATA read:18,156B/380ms, SHA256
`b2b43910a5ef734a08be961df9c484f4664ad9ec2fa5a08294d0edfa08bcdd4b`.
The original12,029,136Bwheel/inventory hashes agree before/after. Its original
16MiBarchive/64KiBselected-text limits remain, with47,380Bunspent. The152,207B
RECORD exceeds the whole64KiBceiling and was not read, sliced or reset around;
no RECORD-hash binding is claimed. Selected METADATA CRC/size/source checks pass.

Version3.1.0, Python>=3.11, BSD-3-Clause SPDX expression, extras names and all five
non-extra dependency strings match the saved candidates. The82Requires-Dist
headers group lexically into five without an extra marker and77with one; this is
not marker evaluation, a full optional-string review or resolver execution.
No extra is selected. Nineteen License-File declarations are names, not grants.

This separate dependency/declaration observation reads **zero notice payloads**.
It does not partition, reopen or replace the historical16-member notice refusal,
abbreviate full notices or approve pandas/native/transitive rights. Candidate
records and all original refusals remain unchanged. There is no test, candidate
import/execution, network/PyPI request, installation, model/worker or peer action.

### Future receipt provenance — source only

#### Exact-version metadata reader — offline source acceptance, 2026-10-31

The new [stdlib reader](../scripts/document_metadata.py) and
[39offline tests](../scripts/test_document_metadata.py) address future acquisition,
not the earlier pass's unpreserved raw bodies or exhausted request ceiling. A
caller shares one `JobBudget`: fixed maximum2MiB/response,10MiB/job,12requests,
5s socket timeout and60s cooperative deadline. Test limits can only reduce these
ceilings; the public policy property cannot be reassigned. Concurrent/reentrant
acquisitions on one budget refuse rather than spend the same allowance twice.

Each read is sized by remaining byte allowance, partial failures stay charged,
and an exact-cap body refuses without a one-byte overread. Status, exact release
URL, declared length, strict UTF-8 and package/version identity are checked before
success. Results retain raw bytes and their source digest for caller preservation.
Normal TLS and redirect refusal remain; no package artifact or candidate code is
imported. This is a library, not a registered OpenCode tool, CLI or resolver.

Parent review first found real limit-expansion, late-EOF, framing, over-return,
encoding and spent-budget defects beyond the child's30tests, then corrected them
with failing regressions. A separate overlap regression also failed before a
nonblocking job guard was added. A later parent regression caught100KiB exception
messages echoing untrusted name/version fields; those errors now remain static
and bounded. All39cases pass; required offline CI includes
the suite after a genuine missing-registration failure. Ruff/mypy remain absent,
so no lint or strict-type pass is claimed. Fake transports do not establish live
PyPI acceptance, and cooperative time checks cannot preempt a stuck system call.
No new network request ran; replacing a spent budget to continue the same pass
is not authorized, and no library success grants acquisition/installation rights.

The parent independently reviewed the returned read-only gap analysis, then added
three initially failing offline regressions. Current19/19 tests pass: individual
outcomes now retain schema1, before/after probe-file hashes, exact payload digest
and expected boolean-check names (resource predicates remain in the hashed probe).
Changed/unavailable source refuses acceptance; unavailable source starts no service.
Complete receipts name all eight controls and explicitly deny macro-causal proof,
link-update-path positive testing and retained generated-document bytes. The payload
hash binds embedded fixture-generation code, not the generated ODT/FODT bytes.

One follow-up regression first reproduced a green combined receipt whose
individually stable controls named a different probe epoch. Combined receipts now
require before/after probe identity and every control's evidence to agree; the
same-source positive still passes. This is a reporting correction, not a new
control or permission grant.

These are sampled file identities, not signatures, atomic CAS, exact loaded Python
code or runtime-dependency attestation. No new host trial ran, no historical receipt
was regenerated/retired, and no permissive macro policy or script resolution was
added. The19tests include mocked service boundaries; they do not establish live
acceptance of this changed receipt writer. The required CI contract pins the four
new regression names as well as the count. Current Ruff/mypy checks could not run
because their executables/modules are unavailable; earlier passes remain dated
evidence, not a pass for this update. No dependency was installed to hide that gap.
The final required offline CI passes8/8, including20ZIP/18probe checks. Independent
baseline comparison verifies all fixed control programs/profile/resource limits
are unchanged and90malformed/refusal assessments agree; all nine historical
fixture/receipt hashes remain unchanged. Coverage retains75IDs/10lanes with no
input/mapping/review errors; its known archive-plan mismatch still causes exit1.
Complex round-trip/form/cache/appearance/render/human acceptance and untrusted
converter isolation remain unfinished. Keep following the
[shared artifact contract](../.opencode/skills/files-and-documents/references/local-artifacts.md).

### XML guidance integration — source only

The shared contract now carries the independently verified static review's
version-qualified DTD defaults, custom-parser flag bypass, full failure-family
and untrusted-exception reporting caveats, separate XInclude/schema-fetching
prohibitions and external resource/version-test requirements. It rejects deprecated
facades and experimental global monkeypatching without importing the package or
copying its implementation. Consumer environments must verify their own version;
the reviewed release is not a universal requirement or a host compatibility claim.

Parent reviewed both returned files and independently ran17guidance/13adjacent
portability contracts. An isolated scratch copy with the pre-change reference
gave14pass/3fail; no canonical reference was temporarily swapped. Parent also
corrected wording that conflated XInclude resource loading with schema fetching,
after reproducing a failing assertion. The17current checks are wording/routing
contracts, not actual parsing, malicious-input resistance, model compliance or
deployed guidance. Existing package-installation/import/runtime/format/human gates
remain open; no accepted converter control was rerun.

### Five additional wheel-license observations — 2026-10-30

Parent acquired only the exact selected python-docx1.2.0, pypdf6.21.4,
pdfplumber0.11.10, openpyxl3.1.5 and xlsxwriter3.3.1 wheels from their reopened
version-specific PyPI records. All filenames, declared sizes and actual SHA256s
match the unchanged [candidate record](document-authoring-candidates-2026-10-30.json)
(record SHA256304601a7). This adds actual artifact-byte evidence for these five,
not a replacement for that earlier metadata-only record or its historical flags.

Transport acquired1,224,817bytes total (69,860JSON and1,154,957wheel bytes), below
64KiB/JSON,512KiB/wheel and2MiB aggregate bounds, with normal TLS verification,
redirect refusal,5second socket timeout and30second cooperative acquisition deadline.
Elapsed1.010s. The existing ZIP reader applied reduced512KiB archive/128KiB directory/
1000entry/1MiB member/8MiB total/64KiB selected-read/5second bounds. It validated
the container before selected reads; only the exact license and METADATA member
were streamed per wheel, with completed CRC/size/source rechecks. No tree extraction
or downloaded-source import, compilation or execution occurred.

Parent read all five complete license texts and the relevant METADATA headers:

| Exact distribution | Observed full notice | Observed conditions, not blanket approval |
| --- | --- | --- |
| python-docx1.2.0 | MIT;2013Steve Canny | Retain copyright and permission notice; warranty/liability disclaimer |
| pypdf6.21.4 | Three-clause BSD text; Mathieu Fenniak and named contributors | Retain source notice/conditions/disclaimer; reproduce for binaries; no author endorsement without permission |
| pdfplumber0.11.10 | MIT;2015Jeremy Singer-Vine | Retain copyright and permission notice; warranty/liability disclaimer |
| openpyxl3.1.5 | MIT;2010openpyxl | Retain copyright and permission notice; warranty/liability disclaimer |
| xlsxwriter3.3.1 | BSD2-Clause;2013–2026John McNamara | Retain source notice/conditions/disclaimer; reproduce for binary distribution |

The openpyxl METADATA explicitly warns its default parsing lacks XML-attack
protection; its suggestion to install another package is not runtime verification
or installation authority. XlsxWriter's compatibility prose is likewise not a
measured format-fidelity result. Direct dependency headers match the candidate
record; at this checkpoint transitive artifacts/licenses, lxml/reportlab/pandas full notices,
vulnerability/ABI/import/parser/round-trip/render/human acceptance remain open.
No restricted imported document helper was reused, no third-party implementation
was copied into this repository, and no project license was changed. License-text
observations are not legal advice or full-stack distribution approval.

All21selected acquisition/wheel/member/report files, including unchanged full
copyright/notices, are preserved at
`~/Documents/computer-use-native-host-20261029/authoring-license-review-BARWsH/`.
Exclusive receipt SHA256:
`c4e3377a6cb65c69a793c2e28b513bb84b2e26c0f9ecdd7df5e4624a618c0b4f`.
All copied hashes were read back and matched; originals remain under
`/tmp/opencode/authoring-license-review-6lgotrdn/`. No package installation,
environment repair, deployment or actual authoring operation follows.

### Remaining wheel notice review — 2026-10-30

The three remaining predeclared artifacts (lxml6.1.3, reportlab5.1.0,
pandas3.1.0) now match their exact candidate filenames, sizes and SHA256s.
Acquisition used normal TLS, no redirects,256KiB per exact-version JSON,
16MiB per wheel,24MiB aggregate,5second socket and60second cooperative bounds
declared before requests. Actual transport:19,373,065bytes in1.340seconds;
19,147,138wheel bytes and225,927JSON bytes. This is new artifact evidence,
not a rewrite of the earlier metadata-only record (SHA256304601a7).

Reduced ZIP limits were16MiB archive/256KiB directory/5000entries/16MiB member/
64MiB declared expanded/64KiB selected text read/5seconds. All three containers
passed inventory checks; this does not verify every payload. Only five exact
dist-info text members were read: lxml METADATA/LICENSE.txt/LICENSES.txt and
ReportLab LICENSE/METADATA. Their complete saved notices and metadata were read
by the parent, with no binary/package-source member import, execution or extraction.

| Artifact | Principal notice observed | Important unresolved conditions |
| --- | --- | --- |
| lxml6.1.3,5,099,355bytes | BSD3-Clause,2004Infrae; retain source/binary notices, no endorsement, disclaimer | LICENSES.txt also names ElementTree/PSF components, GPL test-runner and schematron exceptions, including resources described as unlicensed. Binary-wheel notice names zlib, iconv under LGPL2.1, libxml2/libxslt/libexslt and their notices. These are not erased by the principal BSD label; complete bundled/transitive rights and source/redistribution obligations are unresolved |
| reportlab5.1.0,2,018,647bytes | Three-clause BSD text; retain source/binary notices, no endorsement, disclaimer | Full notice says2000–2024 while METADATA says2000–2025; both are preserved unchanged. Pillow/charset-normalizer and optional extras are not resolved or approved here |
| pandas3.1.0,12,029,136bytes | **No notice member read** | Container inventory1720entries/43,774,982declared expanded bytes passed. Notice selection exceeded the fixed16-member bound and refused before any member read. No batch partition, larger limit or abbreviated license approval substitutes for that refusal |

Lxml's METADATA changelog says6.1.3 fixes default external-parameter-entity
parsing; that package-authored statement is not an independently measured parser
or security result. Neither metadata's safety wording nor the acquired wheel
establishes hardened XML, ABI compatibility or authoring readiness.

All12unchanged wheels/JSON/selected texts/report files are preserved under
`~/Documents/computer-use-native-host-20261029/remaining-wheel-notices-nCRdUp/`,
exclusive receipt SHA256
`3aa4d9e2a8a7e45f8f64f3931faf6297c112eb5d01141036d476642a97629672`.
Copies were hash-read back; originals remain in
`/tmp/opencode/remaining-wheel-notices-cyx2jo4p/`. The report's generic pandas
`inspectionRefused` field refers to selection, **not** a failed container check.
No candidate JSON flags were changed, package installed/imported, implementation
copied into this repository, or license/distribution/runtime approval inferred.
Pandas notice review, complete dependency closure, rights/security/ABI/import/XML,
representative format/render/reopen and human acceptance remain unfinished.

### Dependency-presence preflight — independently checked source

[`document_authoring_preflight.py`](../scripts/document_authoring_preflight.py)
observes the exact invoked interpreter, selected distribution identity headers
and regular top-level module paths. It invokes no package finder/import, resolver,
installer, converter or authoring library and writes no files. This is a custom
read-only prerequisite utility, not a native OpenCode feature or deployed tool.

```bash
python3 -s -B scripts/document_authoring_preflight.py
```

The optional `--candidates /absolute/path/record.json` selects a strict declaration
record; the default is the existing nine-candidate JSON. `-s` disables user-site
discovery for this invocation and `-B` prevents bytecode writes. Without `-s`, the
helper respects the interpreter's actual enabled user-site setting. Normal Python
startup is not sandboxed or attested by this utility.

| Boundary | Refusal or reporting limit |
| --- | --- |
| Candidate JSON |1MiB regular file, no-follow/nonblocking open, device/inode/size/time rechecks |
| Discovery |16roots,4096direct site entries, selected `.dist-info/METADATA` only;64KiB each |
| Paths |Final symlinks/FIFOs/special files refuse or cannot count as presence; duplicate records remain ambiguous |
| Time |One shared5second cooperative deadline across candidate/metadata/module observations; kernel I/O is not interrupted |
| CLI output |512KiB; overflow becomes bounded refusal, not truncated success |
| Scope |No working-directory/PYTHONPATH/other-interpreter scan; no `.egg-info`, RECORD, wheel or package-source reads |

Exit0 means only that all nine declared versions have metadata plus regular module
paths and the interpreter matches. Exit1 leaves presence/interpreter/scan gates
open; exit2 refuses input/usage/deadline/output. Even exit0 always reports
`authoring_ready:false` and `hardened_xml_ready:false`; rights, transitive closure,
actual artifact bytes, import/ABI/runtime and document-format gates stay unverified
by this helper. Its dotted-version validation is deliberately narrower than PEP440.
Parent-directory traversal is not sandboxed and file rechecks are not atomic locks.

Parent read the entire1105-line source and original1166-line hardening suite,
then reviewed the follow-up test changes. The original17green tests missed four
parent-reproduced failures: FIFO metadata hang, oversized metadata, cached import
finder execution and duplicate same-version ambiguity. Corrected21tests grew to35
shared-deadline/root/entry/header/symlink/output checks. The last offline-safety
regression first failed when `-s` was omitted against a synthetic HOME/userbase;
parent independently reproduced that failure without modifying canonical files.
All36current tests pass on both CPython3.14.4 and3.11.15, zero skips. Missing3.11
uses a tested invoked-interpreter fallback, not a skipped or invented second-host
result. Parent also removed a test assumption that the host must lack python-docx
and bounded the two interpreter-query subprocesses at10seconds.

Actual `-s -B` CLI observations:3.14.4 emits15,833bytes/exit1, interpreter pass,
all9missing;3.11.15 emits15,935bytes/exit1 with version/SOABI/interpreter mismatch,
also9missing. Both readiness flags remain false. Independent Ruff/mypy commands
fail because those modules are absent; no lint/format/strict-type pass is claimed.

The36-case suite is now required by offline CI beside20ZIP/19probe tests, with
named positive/failure regressions and `-s -B` subprocess isolation. The CI contract
first failed with the missing suite; final17CI contracts and all8required steps
pass. No live converter control, parser/import or installed-client check ran.

Fifteen selected current source/test/guide files, including this accepted preflight,
CI integration and memory kind-string correction, were preserved under
`~/Documents/computer-use-native-host-20261029/preflight-memory-integration-lq4jEO/`.
Exclusive receipt SHA256:
`46f68167a7f5d02b533e0ea35afd82a46de5d3d6c64252ec1bec82b00f97a747`.
The guide snapshot predates this receipt-link paragraph; immutable copied hashes
describe that selected checkpoint, not every subsequent documentation revision.
