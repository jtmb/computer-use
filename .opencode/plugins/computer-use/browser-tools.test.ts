import assert from "node:assert/strict"
import { test } from "node:test"

import {
  BrowserBackendError,
  type BrowserManager,
  type BrowserOperation,
  type BrowserOperationResult,
  type BrowserSessionSummary,
  type TabSummary,
} from "../../../tools/computer-use-browser/src/index.ts"
import { createAuthGuard } from "../../../tools/computer-use-runtime/src/index.ts"
import {
  registerBrowserTools,
  type BrowserPermissionRequest,
  type BrowserToolContext,
} from "./browser-tools.ts"

type RegisteredTool = {
  name: string
  input: { properties: Record<string, unknown>; additionalProperties?: boolean }
  options: { namespace: string; codemode: boolean }
  execute(input: Record<string, unknown>, context: BrowserToolContext): Promise<{
    content: Array<{ type: string; text?: string; uri?: string; mime?: string; name?: string }>
  }>
}

type Event = { type: "permission" | "manager" | "factory"; action?: string; method?: string; sessionID?: string }

/** Fixture for the private sign-in tool: fake dialog, real guard, fake manager. */
function signInFixture(dialogResult: unknown, fillError?: unknown, omitRecovery = false) {
  const events: string[] = []
  const tools = new Map<string, RegisteredTool>()
  const fills: Array<{ sessionId: string; value: Buffer; target: unknown }> = []
  const authGuard = createAuthGuard()
  const signInGuard = omitRecovery ? { ...authGuard, operatorActions: undefined } : authGuard
  const manager = {
    async start() {
      return { sessionId: context.sessionID, status: "running" as const }
    },
    listSessions: () => [{ sessionId: context.sessionID, status: "running" as const }],
    async execute(_sessionID: string, operation: { method: string }) {
      if (operation.method === "snapshot") {
        return { tabId: "tab-1", generation: 1, snapshot: '- textbox "Password" [ref=e5]' }
      }
      return { id: "tab-1", ownership: "ephemeral", url: "https://example.test/", title: "Example" }
    },
    async restart() {
      return { sessionId: context.sessionID, status: "running" as const }
    },
    async fillCredential(_signInPath: unknown, request: { sessionId: string; value: Buffer; target: unknown }) {
      events.push("fill")
      fills.push({ sessionId: request.sessionId, value: request.value, target: request.target })
      if (fillError) throw fillError
      return { status: "filled" as const }
    },
    async cancel() {
      return true
    },
    listSessionsRaw: () => [],
    async close() {},
  }
  registerBrowserTools(
    {
      namespace() {},
      add(tool: RegisteredTool) {
        tools.set((tool as RegisteredTool).name, tool as RegisteredTool)
      },
    } as never,
    {
      assertPermission: async () => {},
      manager: manager as never,
      dataDirectory: "/tmp/computer-use-test",
      authGuard: signInGuard,
      signInDialog: async () => {
        events.push("dialog")
        return dialogResult as never
      },
    },
  )
  return { tools, events, fills, authGuard }
}

const context: BrowserToolContext = {
  sessionID: "ses-caller",
  agent: "build",
  messageID: "message-1",
  id: "browser_tool",
}

test("incomplete sign-in guard is refused before a private-entry dialog opens", async () => {
  const f = signInFixture({ status: "cancelled" }, undefined, true)
  await f.tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const result = await f.tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  assert.match(result.content[0].text ?? "", /Private sign-in is unavailable/)
  assert.deepEqual(f.events, [])
  assert.deepEqual(f.fills, [])
  assert.equal(f.authGuard.guard.getState(), "idle")
})

function fixture(options: {
  running?: boolean
  otherSession?: boolean
  screenshot?: Uint8Array
  guardState?: "idle" | "awaiting-user" | "filling" | "submitted-uncertain" | "blocked"
  execute?: (sessionID: string, operation: BrowserOperation, signal?: AbortSignal) => Promise<unknown>
} = {}) {
  const events: Event[] = []
  const permissionRequests: BrowserPermissionRequest[] = []
  const calls: Array<{ sessionID: string; operation: BrowserOperation; signal?: AbortSignal }> = []
  const cancellations: string[] = []
  const starts: Array<{ sessionId: string; projectKey: string; opencodeDataDir: string; signal?: AbortSignal }> = []
  const cancelSignals: Array<AbortSignal | undefined> = []
  const sessions = new Map<string, BrowserSessionSummary>()
  let tabCount = 0
  if (options.running !== false) sessions.set(context.sessionID, { sessionId: context.sessionID, status: "running" })
  if (options.otherSession) sessions.set("ses-other", { sessionId: "ses-other", status: "running" })

  const tab = (id = "tab-1"): TabSummary => ({ id: id as TabSummary["id"], ownership: "ephemeral", url: "https://example.test/", title: "Example" })
  const manager: BrowserManager = {
    async start(input, signal) {
      events.push({ type: "manager", method: "start", sessionID: input.sessionId })
      starts.push({ ...input, signal })
      const session = { sessionId: input.sessionId, status: "running" as const }
      sessions.set(input.sessionId, session)
      return session
    },
    async restart(sessionID) {
      events.push({ type: "manager", method: "restart", sessionID })
      const session = { sessionId: sessionID, status: "running" as const }
      sessions.set(sessionID, session)
      return session
    },
    async execute<Operation extends BrowserOperation>(sessionID: string, operation: Operation, signal?: AbortSignal): Promise<BrowserOperationResult<Operation>> {
      events.push({ type: "manager", method: operation.method, sessionID })
      calls.push({ sessionID, operation, signal })
      const result = options.execute
        ? await options.execute(sessionID, operation, signal)
        : await defaultExecute(operation, tab, () => ++tabCount, options.screenshot)
      return result as BrowserOperationResult<Operation>
    },
    async fillCredential() {
      throw new Error("credential path is not exposed by browser tools")
    },
    async cancel(sessionID, signal) {
      events.push({ type: "manager", method: "cancel", sessionID })
      cancellations.push(sessionID)
      cancelSignals.push(signal)
      return sessions.delete(sessionID)
    },
    listSessions() {
      events.push({ type: "manager", method: "listSessions" })
      return [...sessions.values()]
    },
  }

  const tools = new Map<string, RegisteredTool>()
  let namespace: string | undefined
  registerBrowserTools<RegisteredTool>(
    {
      namespace(input) { namespace = input.name },
      add(tool) { tools.set(tool.name, tool) },
    },
    {
      async assertPermission(request) {
        events.push({ type: "permission", action: request.action, sessionID: request.sessionID })
        permissionRequests.push(request)
      },
      manager,
      dataDirectory: "/opencode-data",
      authGuard: { getState: () => options.guardState ?? "idle" },
    },
  )
  return { tools, namespace, events, permissionRequests, calls, cancellations, starts, cancelSignals, manager, sessions }
}

async function defaultExecute(
  operation: BrowserOperation,
  tab: (id?: string) => TabSummary,
  nextTab: () => number,
  screenshot?: Uint8Array,
): Promise<unknown> {
  switch (operation.method) {
    case "tabs.new": return tab(`tab-${nextTab()}`)
    case "tabs.list": return [tab()]
    case "tabs.close": return { closed: true }
    case "navigate":
    case "back":
    case "forward":
    case "reload":
    case "info": return { ...tab(operation.tabId), url: "https://updated.test/", title: "Updated" }
    case "snapshot": return { tabId: operation.tabId, generation: 7, snapshot: 'heading "Welcome"\n  button "Continue" [ref=continue]' }
    case "screenshot": return screenshot ?? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    case "click":
    case "fill":
    case "type":
    case "press":
    case "hover":
    case "selectOption": return tab(operation.target.tabId)
    case "scroll": return tab(operation.tabId)
    case "upload": return tab(operation.target.tabId)
  }
}

function outputText(result: Awaited<ReturnType<RegisteredTool["execute"]>>): string {
  return result.content.find((part) => part.type === "text")?.text ?? ""
}

test("all registered browser tools check their mapped permission before manager dispatch", async () => {
  const f = fixture()
  assert.equal(f.namespace, "web")
  assert.deepEqual([...f.tools.keys()], ["open", "tabs", "navigate", "snapshot", "act", "screenshot", "signin", "close"])
  for (const tool of f.tools.values()) {
    assert.equal(tool.options.namespace, "web")
    assert.equal(tool.options.codemode, true)
    assert.equal(tool.input.additionalProperties, false)
  }

  const invoke = async (name: string, input: Record<string, unknown>) => {
    const start = f.events.length
    await f.tools.get(name)!.execute(input, { ...context, id: `browser_${name}` })
    const events = f.events.slice(start)
    const firstManager = events.findIndex((event) => event.type === "manager")
    assert.equal(events[0]?.type, "permission", `${name} must authorize before any manager access`)
    assert.ok(firstManager > 0, `${name} should dispatch only after permission`)
    assert.ok(events.slice(0, firstManager).every((event) => event.type === "permission"), `${name} performed manager work before all its permissions`)
  }

  await invoke("open", { url: "https://example.test/" })
  await invoke("tabs", { action: "list" })
  await invoke("tabs", { action: "new" })
  await invoke("tabs", { action: "close", tabId: "tab-1" })
  await invoke("navigate", { tabId: "tab-1", url: "https://example.test/next" })
  await invoke("snapshot", { tabId: "tab-1" })
  await f.tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  f.events.length = 0
  await invoke("act", { tabId: "tab-1", generation: 7, ref: "continue", action: "click" })
  await invoke("screenshot", { tabId: "tab-1" })
  await invoke("close", {})
  assert.deepEqual(f.permissionRequests.map((request) => request.action), [
    "browser_open", "browser_read", "browser_open", "browser_close", "browser_act",
    "browser_read", "browser_read", "browser_act", "browser_read", "browser_close",
  ])
})

test("tool input cannot select a session; open uses context.sessionID and the injected data directory", async () => {
  const f = fixture({ running: false })
  const invalid = await f.tools.get("open")!.execute({ url: "https://example.test/", sessionID: "ses-other" }, context)
  assert.match(outputText(invalid), /Unsupported field: sessionID/)
  assert.deepEqual(f.events, [])

  await f.tools.get("open")!.execute({ url: "https://example.test/" }, context)
  assert.equal(f.starts.length, 1)
  assert.equal(f.starts[0]!.sessionId, context.sessionID)
  assert.equal(f.starts[0]!.opencodeDataDir, "/opencode-data")
  assert.equal(f.permissionRequests[0]!.sessionID, context.sessionID)
  assert.match(f.starts[0]!.projectKey, /^[a-f0-9]{32}$/u)
})

test("browser tools pass context.signal to startup and every worker operation", async () => {
  const f = fixture({ running: false })
  const controller = new AbortController()
  await f.tools.get("open")!.execute(
    { url: "https://example.test/" },
    { ...context, signal: controller.signal },
  )
  assert.equal(f.starts[0]!.signal, controller.signal)
  assert.equal(f.calls.length, 2)
  assert.ok(f.calls.every((call) => call.signal === controller.signal))
  await f.tools.get("close")!.execute({}, { ...context, signal: controller.signal })
  assert.deepEqual(f.cancelSignals, [controller.signal])
})

test("an already-aborted context returns cancellation text without manager dispatch", async () => {
  const f = fixture()
  const controller = new AbortController()
  controller.abort()
  const result = await f.tools.get("tabs")!.execute({ action: "list" }, { ...context, signal: controller.signal })
  assert.match(outputText(result), /operation was cancelled; an already-dispatched page action may still have completed/)
  assert.deepEqual(f.events, [])
})

test("a cancelled manager operation is reported as cancellation rather than success", async () => {
  const controller = new AbortController()
  let entered!: () => void
  const operationStarted = new Promise<void>((resolve) => { entered = resolve })
  const f = fixture({ execute: async (_sessionID, _operation, signal) => {
    assert.equal(signal, controller.signal)
    entered()
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new BrowserBackendError("CANCELLED", "cancelled")), { once: true })
    })
  } })
  const resultPending = f.tools.get("navigate")!.execute(
    { tabId: "tab-1", url: "https://example.test/next" },
    { ...context, signal: controller.signal },
  )
  await operationStarted
  controller.abort()
  const result = await resultPending
  assert.match(outputText(result), /operation was cancelled; an already-dispatched page action may still have completed/)
  assert.doesNotMatch(outputText(result), /updated\.test/)
})

test("manager creation is lazy, follows permission, and is reused by the plugin instance", async () => {
  const events: string[] = []
  const f = fixture()
  let created = 0
  const tools = new Map<string, RegisteredTool>()
  registerBrowserTools<RegisteredTool>(
    { namespace() {}, add(tool) { tools.set(tool.name, tool) } },
    {
      async assertPermission() { events.push("permission") },
      createManager() { events.push("factory"); created += 1; return f.manager },
      dataDirectory: "/opencode-data",
    },
  )
  assert.equal(created, 0)
  await tools.get("tabs")!.execute({ action: "list" }, context)
  await tools.get("tabs")!.execute({ action: "list" }, context)
  assert.equal(created, 1)
  assert.deepEqual(events.slice(0, 2), ["permission", "factory"])
})

test("tabs.new with a URL checks both open and navigation permissions before dispatch", async () => {
  const f = fixture({ running: false })
  await f.tools.get("tabs")!.execute({ action: "new", url: "https://example.test/new" }, context)
  assert.deepEqual(f.permissionRequests.map((request) => request.action), ["browser_open", "browser_act"])
  const firstManager = f.events.findIndex((event) => event.type === "manager")
  assert.ok(firstManager > 1)
  assert.ok(f.events.slice(0, firstManager).every((event) => event.type === "permission"))
})

test("stale snapshot generations are refused before manager dispatch", async () => {
  const f = fixture()
  await f.tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const dispatchesBefore = f.calls.length
  const result = await f.tools.get("act")!.execute(
    { tabId: "tab-1", generation: 6, ref: "continue", action: "click" },
    context,
  )
  assert.match(outputText(result), /not from this tab's current snapshot generation/)
  assert.equal(f.calls.length, dispatchesBefore)
  assert.equal(f.permissionRequests.at(-1)!.action, "browser_act")
})

test("oversized screenshots are refused without returning image data", async () => {
  const f = fixture({ screenshot: new Uint8Array(8 * 1024 * 1024 + 1) })
  const result = await f.tools.get("screenshot")!.execute({ tabId: "tab-1" }, context)
  assert.match(outputText(result), /SCREENSHOT_TOO_LARGE/)
  assert.equal(result.content.some((part) => part.type === "file"), false)
})

test("backend error codes become readable text and raw messages are withheld", async () => {
  const f = fixture({ execute: async () => { throw new BrowserBackendError("FOREIGN_TAB", "stack trace: /private/profile") } })
  const result = await f.tools.get("navigate")!.execute({ tabId: "foreign", url: "https://example.test/" }, context)
  assert.match(outputText(result), /does not belong to this session's browser worker/)
  assert.doesNotMatch(outputText(result), /stack trace|private\/profile/)
})

test("an injected private-sign-in guard blocks dispatch after permission", async () => {
  const f = fixture({ guardState: "awaiting-user" })
  const result = await f.tools.get("tabs")!.execute({ action: "list" }, context)
  assert.match(outputText(result), /refused while private sign-in is awaiting-user/)
  assert.deepEqual(f.events.map((event) => event.type), ["permission"])
})

test("fullPage screenshots are explicitly refused instead of silently downgraded", async () => {
  const f = fixture()
  const result = await f.tools.get("screenshot")!.execute({ tabId: "tab-1", fullPage: true }, context)
  assert.match(outputText(result), /Full-page screenshots are not supported/)
  assert.deepEqual(f.events.map((event) => event.type), ["permission"])
})

test("serialized snapshot text, including metadata, stays within the byte budget", async () => {
  const f = fixture({ execute: async (_sessionID, operation) => {
    if (operation.method === "snapshot") return { tabId: operation.tabId, generation: 11, snapshot: `${"é \"\n".repeat(8_000)}` }
    return defaultExecute(operation, (id) => ({ id: id as TabSummary["id"], ownership: "ephemeral", url: "https://example.test/", title: "Example" }), () => 1)
  } })
  const result = await f.tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const text = outputText(result)
  assert.ok(Buffer.byteLength(text, "utf8") <= 8_000)
  assert.ok(JSON.parse(text).snapshot.endsWith("\n...[truncated]"))
})

test("close cancels only the calling session and reports discarded tabs", async () => {
  const f = fixture({ otherSession: true })
  const result = await f.tools.get("close")!.execute({}, context)
  assert.deepEqual(f.cancellations, [context.sessionID])
  assert.equal(f.sessions.has("ses-other"), true)
  assert.deepEqual(JSON.parse(outputText(result)), {
    cancelled: true,
    discarded: ["browser worker", "tabs"],
    retained: ["isolated profile data"],
  })
})

test("screenshot attaches a data URI, reports its byte count, and exposes no filesystem path", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const f = fixture({ screenshot: bytes })
  const result = await f.tools.get("screenshot")!.execute({ tabId: "tab-1", fullPage: false }, context)
  assert.deepEqual(JSON.parse(outputText(result)), { tabId: "tab-1", bytes: bytes.byteLength, mime: "image/png" })
  const file = result.content.find((part) => part.type === "file")!
  assert.equal(file.uri, `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`)
  assert.equal(file.mime, "image/png")
  assert.equal("path" in result, false)
  assert.equal(JSON.stringify(result).includes("/tmp/"), false)
})

test("private sign-in fills the field and returns status only", async () => {
  const value = Buffer.from("synthetic-dialog-value")
  const { tools, fills, authGuard } = signInFixture({ status: "ok", value })
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const result = await tools.get("signin")!.execute(
    { tabId: "tab-1", ref: "e5", generation: 1 },
    context,
  )
  const text = result.content.map((part) => part.text ?? "").join("")
  assert.match(text, /"status":"filled"/u)
  assert.equal(text.includes("synthetic-dialog-value"), false)
  assert.equal(fills.length, 1)
  assert.deepEqual(fills[0]!.target, { tabId: "tab-1", ref: "e5", generation: 1 })
  // The transport buffer is zeroed after use and the guard returns to idle.
  assert.deepEqual([...value], new Array(value.byteLength).fill(0))
  assert.equal(authGuard.guard.getState(), "idle")
})

test("a cancelled dialog fills nothing and says so", async () => {
  const { tools, fills, authGuard } = signInFixture({ status: "cancelled" })
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const result = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  const text = result.content.map((part) => part.text ?? "").join("")
  assert.match(text, /cancelled/u)
  assert.equal(fills.length, 0)
  assert.equal(authGuard.guard.getState(), "idle")
})

test("a failed dialog reports failure without a value", async () => {
  const { tools, fills } = signInFixture({ status: "failed", code: "display" })
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const result = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  const text = result.content.map((part) => part.text ?? "").join("")
  assert.match(text, /failed/u)
  assert.equal(text.includes("display"), false)
  assert.equal(fills.length, 0)
})

test("a refused fill reports the error code and never replays", async () => {
  const value = Buffer.from("synthetic-dialog-value")
  const { tools, fills, authGuard } = signInFixture(
    { status: "ok", value },
    new BrowserBackendError("CREDENTIAL_TARGET_INVALID", "The credential target is no longer usable."),
  )
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const result = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  const text = result.content.map((part) => part.text ?? "").join("")
  assert.match(text, /CREDENTIAL_TARGET_INVALID/u)
  assert.equal(text.includes("synthetic-dialog-value"), false)
  assert.equal(fills.length, 1)
  assert.equal(authGuard.guard.getState(), "idle")
})

test("a fill whose acknowledgement is lost fails closed instead of assuming nothing happened", async () => {
  const value = Buffer.from("synthetic-dialog-value")
  const { tools, fills, authGuard } = signInFixture(
    { status: "ok", value },
    new BrowserBackendError("WORKER_CRASHED", "The browser worker exited."),
  )
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const result = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  const text = result.content.map((part) => part.text ?? "").join("")
  assert.equal(fills.length, 1, "the fill was attempted")
  assert.match(text, /WORKER_CRASHED/u)
  assert.match(text, /may have received the value/u)
  assert.equal(text.includes("synthetic-dialog-value"), false)
  // The guard must NOT return to idle: the page may still show the value.
  assert.equal(authGuard.guard.getState(), "submitted-uncertain")
  assert.equal(authGuard.guard.isScreenshotBlocked(), true)
  // Closing the session's browser discards the page and is the safe way back to idle.
  await tools.get("close")!.execute({}, context)
  assert.equal(authGuard.guard.getState(), "idle")
})

test("another session's close cannot unblock an uncertain sign-in", async () => {
  const value = Buffer.from("synthetic-dialog-value")
  const { tools, authGuard } = signInFixture(
    { status: "ok", value },
    new BrowserBackendError("WORKER_CRASHED", "The browser worker exited."),
  )
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  assert.equal(authGuard.guard.getState(), "submitted-uncertain")

  // A different session closing its own browser must not clear the guard.
  const other = { ...context, sessionID: "session-2" }
  await tools.get("close")!.execute({}, other)
  assert.equal(authGuard.guard.getState(), "submitted-uncertain")

  // The owning session can still recover by discarding its pages.
  await tools.get("close")!.execute({}, context)
  assert.equal(authGuard.guard.getState(), "idle")
})

test("private sign-in refuses to start while another one is active", async () => {
  const { tools, authGuard } = signInFixture({ status: "cancelled" })
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  authGuard.signInPath.begin()
  const result = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  const text = result.content.map((part) => part.text ?? "").join("")
  assert.match(text, /already active|private sign-in/iu)
  authGuard.userActions.cancel()
})

test("private sign-in is unavailable without a sign-in capable guard", async () => {
  const tools = new Map<string, RegisteredTool>()
  registerBrowserTools(
    {
      namespace() {},
      add(tool: RegisteredTool) {
        tools.set((tool as RegisteredTool).name, tool as RegisteredTool)
      },
    } as never,
    {
      assertPermission: async () => {},
      manager: {
        listSessions: () => [{ sessionId: context.sessionID, status: "running" as const }],
        async execute() {
          return { tabId: "tab-1", generation: 1, snapshot: '- textbox "Password" [ref=e5]' }
        },
      } as never,
      dataDirectory: "/tmp/computer-use-test",
    },
  )
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const result = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 1 }, context)
  const text = result.content.map((part) => part.text ?? "").join("")
  assert.match(text, /unavailable/u)
})

test("private sign-in refuses a stale generation before opening the dialog", async () => {
  let dialogOpened = false
  const tools = new Map<string, RegisteredTool>()
  const authGuard = createAuthGuard()
  registerBrowserTools(
    {
      namespace() {},
      add(tool: RegisteredTool) {
        tools.set((tool as RegisteredTool).name, tool as RegisteredTool)
      },
    } as never,
    {
      assertPermission: async () => {},
      manager: {
        listSessions: () => [{ sessionId: context.sessionID, status: "running" as const }],
        async execute() {
          return {
            tabId: "tab-1",
            generation: 4,
            snapshot: '- textbox "Password" [ref=e5]',
          }
        },
      } as never,
      dataDirectory: "/tmp/computer-use-test",
      authGuard,
      signInDialog: async () => {
        dialogOpened = true
        return { status: "cancelled" } as never
      },
    },
  )

  // Register the current generation by taking a snapshot through the tool.
  await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const stale = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 3 }, context)
  assert.match(outputText(stale), /not from this tab's current snapshot generation/u)
  assert.equal(dialogOpened, false)
  assert.equal(authGuard.guard.getState(), "idle")

  // The current generation is accepted and reaches the dialog.
  const current = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation: 4 }, context)
  assert.equal(dialogOpened, true)
  assert.match(outputText(current), /cancelled/u)
})

test("tabs.new and tabs.close do not disclose other tabs' URLs or titles", async () => {
  const tools = new Map<string, RegisteredTool>()
  const otherUrl = "https://private.example.test/secret-path"
  const created = { id: "tab-new", ownership: "ephemeral", url: "https://example.test/", title: "New" }
  const other = { id: "tab-other", ownership: "user-owned", url: otherUrl, title: "Private tab" }
  registerBrowserTools(
    {
      namespace() {},
      add(tool: RegisteredTool) {
        tools.set((tool as RegisteredTool).name, tool as RegisteredTool)
      },
    } as never,
    {
      assertPermission: async () => {},
      dataDirectory: "/tmp/computer-use-test",
      manager: {
        listSessions: () => [{ sessionId: context.sessionID, status: "running" as const }],
        async execute(_sessionID: string, operation: { method: string }) {
          if (operation.method === "tabs.new") return created
          if (operation.method === "tabs.list") return [created, other]
          return { ok: true }
        },
      } as never,
    },
  )

  const opened = await tools.get("tabs")!.execute({ action: "new" }, context)
  const openedText = outputText(opened)
  assert.match(openedText, /tab-new/u)
  assert.equal(openedText.includes("private.example.test"), false, "tabs.new must not reveal another tab's URL")
  assert.equal(openedText.includes("Private tab"), false, "tabs.new must not reveal another tab's title")

  const closed = await tools.get("tabs")!.execute({ action: "close", tabId: "tab-new" }, context)
  const closedText = outputText(closed)
  assert.match(closedText, /tab-new/u)
  assert.equal(closedText.includes("private.example.test"), false)

  const listed = await tools.get("tabs")!.execute({ action: "list" }, context)
  assert.match(outputText(listed), /private.example.test/u, "listing is the path that needs browser_read")
})

test("a screenshot is refused after a credential fill until the tab navigates", async () => {
  const tools = new Map<string, RegisteredTool>()
  const authGuard = createAuthGuard()
  let screenshotCalls = 0
  const tabSummary = { id: "tab-1", ownership: "ephemeral" as const, url: "https://login.example.test/", title: "Sign in" }
  registerBrowserTools(
    {
      namespace() {},
      add(tool: RegisteredTool) {
        tools.set((tool as RegisteredTool).name, tool as RegisteredTool)
      },
    } as never,
    {
      assertPermission: async () => {},
      dataDirectory: "/tmp/computer-use-test",
      authGuard,
      signInDialog: async () => ({ status: "ok", value: Buffer.from("synthetic-value-123") }),
      manager: {
        listSessions: () => [{ sessionId: context.sessionID, status: "running" as const }],
        async execute(_sessionID: string, operation: { method: string }) {
          if (operation.method === "snapshot") return { tabId: "tab-1", generation: 1, snapshot: '- textbox "Password" [ref=e5]' }
          if (operation.method === "screenshot") {
            screenshotCalls += 1
            return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
          }
          return tabSummary
        },
        async fillCredential() {
          return { status: "filled" as const }
        },
      } as never,
    },
  )

  const snapshot = await tools.get("snapshot")!.execute({ tabId: "tab-1" }, context)
  const generation = JSON.parse(outputText(snapshot)).generation
  const signed = await tools.get("signin")!.execute({ tabId: "tab-1", ref: "e5", generation }, context)
  assert.match(outputText(signed), /"status":"filled"/u)

  const refused = await tools.get("screenshot")!.execute({ tabId: "tab-1" }, context)
  assert.match(outputText(refused), /Refused: this tab had a credential filled/u)
  assert.equal(screenshotCalls, 0, "no screenshot may be taken while the page can show the value")

  await tools.get("navigate")!.execute({ tabId: "tab-1", url: "https://example.test/next" }, context)
  await tools.get("screenshot")!.execute({ tabId: "tab-1" }, context)
  assert.equal(screenshotCalls, 1, "navigating away clears the refusal")
})
