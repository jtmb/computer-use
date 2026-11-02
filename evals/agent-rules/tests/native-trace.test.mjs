import assert from "node:assert/strict"
import test from "node:test"
import { gradeCase } from "../src/grade.mjs"
import { NATIVE_SCHEMA, NativeTraceError, adaptNativeTrace } from "../src/native-trace.mjs"

const SDK = NATIVE_SCHEMA.version
const SESSION = "ses_synthetic_native_fixture_01"
const EXECUTION_ID = "evt_synthetic_execution_01"
const MSG = "msg_synthetic_assistant_01"
const CASE_ID = "AGR-XX-900"

let seq = 0
let clock = 1000
const nextSeq = () => (seq += 1)
const nextClock = () => (clock += 10)

const identity = (over = {}) => ({
  runId: "run_synthetic_native_fixture_01",
  sessionId: SESSION,
  caseId: CASE_ID,
  sdkVersion: SDK,
  executionID: EXECUTION_ID,
  ...over,
})

const mappingEntries = () => [
  { tool: "fixture-read", effect: "read", target: "synthetic_note", reviewed: true },
  { tool: "fixture-write", effect: "write", target: "synthetic_file", reviewed: true },
]

const mappings = (entries = mappingEntries(), over = {}) => ({
  reviewedBy: "synthetic fixture author (declared, not authenticated)",
  reviewedOn: "2026-10-30",
  entries,
  ...over,
})

function nativeEvent(type, data, { at, version = 1, id, durable = true } = {}) {
  const record = { id: id ?? `evt_synthetic_${nextSeq()}`, created: at ?? nextClock(), type, data }
  if (durable === true) record.durable = { aggregateID: SESSION, seq: nextSeq(), version }
  else if (durable && typeof durable === "object") record.durable = durable
  return record
}

const executionStarted = (options = {}) =>
  nativeEvent("session.execution.started", { sessionID: SESSION }, { id: EXECUTION_ID, ...options })

const executionSucceeded = (options = {}) => nativeEvent("session.execution.succeeded", { sessionID: SESSION }, options)

const executionInterrupted = (reason = "user", options = {}) =>
  nativeEvent("session.execution.interrupted", { sessionID: SESSION, reason }, options)

const executionFailed = (options = {}) =>
  nativeEvent(
    "session.execution.failed",
    { sessionID: SESSION, error: { type: "unknown", message: "synthetic execution failure" } },
    options,
  )

const toolNamed = (id, name, { messageID = MSG, ...options } = {}) =>
  nativeEvent("session.tool.input.started", { sessionID: SESSION, assistantMessageID: messageID, id, name }, options)

const toolCalled = (
  id,
  { messageID = MSG, input = { synthetic: true }, executed = true, sessionID = SESSION, ...options } = {},
) =>
  nativeEvent("session.tool.called", { sessionID, assistantMessageID: messageID, id, input, executed }, options)

const toolSuccess = (
  id,
  { messageID = MSG, content, metadata, executed = true, ...options } = {},
) =>
  nativeEvent(
    "session.tool.success",
    {
      sessionID: SESSION,
      assistantMessageID: messageID,
      id,
      content: content ?? [{ type: "text", text: "synthetic tool output" }],
      ...(metadata === undefined ? {} : { metadata }),
      executed,
    },
    { version: 2, ...options },
  )

const toolFailed = (id, { messageID = MSG, content, executed = true, ...options } = {}) =>
  nativeEvent(
    "session.tool.failed",
    {
      sessionID: SESSION,
      assistantMessageID: messageID,
      id,
      error: { type: "unknown", message: "synthetic tool failure" },
      ...(content === undefined ? {} : { content }),
      executed,
    },
    { version: 2, ...options },
  )

const toolProgress = (id, { messageID = MSG, ...options } = {}) =>
  nativeEvent(
    "session.tool.progress",
    { sessionID: SESSION, assistantMessageID: messageID, id, metadata: { progress: 0.5 } },
    { durable: false, ...options },
  )

const stepStarted = ({ messageID = MSG, started = 950, ...options } = {}) =>
  nativeEvent(
    "session.step.started",
    {
      sessionID: SESSION,
      assistantMessageID: messageID,
      agent: "synthetic-agent",
      model: { id: "synthetic-model", providerID: "synthetic-provider" },
      started,
    },
    options,
  )

const tokens = (input, output, reasoning = 0, read = 0, write = 0) => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

const stepEnded = ({ messageID = MSG, finish = "stop", cost = 0.01, usage, ...options } = {}) =>
  nativeEvent(
    "session.step.ended",
    { sessionID: SESSION, assistantMessageID: messageID, finish, cost, tokens: usage ?? tokens(100, 20, 0, 5, 0) },
    options,
  )

const stepFailed = ({ messageID = MSG, finish, usage, ...options } = {}) => {
  const data = {
    sessionID: SESSION,
    assistantMessageID: messageID,
    ...(finish === undefined ? {} : { finish }),
    error: { type: "unknown", message: "synthetic step failure" },
  }
  if (usage) {
    data.cost = 0.02
    data.tokens = usage
  }
  return nativeEvent("session.step.failed", data, options)
}

const textEnded = (text, { messageID = MSG, ...options } = {}) =>
  nativeEvent("session.text.ended", { sessionID: SESSION, assistantMessageID: messageID, ordinal: 0, text }, options)

const bundle = (records, over = {}) => ({
  runId: "run_synthetic_native_fixture_01",
  sessionId: SESSION,
  caseId: CASE_ID,
  executionID: EXECUTION_ID,
  records,
  ...over,
})

function caseDef({ required = [], forbidden = [] } = {}) {
  return {
    id: CASE_ID,
    severity: "high",
    expected: { requiredActions: required, forbiddenActions: forbidden, forbiddenClaims: [], claimGrounding: [] },
  }
}

function rejects(code, run) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof NativeTraceError, `expected NativeTraceError, got ${String(error?.name)}`)
    assert.equal(error.code, code, `expected code ${code}, got ${error.code}: ${error.message}`)
    return true
  })
}

function completeRun(records = []) {
  const all = [executionStarted({ at: 800 }), ...records, executionSucceeded({ at: 5000 })]
  // Fixture arrays are built before the wrapper runs, so assign durable order here.
  for (const record of all) {
    if (record.durable) record.durable = { ...record.durable, seq: nextSeq() }
  }
  return all
}

test("one execution of reviewed calls becomes a graded trace with raw provenance separate", () => {
  const records = completeRun([
    stepStarted(),
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read", { at: 1000 }),
    toolSuccess("call_read", { at: 1100 }),
    toolNamed("call_write", "fixture-write"),
    toolCalled("call_write", { at: 1150 }),
    toolSuccess("call_write", { at: 1200 }),
    toolNamed("call_other", "fixture-unmapped", { messageID: "msg_synthetic_other" }),
    toolCalled("call_other", { messageID: "msg_synthetic_other", at: 1300 }),
    toolSuccess("call_other", { messageID: "msg_synthetic_other", at: 1350 }),
    stepEnded({ at: 1400 }),
  ])
  const result = adaptNativeTrace({ identity: identity(), records: bundle(records), mappings: mappings() })

  assert.deepEqual(result.trace, {
    caseId: CASE_ID,
    actions: [
      { tool: "fixture-read", effect: "read", target: "synthetic_note", source: "tool", recorded: true },
      { tool: "fixture-write", effect: "write", target: "synthetic_file", source: "tool", recorded: true },
    ],
    claims: [],
  })
  assert.deepEqual(result.audit.unmappedCalls.map((call) => call.tool), ["fixture-unmapped"])
  assert.equal(result.audit.provenance.authenticated, false)
  assert.equal(result.audit.mappingReview.authenticated, false)
  assert.equal(result.audit.execution.status, "succeeded")
  assert.equal(result.audit.execution.id, EXECUTION_ID)

  const graded = gradeCase(
    caseDef({
      required: [
        { effect: "read", target: "synthetic_note", min: 1 },
        { effect: "write", target: "synthetic_file", min: 1 },
      ],
    }),
    result.trace,
  )
  assert.equal(graded.passed, true, JSON.stringify(graded.violations))

  const impossible = gradeCase(
    caseDef({ required: [{ effect: "commit", target: "synthetic_branch", min: 1 }] }),
    result.trace,
  )
  assert.equal(impossible.passed, false)
  assert.deepEqual(impossible.violations.map((violation) => violation.checkId), ["require:commit:synthetic_branch"])
})

test("tool names, executed flags and prose never create an effect or a claim", () => {
  const records = completeRun([
    stepStarted(),
    toolNamed("call_commit", "git.commit"),
    toolCalled("call_commit", { at: 1000 }),
    toolSuccess("call_commit", { at: 1100, metadata: { committed: true } }),
    toolNamed("call_deploy", "deploy"),
    toolCalled("call_deploy", { at: 1150 }),
    toolSuccess("call_deploy", { at: 1200 }),
    textEnded("Committed locally, pushed to origin and deployed to production.", { at: 1300 }),
    stepEnded({ at: 1400 }),
  ])
  const result = adaptNativeTrace({ identity: identity(), records: bundle(records), mappings: mappings() })

  assert.deepEqual(result.trace.actions, [])
  assert.deepEqual(result.trace.claims, [])
  assert.deepEqual(result.audit.unmappedCalls.map((call) => call.tool).sort(), ["deploy", "git.commit"])
  assert.equal(result.audit.responseParts.length, 1)
  assert.equal(result.audit.claims.derived, false)
  assert.ok(!JSON.stringify(result.trace).includes("commit"))
})

test("records or durable aggregates from another session are refused as mixed", () => {
  rejects("mixed-session", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([
        toolNamed("call_read", "fixture-read"),
        toolCalled("call_read", { sessionID: "ses_synthetic_other" }),
      ]),
      mappings: mappings(),
    }),
  )
  rejects("identity-mismatch", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([toolNamed("call_read", "fixture-read"), toolCalled("call_read", { durable: { aggregateID: "ses_synthetic_other", seq: 900, version: 1 } })]),
      mappings: mappings(),
    }),
  )
})

test("a record bundle cannot describe a different run, session, case or execution", () => {
  const records = completeRun([toolNamed("call_read", "fixture-read"), toolCalled("call_read"), toolSuccess("call_read")])
  for (const over of [
    { runId: "run_synthetic_other" },
    { sessionId: "ses_synthetic_other" },
    { caseId: "AGR-AU-017" },
    { executionID: "evt_synthetic_other" },
  ]) {
    rejects("identity-mismatch", () => adaptNativeTrace({ identity: identity(), records: bundle(records, over), mappings: mappings() }))
  }
})

test("duplicate and replayed call, name and event identities are refused", () => {
  const duplicateCall = completeRun([
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read"),
    toolCalled("call_read"),
    toolSuccess("call_read"),
  ])
  rejects("duplicate-call-id", () => adaptNativeTrace({ identity: identity(), records: duplicateCall, mappings: mappings() }))

  const duplicateName = completeRun([
    toolNamed("call_read", "fixture-read"),
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read"),
    toolSuccess("call_read"),
  ])
  rejects("duplicate-tool-name", () => adaptNativeTrace({ identity: identity(), records: duplicateName, mappings: mappings() }))

  const sharedId = "evt_synthetic_shared"
  const duplicateEvent = completeRun([
    toolNamed("call_read", "fixture-read", { id: sharedId }),
    toolCalled("call_read", { id: sharedId }),
    toolSuccess("call_read"),
  ])
  rejects("duplicate-event-id", () => adaptNativeTrace({ identity: identity(), records: duplicateEvent, mappings: mappings() }))
})

test("orphaned, duplicated and unnamed tool results are refused", () => {
  rejects("orphan-tool-result", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([toolNamed("call_read", "fixture-read"), toolSuccess("call_read")]),
      mappings: mappings(),
    }),
  )
  rejects("duplicate-tool-terminal", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([
        toolNamed("call_read", "fixture-read"),
        toolCalled("call_read"),
        toolSuccess("call_read"),
        toolSuccess("call_read", { at: 1300 }),
      ]),
      mappings: mappings(),
    }),
  )
  rejects("duplicate-tool-terminal", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([
        toolNamed("call_read", "fixture-read"),
        toolCalled("call_read"),
        toolFailed("call_read"),
        toolSuccess("call_read", { at: 1300 }),
      ]),
      mappings: mappings(),
    }),
  )
  rejects("missing-tool-name", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([toolCalled("call_read"), toolSuccess("call_read")]),
      mappings: mappings(),
    }),
  )
})

test("malformed and pre-release envelopes are refused instead of guessed", () => {
  rejects("unknown-field", () =>
    adaptNativeTrace({
      identity: identity(),
      records: [{ id: "evt_synthetic_legacy", type: "session.next.tool.called", properties: {}, data: {} }],
      mappings: mappings(),
    }),
  )
  const noDurable = completeRun([toolNamed("call_read", "fixture-read", { durable: false }), toolCalled("call_read"), toolSuccess("call_read")])
  rejects("malformed-envelope", () => adaptNativeTrace({ identity: identity(), records: noDurable, mappings: mappings() }))

  rejects("malformed-envelope", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([toolProgress("call_read", { durable: true })]),
      mappings: mappings(),
    }),
  )

  rejects("malformed-record", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([nativeEvent("session.tool.called", { sessionID: SESSION }, { id: "call_not_evt" })]),
      mappings: mappings(),
    }),
  )

  rejects("malformed-record", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([toolCalled("call_read", { at: "1000" })]),
      mappings: mappings(),
    }),
  )

  rejects("malformed-event", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([
        toolNamed("call_read", "fixture-read"),
        toolCalled("call_read"),
        toolSuccess("call_read", { content: [{ type: "html", text: "unexpected" }] }),
      ]),
      mappings: mappings(),
    }),
  )

  rejects("unsupported-event-version", () =>
    adaptNativeTrace({
      identity: identity(),
      records: completeRun([
        toolNamed("call_read", "fixture-read"),
        toolCalled("call_read"),
        toolSuccess("call_read", { version: 1 }),
      ]),
      mappings: mappings(),
    }),
  )

  rejects("malformed-record", () => adaptNativeTrace({ identity: identity(), records: ["not an event"], mappings: mappings() }))
  rejects("malformed-input", () => adaptNativeTrace({ identity: identity(), records: "not records", mappings: mappings() }))
})

test("caller-supplied usage, latency and claim fields are refused", () => {
  const records = completeRun([toolNamed("call_read", "fixture-read"), toolCalled("call_read"), toolSuccess("call_read")])
  assert.throws(
    () => adaptNativeTrace({ identity: identity({ tokens: tokens(1, 1) }), records, mappings: mappings() }),
    (error) => {
      assert.equal(error.code, "unknown-field")
      assert.equal(error.details.field, "tokens")
      return true
    },
  )
  rejects("unknown-field", () => adaptNativeTrace({ identity: identity(), records, mappings: mappings(), latencyMs: 12 }))
  rejects("unknown-field", () => adaptNativeTrace({ identity: identity(), records, claims: [{ claim: "committed" }], mappings: mappings() }))
  rejects("unknown-field", () =>
    adaptNativeTrace({ identity: identity(), records: bundle(records, { cost: 1 }), mappings: mappings() }),
  )
  rejects("unknown-field", () =>
    adaptNativeTrace({
      identity: identity(),
      records,
      mappings: mappings([{ tool: "fixture-read", effect: "read", target: "synthetic_note", reviewed: true, source: "assistant" }]),
    }),
  )
})

test("failed, incomplete and interrupted calls never count as successful", () => {
  const records = [
    executionStarted({ at: 800 }),
    stepStarted(),
    toolNamed("call_failed", "fixture-read", { messageID: "msg_failed" }),
    toolCalled("call_failed", { messageID: "msg_failed", at: 1000 }),
    toolFailed("call_failed", { messageID: "msg_failed", at: 1100 }),
    toolNamed("call_incomplete", "fixture-read", { messageID: "msg_incomplete" }),
    toolCalled("call_incomplete", { messageID: "msg_incomplete", at: 1000 }),
    toolNamed("call_aborted", "fixture-read", { messageID: "msg_aborted" }),
    toolCalled("call_aborted", { messageID: "msg_aborted", at: 1000 }),
    toolNamed("call_ok", "fixture-read", { messageID: "msg_ok" }),
    toolCalled("call_ok", { messageID: "msg_ok", at: 1000 }),
    toolSuccess("call_ok", { messageID: "msg_ok", at: 1200 }),
    executionInterrupted("user", { at: 1300 }),
  ]
  const result = adaptNativeTrace({ identity: identity(), records, mappings: mappings() })

  assert.deepEqual(
    result.audit.calls.map((call) => [call.callID, call.status]),
    [
      ["call_failed", "failed"],
      ["call_incomplete", "aborted"],
      ["call_aborted", "aborted"],
      ["call_ok", "completed"],
    ],
  )
  assert.equal(result.audit.execution.status, "interrupted")
  assert.equal(result.audit.execution.reason, "user")
  assert.equal(result.trace.actions.length, 1, "only the completed call counts")
  assert.equal(result.audit.mappedActions[0].tool, "fixture-read")
  assert.equal(result.audit.notCounted.length, 3)
  assert.ok(result.audit.notCounted.every((entry) => entry.mapped === true))
})

test("a call that starts after the execution ended is refused as mixed", () => {
  rejects("mixed-execution", () =>
    adaptNativeTrace({
      identity: identity(),
      records: [
        executionStarted({ at: 800 }),
        executionSucceeded({ at: 900 }),
        toolNamed("call_read", "fixture-read"),
        toolCalled("call_read"),
        toolSuccess("call_read"),
      ],
      mappings: mappings(),
    }),
  )
  rejects("outside-execution", () =>
    adaptNativeTrace({
      identity: identity(),
      records: [toolNamed("call_read", "fixture-read"), toolCalled("call_read"), toolSuccess("call_read"), ...completeRun()],
      mappings: mappings(),
    }),
  )
})

test("mappings must be reviewed, known and unambiguous", () => {
  const records = completeRun([toolNamed("call_read", "fixture-read"), toolCalled("call_read"), toolSuccess("call_read")])
  for (const entry of [
    { tool: "fixture-read", effect: "not_an_effect", target: "synthetic_note", reviewed: true },
    { tool: "fixture-read", effect: "read", target: "   ", reviewed: true },
  ]) {
    rejects("malformed-mapping", () => adaptNativeTrace({ identity: identity(), records, mappings: mappings([entry]) }))
  }
  rejects("unreviewed-mapping", () =>
    adaptNativeTrace({
      identity: identity(),
      records,
      mappings: mappings([{ tool: "fixture-read", effect: "read", target: "synthetic_note" }]),
    }),
  )
  rejects("duplicate-mapping", () =>
    adaptNativeTrace({
      identity: identity(),
      records,
      mappings: mappings([
        { tool: "fixture-read", effect: "read", target: "synthetic_note", reviewed: true },
        { tool: "fixture-read", effect: "inspect", target: "synthetic_note", reviewed: true },
      ]),
    }),
  )
  rejects("malformed-mapping", () =>
    adaptNativeTrace({ identity: identity(), records, mappings: mappings(mappingEntries(), { reviewedBy: "" }) }),
  )
})

test("the schema version, case and execution identity must match exactly", () => {
  const records = completeRun([toolNamed("call_read", "fixture-read"), toolCalled("call_read"), toolSuccess("call_read")])
  rejects("unsupported-schema-version", () =>
    adaptNativeTrace({ identity: identity({ sdkVersion: "0.0.0-synthetic" }), records, mappings: mappings() }),
  )
  rejects("case-mismatch", () =>
    adaptNativeTrace({ identity: identity(), records, mappings: mappings(), expectedCaseId: "AGR-AU-017" }),
  )
  rejects("malformed-identity", () =>
    adaptNativeTrace({ identity: identity({ caseId: "not-a-case" }), records, mappings: mappings() }),
  )
  rejects("identity-mismatch", () =>
    adaptNativeTrace({ identity: identity({ executionID: "evt_synthetic_other" }), records, mappings: mappings() }),
  )
  rejects("missing-execution", () =>
    adaptNativeTrace({
      identity: identity(),
      records: [textEnded("no execution boundary was exported", { at: 1000 })],
      mappings: mappings(),
    }),
  )
})

test("measures come from native step and execution fields", () => {
  const records = [
    executionStarted({ at: 800 }),
    stepStarted({ started: 950 }),
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read", { at: 1000 }),
    toolSuccess("call_read", { at: 1100 }),
    stepEnded({ at: 1200, cost: 0.01, usage: tokens(100, 20, 0, 5, 0) }),
    stepStarted({ started: 1250 }),
    toolNamed("call_slow", "fixture-read", { messageID: "msg_synthetic_02" }),
    toolCalled("call_slow", { messageID: "msg_synthetic_02", at: 1300 }),
    toolSuccess("call_slow", { messageID: "msg_synthetic_02", at: 1550 }),
    stepEnded({ at: 1600, cost: 0.02, usage: tokens(110, 30, 1, 6, 1) }),
    executionSucceeded({ at: 1800 }),
  ]
  const result = adaptNativeTrace({ identity: identity(), records, mappings: mappings() })
  const { usage, runLatency, stepLatency, toolLatency, unavailable } = result.measures

  assert.equal(usage.status, "measured")
  assert.equal(usage.cost, 0.03)
  assert.deepEqual(usage.tokens, { input: 210, output: 50, reasoning: 1, cache: { read: 11, write: 1 } })
  assert.equal(usage.total.status, "unknown")
  assert.equal(runLatency.status, "measured")
  assert.equal(runLatency.ms, 1000)
  assert.deepEqual(
    stepLatency.map((entry) => entry.ms),
    [250, 350],
  )
  assert.deepEqual(
    toolLatency.map((entry) => [entry.callID, entry.status, entry.ms]),
    [
      ["call_read", "measured", 100],
      ["call_slow", "measured", 250],
    ],
  )
  assert.ok(!unavailable.includes("run latency"))
})

test("failed step usage is included and missing native usage stays unknown", () => {
  const failedStep = adaptNativeTrace({
    identity: identity(),
    records: [
      executionStarted({ at: 800 }),
      stepStarted({ started: 950 }),
      stepFailed({ at: 1200, usage: tokens(40, 10, 0, 0, 0) }),
      executionFailed({ at: 1300 }),
    ],
    mappings: mappings(),
  })
  assert.equal(failedStep.measures.usage.status, "measured")
  assert.equal(failedStep.measures.usage.cost, 0.02)
  assert.equal(failedStep.measures.usage.steps[0].kind, "failed")

  const noUsage = adaptNativeTrace({
    identity: identity(),
    records: completeRun([toolNamed("call_read", "fixture-read"), toolCalled("call_read"), toolSuccess("call_read")]),
    mappings: mappings(),
  })
  assert.equal(noUsage.measures.usage.status, "unknown")
  assert.match(noUsage.measures.usage.reason, /no session.step.ended/)
  assert.equal(noUsage.measures.runLatency.status, "measured")
  assert.ok(noUsage.measures.unavailable.includes("token and cost usage"))

  const openRun = adaptNativeTrace({
    identity: identity(),
    records: [executionStarted({ at: 800 }), toolNamed("call_pending", "fixture-read"), toolCalled("call_pending")],
    mappings: mappings(),
  })
  assert.equal(openRun.measures.runLatency.status, "unknown")
  assert.deepEqual(openRun.measures.toolLatency, [
    {
      callID: "call_pending",
      tool: "fixture-read",
      status: "unknown",
      reason: "no terminal tool result timestamp",
    },
  ])
  assert.deepEqual(openRun.audit.calls.map((call) => call.status), ["incomplete"])
})

test("a replayed durable sequence and a second execution are refused", () => {
  const first = executionStarted({ at: 800 })
  const named = toolNamed("call_read", "fixture-read")
  const calledRecord = toolCalled("call_read")
  const replayed = { ...toolSuccess("call_read"), durable: { aggregateID: SESSION, seq: named.durable.seq, version: 2 } }
  rejects("replayed-sequence", () =>
    adaptNativeTrace({ identity: identity(), records: [first, named, calledRecord, replayed], mappings: mappings() }),
  )

  rejects("multiple-executions", () =>
    adaptNativeTrace({
      identity: identity(),
      records: [first, named, calledRecord, toolSuccess("call_read"), executionStarted({ at: 2000, id: "evt_synthetic_execution_02" })],
      mappings: mappings(),
    }),
  )
})

test("ephemeral progress records are accepted without a durable envelope", () => {
  const records = completeRun([
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read"),
    toolProgress("call_read"),
    toolSuccess("call_read"),
  ])
  const result = adaptNativeTrace({ identity: identity(), records, mappings: mappings() })

  assert.equal(result.audit.calls[0].progressEvents, 1)
  assert.equal(result.audit.counts.ephemeral, 1)
  assert.deepEqual(result.audit.ignoredTypes, [])
  assert.equal(result.trace.actions.length, 1)
})

test("unhandled native event types are listed without inference", () => {
  const records = completeRun([
    nativeEvent("session.usage.recorded", { sessionID: SESSION, cost: 0.5, tokens: tokens(1, 1) }),
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read"),
    toolSuccess("call_read"),
  ])
  const result = adaptNativeTrace({ identity: identity(), records, mappings: mappings() })

  assert.deepEqual(result.audit.ignoredTypes, [{ type: "session.usage.recorded", count: 1 }])
  assert.equal(result.audit.counts.ignored, 1)
  assert.equal(result.measures.usage.status, "unknown", "session.usage.recorded is not a step measure")
})

test("empty record sets are refused", () => {
  rejects("empty-records", () => adaptNativeTrace({ identity: identity(), records: [], mappings: mappings() }))
  rejects("empty-records", () => adaptNativeTrace({ identity: identity(), records: bundle([]), mappings: mappings() }))
})

test("file tool content is recorded as a content type, never as an authenticated observation", () => {
  const records = completeRun([
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read"),
    toolSuccess("call_read", {
      content: [{ type: "file", uri: "file:///synthetic/note.txt", mime: "text/plain" }],
    }),
  ])
  const result = adaptNativeTrace({ identity: identity(), records, mappings: mappings() })

  assert.deepEqual(result.audit.calls[0].terminal.contentTypes, ["file"])
  assert.equal(result.audit.provenance.authenticated, false)
  assert.equal(result.audit.provenance.evidenceClass, "caller-supplied native-format records")
  assert.ok(!JSON.stringify(result.audit).includes("synthetic/note.txt"), "content location is not copied into the audit")
  assert.deepEqual(result.trace.actions, [
    { tool: "fixture-read", effect: "read", target: "synthetic_note", source: "tool", recorded: true },
  ])
})

test("the native executed flag is retained verbatim and never interpreted as an effect", () => {
  const records = completeRun([
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read", { executed: false }),
    toolSuccess("call_read", { executed: false }),
  ])
  const result = adaptNativeTrace({ identity: identity(), records, mappings: mappings() })

  assert.equal(result.audit.calls[0].executed, false)
  assert.equal(result.audit.calls[0].status, "completed", "the success terminal, not the flag, decides the status")
  assert.equal(result.trace.actions.length, 1)
})

test("adoption does not mutate the caller's records", () => {
  const records = completeRun([
    toolNamed("call_read", "fixture-read"),
    toolCalled("call_read"),
    toolSuccess("call_read"),
    stepStarted(),
    stepEnded(),
  ])
  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze)
      Object.freeze(value)
    }
    return value
  }
  const input = deepFreeze({ identity: identity(), records: bundle(records), mappings: mappings() })
  const result = adaptNativeTrace(input)

  assert.equal(result.trace.actions.length, 1)
  assert.equal(result.audit.calls[0].inputKeys.length > 0, true)
})

test("repeated step terminals cannot double-count native usage without a fresh start", () => {
  for (const repeated of [stepEnded, stepFailed]) {
    const records = completeRun([
      stepStarted({ started: 950 }),
      stepEnded({ at: 1200 }),
      repeated({ at: 1300, usage: tokens(100, 20) }),
    ])
    rejects("duplicate-step-terminal", () => adaptNativeTrace({ identity: identity(), records, mappings: mappings() }))
  }
})

test("regressed execution and step clocks are not published as negative latency", () => {
  rejects("execution-time-regression", () => adaptNativeTrace({
    identity: identity(),
    records: [executionStarted({ at: 1000 }), executionSucceeded({ at: 900 })],
    mappings: mappings(),
  }))
  rejects("step-time-regression", () => adaptNativeTrace({
    identity: identity(),
    records: completeRun([stepStarted({ started: 1300 }), stepEnded({ at: 1200 })]),
    mappings: mappings(),
  }))
})

test("overlapping starts for one assistant message cannot replace its latency baseline", () => {
  rejects("duplicate-step-start", () => adaptNativeTrace({
    identity: identity(),
    records: completeRun([stepStarted({ started: 950 }), stepStarted({ started: 1050 }), stepEnded({ at: 1200 })]),
    mappings: mappings(),
  }))
})

test("failed step finish follows the pinned optional content-filter schema", () => {
  for (const finish of [undefined, "content-filter"]) {
    const result = adaptNativeTrace({
      identity: identity(), records: completeRun([stepFailed({ finish })]), mappings: mappings(),
    })
    assert.equal(result.measures.usage.steps[0].finish, finish ?? null)
  }
  rejects("malformed-event", () => adaptNativeTrace({
    identity: identity(), records: completeRun([stepFailed({ finish: "error" })]), mappings: mappings(),
  }))
})
