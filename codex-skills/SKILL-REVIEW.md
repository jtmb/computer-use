# Per-skill evidence and OpenCode fit

Reviewed 2026-10-29 against PR #6 commit
`177c32635c8884d36524ad404ef6c2acdab35f26`.
The [inventory](AUDIT.md) owns purposes and decisions; this report explains the
supporting evidence. The [adoption plan](ADOPTION-PLAN.md) describes future work,
not installed capabilities.

## Method and common limits

Every one of the **494 pinned paths** belongs to exactly one of the 30 closures
below. [AUDIT-INDEX.json](AUDIT-INDEX.json) enumerates every path, blob, current
hash, size and scan result, including supporting files not individually named
below. All 480 UTF-8 files were read by the lexical/structural scanner; all 30
entrypoints and selected risk-bearing supporting files received semantic review.
The 14 PNGs received header/dimension checks, not visual review. This is a
recursive compatibility and static-risk audit, **not an exhaustive line-by-line
security review**, executed helper suite, asset-rights clearance or live test.
Locally added reports/tests/backup are not part of those 494 paths.

Common checks apply to **each** closure:

- File identity: 493 unchanged Git blobs; only the documented redactor differs.
- Metadata: unique upstream names, with two directory/display casing differences.
- References: 222 inline relative Markdown links outside fences; four missing
  external Pet contracts. Backtick commands, absolute paths, plugin URLs, anchors,
  tool signatures and runtime imports are separate compatibility evidence, not
  comprehensively validated by that link count.
- Syntax: 84 Python AST, 64 Node JavaScript, 5 Bash and 82 TypeScript-family
  parses passed. No dependency resolution, typecheck or workflow execution follows
  from those results. Perl and PowerShell were read/scanned, not syntax-checked.
- **L0**: no skill-wide license found inside that closure. Preserve provenance;
  absence of a notice is not permission to copy/adapt/distribute. Two third-party
  Sites component notices do not license the entire Sites bundle.
- **LA**: an Apache-2.0 notice is present in the named skill. Check provenance and
  preserve applicable notices/attribution for selected reuse; this is not legal
  clearance of every asset or a bundle-wide grant.
- **LR**: documents has an express restrictive notice; direct reuse is gated on
  verified rights. No extraction, redistribution or publication is recommended.

The present tool catalog exposes shell/read/search, web research, desktop/browser
integrations and ChatGPT image generation. Discovery found no Google Drive tool;
there is no exposed Codex dependency loader, Artifact Tool, Pages/Spaces, Pets,
Sites or live Excel contract. Tool discovery is a session observation, not a
claim that these integrations cannot ever be added. Desktop/browser source or
exposure is not proof of live input or GUI acceptance.

## `computer-use` — 1 file

- **Decision:** exclude.
- **Evidence:** [entrypoint](computer-use/SKILL.md) requires Windows SendInput,
  UI Automation, Windows.Graphics.Capture, `@oai/sky` and `node_repl`; three
  mandatory `../../docs/` references are external and not supplied by this PR.
- **Fit and risks:** incompatible with Linux/GNOME. Use existing `desktop-control`,
  `desktop-vision` and browser routes; never infer Windows confirmation rules or
  capture/input authority from this imported text. No support code is bundled.
- **License:** L0.

## `create-pet` — 21 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](create-pet/SKILL.md),
  [animation rows](create-pet/references/animation-rows.md), and the 18 Python
  scripts cover atlas assembly, Pillow frame inspection, continuity/quality
  gates and previews. [Atlas validator](create-pet/scripts/validate_atlas.py)
  is supporting code, not the missing shared contract.
- **Fit and risks:** local image processing is partly plausible with Pillow,
  but creation/activation requires imagegen, Library/upload and Pets APIs. Both
  external sprite-sheet/upload contracts are absent. Local PNG generation cannot
  establish a valid hosted pet. Do not confuse this with ordinary asset work.
- **License:** L0; no helpers selected for reuse.

## `deploying-to-prd` — 2 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](deploying-to-prd/SKILL.md) and `agents/openai.yaml`
  describe a particular WSL/SSH/Helm/Flux production target and data safeguards.
- **Fit and risks:** host paths/addresses are not current-host configuration or
  authority. Deployment, publication and data recovery are consequential and
  outside this goal. Generic `app-setup` is not an equivalent cluster workflow;
  maintainer policy retains a separately scoped external-cluster recovery gate.
- **License:** L0; do not replicate infrastructure details in new guidance.

## `documents` — 80 files

- **Decision:** adapt the local-document workflow, conditional on rights;
  do not directly port the helper bundle now.
- **Evidence:** [entrypoint](documents/SKILL.md), [manifest](documents/manifest.txt),
  [renderer](documents/render_docx.py), [OOXML relations](documents/ooxml/rels_and_content_types.md),
  [redaction guide](documents/tasks/redaction_anonymization.md) and
  [redactor](documents/scripts/redact_docx.py). The closure includes 26 task guides,
  four OOXML guides, renderer, audit/patch helpers, templates, troubleshooting,
  writing guidance, marker, icon and agent metadata; the index covers all of them.
- **Fit and risks:** render/reopen/compare and source preservation extend
  `files-and-documents`. Helpers import `lxml`, `python-docx`, `pdf2image`, Pillow
  and sometimes `openpyxl`; only Pillow among these inspected Python packages is
  present in default Python. LibreOffice/Poppler binaries exist but no document
  rendering was run. Workspace-loader, Google-import and citation contracts need
  replacement. The marker is only an argument validator, not evidence of a host
  transaction or an artifact being created. Privacy scrub, protection removal,
  accepting changes and redaction are destructive transformations, not default
  cleanup. Text masking is not complete removal from images, embedded data or all
  revision history. Regex and ZIP/XML handling need fixture and resource limits.
- **Source drift:** the guide uses nonexistent `--output` and `--preserve_length`;
  the real CLI has two positional paths and `--no_preserve_length`. Preserve the
  imported guide; document corrected future invocation separately. The retained
  expansion fix has 11 passing paragraph tests and one skipped ZIP/lxml case;
  neither that nor syntax checks proves full DOCX fidelity or secure redaction.
- **License:** LR, [explicit restrictions](documents/LICENSE.txt). Independently
  author from public format/library documentation if direct-reuse rights cannot
  be established; do not treat a renamed derivative as independent work.

## `excel-live-control` — 13 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](excel-live-control/SKILL.md),
  [Office.js](excel-live-control/officejs.md), domain/style/chart guidance and
  create/edit/read-only workflows target an active Excel/add-in session.
- **Fit and risks:** no Windows Excel, ChatGPT add-in or connected-document tool
  contract is exposed. Shell access to a local XLSX is not live Excel control.
  Formula correctness, target grounding and preservation ideas overlap the local
  spreadsheet candidate; prefer that route rather than duplicate live setup or
  Office.js execution. Writes could affect an open user's workbook.
- **License:** L0.

## `find-skills` — 1 file

- **Decision:** exclude.
- **Evidence:** [entrypoint](find-skills/SKILL.md) uses network `npx skills`
  discovery/install and explicitly documents `-g -y` global, no-prompt install.
- **Fit and risks:** popularity/star thresholds are not supply-chain verification.
  The command's actual destination must not be guessed as a Codex directory.
  Existing `skill-maintenance`/`repo-onboarding` own reviewed canonical sources;
  do not download executable packages merely to discover a skill.
- **License:** L0.

## `google-docs` — 24 files

- **Decision:** defer until an authorized connector and exact schema exist.
- **Evidence:** [entrypoint](google-docs/SKILL.md),
  [file-backed reads](google-docs/references/reference-trusted-read-wrapper.md),
  host bridges, dropdown runtime/planners and validation scripts. The wrapper
  saves authenticated raw/normalized responses and assumes `tools/load/store`
  plus Codex shell helpers; it cannot manufacture missing connector semantics.
- **Fit and risks:** no connector is exposed. Preserve tab/control ranges and
  revision identity; writing through an opaque control can destroy features.
  File-backed reads persist private content and need approved storage/retention.
  `new Function` bridge loading is not a reason to evaluate downloaded code in
  OpenCode Code Mode. **Routing drift:** this entrypoint permits native new Docs,
  while `google-drive` says it owns mandatory local-DOCX import. Resolve against
  actual supported behavior before any future adaptation.
- **License:** L0; native Docs is not implemented by local DOCX tooling.

## `google-drive` — 10 files

- **Decision:** defer until connector availability and authority are established.
- **Evidence:** [entrypoint](google-drive/SKILL.md) plus four Slides chart/scope/
  visual-change references and icons/metadata. It distinguishes native exports,
  stored bytes and authenticated materialization, and routes to sibling skills.
- **Fit and risks:** no Drive tool is exposed. Sharing, deletion, moves and
  conversion require exact target/readback and separate applicable authority.
  Preserve authenticated file references; never expose bearer transport URLs.
  Its future-state streaming fallback and fixed export assumptions require schema
  verification, not blind translation. New-Docs routing contradicts google-docs;
  its net-new Slides route also needs reconciliation with google-slides' boundary.
- **License:** L0; local files/browser tools are not a native Drive API substitute.

## `google-drive-comments` — 2 files

- **Decision:** defer until a Drive comments connector is available.
- **Evidence:** [entrypoint](google-drive-comments/SKILL.md) and agent metadata
  require file grounding, location evidence and comment/reply/resolve APIs.
- **Fit and risks:** comments may be unanchored; quote only scoped location evidence
  and verify returned state. Remote review publication is not local document
  commenting. Existing GitHub review tools are a different target and contract.
- **License:** L0.

## `google-sheets` — 13 files

- **Decision:** defer the connected workflow; assess local modeling separately.
- **Evidence:** [entrypoint](google-sheets/SKILL.md), nine references including
  [bounded reads](google-sheets/references/reference-live-read-search-safety.md),
  batch recipes, formulas, native cell structure, import, charts and visual QA.
- **Fit and risks:** no Sheets/Drive tools or Codex spreadsheet runtime exposed.
  Metadata-derived sheet IDs/titles and bounded exact ranges are useful principles;
  connector-specific 50,000-cell limits must be reverified. Imports can lose native
  features; writes, formula injection and sensitive data require scoped checks.
  Local spreadsheet adoption must not claim a native Google Sheet was created.
- **License:** L0.

## `google-slides` — 16 files

- **Decision:** defer until Slides/Drive connector and rendering contract exist.
- **Evidence:** [entrypoint](google-slides/SKILL.md), host export/render and template
  bridges, runtime geometry/design normalization and output-issue scripts. A
  bundled test file was syntax-checked, not executed in its intended environment.
- **Fit and risks:** native template edits require authenticated read/export/write;
  no such tools are exposed. The skill sends net-new decks without a native
  reference to Presentations; this differs from Drive's blanket new-Slides route.
  Chart sources and linked Sheets must not be silently replaced with snapshots.
- **License:** L0; local PPTX/LibreOffice is not native Slides acceptance.

## `imagegen` — 12 files

- **Decision:** merge selected prompt guidance into existing `chatgpt-images`.
- **Evidence:** [prompting](imagegen/references/prompting.md),
  [sample prompts](imagegen/references/sample-prompts.md), [entrypoint](imagegen/SKILL.md),
  CLI/API/network references, Python API client and chroma-removal utility.
- **Fit and risks:** scene/subject/constraints/output-intent ordering, restrained
  augmentation, literal text and small iterations fit the existing route. Current
  `chatgpt_direct.generate_image` accepts a prompt, not masks, reference uploads,
  size/quality/model controls. Prompt descriptions do not create these capabilities.
  Keep actual image attachment/inspection and allowance/cancellation safeguards.
  Do not port the separate `OPENAI_API_KEY` client, install `openai`, switch billing,
  promise alpha support or automatically repeat an uncertain generation.
- **License:** LA, [notice](imagegen/LICENSE.txt); selected text still needs attribution.

## `ingenium-kubernetes-deploy` — 11 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](ingenium-kubernetes-deploy/SKILL.md), private-access/
  state-transfer references and eight Python/PowerShell helpers for production
  access, forwarding, history/backup, metadata repair, manifests and writer audit.
- **Fit and risks:** bespoke production state/credentials/SSH/WSL/NAS workflows,
  not portable skill infrastructure. Python syntax passed; PowerShell did not run.
  Source snapshot, live-writer, restore and exact target requirements cannot be
  replaced with this audit. Do not run scripts, copy private target details, or
  import its instruction to avoid OpenCode into this OpenCode project's policy.
- **License:** L0.

## `maintain-space` — 2 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](maintain-space/SKILL.md) and metadata reference
  Page edits, evidence reconciliation and schedule consistency.
- **Fit and risks:** no Pages/Spaces APIs exposed; hosted page context is not
  authorization to mutate it. Target/kind resolution and draft-versus-write
  boundaries overlap local `files-and-documents`, but do not justify a fake Page
  implementation or saving private page text to memory.
- **License:** L0.

## `manage-schedules` — 2 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](manage-schedules/SKILL.md) and metadata assume Page
  IDs, hosted schedules, shared page instructions and automation lifecycle APIs.
- **Fit and risks:** persistent external work needs confirmed scope and access;
  selected page/action context must not become blanket recurring authorization.
  Existing `routine-automation` handles explicitly requested local recurring work,
  not the hosted product. No schedule was created in this audit.
- **License:** L0.

## `openai-docs` — 17 files

- **Decision:** adapt optionally after the higher-value local artifact work.
- **Evidence:** [entrypoint](openai-docs/SKILL.md),
  [official sources](openai-docs/references/official-docs.md), model selection/
  migration/prompting/diagnostics guides, [fallback](openai-docs/references/latest-model.md),
  manual fetch/cache and model resolver helpers.
- **Fit and risks:** official-source fetch-and-cite fits exposed research tools.
  Remove Codex self-identity and mandatory API-key skill assumptions; leave
  OpenCode questions with existing `opencode`. Fallback models/prices are not
  current verified facts. Do not run cache/resolver scripts or create private
  config/cache paths for a text-only guidance adoption. Reusing a requested model
  must not change the session provider/model or infer account entitlement.
- **License:** LA, [notice](openai-docs/LICENSE.txt).

## `organize-space` — 2 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](organize-space/SKILL.md) and metadata require Pages/
  Spaces hierarchy, lifecycle and cross-Space move tools.
- **Fit and risks:** absent tools; a move may alter effective audience/access.
  Local rename/move manifests in `files-and-documents` are a different surface.
  Do not translate hosted membership semantics into filesystem permissions.
- **License:** L0.

## `pdf` — 4 files

- **Decision:** adapt the local workflow into `files-and-documents`.
- **Evidence:** [entrypoint](pdf/SKILL.md), argument-only marker, icon and metadata.
  AcroForm guidance explicitly checks canonical field trees, page widgets,
  inherited values and appearance streams; a rendered value alone is insufficient.
- **Fit and risks:** Poppler exists; `reportlab`, `pdfplumber` and `pypdf` are absent
  from inspected default Python. Select/version dependencies before executing the
  example API. Avoid duplicate orphan repair, silent flattening/signature loss,
  automatic installation/cleanup and Codex citations. Do not certify a signed PDF
  or filled form from a screenshot. Existing Read supports inspection, not all
  authoring/form operations.
- **License:** L0; independently write guidance from public PDF/library docs or
  establish rights before copying text/code.

## `pets` — 2 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](pets/SKILL.md) and metadata distinguish stable IDs,
  collection pagination, active selection, temporary sprite URLs and deletion.
- **Fit and risks:** Pets APIs are absent. A temporary image URL is not identity;
  downloading/deleting a hosted pet cannot be emulated by editing a local PNG.
  There is no current overlapping local skill to activate.
- **License:** L0.

## `plugin-management` — 1 file

- **Decision:** exclude.
- **Evidence:** [entrypoint](plugin-management/SKILL.md) assumes ChatGPT plugin
  discovery, suggestion, permission inspection, connect/disconnect and removal.
- **Fit and risks:** absent app-management APIs; changing connections/permissions
  is consequential. Existing `opencode`/`repo-onboarding` cover OpenCode MCP and
  plugins with their actual schema, not the ChatGPT app catalog.
- **License:** L0.

## `presentations` — 61 files

- **Decision:** defer a local-only adaptation until authoring demand/stack/rights
  are established. Upstream display name is `Presentations`.
- **Evidence:** [entrypoint](presentations/SKILL.md),
  [implementation](presentations/references/implementation.md),
  [finalization](presentations/references/finalization.md), API reference tree,
  template fidelity tooling and package/layout/native-chart/table validators.
  All supporting paths are indexed, not just the entrypoint.
- **Fit and risks:** no Artifact Tool or dependency-loader contract. Helpers depend
  on `python-pptx`, `lxml`, NumPy, `pdf2image`, `pypdf`, Pillow, LibreOffice/Poppler
  and runtime JS modules, not merely a Node executable. Local file preservation,
  template dimensions/fonts and native editable chart/table checks are valuable.
  Copy-back-over-original behavior needs this consumer's preservation policy.
  Its finalizer reimport and structural gates do not establish visuals, facts,
  PowerPoint compatibility or Google acceptance. Exclude Spaces and Google routes.
- **License:** L0; do not copy validators/API docs on an inferred grant.

## `sites` — 133 files

- **Decision:** exclude as a hosted Sites bundle.
- **Evidence:** [entrypoint](sites/SKILL.md),
  [identity/secrets](sites/references/identity-and-secrets.md), integration,
  storage/preview/scheduling references, build preparer, vinext/Cloudflare starter,
  worker starter, connector bridges, lockfile, UI components and vendor notices.
  The valid connector-preview directory link is not a missing dependency.
- **Fit and risks:** bundled templates do not supply source-session/hosting APIs,
  Dispatch authentication, app consent, runtime secrets, D1/R2 or publication.
  Default publication conflicts with this task's explicit publication gate.
  Building/installing a template can execute package scripts and contact registries;
  identity headers require the correct trusted proxy. Browser tools and generic
  development conventions do not reproduce this hosted trust boundary.
- **License:** L0 for the whole skill; component notices apply only to their
  specified third-party material. No template build/install was performed.

## `sites-remix` — 1 file

- **Decision:** exclude.
- **Evidence:** [entrypoint](sites-remix/SKILL.md) depends on Sites remix, source
  sessions and publishing; it explicitly omits runtime data/settings from copies.
- **Fit and risks:** no such APIs; fresh source history does not imply database,
  credential or stored-file migration. Generic Git cloning is not equivalent.
  Creation and eventual publication require exact target and authority.
- **License:** L0.

## `skill-creator` — 9 files

- **Decision:** exclude as a duplicate route, not because its general advice is bad.
- **Evidence:** [entrypoint](skill-creator/SKILL.md),
  [YAML reference](skill-creator/references/openai_yaml.md), init/generate/validate
  Python scripts, icons, agent YAML and Apache notice. Scripts import PyYAML.
- **Fit and risks:** existing `agents-authoring`/`skill-maintenance` cover scope and
  progressive disclosure. Codex metadata/validators must not define OpenCode V2
  loader rules. The redlining/OOXML links are fenced examples, not missing required
  references. No need to install PyYAML or add another skill lifecycle route.
- **License:** LA, [notice](skill-creator/license.txt); no direct reuse selected.

## `skill-installer` — 8 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](skill-installer/SKILL.md),
  [installer](skill-installer/scripts/install-skill-from-github.py), list/GitHub
  helpers, icons, metadata and license. It validates paths and ZIP containment,
  refuses existing destinations, and may fall back from download to Git/SSH.
- **Fit and risks:** safety checks do not make mutable `main`, network downloads,
  credential fallback or `$CODEX_HOME/skills` the reviewed source/deploy workflow.
  Global changes and temporary cleanup need exact authority. `-g -y` is in
  find-skills, not this installer. Use existing skill-maintenance/onboarding.
- **License:** LA, [notice](skill-installer/LICENSE.txt).

## `spreadsheets` — 19 files

- **Decision:** adapt local files only. Upstream display name is `Spreadsheets`.
- **Evidence:** [entrypoint](spreadsheets/SKILL.md),
  [edit preservation](spreadsheets/workflows/edit_workflows.md),
  [read-only Q&A](spreadsheets/references/read_only_qna.md), create/style/domain/
  chart guidance, Artifact Tool quickstart/data-table/sparkline docs and routing.
- **Fit and risks:** source-grounded formulas, target-engine validation and minimal
  edits are valuable. Artifact Tool/loader are unavailable; `openpyxl`, XlsxWriter
  and pandas are absent in default Python. Writing formulas does not calculate
  them; LibreOffice conversion is not full Excel parity. Preserve macros, external
  links, pivots, validations and hidden state or refuse unsupported round trips.
  CSV formula injection and sensitive cell/formula disclosure need explicit care.
  `.xls` needs a separate conversion/reader decision; do not promise it from an
  XLSX-only library. Keep Google and live-Excel operations outside this slice.
- **License:** L0; independent workflow/public library docs or verified reuse rights.

## `template-creator` — 6 files

- **Decision:** exclude as a personal Codex gallery workflow.
- **Evidence:** [entrypoint](template-creator/SKILL.md), Google export bridges,
  template creation script, preview image and agent metadata.
- **Fit and risks:** writes to personal Codex skill directories and retains source
  artifacts/screenshots. Private documents/messages and copyrighted templates must
  not become shared skills by default. Existing skill-maintenance can support an
  explicitly scoped future template request without importing this gallery/runtime.
- **License:** L0.

## `update-pet` — 2 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](update-pet/SKILL.md) and metadata require stable custom
  pet identity, paginated discovery, sprite validation/upload and update readback.
- **Fit and risks:** missing two external shared contracts and absent Pets/image
  lifecycle tools; never create a replacement pet to simulate an update. Local
  image inspection is possible independently, not evidence of hosted mutation.
- **License:** L0.

## `visualize` — 13 files

- **Decision:** exclude as-is.
- **Evidence:** [entrypoint](visualize/SKILL.md),
  [renderer](visualize/scripts/render.py), standalone/share shells and host bridge,
  calendar widget/example and tweak guidance. Renderer includes local HTML export
  and a server, but no server was started in this audit.
- **Fit and risks:** OpenCode has no verified in-conversation visualize directive,
  host persistence, follow-up-message or `window.openai` rendering contract. The
  silence requirement conflicts with active communication instructions. A local
  HTML file is a different deliverable; serving uncommitted/private data or adding
  a host bridge is not authorized. Prefer ordinary tables/Mermaid or a separately
  requested local web project, with its own browser verification.
- **License:** L0.

## `write-page` — 6 files

- **Decision:** exclude.
- **Evidence:** [entrypoint](write-page/SKILL.md),
  [edit contract](write-page/references/edit-requests.md), content/runtime references,
  writing guidance and metadata require hosted native Page blocks and APIs.
- **Fit and risks:** no Pages tools; proposal versus mutation and selected-page
  authority matter. Native blocks, artifacts and citations cannot be replicated
  by writing Markdown while claiming hosted success. Local notes already have
  files-and-documents; private Page material is not general task memory.
- **License:** L0.

## Reconciled source and policy drift

1. Directory IDs and display names are different fields. The current official
   [V2 skills guide](https://opencode.ai/v2/docs/skills/) says IDs are path-derived,
   exact and case-sensitive; frontmatter is optional at runtime, `name` is a
   display label, and name/directory equality, kebab-case and description-length
   recommendations are not enforced. The two capitalized names are **not loader
   failures**. Local skill-maintenance prose still contains stronger/older schema
   assertions; that conflict is reported, not silently exported or repaired here.
2. Google Drive's new-Docs import mandate disagrees with google-docs' native-create
   route; new-Slides routing also differs. These are internal workflow conflicts,
   not unavailable-file claims. Future connected work must resolve them explicitly.
3. Redaction examples do not match their CLI. The data-loss repair fixes expanded
   text redistribution, not those examples or whole-document anonymization.
4. The four artifact markers in documents/PDF/presentations/spreadsheets only
   validate fixed arguments. Their successful exit would not prove artifact
   registration, authorization, transactions or actual output creation.
5. `find-skills` owns `-g -y`; skill-installer instead owns Codex destination and
   download/Git fallback. No evidence establishes find-skills' exact destination.
6. Fenced illustrative links are not missing required dependencies. No entrypoint
   or helper was rewritten to hide the actual missing external contracts.

## Disposition total and next boundary

**0 keep, 4 adapt, 1 merge, 6 defer, 19 exclude = 30.** Exclude means do not adopt
as an OpenCode route, not delete the preserved import. Defer means an explicit
missing capability/rights/stack gate must be resolved before reconsideration.
All decisions are for this consumer, not universal judgments of upstream quality.

The [roadmap](ADOPTION-PLAN.md) selects exact material and acceptance boundaries.
No dependency install, skill port, runtime/connector change, activation, deployment,
account change, shared restart, publication, commit or push is part of this audit.
