# Efficiency comparison — entry evidence and observed usage

**Status, 2026-10-28:** actual runtime token/cache/reasoning counters are now
observed read-only. A controlled Code Mode versus direct-tools **model** comparison
remains blocked: no clean, independently exposure-verified pair was identified.
The historical browser entry runs below remain partial evidence, not model
benchmarks. No new model dispatch, browser input or user-visible acceptance ran
for this counter collection. See [current scope](../request-coverage.md).
The original runtime snapshot was unscoped; corrected exact-source gates are
verified by offline fixtures only, not a new live collection.

## Historical entry-level measurement

Run the production browser registrations under both exposure settings against a
synthetic page served only on `127.0.0.1`:

```bash
node --experimental-strip-types tools/computer-use-browser/efficiency-acceptance.mjs
node --test tools/computer-use-browser/efficiency-acceptance.test.mjs
```

The acceptance harness uses the same production `registerBrowserTools`,
`withSerializedTools`, and `applyCodemodeDefault` path as the browser slice of
`.opencode/plugins/computer-use/index.ts`. It checks the `codemode` flag on all
eight registered browser tools in each condition, then directly invokes the
registered `web.open`, `web.snapshot`, and `web.close` execute functions with
unique sessions. The browser uses a fresh profile root under a private,
run-specific `/tmp/opencode` directory. Chromium remains visible and sandboxed;
the harness requires `DISPLAY` or `WAYLAND_DISPLAY` and has no headless fallback.
No user authentication, external fixture traffic, screenshot, or desktop input
is involved. The permission callback is a local no-op stub, not the live
OpenCode permission service.

| Metric | Instrumentation | Boundary / limitation |
| --- | --- | --- |
| Registered exposure | Production tool options after the real exposure transform | Default must mark all eight `web` tools `codemode: true`; `directTools: true` must mark all eight false. This observes flags, not model planning or dispatch. |
| Tool calls | Count and names of `tool.execute` invocations | Three actual production tool functions per condition; direct harness invocations are not model-issued tool calls. |
| Tool execution latency | Monotonic wall time around each registered `execute` | Includes queue, stub permission check, manager/backend work; excludes model/API time. One sample per condition is descriptive only. |
| Backend latency | Monotonic wall time around real `BrowserManager.start`, `execute`, and `cancel` methods | `start` includes browser worker startup. This is not a server or model round-trip measurement. |
| Bytes | UTF-8 JSON bytes of arguments and returned `content` parts | Does not include schemas, OpenCode framing, hidden prompt text, tokenization, or model-side payload accounting. Bytes are not converted to tokens. |
| Model turns / model tool calls | `null` | No approved real model session is driven by this harness. |
| Model input/output/total tokens | `null` in the entry branch | This branch reads no model counter; the separate read-only collector below does. No byte-derived token estimate is used. |

The script emits JSON with separate entry-level and model-usage statuses. The
entry-level comparison can be `observed`, but overall status remains `blocked`
while model turns and token counters are missing; the command exits `3` for this
partial evidence rather than reporting a green full comparison. This original
entry branch is unchanged and does not read session transcripts. The new
`--observed-usage` branch never launches a browser or invokes tool definitions.

### Observed run (2026-10-27)

The local fixture run completed both conditions: all eight tools had the expected
flags, and each condition invoked `open`, `snapshot`, and `close` once. Each
condition recorded three permission-callback passes, zero remaining manager
sessions, and removal of its run-owned profile root.

| Tool | Default execute ms | `directTools` execute ms | Default result bytes | `directTools` result bytes |
| --- | ---: | ---: | ---: | ---: |
| `open` | 3,484.699 | 3,278.079 | 181 | 181 |
| `snapshot` | 290.857 | 210.338 | 275 | 275 |
| `close` | 1,501.742 | 1,500.891 | 132 | 132 |

Measured manager-method times (ms) were `open`: default `start` 2,792.754,
`execute` 427.563 + 260.632; direct `start` 2,640.911, `execute` 400.486 +
236.222. `snapshot` `execute`: 289.526 / 210.024. `close` `cancel`: 1,500.817 /
1,500.432. Input JSON bytes were identical: 40 (`open`), 68 (`snapshot`), and
2 (`close`) per condition. This is one cold-worker sample per setting; the small
latency deltas are not causal evidence that one exposure is faster. These tool
calls run in the harness regardless of the exposure flag; only the observed
registration flags differ.

Despite successful entry-level observations, the overall result is **blocked**:
model turns, model-issued tool calls, and input/output/total tokens are all `null`.
No token estimates are derived from these byte counts.

### Independent parent recheck (2026-10-28)

The same production-entry harness completed both local-fixture conditions again:

| Tool | Default execute ms | `directTools` execute ms |
| --- | ---: | ---: |
| `open` | 2,796.153 | 2,700.939 |
| `snapshot` | 288.723 | 400.825 |
| `close` | 1,501.203 | 1,501.891 |

All eight exposure flags matched each condition, each used three real tool
functions/permission stubs, manager session counts returned to zero, and the
run-owned root was removed. Argument/result byte counts were unchanged between
conditions. The command again returned **3**, with model turns, model-issued
tool calls and token counters `null`. Opposite timing deltas across these small
samples reinforce that no causal performance advantage is established.

## Observed runtime counters (2026-10-28)

### Historical collection and exact commands (scope superseded)

Snapshot window: **2026-10-28 14:02:43.981–14:02:56.650 UTC** on this machine.
The collector used only `opencode api GET`, with no model generation or session
mutation. The live server's `GET /openapi.json` verified the response schemas.
Raw API/transcript scratch stayed under `/tmp/opencode`, not in the repository.
The original report includes every exact request, including pagination cursors.
These are **historical invocations**, not the corrected collector's interface:

```bash
opencode api GET /openapi.json > /tmp/opencode/efficiency-openapi-20261028.json
node tools/computer-use-browser/efficiency-acceptance.mjs --observed-usage \
  ses_e7f5d5e16ffe9h2DdlY4rJTIQd ses_e7f73eefeffexmXdCv4t7Y9FWt \
  > /tmp/opencode/efficiency-observed-report-20261028.json
```

That original implementation snapshotted `/api/experimental/session/stats`, paged `/api/session` with
`limit=50&order=asc` then `cursor=...`, and reads message pages **only for the two
explicit IDs**. Seven session-list pages (including the terminating empty page)
returned **295 unique sessions**, zero duplicate IDs, across unrelated worktrees.
It also read message pages for the two supplied IDs without first validating
their worktree/project identity. That is a source-boundary defect, not evidence
that those transcript reads were authorized by a metadata scan. The unrelated
interrupted handoff implementation is **withdrawn as comparison/recovery evidence**.
No further live transcripts or global session scans were requested for this fix.

**Coverage correction:** 295 rows, versus the parent's earlier default 50-row
enumeration, establishes that the earlier enumeration was truncated. The earlier
parent's full-worker-set/ownership check is **not proven** by that 50-row result.
Neither this later cross-project scan nor the corrected exact-ID collector proves
a complete, authorized worker set; that remains a parent verification boundary.
Historical global/token numbers below remain dated observations, not scoped proof.

The CLI's large piped output was observed to truncate JSON, so the production
collector redirects each child GET's stdout to a private, exclusively created
scratch file, validates the JSON, and removes that call-owned directory.
Its 16-MiB response-size rejection is checked **after the child process finishes**;
it is not a streaming or disk-write bound. Each GET has a 30-second child timeout.

### Corrected source boundary and bounded collection

The corrected collector **never lists sessions**. With no options it refuses
before any GET. Explicit `--global` opt-in returns only cross-project aggregate
stats, no session rows or transcript requests. Exact selected IDs require an
expected project ID and the source worktree `/home/james/repos/computer-use`.
The library requires `scope: { directory, projectID }`; the CLI pins `directory`
to this source worktree and requires `--project`. For **every** selected ID it
fetches only `GET /api/session/ID`, checks the returned exact ID, exact
`location.directory` and exact `projectID`, and refuses missing/mismatching
identity **before any selected message request**, even for an earlier valid ID.
Other worktrees, ancestors and nested directories are not substitutes.

Selected metadata-only collection is the default. Transcript retrieval additionally
requires `--messages`/`includeMessages: true` and separately authorized exact IDs;
a metadata match or scan itself is not transcript authority. The check is a
metadata snapshot, not an atomic location lock against concurrent session moves.
No new live run of these corrected scope gates is claimed; verification is offline.

Current interface examples (the expected project ID must come from separately
verified authorized context; no value is guessed or inferred from a title):

```bash
# Explicit cross-project aggregate-only opt-in, no session listing or messages:
node tools/computer-use-browser/efficiency-acceptance.mjs --observed-usage --global
# Exact-ID metadata only; requires VERIFIED_PROJECT_ID to be supplied:
node tools/computer-use-browser/efficiency-acceptance.mjs --observed-usage \
  --project "${VERIFIED_PROJECT_ID:?supply the verified expected project ID}" \
  ses_e7f5d5e16ffe9h2DdlY4rJTIQd
# Only with separate authority to read that exact source's messages:
node tools/computer-use-browser/efficiency-acceptance.mjs --observed-usage \
  --project "${VERIFIED_PROJECT_ID:?supply the verified expected project ID}" \
  --messages ses_e7f5d5e16ffe9h2DdlY4rJTIQd
```

Caps: **eight supplied IDs**, **50 rows/page** (default 25), **10 pages/session**
and **20 message pages across all selected IDs**. IDs are restricted to the
conservative `ses_` plus ASCII alphanumeric/underscore/hyphen subset, beginning
with an alphanumeric suffix and at most 128 characters; unsafe/oversize options
refuse before any GET. Expected project IDs use at most 128 ASCII
alphanumeric/underscore/hyphen characters. Cursors are nonempty and at most
4,096 UTF-8 bytes; query metacharacters are encoded, not treated as new endpoints.

**Pagination contract:** the already-captured native OpenAPI
`SessionMessagesResponse` requires a `cursor` object but makes its individual
keys optional. The observed native terminating pages had explicit `next: null`.
The corrected collector requires that explicit terminator to prove completion:
missing/malformed cursor or `next` fails closed for empty **and** nonempty pages.
A short or empty page with a valid next cursor still follows it. Repeated cursors
fail; per-session/combined budget exhaustion yields explicitly partial message
coverage and unknown complete aggregates, never implicit completion.

Definitions: session `tokens` and `cost` are observed cumulative counters. Steps
in selected sessions are **computed counts of projected assistant messages**;
turns are **computed user-message counts**, with synthetic prompts separate.
These are not inferred provider request counts. Timestamp differences are
computed milliseconds, not measured active-work time. Missing values stay `null`.
Reasoning, input, output and cache classes are kept separate: no unsupported
combined-token total or bytes-to-token conversion is made. Assistant-message
model refs support per-model aggregation; cumulative session usage is **never**
assigned to the session's current model after a possible model switch.

### Global range and model counters

Stats range: **2026-09-18 03:21:37.453 UTC–2026-10-28 14:02:44.220 UTC**.

| Observed global counter | Value |
| --- | ---: |
| Root sessions / subagents | 63 / 204 |
| Prompts / steps | 671 / 21,670 |
| Input / output tokens | 112,146,002 / 5,791,057 |
| Reasoning tokens | 7,100,124 |
| Cache read / write tokens | 3,776,675,448 / 0 |
| Recorded cost, USD (rounded) | 6.261167586 |
| Tool calls / succeeded / failed / unfinished | 35,226 / 34,262 / 962 / 2 |
| Active days / current streak | 12 / 4 |

Two relevant **global**, not selected-session or per-tool, model rows:

| Provider/model, variant | Steps | Input | Output | Reasoning | Cache read | Cache write | Recorded USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna`, `xhigh` | 1,869 | 9,047,615 | 761,067 | 1,456,523 | 187,046,144 | 0 | 0 |
| `openai/gpt-6.1-sol`, `high` | 1,329 | 5,342,845 | 552,568 | 299,364 | 334,337,664 | 0 | 0 |

Zero is the runtime's recorded cost, **not** evidence of free service or a billing
estimate. All global per-model rows and per-day activity are retained in the
scratch report; their steps/input/output/reasoning sums matched the global totals.

**Scope probe:** these exact fixed-range requests returned deeply identical
responses, including the same 63 roots, 204 subagents and 21,670 steps:

```bash
opencode api GET '/api/experimental/session/stats?from=1789701697453&to=1793196164220'
opencode api GET '/api/experimental/session/stats?from=1789701697453&to=1793196164220&sessionID=ses_e7f5d5e16ffe9h2DdlY4rJTIQd'
```

`sessionID` is absent from that route's live OpenAPI query parameters; it was
ignored in this observation. Never use it to claim session-scoped statistics.
The collector records unequal probes as inconclusive rather than assuming they
prove filtering, because concurrent activity can change a non-atomic snapshot.

The superseded **cross-project session-list** aggregate was 295 sessions (91 roots, 204 children),
125,143,903 input, 6,084,771 output, 7,259,161 reasoning, 3,788,820,013 cache-read,
zero cache-write tokens and USD 6.380076552 recorded cost (rounded). This does
**not** reconcile to stats; the cause was not established. It is a sum of listed
cumulative session counters, not a replacement global range or source-scoped
evidence. The corrected collector no longer enumerates or returns these rows.

### Historical prior efficiency session: not an exposure A/B pair

The following numbers predate the scope fix; they do not prove that the corrected
scope checks have run live or establish verified worktree identity retrospectively.

| Counter | Prior efficiency implementation |
| --- | ---: |
| Session ID | `ses_e7f5d5e16ffe9h2DdlY4rJTIQd` |
| Parent ID | `ses_goal_docs_e51bdf9cf361797e5ad2593e5b530dc9` |
| Agent; observed current model/variant | `general`; `openai/gpt-6-luna/xhigh` |
| Cumulative input / output | 137,748 / 12,084 |
| Cumulative reasoning / cache read / cache write | 22,487 / 2,069,120 / 0 |
| Recorded USD | 0 |
| Assistant steps / user prompts / synthetic prompts | 24 / 1 / 0 |
| Tool calls / succeeded / failed / unfinished | 63 / 62 / 1 / 0 |
| Created → updated, ms | 402,977 |
| Created → idle, ms | 402,983 |
| Outcome | `succeeded` |

For the prior efficiency session, assistant-message usage sums exactly matched
all five cumulative token classes and cost, all under `gpt-6-luna/xhigh`.
Offline fixtures also verify that any message lacking usage keeps its per-model
token/cost aggregate `null`; no missing value is filled with zero or guessed usage.

The prior session's 63 projected calls are coding/inspection tools, not
model-issued `web.open/snapshot/close` calls. Its shell commands ran the entry
harness under **both flags inside the same coding session**. No counter separates
those conditions. It is not a direct-tools model run or a Code Mode model run.
The unrelated handoff task is not an authorized comparison or recovery baseline.

The original candidate title searches were read-only but did not establish source
identity or transcript authority, and are **not** a recommended collection path:

```bash
opencode api GET '/api/session?search=efficiency&limit=50'
opencode api GET '/api/session?search=direct&limit=50'
opencode api GET '/api/session?search=codemode&limit=50'
```

They returned two efficiency titles (this collector task and the prior harness
task), zero direct titles and zero codemode titles. This is a bounded candidate
search, **not** proof that no historical session ever used either mode. Session
summaries themselves contain no exposure-mode field. No clean pair was identified
from these records, and no new pair was dispatched under this task's read-only
authority.

### Observable failure/interruption burden

Historical cross-project stats expose **962 failed and two unfinished tool calls**;
these are not specifically browser calls or retries. The prior efficiency coding
session recorded one failed call out of 63, not a recovery-token counter.
The superseded cross-project metadata scan recorded **10 interrupted outcomes**:
their summed created→updated lifetimes were
**319,716,496 ms**, and created→idle lifetimes **401,607,595 ms**. These sums include
ordinary work, waiting and possibly overlap. They are **not time-to-recover**.
This cross-project aggregate is not accepted source-scoped recovery evidence;
the unrelated handoff transcript's failure counts/duration are withdrawn from
the comparison. No retry linkage, post-failure-only token counter or authorized,
matched recovery outcome was available; actual recovery token/time deltas by
exposure remain unmeasured.

### What this does and does not prove

- **Proves:** real runtime usage and reliability counters can be collected with
  read-only GETs; selected session steps/prompts/tool outcomes and timestamp
  differences can be derived deterministically without estimates.
- **Source-boundary limit:** the original snapshot did not verify selected
  worktree/project identity before transcripts. New exact-scope gates pass offline
  fixtures only; historical cross-project rows are not scoped acceptance, and the
  earlier 50-row full-worker-set check remains unproven.
- **Aggregate-not-per-tool attribution:** session/global tokens include context,
  coding, reasoning, inspection and other work. They cannot be assigned to one
  browser call, shell-invoked harness condition, failed call or recovery action.
- **Global-vs-session scope:** fixed-range stats ignored `sessionID`; list sums,
  selected message projections and global range totals remain distinct.
- **Single-machine sample:** no causal speed, token, cache or cost advantage of
  Code Mode versus direct tools is established. Models, task histories and cache
  states differ; timestamps are not active latency benchmarks.
- **No user-visible acceptance:** no new browser/desktop action, sign-in,
  deployment, actual model dispatch or user-facing workflow was tested here.

The remaining comparison needs separately authorized, fresh model sessions for
the **same synthetic browser task**, same model/variant and instructions, one
with runtime-verified Code Mode exposure and one with `directTools: true` verified
at dispatch. Record session IDs, loaded source/config/exposure evidence, complete
before/after token/cache/cost/message counters, equivalent initial browser/cache
conditions and bounded failure/retry traces through recovery or interruption.
Repeat with counterbalanced order. Compare session deltas, not unrelated global
totals; even then, per-tool tokens need provider/request-level attribution not
supplied by these counters. This collector does not create or run those sessions.

## Verification

After the scope/pagination/cap corrections, **53/53 deterministic tests passed**
(26 top-level tests plus 27 nested cases), zero failures/skips; harness syntax
passed. Only deterministic tests and syntax were rerun for this correction.
The earlier 17/17, adjacent 5/5 and whitespace/Git checks are historical checks,
not a fresh full-worker-set or live source-scope acceptance. No broad health,
deployment, session scan, live transcript request or model dispatch ran for this fix.

```bash
node --test tools/computer-use-browser/efficiency-acceptance.test.mjs
node --check tools/computer-use-browser/efficiency-acceptance.mjs
```

Inline offline fixtures cover usage parsing, unknown/invalid counters, token
classes, model switches, prompt/step semantics, failure/unfinished counts,
interruption durations, complete/partial pagination, duplicates, fixed-range
scope probes and read failures. New regressions cover exact worktree/project
identity before **any** selected messages, metadata-only defaults, global opt-in
without enumeration, strict IDs/options, missing/malformed cursors for empty and
nonempty pages, short/empty continuation, repeated cursors and both page caps.
Original entry metrics/cleanup regressions remain.
An offline fake CLI also exercises the real subprocess/file-output/cleanup path
and refuses any method other than GET; it does not contact OpenCode or a network.
These tests call no live API and do not constitute a model exposure comparison.
Collector success (exit zero) means collection completed, **not** that its
`comparison.status: blocked` became acceptance. Original entry output/status and
exit-three partial-evidence semantics are unchanged.
