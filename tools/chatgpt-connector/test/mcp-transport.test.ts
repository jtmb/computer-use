import assert from "node:assert/strict"
import test from "node:test"

import { createAuthenticatedRpcTransport, createCallToolHandler } from "../src/mcp.ts"

const sessionID = "opaque-session-value"
const directory = "/workspace/verified-project"
const connection = { url: "http://127.0.0.1:12345", headers: { authorization: "Bearer synthetic-local-only" } }
const input = { action: "chat" as const, sessionID, prompt: "synthetic" }
const request = { params: { name: "chat", arguments: { prompt: "synthetic" }, _meta: { "ai.opencode/sessionID": sessionID } } }
const session = () => Response.json({ data: { id: sessionID, location: { directory } } })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test("concrete authenticated transport retains local paths, headers, redirect guard and validated output", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = []
  let discoveries = 0
  const transport = createAuthenticatedRpcTransport({
    async discoverConnection() { discoveries++; return connection },
    async fetch(url, init) {
      calls.push({ url: new URL(String(url)), init: init! })
      return calls.length === 1 ? session() : Response.json({ output: { text: "completed" } })
    },
  })
  const caller = new AbortController()
  const result = await createCallToolHandler(transport)(request, caller.signal)
  assert.equal(result.isError, undefined)
  assert.deepEqual(result.content, [{ type: "text", text: "completed" }])
  assert.equal(discoveries, 1)
  assert.deepEqual(calls.map(call => call.url.pathname), [`/api/session/${sessionID}`, "/api/rpc/chatgpt/execute"])
  assert.equal(calls[1].url.searchParams.get("location[directory]"), directory)
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { input })
  for (const call of calls) {
    assert.equal(call.url.origin, connection.url)
    assert.equal(call.init.redirect, "error")
    assert.equal(new Headers(call.init.headers).get("authorization"), connection.headers.authorization)
    assert.ok(call.init.signal instanceof AbortSignal)
    assert.notEqual(call.init.signal, caller.signal)
  }
  caller.abort()
  assert.ok(calls.every(call => call.init.signal!.aborted))
})

test("pre-abort performs neither discovery nor fetch", async () => {
  let calls = 0
  const transport = createAuthenticatedRpcTransport({
    async discoverConnection() { calls++; return connection },
    async fetch() { calls++; return session() },
  })
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(transport.sessionDirectory(sessionID, abort.signal))
  await assert.rejects(transport.callRpc(input, directory, abort.signal))
  assert.equal(calls, 0)
})

test("abort during discovery returns promptly and late discovery dispatches no request", async () => {
  const discovery = deferred<typeof connection>()
  let calls = 0
  const transport = createAuthenticatedRpcTransport({
    discoverConnection: () => discovery.promise,
    async fetch() { calls++; return session() },
  })
  const abort = new AbortController()
  const pending = createCallToolHandler(transport)(request, abort.signal)
  abort.abort()
  assert.equal((await pending).isError, true)
  discovery.resolve(connection)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(calls, 0)
})

test("abort during fetch cancels a late response without reading it or sending RPC", async () => {
  const started = deferred<void>()
  const response = deferred<Response>()
  let cancellations = 0
  let pulls = 0
  let calls = 0
  let capturedSignal: AbortSignal | undefined
  const stream = new ReadableStream({
    type: "bytes",
    pull(controller) { pulls++; controller.enqueue(new Uint8Array([65])) },
    cancel() { cancellations++ },
  })
  const transport = createAuthenticatedRpcTransport({
    async discoverConnection() { return connection },
    async fetch(_url, init) { calls++; capturedSignal = init!.signal!; started.resolve(); return response.promise },
  })
  const abort = new AbortController()
  const pending = createCallToolHandler(transport)(request, abort.signal)
  await started.promise
  abort.abort()
  assert.equal((await pending).isError, true)
  assert.equal(capturedSignal!.aborted, true)
  response.resolve(new Response(stream))
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(calls, 1)
  assert.equal(pulls, 0)
  assert.equal(cancellations, 1)
})

for (const stage of ["session", "rpc"] as const) {
  test(`abort during ${stage} body reading cancels the reader and sends no subsequent request`, async () => {
    const started = deferred<void>()
    let cancelled = 0
    let calls = 0
    const stream = new ReadableStream({ type: "bytes", pull() { started.resolve() }, cancel() { cancelled++ } })
    const transport = createAuthenticatedRpcTransport({
      async discoverConnection() { return connection },
      async fetch() { calls++; return stage === "rpc" && calls === 1 ? session() : new Response(stream) },
    })
    const abort = new AbortController()
    const pending = createCallToolHandler(transport)(request, abort.signal)
    await started.promise
    abort.abort()
    assert.equal((await pending).isError, true)
    assert.equal(cancelled, 1)
    assert.equal(stream.locked, false)
    assert.equal(calls, stage === "session" ? 1 : 2)
  })
}

test("session and RPC keep their fixed timeouts, including discovery and stalled body reads", async t => {
  const deadlines: Array<{ milliseconds: number; abort: AbortController }> = []
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    const abort = new AbortController()
    deadlines.push({ milliseconds, abort })
    return abort.signal
  })
  const discovery = deferred<typeof connection>()
  let calls = 0
  const started = deferred<void>()
  const stream = new ReadableStream({ type: "bytes", pull() { started.resolve() } })
  const transport = createAuthenticatedRpcTransport({
    discoverConnection: () => discovery.promise,
    async fetch() { calls++; return new Response(stream) },
  })
  const sessionPending = transport.sessionDirectory(sessionID)
  assert.equal(deadlines[0].milliseconds, 10_000)
  deadlines[0].abort.abort()
  await assert.rejects(sessionPending)
  assert.equal(calls, 0)
  discovery.resolve(connection)
  const rpcPending = transport.callRpc(input, directory, new AbortController().signal)
  await started.promise
  assert.equal(deadlines[1].milliseconds, 120_000)
  deadlines[1].abort.abort()
  await assert.rejects(rpcPending)
  assert.equal(stream.locked, false)
})

test("nonlocal, credential-in-URL and unauthenticated discovery are refused before fetch", async () => {
  for (const endpoint of [
    { ...connection, url: "https://example.com" },
    { ...connection, url: "http://user:secret@127.0.0.1:12345" },
    { ...connection, url: "http://127.0.0.1:12345/elsewhere" },
    { ...connection, headers: {} },
    undefined,
  ]) {
    let calls = 0
    const transport = createAuthenticatedRpcTransport({
      async discoverConnection() { return endpoint },
      async fetch() { calls++; return session() },
    })
    await assert.rejects(transport.sessionDirectory(sessionID))
    assert.equal(calls, 0)
  }
})

test("invalid session identity prevents RPC dispatch", async () => {
  let calls = 0
  const transport = createAuthenticatedRpcTransport({
    async discoverConnection() { return connection },
    async fetch() { calls++; return Response.json({ data: { id: "another-session", location: { directory } } }) },
  })
  assert.equal((await createCallToolHandler(transport)(request)).isError, true)
  assert.equal(calls, 1)
})

test("HTTP failure cleanup cannot hold a request open indefinitely", async () => {
  let cancelled = 0
  const transport = createAuthenticatedRpcTransport({
    async discoverConnection() { return connection },
    async fetch() { return new Response(new ReadableStream({
      type: "bytes", cancel() { cancelled++; return new Promise<void>(() => {}) },
    }), { status: 403 }) },
  })
  await assert.rejects(transport.sessionDirectory(sessionID), /could not be retrieved/)
  await assert.rejects(transport.callRpc(input, directory), /RPC request failed/)
  assert.equal(cancelled, 2)
})

for (const operation of ["sessionDirectory", "callRpc"] as const) {
  test(`${operation} keeps its existing response ceiling before acquisition`, async () => {
    let pulls = 0
    let cancellations = 0
    const stream = new ReadableStream({ type: "bytes", pull() { pulls++ }, cancel() { cancellations++ } })
    const limit = operation === "sessionDirectory" ? 256 * 1024 : 24 * 1024 * 1024
    const transport = createAuthenticatedRpcTransport({
      async discoverConnection() { return connection },
      async fetch() { return new Response(stream, { headers: { "content-length": String(limit + 1) } }) },
    })
    const pending = operation === "sessionDirectory" ? transport.sessionDirectory(sessionID) : transport.callRpc(input, directory)
    await assert.rejects(pending, /byte-limit/)
    assert.equal(pulls, 0)
    assert.equal(cancellations, 1)
  })
}

test("a late injected RPC result after abort cannot save an image", async () => {
  const started = deferred<void>()
  const output = deferred<unknown>()
  let saves = 0
  const handler = createCallToolHandler({
    async sessionDirectory() { return directory },
    async callRpc() { started.resolve(); return output.promise },
    async saveImage() { saves++; throw new Error("save should never be called") },
  })
  const abort = new AbortController()
  const pending = handler({ params: { ...request.params, name: "generate_image" } }, abort.signal)
  await started.promise
  abort.abort()
  output.resolve({ text: "late", imageBase64: "aGVsbG8=" })
  assert.equal((await pending).isError, true)
  assert.equal(saves, 0)
})
