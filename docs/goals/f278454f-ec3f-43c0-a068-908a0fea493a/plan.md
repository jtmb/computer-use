# Plan — `f278454f-ec3f-43c0-a068-908a0fea493a`

- Goal ID: `f278454f-ec3f-43c0-a068-908a0fea493a`
- Source session ID: `ses_e788b549bffe8cyPIPC9FRsmJY`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T15:52:27.799Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `14`
- Record: `current`

## Goal objective

> Complete this session's Codex\-skills work for PR \#6 \(jtmb/computer\-use, pinned head 177c32635c8884d36524ad404ef6c2acdab35f26\): preserve and verify the downloaded bundle and its provenance; recursively audit every one of the 30 skills and its supporting files; deliver an exact inventory with a one\-line description and an explicit keep/adapt/merge/defer/exclude decision plus reasons for every excluded skill; and produce an evidence\-backed OpenCode adoption plan for the useful material, prioritizing local documents/PDFs/spreadsheets, image\-generation prompting guidance, optional OpenAI\-documentation research and conditional local presentations\. Reconcile inaccurate audit claims, distinguish directory names from upstream display/frontmatter names, and retain the already verified local redaction correction, original bytes and tests\. This session owns imported\-skill audit and adoption planning, not browser/runtime/launcher/connector/voice implementation delegated to existing owners\. Preserve unrelated dirty/staged/untracked work and existing peer reservations\. The current request is planning and goal tracking, not authorization to implement ports, install dependencies, enable or deploy skills, modify accounts/permissions, restart services, publish, commit or push\.

## Persisted plan

Plan revision: `14` · updated 2026-10-29T15:52:00.000Z

> Skills\-only ownership: verify the pinned 30\-skill import, finish a traceable recursive compatibility/safety audit, reconcile the complete inventory and exclusion reasons, then deliver a concrete OpenCode adoption roadmap\. Retain verified redaction repair and original bytes\. Port implementation, installation, activation/deployment and unrelated runtime work are outside the present planning request\.

### Completion criteria

- All 30 imported skill folders and supporting\-file closures are accounted for against PR \#6 head 177c32635c8884d36524ad404ef6c2acdab35f26\. Imported originals are preserved or their exact local modifications and retained upstream copies are documented; unrelated dirty/staged/untracked work is untouched\.
- The inventory has exactly one row per actual skill folder, separately records upstream name/display\-name differences, gives a clear one\-line purpose, and assigns keep/adapt/merge/defer/exclude with a concrete reason for every exclusion or deferral\. The lowercase presentations/spreadsheets folders and uppercase upstream names are represented accurately\.
- Each skill's assessment cites verified instructions/supporting files and explains available versus missing tools, platform/runtime requirements, dependencies, privacy/security or consequential\-action risks, broken references, provenance/licensing limits and overlap with existing OpenCode skills\. Static audit is not misrepresented as dynamic or live acceptance\.
- The useful material has a prioritized, actionable adoption design: documents/PDFs and local spreadsheets; imagegen prompting merged into the existing image skill rather than a duplicate runtime; optional OpenAI\-documentation guidance; and conditional local presentations\. Each entry names exact source material, existing/proposed destination, prerequisite/reuse decisions, Codex\-only replacements, acceptance checks, rollback and remaining gates\.
- The redaction data\-loss repair remains preserved with its byte\-identical upstream backup and failing\-before/passing\-after evidence\. Current evidence remains 11 paragraph tests passing and one ZIP/lxml integration case skipped unless fresh real execution changes that; no rendering or full document acceptance is inferred from the unit boundary\.
- Final audit, adoption roadmap and inventory agree with current source and include mechanically checked inventory/link/provenance coverage plus explicit limitations and blockers\. No ports, dependency installation, skill activation/deployment, account/permission changes, shared restart, publication, commit or push is performed under this planning request, and peer\-owned runtime/voice work is not duplicated\.

### Phase `baseline` — completed

> Establish exact skills ownership, source identity and preserved baseline without disturbing concurrent work\.

**Verification:**

> Generated full Git\-backed index: 494 files/30 skills, 480 text scans/14 PNG header checks, 84 Python AST passes, 222 relative links outside fences with four real missing external Pet contracts\. Combined audit/redaction suite: 18 cases, 17 pass and one lxml integration skip\. New audit/test source lint passes; original staged rename preserved\.

- **`scope-and-source` · completed:**
  > Verify this session's original user request, configured canonical skill root, imported bundle location and peer ownership boundaries\.
  - Evidence:
    > Read own original message msg\_18774ab70001OBr02ZynBh2eib: download latest PR's codex\-skills, recursively audit all skills, provide full inventory and exclusion reasons\. opencode\.json loads \./\.opencode/skills, not codex\-skills/\. Existing integration and voice chats accepted their separate findings; this session reserved imported skills\.
- **`provenance-baseline` · completed:**
  > Reconcile all imported files with the pinned PR inventory and document the exact local redaction delta plus preserved original; retain staged/index and unrelated\-source evidence\.
  - Evidence:
    > Local pinned commit exists\. verify\_audit\.py compared all 494 mode\-100644 Git blobs: 493 unchanged, one documented redactor delta whose retained original matches the expected blob\. AUDIT\-INDEX\.json records all paths/hashes/sizes and structural scans\. Staged rename remains R100; staged diff SHA\-256 91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805\.
- **`inventory-name-map` · completed:**
  > Map every actual directory, upstream frontmatter/display name and audit row; resolve the discovered presentations/spreadsheets name mismatch without renaming upstream content\.
  - Evidence:
    > Corrected AUDIT\.md to use exact lowercase presentations/spreadsheets directories, explicitly recording upstream capitalized names\. Actual Git\-backed verifier now reports exactly 30 inventory entries and inventoryErrors:\[\]; no imported names were changed\. Corrected prior false missing\-example links and misattributed installer flags\.

### Phase `recursive-audit` — completed

> Finish evidence\-backed compatibility, usefulness and safety assessments across every skill and supporting\-file closure\.

**Verification:**

> All 30 closure assessments and inventory rows match the pinned directory set/file counts; static scans cover all 494 files\. Supporting evidence and license/runtime/privacy/action boundaries recorded in SKILL\-REVIEW\.md\. Harness probes verify dependency/tool limits, prompt\-only image schema and official V2 semantics\. Redaction backup/fix retained; no ports, installs or runtime edits\.

- **`audit-all-closures` · completed:**
  > Review every skill's instructions and reachable bundled scripts/references/assets; record reviewed paths and actual platform/tool/runtime assumptions, missing links and provenance limits\.
  - Evidence:
    > SKILL\-REVIEW\.md now assesses all 30 closures with pinned file counts, supporting evidence, runtime assumptions, safety/provenance/license boundaries and overlap\. AUDIT\-INDEX\.json enumerates all 494 paths \(480 text scans/14 PNG header checks\)\. Semantic review covers entrypoints and selected risk\-bearing support; no exhaustive code\-security or live claim\. Documented real Google routing/CLI/marker drift and four missing external Pet contracts\.
- **`compare-harness-fit` · completed:**
  > Compare each imported capability with current OpenCode skills and exposed tools, distinguishing reusable guidance from absent Codex\-only, Windows, hosted\-product and Google Workspace integrations\.
  - Evidence:
    > Compared current opencode\.json canonical root and existing files\-and\-documents/chatgpt\-images/websearch/skill\-maintenance routes\. Live catalog discovery found no google\_drive; image schema is prompt\-only \(4000 chars\), not edit/mask/quality controls\. Fresh Python checks find Pillow/NumPy present but inspected authoring packages absent; LibreOffice/Poppler/font commands exist\. Official V2 skills page confirms path\-derived IDs and optional display\-name frontmatter; source policy conflict is documented, not patched\.
- **`decisions-and-reasons` · completed:**
  > Reconcile all 30 one\-line inventory rows with explicit keep/adapt/merge/defer/exclude decisions and evidence\-backed exclusion/deferral reasons; correct unsupported audit claims\.
  - Evidence:
    > AUDIT\.md has exactly 30 actual\-directory purpose/decision/reason rows using normalized vocabulary: 0 keep, 4 adapt, 1 merge, 6 defer, 19 exclude\. Mechanical comparison matches all 30 SKILL\-REVIEW sections and 494 closure files to the Git\-backed index\. Corrected V2 naming, find\-skills destination overclaim, Google routing, CLI and marker implications; rights gates explicit\.
- **`preserve-redaction-evidence` · completed:**
  > Retain and reverify the already implemented redaction regression fix, original helper bytes and honest unit\-versus\-integration test boundary\.
  - Evidence:
    > codex\-skills/documents/scripts/redact\_docx\.py retains expanded text in the final node; local\-fixes/upstream/redact\_docx\.py\.original SHA\-256 cd02f988732823adb6c1524398bf499cf7d93236871262bbab0074b95b7f4310 is unchanged\. Five expansion cases failed before repair\. Final unittest run: 12 cases, 11 passing, one skipped because lxml is unavailable; other 493 imported files matched the pre\-fix inventory\.

### Phase `adoption-design` — completed

> Define the smallest useful OpenCode adoption slices without activating or implementing them under the planning request\.

**Verification:**

> Reviewed the complete roadmap against the planning rubric and source paths: all selected documents/PDF/workbook/image/OpenAI\-docs/presentation material mapped; proposed files explicitly labeled; source preservation, rights, authoring/calculation/render/reimport/attachment limits, owner gates and narrow rollback included\. No canonical route/config/runtime was edited and no planned checks are claimed executed\.

- **`document-pdf-roadmap` · completed:**
  > Specify selected documents/PDF guidance and safe helpers to adapt into the existing files\-and\-documents route, including local dependency choices, source preservation, output validation and visual QA prerequisites\.
  - Evidence:
    > ADOPTION\-PLAN\.md section 1 maps exact document/OOXML/redaction/PDF sources to existing files\-and\-documents plus clearly labeled proposed format references/tests\. Recommends isolated python\-docx/lxml, optional pypdf/pdfplumber/reportlab and existing LibreOffice/Poppler, compares alternatives, specifies preservation/ZIP/XML/redaction/forms/render/reopen checks, rights/installation gates and scoped rollback\. All acceptance checks labeled planned\.
- **`spreadsheet-roadmap` · completed:**
  > Design the local spreadsheet adoption slice using an actually available or explicitly proposed authoring/recalculation stack; remove Codex artifact\-loader assumptions and define formula/format/output checks\.
  - Evidence:
    > ADOPTION\-PLAN\.md section 2 maps local workbook/create/edit/Q&amp;A/domain/chart sources to proposed files\-route reference/tests\. Compares openpyxl/XlsxWriter/stdlb CSV, explicitly separates writers from calculation and limits LibreOffice to approved copy\-based supported\-subset tests\. Defines formula/cache/oracle/visual/preservation/injection checks, excludes unsupported XLS/live/Google claims, and includes rights/install gates and rollback\.
- **`image-and-docs-roadmap` · completed:**
  > Specify imagegen prompting material to merge into chatgpt\-images without touching peer\-owned connectors, and assess whether OpenAI\-docs guidance merits a focused new skill or existing research reference\.
  - Evidence:
    > ADOPTION\-PLAN\.md sections 3/4 map selected prompting/sample sources into existing chatgpt\-images \(proposed reference/provenance only\), preserve prompt\-only 4000\-char schema and attachment/cancellation gates, and select optional OpenAI research reference under websearch instead of a duplicate skill\. Both include exact sources, excluded Codex/CLI/cache/model material, Apache provenance, acceptance checks and scoped rollback; connectors untouched\.
- **`presentation-and-exclusions` · completed:**
  > Define conditional local presentation prerequisites and acceptance; explicitly retain exclusions for unavailable Windows/Excel, hosted Sites/Pages/Spaces/Pets and Google\-connected workflows rather than inventing support\.
  - Evidence:
    > ADOPTION\-PLAN\.md section 5 keeps local presentations conditional on demand/rights/stack, maps exact template/finalization/native evidence/validator sources, compares PptxGenJS/python\-pptx/render alternatives and editable\-object limits, and defines round\-trip/visual/rollback gates\. Explicitly excludes Windows/live Excel, hosted Google/Pages/Spaces/Pets/Sites/visualize, production deployment and duplicate installers; no hidden implementation backlog\.
- **`ordered-adoption-contract` · completed:**
  > Produce ordered source\-to\-destination mappings, existing/proposed files, dependencies, ownership, per\-slice checks, reversible rollout/rollback and separate implementation/deployment gates\.
  - Evidence:
    > ADOPTION\-PLAN\.md contains ordered gated slices, exact source\-to\-existing/proposed destination tables, dependency alternatives, per\-slice planned checks/rollback and an eight\-step ownership/source/activation/deployment/real\-outcome contract\. Clarifies canonical source edits can activate next\-step discovery, so non\-discovered staging or exact activation authority is needed\. Rights/packages/live capabilities remain future adoption blockers, not unfinished planning work\.

### Phase `verification` — completed

> Audit the skills deliverables against the original request and publish truthful evidence\-backed conclusions locally\.

**Verification:**

> Final source\-backed scanner and saved index agree:494 files/30 skills,30 matching review rows,4 adapt/1 merge/6 defer/19 exclude,121 valid report filesystem links and all6 roadmap source families\. Python84/JS64/Bash5/TS82 syntax parses pass; actual combined suite21 cases yields20 pass/one lxml skip; scoped lint/format/whitespace pass\. Redactor semantic diff and original backup verified; staged R100 patch exact\. Licensing/absent dependency/live acceptance gates remain explicit future adoption conditions, not missing audit/planning deliverables\.

- **`coverage-and-links` · completed:**
  > Mechanically verify exactly 30 skill rows, actual folder/frontmatter mapping, required descriptions/decisions/exclusion reasons, recursive reviewed\-file coverage, relative references and preserved upstream/local\-fix hashes\.
  - Evidence:
    > Enhanced actual Git\-backed verifier checks normalized decisions/reasons, no unexpected files inside skill closures, 30 evidence/risk/license review sections with exact 494\-file counts and matching dispositions, all six selected roadmap sources, and 121 relative report links with zero broken filesystem targets \(anchors explicitly outside scope\)\. Fresh \-\-write\-index yields inventoryErrors:\[\],493 unchanged/one documented delta; proposed destination paths verified absent and labeled proposed\.
- **`checks-and-limits` · completed:**
  > Rerun relevant bounded source/syntax/regression checks without installing dependencies or running imported workflows; distinguish planned checks, executed static checks, unit results and missing document/runtime/live acceptance\.
  - Evidence:
    > Fresh final runs: combined unittest21 cases,20 pass/one lxml ZIP skip; Ruff lint passes for three owned Python sources and format check passes for verifier/tests\. Static source parses pass84 Python/64 JS/5 Bash/82 TypeScript5\.9\.3 files\. Backup SHA\-256 cd02f988732823adb6c1524398bf499cf7d93236871262bbab0074b95b7f4310 and staged patch91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805 preserved; owned whitespace scan clean\. No installs/helpers/live workflows or unrelated full\-project rerun\.
- **`final-skills-audit` · completed:**
  > Reconcile codex\-skills/AUDIT\.md and the adoption roadmap, report prioritized useful skills and every exclusion reason, verify preservation and close only after all immutable criteria have concrete evidence\.
  - Evidence:
    > Final immutable\-criteria audit: AUDIT\.md owns all30 exact\-directory purposes/normalized decisions/reasons and corrected display names; SKILL\-REVIEW\.md covers every closure with supporting evidence/runtime/risk/license/overlap limits; ADOPTION\-PLAN\.md supplies all six prioritized source mappings, proposed destinations, prerequisite alternatives, checks/rollback/approval gates\. Fresh build\_index equals saved AUDIT\-INDEX exactly,121 report links resolve,493/494 imports unchanged and sole redactor delta/backup verified\. Tests20 pass/one skip; no canonical/runtime or consequential action\.

### Decisions

- This goal owns Codex\-skill download/audit/selection/adoption planning; existing browser/runtime/launcher/connector and voice owners retain their accepted assignments\.
- Do not treat all pre\-existing changes under \.opencode/skills as this session's work\. Verify exact source/worker ownership before any later canonical skill edits\.
- Keep imported Codex instructions inert outside \.opencode/skills\. Preserve upstream bytes and document local fixes rather than silently rewriting imported history\.
- Observed naming discrepancy is directory\-versus\-upstream\-name casing: lowercase presentations/spreadsheets folders contain Presentations/Spreadsheets frontmatter\. Correct the inventory model, not the original folder names by assumption\.
- The present user request authorizes planning and goal tracking, not implementing skill ports or installing/activating them\. Future implementation and all consequential actions retain their applicable authority gates\.
- No user\-requested token, duration or auto\-turn limits were supplied; none were set\. Goal planning/lifecycle remains parent\-only\.

