import assert from "node:assert/strict"
import test from "node:test"
import { Effect, Fiber } from "effect"

import { createEffectTools, type EffectToolCall, type EffectToolDependencies } from "../src/effect-tools.ts"

function call(): EffectToolCall {
  return { sessionID: "ses_first1", agent: "build", messageID: "msg_first1", id: "call_first1" }
}

const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error("condition was not reached")
}

function harness(overrides: Partial<EffectToolDependencies> = {}) {
  const requests: Array<{ input: unknown; signal?: AbortSignal }> = []
  const permissions: unknown[] = []
  const cancelled: Array<[string, string]> = []
  const dependencies: EffectToolDependencies = {
    assertPermission: (request) => Effect.sync(() => permissions.push(request)),
    sessionDirectory: () => Effect.succeed("/repo/a"),
    execute: async (input, signal) => {
      requests.push({ input, signal })
      if (input.action === "web_search") {
        return { text: "Synthetic result", searchPerformed: true, sources: [{ title: "Example", url: "https://example.com/" }] }
      }
      return { text: "Synthetic reply" }
    },
    onCancelled: (sessionID, tool) => cancelled.push([sessionID, tool]),
    ...overrides,
  }
  const tools = createEffectTools(dependencies)
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.name === name)
    assert.ok(found)
    return found
  }
  return { tools, tool, requests, permissions, cancelled }
}

test("effect tools expose chat and search only and assert permission inside the call", async () => {
  const fake = harness()
  assert.deepEqual(fake.tools.map((tool) => tool.name), ["web_search", "chat"])
  assert.ok(fake.tools.every((tool) => tool.options.codemode === true))
  const result = await Effect.runPromise(fake.tool("chat").execute({ prompt: "Synthetic prompt" }, call()))
  assert.deepEqual(result, { content: "Synthetic reply" })
  assert.deepEqual(fake.permissions, [{
    sessionID: "ses_first1",
    agent: "build",
    source: { type: "tool", messageID: "msg_first1", id: "call_first1" },
    action: "chatgpt.chat",
    resources: ["chatgpt.com"],
    save: ["chatgpt.com"],
  }])
  assert.deepEqual(fake.requests.map(({ input }) => input), [
    { action: "chat", prompt: "Synthetic prompt", sessionID: "ses_first1" },
  ])
})

test("invalid input and permission denial never reach the backend", async () => {
  const fake = harness()
  for (const input of [null, {}, { prompt: " " }, { prompt: "x", sessionID: "ses_other1" }]) {
    const result = await Effect.runPromise(fake.tool("chat").execute(input, call()))
    assert.deepEqual(result, { content: "ChatGPT tool arguments are invalid." })
  }
  assert.deepEqual(fake.permissions, [])
  assert.deepEqual(fake.requests, [])

  const denied = harness({ assertPermission: () => Effect.fail(new Error("synthetic denial")) })
  await assert.rejects(Effect.runPromise(denied.tool("chat").execute({ prompt: "x" }, call())), /synthetic denial/)
  assert.deepEqual(denied.requests, [])
})

test("interrupting while permission is pending cancels that call and reports cancellation", async () => {
  let asked = false
  const fake = harness({
    assertPermission: () => Effect.sync(() => { asked = true }).pipe(Effect.andThen(Effect.never)),
  })
  const fiber = Effect.runFork(fake.tool("chat").execute({ prompt: "cancel me" }, call()))
  await waitFor(() => asked)
  await Effect.runPromise(Fiber.interrupt(fiber))
  assert.deepEqual(fake.requests, [])
  assert.deepEqual(fake.cancelled, [["ses_first1", "chat"]])
})

test("interrupting an in-flight backend request aborts its signal and suppresses the result", async () => {
  let started = false
  let aborted = false
  const fake = harness({
    execute: async (_input, signal) => {
      started = true
      signal.addEventListener("abort", () => { aborted = true }, { once: true })
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      })
    },
  })
  const fiber = Effect.runFork(fake.tool("chat").execute({ prompt: "cancel me" }, call()))
  await waitFor(() => started)
  await Effect.runPromise(Fiber.interrupt(fiber))
  await waitFor(() => aborted && fake.cancelled.length > 0)
  assert.deepEqual(fake.cancelled, [["ses_first1", "chat"]])
})

test("an unloaded connector refuses before permission or backend work", async () => {
  let available = false
  const fake = harness({
    ensureAvailable: () => { if (!available) throw new Error("ChatGPT connector is unavailable.") },
  })
  await assert.rejects(Effect.runPromise(fake.tool("chat").execute({ prompt: "x" }, call())), /unavailable/)
  assert.deepEqual(fake.permissions, [])
  assert.deepEqual(fake.requests, [])
  available = true
  assert.deepEqual(await Effect.runPromise(fake.tool("chat").execute({ prompt: "x" }, call())), { content: "Synthetic reply" })
})

test("search results keep the adapter validation and source formatting", async () => {
  const fake = harness()
  const result = await Effect.runPromise(fake.tool("web_search").execute({ query: "synthetic" }, call()))
  assert.ok(typeof result.content === "string")
  assert.match(result.content, /Example — https:\/\/example\.com\//)
})
