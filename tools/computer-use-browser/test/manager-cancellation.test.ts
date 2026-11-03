import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { BrowserBackendError } from "../src/errors.ts";
import { NodeWorkerHandle } from "../src/manager.ts";
import { decodeProtocolMessage, encodeProtocolMessage, FrameDecoder } from "../src/protocol.ts";
import type { BrowserOperation } from "../src/ops.ts";

type Message = Record<string, unknown>;

class FakeChild extends EventEmitter {
  readonly writes: Message[] = [];
  readonly #decoder = new FrameDecoder();
  readonly stdin = {
    write: (chunk: Uint8Array, callback?: (error?: Error | null) => void): boolean => {
      for (const frame of this.#decoder.push(chunk)) {
        this.writes.push(decodeProtocolMessage(frame) as Message);
      }
      callback?.(null);
      return true;
    },
  };
  readonly stdout = new EventEmitter();

  kill(): boolean {
    queueMicrotask(() => this.emit("close", null, "SIGTERM"));
    return true;
  }

  respond(message: unknown): void {
    this.stdout.emit("data", Buffer.from(encodeProtocolMessage(message)));
  }
}

test("a worker that dies before ready reports a bounded stderr tail", async (t) => {
  const child = new FakeChild();
  const stderr = new EventEmitter();
  Object.defineProperty(child, "stderr", { value: stderr });
  const worker = new NodeWorkerHandle(child as never);
  t.after(() => worker.terminate());

  const ready = worker.waitUntilReady();
  stderr.emit("data", Buffer.from("[123:ERROR:chrome] Failed to move to new namespace\n"));
  child.emit("exit", 1, null);
  await assert.rejects(ready, (error: unknown) => {
    assert.ok(error instanceof BrowserBackendError);
    assert.equal(error.code, "WORKER_CRASHED");
    assert.match(error.message, /Failed to move to new namespace/);
    return true;
  });
});

test("the stderr tail is capped so a noisy child cannot flood the error", async (t) => {
  const child = new FakeChild();
  const stderr = new EventEmitter();
  Object.defineProperty(child, "stderr", { value: stderr });
  const worker = new NodeWorkerHandle(child as never);
  t.after(() => worker.terminate());

  const ready = worker.waitUntilReady();
  stderr.emit("data", Buffer.from("x".repeat(10_000)));
  stderr.emit("data", Buffer.from("END-MARKER"));
  child.emit("exit", 1, null);
  await assert.rejects(ready, (error: unknown) => {
    assert.ok(error instanceof BrowserBackendError);
    assert.ok(error.message.length < 700, `message too long: ${error.message.length}`);
    assert.match(error.message, /END-MARKER/);
    return true;
  });
});

function fixture() {
  const child = new FakeChild();
  const worker = new NodeWorkerHandle(child as never);
  return { child, worker };
}

function isCancelled(error: unknown): boolean {
  return error instanceof BrowserBackendError && error.code === "CANCELLED";
}

const operation: BrowserOperation = { method: "tabs.list" };

test("an aborted request before send rejects CANCELLED without writing to the worker", async (t) => {
  const { child, worker } = fixture();
  t.after(() => worker.terminate());
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(worker.execute(operation, controller.signal), isCancelled);
  assert.deepEqual(child.writes, []);
});

test("an aborted sent request rejects immediately and ignores its late response", async (t) => {
  const { child, worker } = fixture();
  t.after(() => worker.terminate());
  const controller = new AbortController();
  const abandoned = worker.execute(operation, controller.signal);
  const request = child.writes[0]!;

  controller.abort();
  await assert.rejects(abandoned, isCancelled);
  assert.equal(child.writes[1]?.type, "request-abort");
  child.respond({ type: "response", id: request.id, result: ["stale"] });

  const current = worker.execute(operation);
  const nextRequest = child.writes.at(-1)!;
  child.respond({ type: "response", id: nextRequest.id, result: ["fresh"] });
  assert.deepEqual(await current, ["fresh"]);
});

test("a response completed before abort keeps its real result", async (t) => {
  const { child, worker } = fixture();
  t.after(() => worker.terminate());
  const controller = new AbortController();
  const completed = worker.execute(operation, controller.signal);
  const request = child.writes[0]!;

  child.respond({ type: "response", id: request.id, result: ["completed"] });
  controller.abort();
  assert.deepEqual(await completed, ["completed"]);
});
