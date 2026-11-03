# Local XLSX and CSV workflow

Read [`local-artifacts.md`](local-artifacts.md) first. It owns the shared
preservation, ZIP, XML, refusal, and verification rules. This file adds workbook
and delimited-text steps.

## Boundary

This route covers `.xlsx` workbooks and plain `.csv` or `.tsv` text. It does not
claim `.xls`, `.xlsm` macro editing, `.xltx`/`.xltm` templates, ODS, live Excel,
or any hosted spreadsheet service. Refuse an unsupported format instead of
round-tripping it through another product.

`openpyxl` (documented 3.1.3) and `xlsxwriter` are absent on this host. Workbook
inspection, editing, and cached-value reads that need them are **prerequisites**,
not current capabilities. Do not present openpyxl code as executed guidance.
Install only in a separately approved, isolated, version-pinned environment.

Plain CSV reading and writing can use the Python standard library. The installed
`csv` module and `zipfile` are present; LibreOffice and Poppler are available for
copy-based conversion and rendering.

## Inspect a workbook before editing

```bash
file -- "$SRC"
sha256sum -- "$SRC"
zipinfo -1 "$SRC"
unzip -l "$SRC"
```

The member list identifies the workbook type and risk:

| Member or feature | Meaning | Default action |
|---|---|---|
| `xl/workbook.xml` | sheet inventory and defined names | expected |
| `xl/worksheets/*.xml` | cell and formula data | expected |
| `xl/sharedStrings.xml` | shared text | expected |
| `xl/vbaProject.bin` | macros | refuse macro editing; never execute |
| `xl/externalLinks/*` | external workbook links | preserve or refuse |
| `xl/pivotTables/*`, `xl/pivotCache/*` | pivot state | preserve or refuse |
| `xl/drawings/*`, `xl/charts/*` | shapes, charts, images | inventory; round-trip loss is common |
| `xl/comments*.xml` | comments | preserve; do not strip |
| `xl/connections.xml` | external data connections | report; do not refresh |

`openpyxl` documentation states that it does not read all possible Excel items and
that shapes can be lost when an existing file is opened and saved. Charts, images,
pivots, and external links are not safe to promise without a synthetic fixture and
a package comparison. Load the workbook, inspect unsupported objects, and refuse
the edit if the writer would drop them.

## Read-only inspection

Without an authoring library, prefer a copy-based render for a visual read and
never claim native workbook fidelity:

```bash
mkdir -p "$SCRATCH/render"
timeout 120s soffice \
  -env:UserInstallation="file://$SCRATCH/profile" \
  --headless --norestore \
  --convert-to pdf --outdir "$SCRATCH/render" "$SRC"
pdfinfo "$SCRATCH/render/$BASE.pdf"
pdftoppm -png -r 110 -f 1 -l 1 \
  "$SCRATCH/render/$BASE.pdf" "$SCRATCH/render/page"
```

Use the actual sheet range requested. Do not dump every sheet into a scratch
directory when one sheet was asked for. Confirm which sheets the converter
actually rendered; a hidden or non-printing sheet may be absent from the PDF.

When `openpyxl` is available, read formulas with `data_only=False` for structure
and formulas, and use `data_only=True` only when the question is about the cached
value stored in the file. The documentation defines `data_only` as the value
"stored the last time Excel read the sheet", not a fresh calculation. A workbook
created by a writer may have no cached value; a missing value is not zero.

Read numbers, dates, percentages, and currencies from their underlying values and
number formats. Do not infer types from displayed text, and do not guess rounding
from a formatted string.

## Formula versus recalculation

This distinction is mandatory:

- **Formula preservation:** the formula text is still stored as a formula after the
  edit. This is a structure check, not a calculation.
- **Cached value:** a value stored in the workbook from an earlier calculation.
  `data_only=True` reads this cache. It does not prove that the cache is current.
- **Recalculation:** an engine evaluates the formula graph and produces new values.
  LibreOffice can perform a copy-based recalculation within its supported subset;
  record its version, locale, and settings. It is not Microsoft Excel.
- **Independent oracle:** a small expected result computed separately from the
  workbook. Comparing two reads of the same stale cache is not an oracle.

For a formula-dependent deliverable:

1. preserve formulas in the working copy;
2. recalculate only on a copy with the declared engine;
3. reopen with the selected library and inspect formulas and cached values
   separately;
4. compare key totals and changed-driver outputs with the independent oracle;
5. fail on stale, missing, or error caches instead of reporting a correct result.

Do not use a formula-evaluation library as a silent substitute for the target
spreadsheet application. Do not convert an existing Excel-specific workbook to a
different format just to obtain a value.

## Edit a workbook

1. Copy the source to a new working path. Never save over the original.
2. Load with formulas enabled (`data_only=False`) and preserve calculation mode and
   workbook metadata that the selected library supports.
3. Inventory unsupported features before writing. Stop if the writer would drop
   charts, images, pivots, external links, validations, or protection.
4. Change only the requested cells, ranges, sheets, names, or formats. Do not
   autofit, restyle, or resize the whole workbook for a narrow edit.
5. Save to a temporary file beside the final destination, reopen, compare the
   package inventory and formulas, then rename into place.
6. Recalculate only if requested or required, using the declared engine on a copy.
7. Render the changed range or sheet and inspect the result at full size.

Preserve unrelated sheets, hidden state, row/column dimensions, freeze panes,
filters, named ranges, data validation, conditional formatting, protection, and
comments unless the request explicitly changes them. A writer that drops any of
these is a failed edit, not an acceptable simplification.

### Unsupported workbook matrix

| Request | Required response |
|---|---|
| `.xls` binary workbook | Refuse native editing; openpyxl does not read or write this format. |
| `.xlsm` macro workbook | Do not execute macros. `keep_vba` can preserve VBA bytes in some reads but does not make VBA editable; refuse the edit unless separately designed and tested. |
| Pivot tables, external links, dynamic arrays, iterative calculation | Preserve or refuse; do not flatten or refresh silently. |
| Charts, images, shapes, embedded objects | Inventory and compare; refuse if the writer drops them. |
| Protected workbook or sheet | Do not remove protection to make an edit succeed. |
| Multi-sheet workbook as one CSV | A CSV file holds one table; export each requested sheet separately and state the policy. |

## CSV and TSV

Read and write delimited text with an explicit encoding, delimiter, quote rule,
and newline policy. The Python documentation recommends opening CSV files with
`newline=""` so the `csv` module controls line endings. Use `utf-8-sig` only when
a byte-order mark is actually present or required.

Do not silently coerce text to numbers, strip leading zeros, or reinterpret dates.
When exporting, declare whether values are text, numbers, or formulas and preserve
the requested delimiter and encoding.

CSV carries no number-format metadata. A converter's default numeric inference
can display `15.50` as `15.5` even when source bytes remain unchanged. When exact
text presentation matters, declare and verify a text import policy with explicit
encoding, delimiter, quoting and per-column types; disable formula interpretation
and number detection as supported by the actual converter. Do not silently use
that policy when numeric spreadsheet cells are required. Compare every requested
value in the extracted text and rendered page, including trailing zeros, leading
zeros, Unicode, quotes and blank cells. Text rendering is not a recalculation pass.

For LibreOffice, consult the current
[CSV filter options](https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html)
before constructing `--infilter`. Its documented column-format code `2` selects
text; other tokens control encoding, quoted fields, trimming and formula/number
detection. Reverify version compatibility and the intended consumer. A successful
trusted synthetic conversion does not establish an untrusted-file sandbox or
native Excel fidelity; preserve the source and unsuccessful render too.

### Formula injection

Treat every cell beginning with `=`, `+`, `-`, `@`, tab, carriage return, or line
feed as potentially active when the CSV will be opened by a spreadsheet program.
Full-width variants of formula characters can matter in some locales. A field
separator or quote inside untrusted input can also start a new cell, so checking
only the first character of the raw line is insufficient.

There is no universal sanitization that is safe for every spreadsheet application
and every downstream consumer. Choose and state a policy:

- quote every field and prefix a single quote for text that begins with a formula
  character;
- or prefix with a tab inside the quoted field for Excel-resistant viewing;
- or refuse to export untrusted formula-leading content.

Each choice changes the data seen by downstream parsers. Document the trade-off,
test the intended consumer, and never claim that escaping is universally safe.
Do not round-trip a CSV through a spreadsheet application to "clean" it.

## Verification

Report these layers separately:

1. source hash and byte size unchanged;
2. package inventory and unsupported-feature check;
3. reopen with the selected library;
4. formula text and cached values inspected separately;
5. independent oracle comparison for changed calculations;
6. render of the changed sheet/range at full size;
7. human acceptance of the destination file.

Check for `####`, clipped columns, overlapping legends, missing units, print-area
boundaries, and hidden rows or sheets that change the visible result. A static PDF
preview does not prove workbook interactivity or native Excel compatibility.

## Sources and limits

Checked 2026-10-29:

- openpyxl 3.1.3 tutorial, especially `data_only`, `keep_vba`, read-only mode,
  and the warning that shapes can be lost on open/save:
  <https://openpyxl.readthedocs.io/en/stable/tutorial.html>
- Python `csv` documentation:
  <https://docs.python.org/3/library/csv.html>
- LibreOffice conversion filter names:
  <https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html>
- OWASP CSV Injection:
  <https://owasp.org/www-community/attacks/CSV_Injection>
- Shared local tool baseline and safety rules: `local-artifacts.md`.

Limits: `openpyxl`, `xlsxwriter`, and `pandas` are absent here. No workbook edit,
formula recalculation, chart preservation, or native Excel acceptance was
performed for this reference. LibreOffice is a renderer and a limited
recalculation engine, not an Excel compatibility guarantee.
