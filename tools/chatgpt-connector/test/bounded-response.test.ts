import assert from "node:assert/strict"
import { getEventListeners } from "node:events"
import { createServer } from "node:http"
import test from "node:test"

import { readBoundedResponse, ResponseAcquisitionError, waitForAbortable } from "../src/bounded-response.ts"

function bytes(value: Uint8Array, chunkSize = value.length || 1) {
  let offset = 0
  let cancelled = 0
  const requests: number[] = []
  const stream = new ReadableStream({
    type: "bytes",
    pull(controller) {
      const request = controller.byobRequest!
      requests.push(request.view!.byteLength)
      const size = Math.min(request.view!.byteLength, chunkSize, value.length - offset)
      if (size === 0) { controller.close(); request.respond(0); return }
      new Uint8Array(request.view!.buffer, request.view!.byteOffset, size).set(value.subarray(offset, offset + size))
      offset += size
      request.respond(size)
      if (offset === value.length) controller.close()
    },
    cancel() { cancelled++ },
  })
  return { response: new Response(stream), requests, delivered: () => offset, cancelled: () => cancelled }
}

const signal = () => new AbortController().signal
const code = (expected: ResponseAcquisitionError["code"]) => (error: unknown) => {
  assert.ok(error instanceof ResponseAcquisitionError)
  assert.equal(error.code, expected)
  return true
}

test("BYOB decoding accepts split Unicode and requests no more than the remaining byte allowance", async () => {
  const value = Buffer.from("A😀éZ")
  const fixture = bytes(value, 2)
  assert.equal(await readBoundedResponse(fixture.response, value.length, signal()), "A😀éZ")
  assert.deepEqual(fixture.requests, [8, 6, 4, 2])
  assert.equal(fixture.delivered(), value.length)
  assert.equal(fixture.cancelled(), 0)
  assert.equal(fixture.response.body!.locked, false)
})

test("exact-cap EOF succeeds without a limit-plus-one read", async () => {
  const fixture = bytes(Buffer.from("abcd"))
  assert.equal(await readBoundedResponse(fixture.response, 4, signal()), "abcd")
  assert.deepEqual(fixture.requests, [4])
})

test("empty and absent bodies return empty text", async () => {
  const fixture = bytes(new Uint8Array())
  assert.equal(await readBoundedResponse(fixture.response, 4, signal()), "")
  assert.equal(await readBoundedResponse(new Response(null), 4, signal()), "")
})

test("the fixed envelope cannot be raised or set to a nonpositive/fractional value", async () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, 24 * 1024 * 1024 + 1]) {
    await assert.rejects(readBoundedResponse(new Response(null), limit, signal()), RangeError)
  }
})

test("oversized declarations are cancelled before any byte acquisition", async () => {
  const fixture = bytes(Buffer.from("private"))
  fixture.response.headers.set("content-length", "999999999999999999999999")
  await assert.rejects(readBoundedResponse(fixture.response, 4, signal()), code("byte-limit"))
  assert.equal(fixture.delivered(), 0)
  assert.equal(fixture.cancelled(), 1)
  assert.equal(fixture.response.body!.locked, false)
})

test("non-byte streams fail closed and cancel without a default-reader fallback", async () => {
  let pulls = 0
  let cancellations = 0
  const stream = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024)) },
    cancel() { cancellations++ },
  }, { highWaterMark: 0 })
  await assert.rejects(readBoundedResponse(new Response(stream), 4, signal()), code("byte-reader"))
  assert.equal(pulls, 0)
  assert.equal(cancellations, 1)
  assert.equal(stream.locked, false)
})

test("malformed UTF-8 is rejected rather than replaced or returned", async () => {
  const fixture = bytes(new Uint8Array([0xc3, 0x28]))
  await assert.rejects(readBoundedResponse(fixture.response, 4, signal()), code("invalid-utf8"))
  assert.equal(fixture.response.body!.locked, false)
})

test("pre-aborted reads cancel without acquiring bytes", async () => {
  const fixture = bytes(Buffer.from("private"))
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(readBoundedResponse(fixture.response, 10, abort.signal), code("aborted"))
  assert.equal(fixture.delivered(), 0)
  assert.equal(fixture.cancelled(), 1)
})

test("stalled reads are abortable even when cancellation never settles", async () => {
  let enter!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve })
  let cancellations = 0
  const stream = new ReadableStream({
    type: "bytes",
    pull() { enter() },
    cancel() { cancellations++; return new Promise<void>(() => {}) },
  })
  const abort = new AbortController()
  const pending = readBoundedResponse(new Response(stream), 4, abort.signal)
  await entered
  abort.abort()
  await assert.rejects(pending, code("aborted"))
  assert.equal(cancellations, 1)
  assert.equal(stream.locked, false)
  assert.equal(getEventListeners(abort.signal, "abort").length, 0)
})

test("an undeclared overflow never acquires a tail probe and aborts its exact-cap wait", async () => {
  const fixture = bytes(Buffer.from("abcde"))
  const abort = new AbortController()
  const pending = readBoundedResponse(fixture.response, 4, abort.signal)
  // Let the single requested read settle, without using a wall-clock delay.
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(fixture.delivered(), 4)
  assert.deepEqual(fixture.requests, [4])
  abort.abort()
  await assert.rejects(pending, code("aborted"))
  assert.equal(fixture.cancelled(), 1)
  assert.equal(fixture.response.body!.locked, false)
})

test("an abort racing the last read cannot return late text", async () => {
  const abort = new AbortController()
  const stream = new ReadableStream({
    type: "bytes",
    pull(controller) {
      controller.enqueue(new Uint8Array([65]))
      controller.close()
      abort.abort()
    },
  })
  await assert.rejects(readBoundedResponse(new Response(stream), 4, abort.signal), code("aborted"))
  assert.equal(stream.locked, false)
})

test("underlying read failures do not expose the original error body", async () => {
  const stream = new ReadableStream({ type: "bytes", pull(controller) { controller.error(new Error("private body")) } })
  await assert.rejects(readBoundedResponse(new Response(stream), 4, signal()), error => {
    assert.ok(code("read-failed")(error))
    assert.doesNotMatch(String(error), /private body/)
    return true
  })
  assert.equal(stream.locked, false)
})

test("abort racing an already settled promise still refuses a pre-aborted operation", async () => {
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(waitForAbortable(Promise.resolve("late"), abort.signal), code("aborted"))
  assert.equal(getEventListeners(abort.signal, "abort").length, 0)
})

test("abortable waits remove listeners after both success and rejection", async () => {
  const active = signal()
  assert.equal(await waitForAbortable(Promise.resolve("ok"), active), "ok")
  await assert.rejects(waitForAbortable(Promise.reject(new Error("synthetic")), active), /synthetic/)
  assert.equal(getEventListeners(active, "abort").length, 0)
})

test("exact-cap closure failures are sanitized just like read failures", async () => {
  let fail!: () => void
  const stream = new ReadableStream({
    type: "bytes",
    pull(controller) {
      controller.enqueue(new Uint8Array([65]))
      fail = () => controller.error(new Error("private closure detail"))
    },
  })
  const pending = readBoundedResponse(new Response(stream), 1, signal())
  await new Promise<void>(resolve => setImmediate(resolve))
  fail()
  await assert.rejects(pending, error => {
    assert.ok(code("read-failed")(error))
    assert.doesNotMatch(String(error), /private closure detail/)
    return true
  })
  assert.equal(stream.locked, false)
})

test("native Node fetch supports bounded BYOB below the cap; unconfirmed exact-cap EOF fails closed", async () => {
  const payload = Buffer.from("A😀éZ")
  const server = createServer((request, response) => {
    if (request.url === "/length") response.setHeader("content-length", payload.length)
    response.write(payload.subarray(0, 3))
    response.end(payload.subarray(3))
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    for (const route of ["length", "chunked"]) {
      const deadline = AbortSignal.timeout(1000)
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/${route}`, { signal: deadline, redirect: "error" })
      assert.equal(await readBoundedResponse(response, payload.length + 1, deadline), payload.toString())
      assert.equal(response.body!.locked, false)
    }
    const abort = new AbortController()
    const response = await fetch(`http://127.0.0.1:${address.port}/length`, { signal: abort.signal, redirect: "error" })
    const pending = readBoundedResponse(response, payload.length, abort.signal)
    await new Promise<void>(resolve => setImmediate(resolve))
    abort.abort()
    await assert.rejects(pending, code("aborted"))
    assert.equal(response.body!.locked, false)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test("individual BYOB requests stay within 64 KiB even for a larger permitted body", async () => {
  const fixture = bytes(new Uint8Array(65540).fill(65))
  assert.equal((await readBoundedResponse(fixture.response, 65540, signal())).length, 65540)
  assert.deepEqual(fixture.requests, [65536, 4])
})
