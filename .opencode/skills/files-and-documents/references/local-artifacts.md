# Local artifact contract

Read this file before using any local DOCX, PDF, XLSX, or CSV workflow below.
It defines the shared safety, preservation, and verification rules. Format
specific steps live in the sibling references.

## Scope and rights basis

This guidance is independently authored from public format and library
documentation plus inspection of the tools actually present on this host. It does
not copy or paraphrase an imported helper implementation. The inspected imported
document bundle carries a notice that prohibits extraction, copying, and
distribution; no text or code from it is reused here. No rights-cleared reuse
occurred, so no third-party notice is carried into these files. No license is
claimed for this skill.

Do not treat a reference as proof that an authoring library is installed. The
source host had copy-based conversion and rendering tools, but the Python
authoring libraries below are absent. Installing any package is a separate,
explicitly approved prerequisite.

## Tool baseline checked 2026-10-29

This is dated evidence from the source host, not a consumer requirement. Recheck
the consumer's actual environment before choosing any executable, version or
dependency route; installed tools can differ without making the skill invalid.

| Capability | Verified state | Use |
|---|---|---|
| `file` 5.46 | present | identify actual container type |
| `sha256sum` | present | record source and output hashes |
| `zipinfo` 3.00 / `unzip` 6.00 | present | bounded listing and single-entry streaming |
| LibreOffice `soffice` 26.2.6.3 | present | copy-based conversion to PDF |
| Poppler `pdfinfo`, `pdftotext`, `pdftoppm` 26.01.0 | present | PDF metadata, text, page images |
| `timeout` | present | bound converter and parser runs |
| Python 3.14.4 standard library `csv`, `zipfile` | present | CSV and container inventory |
| `python-docx`, `lxml`, `defusedxml` | absent | DOCX authoring or XML parsing |
| `pypdf`, `pdfplumber`, `reportlab` | absent | PDF forms, extraction, authoring |
| `openpyxl`, `xlsxwriter`, `pandas` | absent | XLSX inspection or authoring |

Commands in these references were checked against the local binaries and manual
pages. Conversion and rendering commands are documented invocations, not executed
acceptance evidence. A version check does not prove document fidelity.

An approved authoring prerequisite must record the interpreter path, package name,
exact version, source or hash, and a successful import check. Do not use an
unpinned "latest" requirement or a global install. This slice does not install
anything; the absent packages remain blockers until that approval exists.

Use an approved project or user destination for final artifacts and an approved
private scratch directory for intermediates. Do not invent a home-directory,
Desktop, XDG, or system temporary path. Use one new private directory per job so
concurrent work cannot share a LibreOffice profile or output prefix.

## Preserve the source

1. A read-only request must not create, rewrite, export, or normalize a file in
   the source or final destination tree. Record the input path, byte size, and
   SHA-256 first. Authorized scratch rendering is separate; an explicit no-writes
   instruction also forbids those scratch outputs.
2. Create or edit only into a new output path. Never save over the source and never
   treat an in-place library save as preservation.
3. Write the candidate to a temporary file in the destination directory, close
   and verify it, then rename it into place. If the destination already exists and
   is a different file, stop instead of overwriting.
4. Keep the original until the user accepts the result. An interrupted write must
   leave the source unchanged and must not leave a plausible partial output under
   the final name.
5. Do not silently remove comments, revisions, macros, signatures, metadata,
   hidden sheets, named ranges, or embedded objects as "cleanup". Report them and
   require a separately scoped change when removal is actually required.

Basic identity checks:

```bash
file -- "$SRC"
sha256sum -- "$SRC"
```

The double dash protects a path that begins with `-`. If the consumer's shell or
`file` build does not support it, use an absolute path instead.

## Treat DOCX and XLSX packages as untrusted ZIP containers

Before any parser opens the package, inspect only its directory. Do not extract
the whole archive into a shared directory.

```bash
zipinfo -1 "$SRC"
unzip -l "$SRC"
```

Refuse or stop for review when any of these appear:

- absolute paths, a Windows drive prefix, `..` components, backslash traversal, or
  NUL bytes in an entry name;
- symlink or special-file entries, encrypted entries, duplicate names, or names
  that normalize to the same destination;
- an entry count, total uncompressed size, or compression ratio above the job's
  declared bound;
- a declared uncompressed size that cannot fit the available scratch space.

Record the bound before listing. For a small office document, a starting review
bound of 5,000 entries, 512 MiB declared uncompressed size, and a 100:1
compression ratio is reasonable; lower it when the expected file is small. A
larger limit needs a concrete reason, not just a failed first attempt.

Zip Slip is a real extraction risk: an archive name such as
`../../outside.txt` can overwrite files when extraction joins the name without
validation. Listing is safer than extracting. If an entry must be read, stream
exactly the expected member through a verified hard decompression-byte bound to
the hardened parser rather than unpacking everything. Directory sizes are
untrusted; a declared size or downstream output truncation is not that bound.
If no verified bounded reader exists, fail closed before parsing untrusted
contents instead of using unbounded `unzip -p`.

If a library requires paths on disk, validate every entry first and extract into
a new empty private directory with no overwrite behavior. Never use an extraction
flag that overwrites existing files. Delete only that job's private scratch after
verification.

Use package inventory as an integrity baseline. Record the member list and a
digest of important parts before and after an edit. A writer that drops a part is
a failed edit, not a successful simplification.

## Treat embedded XML and relationships as untrusted

- Reject a `DOCTYPE` declaration when the parser supports rejecting it.
- Disable external entity resolution, external DTD loading, and network access.
  Treat an unsupported hardening setting as a configuration failure.
- Keep XInclude disabled unless the task explicitly requires it and the source is
  trusted; XInclude can load resources independently of DTD handling.
- Bound input size, entity expansion, node count, and parse time. A hardened
  parser still needs resource limits. For a small office document, a 50 MiB input
  cap and a 30-second parse limit are defensible starting points; record the
  chosen values.
- Never follow an external relationship target, hyperlink, attached file, or
  remote template. Preserve external relationships as data or report them.
- Never execute macros, JavaScript, embedded objects, or active content.

The standard-library XML APIs are not a general untrusted-XML boundary. The
hardened `defusedxml` interfaces are absent here; do not claim protection from a
plain `ElementTree` call. If a parser cannot be configured safely, refuse the
file and report the missing prerequisite.

## Harden XML parsing against a verified version, not a default

Parser hardening defaults are version-specific. In the one statically reviewed
0.7.1 source, the DTD prohibition defaulted to off while the entity and external
reference prohibitions defaulted to on. Do not assume any default from another
release, a manual page, or a remembered example. For the consumer's verified and
supported version, set every required prohibition explicitly: DTD declarations,
entity declarations and expansion, and external entity or DTD resolution. An
option the selected version does not support is a configuration failure, not a
silent downgrade. This is not a claim that the newest release is the required or
safest choice.

Factory flags apply only when no parser object is supplied. In the reviewed
source, passing `parser=` to `parse` or `iterparse` bypasses every prohibition
set by the factory, and a wrapper that forwards a parser does the same. Do not
expose an unverified caller-supplied parser on an untrusted-input route.
`fromstring`-style helpers in that source build their own parser, which is not a
guarantee for another version or another library.

Handle the full documented failure family. In the reviewed source, the
forbidden-operation exceptions derive from `ValueError`, not only from the
standard library `ParseError`. Catch the verified exception base for the pinned
version and keep a non-parsing fallback. Exception text can embed
attacker-controlled document content with no length bound; never echo it
unrestricted into a log, user interface, report, or filename. Truncate and label
it as untrusted, or report only the exception class and a local correlation ID.

XInclude is a separate expansion step, not a DTD setting. It can load additional
resources during a later processing pass, depending on its loader. XInclude
processing and schema fetching are separate operations; neither is made safe by
the initial parser's DTD flags. Keep XInclude
processing and schema fetching forbidden for untrusted documents even when the
initial parse rejects DTDs, entities, and external references.

A hardened wrapper is not a resource sandbox. The reviewed source makes no
guarantee about input bytes, node count, tree depth, wall-clock time, or the
bundled parser version. Impose external byte and time limits around the parse,
treat node and depth limits as the selected parser's documented behavior to
test rather than a promise, and test the actual interpreter, Expat build, and
parser version in use.
A rejected DTD is not evidence about unrelated expansion, depth, or version
behavior.

Do not adopt convenience routes that widen the boundary. The reviewed source
metadata labels the cElementTree and lxml facade modules deprecated, and the
stdlib-wide `defuse_stdlib` monkeypatch experimental and untested. Do not
monkeypatch global parsing modules for a document task; prefer an explicit,
version-pinned parser call confined to the untrusted-input route.

These are static source observations about one reviewed release, not parser
execution, a hostile-input result on this host, or proof that any installed
parser enforces them. That release is not installed here, so the consumer must
verify its own package, exact version, hash, and successful import check before
relying on this guidance.

## Refuse unsupported formats and features

Stop and state the exact unsupported feature instead of converting silently.
Conversion can change layout, formulas, comments, signatures, and metadata, and a
successful open is not preservation.

| Request | Required response |
|---|---|
| Legacy binary `.doc`, `.xls`, or `.ppt` | Refuse the native-edit claim; a copy-based conversion is a separate, disclosed operation. |
| Macro-enabled `.docm`, `.xlsm`, `.pptm` | Do not execute macros. Editing is out of scope unless a tested, preservation-aware route is separately approved. |
| Digitally signed PDF or signed package | Any edit can invalidate the signature. Require explicit acceptance and retain the original. |
| Encrypted or password-protected file | Do not put a password in a command line, log, or chat. Use a supported secure input route or refuse. |
| XFA or dynamic PDF form | Do not treat it as an AcroForm; use a declared viewer or refuse. |
| External links, pivot tables, dynamic arrays, embedded OLE, or unsupported chart types | Preserve or refuse. Do not let a writer flatten or drop them silently. |
| A format the selected library does not read and write | Refuse rather than round-tripping through a different product. |

## Verification is layered

Report these separately; one does not substitute for another.

1. **Source integrity:** input hash and byte size unchanged.
2. **Package integrity:** expected members, relationships, and unmodified parts
   still present.
3. **Structural reopen:** the selected library or converter reopens the output
   without repair prompts.
4. **Content assertion:** requested text, cells, fields, or formulas are present
   with the expected values.
5. **Render review:** every page of a new artifact, or changed areas plus a
   whole-document unintended-change scan for an edit.
6. **Human acceptance:** the user confirms the visible result and the destination.

A parser exit code of zero is not visual acceptance. A contact sheet is not a
full-size page review. A LibreOffice render is not Microsoft Office or a hosted
office suite's acceptance.

## Render a copy with LibreOffice

A private profile is not a sandbox: `--headless` and `--norestore` do not establish
network denial, macro disabling, filesystem confinement or safe external-link
handling. Before converting untrusted documents, require a reviewed converter
sandbox with those boundaries and resource limits. If none is available, fail
closed and report the missing isolation; do not weaken policy or invent switches.
The invocation below is for trusted synthetic inputs or an already verified
isolated route, not approval to open arbitrary downloaded office documents.

Set the placeholder variables first; do not leave them empty or let a command fall
back to a shared path. Use a private profile per concurrent job. The installed
manual page documents `--headless`, `--convert-to`, and `--outdir`; the
user-profile override is a documented bootstrap option, not a replacement for
isolation.

```bash
mkdir -p "$SCRATCH/profile" "$SCRATCH/render"
timeout 120s soffice \
  -env:UserInstallation="file://$SCRATCH/profile" \
  --headless --norestore \
  --convert-to pdf --outdir "$SCRATCH/render" "$OUT"
```

Then inspect the rendered PDF with the local Poppler tools:

```bash
pdfinfo "$SCRATCH/render/$BASE.pdf"
pdftoppm -png -r 110 "$SCRATCH/render/$BASE.pdf" "$SCRATCH/render/page"
```

Bound the page range and resolution. Do not render an unbounded page count into a
shared directory. If conversion fails, report the failure; do not install a
fallback converter or relax a security setting.

## Sources and limits

Checked 2026-10-29 against local binaries and these public sources; the
version-qualified XML parser notes were added 2026-10-30:

- ECMA-376 Office Open XML file formats, 5th edition:
  <https://ecma-international.org/publications-and-standards/standards/ecma-376/>
- OWASP XML External Entity Prevention Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html>
- Snyk Zip Slip research: <https://security.snyk.io/research/zip-slip-vulnerability>
- LibreOffice start parameters:
  <https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html>
- Version-specific PyPI metadata for `defusedxml` 0.7.1:
  <https://pypi.org/pypi/defusedxml/0.7.1/json>. Only that release's declared
  wheel and selected static text members were reviewed; no package was
  installed, imported, or executed, and no XML document was parsed.
- Local `libreoffice(1)`, `zipinfo(1)`, `unzip(1)`, `pdfinfo(1)`, and
  `pdftoppm(1)` manual pages and `--help` output.

Limits: the host has no DOCX, XLSX, or PDF authoring library, so no authoring or
round-trip acceptance is claimed. LibreOffice help was published for 26.8 while
the installed package is 26.2.6.3; recheck a flag if a future version changes it.
The XML parser statements describe one reviewed release's source, not a
supported-version matrix, an import check, or a hostile-input test; the consumer
must confirm the version and behavior it actually uses. This reference does not
cover presentations, hosted office suites, or remote collaboration.
