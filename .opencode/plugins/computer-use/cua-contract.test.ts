/**
 * Contract tests for the cua runtime over the *real* browser tool registrations.
 *
 * Only the browser worker and the permission decision are faked. The browser
 * tool validators, the per-session serialization wrapper, generation bookkeeping
 * and the Code Mode cell runtime all run their production code, so a change that
 * breaks a real input/output contract fails here rather than behind a permissive
 * fake.
 */

import assert from "node:assert/strict"
import test from "node:test"
import { registerBrowserTools } from "./browser-tools.ts"
import { withSerializedTools } from "./serialization.ts"
import { createCuaSessions, registerCuaTools } from "./cua.ts"

type AnyRecord = Record<string, unknown>

type ToolDefinition = {
  name: string
  execute(input: AnyRecord, context: AnyRecord): Promise<unknown>
}

type Editor = {
  tools: Map<string, ToolDefinition>
  namespace(input: { name: string; description: string }): void
  add(tool: ToolDefinition): void
}

function editor(): Editor {
  const tools = new Map<string, ToolDefinition>()
  return {
    tools,
    namespace() {},
    add(tool: ToolDefinition) {
      tools.set(tool.name, tool)
    },
  }
}

type Operation = { method: string; [key: string]: unknown }

function harness(options: {
  deny?: readonly string[]
  clickDelayMs?: number
} = {}) {
  const operations: Operation[] = []
  const permissions: string[] = []
  const calls: Array<{ tool: string; messageID: string }> = []
  let generation = 0
  let running = false

  const manager = {
    listSessions: () => running ? [{ sessionId: "s", status: "running" }] : [],
    start: async () => { running = true },
    restart: async () => { running = true },
    execute: async (_sessionID: string, operation: Operation) => {
      operations.push(operation)
      switch (operation.method) {
        case "tabs.new":
          return { id: "t1", url: "about:blank", title: "New tab" }
        case "navigate":
          return { id: operation.tabId, url: operation.url, title: "Example" }
        case "snapshot":
          generation++
          return { tabId: operation.tabId, generation, snapshot: `- button [ref=e${generation}]` }
        case "click":
          if (options.clickDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.clickDelayMs))
          }
          return undefined
        case "tabs.list":
          return []
        case "tabs.close":
          return undefined
        default:
          return undefined
      }
    },
  }

  const browserEditor = editor()
  // The real wrapper: reads interleave, mutations serialize per session, and a
  // cancelled context short-circuits the queue.
  const wrapped = withSerializedTools(browserEditor, "web")
  registerBrowserTools(wrapped, {
    assertPermission: async (request: { action: string }) => {
      permissions.push(request.action)
      if (options.deny?.includes(request.action)) {
        throw new Error(`permission denied for ${request.action}`)
      }
    },
    createManager: () => manager as never,
    dataDirectory: "/tmp/opencode/cua-contract",
  } as never)

  const sessions = createCuaSessions(async (key, input, context) => {
    const [namespace, name] = key.split(":")
    if (namespace !== "web") throw new Error(`cua runtime: unexpected tool ${key}`)
    const tool = browserEditor.tools.get(name)
    if (!tool) throw new Error(`cua runtime: ${key} is unavailable`)
    calls.push({ tool: name, messageID: context.messageID })
    return tool.execute(input, context as unknown as AnyRecord) as Promise<never>
  })

  const cuaEditor = editor()
  registerCuaTools(cuaEditor, { sessions })
  const js = cuaEditor.tools.get("js")
  if (!js) throw new Error("cua js tool was not registered")

  const base = { sessionID: "s", agent: "a", messageID: "m1", id: "c1" }
  const run = async (code: string, context: AnyRecord = base): Promise<string> => {
    const result = await js.execute({ code }, context as unknown as AnyRecord) as { content: Array<{ type: string; text?: string }> }
    return result.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n")
  }

  return { run, operations, permissions, calls, base }
}

function opsOf(operations: Operation[], method: string): Operation[] {
  return operations.filter((operation) => operation.method === method)
}

test("goto reaches the real navigate validator with a url and no action", async () => {
  const { run, operations } = harness()
  await run('const b = await cua.browser(); const t = await b.open("https://example.com/"); t.tabId')
  const out = await run('await t.goto("https://example.org/")', { sessionID: "s", agent: "a", messageID: "m2", id: "c2" })

  assert.doesNotMatch(out, /Invalid browser request/)
  assert.match(out, /https:\/\/example\.org\//)
  // The open call navigated once too; find the goto specifically and prove the
  // validator received no `action` field alongside the url.
  const navigate = opsOf(operations, "navigate").filter((operation) => operation.url === "https://example.org/")
  assert.equal(navigate.length, 1)
  assert.deepEqual(navigate[0], { method: "navigate", tabId: "t1", url: "https://example.org/" })
})

test("a tab opened in one cell is attributed to the cell that calls it", async () => {
  const { run, calls } = harness()
  await run("const b = await cua.browser()")
  await run('const t = await b.open("https://example.com/")', {
    sessionID: "s", agent: "a", messageID: "m-later", id: "c-later",
  })
  const open = calls.find((call) => call.tool === "open")
  assert.equal(open?.messageID, "m-later")
})

test("act uses the snapshot generation and refreshes it after a real success", async () => {
  const { run, operations } = harness()
  const first = await run(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.snapshot()',
  )
  assert.match(first, /"generation":1/)

  const second = await run('await t.act({ ref: "e1", action: "click" })')
  assert.match(second, /"generation":1/)
  // The success path snapshots again and retains the new generation.
  assert.match(second, /"generation":2/)
  const clicks = opsOf(operations, "click")
  assert.equal(clicks.length, 1)
  assert.equal((clicks[0].target as { generation: number }).generation, 1)
  assert.equal(opsOf(operations, "snapshot").length, 2)

  await run('await t.act({ ref: "e2", action: "click" })')
  const after = opsOf(operations, "click")
  assert.equal((after[1].target as { generation: number }).generation, 2)
})

test("act without a snapshot generation is refused before backend dispatch", async () => {
  const { run, operations } = harness()
  const out = await run(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.act({ ref: "e1", action: "click" })',
  )
  assert.match(out, /needs a snapshot generation/)
  assert.equal(opsOf(operations, "click").length, 0)
  const act = opsOf(operations, "snapshot")
  assert.equal(act.length, 0)
})

test("a stale generation reports the real error and does not snapshot again", async () => {
  const { run, operations } = harness()
  await run(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.snapshot()',
  )
  const out = await run('await t.act({ ref: "e1", action: "click", generation: 99 })')
  assert.match(out, /not from this tab's current snapshot generation/)
  assert.equal(opsOf(operations, "click").length, 0)
  // Only the first cell's snapshot; a failed act must not hide behind new output.
  assert.equal(opsOf(operations, "snapshot").length, 1)
})

test("a permission failure propagates through the wrapped tool into the cell", async () => {
  const { run, operations, permissions } = harness({ deny: ["browser_act"] })
  const out = await run(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.snapshot(); await t.act({ ref: "e1", action: "click" })',
  )
  // The shared queue intentionally folds non-RuntimeError failures into its
  // generic INTERNAL message; what matters is that the denial reaches the cell
  // and no backend action runs.
  assert.match(out, /operation failed|permission denied/i)
  assert.ok(permissions.includes("browser_act"))
  assert.equal(opsOf(operations, "click").length, 0)
  assert.equal(opsOf(operations, "snapshot").length, 1)
})

test("host cancellation aborts the cell and blocks its late snapshot", async () => {
  const { run, operations } = harness({ clickDelayMs: 800 })
  const controller = new AbortController()
  const context = {
    sessionID: "s", agent: "a", messageID: "m1", id: "c1", signal: controller.signal,
  }
  await run(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.snapshot()',
    context,
  )
  const started = Date.now()
  const pending = run('await t.act({ ref: "e1", action: "click" })', context)
  setTimeout(() => controller.abort(), 20)
  const out = await pending
  assert.match(out, /cancel/i)
  assert.ok(Date.now() - started < 500, `cancellation took ${Date.now() - started} ms`)

  // Let the mocked click finish; the cancelled cell must not snapshot afterwards.
  await new Promise((resolve) => setTimeout(resolve, 900))
  assert.equal(opsOf(operations, "snapshot").length, 1)
})
