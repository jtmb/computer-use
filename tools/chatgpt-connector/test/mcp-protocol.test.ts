import assert from "node:assert/strict"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import test from "node:test"

import { createAuthenticatedRpcTransport, createChatgptServer } from "../src/mcp.ts"

test("completes an in-memory MCP handshake and forwards the documented OpenCode session metadata", async () => {
  const calls: unknown[] = []
  const server = createChatgptServer({
    async sessionDirectory(sessionID) {
      assert.equal(sessionID, "opaque-session-value")
      return "/workspace/verified-project"
    },
    async callRpc(input, directory) {
      calls.push({ input, directory })
      return { text: "fake backend response" }
    },
  })
  const client = new Client({ name: "connector-test", version: "1.0.0" }, { capabilities: {} })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const listed = await client.listTools()
    assert.deepEqual(listed.tools.map((tool) => tool.name), ["generate_image", "web_search", "chat"])

    const result = await client.callTool({
      name: "chat",
      arguments: { prompt: "Use only the fake backend." },
      _meta: { "ai.opencode/sessionID": "opaque-session-value" },
    })
    assert.equal(result.isError, undefined)
    assert.deepEqual(result.content, [{ type: "text", text: "fake backend response" }])
    assert.deepEqual(calls, [{
      input: {
        action: "chat",
        prompt: "Use only the fake backend.",
        sessionID: "opaque-session-value",
      },
      directory: "/workspace/verified-project",
    }])
  } finally {
    await client.close()
    await server.close()
  }
})

test("SDK request cancellation reaches the concrete tool handler's backend signal", async () => {
  let entered!: () => void
  let release!: () => void
  let backendSignal: AbortSignal | undefined
  const started = new Promise<void>(resolve => { entered = resolve })
  const pendingBackend = new Promise<void>(resolve => { release = resolve })
  const server = createChatgptServer({
    async sessionDirectory() { return "/workspace/verified-project" },
    async callRpc(_input, _directory, signal) {
      backendSignal = signal
      entered()
      await pendingBackend
      return { text: "synthetic response" }
    },
  })
  const client = new Client({ name: "cancellation-test", version: "1.0.0" }, { capabilities: {} })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const abort = new AbortController()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const pending = client.callTool({ name: "chat", arguments: { prompt: "synthetic" },
      _meta: { "ai.opencode/sessionID": "opaque-session-value" } }, undefined, { signal: abort.signal })
    await started
    abort.abort()
    await assert.rejects(pending)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(backendSignal instanceof AbortSignal, "SDK cancellation signal must reach the handler")
    assert.equal(backendSignal.aborted, true)
  } finally {
    release()
    await client.close()
    await server.close()
  }
})

test("actual SDK cancellation traverses the authenticated transport and cancels its RPC body reader", async () => {
  let enter!: () => void
  let cleaned!: () => void
  const started = new Promise<void>(resolve => { enter = resolve })
  const cancelled = new Promise<void>(resolve => { cleaned = resolve })
  let calls = 0
  let requestSignal: AbortSignal | undefined
  const stream = new ReadableStream({ type: "bytes", pull() { enter() }, cancel() { cleaned() } })
  const server = createChatgptServer(createAuthenticatedRpcTransport({
    async discoverConnection() { return { url: "http://127.0.0.1:12345", headers: { authorization: "Bearer synthetic" } } },
    async fetch(_url, init) {
      calls++
      if (calls === 1) return Response.json({ data: { id: "opaque-session-value", location: { directory: "/workspace/verified-project" } } })
      requestSignal = init!.signal!
      return new Response(stream)
    },
  }))
  const client = new Client({ name: "transport-cancellation-test", version: "1.0.0" }, { capabilities: {} })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const abort = new AbortController()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const pending = client.callTool({ name: "chat", arguments: { prompt: "synthetic" },
      _meta: { "ai.opencode/sessionID": "opaque-session-value" } }, undefined, { signal: abort.signal })
    await started
    abort.abort()
    await assert.rejects(pending)
    await cancelled
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(requestSignal!.aborted, true)
    assert.equal(stream.locked, false)
    assert.equal(calls, 2)
  } finally {
    await client.close()
    await server.close()
  }
})
