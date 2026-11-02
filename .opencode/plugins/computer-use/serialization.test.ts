/**
 * Tests for per-session tool serialization.
 *
 * These cover the wiring the runtime queue previously lacked: one owner key per
 * surface and session, ordered mutations, independent sessions, cancellation of a
 * queued call, and a deadline that frees a slot held by a stuck operation.
 */

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  operationMode,
  ownerKey,
  withDeadline,
  withSerializedTools,
} from "./serialization.ts"
import { createAuthGuard, createOwnerOperationQueue } from "../../../tools/computer-use-runtime/src/index.ts"

type Context = { sessionID: string; agent: string; messageID: string; id: string; signal?: AbortSignal }

const context = (sessionID: string, signal?: AbortSignal): Context => ({
  sessionID,
  agent: "build",
  messageID: "msg",
  id: "call",
  ...(signal ? { signal } : {}),
})

type Tool = {
  name: string
  description?: string
  input?: Record<string, unknown>
  options?: Record<string, unknown>
  execute(input: unknown, ctx: Context): Promise<unknown>
}

/** Minimal editor stand-in that records what registration added. */
function fakeEditor() {
  const added: Array<Record<string, unknown>> = []
  const calls: string[] = []
  const editor = {
    added,
    calls,
    add(tool: Record<string, unknown>) {
      added.push(tool)
    },
    namespace(entry: { name: string }) {
      calls.push(`namespace:${entry.name}`)
    },
    list() {
      return added
    },
    update() {
      calls.push("update")
    },
  }
  return editor
}

const deferred = () => {
  let resolve: (value?: unknown) => void = () => {}
  const promise = new Promise<unknown>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("read-only tools are declared per surface and default to mutation", () => {
  assert.deepEqual(operationMode("desktop", "apps"), { mode: "read", allowInterleave: true })
  assert.deepEqual(operationMode("desktop", "tree"), { mode: "read", allowInterleave: false })
  assert.deepEqual(operationMode("desktop", "input"), { mode: "mutation", allowInterleave: false })
  assert.deepEqual(operationMode("desktop", "launch"), { mode: "mutation", allowInterleave: false })
  assert.deepEqual(operationMode("web", "snapshot"), { mode: "read", allowInterleave: false })
  assert.deepEqual(operationMode("web", "act"), { mode: "mutation", allowInterleave: false })
  // Unknown names, including a future tool nobody classified, stay exclusive.
  assert.deepEqual(operationMode("web", "not_a_tool"), { mode: "mutation", allowInterleave: false })
})

test("the owner key names both surface and session and refuses bad attribution", () => {
  assert.equal(ownerKey("desktop", context("ses_1")), "desktop:ses_1")
  assert.equal(ownerKey("web", context("ses_1")), "web:ses_1")
  assert.throws(() => ownerKey("desktop", {}), /INVALID_CONTEXT|caller context/i)
  assert.throws(() => ownerKey("desktop", context("")), /caller context/i)
  assert.throws(() => ownerKey("desktop", context("ses\n1")), /caller context/i)
  assert.throws(() => ownerKey("desktop", context("x".repeat(300))), /caller context/i)
  // Every attribution field is required, not just the session.
  assert.throws(() => ownerKey("desktop", { sessionID: "ses_1", messageID: "m", id: "c" }), /caller context/i)
  assert.throws(() => ownerKey("desktop", { sessionID: "ses_1", agent: "build", id: "c" }), /caller context/i)
  assert.throws(() => ownerKey("desktop", { sessionID: "ses_1", agent: "build", messageID: "m" }), /caller context/i)
})

test("a caller with unusable attribution is rejected before anything runs", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
  })
  let ran = false
  serialized.add({
    name: "input",
    async execute() {
      ran = true
      return "ok"
    },
  })
  const tool = editor.added[0] as unknown as Tool

  await assert.rejects(tool.execute({}, { ...context("ses_a"), agent: "" }), /caller context/i)
  await assert.rejects(tool.execute({}, { ...context("ses_a"), id: "" }), /caller context/i)
  assert.equal(ran, false)
})

test("mutations in one session run in order and never overlap", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
  })
  const events: string[] = []
  serialized.add({
    name: "input",
    async execute(_input: unknown, ctx: Context) {
      events.push(`start:${ctx.sessionID}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
      events.push(`end:${ctx.sessionID}`)
      return "ok"
    },
  })
  const tool = editor.added[0] as unknown as Tool

  await Promise.all([
    tool.execute({}, context("ses_a")),
    tool.execute({}, context("ses_a")),
  ])

  assert.deepEqual(events, ["start:ses_a", "end:ses_a", "start:ses_a", "end:ses_a"])
})

test("separate sessions keep independent queues", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
  })
  const gate = deferred()
  const events: string[] = []
  serialized.add({
    name: "input",
    async execute(_input: unknown, ctx: Context) {
      events.push(`start:${ctx.sessionID}`)
      if (ctx.sessionID === "ses_slow") await gate.promise
      events.push(`end:${ctx.sessionID}`)
      return "ok"
    },
  })
  const tool = editor.added[0] as unknown as Tool

  const slow = tool.execute({}, context("ses_slow"))
  await tool.execute({}, context("ses_fast"))
  assert.deepEqual(events, ["start:ses_slow", "start:ses_fast", "end:ses_fast"])
  gate.resolve()
  await slow
  assert.deepEqual(events.at(-1), "end:ses_slow")
})

test("a mutation blocks both status and structural reads in the same session", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
  })
  const gate = deferred()
  const events: string[] = []
  serialized.add({
    name: "apps",
    async execute() {
      events.push("apps")
      return "ok"
    },
  })
  serialized.add({
    name: "input",
    async execute() {
      events.push("input:start")
      await gate.promise
      events.push("input:end")
      return "ok"
    },
  })
  serialized.add({
    name: "tree",
    async execute() {
      events.push("tree")
      return "ok"
    },
  })
  const [apps, input, tree] = editor.added as unknown as Tool[]

  const pending = input.execute({}, context("ses_a"))
  const queuedApps = apps.execute({}, context("ses_a"))
  const queuedTree = tree.execute({}, context("ses_a"))
  await new Promise((resolve) => setTimeout(resolve, 5))
  // Nothing may overtake the running mutation.
  assert.deepEqual(events, ["input:start"])
  gate.resolve()
  await Promise.all([pending, queuedApps, queuedTree])
  assert.deepEqual(events, ["input:start", "input:end", "apps", "tree"])
})

test("queued status reads may share the queue with each other", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
  })
  const gate = deferred()
  const events: string[] = []
  let concurrent = 0
  serialized.add({
    name: "apps",
    async execute() {
      concurrent += 1
      events.push(`apps:${concurrent}`)
      await gate.promise
      return "ok"
    },
  })
  const [apps] = editor.added as unknown as Tool[]

  const first = apps.execute({}, context("ses_a"))
  const second = apps.execute({}, context("ses_a"))
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(events, ["apps:1", "apps:2"])
  gate.resolve()
  await Promise.all([first, second])
})

test("web.tabs is serialized as a mutation because it can create or close tabs", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "web", {
    queue: createOwnerOperationQueue(),
  })
  const gate = deferred()
  const events: string[] = []
  serialized.add({
    name: "tabs",
    async execute() {
      events.push("start")
      await gate.promise
      events.push("end")
      return "ok"
    },
  })
  const [tabs] = editor.added as unknown as Tool[]
  const first = tabs.execute({}, context("ses_a"))
  const second = tabs.execute({}, context("ses_a"))
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(events, ["start"], "no second tabs call may run beside the first")
  gate.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ["start", "end", "start", "end"])
})

test("cancelling a queued call rejects it without running the operation", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "web", {
    queue: createOwnerOperationQueue(),
  })
  const gate = deferred()
  let secondRan = false
  serialized.add({
    name: "act",
    async execute(_input: unknown, ctx: Context) {
      if (ctx.id === "first") {
        await gate.promise
        return "first"
      }
      secondRan = true
      return "second"
    },
  })
  const tool = editor.added[0] as unknown as Tool

  const controller = new AbortController()
  const first = tool.execute({}, { ...context("ses_a"), id: "first" })
  const cancelled = tool.execute(
    {},
    { ...context("ses_a"), id: "second", signal: controller.signal },
  )
  controller.abort()
  await assert.rejects(cancelled, /cancelled/i)
  gate.resolve()
  await first
  assert.equal(secondRan, false)
})

test("a stuck operation releases its slot at the deadline", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
    deadlineMs: 20,
  })
  serialized.add({
    name: "launch",
    async execute(_input: unknown, ctx: Context) {
      if (ctx.id === "stuck") {
        await new Promise(() => {})
      }
      return "ready"
    },
  })
  const tool = editor.added[0] as unknown as Tool

  const stuck = tool.execute({}, { ...context("ses_a"), id: "stuck" })
  await assert.rejects(stuck, /deadline/)
  const after = await tool.execute({}, context("ses_a"))
  assert.equal(after, "ready")
})

test("withDeadline discards a late result instead of resolving twice", async () => {
  const gate = deferred()
  const bounded = withDeadline(gate.promise, 10, "desktop.capture")
  await assert.rejects(bounded, /desktop\.capture exceeded its 10 ms deadline/)
  gate.resolve("late")
  // The abandoned promise must not surface as an unhandled rejection.
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(await Promise.resolve("settled"), "settled")
})

test("private sign-in blocks the whole surface except the safety allowlist", async () => {
  let state = "idle"
  const guard = { guard: { getState: () => state } }
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
    authGuard: guard,
    allowDuringSignIn: new Set(["release"]),
  })
  const ran: string[] = []
  for (const name of ["capture", "input", "launch", "release"]) {
    serialized.add({
      name,
      async execute() {
        ran.push(name)
        return "ok"
      },
    })
  }
  const tools = editor.added as unknown as Tool[]
  const byName = new Map(tools.map((tool) => [tool.name, tool]))

  state = "awaiting-user"
  for (const name of ["capture", "input", "launch"]) {
    await assert.rejects(byName.get(name)!.execute({}, context("ses_a")), /private sign-in|AUTH_GUARD_BLOCKED/i)
  }
  await assert.doesNotReject(byName.get("release")!.execute({}, context("ses_a")))
  assert.deepEqual(ran, ["release"])

  state = "idle"
  await byName.get("capture")!.execute({}, context("ses_a"))
  assert.deepEqual(ran, ["release", "capture"])
})

test("a guard that cannot report its state blocks rather than fails open", async () => {
  const guard = {
    guard: {
      getState() {
        throw new Error("guard unavailable")
      },
    },
  }
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
    authGuard: guard,
  })
  serialized.add({
    name: "capture",
    async execute() {
      return "ok"
    },
  })
  const tool = editor.added[0] as unknown as Tool
  await assert.rejects(tool.execute({}, context("ses_a")), /private sign-in|AUTH_GUARD_BLOCKED/i)
})

test("registration keeps tool metadata and only replaces execute", async () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
  })
  serialized.namespace({ name: "desktop" })
  serialized.add({
    name: "capture",
    description: "Capture a window",
    input: { type: "object", properties: {} },
    options: { namespace: "desktop", codemode: true },
    async execute() {
      return "png"
    },
  })
  const registered = editor.added[0]
  assert.equal(registered.description, "Capture a window")
  assert.deepEqual(registered.options, { namespace: "desktop", codemode: true })
  assert.equal(typeof registered.execute, "function")
  assert.deepEqual(editor.calls, ["namespace:desktop"])
  assert.equal(await (registered as unknown as Tool).execute({}, context("ses_a")), "png")
})

test("tools without execute are registered untouched", () => {
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
  })
  const plain = { name: "placeholder" }
  serialized.add(plain)
  assert.equal(editor.added[0], plain)
})

test("a queued call does not dispatch if sign-in starts while it waits", async () => {
  let state = "idle"
  const guard = { guard: { getState: () => state } }
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor, "desktop", {
    queue: createOwnerOperationQueue(),
    authGuard: guard,
  })
  const gate = deferred()
  const started = deferred()
  const ran: string[] = []
  serialized.add({
    name: "capture",
    async execute() {
      ran.push("first")
      started.resolve()
      await gate.promise
      return "first"
    },
  })
  serialized.add({
    name: "input",
    async execute() {
      ran.push("second")
      return "second"
    },
  })
  const [first, second] = editor.added as unknown as Tool[]

  // Start the first call and wait until it is genuinely running, so the guard flip
  // happens while the second call is queued rather than before either dispatched.
  const running = first.execute({}, context("ses_a"))
  await started.promise
  const queuedRejects = assert.rejects(second.execute({}, context("ses_a")), /private sign-in|AUTH_GUARD_BLOCKED/i)
  state = "awaiting-user"
  gate.resolve()
  await running
  await queuedRejects
  assert.deepEqual(ran, ["first"], "no queued desktop action may dispatch during sign-in")
})

test("a blocked sign-in allows the non-sensitive tools named in the allowlist", async () => {
  const guard = createAuthGuard()
  const queue = createOwnerOperationQueue()
  const editor = fakeEditor()
  const serialized = withSerializedTools(editor as never, "web", {
    queue,
    authGuard: guard,
    allowDuringSignIn: new Set(["close"]),
  }) as { add(tool: Tool): void }

  const ran: string[] = []
  for (const name of ["snapshot", "close"]) {
    serialized.add({
      name,
      options: { namespace: "web", codemode: true },
      async execute() { ran.push(name); return { ok: true } },
    })
  }
  const tools = new Map((editor as unknown as { added: Tool[] }).added.map((tool) => [tool.name, tool]))

  // Idle: both work.
  await tools.get("snapshot")!.execute({}, context("ses_a"))
  await tools.get("close")!.execute({}, context("ses_a"))
  assert.deepEqual(ran, ["snapshot", "close"])

  // Uncertain fill: observation is refused, discarding the pages is allowed.
  guard.signInPath.begin()
  guard.signInPath.beginFilling()
  guard.signInPath.markSubmittedUncertain()
  ran.length = 0
  await assert.rejects(tools.get("snapshot")!.execute({}, context("ses_a")), { code: "AUTH_GUARD_BLOCKED" })
  await tools.get("close")!.execute({}, context("ses_a"))
  assert.deepEqual(ran, ["close"])
  guard.operatorActions.recover()
})
