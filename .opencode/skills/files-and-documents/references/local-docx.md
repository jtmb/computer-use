# Local DOCX workflow

Read [`local-artifacts.md`](local-artifacts.md) first. It owns the shared
preservation, ZIP, XML, refusal, and verification rules. This file adds
DOCX-specific steps.

## Boundary

This route covers WordprocessingML documents with a `.docx` extension. It does
not claim support for `.doc`, `.docm`, `.dotx`, `.dotm`, RTF, ODT, or Word
documents that depend on macros, embedded programs, or external templates.
Refuse those formats or treat conversion as a separate, disclosed operation.

Creating and editing DOCX needs `python-docx` (documented 1.2.0) and normally
`lxml`. Both are absent on this host. That makes authoring a **prerequisite**, not
a working capability of the current skill. Do not show a create/edit command as
though it had been executed here. Install only through a separately approved,
isolated, version-pinned environment.

Read-only review does not need `python-docx`. Use the consumer's Read tool only
when it actually supports DOCX. Otherwise inspect the package and render a copy
with the installed LibreOffice and Poppler tools; label that a render-based
review, not the document's native layout.

## Inspect before touching

```bash
file -- "$SRC"
sha256sum -- "$SRC"
zipinfo -1 "$SRC"
unzip -l "$SRC"
```

Use the member list to identify features before opening the document:

| Package member | Meaning | Default action |
|---|---|---|
| `word/document.xml` | main document part | expected |
| `word/header*.xml`, `word/footer*.xml` | headers and footers | preserve |
| `word/comments.xml` | comments | preserve; do not strip |
| `word/people.xml` | comment authors | preserve |
| `word/footnotes.xml`, `word/endnotes.xml` | notes | preserve; library support may be absent |
| `word/embeddings/*` | embedded OLE or files | report; do not execute |
| `word/vbaProject.bin` | macros | refuse macro-bearing edit |
| `word/_rels/*.rels` | relationships | check internal/external targets |
| `customXml/*`, `docProps/*` | custom data and metadata | preserve unless explicitly scoped |

Inspect all relationship parts without fetching their targets, using the shared
hard decompression and hardened-XML bounds. Check namespace-aware attributes,
not a specific quote style or one member name. A truncated prefix or grep result
cannot establish absence of external relationships; malformed, oversized or
uninspected relationship parts remain a blocker. If no safe parser is available,
refuse the untrusted edit/render route. Preserve relationships as data, never
download their targets. A converter profile alone does not provide isolation.

For a read-only render review, copy the source to private scratch and convert the
copy using the shared LibreOffice procedure. Then inspect the PDF text and pages:

```bash
pdftotext -layout "$SCRATCH/render/$BASE.pdf" -
pdfinfo "$SCRATCH/render/$BASE.pdf"
pdftoppm -png -r 110 -f 1 -l 1 \
  "$SCRATCH/render/$BASE.pdf" "$SCRATCH/render/page"
```

Use the requested page range; do not dump every page when one page was asked for.

## Create a new document

Only after the authoring prerequisite is verified, use a new output path and keep
the source absent or unchanged. The documented library model is:

- create or open a `Document`;
- add paragraphs, runs, tables, sections, headers, and footers;
- save to a new path.

The code must be written against the installed version's API, not copied from an
example in this reference. This reference intentionally contains no authoring
snippet because the library is not installed and no call has been verified here.

A new document still needs an explicit page setup, fonts available on the target
system, and a destination policy. Do not silently choose a private location.

## Edit an existing document

1. Copy the source to a new working path; never edit the original.
2. Reopen the copy with the verified library and inspect paragraphs, runs, tables,
   sections, headers, footers, styles, and relationships that the request touches.
3. Detect features the library does not preserve before saving. Refuse rather
   than letting the writer drop them.
4. Save to a temporary file beside the intended final destination, reopen it, then
   rename it into place.
5. Compare the source and output package inventories. Missing parts or changed
   relationships are failures.
6. Render the changed pages and scan the whole document for unintended changes.

`python-docx` 1.2 documents comments, but its initial comments implementation does
not support resolving or replying to them, and it does not document tracked-change
editing. Footnotes and endnotes are documented as unsupported. Do not write
"tracked changes preserved" or "comments fully round-tripped" without a
feature-specific fixture and a real reopen. If the request needs revisions,
comment threading, content controls, or protected editing, report the gap.

### Feature refusal matrix

| Feature | Why it is risky | Required behavior |
|---|---|---|
| Tracked insertions/deletions | A writer may accept, drop, or flatten revisions | Refuse unless a tested revision-preserving design exists |
| Resolved or threaded comments | Initial library support is incomplete | Preserve as-is or refuse; do not rewrite the thread |
| Macros (`vbaProject.bin`) | Executable content and a different format contract | Refuse macro editing; never execute |
| Embedded OLE or packages | Can contain active or private content | Report; do not launch or extract |
| External template or linked image | Can fetch a remote resource | Preserve the relationship; never fetch |
| Digital signature or encryption | Editing invalidates or bypasses protection | Require explicit acceptance or refuse |
| Footnotes/endnotes, citations, fields | Library coverage may be partial | Verify with a fixture; otherwise refuse |
| Complex shapes, charts, text boxes | Round-trip loss is common | Compare package and render; refuse on loss |

Do not remove protection, metadata, comments, or revisions merely to make a save
succeed. That changes the user's document and can destroy evidence.

## Reopen and render verification

For a new document:

- reopen with the same library;
- assert the requested headings, paragraphs, tables, headers, footers, and page
  count;
- render every page at a readable resolution and inspect margins, clipping,
  overflow, fonts, and page breaks.

For an edited document:

- reopen and assert the exact changed text or table cells;
- confirm every unmodified part and relationship is still present;
- render the changed pages at full size;
- render or compare a whole-document set for unintended changes;
- compare page count, section geometry, headers/footers, and wrap points where
  they matter.

A LibreOffice PDF is a useful render, not proof of Microsoft Word fidelity.
Missing fonts and unsupported features are reported, not normalized silently.
Inspect the output at full size; a thumbnail or text extraction cannot establish
layout.

## Failure reporting

Report these separately:

- missing authoring prerequisite;
- unsupported source feature;
- package or relationship loss;
- reopen failure;
- render mismatch;
- final destination conflict.

If the library is absent, stop before writing and say that DOCX authoring is not
available in this environment. Do not substitute a text file or a PDF and call it
a DOCX edit.

## Sources and limits

Checked 2026-10-29:

- python-docx 1.2.0 documentation, including document, table, section,
  header/footer, style, shape, and comments pages:
  <https://python-docx.readthedocs.io/en/latest/>
- Comments limitations:
  <https://python-docx.readthedocs.io/en/latest/user/comments.html>
- Shared local tool baseline and safety rules: `local-artifacts.md`.

Limits: `python-docx`, `lxml`, and `defusedxml` are absent here, so no DOCX
authoring, reopen, or visual acceptance was performed for this reference. The
render route uses LibreOffice, whose layout is not Microsoft Word. Tracked-change,
comment-thread, field, and footnote behavior must be proven against the exact
installed library version before being promised.
