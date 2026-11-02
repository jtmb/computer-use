import { CASE_ID_PATTERN, EFFECTS } from "./constants.mjs"

// Pinned to the event schemas committed in the v2.1.1 release that the
// installed CLI reports. A different schema is refused, never guessed: the
// pre-release `@opencode-ai/sdk` v2 generated types on this host use a
// different envelope and event names.
export const NATIVE_SCHEMA = Object.freeze({
  package: "@opencode/sdk",
  version: "2.1.1",
  tag: "v2.1.1",
  files: Object.freeze([
    "packages/schema/src/event.ts",
    "packages/schema/src/session-event.ts",
    "packages/client/src/promise/generated/types.ts",
  ]),
  cliObserved: "opencode v2.1.1",
})

export const NATIVE_TRACE_LIMITATIONS = Object.freeze([
  "Keep synthetic fixtures and actual-run observations separate. Adapting caller-supplied records alone does not establish their origin, real tool execution, or a passing agent.",
  "Caller-supplied records are trusted as input. The adapter authenticates neither their origin nor the declared mapping review.",
  "Effects come only from reviewed mappings of the exact tool name reported by session.tool.input.started. An unnamed or unmapped tool contributes no effect.",
  "Claims are never derived from native prose or tool output; the adapted trace always carries an empty claim channel.",
  "Measurements use native event fields only. Fields absent from the records report unknown instead of being estimated.",
  "Support is pinned to the v2.1.1 event schema. Other shapes, including the pre-release @opencode-ai/sdk v2 types, are rejected rather than assumed compatible.",
  "Native executed flags, tool content and native payloads are retained as raw structural evidence, not interpreted as success or effect.",
])

const INPUT_FIELDS = new Set(["identity", "records", "mappings", "expectedCaseId"])
const IDENTITY_FIELDS = new Set(["runId", "sessionId", "caseId", "sdkVersion", "executionID"])
const BUNDLE_FIELDS = new Set(["runId", "sessionId", "caseId", "sdkVersion", "executionID", "source", "records"])
const MAPPING_FIELDS = new Set(["reviewedBy", "reviewedOn", "entries"])
const MAPPING_ENTRY_FIELDS = new Set(["tool", "effect", "target", "reviewed", "note"])
const ENVELOPE_FIELDS = new Set(["id", "created", "type", "durable", "location", "metadata", "data"])

const TOOL_INPUT_STARTED = "session.tool.input.started"
const TOOL_CALLED = "session.tool.called"
const TOOL_PROGRESS = "session.tool.progress"
const TOOL_SUCCESS = "session.tool.success"
const TOOL_FAILED = "session.tool.failed"
const STEP_STARTED = "session.step.started"
const STEP_ENDED = "session.step.ended"
const STEP_FAILED = "session.step.failed"
const EXECUTION_STARTED = "session.execution.started"
const EXECUTION_SUCCEEDED = "session.execution.succeeded"
const EXECUTION_FAILED = "session.execution.failed"
const EXECUTION_INTERRUPTED = "session.execution.interrupted"
const TEXT_ENDED = "session.text.ended"
const REASONING_ENDED = "session.reasoning.ended"
const SESSION_CREATED = "session.created"

const DURABLE_VERSIONS = new Map([
  [TOOL_INPUT_STARTED, 1],
  [TOOL_CALLED, 1],
  [TOOL_SUCCESS, 2],
  [TOOL_FAILED, 2],
  [STEP_STARTED, 1],
  [STEP_ENDED, 1],
  [STEP_FAILED, 1],
  [EXECUTION_STARTED, 1],
  [EXECUTION_SUCCEEDED, 1],
  [EXECUTION_FAILED, 1],
  [EXECUTION_INTERRUPTED, 1],
  [TEXT_ENDED, 1],
  [REASONING_ENDED, 1],
  [SESSION_CREATED, 1],
])

const EPHEMERAL_TYPES = new Set([
  TOOL_PROGRESS,
  "session.tool.input.delta",
  "session.text.delta",
  "session.reasoning.delta",
  "session.compaction.delta",
])

const FINISH_REASONS = new Set(["stop", "length", "tool-calls", "content-filter", "error", "unknown"])
const INTERRUPT_REASONS = new Set(["user", "shutdown", "superseded", "inactivity"])

export class NativeTraceError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = "NativeTraceError"
    this.code = code
    this.details = details
  }
}

const fail = (code, message, details = {}) => {
  throw new NativeTraceError(code, message, details)
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0

const isTimestamp = (value) => Number.isFinite(value) && value >= 0

const isCount = (value) => Number.isFinite(value) && value >= 0

function rejectUnknownFields(value, allowed, where) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail("unknown-field", `${where}.${key} is not part of the adapter contract`, { field: key, where })
    }
  }
}

function readIdentity(raw) {
  if (!isPlainObject(raw)) fail("malformed-identity", "identity must be an object")
  rejectUnknownFields(raw, IDENTITY_FIELDS, "identity")
  const { runId, sessionId, caseId, sdkVersion, executionID } = raw
  if (!isNonEmptyString(runId)) fail("malformed-identity", "identity.runId must be a non-empty string")
  if (!isNonEmptyString(sessionId)) fail("malformed-identity", "identity.sessionId must be a non-empty string")
  if (!isNonEmptyString(caseId) || !CASE_ID_PATTERN.test(caseId)) {
    fail("malformed-identity", "identity.caseId must be a case id such as AGR-AU-019")
  }
  if (!isNonEmptyString(sdkVersion)) fail("malformed-identity", "identity.sdkVersion must name the native schema version")
  if (sdkVersion !== NATIVE_SCHEMA.version) {
    fail(
      "unsupported-schema-version",
      `native schema ${sdkVersion} is not the pinned ${NATIVE_SCHEMA.version}; refusing to guess event or field meanings`,
      { expected: NATIVE_SCHEMA.version, received: sdkVersion },
    )
  }
  if (!isNonEmptyString(executionID) || !executionID.startsWith("evt_")) {
    fail("malformed-identity", "identity.executionID must be the evt_ id of the source execution.started event")
  }
  return { runId, sessionId, caseId, sdkVersion, executionID }
}

function readMappings(raw) {
  if (!isPlainObject(raw)) fail("malformed-mapping", "mappings must be an object")
  rejectUnknownFields(raw, MAPPING_FIELDS, "mappings")
  if (!isNonEmptyString(raw.reviewedBy)) fail("malformed-mapping", "mappings.reviewedBy must name who reviewed the mapping")
  if (typeof raw.reviewedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.reviewedOn)) {
    fail("malformed-mapping", "mappings.reviewedOn must be an ISO date")
  }
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    fail("malformed-mapping", "mappings.entries must be a non-empty array")
  }

  const byTool = new Map()
  for (const [index, entry] of raw.entries.entries()) {
    const where = `mappings.entries[${index}]`
    if (!isPlainObject(entry)) fail("malformed-mapping", `${where} must be an object`)
    rejectUnknownFields(entry, MAPPING_ENTRY_FIELDS, where)
    if (!isNonEmptyString(entry.tool)) fail("malformed-mapping", `${where}.tool must be an exact native tool name`)
    if (!isNonEmptyString(entry.effect) || !EFFECTS.has(entry.effect)) {
      fail("malformed-mapping", `${where}.effect must be a known effect`)
    }
    if (!isNonEmptyString(entry.target)) fail("malformed-mapping", `${where}.target must be a non-empty semantic label`)
    if (entry.reviewed !== true) fail("unreviewed-mapping", `${where} must be explicitly reviewed before it can label an effect`)
    if (entry.note !== undefined && !isNonEmptyString(entry.note)) fail("malformed-mapping", `${where}.note must be a non-empty string`)
    if (byTool.has(entry.tool)) fail("duplicate-mapping", `${where} repeats a mapping for ${entry.tool}`)
    byTool.set(entry.tool, {
      tool: entry.tool,
      effect: entry.effect,
      target: entry.target,
      note: entry.note ?? null,
      reviewedBy: raw.reviewedBy,
      reviewedOn: raw.reviewedOn,
    })
  }
  return { byTool, reviewedBy: raw.reviewedBy, reviewedOn: raw.reviewedOn }
}

function unwrapRecords(raw, identity) {
  let records = raw
  let bundle = null
  if (!Array.isArray(raw)) {
    if (!isPlainObject(raw)) fail("malformed-input", "records must be an array or a record bundle")
    rejectUnknownFields(raw, BUNDLE_FIELDS, "records bundle")
    if (!Array.isArray(raw.records)) fail("malformed-input", "records bundle.records must be an array")
    if (raw.source !== undefined && !isNonEmptyString(raw.source)) {
      fail("malformed-input", "records bundle.source must be a non-empty string")
    }
    for (const field of ["runId", "sessionId", "caseId", "sdkVersion", "executionID"]) {
      if (raw[field] !== undefined && raw[field] !== identity[field]) {
        fail("identity-mismatch", `records bundle.${field} does not match the declared identity`, {
          field,
          expected: identity[field],
          received: raw[field],
        })
      }
    }
    bundle = {
      runId: raw.runId ?? null,
      sessionId: raw.sessionId ?? null,
      caseId: raw.caseId ?? null,
      sdkVersion: raw.sdkVersion ?? null,
      executionID: raw.executionID ?? null,
      source: raw.source ?? null,
    }
    records = raw.records
  }
  if (records.length === 0) fail("empty-records", "records must contain at least one native event")
  return { records, bundle }
}

function createState() {
  return {
    eventIds: new Set(),
    sequences: new Map(),
    calls: new Map(),
    names: new Map(),
    order: [],
    ignored: new Map(),
    scanned: 0,
    ephemeral: 0,
    execution: null,
    steps: [],
    stepLatency: [],
    stepStarted: new Map(),
    stepTerminals: new Set(),
    responseParts: [],
    sessionVersion: null,
  }
}

function normalizeEnvelope(raw, index, identity, state) {
  const where = `records[${index}]`
  if (!isPlainObject(raw)) fail("malformed-record", `${where} must be an object`)
  if (!isNonEmptyString(raw.type)) fail("malformed-record", `${where}.type must be a non-empty string`)
  rejectUnknownFields(raw, ENVELOPE_FIELDS, where)
  if (!isNonEmptyString(raw.id) || !raw.id.startsWith("evt_")) {
    fail("malformed-record", `${where}.id must be an evt_ event id`)
  }
  if (!isTimestamp(raw.created)) fail("malformed-record", `${where}.created must be a finite millisecond number`)
  if (!isPlainObject(raw.data)) fail("malformed-envelope", `${where}.data must be an object`)
  if (state.eventIds.has(raw.id)) fail("duplicate-event-id", `${where} repeats event id ${raw.id}`, { id: raw.id })
  state.eventIds.add(raw.id)

  if (raw.data.sessionID !== undefined) {
    if (!isNonEmptyString(raw.data.sessionID)) fail("malformed-event", `${where}.data.sessionID must be a non-empty string`)
    if (raw.data.sessionID !== identity.sessionId) {
      fail("mixed-session", `${where}.data.sessionID does not match the declared session`, {
        expected: identity.sessionId,
        received: raw.data.sessionID,
      })
    }
  }

  const expectedVersion = DURABLE_VERSIONS.get(raw.type)
  if (raw.durable === undefined) {
    if (expectedVersion !== undefined) {
      fail("malformed-envelope", `${where} is a durable v2.1.1 event and needs a durable envelope`)
    }
    state.ephemeral += 1
  } else {
    if (EPHEMERAL_TYPES.has(raw.type)) {
      fail("malformed-envelope", `${where} is an ephemeral v2.1.1 event and must not carry durable`)
    }
    if (!isPlainObject(raw.durable)) fail("malformed-envelope", `${where}.durable must be an object`)
    const { aggregateID, seq, version } = raw.durable
    if (!isNonEmptyString(aggregateID) || !Number.isInteger(seq) || seq < 0 || !Number.isInteger(version) || version < 1) {
      fail("malformed-envelope", `${where}.durable needs aggregateID plus non-negative seq and positive version`)
    }
    if (aggregateID !== identity.sessionId) {
      fail("identity-mismatch", `${where}.durable.aggregateID does not match the declared session`, {
        expected: identity.sessionId,
        received: aggregateID,
      })
    }
    if (expectedVersion !== undefined && version !== expectedVersion) {
      fail("unsupported-event-version", `${where} uses durable version ${version} for a type pinned to ${expectedVersion}`, {
        type: raw.type,
        expected: expectedVersion,
        received: version,
      })
    }
    const previous = state.sequences.get(aggregateID)
    // Replayed or reordered durable streams cannot be trusted as one observation.
    if (previous !== undefined && seq <= previous) {
      fail("replayed-sequence", `${where} has non-increasing durable seq ${seq} for ${aggregateID}`, { aggregateID, seq })
    }
    state.sequences.set(aggregateID, seq)
  }
  return { type: raw.type, where, created: raw.created, data: raw.data, id: raw.id }
}

function requireTimestampField(data, field, where) {
  if (!isTimestamp(data[field])) fail("malformed-event", `${where}.data.${field} must be a finite millisecond number`)
  return data[field]
}

function requireStringField(data, field, where) {
  if (!isNonEmptyString(data[field])) fail("malformed-event", `${where}.data.${field} must be a non-empty string`)
  return data[field]
}

function requireSession(data, where) {
  return requireStringField(data, "sessionID", where)
}

function requireToolContent(data, where) {
  const content = data.content
  if (!Array.isArray(content) || content.length === 0) {
    fail("malformed-event", `${where}.data.content must be a non-empty array of tool content`)
  }
  return content.map((item, index) => {
    const at = `${where}.data.content[${index}]`
    if (!isPlainObject(item)) fail("malformed-event", `${at} must be an object`)
    if (item.type === "text") {
      if (typeof item.text !== "string") fail("malformed-event", `${at}.text must be a string`)
      return "text"
    }
    if (item.type === "file") {
      if (!isNonEmptyString(item.uri) || !isNonEmptyString(item.mime)) {
        fail("malformed-event", `${at} file content needs uri and mime`)
      }
      if (item.name !== undefined && item.name !== null && typeof item.name !== "string") {
        fail("malformed-event", `${at}.name must be a string when present`)
      }
      return "file"
    }
    return fail("malformed-event", `${at}.type must be text or file`)
  })
}

function requireStructuredError(value, where, field) {
  if (!isPlainObject(value)) fail("malformed-event", `${where}.data.${field} must be an object`)
  if (!isNonEmptyString(value.type)) fail("malformed-event", `${where}.data.${field}.type must be a non-empty string`)
  if (!isNonEmptyString(value.message)) fail("malformed-event", `${where}.data.${field}.message must be a non-empty string`)
  if (value.status !== undefined && !isCount(value.status)) {
    fail("malformed-event", `${where}.data.${field}.status must be a number when present`)
  }
  if (value.response !== undefined) {
    if (!isPlainObject(value.response) || typeof value.response.body !== "string") {
      fail("malformed-event", `${where}.data.${field}.response must carry a string body`)
    }
  }
}

function requireTokenUsage(value, where, field) {
  if (!isPlainObject(value)) fail("malformed-event", `${where}.data.${field} must be an object`)
  for (const key of ["input", "output", "reasoning"]) {
    if (!isCount(value[key])) fail("malformed-event", `${where}.data.${field}.${key} must be a non-negative number`)
  }
  if (!isPlainObject(value.cache) || !isCount(value.cache.read) || !isCount(value.cache.write)) {
    fail("malformed-event", `${where}.data.${field}.cache needs non-negative read and write`)
  }
  return {
    input: value.input,
    output: value.output,
    reasoning: value.reasoning,
    cache: { read: value.cache.read, write: value.cache.write },
  }
}

function requireOpenExecution(record, state) {
  if (!state.execution) fail("outside-execution", `${record.where} arrives before any session.execution.started`)
  if (state.execution.terminal) {
    fail("mixed-execution", `${record.where} arrives after the recorded execution ended`, {
      executionID: state.execution.id,
      status: state.execution.terminal.kind,
    })
  }
}

function readExecution(record, identity, state) {
  const { data, where } = record
  requireSession(data, where)
  if (record.type === EXECUTION_STARTED) {
    if (state.execution) fail("multiple-executions", `${where} starts a second execution in one record set`)
    if (record.id !== identity.executionID) {
      fail("identity-mismatch", `${where} is a different execution than identity.executionID`, {
        expected: identity.executionID,
        received: record.id,
      })
    }
    state.execution = { id: record.id, startedAt: record.created, terminal: null }
    return
  }
  requireOpenExecution(record, state)
  if (record.created < state.execution.startedAt) {
    fail("execution-time-regression", `${where} ends the execution before it started`)
  }
  if (record.type === EXECUTION_SUCCEEDED) {
    state.execution.terminal = { kind: "succeeded", at: record.created }
    return
  }
  if (record.type === EXECUTION_FAILED) {
    requireStructuredError(data.error, where, "error")
    state.execution.terminal = { kind: "failed", at: record.created, errorType: data.error.type }
    return
  }
  if (!isNonEmptyString(data.reason) || !INTERRUPT_REASONS.has(data.reason)) {
    fail("malformed-event", `${where}.data.reason must be a known interrupt reason`)
  }
  state.execution.terminal = { kind: "interrupted", at: record.created, reason: data.reason }
}

function readToolName(record, state) {
  const { data, where } = record
  requireSession(data, where)
  requireOpenExecution(record, state)
  const assistantMessageID = requireStringField(data, "assistantMessageID", where)
  const id = requireStringField(data, "id", where)
  const name = requireStringField(data, "name", where)
  const key = `${assistantMessageID}\u0000${id}`
  if (state.names.has(key)) fail("duplicate-tool-name", `${where} repeats the tool name for call ${id}`, { callID: id })
  state.names.set(key, name)
}

function readToolCalled(record, state) {
  const { data, where } = record
  requireSession(data, where)
  requireOpenExecution(record, state)
  const assistantMessageID = requireStringField(data, "assistantMessageID", where)
  const id = requireStringField(data, "id", where)
  if (!isPlainObject(data.input)) fail("malformed-event", `${where}.data.input must be an object`)
  if (typeof data.executed !== "boolean") fail("malformed-event", `${where}.data.executed must be a boolean`)
  const key = `${assistantMessageID}\u0000${id}`
  if (state.calls.has(key)) {
    fail("duplicate-call-id", `${where} repeats tool call ${id}; replayed calls are ambiguous`, { callID: id })
  }
  const tool = state.names.get(key)
  if (!tool) {
    fail("missing-tool-name", `${where} has no session.tool.input.started name for call ${id}`, { callID: id })
  }
  state.calls.set(key, {
    callID: id,
    key,
    tool,
    assistantMessageID,
    calledAt: record.created,
    executed: data.executed,
    inputKeys: Object.keys(data.input).sort(),
    progressEvents: 0,
    terminal: null,
  })
  state.order.push(key)
}

function readToolProgress(record, state) {
  const { data, where } = record
  requireSession(data, where)
  requireStringField(data, "assistantMessageID", where)
  requireStringField(data, "id", where)
  if (!isPlainObject(data.metadata)) fail("malformed-event", `${where}.data.metadata must be an object`)
  const key = `${data.assistantMessageID}\u0000${data.id}`
  const call = state.calls.get(key)
  if (call) call.progressEvents += 1
}

function readToolTerminal(record, state, kind) {
  const { data, where } = record
  requireSession(data, where)
  requireOpenExecution(record, state)
  const assistantMessageID = requireStringField(data, "assistantMessageID", where)
  const id = requireStringField(data, "id", where)
  if (typeof data.executed !== "boolean") fail("malformed-event", `${where}.data.executed must be a boolean`)
  if (data.metadata !== undefined && !isPlainObject(data.metadata)) {
    fail("malformed-event", `${where}.data.metadata must be an object when present`)
  }
  const key = `${assistantMessageID}\u0000${id}`
  const call = state.calls.get(key)
  if (!call) {
    fail("orphan-tool-result", `${where} reports ${kind} for call ${id} without a preceding session.tool.called`, { callID: id })
  }
  if (call.terminal) {
    fail("duplicate-tool-terminal", `${where} repeats a terminal result for call ${id}`, { callID: id })
  }
  if (record.created < call.calledAt) {
    fail("tool-time-regression", `${where} ends call ${id} before it was called`, { callID: id })
  }
  if (call.executed !== data.executed) {
    fail("inconsistent-call", `${where} changes executed for call ${id}`, { callID: id })
  }

  if (kind === "success") {
    const contentTypes = requireToolContent(data, where)
    call.terminal = {
      kind,
      at: record.created,
      contentTypes,
      metadataKeys: data.metadata === undefined ? null : Object.keys(data.metadata).sort(),
      hasNative: data.native !== undefined,
      errorType: null,
    }
    return
  }

  requireStructuredError(data.error, where, "error")
  const contentTypes = data.content === undefined ? null : requireToolContent(data, where)
  call.terminal = {
    kind,
    at: record.created,
    contentTypes,
    metadataKeys: data.metadata === undefined ? null : Object.keys(data.metadata).sort(),
    hasNative: data.native !== undefined,
    errorType: data.error.type,
  }
}

function readStepStarted(record, state) {
  const { data, where } = record
  requireSession(data, where)
  requireOpenExecution(record, state)
  const assistantMessageID = requireStringField(data, "assistantMessageID", where)
  requireStringField(data, "agent", where)
  if (!isPlainObject(data.model) || !isNonEmptyString(data.model.id) || !isNonEmptyString(data.model.providerID)) {
    fail("malformed-event", `${where}.data.model needs id and providerID`)
  }
  requireTimestampField(data, "started", where)
  if (state.stepStarted.has(assistantMessageID) && !state.stepTerminals.has(assistantMessageID)) {
    fail("duplicate-step-start", `${where} replaces an unfinished step start for this assistant message`)
  }
  state.stepTerminals.delete(assistantMessageID)
  state.stepStarted.set(assistantMessageID, { started: data.started, at: record.created, agent: data.agent, model: {
    id: data.model.id,
    providerID: data.model.providerID,
  } })
}

function readStepEnded(record, state, failed) {
  const { data, where } = record
  requireSession(data, where)
  requireOpenExecution(record, state)
  const assistantMessageID = requireStringField(data, "assistantMessageID", where)
  if (state.stepTerminals.has(assistantMessageID)) {
    fail("duplicate-step-terminal", `${where} repeats a step terminal without a fresh step start`)
  }
  if (failed) {
    requireStructuredError(data.error, where, "error")
    if (data.finish !== undefined && data.finish !== "content-filter") {
      fail("malformed-event", `${where}.data.finish must be content-filter when present on a failed step`)
    }
  } else if (!isNonEmptyString(data.finish) || !FINISH_REASONS.has(data.finish)) {
    fail("malformed-event", `${where}.data.finish must be a known finish reason`)
  }

  const nativeUsage = isCount(data.cost) && data.tokens !== undefined
  const tokens = nativeUsage ? requireTokenUsage(data.tokens, where, "tokens") : null
  const started = state.stepStarted.get(assistantMessageID)
  if (started && record.created < started.started) {
    fail("step-time-regression", `${where} ends the step before its native dispatch timestamp`)
  }
  state.stepTerminals.add(assistantMessageID)
  state.steps.push({
    assistantMessageID,
    kind: failed ? "failed" : "ended",
    finish: data.finish ?? null,
    cost: nativeUsage ? data.cost : null,
    tokens,
    errorType: failed ? data.error.type : null,
  })
  state.stepLatency.push(
    started
      ? {
          assistantMessageID,
          status: "measured",
          ms: record.created - started.started,
          startedAt: started.started,
          endedAt: record.created,
        }
      : {
          assistantMessageID,
          status: "unknown",
          reason: "no session.step.started record for this assistant message",
        },
  )
}

function readResponsePart(record, state) {
  const { data, where } = record
  requireSession(data, where)
  const assistantMessageID = requireStringField(data, "assistantMessageID", where)
  state.responseParts.push({
    type: record.type,
    assistantMessageID,
    length: typeof data.text === "string" ? data.text.length : null,
  })
}

function readSessionCreated(record, state) {
  const { data, where } = record
  requireSession(data, where)
  if (data.version !== undefined && !isNonEmptyString(data.version)) {
    fail("malformed-event", `${where}.data.version must be a non-empty string when present`)
  }
  state.sessionVersion = data.version ?? null
}

function ingest(record, identity, state) {
  const type = record.type
  if (type === EXECUTION_STARTED || type === EXECUTION_SUCCEEDED || type === EXECUTION_FAILED || type === EXECUTION_INTERRUPTED) {
    return readExecution(record, identity, state)
  }
  if (type === TOOL_INPUT_STARTED) return readToolName(record, state)
  if (type === TOOL_CALLED) return readToolCalled(record, state)
  if (type === TOOL_PROGRESS) return readToolProgress(record, state)
  if (type === TOOL_SUCCESS) return readToolTerminal(record, state, "success")
  if (type === TOOL_FAILED) return readToolTerminal(record, state, "failed")
  if (type === STEP_STARTED) return readStepStarted(record, state)
  if (type === STEP_ENDED) return readStepEnded(record, state, false)
  if (type === STEP_FAILED) return readStepEnded(record, state, true)
  if (type === TEXT_ENDED || type === REASONING_ENDED) return readResponsePart(record, state)
  if (type === SESSION_CREATED) return readSessionCreated(record, state)
  // Other native event types stay listed in the audit; nothing is inferred from them.
  state.ignored.set(type, (state.ignored.get(type) ?? 0) + 1)
}

function resolveStatus(call, state) {
  if (call.terminal?.kind === "success") return "completed"
  if (call.terminal?.kind === "failed") return "failed"
  if (state.execution?.terminal?.kind === "interrupted") return "aborted"
  return "incomplete"
}

function buildMeasures(state, callAudit) {
  const unavailable = []
  const measuredSteps = state.steps.filter((step) => step.cost !== null)
  let usage
  if (measuredSteps.length > 0) {
    const totals = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
    let cost = 0
    for (const step of measuredSteps) {
      cost += step.cost
      totals.input += step.tokens.input
      totals.output += step.tokens.output
      totals.reasoning += step.tokens.reasoning
      totals.cache.read += step.tokens.cache.read
      totals.cache.write += step.tokens.cache.write
    }
    usage = {
      status: "measured",
      derivedFrom: "sum of session.step.ended and session.step.failed cost/tokens",
      cost,
      tokens: totals,
      total: { status: "unknown", reason: "TokenUsageInfo has no total field in v2.1.1" },
      steps: state.steps,
    }
  } else {
    usage = {
      status: "unknown",
      reason: "no session.step.ended or session.step.failed record carries native cost and tokens",
      steps: state.steps,
    }
    unavailable.push("token and cost usage")
  }

  const execution = state.execution
  const runLatency = execution?.terminal
    ? {
        status: "measured",
        derivedFrom: "execution terminal created minus session.execution.started created",
        ms: execution.terminal.at - execution.startedAt,
      }
    : {
        status: "unknown",
        reason: execution ? "no terminal session.execution.* record" : "no session.execution.started record",
      }
  if (runLatency.status === "unknown") unavailable.push("run latency")

  const toolLatency = callAudit.map((call) =>
    call.latencyMs === null
      ? { callID: call.callID, tool: call.tool, status: "unknown", reason: "no terminal tool result timestamp" }
      : { callID: call.callID, tool: call.tool, status: "measured", ms: call.latencyMs },
  )
  if (toolLatency.some((entry) => entry.status === "unknown")) {
    unavailable.push("latency for calls without a terminal result")
  }

  return {
    nativeSource: `v${NATIVE_SCHEMA.version} session.* durable events`,
    usage,
    runLatency,
    stepLatency: state.stepLatency,
    toolLatency,
    unavailable,
  }
}

export function adaptNativeTrace(input) {
  if (!isPlainObject(input)) fail("malformed-input", "native trace input must be an object")
  rejectUnknownFields(input, INPUT_FIELDS, "input")
  const identity = readIdentity(input.identity)
  if (input.expectedCaseId !== undefined) {
    if (!isNonEmptyString(input.expectedCaseId) || !CASE_ID_PATTERN.test(input.expectedCaseId)) {
      fail("malformed-input", "expectedCaseId must be a case id such as AGR-AU-019")
    }
    if (input.expectedCaseId !== identity.caseId) {
      fail("case-mismatch", "identity.caseId does not match the case being evaluated", {
        expected: input.expectedCaseId,
        received: identity.caseId,
      })
    }
  }
  const mappings = readMappings(input.mappings)
  const { records, bundle } = unwrapRecords(input.records, identity)

  const state = createState()
  records.forEach((raw, index) => {
    const record = normalizeEnvelope(raw, index, identity, state)
    state.scanned += 1
    ingest(record, identity, state)
  })

  if (!state.execution) {
    fail("missing-execution", "records contain no session.execution.started event for the declared executionID")
  }

  const callAudit = state.order.map((key) => {
    const call = state.calls.get(key)
    return {
      callID: call.callID,
      tool: call.tool,
      assistantMessageID: call.assistantMessageID,
      status: resolveStatus(call, state),
      calledAt: call.calledAt,
      endedAt: call.terminal?.at ?? null,
      latencyMs: call.terminal ? call.terminal.at - call.calledAt : null,
      executed: call.executed,
      progressEvents: call.progressEvents,
      inputKeys: call.inputKeys,
      terminal: call.terminal,
    }
  })

  const actions = []
  const unmappedCalls = []
  const notCounted = []
  for (const call of callAudit) {
    const mapping = mappings.byTool.get(call.tool)
    if (call.status !== "completed") {
      notCounted.push({
        callID: call.callID,
        tool: call.tool,
        status: call.status,
        mapped: Boolean(mapping),
        reason: `${call.status} native tool call cannot count as a recorded effect`,
      })
      continue
    }
    if (!mapping) {
      unmappedCalls.push({ callID: call.callID, tool: call.tool, status: call.status })
      continue
    }
    actions.push({
      tool: call.tool,
      effect: mapping.effect,
      target: mapping.target,
      source: "tool",
      recorded: true,
    })
  }

  const measures = buildMeasures(state, callAudit)
  const trace = { caseId: identity.caseId, actions, claims: [] }
  const audit = {
    identity: { ...identity },
    bundle,
    schema: { ...NATIVE_SCHEMA, files: [...NATIVE_SCHEMA.files] },
    execution: {
      id: state.execution.id,
      startedAt: state.execution.startedAt,
      status: state.execution.terminal?.kind ?? "open",
      reason: state.execution.terminal?.reason ?? null,
      errorType: state.execution.terminal?.errorType ?? null,
    },
    sessionVersion: state.sessionVersion,
    mappingReview: {
      reviewedBy: mappings.reviewedBy,
      reviewedOn: mappings.reviewedOn,
      entryCount: mappings.byTool.size,
      authenticated: false,
    },
    counts: {
      records: records.length,
      scanned: state.scanned,
      ephemeral: state.ephemeral,
      ignored: [...state.ignored.values()].reduce((sum, count) => sum + count, 0),
    },
    ignoredTypes: [...state.ignored.entries()].map(([type, count]) => ({ type, count })),
    calls: callAudit,
    mappedActions: actions.map((action) => ({ effect: action.effect, target: action.target, tool: action.tool })),
    unmappedCalls,
    notCounted,
    responseParts: state.responseParts,
    claims: { derived: false, count: 0, reason: "native prose and tool content never produce claim tags" },
    provenance: {
      evidenceClass: "caller-supplied native-format records",
      authenticated: false,
      note: "Structural native evidence only. Retain the original export separately; this audit omits tool content, errors and prose.",
    },
  }

  return { trace, audit, measures, limitations: [...NATIVE_TRACE_LIMITATIONS] }
}
