# Local PDF workflow

Read [`local-artifacts.md`](local-artifacts.md) first. It owns the shared
preservation, archive, XML, refusal, and verification rules. This file adds
PDF-specific steps.

## Boundary

This route covers local PDF inspection, text extraction, page rendering, and
AcroForm field work. Native PDF authoring, signing, certification, PDF/A
validation, XFA forms, portfolios, and 3D or embedded-file workflows are not
claimed.

The installed Poppler tools can inspect and render PDFs today. `pypdf` is absent,
so form editing, merging, encryption changes, and attachment handling are
**prerequisites**, not working capabilities. Do not present a `pypdf` snippet as
executed guidance. Install it only in a separately approved, isolated,
version-pinned environment.

## Read-only inspection

```bash
file -- "$SRC"
sha256sum -- "$SRC"
pdfinfo "$SRC"
```

`pdfinfo` reports page count, page size, PDF version, encryption state, and
metadata. These are inspection commands; they do not execute JavaScript.

```bash
pdfinfo -js "$SRC"
pdfinfo -url "$SRC"
```

`-js` lists JavaScript found in the document. Listing is not execution. Never run
document JavaScript, open an embedded file, or follow a URL found by `-url`.
Treat URLs as untrusted data and do not fetch them to "check" a link.

Extract requested text and render a bounded page range:

```bash
pdftotext -layout "$SRC" -
pdfinfo "$SRC"
pdftoppm -png -r 110 -f 1 -l 1 "$SRC" "$SCRATCH/page"
```

Use `-f`/`-l` for the requested pages. Text extraction is not layout proof:
scanned pages, unusual encodings, columns, and vector text can differ from the
visible page. Inspect the rendered page at full size for layout questions.

If `pdfinfo` reports encryption, stop. Do not put a password in a command
argument, shell history, log, or chat. Use a supported secure input route if one
exists; otherwise refuse and report the limitation. Do not strip encryption to
make inspection easier.

## AcroForm model

A PDF form has two related structures:

- the document catalog's `/AcroForm` with `/Fields`, `/NeedAppearances`, fonts,
  and possibly `/XFA`;
- page `/Annots` entries with `/Subtype /Widget` that draw the fields.

Field objects carry `/FT` (field type), `/T` (partial name), `/V` (value), and
`/DV` (default value). Hierarchical fields use `/Parent` and `/Kids`; the fully
qualified name joins the names with dots. A field repeated on several pages can
have several widgets. Some widgets are fused with their field object; others are
separate.

Do not assume that reading `/Fields` and setting `/V` changes what a person sees.
The visible appearance is a separate `/AP` appearance stream, and stale or missing
appearances are common. A correct field edit checks all of these:

1. canonical field value `/V`;
2. the effective value through the fully qualified field name;
3. every widget's appearance `/AP`;
4. the page rendering after reopening.

Reject ambiguous duplicate names or orphan widgets rather than inventing a field.
Do not create a text box, underline, or overlay and call it an AcroForm field.

When `pypdf` is available, its documented form API uses
`update_page_form_field_values(...)` with `auto_regenerate=False` for the normal
case. Regeneration can trigger a viewer's "save changes" prompt. Flattening is a
separate, explicit request: it converts appearances to page content and then
requires removal of the widget annotations. It is not a default cleanup step.
Keep the editable original and disclose that a signature will be invalidated.

### Form refusal matrix

| Condition | Why it is risky | Required behavior |
|---|---|---|
| `/XFA` present | XFA overrides ordinary page content and needs a different runtime | Refuse or use a declared XFA-capable viewer; do not pretend it is AcroForm |
| Encrypted file | Password handling and permissions are separate | Use a secure route or refuse; never log the password |
| Digitally signed file | Any byte change can invalidate the signature | Require explicit acceptance; retain the signed original |
| Duplicate or ambiguous field names | A blind write can target the wrong field | Stop and report the ambiguity |
| Missing or stale `/AP` | Value changes without visible change | Repair only with a tested appearance workflow, then render |
| Flatten requested | Removes editability and can hide signature impact | Explicit request, keep original, verify no widgets or `/AcroForm` remain |
| Portfolio, attachment, 3D, or embedded file | Can carry private or active content | Report; do not extract or execute without separate scope |

## Create or edit a PDF

Creating a PDF from a DOCX or spreadsheet through LibreOffice is a copy-based
conversion, not native PDF authoring. Disclose that the layout comes from the
converter and preserve the source document.

Native PDF creation with `reportlab` is absent here and remains a prerequisite.
Do not hand-write PDF objects, and do not turn a rendered image into a PDF and
call it searchable or accessible.

For a form fill or page edit with `pypdf`:

1. copy the source to a new working path;
2. open with bounded reader limits;
3. enumerate fields and widgets and record the mapping before writing;
4. write to a new output; never overwrite the source;
5. reopen the output and compare `/V`, effective widget values, and appearances;
6. render every changed page and inspect it.

Recovery mode such as `strict=False` may be needed to read a mildly malformed
file, but it is not a trust decision. Keep size, page, object, and time bounds.
A file that needs broad repair is reported, not silently normalized.

## Reopen and render verification

```bash
pdfinfo "$OUT"
pdftotext -layout "$OUT" -
pdfinfo "$OUT"
pdftoppm -png -r 110 -f 1 -l 1 "$OUT" "$SCRATCH/out-page"
```

Check:

- page count and page boxes;
- encryption and signature state;
- requested text or field values;
- form widgets still present when the form should remain editable;
- no widgets or `/AcroForm` remain after an explicit flatten;
- visual placement, clipping, and font substitution on changed pages.

A PDF render is not proof of a signature, PDF/A conformance, accessibility, or
behavior in every viewer. Those require separate acceptance.

## Sources and limits

Checked 2026-10-29:

- pypdf form documentation:
  <https://pypdf.readthedocs.io/en/stable/user/forms.html>
- pypdf security and parser limits:
  <https://pypdf.readthedocs.io/en/stable/user/security.html>
- pypdf developer introduction to the PDF format:
  <https://pypdf.readthedocs.io/en/stable/dev/pdf-format.html>
- Local `pdfinfo(1)`, `pdftotext(1)`, and `pdftoppm(1)` manual pages and
  `--help` output; Poppler 26.01.0.
- Shared local tool baseline and safety rules: `local-artifacts.md`.

Limits: `pypdf`, `pdfplumber`, `reportlab`, and `qpdf` are absent. No PDF form
edit, flatten, native creation, signing, or visual acceptance was performed for
this reference. Poppler text extraction and rendering are not an Adobe Acrobat
compatibility claim.
