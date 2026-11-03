import assert from "node:assert/strict"
import test from "node:test"

import { setupChatGPTServer } from "../src/server.ts"
import type { ChatGPTInput } from "../src/rpc.ts"
import type { createInProcessTools } from "../src/in-process-tools.ts"

type Event = { type: string; data?: Record<string, unknown> }
type ExecuteHandler = (input: ChatGPTInput, context: { signal: AbortSignal }) => Promise<unknown>
type TestSession = { projectID: string; directory: string; model?: unknown }
type RequestTimeoutScheduler = (callback: () => void, timeoutMs: number) => () => void

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function controlledTimeoutScheduler() {
  const scheduled: Array<{
    callback: () => void
    timeoutMs: number
    active: boolean
    cancelCalls: number
  }> = []
  return {
    scheduled,
    schedule: ((callback, timeoutMs) => {
      const timeout = { callback, timeoutMs, active: true, cancelCalls: 0 }
      scheduled.push(timeout)
      return () => {
        timeout.active = false
        timeout.cancelCalls += 1
      }
    }) satisfies RequestTimeoutScheduler,
    fire(timeoutIndex = 0) {
      const timeout = scheduled[timeoutIndex]
      assert.ok(timeout?.active, "request timeout should remain scheduled until the backend settles")
      timeout.active = false
      timeout.callback()
    },
  }
}

function eventSource() {
  const queue: Event[] = []
  let closed = false
  let waiting: ((result: IteratorResult<Event>) => void) | undefined
  const close = () => {
    closed = true
    waiting?.({ value: undefined, done: true })
    waiting = undefined
  }
  return {
    push(event: Event) {
      if (closed) return
      const resolve = waiting
      if (resolve) {
        waiting = undefined
        resolve({ value: event, done: false })
      } else queue.push(event)
    },
    subscribe({ signal }: { signal: AbortSignal }) {
      signal.addEventListener("abort", close, { once: true })
      return {
        [Symbol.asyncIterator]() { return this },
        next(): Promise<IteratorResult<Event>> {
          if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false })
          if (closed) return Promise.resolve({ value: undefined, done: true })
          return new Promise((resolve) => { waiting = resolve })
        },
      }
    },
    close,
  }
}

function token(accountID: string) {
  const claims = Buffer.from(JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: accountID },
  })).toString("base64url")
  return `header.${claims}.signature`
}

function oauth(accountID = "account-1", expires = Date.now() + 60_000) {
  return { type: "oauth", access: token(accountID), expires, metadata: {} }
}

function makeContext(options: {
  credential?: unknown
  backend?: {
    generateImage?: (input: any) => Promise<string>
    webSearch?: (input: any) => Promise<unknown>
    chat?: (input: any) => Promise<string>
  }
  scheduleRequestTimeout?: RequestTimeoutScheduler
  sessions?: Record<string, TestSession>
  models?: {
    available?: Array<{ providerID: string; id: unknown; enabled?: boolean }>
  }
} = {}) {
  const events = eventSource()
  const sessions = options.sessions ?? {
    ses_first1: { projectID: "project-a", directory: "/repo/a" },
    ses_second1: { projectID: "project-a", directory: "/repo/a" },
    ses_other1: { projectID: "project-b", directory: "/repo/b" },
  }
  const availableModels = options.models?.available ?? [
    { providerID: "openai", id: "gpt-5.3-codex", enabled: true },
  ]
  const captured: { execute?: ExecuteHandler } = {}
  let credential: unknown = options.credential ?? oauth()
  let backendCalls = 0
  const backend = {
    generateImage: async (input: any) => {
      backendCalls += 1
      return options.backend?.generateImage?.(input) ?? "aGVsbG8="
    },
    webSearch: async (input: any) => {
      backendCalls += 1
      return options.backend?.webSearch?.(input) ?? {
        text: "Search result",
        sources: [{ title: "OpenAI", url: "https://openai.com" }],
        searchPerformed: true,
      }
    },
    chat: async (input: any) => {
      backendCalls += 1
      return options.backend?.chat?.(input) ?? "Chat response"
    },
  }
  const context = {
    location: { directory: "/repo/a", project: { id: "project-a" } },
    provider: {
      list: async () => ({ data: [{ id: "openai", canonical: "openai", integrationID: "openai" }] }),
    },
    integration: {
      list: async () => ({ data: [{ id: "openai", name: "OpenAI" }] }),
      connection: {
        active: async () => ({ type: "credential", id: "credential-1", label: "OpenAI OAuth" }),
        resolve: async () => credential,
      },
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const found = sessions[sessionID]
        if (!found) throw new Error("not found")
        return {
          id: sessionID,
          projectID: found.projectID,
          location: { directory: found.directory },
          model: found.model,
        }
      },
    },
    model: {
      list: async () => ({ data: availableModels.map((model) => ({ enabled: true, ...model })) }),
    },
    event: { subscribe: events.subscribe },
    rpc: {
      register: async (_definition: unknown, handlers: { execute: ExecuteHandler }) => {
        captured.execute = handlers.execute
        return { dispose: async () => undefined }
      },
    },
  }
  return {
    context,
    events,
    captured,
    backend,
    calls: () => backendCalls,
    setCredential(value: unknown) { credential = value },
  }
}

async function start(options: Parameters<typeof makeContext>[0] = {}) {
  const fake = makeContext(options)
  const cleanup = await setupChatGPTServer(fake.context as any, {
    backend: fake.backend as any,
    scheduleRequestTimeout: options.scheduleRequestTimeout,
  })
  assert.equal(typeof fake.captured.execute, "function")
  return {
    ...fake,
    execute: fake.captured.execute!,
    cleanup: async () => {
      fake.events.close()
      await cleanup()
    },
  }
}

const signal = new AbortController().signal

test("server rejects API-key, expired, and unidentifiable OAuth credentials", async () => {
  const rejected = [
    { type: "key", key: "must-not-fallback" },
    oauth("account-expired", Date.now() - 1),
    { type: "oauth", access: "unstructured-oauth-token", expires: Date.now() + 60_000, metadata: {} },
  ]
  for (const credential of rejected) {
    const fake = await start({ credential })
    try {
      await assert.rejects(fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "Hello" }, { signal }))
      assert.equal(fake.calls(), 0)
    } finally {
      await fake.cleanup()
    }
  }
})

test("server binds MCP projectDirectory to the resolved OpenCode session", async () => {
  const fake = await start()
  try {
    await assert.rejects(
      fake.execute({
        action: "chat",
        sessionID: "ses_first1",
        prompt: "Hello",
        projectDirectory: "/repo/b",
      }, { signal }),
      /does not belong to the requested project directory/,
    )
    assert.equal(fake.calls(), 0)
  } finally {
    await fake.cleanup()
  }
})

test("server restricts every action to its invoking project location and identity", async () => {
  const fake = await start({
    sessions: {
      ses_wrongdir1: { projectID: "project-a", directory: "/repo/b" },
      ses_wrongproj1: { projectID: "project-b", directory: "/repo/a" },
    },
  })
  const actions: Array<(sessionID: string) => ChatGPTInput> = [
    (sessionID) => ({ action: "generate_image", sessionID, prompt: "A red fox" }),
    (sessionID) => ({ action: "web_search", sessionID, query: "OpenAI" }),
    (sessionID) => ({ action: "chat", sessionID, prompt: "Hello" }),
  ]
  try {
    for (const sessionID of ["ses_wrongdir1", "ses_wrongproj1"]) {
      for (const action of actions) {
        await assert.rejects(fake.execute(action(sessionID), { signal }), /does not belong to the invoking project/)
      }
    }
    assert.equal(fake.calls(), 0)
  } finally {
    await fake.cleanup()
  }
})

test("server prefers an eligible session model and otherwise uses a stable catalog choice", async () => {
  const models: string[] = []
  const fake = await start({
    sessions: {
      ses_first1: {
        projectID: "project-a",
        directory: "/repo/a",
        model: { providerID: "openai", id: "gpt-5.4-codex" },
      },
      ses_second1: { projectID: "project-a", directory: "/repo/a" },
    },
    models: {
      available: [
        { providerID: "openai", id: "gpt-5.3-codex" },
        { providerID: "openai", id: "gpt-5.4-codex" },
      ],
    },
    backend: {
      webSearch: async ({ model }) => {
        models.push(`search:${model}`)
        return { text: "Search result", sources: [{ title: "OpenAI", url: "https://openai.com" }], searchPerformed: true }
      },
      chat: async ({ model }) => {
        models.push(`chat:${model}`)
        return "Chat response"
      },
    },
  })

  try {
    await fake.execute({ action: "web_search", sessionID: "ses_first1", query: "OpenAI" }, { signal })
    await fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "Use the session model" }, { signal })
    await fake.execute({ action: "chat", sessionID: "ses_second1", prompt: "Use the catalog fallback" }, { signal })
    assert.deepEqual(models, ["search:gpt-5.4-codex", "chat:gpt-5.4-codex", "chat:gpt-5.3-codex"])
  } finally {
    await fake.cleanup()
  }
})

test("server falls back to an eligible catalog model for malformed session model values", async () => {
  const malformedModels: unknown[] = [
    null,
    "not-a-model-record",
    {},
    { providerID: "openai", id: null },
    { providerID: "openai", id: 42 },
    { providerID: "openai", id: "gpt-codex\n" },
    { providerID: "openai", id: "gpt/codex" },
    { providerID: "openai", id: `${"x".repeat(124)}codex` },
    { providerID: 42, id: "gpt-5.4-codex" },
  ]
  const sessions = Object.fromEntries(malformedModels.map((model, index) => [
    `ses_bad${index}`,
    { projectID: "project-a", directory: "/repo/a", model },
  ]))
  const dispatched: string[] = []
  const fake = await start({
    sessions,
    models: { available: [{ providerID: "openai", id: "gpt-5.3-codex" }] },
    backend: {
      chat: async ({ model }) => {
        dispatched.push(model)
        return "Chat response"
      },
    },
  })

  try {
    for (let index = 0; index < malformedModels.length; index += 1) {
      await fake.execute({ action: "chat", sessionID: `ses_bad${index}`, prompt: "Use catalog fallback" }, { signal })
    }
    assert.deepEqual(dispatched, Array(malformedModels.length).fill("gpt-5.3-codex"))
  } finally {
    await fake.cleanup()
  }
})

test("server accepts the 128-character model boundary and excludes unsafe catalog identifiers", async () => {
  const maxSafeModelID = `${"a".repeat(123)}codex`
  const invalidIDs: unknown[] = [
    `${"a".repeat(124)}codex`,
    `${"a".repeat(122)}\ncodex`,
    `${"a".repeat(122)}/codex`,
    null,
    42,
  ]
  const dispatched: string[] = []
  const fake = await start({
    models: {
      available: [
        ...invalidIDs.map((id) => ({ providerID: "openai", id })),
        { providerID: "openai", id: maxSafeModelID },
        { providerID: "openai", id: "gpt-5.3-codex" },
      ],
    },
    backend: {
      chat: async ({ model }) => {
        dispatched.push(model)
        return "Chat response"
      },
    },
  })

  try {
    await fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "Use a bounded model" }, { signal })
    assert.equal(maxSafeModelID.length, 128)
    assert.deepEqual(dispatched, [maxSafeModelID])
  } finally {
    await fake.cleanup()
  }
})

test("server fails closed when every OpenAI Codex catalog ID is unsafe", async () => {
  const unsafeModelID = `${"x".repeat(124)}codex`
  const fake = await start({
    sessions: {
      ses_first1: {
        projectID: "project-a",
        directory: "/repo/a",
        model: { providerID: "openai", id: unsafeModelID },
      },
    },
    models: {
      available: [
        { providerID: "openai", id: unsafeModelID },
        { providerID: "openai", id: "gpt-codex\n" },
        { providerID: "openai", id: "gpt/codex" },
      ],
    },
  })

  try {
    await assert.rejects(
      fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "Must not dispatch" }, { signal }),
      /No available OpenAI Codex model is configured/,
    )
    assert.equal(fake.calls(), 0)
  } finally {
    await fake.cleanup()
  }
})

test("server uses an available OpenAI Codex model for a non-OpenAI caller", async () => {
  const dispatched: string[] = []
  const fake = await start({
    sessions: {
      ses_first1: {
        projectID: "project-a",
        directory: "/repo/a",
        model: { providerID: "anthropic", id: "claude-sonnet" },
      },
      ses_second1: {
        projectID: "project-a",
        directory: "/repo/a",
        model: { providerID: "openai", id: "gpt-5.2-codex" },
      },
    },
    models: {
      available: [
        { providerID: "openai", id: "gpt-5.4-codex" },
        { providerID: "anthropic", id: "claude-sonnet" },
        { providerID: "openai", id: "gpt-5.3-codex" },
      ],
    },
    backend: {
      chat: async ({ model }) => {
        dispatched.push(model)
        return "Chat response"
      },
    },
  })

  try {
    await fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "Use Codex independently" }, { signal })
    await fake.execute({ action: "chat", sessionID: "ses_second1", prompt: "Use catalog fallback" }, { signal })
    assert.deepEqual(dispatched, ["gpt-5.3-codex", "gpt-5.3-codex"])
  } finally {
    await fake.cleanup()
  }
})

test("server fails closed when no available OpenAI Codex model exists", async () => {
  const fake = await start({
    sessions: {
      ses_first1: {
        projectID: "project-a",
        directory: "/repo/a",
        model: { providerID: "openai", id: "gpt-5.4-codex" },
      },
    },
    models: {
      available: [
        { providerID: "anthropic", id: "claude-sonnet" },
        { providerID: "openai", id: "gpt-5.4", enabled: true },
        { providerID: "openai", id: "gpt-5.4-codex", enabled: false },
      ],
    },
  })

  try {
    await assert.rejects(
      fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "Must not dispatch" }, { signal }),
      /No available OpenAI Codex model is configured/,
    )
    assert.equal(fake.calls(), 0)
  } finally {
    await fake.cleanup()
  }
})

test("chat history is isolated by session, account, and project and resets on session events", async () => {
  const requests: Array<{ accountID: string; messages: Array<{ role: string; text: string }> }> = []
  const fake = await start({
    sessions: {
      ses_first1: { projectID: "project-a", directory: "/repo/a" },
      ses_second1: { projectID: "project-a", directory: "/repo/a" },
      ses_third1: { projectID: "project-a", directory: "/repo/a" },
      ses_other1: { projectID: "project-b", directory: "/repo/b" },
    },
    backend: {
      chat: async ({ credential, messages }) => {
        requests.push({ accountID: credential.accountID, messages: messages.map((message: any) => ({ ...message })) })
        return `answer-${requests.length}`
      },
    },
  })

  try {
    await fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "private session A" }, { signal })
    await fake.execute({ action: "chat", sessionID: "ses_second1", prompt: "private session B" }, { signal })
    await fake.execute({ action: "chat", sessionID: "ses_third1", prompt: "private session C" }, { signal })
    await fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "continue A" }, { signal })
    await assert.rejects(
      fake.execute({ action: "chat", sessionID: "ses_other1", prompt: "private project B" }, { signal }),
      /does not belong to the invoking project/,
    )
    assert.equal(requests.length, 4)

    assert.deepEqual(requests[0]?.messages.map((message) => message.text), ["private session A"])
    assert.deepEqual(requests[1]?.messages.map((message) => message.text), ["private session B"])
    assert.deepEqual(requests[2]?.messages.map((message) => message.text), ["private session C"])
    assert.deepEqual(requests[3]?.messages.map((message) => message.text), [
      "private session A",
      "answer-1",
      "continue A",
    ])
    assert.equal(requests[3]?.messages.some((message) => message.text.includes("session B") || message.text.includes("session C")), false)

    fake.setCredential(oauth("account-2"))
    await fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "new account" }, { signal })
    assert.deepEqual(requests[4]?.messages.map((message) => message.text), ["new account"])
    assert.equal(requests[4]?.accountID, "account-2")

    fake.events.push({ type: "session.updated", data: { sessionID: "ses_first1" } })
    await new Promise<void>((resolve) => setImmediate(resolve))
    await fake.execute({ action: "chat", sessionID: "ses_first1", prompt: "after reset" }, { signal })
    assert.deepEqual(requests[5]?.messages.map((message) => message.text), ["after reset"])
  } finally {
    await fake.cleanup()
  }
})

test("a queued chat cannot dispatch or restore history after its session is deleted", async () => {
  const firstChatStarted = deferred<void>()
  const firstChatResponse = deferred<string>()
  const queuedChatResolvedModels = deferred<void>()
  const requests: string[][] = []
  const fake = makeContext({
    sessions: {
      ses_first1: { projectID: "project-a", directory: "/repo/a" },
      ses_second1: { projectID: "project-a", directory: "/repo/a" },
    },
    backend: {
      chat: async ({ messages }) => {
        const received = messages.map((message: { text: string }) => message.text)
        requests.push(received)
        if (received.at(-1) === "synthetic-delete-A") {
          firstChatStarted.resolve()
          return firstChatResponse.promise
        }
        return `synthetic response ${requests.length}`
      },
    },
  })
  const modelList = fake.context.model.list
  let modelListCalls = 0
  fake.context.model.list = async () => {
    const result = await modelList()
    modelListCalls += 1
    if (modelListCalls === 3) queuedChatResolvedModels.resolve()
    return result
  }
  const cleanup = await setupChatGPTServer(fake.context as any, { backend: fake.backend as any })
  const execute = fake.captured.execute!
  let firstChat: Promise<unknown> | undefined
  let queuedChat: Promise<unknown> | undefined

  try {
    await execute({ action: "chat", sessionID: "ses_second1", prompt: "synthetic-unrelated-before" }, { signal })
    firstChat = execute({ action: "chat", sessionID: "ses_first1", prompt: "synthetic-delete-A" }, { signal })
    await firstChatStarted.promise
    queuedChat = execute({ action: "chat", sessionID: "ses_first1", prompt: "synthetic-delete-B" }, { signal })
    await queuedChatResolvedModels.promise
    await new Promise<void>((resolve) => setImmediate(resolve))

    fake.events.push({ type: "session.deleted", data: { sessionID: "ses_first1" } })
    await new Promise<void>((resolve) => setImmediate(resolve))
    firstChatResponse.resolve("synthetic response A")
    await firstChat
    await assert.rejects(queuedChat, /session reset/)

    await execute({ action: "chat", sessionID: "ses_first1", prompt: "synthetic-after-deletion" }, { signal })
    assert.deepEqual(requests[2], ["synthetic-after-deletion"])
    await execute({ action: "chat", sessionID: "ses_second1", prompt: "synthetic-unrelated-after" }, { signal })
    assert.deepEqual(requests[3], [
      "synthetic-unrelated-before",
      "synthetic response 1",
      "synthetic-unrelated-after",
    ])
    assert.equal(requests.some((messages) => messages.includes("synthetic-delete-B")), false)
  } finally {
    firstChatResponse.resolve("synthetic cleanup response")
    await firstChat?.catch(() => undefined)
    await queuedChat?.catch(() => undefined)
    fake.events.close()
    await cleanup()
  }
})

test("server rejects search results without verified source links", async () => {
  const fake = await start({
    backend: {
      webSearch: async () => ({ text: "unsupported", sources: [], searchPerformed: false }),
    },
  })
  try {
    await assert.rejects(
      fake.execute({ action: "web_search", sessionID: "ses_first1", query: "OpenAI" }, { signal }),
      /verified source links/,
    )
  } finally {
    await fake.cleanup()
  }
})

test("server caps verified search sources at twenty", async () => {
  const fake = await start({
    backend: {
      webSearch: async () => ({
        text: "Research summary",
        searchPerformed: true,
        sources: Array.from({ length: 25 }, (_, index) => ({
          title: `Source ${index + 1}`,
          url: `https://example.com/${index + 1}`,
        })),
      }),
    },
  })

  try {
    const result = await fake.execute({
      action: "web_search",
      sessionID: "ses_first1",
      query: "bounded sources",
    }, { signal }) as { sources?: Array<{ title: string; url: string }> }
    assert.equal(result.sources?.length, 20)
    assert.equal(new Set(result.sources?.map((source) => source.url)).size, 20)
  } finally {
    await fake.cleanup()
  }
})

test("keeps parent cancellation and timeout cleanup alive until pending chat settles", async () => {
  const backendStarted = deferred<void>()
  const backendResponse = deferred<string>()
  const scheduler = controlledTimeoutScheduler()
  let backendSignal: AbortSignal | undefined
  const fake = await start({
    scheduleRequestTimeout: scheduler.schedule,
    backend: {
      chat: async ({ signal }) => {
        backendSignal = signal
        backendStarted.resolve()
        return backendResponse.promise
      },
    },
  })
  const parent = new AbortController()
  const execution = fake.execute({
    action: "chat",
    sessionID: "ses_first1",
    prompt: "Cancel while this fake response is pending.",
  }, { signal: parent.signal })

  try {
    await backendStarted.promise
    assert.equal(scheduler.scheduled[0]?.timeoutMs, 45_000)
    assert.equal(scheduler.scheduled[0]?.active, true)

    parent.abort(new Error("parent cancelled"))
    assert.equal(backendSignal?.aborted, true)
    assert.equal(scheduler.scheduled[0]?.cancelCalls, 0)

    backendResponse.resolve("Fake response after cancellation.")
    await assert.rejects(execution, /cancelled/)
    assert.equal(scheduler.scheduled[0]?.active, false)
    assert.equal(scheduler.scheduled[0]?.cancelCalls, 1)
  } finally {
    backendResponse.resolve("Test cleanup response.")
    parent.abort()
    await execution.catch(() => undefined)
    await fake.cleanup()
  }
})

test("keeps the synthetic request timeout armed until pending chat observes it", async () => {
  const backendStarted = deferred<void>()
  const backendResult = deferred<string>()
  const scheduler = controlledTimeoutScheduler()
  let backendSignal: AbortSignal | undefined
  const fake = await start({
    scheduleRequestTimeout: scheduler.schedule,
    backend: {
      chat: async ({ signal }) => {
        backendSignal = signal
        signal.addEventListener("abort", () => backendResult.reject(new Error("fake backend cancelled")), { once: true })
        backendStarted.resolve()
        return backendResult.promise
      },
    },
  })
  const execution = fake.execute({
    action: "chat",
    sessionID: "ses_first1",
    prompt: "Wait for the injected timeout.",
  }, { signal })

  try {
    await backendStarted.promise
    assert.equal(scheduler.scheduled[0]?.timeoutMs, 45_000)
    assert.equal(scheduler.scheduled[0]?.active, true)

    scheduler.fire()
    assert.equal(backendSignal?.aborted, true)
    await assert.rejects(execution, /fake backend cancelled/)
    assert.equal(scheduler.scheduled[0]?.active, false)
    assert.equal(scheduler.scheduled[0]?.cancelCalls, 1)
  } finally {
    backendResult.resolve("Test cleanup response.")
    await execution.catch(() => undefined)
    await fake.cleanup()
  }
})

test("in-process tools are default-off and require native permission support when selected", async () => {
  const disabled = makeContext()
  let transformed = false
  const cleanup = await setupChatGPTServer({
    ...disabled.context,
    options: {},
    tool: { transform: async () => { transformed = true; throw new Error("must not register") } },
  } as any, { backend: disabled.backend as any })
  try {
    assert.equal(transformed, false)
    assert.equal(disabled.calls(), 0)
  } finally {
    disabled.events.close()
    await cleanup()
  }

  const unsupported = makeContext()
  await assert.rejects(setupChatGPTServer({
    ...unsupported.context, options: { inProcessTools: true }, permission: {},
  } as any, { backend: unsupported.backend as any }), /permission assertion support/)
  assert.equal(unsupported.captured.execute, undefined)
  assert.equal(unsupported.calls(), 0)
})

test("image generation has a bounded three-minute timeout without changing chat deadlines", async () => {
  const scheduler = controlledTimeoutScheduler()
  const fake = await start({ scheduleRequestTimeout: scheduler.schedule })
  try {
    await fake.execute({ action: "generate_image", sessionID: "ses_first1", prompt: "A red pixel" }, { signal })
    assert.equal(scheduler.scheduled[0]?.timeoutMs, 180_000)
    assert.equal(scheduler.scheduled[0]?.active, false)
  } finally {
    await fake.cleanup()
  }
})

test("opted-in in-process tools register, check invocation context, and dispose with the plugin", async () => {
  const fake = makeContext()
  const tools: ReturnType<typeof createInProcessTools> = []
  const permissions: unknown[] = []
  let namespace: unknown
  let disposed = false
  let credentialReads = 0
  const context = {
    ...fake.context,
    options: { inProcessTools: true },
    permission: { assert: async (input: unknown) => { permissions.push(input) } },
    integration: {
      ...fake.context.integration,
      connection: {
        ...fake.context.integration.connection,
        resolve: async () => { credentialReads++; return oauth() },
      },
    },
    tool: {
      transform: async (callback: (editor: unknown) => void) => {
        callback({ get: () => undefined, namespace: (value: unknown) => { namespace = value }, add: (value: typeof tools[number]) => tools.push(value) })
        return { dispose: async () => { disposed = true } }
      },
    },
  }
  const cleanup = await setupChatGPTServer(context as any, { backend: fake.backend as any })
  try {
    assert.deepEqual(namespace, { name: "chatgpt_direct", description: "Direct in-process ChatGPT connector tools" })
    assert.deepEqual(tools.map((tool) => tool.name), ["web_search", "chat"])
    assert.equal(fake.captured.execute, undefined)
    assert.equal(credentialReads, 0)
    const chat = tools.find((tool) => tool.name === "chat")!
    const call = { sessionID: "ses_first1", agent: "build", messageID: "msg_test1", id: "call_test1", signal }
    assert.deepEqual(await chat.execute({ prompt: " " }, call), { content: "ChatGPT tool arguments are invalid." })
    assert.equal(credentialReads, 0)
    assert.equal(fake.calls(), 0)
    assert.equal(permissions.length, 0)
    assert.deepEqual(await chat.execute({ prompt: "fake request" }, call), { content: "Chat response" })
    assert.equal(credentialReads, 1)
    assert.equal(fake.calls(), 1)
    assert.equal(permissions.length, 1)

    await assert.rejects(chat.execute({ prompt: "wrong project" }, { ...call, sessionID: "ses_other1" }), /invoking project/)
    assert.equal(credentialReads, 1)
    assert.equal(fake.calls(), 1)
  } finally {
    fake.events.close()
    await cleanup()
  }
  assert.equal(disposed, true)
  const snapshot = tools.find((tool) => tool.name === "chat")!
  await assert.rejects(snapshot.execute({ prompt: "after unload" }, {
    sessionID: "ses_first1", agent: "build", messageID: "msg_test1", id: "call_test1", signal,
  }), /unavailable/)
  assert.equal(permissions.length, 1)
  assert.equal(fake.calls(), 1)
})

test("in-process name collisions do not register an RPC or replace another tool", async () => {
  const fake = makeContext()
  let rpcRegistrations = 0
  let added = 0
  const context = {
    ...fake.context,
    options: { inProcessTools: true },
    permission: { assert: async () => undefined },
    rpc: { register: async () => { rpcRegistrations++; return { dispose: async () => undefined } } },
    tool: {
      transform: async (callback: (editor: unknown) => void) => {
        callback({ get: () => ({ id: "chatgpt_direct_chat" }), namespace: () => undefined, add: () => { added++ } })
        return { dispose: async () => undefined }
      },
    },
  }
  await assert.rejects(setupChatGPTServer(context as any, { backend: fake.backend as any }), /already registered/)
  assert.equal(rpcRegistrations, 0)
  assert.equal(added, 0)
  assert.equal(fake.calls(), 0)
})

test("cancellation while fake credentials resolve does not dispatch a backend request", async () => {
  const fake = makeContext()
  const entered = deferred<void>()
  const credential = deferred<unknown>()
  const context = {
    ...fake.context,
    integration: {
      ...fake.context.integration,
      connection: {
        ...fake.context.integration.connection,
        resolve: async () => { entered.resolve(); return credential.promise },
      },
    },
  }
  const cleanup = await setupChatGPTServer(context as any, { backend: fake.backend as any })
  const controller = new AbortController()
  const pending = fake.captured.execute!({ action: "chat", sessionID: "ses_first1", prompt: "test" }, { signal: controller.signal })
  try {
    await entered.promise
    controller.abort()
    credential.resolve(oauth())
    await assert.rejects(pending, /cancelled/)
    assert.equal(fake.calls(), 0)
  } finally {
    credential.resolve(oauth())
    await pending.catch(() => undefined)
    fake.events.close()
    await cleanup()
  }
})

test("unloading aborts an in-flight fake request and suppresses its late result", async () => {
  const entered = deferred<void>()
  const response = deferred<string>()
  let backendSignal: AbortSignal | undefined
  const fake = makeContext({
    backend: { chat: async (input) => { backendSignal = input.signal; entered.resolve(); return response.promise } },
  })
  const cleanup = await setupChatGPTServer(fake.context as any, { backend: fake.backend as any })
  const pending = fake.captured.execute!({ action: "chat", sessionID: "ses_first1", prompt: "test" }, { signal })
  try {
    await entered.promise
    fake.events.close()
    await cleanup()
    assert.equal(backendSignal?.aborted, true)
    response.resolve("late fake response")
    await assert.rejects(pending, /unavailable/)
    assert.equal(fake.calls(), 1)
  } finally {
    response.resolve("cleanup")
    await pending.catch(() => undefined)
  }
})
