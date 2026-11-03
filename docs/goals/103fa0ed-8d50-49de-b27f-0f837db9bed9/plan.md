# Plan — `103fa0ed-8d50-49de-b27f-0f837db9bed9`

- Goal ID: `103fa0ed-8d50-49de-b27f-0f837db9bed9`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T18:08:11.039Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `6`
- Record: `archive`

## Goal objective

> Implement and verify the approved critical voice\-assistant review: redesign transcript review as compact professional OpenCode\-native\-themed responsive UI preserving Enter/C/E/Esc; repair worker terminal\-failure settlement, retained\-draft and ambiguous\-submission recovery, review/edit/dialog lifecycle, and honest new\-session creation\-race handling\. Preserve previously implemented offline Sherpa/Piper voices, timing, first\-message routing and all unrelated dirty work\. Add regression tests and verify relevant source checks plus supported live TUI mic/F9, settings/picker/preview and review/edit/continue/send/readout flows where available; distinguish controlled/synthetic from human acceptance and record concrete unavoidable blockers rather than claim success\. Update user docs and acceptance status including fresh bridge evidence\. Use only supported public APIs, unchanged host binary/shared service, no security bypass, no commit/push or unrelated deletion\. Work autonomously until all achievable approved scope is verified\.

## Persisted plan

Plan revision: `6` · updated 2026-10-29T17:44:45.000Z

> Reliability and review source delivered; finish independent documentation while live acceptance remains blocked by desktop input/native FFI\.

### Completion criteria

- Compact responsive themed review preserves editing, continuation, discard and explicit send with regression and rendered evidence\.
- Worker death and pending selection settle without stuck controls; failed/uncertain submission retains visible recoverable text without automatic duplicate admission\.
- Session navigation and review/editor lifecycle preserve original scope and unrelated UI; new\-session race semantics are accurate\.
- Relevant full checks and supported live voice workflow checks are recorded separately; genuine environmental/human blockers are explicit\.
- Docs reflect current verified behavior; unrelated work, host/service, security and no\-commit/no\-push boundaries preserved\.

### Phase `reliability` — completed

> Repair terminal failures and recoverable submission state with regressions\.

**Verification:**

> SDK typing and reliability regressions pass, including actual controller/transport and public client helper with mocked I/O only\.

- **`baseline` · completed:**
  > Verify current tree, ownership and supported UI/client capabilities\.
  - Evidence:
    > Nested dirty/untracked baseline preserved; SDK2\.1\.1 inspected; only owning TUI9393/worker47009; bridge inventory available\.
- **`worker_failure` · completed:**
  > Settle worker terminal failure and pending selection; regression tests\.
  - Evidence:
    > New exit/spawn/stdin failure, controller finishing release and picker settlement regressions pass; test transpilation corrected to ESNext\.
- **`submission` · completed:**
  > Retain visible failed/uncertain submission and prevent blind duplicates; test new\-session races\.
  - Evidence:
    > submitOnce reconciles pending/delivered IDs without another prompt\. Exact edited text retained after uncertainty; displaced review resumable only at original epoch\. Creation\-in\-flight orphan race tested and accurately reported\.

### Phase `review` — completed

> Deliver compact transcript\-first review with safe owned lifecycle\.

**Verification:**

> SDK typecheck and82TS/87Python checks pass; native rendering explicitly remains unverified\.

- **`review_ui` · completed:**
  > Implement responsive themed review and keyboard/mouse/scroll lifecycle regressions\.
  - Evidence:
    > Medium size, bounded content height, explicit row/narrow action grouping, semantic colors, release hit areas, scroll bindings, in\-place editor and input\-mode deferral with six passing review regressions\.

### Phase `docs` — completed

> Publish accurate local docs and audit objective\.

**Verification:**

> Final docs/source audit separates source, installed\-model, historical service and current desktop evidence\. Current bridge capture is available; input INPUT\_FAILED/nativeFFI blocker explicit\. No live redesigned UI/key/human claim\.

- **`documentation` · completed:**
  > Update README/acceptance/contract and feature inventory as needed, verify final diff and goal criteria\.
  - Evidence:
    > README, ACCEPTANCE current banner/latest checkpoint, recording contract and only parent features voice row updated; prior checkpoints retained\. Links/fences and nested/parent whitespace pass\. Final full suite83TS\+87Python/types/lint passes; targeted7review tests pass after strengthened full\-draft assertion\. ELF baseline matches; no staged/commit/push, unrelated work preserved\.

### Phase `acceptance` — blocked

> Run source checks and supported live UI/voice checks; fix defects\.

**Blocker:**

> Live input refuses Ctrl\+P with INPUT\_FAILED; Node22 lacks native FFI\. No bypass or unrelated installation\.

- **`checks` · completed:**
  > Run full package checks, whitespace and relevant parent health; quality audit\.
  - Evidence:
    > npm run check82TS\+87Python/types/lint; parent health and whitespace pass\. Actual installed Sherpa PCM smoke12conditions, paused speech, explicit/empty finish, idle/noise and network refusal pass; first partial0\.859s\.
- **`live` · blocked:**
  > Verify supported rendered controls and bounded real voice flows, separately recording human\-only limits\.
  - Blocker:
    > Fresh GNOME windows/capture works but desktop\.input Ctrl\+P returns INPUT\_FAILED; release succeeds\. Standalone renderer fails on Node22 native FFI\. Actual redesigned review/settings/picker/F9/human workflows unverified\.

### Decisions

- Documentation of verified source and explicit failed live checks is independent of achieving live acceptance; it must not be skipped due to acceptance phase gate\. No completion criteria removed\.
- Final audit: reliability, submission recovery, lifecycle and compact UI source plus regression/documentation work delivered\. Criterion requiring rendered review evidence remains unmet: supported input fails and installed Node22 renderer lacks nativeFFI\. No further independent approved work can close that gate without fixing the desktop input integration/appropriate runtime or user\-driven live acceptance\. Do not mark complete from83TS\+87Python/PCM/health evidence\.

