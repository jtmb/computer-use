import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { mkdtemp, lstat, mkdir, open, readFile, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { performance } from "node:perf_hooks"
import { isDeepStrictEqual } from "node:util"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const APPROVED_TEMP_ROOT = "/tmp/opencode"
const EXPECTED_TOOLS = ["act", "close", "navigate", "open", "screenshot", "signin", "snapshot", "tabs"]
const EXPECTED_CALLS = ["open", "snapshot", "close"]

const TOKEN_FIELDS = ["input", "output", "reasoning", "cacheRead", "cacheWrite"]
const USAGE_LIMITS = Object.freeze({ sessions: 8, pageSize: 50, pagesPerSession: 10, totalMessagePages: 20, cursorBytes: 4096 })

export function parseUsageResponse(response) {
  const parsed = typeof response === "string" ? JSON.parse(response) : response
  if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
    throw new TypeError("OpenCode response must contain data")
  }
  return parsed
}

function observedNumber(value, label, integer = false) {
  if (value === undefined || value === null) return null
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new TypeError(`${label} must be a finite non-negative ${integer ? "integer" : "number"}`)
  }
  return value
}

function usageTokens(tokens) {
  return {
    input: observedNumber(tokens?.input, "input tokens", true),
    output: observedNumber(tokens?.output, "output tokens", true),
    reasoning: observedNumber(tokens?.reasoning, "reasoning tokens", true),
    cacheRead: observedNumber(tokens?.cache?.read, "cache read tokens", true),
    cacheWrite: observedNumber(tokens?.cache?.write, "cache write tokens", true),
  }
}

function sumKnown(values) {
  return values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0)
}

function sumTokens(rows) {
  return Object.fromEntries(TOKEN_FIELDS.map((field) => [field, sumKnown(rows.map((row) => row.tokens[field]))]))
}

function modelRef(model) {
  return { providerID: model?.providerID ?? null, id: model?.id ?? null, variant: model?.variant ?? null }
}

function duration(start, end) {
  return start === null || end === null || end < start ? null : end - start
}

export function summarizeSessionUsage(session, messageSnapshot = null) {
  if (!session || typeof session.id !== "string" || !session.id) throw new TypeError("session needs an id")
  const time = Object.fromEntries(["created", "updated", "idle"].map((key) => [key, observedNumber(session.time?.[key], key)]))
  const result = {
    id: session.id,
    parentID: session.parentID ?? null,
    agent: session.agent ?? null,
    currentModel: modelRef(session.model),
    tokens: usageTokens(session.tokens),
    cost: observedNumber(session.cost, "session cost"),
    time,
    createdToUpdatedMs: duration(time.created, time.updated),
    createdToIdleMs: duration(time.created, time.idle),
    outcome: session.outcome ?? null,
    steps: null,
    turns: null,
    syntheticPrompts: null,
    tools: null,
    messageCoverage: "not-requested",
    messageModels: null,
  }
  if (!messageSnapshot) return result
  if (!Array.isArray(messageSnapshot.data)) throw new TypeError("message snapshot data must be an array")
  result.messageCoverage = messageSnapshot.complete === true ? "complete" : "partial"
  const messages = messageSnapshot.data
  const assistants = messages.filter((message) => message.type === "assistant")
  result.steps = assistants.length
  result.turns = messages.filter((message) => message.type === "user").length
  result.syntheticPrompts = messages.filter((message) => message.type === "synthetic").length
  result.tools = { calls: 0, succeeded: 0, failed: 0, unfinished: 0, byName: {} }
  for (const message of assistants) {
    for (const part of message.content ?? []) {
      if (part.type !== "tool") continue
      const status = part.state?.status
      if (!["completed", "error", "running", "streaming"].includes(status)) {
        throw new TypeError(`unknown projected tool status: ${status}`)
      }
      result.tools.calls += 1
      result.tools[status === "completed" ? "succeeded" : status === "error" ? "failed" : "unfinished"] += 1
      const name = String(part.name)
      Object.defineProperty(result.tools.byName, name, {
        value: (Object.hasOwn(result.tools.byName, name) ? result.tools.byName[name] : 0) + 1,
        enumerable: true, configurable: true,
      })
    }
  }
  const groups = new Map()
  for (const message of assistants) {
    const model = modelRef(message.model)
    const key = JSON.stringify(model)
    if (!groups.has(key)) groups.set(key, { model, rows: [] })
    groups.get(key).rows.push({ tokens: usageTokens(message.tokens), cost: observedNumber(message.cost, "message cost") })
  }
  result.messageModels = [...groups.values()].map(({ model, rows }) => ({
    model, steps: rows.length, tokens: sumTokens(rows), cost: sumKnown(rows.map((row) => row.cost)),
  }))
  return result
}

export function aggregateSessionUsage(sessions) {
  const interrupted = sessions.filter((session) => session.outcome === "interrupted")
  return {
    sessions: sessions.length,
    subagents: sessions.filter((session) => session.parentID !== null).length,
    tokens: sumTokens(sessions),
    cost: sumKnown(sessions.map((session) => session.cost)),
    completeMessageSessions: sessions.filter((session) => session.messageCoverage === "complete").length,
    steps: sessions.every((session) => session.messageCoverage === "complete") ? sumKnown(sessions.map((session) => session.steps)) : null,
    turns: sessions.every((session) => session.messageCoverage === "complete") ? sumKnown(sessions.map((session) => session.turns)) : null,
    tools: sessions.every((session) => session.messageCoverage === "complete")
      ? Object.fromEntries(["calls", "succeeded", "failed", "unfinished"].map((key) => [key, sumKnown(sessions.map((session) => session.tools[key]))]))
      : null,
    interrupted: {
      sessions: interrupted.length,
      summedCreatedToUpdatedMs: sumKnown(interrupted.map((session) => session.createdToUpdatedMs)),
      summedCreatedToIdleMs: sumKnown(interrupted.map((session) => session.createdToIdleMs)),
      ids: interrupted.map((session) => session.id),
    },
  }
}

export function aggregateMessageModels(sessions) {
  const groups = new Map()
  for (const session of sessions) {
    for (const usage of session.messageModels ?? []) {
      const key = JSON.stringify(usage.model)
      if (!groups.has(key)) groups.set(key, { model: usage.model, rows: [], sessionIDs: [], complete: true })
      const group = groups.get(key)
      group.rows.push(usage)
      group.sessionIDs.push(session.id)
      group.complete &&= session.messageCoverage === "complete"
    }
  }
  return [...groups.values()].map(({ model, rows, sessionIDs, complete }) => ({
    model, sessionIDs, messageCoverage: complete ? "complete" : "partial",
    steps: sumKnown(rows.map((row) => row.steps)), tokens: sumTokens(rows), cost: sumKnown(rows.map((row) => row.cost)),
  }))
}

async function readOnlyUsageGet(path) {
  const runRoot = await createIsolatedRunRoot()
  let output
  try {
    const file = join(runRoot, "response.json")
    output = await open(file, "wx", 0o600)
    // A regular-file stdout avoids the observed CLI's truncated large pipe output.
    await new Promise((resolveExit, reject) => {
      const child = spawn("opencode", ["api", "GET", path], {
        cwd: REPO, timeout: 30_000, stdio: ["ignore", output.fd, "ignore"],
      })
      child.once("error", reject)
      child.once("close", (code, signal) => code === 0
        ? resolveExit()
        : reject(new Error(`OpenCode GET failed (exit ${code}, signal ${signal}); raw response not printed`)))
    })
    if ((await output.stat()).size > 16 * 1024 * 1024) throw new Error("OpenCode GET response exceeds 16 MiB after process exit (not a streaming cap)")
    return await readFile(file, "utf8")
  } finally {
    await output?.close()
    await cleanupOwnedRunRoot(runRoot)
  }
}

function isSessionID(id) {
  return typeof id === "string" && id.length <= 128 && id.trim() === id && /^ses_[A-Za-z0-9][A-Za-z0-9_-]{0,123}$/u.test(id)
}

export async function collectObservedUsage({
  get = readOnlyUsageGet, scope = null, sessionIDs = [], includeMessages = false, includeGlobal = false,
  pageSize = 25, maxPages = 10, now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > USAGE_LIMITS.pageSize ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > USAGE_LIMITS.pagesPerSession) {
    throw new TypeError("pageSize must be 1..50 and maxPages 1..10 (bounded positive integers)")
  }
  if (!Array.isArray(sessionIDs) || sessionIDs.length > USAGE_LIMITS.sessions || sessionIDs.some((id) => !isSessionID(id))) {
    throw new TypeError("sessionIDs must contain at most 8 safe session identifiers (ses_ suffix, 128 characters maximum)")
  }
  if (typeof includeMessages !== "boolean" || typeof includeGlobal !== "boolean" || typeof get !== "function" || typeof now !== "function") {
    throw new TypeError("includeMessages/includeGlobal must be booleans and get/now must be functions")
  }
  if (sessionIDs.length === 0 && (includeMessages || !includeGlobal)) {
    throw new TypeError("select exact sessionIDs with explicit scope, or opt in to cross-project global aggregates with includeGlobal")
  }
  if (sessionIDs.length > 0 && (scope?.directory !== REPO || typeof scope?.projectID !== "string" ||
      scope.projectID.length > 128 || !/^[A-Za-z0-9_-]+$/u.test(scope.projectID) || scope.projectID.trim() !== scope.projectID)) {
    throw new TypeError("selected sessions require explicit scope: exact source worktree directory and expected projectID")
  }
  const started = now()
  const commands = []
  const read = async (path) => {
    commands.push(`opencode api GET '${path}'`)
    return parseUsageResponse(await get(path))
  }
  let totalMessagePages = 0
  const readPages = async (base) => {
    const rows = new Map()
    const seenCursors = new Set()
    let cursor = null
    let duplicateIDs = 0
    for (let page = 0; page < maxPages; page += 1) {
      if (totalMessagePages >= USAGE_LIMITS.totalMessagePages) {
        return { data: [...rows.values()], complete: false, pages: page, duplicateIDs, reason: "total-message-page-budget" }
      }
      const path = `${base}?limit=${pageSize}&${cursor === null ? "order=asc" : `cursor=${encodeURIComponent(cursor).replaceAll("'", "%27")}`}`
      totalMessagePages += 1
      const response = await read(path)
      if (!Array.isArray(response.data)) throw new TypeError("paginated response data must be an array")
      if (response.data.length > pageSize) throw new Error("paginated response exceeds requested page size")
      const pagination = response.cursor
      const validCursor = (value) => value === null || (typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= USAGE_LIMITS.cursorBytes)
      // The native envelope requires cursor, but its keys are optional. Only an
      // explicit next:null proves termination; omitted keys cannot prove coverage.
      if (!pagination || typeof pagination !== "object" || Array.isArray(pagination) ||
          !Object.hasOwn(pagination, "next") || !validCursor(pagination.next) ||
          (Object.hasOwn(pagination, "previous") && !validCursor(pagination.previous))) {
        throw new Error("missing or malformed pagination cursor; coverage is not proven")
      }
      for (const row of response.data) {
        if (typeof row?.id !== "string") throw new TypeError("paginated row needs an id")
        if (rows.has(row.id)) duplicateIDs += 1
        rows.set(row.id, row)
      }
      const next = pagination.next
      if (next === null) {
        return { data: [...rows.values()], complete: true, pages: page + 1, duplicateIDs }
      }
      if (seenCursors.has(next)) throw new Error("repeated pagination cursor")
      seenCursors.add(next)
      cursor = next
    }
    return { data: [...rows.values()], complete: false, pages: maxPages, duplicateIDs, reason: "per-session-page-budget" }
  }

  const selected = []
  for (const id of new Set(sessionIDs)) {
    const session = (await read(`/api/session/${id}`)).data
    if (session?.id !== id) throw new Error("session identity mismatch")
    if (session.location?.directory !== scope.directory || session.projectID !== scope.projectID) {
      throw new Error("session worktree/project scope mismatch or missing identity; no selected messages read")
    }
    selected.push(session)
  }
  // Verify every selected source before any transcript read, not only the first.
  let global = null
  if (includeGlobal) {
    global = (await read("/api/experimental/session/stats")).data
    if (!global || !Array.isArray(global.models) || !Array.isArray(global.activity)) throw new TypeError("invalid global statistics")
  }
  const sessions = []
  const messagePagination = {}
  for (const session of selected) {
    const messages = includeMessages ? await readPages(`/api/session/${session.id}/message`) : null
    if (messages) messagePagination[session.id] = { complete: messages.complete, pages: messages.pages, duplicateIDs: messages.duplicateIDs, reason: messages.reason ?? null }
    sessions.push(summarizeSessionUsage(session, messages))
  }

  let scopeProbe = { status: "not-requested" }
  if (includeGlobal && selected.length > 0) {
    const from = observedNumber(global.range?.from, "range from")
    const to = observedNumber(global.range?.to, "range to")
    if (from === null || to === null) throw new TypeError("scope probe requires a fixed stats range")
    const path = `/api/experimental/session/stats?from=${from}&to=${to}`
    const baseline = (await read(path)).data
    const probe = (await read(`${path}&sessionID=${encodeURIComponent(sessionIDs[0])}`)).data
    scopeProbe = {
      status: isDeepStrictEqual(baseline, probe) ? "identical-global-response" : "different-inconclusive-live-snapshot",
      sessionID: selected[0].id, baseline, withSessionID: probe,
    }
  }

  return {
    schemaVersion: 2,
    scope: {
      selected: selected.length > 0 ? { directory: scope.directory, projectID: scope.projectID, identity: "exact session metadata match before messages" } : null,
      global: includeGlobal ? "explicit opt-in, cross-project aggregate counters; not selected-worktree evidence" : "not-requested",
      selection: "exact IDs only; no session enumeration or full-worker-set assertion; metadata verification is not transcript authorization",
      messages: includeMessages ? "explicit caller selection/opt-in, all selected metadata verified first; no atomic location-lock guarantee" : "not-requested",
    },
    limits: { ...USAGE_LIMITS, selectedPageSize: pageSize, selectedPagesPerSession: maxPages, responseBytes: "16 MiB checked after child exit; not a streaming/disk-write bound" },
    captured: { started, finished: now() },
    commands,
    definitions: {
      steps: "projected assistant message count for explicitly selected sessions; partial when message coverage is partial",
      turns: "projected user message count; synthetic prompts counted separately, not provider-request or conversation-turn estimates",
      tokens: "observed classes kept separate; no total inferred because class overlap is not established",
      model: "global models from stats; messageModels from assistant message refs, never cumulative session tokens attributed to currentModel",
      duration: "timestamp differences, not active execution or time-to-recover; idle is a timestamp, not idle milliseconds",
      exposure: "not inferred from titles, current config, tool names or token totals; requires independent run-time exposure evidence",
    },
    global,
    scopeProbe,
    pagination: { sessions: { mode: "exact-ids", enumerated: false, verifiedIDs: selected.map((session) => session.id) }, messages: messagePagination, totalMessagePages },
    sessions,
    aggregate: selected.length > 0 ? aggregateSessionUsage(sessions) : null,
    selectedMessageAggregate: includeMessages ? aggregateSessionUsage(sessions) : null,
    messageModelAggregates: aggregateMessageModels(sessions),
    comparison: { status: "blocked", reason: "counters alone do not establish a controlled Code Mode/direct-tools exposure pair or per-tool token attribution" },
  }
}

export function jsonUtf8Bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8")
}

export function makeToolCallMetric(name, input, result, toolExecuteWallMs, backendMethods) {
  if (typeof name !== "string" || !Number.isFinite(toolExecuteWallMs) || toolExecuteWallMs < 0) {
    throw new TypeError("tool-call metrics need a name and a finite non-negative duration")
  }
  const content = Array.isArray(result?.content) ? result.content : []
  return {
    name,
    inputJsonUtf8Bytes: jsonUtf8Bytes(input),
    resultContentJsonUtf8Bytes: jsonUtf8Bytes(content),
    toolExecuteWallMs: Number(toolExecuteWallMs.toFixed(3)),
    backendMethods: backendMethods.map(({ method, wallMs }) => ({
      method,
      wallMs: Number(wallMs.toFixed(3)),
    })),
  }
}

export function hasCompleteModelEvidence(modelUsage) {
  return modelUsage?.status === "observed" &&
    typeof modelUsage.source === "string" && modelUsage.source.length > 0 &&
    Number.isSafeInteger(modelUsage.turns) && modelUsage.turns >= 0 &&
    Number.isSafeInteger(modelUsage.toolCalls) && modelUsage.toolCalls >= 0 &&
    Number.isSafeInteger(modelUsage.tokens?.input) && modelUsage.tokens.input >= 0 &&
    Number.isSafeInteger(modelUsage.tokens?.output) && modelUsage.tokens.output >= 0 &&
    Number.isSafeInteger(modelUsage.tokens?.total) && modelUsage.tokens.total >= 0
}

export function conditionHasCompleteToolEvidence(condition) {
  if (condition?.status !== "observed" || condition.exposureVerified !== true) return false
  if (condition.harnessToolExecutions !== EXPECTED_CALLS.length) return false
  if (condition.permissionChecks !== EXPECTED_CALLS.length) return false
  if (JSON.stringify(condition.calls?.map((call) => call.name)) !== JSON.stringify(EXPECTED_CALLS)) return false
  const expectedBackendMethods = {
    open: ["start", "execute", "execute"],
    snapshot: ["execute"],
    close: ["cancel"],
  }
  if (condition.calls.some((call) =>
    !Number.isSafeInteger(call.inputJsonUtf8Bytes) || call.inputJsonUtf8Bytes < 0 ||
    !Number.isSafeInteger(call.resultContentJsonUtf8Bytes) || call.resultContentJsonUtf8Bytes < 0 ||
    !Number.isFinite(call.toolExecuteWallMs) || call.toolExecuteWallMs < 0 ||
    !Array.isArray(call.backendMethods) ||
    JSON.stringify(call.backendMethods.map((method) => method.method)) !== JSON.stringify(expectedBackendMethods[call.name]) ||
    call.backendMethods.some((method) => !Number.isFinite(method.wallMs) || method.wallMs < 0)
  )) return false
  if (!Array.isArray(condition.registeredTools) ||
      JSON.stringify(condition.registeredTools.map((tool) => tool.name).sort()) !== JSON.stringify(EXPECTED_TOOLS)) return false
  const expectedCodeMode = condition.directTools !== true
  return condition.registeredTools.every((tool) => tool.namespace === "web" && tool.codemode === expectedCodeMode)
}

export function deriveOverallStatus(entryLevelStatus, modelUsage) {
  return entryLevelStatus === "observed" && hasCompleteModelEvidence(modelUsage) ? "observed" : "blocked"
}

export async function createIsolatedRunRoot() {
  await mkdir(APPROVED_TEMP_ROOT, { recursive: true, mode: 0o700 })
  const parentInfo = await lstat(APPROVED_TEMP_ROOT)
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error("approved scratch root is not a real directory")
  }
  const runRoot = await mkdtemp(join(APPROVED_TEMP_ROOT, "computer-use-browser-efficiency-"))
  const info = await lstat(runRoot)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("isolated run root is not a private real directory")
  }
  return runRoot
}

export async function cleanupOwnedRunRoot(runRoot) {
  const absolute = resolve(runRoot)
  if (dirname(absolute) !== APPROVED_TEMP_ROOT ||
      !basename(absolute).startsWith("computer-use-browser-efficiency-")) {
    throw new Error("refusing cleanup outside this harness's unique scratch directory")
  }
  const info = await lstat(absolute)
  if (!info.isDirectory() || info.isSymbolicLink() ||
      (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    throw new Error("refusing cleanup of a non-owned or non-directory run root")
  }
  await rm(absolute, { recursive: true, force: false })
}

function makeEditor() {
  const byId = new Map()
  const byName = new Map()
  return {
    byId,
    byName,
    namespace() {},
    add(tool) {
      const id = `${tool.options?.namespace ?? "web"}_${tool.name}`
      if (byId.has(id) || byName.has(tool.name)) throw new Error(`duplicate production tool registration: ${id}`)
      byId.set(id, tool)
      byName.set(tool.name, tool)
    },
    list() {
      return [...byId].map(([id, tool]) => ({ id, options: tool.options }))
    },
    update(id, mutate) {
      const tool = byId.get(id)
      if (!tool) throw new Error(`unknown registered tool: ${id}`)
      const entry = { options: tool.options }
      mutate(entry)
      tool.options = entry.options
    },
  }
}

function instrumentManager(manager, currentCall) {
  const measure = async (method, operation) => {
    const started = performance.now()
    try {
      return await operation()
    } finally {
      if (currentCall.value) {
        currentCall.value.backendMethods.push({ method, wallMs: performance.now() - started })
      }
    }
  }
  return {
    start: (...args) => measure("start", () => manager.start(...args)),
    restart: (...args) => measure("restart", () => manager.restart(...args)),
    execute: (...args) => measure("execute", () => manager.execute(...args)),
    fillCredential: (...args) => manager.fillCredential(...args),
    cancel: (...args) => measure("cancel", () => manager.cancel(...args)),
    listSessions: () => manager.listSessions(),
  }
}

function textOf(result) {
  return (result?.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")
}

function parseToolJson(result, name) {
  const text = textOf(result)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${name} returned a non-JSON result (${text.slice(0, 120)})`)
  }
}

async function startFixture() {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/fixture") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      response.end("not found")
      return
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end("<!doctype html><html lang=\"en\"><head><title>Local efficiency fixture</title></head><body><main><h1>Browser efficiency fixture</h1><p>Local-only, synthetic content.</p></main></body></html>")
  })
  await new Promise((resolveListen, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("local fixture did not bind an ephemeral port")
  return { server, url: `http://127.0.0.1:${address.port}/fixture` }
}

async function runCondition({ label, directTools, dataDirectory, fixtureUrl, runId }) {
  const sessionID = `ses_efficiency_${runId}_${label}`
  const currentCall = { value: null }
  const editor = makeEditor()
  const registeredIds = new Set()
  const { registerBrowserTools } = await import(join(REPO, ".opencode/plugins/computer-use/browser-tools.ts"))
  const { withSerializedTools } = await import(join(REPO, ".opencode/plugins/computer-use/serialization.ts"))
  const { applyCodemodeDefault } = await import(join(REPO, ".opencode/plugins/computer-use/codemode.ts"))
  const { createBrowserManager } = await import(join(REPO, "tools/computer-use-browser/src/index.ts"))

  let manager
  let permissionChecks = 0
  const condition = {
    label,
    directTools,
    status: "failed",
    registeredTools: [],
    exposureVerified: false,
    permissionChecks: 0,
    harnessToolExecutions: 0,
    calls: [],
    cleanup: { managerSessionsRemaining: null, ok: false },
    error: null,
  }

  try {
    const serializedEditor = withSerializedTools(editor, "web", { registeredIds })
    registerBrowserTools(serializedEditor, {
      assertPermission: async () => { permissionChecks += 1 },
      dataDirectory,
      createManager: () => {
        const actualManager = createBrowserManager()
        manager = instrumentManager(actualManager, currentCall)
        return manager
      },
    })
    applyCodemodeDefault(editor, { directTools, only: registeredIds })

    condition.registeredTools = [...editor.byName.values()]
      .map((tool) => ({ name: tool.name, namespace: tool.options?.namespace, codemode: tool.options?.codemode === true }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const expectedCodemode = directTools !== true
    condition.exposureVerified =
      JSON.stringify(condition.registeredTools.map((tool) => tool.name)) === JSON.stringify(EXPECTED_TOOLS) &&
      condition.registeredTools.every((tool) => tool.namespace === "web" && tool.codemode === expectedCodemode)
    assert.equal(condition.exposureVerified, true, `${label} production tool exposure flags did not match the requested entry transform`)

    const context = {
      sessionID,
      agent: "efficiency-acceptance",
      messageID: `msg_${sessionID}`,
      id: "pending-call",
    }
    const invoke = async (name, input) => {
      const tool = editor.byName.get(name)
      if (!tool) throw new Error(`production tool ${name} was not registered`)
      const sample = { backendMethods: [] }
      currentCall.value = sample
      const started = performance.now()
      let result
      try {
        result = await tool.execute(input, { ...context, id: `call_${name}` })
      } finally {
        sample.toolExecuteWallMs = performance.now() - started
        currentCall.value = null
      }
      condition.calls.push(makeToolCallMetric(name, input, result, sample.toolExecuteWallMs, sample.backendMethods))
      return result
    }

    const opened = parseToolJson(await invoke("open", { url: fixtureUrl }), "open")
    assert.equal(opened.title, "Local efficiency fixture")
    assert.equal(opened.url, fixtureUrl)
    const snapshot = parseToolJson(await invoke("snapshot", { tabId: opened.tabId }), "snapshot")
    assert.match(snapshot.snapshot, /Browser efficiency fixture/u)
    const closed = parseToolJson(await invoke("close", {}), "close")
    assert.equal(closed.cancelled, true)
    condition.status = "observed"
  } catch (error) {
    condition.error = error instanceof Error ? error.message : String(error)
  } finally {
    condition.permissionChecks = permissionChecks
    condition.harnessToolExecutions = condition.calls.length
    if (manager) {
      try {
        for (const session of manager.listSessions()) await manager.cancel(session.sessionId)
        condition.cleanup.managerSessionsRemaining = manager.listSessions().length
        condition.cleanup.ok = condition.cleanup.managerSessionsRemaining === 0
      } catch (error) {
        condition.cleanup.error = error instanceof Error ? error.message : String(error)
      }
    } else {
      condition.cleanup.managerSessionsRemaining = 0
      condition.cleanup.ok = true
    }
    if (!condition.cleanup.ok && condition.status === "observed") condition.status = "failed"
  }
  return condition
}

function compareConditions(conditions) {
  const defaultCondition = conditions.find((condition) => condition.directTools === false)
  const directCondition = conditions.find((condition) => condition.directTools === true)
  if (!defaultCondition || !directCondition ||
      !conditionHasCompleteToolEvidence(defaultCondition) ||
      !conditionHasCompleteToolEvidence(directCondition)) return null
  return EXPECTED_CALLS.map((name) => {
    const baseline = defaultCondition.calls.find((call) => call.name === name)
    const direct = directCondition.calls.find((call) => call.name === name)
    return {
      name,
      directMinusDefaultToolExecuteWallMs: Number((direct.toolExecuteWallMs - baseline.toolExecuteWallMs).toFixed(3)),
      directMinusDefaultResultContentJsonUtf8Bytes: direct.resultContentJsonUtf8Bytes - baseline.resultContentJsonUtf8Bytes,
    }
  })
}

export async function runEfficiencyAcceptance() {
  const runId = `${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`
  const report = {
    schemaVersion: 1,
    scope: "production browser tool-entry registration and exposure transform; direct execute invocation, not OpenCode model dispatch",
    run: { node: process.version, graphicalSessionAvailable: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY) },
    fixture: { kind: "local-http", externalNetwork: false, authentication: false },
    metrics: {
      toolExecuteWallMs: "wall time around the registered production tool execute function, including queue, permission stub, and backend work",
      backendMethods: "wall time around actual BrowserManager methods; manager start includes worker/browser startup",
      bytes: "UTF-8 JSON bytes for tool arguments and returned content parts only; not OpenCode wire payloads or tokens",
    },
    conditions: [],
    comparison: null,
    modelUsage: {
      status: "blocked",
      turns: null,
      toolCalls: null,
      tokens: { input: null, output: null, total: null },
      source: null,
      reason: "No approved real model session or bounded token-usage counter was used; tool definitions are invoked directly by this harness.",
    },
    entryLevelStatus: "blocked",
    overallStatus: "blocked",
    cleanup: { runRootRemoved: false, status: "not-started" },
    blockers: [],
  }

  let runRoot
  let fixture
  try {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      throw new Error("real browser acceptance requires the existing graphical-session path; headless fallback is not used")
    }
    runRoot = await createIsolatedRunRoot()
    fixture = await startFixture()
    report.fixture.url = fixture.url
    for (const setting of [
      { label: "default", directTools: false },
      { label: "directTools", directTools: true },
    ]) {
      const condition = await runCondition({ ...setting, dataDirectory: runRoot, fixtureUrl: fixture.url, runId })
      report.conditions.push(condition)
      if (condition.status !== "observed") report.blockers.push(`${setting.label}: ${condition.error ?? "entry-level tool evidence incomplete"}`)
      if (!condition.cleanup.ok) report.blockers.push(`${setting.label}: browser-manager cleanup could not be verified`)
    }
  } catch (error) {
    report.blockers.push(error instanceof Error ? error.message : String(error))
  } finally {
    if (fixture) {
      await new Promise((resolveClose) => fixture.server.close(resolveClose))
    }
    if (runRoot) {
      const sessionsRemaining = report.conditions.some((condition) => condition.cleanup.managerSessionsRemaining !== 0)
      if (sessionsRemaining) {
        report.cleanup = { runRootRemoved: false, status: "blocked-live-manager-session" }
        report.blockers.push("isolated profile root retained because a manager session remains")
      } else {
        try {
          await cleanupOwnedRunRoot(runRoot)
          report.cleanup = { runRootRemoved: true, status: "verified" }
        } catch (error) {
          report.cleanup = { runRootRemoved: false, status: "failed" }
          report.blockers.push(`isolated profile cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }

  const conditionsObserved = report.conditions.length === 2 && report.conditions.every(conditionHasCompleteToolEvidence)
  report.entryLevelStatus = conditionsObserved && report.cleanup.runRootRemoved ? "observed" : "blocked"
  report.comparison = compareConditions(report.conditions)
  if (report.entryLevelStatus !== "observed") report.blockers.push("required default/directTools entry-level tool evidence is incomplete")
  report.overallStatus = deriveOverallStatus(report.entryLevelStatus, report.modelUsage)
  if (report.overallStatus === "blocked") report.blockers.push("model turns, model tool calls, and real token counters are unavailable; missing evidence is not treated as a pass")
  return report
}

async function main() {
  if (process.argv[2] === "--observed-usage") {
    const args = process.argv.slice(3)
    const options = { sessionIDs: [], scope: { directory: REPO } }
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index]
      if (arg === "--global") options.includeGlobal = true
      else if (arg === "--messages") options.includeMessages = true
      else if (arg === "--project" && args[index + 1] && !args[index + 1].startsWith("--")) options.scope.projectID = args[++index]
      else if (isSessionID(arg)) options.sessionIDs.push(arg)
      else throw new Error("usage: --observed-usage [--global] [--project PROJECT_ID [--messages] SESSION_ID ...]")
    }
    const report = await collectObservedUsage(options)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = Object.values(report.pagination.messages).every((page) => page.complete) ? 0 : 3
    return
  }
  if (process.argv.length > 2) throw new Error("usage: efficiency-acceptance.mjs [--observed-usage [--global] [--project PROJECT_ID [--messages] SESSION_ID ...]]")
  const report = await runEfficiencyAcceptance()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = report.entryLevelStatus === "observed" && report.overallStatus === "blocked" ? 3 : 1
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
