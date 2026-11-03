import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"

import {
  aggregateMessageModels,
  aggregateSessionUsage,
  cleanupOwnedRunRoot,
  collectObservedUsage,
  conditionHasCompleteToolEvidence,
  createIsolatedRunRoot,
  deriveOverallStatus,
  hasCompleteModelEvidence,
  makeToolCallMetric,
  parseUsageResponse,
  summarizeSessionUsage,
} from "./efficiency-acceptance.mjs"

const EXPECTED_TOOLS = ["act", "close", "navigate", "open", "screenshot", "signin", "snapshot", "tabs"]

function condition(directTools = false) {
  return {
    status: "observed",
    directTools,
    exposureVerified: true,
    registeredTools: EXPECTED_TOOLS.map((name) => ({
      name,
      namespace: "web",
      codemode: !directTools,
    })),
    harnessToolExecutions: 3,
    permissionChecks: 3,
    calls: ["open", "snapshot", "close"].map((name) => ({
      name,
      inputJsonUtf8Bytes: 2,
      resultContentJsonUtf8Bytes: 17,
      toolExecuteWallMs: 0.5,
      backendMethods: name === "open"
        ? ["start", "execute", "execute"].map((method) => ({ method, wallMs: 0.25 }))
        : [{ method: name === "close" ? "cancel" : "execute", wallMs: 0.25 }],
    })),
  }
}

test("byte accounting measures actual UTF-8 JSON bytes, not character count", () => {
  const input = { text: "café 🧪" }
  const result = { content: [{ type: "text", text: "résultat" }] }
  const metric = makeToolCallMetric("snapshot", input, result, 1.25, [{ method: "execute", wallMs: 0.5 }])

  assert.equal(metric.inputJsonUtf8Bytes, Buffer.byteLength(JSON.stringify(input), "utf8"))
  assert.equal(metric.resultContentJsonUtf8Bytes, Buffer.byteLength(JSON.stringify(result.content), "utf8"))
  assert.equal(metric.toolExecuteWallMs, 1.25)
  assert.equal(metric.backendMethods[0].wallMs, 0.5)
  assert.throws(() => makeToolCallMetric("snapshot", input, result, Number.NaN, []), /finite non-negative/u)
})

test("missing model turns and token counters keep the overall evidence blocked", () => {
  const missing = {
    status: "blocked",
    turns: null,
    toolCalls: null,
    tokens: { input: null, output: null, total: null },
    source: null,
  }

  assert.equal(hasCompleteModelEvidence(missing), false)
  assert.equal(deriveOverallStatus("observed", missing), "blocked")
  assert.equal(deriveOverallStatus("blocked", missing), "blocked")
  assert.equal(hasCompleteModelEvidence({
    status: "observed",
    turns: 1,
    toolCalls: 3,
    tokens: { input: null, output: 10, total: 10 },
    source: "claimed",
  }), false)
})

test("an exposure comparison is incomplete when any required production call is missing", () => {
  const complete = condition()
  assert.equal(conditionHasCompleteToolEvidence(complete), true)

  const missingClose = condition()
  missingClose.calls.pop()
  assert.equal(conditionHasCompleteToolEvidence(missingClose), false)

  const wrongExposure = condition(true)
  wrongExposure.registeredTools[0].codemode = true
  assert.equal(conditionHasCompleteToolEvidence(wrongExposure), false)
})

test("cleanup removes only the task-owned run root and preserves a neighboring directory", async (t) => {
  const runRoot = await createIsolatedRunRoot()
  const sibling = await mkdtemp(join("/tmp/opencode", "efficiency-acceptance-sibling-"))
  const sentinel = join(sibling, "preserve.txt")
  await writeFile(sentinel, "not owned by cleanup")
  t.after(async () => {
    await rm(runRoot, { recursive: true, force: true })
    await rm(sibling, { recursive: true, force: true })
  })

  await cleanupOwnedRunRoot(runRoot)
  await assert.rejects(access(runRoot))
  await access(sentinel)
  await assert.rejects(cleanupOwnedRunRoot("/tmp/opencode"), /refusing cleanup/u)
  await access(sentinel)
})

const FIXTURE_SCOPE = { directory: "/home/james/repos/computer-use", projectID: "project_fixture" }

function usageSession(overrides = {}) {
  return {
    id: "ses_fixture",
    projectID: FIXTURE_SCOPE.projectID,
    location: { directory: FIXTURE_SCOPE.directory },
    agent: "general",
    model: { providerID: "openai", id: "fixture-model", variant: "high" },
    tokens: { input: 100, output: 20, reasoning: 7, cache: { read: 300, write: 5 } },
    cost: 0.125,
    time: { created: 1000, updated: 4500, idle: 4600 },
    outcome: "succeeded",
    ...overrides,
  }
}

function usageMessages() {
  return [
    { id: "msg_user", type: "user", text: "never copied into the report" },
    { id: "msg_synthetic", type: "synthetic" },
    {
      id: "msg_first", type: "assistant",
      model: { providerID: "openai", id: "earlier-model", variant: "low" },
      cost: 0.1,
      tokens: { input: 70, output: 12, reasoning: 4, cache: { read: 250, write: 5 } },
      content: [
        { type: "tool", name: "read", state: { status: "completed", input: { private: "omit me" } } },
        { type: "tool", name: "read", state: { status: "error" } },
        { type: "tool", name: "pending", state: { status: "running" } },
      ],
    },
    {
      id: "msg_last", type: "assistant", model: { providerID: "openai", id: "fixture-model", variant: "high" },
      cost: 0.025,
      tokens: { input: 30, output: 8, reasoning: 3, cache: { read: 50, write: 0 } },
      content: [{ type: "tool", name: "pending", state: { status: "streaming" } }],
    },
  ]
}

function globalUsage() {
  return {
    range: { from: 1000, to: 5000 }, sessions: 7, subagents: 3, prompts: 11, steps: 22,
    tokens: { input: 1000, output: 200, reasoning: 70, cache: { read: 3000, write: 50 } },
    cost: 1.25, tools: { mode: "summary", totals: { calls: 14, succeeded: 10, failed: 3, unfinished: 1 } },
    models: [{ model: { providerID: "openai", id: "mixed-global", variant: "high" }, steps: 22 }],
    activity: [{ date: "2026-10-28", steps: 22 }], activeDays: 1, streak: 1,
  }
}

test("usage responses parse actual data envelopes and reject malformed envelopes/JSON", () => {
  assert.deepEqual(parseUsageResponse('{"data":[]}'), { data: [] })
  assert.deepEqual(parseUsageResponse({ data: {} }), { data: {} })
  assert.throws(() => parseUsageResponse("not JSON"), SyntaxError)
  assert.throws(() => parseUsageResponse({ items: [] }), /contain data/u)
  assert.throws(() => parseUsageResponse(null), /contain data/u)
})

test("session counters preserve token classes and idle timestamps without inventing steps", () => {
  const summary = summarizeSessionUsage(usageSession())
  assert.deepEqual(summary.tokens, { input: 100, output: 20, reasoning: 7, cacheRead: 300, cacheWrite: 5 })
  assert.equal(summary.cost, 0.125)
  assert.equal(summary.createdToUpdatedMs, 3500)
  assert.equal(summary.createdToIdleMs, 3600)
  assert.equal(summary.steps, null)
  assert.equal(summary.turns, null)
  assert.equal(summary.messageCoverage, "not-requested")
  assert.equal(summary.messageModels, null)
  assert.equal(Object.hasOwn(summary.tokens, "total"), false)
  assert.equal(summary.outcome, "succeeded")
})

test("message derivation separates prompts, steps, model switches and tool failures", () => {
  const summary = summarizeSessionUsage(usageSession(), { data: usageMessages(), complete: true })
  assert.equal(summary.steps, 2)
  assert.equal(summary.turns, 1)
  assert.equal(summary.syntheticPrompts, 1)
  assert.equal(summary.messageCoverage, "complete")
  assert.deepEqual(summary.tools, { calls: 4, succeeded: 1, failed: 1, unfinished: 2, byName: { read: 2, pending: 2 } })
  assert.equal(summary.messageModels.length, 2)
  assert.equal(summary.messageModels[0].model.id, "earlier-model")
  assert.equal(summary.messageModels[0].tokens.input, 70)
  assert.equal(summary.messageModels[1].tokens.input, 30)
  assert.equal(summary.currentModel.id, "fixture-model")
  assert.equal(JSON.stringify(summary).includes("omit me"), false)
  assert.equal(JSON.stringify(summary).includes("never copied"), false)
})

test("missing counters remain unknown, reverse timestamps do not become active time, and bad counters fail", () => {
  const summary = summarizeSessionUsage(usageSession({
    tokens: { input: 0 }, cost: undefined, time: { created: 1000, updated: 900 }, outcome: undefined,
  }))
  assert.equal(summary.tokens.input, 0)
  assert.equal(summary.tokens.output, null)
  assert.equal(summary.tokens.cacheRead, null)
  assert.equal(summary.createdToUpdatedMs, null)
  assert.equal(summary.createdToIdleMs, null)
  assert.equal(summary.outcome, null)
  assert.equal(summary.cost, null)
  assert.throws(() => summarizeSessionUsage(usageSession({ tokens: { input: -1 } })), /input tokens/u)
  assert.throws(() => summarizeSessionUsage(usageSession({ tokens: { input: 1.5 } })), /integer/u)
  assert.throws(() => summarizeSessionUsage(usageSession({ cost: NaN })), /session cost/u)
  assert.throws(() => summarizeSessionUsage({}), /needs an id/u)
  const badMessages = usageMessages()
  badMessages[2].content[0].state.status = "invented"
  assert.throws(() => summarizeSessionUsage(usageSession(), { data: badMessages, complete: true }), /unknown projected tool status/u)
})

test("aggregation counts child sessions once and reports interrupted lifetimes, not recovery time", () => {
  const first = summarizeSessionUsage(usageSession(), { data: usageMessages(), complete: true })
  const child = summarizeSessionUsage(usageSession({ id: "ses_child", parentID: first.id, outcome: "interrupted" }))
  const aggregate = aggregateSessionUsage([first, child])
  assert.equal(aggregate.sessions, 2)
  assert.equal(aggregate.subagents, 1)
  assert.equal(aggregate.tokens.input, 200)
  assert.equal(aggregate.tokens.cacheRead, 600)
  assert.equal(aggregate.cost, 0.25)
  assert.equal(aggregate.completeMessageSessions, 1)
  assert.equal(aggregate.steps, null)
  assert.equal(aggregate.turns, null)
  assert.deepEqual(aggregate.interrupted, {
    sessions: 1, summedCreatedToUpdatedMs: 3500, summedCreatedToIdleMs: 3600, ids: ["ses_child"],
  })
  assert.equal(aggregateSessionUsage([first]).steps, 2)
  assert.deepEqual(aggregateSessionUsage([first]).tools, { calls: 4, succeeded: 1, failed: 1, unfinished: 2 })
  assert.equal(aggregate.tools, null)
  const unknown = summarizeSessionUsage(usageSession({ id: "ses_unknown", tokens: {} }))
  assert.equal(aggregateSessionUsage([first, unknown]).tokens.input, null)
})

test("missing message usage is not zero and partial message counts cannot become complete totals", () => {
  const messages = usageMessages()
  delete messages[2].tokens
  const summary = summarizeSessionUsage(usageSession(), { data: messages, complete: false })
  assert.equal(summary.messageCoverage, "partial")
  assert.equal(summary.steps, 2)
  assert.equal(summary.messageModels[0].tokens.input, null)
  assert.equal(aggregateSessionUsage([summary]).steps, null)
})

test("collector uses injected GET-only pages, probes fixed global scope and never promotes a comparison", async () => {
  const seen = []
  const global = globalUsage()
  const responses = new Map([
    ["/api/experimental/session/stats", { data: global }],
    ["/api/session/ses_fixture", { data: usageSession() }],
    ["/api/session/ses_fixture/message?limit=2&order=asc", { data: usageMessages().slice(0, 2), cursor: { next: "messages" } }],
    ["/api/session/ses_fixture/message?limit=2&cursor=messages", { data: usageMessages().slice(2), cursor: { next: null } }],
    ["/api/experimental/session/stats?from=1000&to=5000", { data: global }],
    ["/api/experimental/session/stats?from=1000&to=5000&sessionID=ses_fixture", { data: global }],
  ])
  const report = await collectObservedUsage({
    get: async (path) => {
      seen.push(path)
      assert.ok(responses.has(path), `unexpected request: ${path}`)
      return JSON.stringify(responses.get(path))
    },
    scope: FIXTURE_SCOPE, includeMessages: true, includeGlobal: true,
    sessionIDs: ["ses_fixture"], pageSize: 2, now: () => "2026-10-28T12:00:00.000Z",
  })
  assert.equal(seen.length, 6)
  assert.equal(report.commands.length, 6)
  assert.equal(seen[0], "/api/session/ses_fixture")
  assert.ok(seen.every((path) => !path.startsWith("/api/session?")))
  assert.equal(report.scopeProbe.status, "identical-global-response")
  assert.equal(report.global.sessions, 7)
  assert.equal(report.aggregate.sessions, 1)
  assert.equal(report.aggregate.steps, 2)
  assert.equal(report.global.models[0].model.id, "mixed-global")
  assert.equal(report.sessions[0].messageModels[0].model.id, "earlier-model")
  assert.equal(report.comparison.status, "blocked")
  assert.deepEqual(report.pagination.sessions, { mode: "exact-ids", enumerated: false, verifiedIDs: ["ses_fixture"] })
  assert.deepEqual(report.captured, { started: "2026-10-28T12:00:00.000Z", finished: "2026-10-28T12:00:00.000Z" })
  assert.equal(JSON.stringify(report).includes("omit me"), false)
})

test("collector fetches only exact IDs, deduplicates selections and marks page-budget exhaustion", async () => {
  const report = await collectObservedUsage({
    scope: FIXTURE_SCOPE, includeMessages: true,
    pageSize: 1, maxPages: 1, sessionIDs: ["ses_selected", "ses_selected"],
    get: async (path) => {
      if (path === "/api/session/ses_selected") return { data: usageSession({ id: "ses_selected" }) }
      if (path === "/api/session/ses_selected/message?limit=1&order=asc") return { data: usageMessages().slice(0, 1), cursor: { next: "more" } }
      assert.fail(`unexpected request: ${path}`)
    },
  })
  assert.equal(report.sessions.length, 1)
  assert.equal(report.sessions[0].messageCoverage, "partial")
  assert.equal(report.aggregate.steps, null)
  assert.equal(report.pagination.messages.ses_selected.reason, "per-session-page-budget")
  assert.equal(report.commands.filter((command) => command.endsWith("/api/session/ses_selected'")).length, 1)
})

test("message-model aggregation uses historical refs and preserves missing usage across sessions", () => {
  const first = summarizeSessionUsage(usageSession(), { data: usageMessages(), complete: true })
  const second = summarizeSessionUsage(usageSession({ id: "ses_second" }), { data: usageMessages(), complete: true })
  const models = aggregateMessageModels([first, second])
  assert.equal(models.length, 2)
  assert.equal(models[0].model.id, "earlier-model")
  assert.equal(models[0].steps, 2)
  assert.equal(models[0].tokens.input, 140)
  assert.equal(models[0].cost, 0.2)
  assert.deepEqual(models[0].sessionIDs, ["ses_fixture", "ses_second"])
  second.messageCoverage = "partial"
  second.messageModels[0].tokens.input = null
  assert.equal(aggregateMessageModels([first, second])[0].tokens.input, null)
  assert.equal(aggregateMessageModels([first, second])[0].messageCoverage, "partial")
})

test("pagination deduplicates repeated IDs without stopping at a short page", async () => {
  const report = await collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"], includeMessages: true,
    get: async (path) => {
      if (path === "/api/session/ses_fixture") return { data: usageSession() }
      if (path.includes("order=asc")) return { data: usageMessages().slice(0, 1), cursor: { next: "next /+" } }
      assert.ok(path.endsWith("cursor=next%20%2F%2B"))
      return { data: usageMessages(), cursor: { next: null } }
    },
  })
  assert.equal(report.pagination.messages.ses_fixture.duplicateIDs, 1)
  assert.equal(report.pagination.messages.ses_fixture.pages, 2)
  assert.equal(report.aggregate.sessions, 1)
  assert.equal(report.aggregate.steps, 2)
})

test("collector treats changed live scope probes as inconclusive, not session filtering", async () => {
  const report = await collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"], includeMessages: true, includeGlobal: true,
    get: async (path) => {
      if (path.startsWith("/api/experimental/session/stats")) return {
        data: { ...globalUsage(), steps: path.includes("sessionID=") ? 23 : 22 },
      }
      if (path === "/api/session/ses_fixture") return { data: usageSession() }
      return { data: [], cursor: { next: null } }
    },
  })
  assert.equal(report.scopeProbe.status, "different-inconclusive-live-snapshot")
  assert.equal(report.global.steps, 22)
  assert.equal(report.sessions[0].steps, 0)
  assert.equal(report.comparison.status, "blocked")
})

test("collector rejects invalid options, repeated cursors, identity mismatch and failed reads", async () => {
  await assert.rejects(collectObservedUsage({ pageSize: 0 }), /positive integers/u)
  await assert.rejects(collectObservedUsage({ sessionIDs: ["not-a-session"] }), /identifiers/u)
  const get = async (path) => path.startsWith("/api/experimental/session/stats")
    ? { data: globalUsage() }
    : path === "/api/session/ses_fixture" ? { data: usageSession() }
      : { data: usageMessages(), cursor: { next: "repeated" } }
  await assert.rejects(collectObservedUsage({ get, scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"], includeMessages: true }), /repeated pagination cursor/u)
  await assert.rejects(collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_missing"],
    get: async () => ({ data: usageSession() }),
  }), /identity mismatch/u)
  await assert.rejects(collectObservedUsage({ includeGlobal: true, get: async () => { throw new Error("unavailable") } }), /unavailable/u)
})

test("default collection refuses implicit scans; global opt-in returns aggregates only", async () => {
  const paths = []
  const get = async (path) => {
    paths.push(path)
    assert.equal(path, "/api/experimental/session/stats")
    return { data: globalUsage() }
  }
  await assert.rejects(collectObservedUsage({ get }), /select exact sessionIDs/u)
  await assert.rejects(collectObservedUsage({ get, includeMessages: true, includeGlobal: true }), /select exact sessionIDs/u)
  assert.deepEqual(paths, [])
  const report = await collectObservedUsage({ get, includeGlobal: true })
  assert.deepEqual(paths, ["/api/experimental/session/stats"])
  assert.deepEqual(report.sessions, [])
  assert.equal(report.aggregate, null)
  assert.equal(report.scope.selected, null)
  assert.match(report.scope.global, /cross-project/u)
  assert.equal(report.scopeProbe.status, "not-requested")
})

test("exact selected metadata alone neither authorizes messages nor enumerates peers", async () => {
  const paths = []
  const report = await collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"],
    get: async (path) => {
      paths.push(path)
      assert.equal(path, "/api/session/ses_fixture")
      return { data: usageSession() }
    },
  })
  assert.deepEqual(paths, ["/api/session/ses_fixture"])
  assert.equal(report.sessions[0].messageCoverage, "not-requested")
  assert.equal(report.aggregate.steps, null)
  assert.equal(report.selectedMessageAggregate, null)
  assert.equal(report.global, null)
  assert.deepEqual(report.scope.selected.directory, FIXTURE_SCOPE.directory)
  assert.equal(report.pagination.sessions.enumerated, false)
})

test("missing or mismatched worktree/project identity refuses every transcript read", async (t) => {
  const variants = [
    { location: undefined }, { location: {} }, { projectID: undefined }, { projectID: "different-project" },
    { location: { directory: "/home/james/repos/computer-use-other-worktree" } },
    { location: { directory: "/home/james/repos" } },
    { location: { directory: "/home/james/repos/computer-use/nested" } },
  ]
  for (const [index, overrides] of variants.entries()) {
    await t.test(`scope identity rejection ${index + 1}`, async () => {
      const paths = []
      await assert.rejects(collectObservedUsage({
        scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"], includeMessages: true, includeGlobal: true,
        get: async (path) => {
          paths.push(path)
          assert.equal(path, "/api/session/ses_fixture")
          return { data: usageSession(overrides) }
        },
      }), /scope mismatch or missing identity/u)
      assert.deepEqual(paths, ["/api/session/ses_fixture"])
    })
  }
})

test("all selected identities are verified before even the first selected transcript", async () => {
  const paths = []
  await assert.rejects(collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture", "ses_foreign"], includeMessages: true,
    get: async (path) => {
      paths.push(path)
      if (path === "/api/session/ses_fixture") return { data: usageSession() }
      assert.equal(path, "/api/session/ses_foreign")
      return { data: usageSession({ id: "ses_foreign", location: { directory: "/another-worktree" } }) }
    },
  }), /scope mismatch/u)
  assert.deepEqual(paths, ["/api/session/ses_fixture", "/api/session/ses_foreign"])
})

test("safe option/session limits reject oversized and injected inputs before any GET", async () => {
  const noReads = async () => assert.fail("invalid options must not read an endpoint")
  const invalid = [
    { pageSize: 51 }, { pageSize: Infinity }, { maxPages: 11 }, { maxPages: Number.MAX_SAFE_INTEGER },
    { sessionIDs: Array(9).fill("ses_fixture") },
    ...["ses_", "ses_x/y", "ses_x?query=1", "ses_x%2Fmessage", "ses_x'", "ses_x\n", "ses_é", `ses_${"x".repeat(125)}`].map((id) => ({ sessionIDs: [id] })),
    { includeGlobal: "true" }, { includeMessages: "true" },
    { sessionIDs: ["ses_fixture"], scope: null },
    { sessionIDs: ["ses_fixture"], scope: { directory: FIXTURE_SCOPE.directory } },
    { sessionIDs: ["ses_fixture"], scope: { ...FIXTURE_SCOPE, directory: "/home/james/repos/computer-use-other" } },
    { sessionIDs: ["ses_fixture"], scope: { ...FIXTURE_SCOPE, projectID: "x".repeat(129) } },
    { sessionIDs: ["ses_fixture"], scope: { ...FIXTURE_SCOPE, projectID: "bad\n" } },
  ]
  for (const options of invalid) {
    await assert.rejects(collectObservedUsage({ includeGlobal: true, get: noReads, ...options }), TypeError)
  }
})

test("nonempty and empty pages both reject missing or malformed cursor metadata", async (t) => {
  const cursors = [undefined, null, [], {}, { previous: null }, { next: undefined }, { next: 0 }, { next: "" },
    { next: "x".repeat(4097) }, { next: null, previous: {} }]
  for (const empty of [false, true]) {
    for (const [index, cursor] of cursors.entries()) {
      await t.test(`${empty ? "empty" : "nonempty"} malformed cursor ${index + 1}`, async () => {
        await assert.rejects(collectObservedUsage({
          scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"], includeMessages: true,
          get: async (path) => path === "/api/session/ses_fixture" ? { data: usageSession() }
            : { data: empty ? [] : usageMessages(), ...(cursor === undefined ? {} : { cursor }) },
        }), /pagination cursor; coverage is not proven/u)
      })
    }
  }
})

test("only explicit next:null completes; an empty page with valid next still follows it", async () => {
  const paths = []
  const report = await collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"], includeMessages: true,
    get: async (path) => {
      paths.push(path)
      if (path === "/api/session/ses_fixture") return { data: usageSession() }
      if (path.includes("order=asc")) return { data: [], cursor: { next: "next'&/" } }
      assert.ok(path.endsWith("cursor=next%27%26%2F"))
      return { data: [], cursor: { next: null } }
    },
  })
  assert.equal(paths.length, 3)
  assert.equal(report.pagination.messages.ses_fixture.complete, true)
  assert.equal(report.aggregate.steps, 0)
})

test("total selected-message page cap prevents multiplicative unbounded nested reads", async () => {
  let messageReads = 0
  const report = await collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_first", "ses_second", "ses_third"], includeMessages: true,
    pageSize: 1, maxPages: 10,
    get: async (path) => {
      if (!path.includes("/message?")) return { data: usageSession({ id: path.split("/").at(-1) }) }
      messageReads += 1
      return { data: [{ id: `msg_${messageReads}`, type: "user" }], cursor: { next: `cursor_${messageReads}` } }
    },
  })
  assert.equal(messageReads, 20)
  assert.equal(report.pagination.totalMessagePages, 20)
  assert.equal(report.pagination.messages.ses_third.pages, 0)
  assert.equal(report.pagination.messages.ses_third.reason, "total-message-page-budget")
  assert.equal(report.sessions[2].messageCoverage, "partial")
  assert.equal(report.aggregate.turns, null)
})

test("oversized message pages cannot bypass the per-page row budget", async () => {
  await assert.rejects(collectObservedUsage({
    scope: FIXTURE_SCOPE, sessionIDs: ["ses_fixture"], includeMessages: true, pageSize: 1,
    get: async (path) => path === "/api/session/ses_fixture" ? { data: usageSession() }
      : { data: usageMessages(), cursor: { next: null } },
  }), /exceeds requested page size/u)
})

test("CLI collector uses regular-file GET output and cleans raw scratch without any live API", async (t) => {
  const bin = await mkdtemp(join("/tmp/opencode", "efficiency-cli-fixture-"))
  t.after(() => rm(bin, { recursive: true, force: true }))
  const api = join(bin, "opencode")
  const responses = {
    "/api/experimental/session/stats": { data: globalUsage() },
    "/api/session/ses_fixture": { data: usageSession() },
    "/api/session/ses_fixture/message?limit=25&order=asc": { data: usageMessages(), cursor: { next: null } },
  }
  await writeFile(api, `#!/usr/bin/env node
const fs = require("node:fs")
if (process.argv[2] !== "api" || process.argv[3] !== "GET") process.exit(9)
const response = ${JSON.stringify(responses)}[process.argv[4]]
if (!response) process.exit(8)
if (!fs.fstatSync(1).isFile()) { fs.writeSync(1, '{"data":'); process.exit(0) }
fs.writeFileSync(${JSON.stringify(join(bin, "raw-path.txt"))}, fs.readlinkSync("/proc/self/fd/1"))
fs.writeSync(1, JSON.stringify(response))
`, { mode: 0o700 })
  const run = promisify(execFile)
  const { stdout } = await run(process.execPath, [
    new URL("./efficiency-acceptance.mjs", import.meta.url).pathname, "--observed-usage", "--global",
  ], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
  const report = JSON.parse(stdout)
  assert.equal(report.aggregate, null)
  assert.deepEqual(report.sessions, [])
  assert.match(report.scope.global, /cross-project/u)
  assert.equal(report.global.steps, 22)
  assert.equal(report.comparison.status, "blocked")
  const { readFile } = await import("node:fs/promises")
  const rawPath = await readFile(join(bin, "raw-path.txt"), "utf8")
  assert.ok(rawPath.startsWith("/tmp/opencode/computer-use-browser-efficiency-"))
  await assert.rejects(access(rawPath), { code: "ENOENT" })
  const selected = JSON.parse((await run(process.execPath, [
    new URL("./efficiency-acceptance.mjs", import.meta.url).pathname, "--observed-usage",
    "--project", FIXTURE_SCOPE.projectID, "--messages", "ses_fixture",
  ], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })).stdout)
  assert.equal(selected.aggregate.sessions, 1)
  assert.equal(selected.aggregate.steps, 2)
  assert.equal(selected.global, null)
  const invalid = await run(process.execPath, [
    new URL("./efficiency-acceptance.mjs", import.meta.url).pathname, "--unknown",
  ]).then(() => null, (error) => error)
  assert.equal(invalid.code, 1)
  assert.match(invalid.stderr, /usage:/u)
})
