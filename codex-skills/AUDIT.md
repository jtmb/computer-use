# Codex skills bundle: OpenCode compatibility audit

Audited 2026-10-29. Source: [PR #6 — Add Codex skill bundle](https://github.com/jtmb/computer-use/pull/6), head `177c32635c8884d36524ad404ef6c2acdab35f26`.

The PR diff contains 494 paths, all beneath `codex-skills/`: **494 files across 30 skill folders**, initially copied byte-for-byte from the PR. The bundle remains inert. One helper now has the explicitly documented local correction below; its exact upstream bytes are retained separately. This report and `local-fixes/` are local additions, not part of the PR tree.

## Recommendation

**Do not load any of these bundles into OpenCode unchanged.** Their skill frontmatter is recognizable, but most workflows call Codex-only tools, plugins, runtime paths, or citation directives. This harness already has OpenCode routes for GNOME desktop work, visible and headless browser tasks, web research, local files, image generation, and skill maintenance. In particular, the imported `computer-use` skill controls Windows through `@oai/sky`; it is not a route for this Linux/GNOME harness.

Useful future ports are **`documents`, `pdf`, and `spreadsheets`** for local artifact work; **merge selected `imagegen` prompting guidance into the existing `chatgpt-images` skill**; and optionally adapt **`openai-docs`** to OpenCode's `websearch`/`webfetch`. **`presentations`** is a conditional port if local PPTX authoring is wanted and its runtime is selected. These are adaptation candidates, not approvals to add dependencies, enable integrations, or deploy skills.

**Licensing is a prerequisite, not an assumed permission.** The documents notice
expressly restricts extraction, copying and distribution; direct helper reuse
needs verified rights. Other unlicensed closures likewise need provenance review
or independently authored guidance grounded in public format/library sources.
See the [per-skill evidence](SKILL-REVIEW.md) and [adoption plan](ADOPTION-PLAN.md).

No canonical `.opencode/skills` files, OpenCode configuration, or deployed skills were changed. Nothing was activated or installed. The initial audit executed no helpers; subsequent offline regression tests are described below.

## Complete skill inventory and decisions

Decisions use **keep/adapt/merge/defer/exclude**. Adapt means a future, scoped
OpenCode workflow, not compatibility as-is or approval to copy licensed material.
Merge means selected guidance into an existing route; defer names a concrete
prerequisite; exclude means do not adopt, **not delete the preserved import**.
Totals: **0 keep, 4 adapt, 1 merge, 6 defer, 19 exclude**.

The first column uses exact directory names. Upstream frontmatter differs in two
places: `presentations` declares `Presentations`, and `spreadsheets` declares
`Spreadsheets`. Preserve these originals as provenance. In current V2, IDs derive
from paths; frontmatter names are display labels and casing differences are not
loader errors. See the [official V2 skills guide](https://opencode.ai/v2/docs/skills/).

| Skill | What it does | OpenCode decision and reason |
|---|---|---|
| `computer-use` | Automates Microsoft Windows apps using SendInput, UI Automation, and Windows screenshots. | **Exclude.** Requires Windows `@oai/sky`/`node_repl`, not Linux/GNOME; three mandatory external docs are absent. Existing desktop/browser routes cover this consumer. |
| `create-pet` | Creates and validates animated sprite sheets, previews them, and creates/activates ChatGPT Pets. | **Exclude.** Pets/upload/Library lifecycle APIs and two required shared contracts are absent; ordinary image generation is not equivalent. |
| `deploying-to-prd` | Deploys an application to a particular production Kubernetes cluster through WSL, SSH, and Flux. | **Exclude.** Private production targets and consequential deployment procedures are neither portable nor authorized as ambient guidance. |
| `documents` | Creates, edits, redlines, comments on, and visually verifies Word/DOCX documents. | **Adapt.** High-value local workflow for `files-and-documents`; direct helper copying is blocked pending rights under its restrictive notice. Replace workspace-loader/citations/Google assumptions and verify dependencies. |
| `excel-live-control` | Controls a live Microsoft Excel workbook through the ChatGPT add-in and connected-document tools. | **Exclude.** Windows Excel, add-in and connected-document tools are absent; local XLSX work is a separate route. |
| `find-skills` | Searches the external agent-skill ecosystem and offers skill installation. | **Exclude.** Network `npx` and global `-g -y` installs bypass this consumer's reviewed source/deployment workflow; popularity is not provenance. Exact install destination is not established. |
| `google-docs` | Creates and edits native Google Docs through connected APIs. | **Defer.** No Docs/Drive connector; Codex bridges/citations need replacement and new-Docs routing disagrees with google-drive. Revisit only after supported schemas and authority exist. |
| `google-drive` | Searches, fetches, exports, shares, moves, copies, and deletes Drive files; routes Docs/Sheets/Slides work. | **Defer.** Unified Drive connector and authenticated materialization are absent. Sharing/deletion and internal new-Docs/Slides routing need exact review before reconsideration. |
| `google-drive-comments` | Adds, replies to, and resolves comments on Drive files with location evidence. | **Defer.** No Drive comment APIs; remote publication/readback and location evidence must be supported before reconsideration. |
| `google-sheets` | Reads and edits Google Sheets ranges, formulas, charts, tables, and imports. | **Defer.** Sheets/Drive connectors and Codex spreadsheet runtime are absent. Revisit bounded native edits only after a real connector is authorized. |
| `google-slides` | Edits existing Google Slides decks using template analysis and rendered visual QA. | **Defer.** No Slides/Drive APIs, native export/render or Presentations runtime; resolve new-deck routing and verify real schemas before reconsideration. |
| `imagegen` | Generates or edits raster images, with prompt guidance and an optional API-key CLI fallback. | **Merge.** Selected prompting belongs in existing `chatgpt-images`; do not add a duplicate runtime, API-key CLI, unsupported edit/mask/quality controls or extra generations. |
| `ingenium-kubernetes-deploy` | Migrates a named production service, its data, credentials, and workloads to Kubernetes. | **Exclude.** Bespoke production state/access/migration procedures carry data and security risk and do not belong in a general OpenCode route. |
| `maintain-space` | Reconciles new evidence into existing ChatGPT Pages/Spaces and their schedules. | **Exclude.** Hosted Pages/Spaces edit and scheduling APIs are absent; local notes are not that product. |
| `manage-schedules` | Reviews a ChatGPT Space and creates, updates, or removes page-linked automations. | **Exclude.** Hosted automation APIs are absent; existing `routine-automation` is the distinct local route. |
| `openai-docs` | Finds and cites official OpenAI product, API, model, and ChatGPT documentation. | **Adapt.** Optional official-source guidance fits research tools; remove Codex self-identity/key-skill assumptions and uncited current-model claims. Keep OpenCode questions with `opencode`. |
| `organize-space` | Reorganizes ChatGPT Pages and Space hierarchies, including guarded cross-Space moves. | **Exclude.** Hosted lifecycle/access semantics are absent; local file organization is not cross-Space permission management. |
| `pdf` | Reads, creates, fills, renders, and validates PDFs, including AcroForms. | **Adapt.** High-value form integrity/render QA for `files-and-documents`; verify rights, library versions and canonical-field/widget checks, without automatic installs or Codex citations. |
| `pets` | Lists, selects, downloads, and deletes ChatGPT animated pets. | **Exclude.** Pets API is absent; hosted identity/selection/deletion cannot be emulated with local files. |
| `plugin-management` | Discovers ChatGPT plugins and inspects or changes app permissions/connections. | **Exclude.** ChatGPT app-management APIs are absent and are not OpenCode MCP/plugin configuration; existing OpenCode/onboarding routes own that scope. |
| `presentations` | Creates or edits Spaces presentations, local PowerPoint files, or Google Slides decks. | **Defer.** Local-only PPTX adaptation needs demonstrated demand, rights and an authoring/render/reimport stack; Artifact Tool and hosted routes are absent. |
| `sites` | Builds, edits, and publishes websites through ChatGPT Sites, its source helper, and hosting tools. | **Exclude.** Hosted source/identity/consent/storage/publication contracts are absent; generic web development does not reproduce them or authorize default publication. |
| `sites-remix` | Clones and adapts an existing hosted ChatGPT Site into a new Site. | **Exclude.** Absent remix/source/publishing APIs; source copying omits runtime data/settings and is not a complete migration. |
| `skill-creator` | Creates or updates Codex skills and supporting resources. | **Exclude.** Duplicate of existing authoring/maintenance routes with Codex metadata/validators. Example OOXML/redlining links are not missing required files. |
| `skill-installer` | Downloads skills from GitHub into Codex's global skills directory. | **Exclude.** Codex destination, mutable network sources and Git credential fallback do not match canonical-source deployment. The global `-g -y` example belongs to find-skills instead. |
| `spreadsheets` | Creates, edits, analyzes, and visualizes local workbooks or Google Sheets. | **Adapt.** High-value local modeling/QA; verify rights and select an explicit writer/recalculation stack instead of Artifact Tool/loader/Google assumptions. Formula writing alone is not calculation. |
| `template-creator` | Turns document, slide, spreadsheet, image, email, or Site examples into reusable personal Codex artifact templates. | **Exclude.** Personal Codex gallery writes and hosted exports do not match OpenCode lifecycle; private source artifacts must not become shared skills by default. |
| `update-pet` | Inspects, repairs, previews, or updates an existing ChatGPT Pet. | **Exclude.** Pets lifecycle tools and two shared contracts are absent; a local image edit cannot verify a stable hosted-pet update. |
| `visualize` | Produces interactive HTML visualizations embedded directly in a ChatGPT conversation. | **Exclude.** No equivalent inline host/directive/persistence contract; mandatory silence conflicts with this harness. Local HTML is a separate requested deliverable. |
| `write-page` | Creates and edits ChatGPT Pages, including native blocks, images, and embedded artifacts. | **Exclude.** Page APIs/native blocks/host citations are absent; local Markdown is not verified hosted Page success. |

## Recursive audit findings and limits

- Inventory and metadata: all **30** skill folders contain a `SKILL.md` with `name`/`description`; names are unique. **Two case mismatches** exist between folder and frontmatter: `presentations`/`Presentations` and `spreadsheets`/`Spreadsheets`.
- Structure: all **494** downloaded files are regular files; no symlinks or executable-mode files were present. A bounded scan found no credential-token, private-key block, or quoted password/API-key assignment patterns. This is not proof that the bundle is secret-free.
- Sensitive configuration: the two Kubernetes deployment skills include private-address and absolute home-path references across multiple files. Keep these skills out of general OpenCode discovery and do not run or republish their deployment instructions without a separate, exact review.
- Internal links: the corrected inline-link scan excludes fenced examples and checks **222 relative links**, with **four genuinely missing Pet-workflow contracts**, all outside the imported bundle. The earlier raw scan's 20 missing targets included 16 illustrative/host placeholders, including the two `skill-creator` examples; those are not required missing files. The Sites connector-preview directory link is valid. Windows `computer-use` additionally requires three backtick-only `../../docs/` references outside this bundle; these are not part of the Markdown-link count. Site commands still depend on an external plugin/runtime even when their bundled relative links resolve.
- Static syntax checks: Python AST parsing passed for 84 files, Node `--check` for 64 JavaScript files, and `bash -n` for five shell files. These checks parsed source only; they did not execute helpers.
- TypeScript-family syntax parsing also passed for 82 `.ts`/`.tsx`/`.mts` files using the already installed TypeScript 5.9.3 parser; no typecheck, imports or template build was performed. Perl/PowerShell were not syntax-checked.
- Packaging/provenance: licenses or notices are present only in selected sub-bundles; there is no bundle-wide license/provenance manifest. Review provenance before copying bundled code/assets into a distributable skill.
- Source drift and risks: [per-skill evidence](SKILL-REVIEW.md) records incompatible Google creation routes, invalid redaction CLI examples, stronger/older local schema prose versus official V2 behavior, and argument-only artifact markers that do not prove output registration.
- Initial execution boundary: scripts were not run and dependencies were not installed. This was a recursive compatibility and static-safety triage, not dynamic testing or a line-by-line security certification of every helper. The bounded follow-up below does not broaden that claim.

## Verified source baseline

The pinned commit is available as a local Git object. `git ls-tree -r` confirms
**494 regular mode-100644 blobs in 30 directories**. A fresh Git-blob comparison
matches **493 current files** exactly. The sole delta is the documented redaction
repair; its retained upstream copy matches that path's original pinned Git blob.
No new network read or claim about the PR's current head is required for this pin.

[`AUDIT-INDEX.json`](AUDIT-INDEX.json) records every pinned path, expected blob,
current SHA-256, size, lexical/structural scan signals, Python syntax result and
relative Markdown links. It includes exact upstream names and per-skill file
counts; no secrets or infrastructure values are copied into the index.
[`local-fixes/verify_audit.py`](local-fixes/verify_audit.py) verifies this against
the actual Git objects and complete inventory, rather than trusting the report's
counts. It reads all **480 UTF-8 files** and checks the **14 PNG headers and
dimensions**; it does not execute helpers, render images or certify all code safe.

The verifier's nine tests cover the real pinned tree, changed/missing files,
symlinks, fenced example versus real/directory links, metadata casing, duplicate
inventory rows, unknown/unexplained decisions, required review fields, cross-report
count/decision disagreement and broken report links. It also rejects extra files
inside imported skill closures. Run:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B codex-skills/local-fixes/verify_audit.py
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s codex-skills/local-fixes -p 'test_*.py'
```

`--write-index` explicitly regenerates only this audit's JSON index. It changes
no imported source, canonical skill, configuration or runtime state.

## Session-owned correction — 2026-10-29

The review session owns the imported bundle and corrected one data-loss bug in
[`documents/scripts/redact_docx.py`](documents/scripts/redact_docx.py): with
`--no_preserve_length`, an expanded replacement was redistributed into only the
original run lengths, silently dropping unrelated trailing text. The final text
node now retains the remainder. The default length-preserving route and existing
run sizes before the final node are unchanged; length-changing edits can still
shift formatting and require later visual verification.

- Exact upstream helper: [`local-fixes/upstream/redact_docx.py.original`](local-fixes/upstream/redact_docx.py.original),
  SHA-256 `cd02f988732823adb6c1524398bf499cf7d93236871262bbab0074b95b7f4310`.
  The other **493 imported files remain byte-identical** to the pre-fix inventory.
- Regression suite: [`local-fixes/test_redact_docx.py`](local-fixes/test_redact_docx.py).
  Five expansion cases fail against the original helper. After correction,
  **11 tests pass; one actual ZIP/lxml round-trip test is skipped** because `lxml`
  is unavailable. Unit cases execute the production paragraph function using
  standard-library XML nodes at the XPath boundary; they do not render a DOCX.
- Run from the repository root:
  `PYTHONDONTWRITEBYTECODE=1 TMPDIR=/tmp/opencode python3 -B -m unittest discover -s codex-skills/local-fixes -p test_redact_docx.py -v`.
- No dependency installation, live document processing, skill activation,
  deployment, commit or push occurred. Other review findings were sent to their
  existing workspace owners; this session did not edit those source areas.

## Current harness fit

The checked-in OpenCode configuration loads `.opencode/skills`, declares GitHub and Playwright MCPs, and has repository-owned desktop/browser integrations. Existing skills already cover desktop control/vision, visible and headless browser use, web search, local files/documents, ChatGPT image generation, and skill maintenance. No Google Workspace, Excel add-in, ChatGPT Pages/Spaces, Pets, or Sites connector is declared. The downloaded directory remains outside `.opencode/skills`, so its Codex instructions are not active merely because they are present in this repository.

## Final verification — 2026-10-29

| Layer | Verified result | Not established |
|---|---|---|
| Provenance | All 494 pinned paths and original redactor backup verified; 493 unchanged, one retained local repair; no unexpected supporting files inside imported skill closures | Current remote PR-head freshness or permission to redistribute |
| Report coverage | 30 inventory rows and 30 review sections agree on purposes/dispositions and 494 closure files; all six selected source skills appear in the roadmap | Exhaustive semantic/security review of every supporting line |
| Report links | 121 relative report links resolve to filesystem targets; imported-link scan separately retains four missing external Pet contracts | Anchors, host URLs/tool contracts or TUI click/open behavior |
| Syntax | 84 Python, 64 JavaScript, 5 Bash and 82 TypeScript-family source parses pass | Dependency imports/types, Perl/PowerShell syntax, helper integration or template builds |
| Regression | 21 combined cases: **20 pass, 1 skip** (nine audit tests plus eleven redaction paragraph cases pass; real ZIP/lxml case skipped) | Full DOCX processing, rendering, complete anonymization or model/GUI behavior |
| Source hygiene | Audit verifier/tests pass Ruff lint; those two files pass Ruff format check; session-owned report/test whitespace scan passes | A full-project check or re-verification of peer runtime/voice work |
| Preservation | Original staged R100 command rename and staged patch SHA-256 `91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805` unchanged; this work remains uncommitted | Authority to stage, commit, push, activate or deploy |

The bounded test-quality review inspected the actual verifier suite and adjacent
redaction suite. Distinct failures remain covered: provenance mutation/missing or
symlinked input, inventory/review drift and invalid decisions, real versus example
links, expanded-text loss, Unicode/split/empty runs and default preservation.
Cross-report negative controls change copied report counts and omit real linked
files; they exercise production parsers/filesystem reads, not a count-only mock.
Earlier failing-before redaction evidence (five expansion failures) is retained;
no production source was reverted to repeat it. All test scratch stays under
`/tmp/opencode`. No unrelated suite or live workflow was run as a hidden check.

**Planning outcome:** local documents/PDFs and spreadsheets first, image prompting
merged into its existing route, optional official OpenAI research next, local
presentations conditional. Nothing is suitable for unchanged activation. Rights,
packages, unsupported feature preservation and real output acceptance are explicit
future adoption gates. No canonical port, dependency install, activation/deployment,
account/permission change, shared restart, publication, commit or push occurred.
