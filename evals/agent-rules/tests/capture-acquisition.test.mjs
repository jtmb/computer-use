import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { CAPTURE_BYTE_LIMIT, CAPTURE_DURATION_MS, createCaptureAcquisition } from "../src/capture-acquisition.mjs"

function bytesResponse(text) {
  const source = new TextEncoder().encode(text)
  const requests = []
  let offset = 0
  let acquired = 0
  let cancelled = false
  const body = new ReadableStream({
    type: "bytes",
    pull(controller) {
      const view = controller.byobRequest.view
      requests.push(view.byteLength)
      const length = Math.min(view.byteLength, source.length - offset)
      view.set(source.subarray(offset, offset + length))
      offset += length
      acquired += length
      if (length) controller.byobRequest.respond(length)
      if (offset === source.length) {
        controller.close()
        if (!length) controller.byobRequest.respond(0)
      }
    },
    cancel() { cancelled = true },
  })
  return { response: new Response(body, { headers: { "x-fixture": "synthetic" } }), requests,
    get acquired() { return acquired }, get cancelled() { return cancelled } }
}

test("capture acquisition preserves sub-cap response bytes and headers without persisting payloads", async t => {
  const budget = createCaptureAcquisition({ byteLimit: 20 })
  t.after(() => budget.close())
  const fixture = bytesResponse("synthetic")
  const response = budget.wrapResponse(fixture.response)
  assert.equal(response.headers.get("x-fixture"), "synthetic")
  assert.equal(await response.text(), "synthetic")
  assert.equal(budget.bytes, 9)
  assert.equal(budget.failure, null)
})

test("oversized byte stream never acquires more than its remaining allowance", async t => {
  const budget = createCaptureAcquisition({ byteLimit: 4 })
  t.after(() => budget.close())
  const fixture = bytesResponse("untrusted-marker")
  let refusal
  try { await budget.wrapResponse(fixture.response).text() } catch (error) { refusal = error }
  assert.equal(fixture.acquired, 4, "the underlying reader must not acquire a fifth byte")
  assert.equal(refusal?.code, "byte-limit")
  assert.deepEqual(fixture.requests, [4])
  assert.equal(budget.bytes, 4)
  assert.equal(fixture.cancelled, true)
})

test("the earlier after-read transform demonstrates why rejection alone is not a pre-read bound", async () => {
  let acquired = 0
  let counted = 0
  const body = new ReadableStream({
    pull(controller) {
      const chunk = new Uint8Array(16)
      acquired += chunk.byteLength
      controller.enqueue(chunk)
      controller.close()
    },
  })
  const boundedAfterRead = body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      counted += chunk.byteLength
      if (counted > 4) throw Error("acquisition cap")
      controller.enqueue(chunk)
    },
  }))
  await assert.rejects(new Response(boundedAfterRead).text(), /acquisition cap/)
  assert.equal(acquired, 16, "the old transform detects excess only after receiving the whole chunk")
})

test("future fixture capture uses the shared pre-read helper and keeps the original envelope", async () => {
  const source = await readFile(new URL("../../../.acceptance-fixtures/memory-model-KZru3M/capture.mjs", import.meta.url), "utf8")
  assert.ok(source.includes("return acquisition.wrapResponse(response)"))
  assert.ok(source.includes("acquisition.close()"))
  assert.ok(source.includes("bytes: acquisition.bytes, byteLimit: 2097152"))
  assert.ok(source.includes("recordLimit: 2048, durationLimitMs: 120000"))
  assert.equal(source.includes("pipeThrough(new TransformStream"), false)
})

test("concurrent response bodies share pre-read accounting rather than each spending the full cap", async t => {
  const budget = createCaptureAcquisition({ byteLimit: 7 })
  t.after(() => budget.close())
  const first = bytesResponse("abcd")
  const second = bytesResponse("efghij")
  const results = await Promise.allSettled([
    budget.wrapResponse(first.response).text(), budget.wrapResponse(second.response).text(),
  ])
  assert.ok(results.some(result => result.status === "rejected"))
  assert.equal(first.acquired + second.acquired, 7)
  assert.equal(budget.bytes, 7)
  assert.deepEqual(first.requests, [7])
  assert.deepEqual(second.requests, [3])
})

test("a stream without a BYOB reader refuses without falling back to an unbounded default read", t => {
  const budget = createCaptureAcquisition()
  t.after(() => budget.close())
  let calls = 0
  const response = { body: { getReader(options) { calls++; assert.equal(options.mode, "byob"); throw Error("untrusted-marker") } } }
  assert.throws(() => budget.wrapResponse(response), { code: "byte-reader-unavailable" })
  assert.equal(calls, 1)
  assert.equal(budget.bytes, 0)
})

test("shared deadline is checked after EOF and refuses an otherwise successful late read", async t => {
  let clock = 0
  const budget = createCaptureAcquisition({ durationMs: 1000, now: () => clock })
  t.after(() => budget.close())
  const reader = { async read() { clock = 1001; return { done: true } }, async cancel() {} }
  const response = { body: { getReader() { return reader } }, status: 200, headers: {} }
  await assert.rejects(budget.wrapResponse(response).text(), { code: "deadline" })
})

test("external cancellation bounds a stuck reader and prevents later acquisitions", async t => {
  const abort = new AbortController()
  const budget = createCaptureAcquisition({ signal: abort.signal })
  t.after(() => budget.close())
  let entered
  const ready = new Promise(resolve => { entered = resolve })
  const response = { status: 200, headers: {}, body: { getReader() { return {
    read() { entered(); return new Promise(() => {}) }, async cancel() {},
  } } } }
  const reading = budget.wrapResponse(response).text()
  await ready
  abort.abort()
  await assert.rejects(reading, { code: "aborted" })
  assert.throws(() => budget.wrapResponse(new Response("later")), { code: "aborted" })
})

test("the real deadline terminates a pending read even without an external signal", { timeout: 1000 }, async t => {
  const budget = createCaptureAcquisition({ durationMs: 20 })
  t.after(() => budget.close())
  let cancelled = false
  const response = { status: 200, headers: {}, body: { getReader() { return {
    read() { return new Promise(() => {}) }, async cancel() { cancelled = true },
  } } } }
  await assert.rejects(budget.wrapResponse(response).text(), { code: "deadline" })
  assert.equal(cancelled, true)
  assert.equal(budget.failure, "deadline")
})

test("capture policy permits reduced test bounds but rejects expanded or invalid envelopes", () => {
  for (const byteLimit of [0, -1, 1.5, CAPTURE_BYTE_LIMIT + 1]) {
    assert.throws(() => createCaptureAcquisition({ byteLimit }), RangeError)
  }
  for (const durationMs of [0, -1, Infinity, CAPTURE_DURATION_MS + 1]) {
    assert.throws(() => createCaptureAcquisition({ durationMs }), RangeError)
  }
})

test("closed budgets and transport failures expose fixed errors, not upstream payload text", async t => {
  const budget = createCaptureAcquisition()
  t.after(() => budget.close())
  const response = { status: 200, headers: {}, body: { getReader() { return {
    async read() { throw Error("untrusted-marker-" + "x".repeat(10_000)) }, async cancel() {},
  } } } }
  await assert.rejects(budget.wrapResponse(response).text(), error => {
    assert.equal(error.code, "read-failed")
    assert.ok(error.message.length < 100)
    assert.equal(error.message.includes("untrusted-marker"), false)
    return true
  })
  budget.close()
  assert.throws(() => budget.wrapResponse(new Response("later")), { code: "closed" })
})
