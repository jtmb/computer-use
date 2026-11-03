# OpenCode adoption plan — proposed, not implemented

2026-10-29 · PR #6 pin `177c32635c8884d36524ad404ef6c2acdab35f26`.
Read the [inventory](AUDIT.md) and [evidence/limits](SKILL-REVIEW.md) first.
This is an adoption design, not a deployed skill, installation procedure or claim
of document/image/live acceptance. Paths below are repository-relative unless linked.

**Later execution checkpoint (2026-10-30 UTC):** the separately approved
consolidated execution goal implemented independently authored document/image
references and selective routing, plus the optional
[official OpenAI source reference](../.opencode/skills/websearch/references/openai-official-sources.md)
under existing `websearch`. No imported helper/text was reused, no new top-level
skill or connector was installed, and the import remains inert. Source tests and
native skill readbacks are not authoring, physical, actual model-routing or human
acceptance. The original design below retains dependency/activation gates and
conditional presentation deferral; [features](../docs/features.md) records the
current scoped evidence rather than treating the original proposal as a receipt.

## Outcome, scope and observed baseline

Extend existing routes with small local artifact workflows and better prompting;
do not import a second platform or activate the Codex bundle. Preserve imported
originals, the documented redaction repair/backup/tests, and other owners' work.

- [opencode.json](../opencode.json) selects `./.opencode/skills`, not this import.
- Existing [files-and-documents](../.opencode/skills/files-and-documents/SKILL.md)
  preserves originals and supports inspection/organization, but is not an accepted
  DOCX/PDF/workbook authoring stack.
- Existing [chatgpt-images](../.opencode/skills/chatgpt-images/SKILL.md) owns actual
  image generation, safe session save, attachment and inspection. Its source and
  connector remain with their current owners; no reservation/approval is inferred.
- System Python has Pillow and NumPy. The inspected `lxml`, `docx`, `pdf2image`,
  `reportlab`, `pdfplumber`, `pypdf`, `openpyxl`, `xlsxwriter`, `pandas` and `pptx`
  modules are absent. LibreOffice, Poppler and font discovery executables exist.
  Root Node resolution found no `@oai/artifact-tool`, `docx`, `pdf-lib`, `pdfjs-dist`
  or `pptxgenjs`. This says nothing about every isolated environment/cache.
- No Codex dependency loader or hosted Google/Pages/Spaces/Pets/Sites/Excel tools
  are exposed. Browser/desktop availability is not a substitute for those schemas.
- No current end-to-end local authoring/render/reopen acceptance was performed.

## Prerequisites and order

| Order | Proposed slice | Entry gate | Result before any activation |
|---|---|---|---|
| 0 | Rights and ownership | Explicit implementation scope; current source/status/owners inspected | Rights record for selected material; no unresolved overlapping writer |
| 1 | Local DOCX and PDF | Rights-cleared reuse or independently authored public-source design; approved dependency plan | Existing files route gains narrowly linked local-document/PDF guidance and tested synthetic fixtures |
| 2 | Local spreadsheets | Same rights gate; selected writer plus explicit calculation engine | Local XLSX/CSV workflow with formula and preservation evidence |
| 3 | Image prompting merge | Coordinate with existing image-skill owner; preserve Apache notices | Short optional prompting reference, no connector/runtime changes |
| 4 | Optional OpenAI docs | Confirm gap beyond existing websearch/opencode; Apache provenance | Official-source reference, not a duplicate self-knowledge or provider route |
| 5 | Conditional local presentations | User demand, rights, selected stack and round-trip evidence | Local-only PPTX design; otherwise remain deferred |
| 6 | Activation/acceptance | Separate deployment authority and actual supported preview/apply workflow | Source parity, discovery, reference loading and representative real outcomes |

Dependencies 1 and 2 may stop at guidance/acceptance design if packages or reuse
rights remain unavailable. Slice 3 does not need the document stack. This order is
priority, not a grant to delegate or to execute any row. Implementation needs a
new explicit request; installation, activation/deployment, account/permission
changes, shared restart, publication, commit and push keep their separate gates.

### Rights and preservation contract

1. Keep `codex-skills/` inert. Do not add it to discovery or move imported files
   wholesale into the canonical root. Do not delete excluded skills.
2. Record origin/pin, selected paths/hashes, applicable notice and basis for reuse.
   [documents/LICENSE.txt](documents/LICENSE.txt) expressly restricts copying,
   extraction and distribution: **direct reuse is blocked pending verified rights**.
   Folders without a skill-wide license also need verified rights. Apache notices
   in imagegen/openai-docs do not extend to neighboring folders or all assets.
3. If rights are not established, independently design the workflow from public
   format/library documentation and permitted user requirements. Do not copy or
   paraphrase restricted helper implementations and call the result independent.
4. Reinspect scoped status/diffs and ownership immediately before future edits.
   The files route is already dirty; image skill is pre-existing untracked work.
   Never overwrite either from the import or attribute their whole diff here.
5. Keep human/private documents out of shared skills, fixtures and logs. Use new
   synthetic data. Source/output paths, temporary storage and final destinations
   follow the consumer's policy; this host permits project work and `/tmp/opencode`
   scratch, with final non-project documents under approved Documents locations.

## 1. Local documents and PDF

**Recommendation:** expand the existing files route, not two competing top-level
skills. Keep its entrypoint short and require only the relevant format reference.
Read-only requests must never create/export/rewrite an unchanged document.

### Source-to-destination selection

| Imported assessment source | Proposed destination and use | Not selected |
|---|---|---|
| [documents/SKILL.md](documents/SKILL.md), [read/review](documents/tasks/read_review.md), [render verification](documents/tasks/verify_render.md), [renderer](documents/render_docx.py) | Existing `.opencode/skills/files-and-documents/SKILL.md` and README: local DOCX route. **Proposed new file:** `.opencode/skills/files-and-documents/references/local-docx.md`: inspect/copy/edit/render/reopen/compare contract, rights-cleared or independently authored | Codex loader paths, compulsory citations, rigid universal title/typographic rules, Google import, automatic copy-back |
| [OOXML tracked changes](documents/ooxml/tracked_changes.md), [comments](documents/ooxml/comments.md), [relations](documents/ooxml/rels_and_content_types.md) | Later sections of proposed `references/local-docx.md`, only after feature-specific package/reopen fixtures pass | Bulk acceptance/removal of revisions, comments, protection or metadata as implicit cleanup |
| [redaction task](documents/tasks/redaction_anonymization.md), [repaired helper](documents/scripts/redact_docx.py), [tests](local-fixes/test_redact_docx.py) | Retain as audit evidence only now. A rights-cleared helper adaptation would need a separately specified implementation/test pair; do not copy it into the canonical route by default | Uncorrected CLI examples; claim of forensic redaction; inference of whole-DOCX fidelity from paragraph tests |
| [pdf/SKILL.md](pdf/SKILL.md), particularly AcroForm checks | **Proposed new file:** `.opencode/skills/files-and-documents/references/local-pdf.md`: public-source or rights-cleared creation/extraction/form/reopen/render guidance | Marker, Codex citation syntax, automatic installs, forced flattening, automatic deletion of intermediates |

Future tests, if implementation is approved: **Proposed new file:**
`scripts/test_local_document_workflows.py`. It should test only actually implemented
helpers. Do not create pretend fixtures/tests to certify a prose-only plan.

### Dependency alternatives and implementation boundary

- **DOCX recommendation:** proposed isolated Python environment with pinned
  `python-docx` and `lxml`; LibreOffice conversion and Poppler page rendering with
  explicit paths/timeouts/private per-job profile. Avoid needing `pdf2image` when
  a bounded direct Poppler command suffices. All version/API compatibility is an
  implementation-time check. Neither environment creation nor package installation
  is currently authorized.
- For advanced tracked changes/comments, use public OOXML documentation and a
  minimal tested package patcher only if the chosen library cannot preserve them.
  Do not rebuild every helper. Reject unsupported features instead of stripping
  them. Node `docx` is an alternative for new documents, not automatic fidelity for
  existing complex files; it is also absent.
- **PDF recommendation:** proposed `pypdf` for fields/package editing,
  `pdfplumber` for requested text/table extraction and `reportlab` only for new PDF
  authoring. Inspect current public API docs and pin a version supporting the
  required calls before translating the imported example. For simple read-only
  review use existing Read/Poppler; no authoring packages are then necessary.
- Skip password-protected/signed/macro-bearing or malformed files when the stack
  cannot safely support them. Never run embedded code, relax XML protections,
  follow external relationships or fetch linked resources without separate scope.

### Acceptance checks — planned, not executed

1. Read-only inspection leaves input bytes/mtime and artifact count unchanged.
2. Creating/editing uses a new output, preserves source hash and fails on a distinct
   existing destination; interrupted writes never replace the original. ZIP/XML
   reads are bounded against traversal, oversized expansion and external entities.
3. DOCX synthetic fixtures include split runs, Unicode, headers/footers, table,
   footnote, comment, tracked edit, hyperlink and section break. Reopen checks
   content/relationships and unmodified parts; render all pages of a new document
   or changed areas plus a whole-document unintended-change scan for edits. Compare
   reference fonts, page count, wrapping and geometry. A render pass is not editing
   fidelity; missing font/features are reported, not silently normalized.
4. If redactor reuse becomes authorized, rerun the existing 11 paragraph cases,
   enable the real ZIP/lxml case, add non-main-document parts and adversarial
   fixtures, verify unrelated parts and source retention, then render. Inspect
   comments/deleted text/images/embedded objects separately; do not promise complete
   anonymization from text-node masking. Correct CLI examples require two paths;
   do not invent `--output` or positive `--preserve_length` flags.
5. Interactive PDF fixtures include normal/orphan/parent-child/ambiguous duplicate
   fields and stale appearances. Reopen and compare canonical `/V`, effective widget
   values and `/AP` appearances; reject ambiguous repair rather than duplicate
   fields. Render final pages. Flatten only on explicit request, verify no Widgets
   or AcroForm remains, retain the editable original and disclose signature impact.
6. Final file exists in the approved destination, opens with the target stack and
   is inspected. Report source, syntax, unit, package/round-trip and visual checks
   separately. No Google Docs/native PDF-signature acceptance is inferred.

**Rollback:** return routing to its inspected pre-slice baseline by reversing only
this slice's reviewed hunks, preserving concurrent edits and originals. Keep outputs
and QA evidence unless cleanup is explicitly authorized. A failed rendering/helper
gate disables that route; it does not trigger silent dependency install or fallback
to a hosted service. Any later deployed copy uses its own verified backup/restore
workflow, not edits to runtime files.

## 2. Local spreadsheets

**Recommendation:** begin with a bounded local XLSX/CSV reference under the files
route, not an ambient spreadsheet skill or a claim of live Excel/Google support.
Split into a dedicated skill only if real usage outgrows that routing, under a
separate reviewed change. Reuse rights remain unresolved for this closure.

| Imported assessment source | Proposed destination and use | Not selected |
|---|---|---|
| [spreadsheets/SKILL.md](spreadsheets/SKILL.md), [creation](spreadsheets/workflows/create_workflows.md), [editing](spreadsheets/workflows/edit_workflows.md), [Q&A](spreadsheets/references/read_only_qna.md) | Existing files-and-documents entry/README link to **Proposed new file:** `.opencode/skills/files-and-documents/references/local-spreadsheets.md`: minimal models, source/assumption/output lineage, exact-scope edits, read-only boundary and formula QA | Artifact Tool APIs, workspace loader, marker, Codex citations and Google/live-Excel routing |
| [financial models](spreadsheets/domain_guidance/financial_models.md), [healthcare](spreadsheets/domain_guidance/healthcare.md), [marketing](spreadsheets/domain_guidance/marketing_advertising.md), [scientific research](spreadsheets/domain_guidance/scientific_research.md), [charts](spreadsheets/features/charts.md), [styles](spreadsheets/style_guidelines.md) | Optional domain-specific sections of proposed reference after rights/public-source review; activate by actual task, not employer/role alone | Universal finance colors/tab structure; hard-coded chart/runtime methods; loading all domain guides for every workbook |

**Proposed new file:** `scripts/test_local_spreadsheet_workflows.py`, only alongside
implemented helpers and synthetic workbooks in a future approved slice.

### Writer and calculation decision

- **Proposed preferred stack:** `openpyxl` for scoped XLSX inspection/editing;
  XlsxWriter only when new-workbook features justify a second writer. Both need
  approved pinned installation. Standard-library `csv` suffices for basic CSV/TSV;
  pandas is not a required dependency and is not a fidelity-preserving editor.
- Neither writer is a general Excel calculation engine. Use an explicitly
  approved isolated LibreOffice round trip on a **copy** for formulas within its
  supported subset; record version/locale/engine and compare values with an
  independently computed small fixture oracle. Reopen formulas and cached values
  separately. `data_only` reads are not fresh recalculation.
- Reject unsupported dynamic arrays, iterative models, macros, external links,
  pivots, complex charts or precision-sensitive formulas when preservation cannot
  be proven. Do not silently use LibreOffice to flatten/rewrite an existing
  Excel-specific workbook. Native Excel acceptance requires a separately provided
  supported session; no such runtime is assumed.
- `.xls` is not an openpyxl format. Leave binary XLS/conversion and general XLSM
  editing out of the initial contract. Prefer truthful limited XLSX/CSV support to
  claiming the import's whole format list. Avoid using formula evaluation libraries
  as silent full-Excel substitutes.

### Acceptance checks — planned, not executed

1. Read-only requests leave file bytes/mtime unchanged and export nothing. Relevant
   formulas/precedents, dates, units and rounding are inspected, not guessed from
   displayed text. No private cell values/formulas leak into test evidence.
2. Synthetic fixtures cover a labeled input/assumption/calculation/output flow,
   cross-sheet references, date/percentage/currency types, Unicode, error cells,
   zero/missing values, validations, named ranges, styles and a chart. Verify known
   independent totals and changed-driver outputs, not just file-open success.
3. Preserve formulas as formulas, recalculate with the declared engine when
   supported, then reopen formulas **and** cached results; fail on stale/error
   caches instead of stating a correct calculated result. Do not mistake an
   intentionally blank/unsupported calculation for zero.
4. Targeted edits preserve unrelated sheets/cells/objects/relationships, hidden
   state, protection, dimensions, filters, freeze panes and validations. Keep
   originals and compare package inventory/formulas/styles; stop if the writer
   drops an unsupported feature. Do not sheet-wide autofit/restyle a narrow edit.
5. Render new sheets, or changed ranges/dependencies plus unintended-change scans
   for edits; inspect clipping, `####`, legends, units and print boundaries. Static
   previews do not prove workbook interactivity or native Excel compatibility.
6. CSV/TSV export preserves requested delimiter/encoding/types; flag spreadsheet
   formula-injection risk for untrusted leading `=`, `+`, `-`, `@` content and use a
   declared safe text-export policy without silently changing source semantics.

**Rollback:** reverse only this slice's routing/reference/helper hunks against its
captured baseline; keep source and generated workbooks/evidence. Revert to read-only
inspection if calculation or feature preservation fails. Do not uninstall shared
packages, reset the repository or delete user work as rollback.

## 3. Image prompting merge

**Recommendation:** merge a short optional reference into existing `chatgpt-images`,
with that owner's agreement. No new imagegen skill and no connector implementation.

| Exact source | Destination and selected material | Excluded material |
|---|---|---|
| [prompting.md](imagegen/references/prompting.md): Structure, Specificity, Composition, Constraints, Text, Iterate | **Proposed new file:** `.opencode/skills/chatgpt-images/references/prompting.md`; existing SKILL.md links it only for nontrivial prompt composition | CLI-only size/quality/model/mask/fidelity controls; unsupported input-image/edit capability |
| [sample-prompts.md](imagegen/references/sample-prompts.md) | At most a few attributed brief examples in that proposed reference, treated as optional recipes rather than compulsory augmentation | Wholesale example library, unrequested objects/branding or invented creative constraints |
| [Apache notice](imagegen/LICENSE.txt) and pinned source | **Proposed new file:** `.opencode/skills/chatgpt-images/PROVENANCE.md`; preserve required license/attribution with selected reused text, subject to provenance review | Claim that one skill's notice licenses the whole import |

Discover the active image schema again before implementation/acceptance. Today's
tool accepts only a prompt of at most 4,000 characters. References may help describe
intent but do not authorize image uploads, mask edits, transparency guarantees or
arbitrary format/quality/size settings. Preserve existing direct attachment, actual
image inspection, safe-save, allowance and uncertain-cancellation rules unchanged.
Do not copy API-key CLI/network/chroma-removal helpers or generate test images now.

**Acceptance — planned:** review paired precise/generic prompts to confirm exact
user constraints survive and extras are not invented; keep literal text verbatim;
one requested follow-up changes only its named aspect. Static routing tests check
that unavailable edits are reported, not sent as invented arguments. A separately
authorized real generation must return an actual image, preserve its approved
location, and be inspected against the prompt. A fixture/path/text success is not
image delivery or human-visible thumbnail acceptance. No billed retry loops.

**Rollback:** remove only the merge's routing/reference/provenance additions or
restore its reviewed hunks; preserve current connector, prior image workflow and
all existing/generated assets. Coordinate rollback if the owner has since edited
the same files; never use the import as a replacement baseline.

## 4. Optional official OpenAI documentation guidance

**Recommendation:** prefer a focused reference under existing `websearch`; do not
add a standalone skill unless routing evidence demonstrates a recurring gap.
OpenCode self-knowledge remains with `opencode` and current official V2 docs.

| Exact source | Destination and selected material | Excluded material |
|---|---|---|
| [openai-docs/SKILL.md](openai-docs/SKILL.md), [official-docs.md](openai-docs/references/official-docs.md) | **Proposed new file:** `.opencode/skills/websearch/references/openai-official-sources.md`; existing websearch entry/README adds narrow routing for explicit OpenAI product/API documentation | Treating “you/this app” as Codex, mandatory docs-first before unrelated local inspection, compulsory key-skill invocation |
| [model selection](openai-docs/references/model-selection.md), [migration](openai-docs/references/model-migration.md), [prompting guide](openai-docs/references/prompting-guide.md) | Only durable exact-model preservation, official-source verification and uncertainty guidance in the proposed reference | Static “latest” model/price snapshot, resolver/manual/cache executables, provider/default/model changes |
| [Apache notice](openai-docs/LICENSE.txt) and pin | **Proposed new file:** `.opencode/skills/websearch/PROVENANCE.md`, or an existing provenance record if one is discovered at implementation | Cross-bundle license inference |

Use actual exposed search/fetch schemas; search current official sources and fetch
the supporting page rather than citing snippets. Do not configure a new provider,
sign in, add API credentials or install a documentation MCP merely to port guidance.
Domain policy must distinguish developer API docs, ChatGPT help/product sources and
OpenCode V2 docs rather than blindly retain an overly narrow static domain list.

**Acceptance — planned:** explicit OpenAI API question gets current supporting
official-page citations; requested model stays exact; unsupported price/entitlement
claims stay uncertain. Generic software questions do not detour into Codex manuals;
OpenCode questions use the V2 route. Missing search/fetch fails truthfully without
new accounts/credentials or fabricated citations. No default/model changes occur.
Static tests establish wording/routing coverage only; representative real research
is separately verified. **Rollback:** reverse only the optional reference/routing
hunks and retain existing websearch/opencode functionality and provider settings.

## 5. Conditional local presentations and retained exclusions

**Decision:** remain deferred until a real local PPTX request justifies a selected
stack, reuse rights and feature-preserving round trips. Do not activate the 61-file
bundle or treat its bundled Artifact Tool API reference as an available SDK.

| Exact assessment source | Conditional future destination | Required replacement |
|---|---|---|
| [template following](presentations/references/template_following.md), [implementation](presentations/references/implementation.md), [finalization](presentations/references/finalization.md), [native evidence](presentations/references/native_evidence.md) | **Proposed new file, conditional:** `.opencode/skills/files-and-documents/references/local-presentations.md`; existing files entry/README only after acceptance | Actual selected author/export/reopen/render commands, consumer paths and preservation; no loader/artifact sessions/host citations |
| [package integrity](presentations/container_tools/inspect_presentation_package_integrity.py), [layout geometry](presentations/container_tools/inspect_presentation_layout_geometry.py), [template fidelity](presentations/template_following_scripts/check_template_fidelity.mjs) | Assessment examples only; independently implement minimal checks from public formats or establish rights before reuse | Small selected validators and real fixture evidence, not wholesale copy or inferred Artifact Tool reimport success |

**Stack options:** proposed PptxGenJS for new decks with editable objects, or
python-pptx for selected supported template edits; neither is currently available.
LibreOffice/Poppler can supply rendering after an isolated copy-based conversion
test, not full PowerPoint fidelity. An HTML-to-slide screenshot pipeline is simpler
but loses native editability and is inappropriate when editable charts/tables are
required. Do not install or select all stacks speculatively. Exact target-feature
requirements choose the stack at implementation time.

**Acceptance — planned:** new and templated synthetic decks reopen with correct
slide count/dimensions/fonts, relationships and requested editable native objects.
Check declared table arithmetic/chart values independently; preserve workbook
lineage instead of replacing formulas with snapshots. Render every slide and
inspect at full size, compare templates, verify no clipping/overlap and trace
research/assets. Structural gates are not visuals or facts; LibreOffice is not
PowerPoint/Google Slides acceptance. **Rollback:** reverse only conditional route/
helper changes, preserve input/draft/final evidence, and leave the route deferred
if feature preservation or rendering fails.

### No hidden implementation backlog for excluded products

The [30-row inventory](AUDIT.md#complete-skill-inventory-and-decisions) and
[per-skill evidence](SKILL-REVIEW.md) retain every exclusion/deferral and its reason.
These mappings deliberately do **not** implement:

- Windows `@oai/sky`, live Excel/add-in or Office.js sessions.
- Google Docs/Drive/comments/Sheets/Slides. Reconsider only after separately
  authorized connector discovery, exact schema/target/readback and rights review;
  resolve contradictory new-Docs/new-Slides routing then. No browser fallback is
  implied and no account/permission change is made.
- ChatGPT Pages/Spaces/schedules, Pets, Sites/remix, visualization host/persistence,
  plugin/account management or personal artifact gallery/template ingestion.
- Production Kubernetes/access/state-transfer workflows, ecosystem installers or
  duplicate skill-authoring/lifecycle tooling.

Local outputs never count as native Google/Excel/hosted product success. Future
work on any excluded product is a new scoped decision, not an unfinished port
silently included in this goal.

## 6. Per-slice rollout and acceptance contract

1. **Claim a bounded source slice, not another owner's implementation.** The future
   parent implementer first confirms exact file ownership and current diffs. This
   audit owns only `codex-skills` reports/verifier/redaction evidence. Image/runtime,
   browser/security/launcher and voice owners keep their accepted source work.
   Peer source-test reports do not establish GUI acceptance or transfer authority.
2. **Inspect current public docs, rights and dependencies.** Record exact reuse
   material/notices or independent sources, package versions, interpreter path and
   approved install location. The plan intentionally does not invent version pins
   for packages not selected/installed. No unapproved global install or secrets.
3. **Implement the smallest source-only slice.** Existing destinations are the
   files/image/websearch routes above. All new references/provenance/tests are
   explicitly proposed. Add helpers only for tested necessary behavior. Update
   the actual [.opencode skill catalog](../.opencode/skills/README.md) and relevant
   usage guide when routing changes; update [features](../docs/features.md) only
   when source capability changes, distinguishing proposed/source/deployed/live.
   Do not rewrite AGENTS or importer originals to make a check pass.
4. **Verify locally before activation.** Validate references, schema against actual
   V2 behavior/consumer conventions, absence of Codex tool contracts in active
   instructions and preservation of neighboring routes. Run behavior-specific
   synthetic tests, failure controls, package round trips and visual checks above.
   Follow the [test-quality cadence](../docs/test-quality-audit.md#when-to-review).
   A prose/source test alone cannot establish model or rendered behavior.
5. **Treat canonical source edits as potential activation.** This project's source
   root is itself discoverable; a new `.opencode/skills` file can affect the next
   model step without global deployment. Obtain applicable activation authority
   before that boundary, or use an approved non-discovered staging/worktree first.
   Do not assume changing the directory name hides it from every config source.
6. **Deploy only with separate exact authority.** Reinspect [setup](../setup.md),
   [onboarding](../onboarding.md) and the selected deployment tool; preview only
   the intended bundle and preserve target backups. Do not run broad onboarding
   or activate unrelated plugins to deliver a reference. No shared restart unless
   specifically required and approved. Never patch deployed copies directly.
7. **Observe actual discovery and behavior.** Confirm exact path-derived skill ID,
   selected definition and optional display name; explicitly read its required
   reference and exercise a representative authorized workflow. Verify real output,
   provenance, source preservation and attachments/visuals where relevant. Report
   source tests, loaded definitions, model behavior and GUI/human outcomes separately.
8. **Stop or roll back narrowly on failed gates.** Preserve diagnostics/inputs,
   reverse only slice-owned reviewed hunks and restore only exact deployed targets
   through verified backups when authorized. No blanket reset, cleanup or package
   removal. Unresolved rights, unsupported feature preservation or missing live
   capability keeps the affected route blocked, not silently substituted.

### Completion of this planning goal versus later adoption

This goal is satisfied by the verified preserved import, complete purposes/
decisions/reasons, per-skill evidence and actionable roadmap—not by implementing
the roadmap. Rights and absent-package/live-tool gates remain **future adoption
blockers**, not hidden claims of completed ports. The redaction fix's ZIP/lxml test
remains skipped and no final artifact rendering is claimed.

Plan review against the planning rubric: scope/outcome, evidence/paths, labeled
proposed files, order/dependencies, alternatives, risks/rollback, observable planned
checks, ownership/dirty work and authorization boundaries are covered. No current
architecture diagram or fabricated setup/test command is needed. Final mechanical
inventory/link/provenance verification belongs in [AUDIT.md](AUDIT.md), separately
from these future acceptance criteria.
