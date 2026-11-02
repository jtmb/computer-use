# Native-trace adapter (offline, v2.1.1 event schema)

`src/native-trace.mjs` converts one **exact** OpenCode v2.1.1 execution's native
event records into the trace shape that `src/grade.mjs` already grades, while
keeping raw native evidence separate from semantic effect labels.

It is dependency-free, reads no files, calls no model, opens no network
connection. Its25 synthetic tests now run through the package's existing test
glob and the required `scripts/ci-offline.mjs` corpus-test step. It is **not** an
automatic input route in `validate.mjs` or `grade.mjs`; call the adapter explicitly.
No real model/export, new dependency or hosted service is needed for these tests.

## What it does and does not establish

- It validates the native envelope, tool-call lifecycle, execution boundary and
  identity of a record set, then maps **only reviewed explicit tool-name
  mappings** into grader actions.
- It does **not** authenticate that the records came from a real run, that a
  tool executed, that a mapping review happened, or that any model behavior is
  correct. All fixture-based tests below are synthetic.
- The later [CLI candidate observation](runs/2026-10-30-cli.md) adapted54actual
  live durable2.1.1 events. This is one observed schema-compatible run, not broad
  export coverage or automatic semantic grading. Raw events were not persisted;
   its structural summary/digest is not a replayable or self-authenticating export.
- The [current-information routing observation](runs/2026-10-30-routing.md)
  adapts69actual events with successful research calls but no inferred assistant
  report. Separate parent review supports the narrow answer while preserving
  truncated-source, ancillary-conflict and required-read failures. This does not
  automatically authenticate semantics or pass broader instruction compliance.
- A separate [two-source conflict comparison](runs/2026-10-30-conflict.md) adapts53
  actual events. It reports the differing dates and honest truncation under a
  differently focused prompt; exact source reads/conflict reporting still require
  separate parent review, and required-read omissions remain failed. It neither
  erases the earlier routing failure nor measures general improvement.

## Schema provenance and version pin

Evidence was read on 2026-10-30 from the v2.1.1 source checkout that the
installed CLI reports:

| Source | Detail |
| --- | --- |
| `opencode --version` | `opencode v2.1.1` (`/home/james/.local/opt/opencode-v2/bin/opencode`) |
| `~/repos/opencode-native-row` | git tag `v2.1.1`, commit `ba546ec1598a70db2570e9c6258028d955ba8f58` |
| `packages/schema/src/event.ts` | envelope: `id` (`evt_` prefix), `created`, `type`, `data`, `location?`, `metadata?`, and `durable` for durable events only |
| `packages/schema/src/session-event.ts` | event list, per-type `durable.version`, tool/step/execution payloads |
| `packages/client/src/promise/generated/types.ts` | generated v2.1.1 types used for the payload checks below |
| installed binary strings | `session.tool.called` ×10, `session.step.ended` ×10, `session.next` ×0 |

`NATIVE_SCHEMA.version` is `"2.1.1"`. Any other declared `identity.sdkVersion`
is refused with `unsupported-schema-version` instead of being treated as
compatible.

### Discovered schema conflict (do not paper over)

The separately installed npm package `@opencode-ai/sdk` **1.18.30**
(`~/.opencode/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`) also
ships a "v2" surface, but it is a **different, pre-release shape**:

- event names are `session.next.tool.called` / `session.next.tool.success`;
- the envelope uses `properties` with a nested `timestamp`;
- the call id field is `callID`, execution flag is `provider.executed`.

The v2.1.1 source and binary use `session.tool.*` with `data.id` and
`data.executed`, and an envelope-level `created`. The two are not
interchangeable. This adapter targets v2.1.1 only, and rejects a
`properties`-style record as an unknown envelope field. Do not "fix" a
rejection by adding alternate field names without new, reviewed schema
evidence.

## Input contract

```js
import { adaptNativeTrace } from "./src/native-trace.mjs"

const { trace, audit, measures } = adaptNativeTrace({
  identity: {
    runId: "run_label_chosen_by_caller", // caller label, not a native field
    sessionId: "ses_...",                // must equal every native data.sessionID
    caseId: "AGR-AU-019",                // case being evaluated
    sdkVersion: "2.1.1",                 // exact pin
    executionID: "evt_...",              // id of the single execution.started event
  },
  records: { runId: "run_label_chosen_by_caller", sessionId: "ses_...", records: [/* native events */] },
  mappings: {
    reviewedBy: "who reviewed these labels",
    reviewedOn: "2026-10-30",
    entries: [{ tool: "read", effect: "read", target: "synthetic_note", reviewed: true }],
  },
  expectedCaseId: "AGR-AU-019", // optional; rejects a case mismatch early
})
```

Only these input keys are accepted: `identity`, `records`, `mappings`,
`expectedCaseId`. Only these bundle keys are accepted: `runId`, `sessionId`,
`caseId`, `sdkVersion`, `executionID`, `source`, `records`. Unknown keys on the
input, on `identity` and on a mapping entry are rejected, which is how
caller-supplied `tokens`, `cost`, `latency`, `claims` or effect `source`
overrides are refused rather than silently ignored.

A native record must match this v2.1.1 envelope:

```json
{
  "id": "evt_...",
  "created": 1760000000000,
  "type": "session.tool.called",
  "durable": { "aggregateID": "ses_...", "seq": 12, "version": 1 },
  "data": { "sessionID": "ses_...", "assistantMessageID": "msg_...", "id": "call_1", "input": {}, "executed": true }
}
```

Rules enforced across the record set:

- one and only one `session.execution.started`, whose `id` equals
  `identity.executionID`; a second execution is refused;
- every tool/step event falls inside that execution window (after start, before
  its terminal event), so a concatenated multi-run export is refused;
- repeated step terminals cannot count usage twice without a fresh start;
  overlapping starts for the same assistant message cannot replace the baseline.
  Execution/step terminal clocks preceding their start refuse instead of emitting
  a negative measured latency. A fresh step after a terminal is still supported;
- a failed step's optional `finish` is only `content-filter`, matching the pinned
  schema; a general `error` finish is not accepted for that event;
- durable events carry `durable`; ephemeral events
  (`session.tool.progress`, `*.delta`) do not;
- `durable.aggregateID` equals the declared session; `seq` strictly increases
  per aggregate (replay/reorder detection); `durable.version` equals the
  version pinned for that event type (`session.tool.success` and
  `session.tool.failed` are version `2`);
- every record has a unique `evt_` id; every `data.sessionID` that appears
  equals the declared session;
- the tool name comes from the matching `session.tool.input.started`
  (`data.name`) keyed by `(assistantMessageID, id)`. A call without a native
  name is refused as `missing-tool-name`; no fallback name is invented.

### Tool-call lifecycle

`session.tool.called` opens a call; exactly one `session.tool.success` or
`session.tool.failed` may terminate it. Refused: a second `called` for the same
id, a terminal without `called`, two terminals, a terminal earlier than
`called`, a changed `executed` flag, or a terminated call whose tool name was
never reported.

Status resolution:

| Evidence | Status |
| --- | --- |
| one `success` terminal | `completed` |
| one `failed` terminal | `failed` |
| no terminal, execution ended `interrupted` | `aborted` |
| no terminal otherwise | `incomplete` |

Only `completed` calls can produce an action. `failed`, `incomplete` and
`aborted` calls appear in `audit.notCounted` and never satisfy a required
effect.

A `success` terminal that arrived before a later execution interruption stays
`completed`: the tool returned a native success result, and the interruption is
reported at execution level (`audit.execution.status: "interrupted"`). It is
not silently promoted to "no effect"; reviewers who want stricter exclusion can
filter on that field.

### Effects require reviewed mappings

An action is produced only when a `completed` call's exact native tool name has
a mapping entry with `reviewed: true`, a known effect from `constants.mjs`, and
a non-empty target. A tool named `git.commit`, `deploy` or `bash` with no
mapping produces **no** effect, regardless of its name, input, `executed` flag,
output content or accompanying prose. Prose (`session.text.ended`) is counted
and measured by length only, never turned into a claim; `trace.claims` is
always `[]`.

Mapping review (`reviewedBy`, `reviewedOn`, per-entry `reviewed`) is
**declared, not authenticated**. The adapter cannot verify who reviewed it.

## Measurements (native fields only)

| Measure | Source | Unknown when |
| --- | --- | --- |
| `usage.cost`, `usage.tokens` | sum over `session.step.ended` and `session.step.failed` records that carry native `cost` + `tokens` | no step record carries both |
| `usage.total` | not present in v2.1.1 `TokenUsageInfo` | always reported as unknown |
| `runLatency.ms` | terminal `session.execution.*` `created` − `session.execution.started` `created` | execution has no terminal record |
| `stepLatency[]` | step terminal `created` − `session.step.started` `data.started` | no step-started record for that message |
| `toolLatency[]` | terminal `created` − `session.tool.called` `created` | call has no terminal |

`session.usage.recorded` is deliberately **not** used as a usage source: it is
session-aggregate data with no step boundary, so it is listed in
`audit.ignoredTypes` instead. Unavailable measures are named in
`measures.unavailable`; nothing is estimated from timestamps outside these
fields.

## Rejection codes

`NativeTraceError.code` is stable for assertions:

`unknown-field`, `malformed-input`, `malformed-identity`,
`unsupported-schema-version`, `malformed-record`, `malformed-envelope`,
`malformed-event`, `duplicate-event-id`, `replayed-sequence`,
`unsupported-event-version`, `identity-mismatch`, `mixed-session`,
`duplicate-tool-name`, `missing-tool-name`, `duplicate-call-id`,
`orphan-tool-result`, `duplicate-tool-terminal`, `tool-time-regression`,
`inconsistent-call`, `outside-execution`, `mixed-execution`,
`multiple-executions`, `missing-execution`, `malformed-mapping`,
`unreviewed-mapping`, `duplicate-mapping`, `case-mismatch`, `empty-records`,
`duplicate-step-start`, `duplicate-step-terminal`, `execution-time-regression`,
`step-time-regression`.

## Privacy and evidence retention

The audit keeps structure, not payload text: tool content is reduced to
`["text"]` / `["file"]` types, metadata to sorted keys, errors to `type`,
prose to length, and native payloads to a `hasNative` flag. Retain the original
native export separately if an investigation needs the actual content. This
also means a file-recorded tool result remains a caller-declared record, not an
authenticated observation, and the adapter never labels it as one.

## Tests

```bash
cd evals/agent-rules
node --test tests/native-trace.test.mjs   # 25 offline tests
node --test tests/*.test.mjs              # 87 including retained actual-run checks
```

The tests are clearly synthetic (`ses_synthetic_native_fixture_01`,
`evt_synthetic_*`, case `AGR-XX-900`) and cover: positive adaptation that grades
through `gradeCase`; tool-name/prose non-inference; mixed session and aggregate;
bundle identity mismatch; duplicate call/name/event ids; orphan and duplicate
terminals; missing tool name; malformed and pre-release `properties` envelopes;
wrong durable version; sequence replay; caller-supplied usage/latency/claim
fields; failed/incomplete/aborted exclusion; execution window boundaries; a
second or missing execution; mapping review requirements; version/case/
execution identity mismatch; native step/execution measures and unknowns;
ephemeral progress records; ignored event types; empty records; file content
kept as an unauthenticated content type; verbatim `executed` flags; and
non-mutation of caller input.

None of these tests proves real model behavior, a real tool effect, an
authenticated mapping review, or correct adaptation of an actual captured
export.
