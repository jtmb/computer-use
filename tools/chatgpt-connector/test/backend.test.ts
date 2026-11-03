import assert from "node:assert/strict"
import test from "node:test"

import {
  IMAGE_ENDPOINT,
  RESPONSES_ENDPOINT,
  SEARCH_ENDPOINT,
  createChatGPTBackend,
  ChatGPTRequestError,
  type CodexCredential,
} from "../src/backend.ts"

const credential: CodexCredential = { accessToken: "oauth-test-token", accountID: "account-1" }

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

test("image generation uses the Codex OAuth route and fixed GPT image request", async () => {
  let calledURL = ""
  let request: RequestInit | undefined
  const backend = createChatGPTBackend(async (input, init) => {
    calledURL = String(input)
    request = init
    return response({ data: [{ b64_json: "aGVsbG8=" }] })
  })

  const image = await backend.generateImage({
    credential,
    prompt: "A watercolor lighthouse",
    signal: new AbortController().signal,
  })

  assert.equal(calledURL, IMAGE_ENDPOINT)
  assert.equal(image, "aGVsbG8=")
  assert.equal(request?.method, "POST")
  assert.equal(request?.redirect, "error")
  assert.deepEqual(JSON.parse(String(request?.body)), {
    prompt: "A watercolor lighthouse",
    model: "gpt-image-2",
    background: "auto",
    quality: "auto",
    size: "auto",
  })
  const headers = new Headers(request?.headers)
  assert.equal(headers.get("authorization"), "Bearer oauth-test-token")
  assert.equal(headers.get("chatgpt-account-id"), "account-1")
})

test("image HTTP failures retain only status and allowlisted codes, never provider messages", async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const backend = createChatGPTBackend(async () => response({
      detail: "private token and prompt",
      error: { code: "model_not_found", message: "private token and prompt" },
    }, status))
    await assert.rejects(backend.generateImage({ credential, prompt: "test", signal: new AbortController().signal }), (error) => {
      assert.ok(error instanceof ChatGPTRequestError)
      assert.equal(error.status, status)
      assert.equal(error.code, "model_not_found")
      assert.doesNotMatch(error.message, /private token|prompt/)
      return true
    })
  }
})

test("image HTTP error streams are bounded before parsing", async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(8192)) },
    cancel() { cancelled = true },
  })
  const backend = createChatGPTBackend(async () => new Response(stream, { status: 400 }))
  await assert.rejects(backend.generateImage({ credential, prompt: "test", signal: new AbortController().signal }), /HTTP 400/)
  assert.equal(cancelled, true)
})

test("HTTP error byte acquisition never delivers a chunk past its 4096-byte ceiling", async () => {
  let delivered = 0
  let remaining = 4097
  const stream = new ReadableStream({
    type: "bytes",
    pull(controller) {
      const request = controller.byobRequest
      if (!request) {
        controller.enqueue(new Uint8Array(remaining))
        delivered += remaining
        remaining = 0
      } else {
        const size = Math.min(request.view!.byteLength, remaining)
        new Uint8Array(request.view!.buffer, request.view!.byteOffset, size).fill(32)
        request.respond(size)
        delivered += size
        remaining -= size
      }
      if (remaining === 0) controller.close()
    },
  })
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 50)
  try {
    const backend = createChatGPTBackend(async () => new Response(stream, { status: 400 }))
    await assert.rejects(backend.generateImage({ credential, prompt: "synthetic", signal: abort.signal }), /HTTP 400/)
    assert.ok(delivered <= 4096, `response delivered ${delivered} bytes before refusal`)
  } finally { clearTimeout(timer) }
})

test("research uses at most three official search queries and returns only usable sources", async () => {
  let calledURL = ""
  let request: RequestInit | undefined
  const backend = createChatGPTBackend(async (input, init) => {
    calledURL = String(input)
    request = init
    return response({
      output: "Use the official references below.",
      results: [
        { type: "text_result", title: "OpenAI Docs", url: "https://openai.com/docs" },
        { type: "text_result", title: "Unsafe URL", url: "javascript:alert(1)" },
      ],
    })
  })

  const result = await backend.webSearch({
    credential,
    model: "gpt-5.4-codex",
    sessionID: "ses_research1",
    query: "Codex responses endpoint",
    mode: "research",
    signal: new AbortController().signal,
  })

  assert.equal(calledURL, SEARCH_ENDPOINT)
  assert.equal(result.searchPerformed, true)
  assert.deepEqual(result.sources, [{ title: "OpenAI Docs", url: "https://openai.com/docs" }])
  const body = JSON.parse(String(request?.body)) as Record<string, any>
  assert.equal(body.id, "ses_research1")
  assert.equal(body.model, "gpt-5.4-codex")
  assert.equal(body.commands.response_length, "long")
  assert.equal(body.commands.search_query.length, 3)
  assert.equal(body.commands.search_query[0].q, "Codex responses endpoint")
  assert.equal(body.settings.search_context_size, "high")
  assert.equal(body.settings.external_web_access, true)
})

test("search returns no more than twenty verified sources", async () => {
  const backend = createChatGPTBackend(async () => response({
    output: "Research summary",
    results: Array.from({ length: 25 }, (_, index) => ({
      title: `Source ${index + 1}`,
      url: `https://example.com/${index + 1}`,
    })),
  }))

  const result = await backend.webSearch({
    credential,
    model: "gpt-5.4-codex",
    sessionID: "ses_many1",
    query: "bounded sources",
    mode: "research",
    signal: new AbortController().signal,
  })

  assert.equal(result.sources?.length, 20)
  assert.equal(new Set(result.sources?.map((source) => source.url)).size, 20)
})

test("search fails closed when the Codex response has no usable source links", async () => {
  const backend = createChatGPTBackend(async () => response({
    output: "A search summary without structured sources.",
    results: [{ title: "Unusable", url: "javascript:void(0)" }],
  }))

  await assert.rejects(
    backend.webSearch({
      credential,
      model: "gpt-5.4-codex",
      sessionID: "ses_quick1",
      query: "OpenAI",
      mode: "quick",
      signal: new AbortController().signal,
    }),
    /no usable source links/,
  )
})

test("plain chat streams Codex Responses text without tools or stored history", async () => {
  let calledURL = ""
  let request: RequestInit | undefined
  const backend = createChatGPTBackend(async (input, init) => {
    calledURL = String(input)
    request = init
    return new Response([
      'data: {"type":"response.created","response":{"id":"resp-1"}}',
      'data: {"type":"response.output_text.delta","delta":"Hello"}',
      'data: {"type":"response.output_text.delta","delta":" there."}',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Hello there."}]}]}}',
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  })

  const text = await backend.chat({
    credential,
    model: "gpt-5.4-codex",
    messages: [
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Hello." },
      { role: "user", text: "Continue" },
    ],
    signal: new AbortController().signal,
  })

  assert.equal(calledURL, RESPONSES_ENDPOINT)
  assert.equal(text, "Hello there.")
  assert.equal(request?.method, "POST")
  const headers = new Headers(request?.headers)
  assert.equal(headers.get("accept"), "text/event-stream")
  const body = JSON.parse(String(request?.body)) as Record<string, any>
  assert.equal(body.model, "gpt-5.4-codex")
  assert.equal(body.store, false)
  assert.equal(body.stream, true)
  assert.equal(body.max_output_tokens, 4096)
  assert.equal("tools" in body, false)
  assert.deepEqual(body.input.map((item: any) => item.role), ["user", "assistant", "user"])
  assert.deepEqual(body.input[0].content, [{ type: "input_text", text: "Hi" }])
  assert.deepEqual(body.input[1].content, [{ type: "output_text", text: "Hello." }])
})

test("network failures stay sanitized without exposing the underlying error", async () => {
  const backend = createChatGPTBackend(async () => { throw new Error("private credential detail") })
  await assert.rejects(backend.generateImage({ credential, prompt: "synthetic", signal: new AbortController().signal }), {
    message: "Unable to reach ChatGPT.",
  })
})

for (const operation of ["generateImage", "listModels"] as const) {
  test(`${operation} refuses pre-abort before fetch and cancels a late response after abort`, async () => {
    let calls = 0
    let finish!: (value: Response) => void
    let enter!: () => void
    const started = new Promise<void>(resolve => { enter = resolve })
    const response = new Promise<Response>(resolve => { finish = resolve })
    const backend = createChatGPTBackend(async () => { calls++; enter(); return response })
    const abort = new AbortController()
    abort.abort()
    await assert.rejects(backend[operation]!({ credential, prompt: "synthetic", signal: abort.signal }))
    assert.equal(calls, 0)
    const active = new AbortController()
    const pending = backend[operation]!({ credential, prompt: "synthetic", signal: active.signal })
    await started
    active.abort()
    await assert.rejects(pending)
    let cancelled = 0
    finish(new Response(new ReadableStream({ type: "bytes", cancel() { cancelled++ } })))
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(cancelled, 1)
    assert.equal(calls, 1)
  })
}

test("model-discovery HTTP failures cancel their body without waiting for a stuck cleanup", async () => {
  let cancelled = 0
  const backend = createChatGPTBackend(async () => new Response(new ReadableStream({
    type: "bytes",
    cancel() { cancelled++; return new Promise<void>(() => {}) },
  }), { status: 403 }))
  assert.deepEqual(await backend.listModels!({ credential, signal: new AbortController().signal }), [])
  assert.equal(cancelled, 1)
})

test("model discovery reads a bounded success body and retains slug filtering", async () => {
  const backend = createChatGPTBackend(async () => response({ models: [
    { slug: "model-1" }, { id: "model-2" }, { slug: "model-1" }, { slug: "unsafe/model" },
  ] }))
  assert.deepEqual(await backend.listModels!({ credential, signal: new AbortController().signal }), ["model-1", "model-2"])
})

for (const operation of ["generateImage", "webSearch", "chat", "listModels"] as const) {
  test(`${operation} forwards cancellation into a stalled successful response body`, async () => {
    let enter!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve })
    let cancelled = 0
    const stream = new ReadableStream({ type: "bytes", pull() { enter() }, cancel() { cancelled++ } })
    const backend = createChatGPTBackend(async () => new Response(stream))
    const abort = new AbortController()
    const pending = backend[operation]!({ credential, prompt: "synthetic", query: "synthetic", model: "synthetic",
      sessionID: "ses_synthetic", mode: "quick", messages: [{ role: "user", text: "synthetic" }], signal: abort.signal })
    await entered
    abort.abort()
    await assert.rejects(pending)
    assert.equal(cancelled, 1)
    assert.equal(stream.locked, false)
  })

  test(`${operation} keeps its existing JSON or stream ceiling before body acquisition`, async () => {
    let pulls = 0
    let cancelled = 0
    const stream = new ReadableStream({ type: "bytes", pull() { pulls++ }, cancel() { cancelled++ } })
    const limit = (operation === "chat" ? 2 : 16) * 1024 * 1024
    const backend = createChatGPTBackend(async () => new Response(stream, { headers: { "content-length": String(limit + 1) } }))
    await assert.rejects(backend[operation]!({ credential, prompt: "synthetic", query: "synthetic", model: "synthetic",
      sessionID: "ses_synthetic", mode: "quick", messages: [{ role: "user", text: "synthetic" }], signal: new AbortController().signal }))
    assert.equal(pulls, 0)
    assert.equal(cancelled, 1)
  })
}
