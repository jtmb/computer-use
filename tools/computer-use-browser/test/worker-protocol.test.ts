import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { parseRequest, parseCredentialFillRequest, FrameDecoder, decodeProtocolMessage, encodeProtocolMessage } from "../src/protocol.ts";
import { dispatchCredentialFill, recoverRequestId } from "../src/worker-child.ts";
import { NodeWorkerHandle } from "../src/manager.ts";
import { BrowserBackendError } from "../src/errors.ts";
import { createBrowserWorker, type SnapshotResult } from "../src/ops.ts";
import { FakeContext, fakeLauncher } from "./fakes.ts";

// A request the parser rejects must still be answerable, otherwise the caller
// waits for a response that never comes and the tool call hangs.

test("a request missing its tab id is rejected by the parser", () => {
  assert.throws(
    () => parseRequest({ type: "request", id: "req-1", operation: { method: "navigate", url: "https://example.com/" } }),
    (error: unknown) => (error as { code?: string }).code === "PROTOCOL_INVALID",
  );
});

test("the rejected frame still yields its id so it can be answered", () => {
  const frame = { type: "request", id: "req-1", operation: { method: "navigate", url: "https://example.com/" } };
  assert.equal(recoverRequestId(frame), "req-1");
});

test("an unusable id is not recovered", () => {
  assert.equal(recoverRequestId({ id: "" }), undefined);
  assert.equal(recoverRequestId({ id: "x".repeat(129) }), undefined);
  assert.equal(recoverRequestId({ id: "req\u0000" }), undefined);
  assert.equal(recoverRequestId({ id: 42 }), undefined);
  assert.equal(recoverRequestId(null), undefined);
  assert.equal(recoverRequestId("not-an-object"), undefined);
});

test("credential frames preserve an optional boolean password-only restriction", () => {
  const message = { type: "credential-fill", id: "cred-test", target: { tabId: "t1", ref: "e1", generation: 1 }, value: "synthetic-password" };
  for (const flag of [true, false]) {
    const parsed = parseCredentialFillRequest({ ...message, requirePasswordField: flag });
    assert.equal(parsed.requirePasswordField, flag);
  }
  assert.equal(parseCredentialFillRequest(message).requirePasswordField, undefined);
  for (const flag of [null, 0, "true", [], {}]) {
    assert.throws(() => parseCredentialFillRequest({ ...message, requirePasswordField: flag }),
      (error: unknown) => error instanceof BrowserBackendError && error.code === "PROTOCOL_INVALID");
  }
});

test("framed credential transport enforces password-only on the actual worker dispatch", { timeout: 5000 }, async (t) => {
  const context = new FakeContext();
  const backend = await createBrowserWorker({ profileDir: "/unused-synthetic-profile", launcher: fakeLauncher(context), authFlow: true });
  t.after(() => backend.close());
  const tab = await backend.execute({ method: "tabs.new" });
  await backend.execute({ method: "navigate", tabId: tab.id, url: "https://login.example.test/auth" });
  const target = async () => {
    const snapshot = await backend.execute({ method: "snapshot", tabId: tab.id }) as SnapshotResult;
    return { tabId: tab.id, ref: "e1", generation: snapshot.generation };
  };
  const child = new EventEmitter();
  const stdout = new EventEmitter();
  const decoder = new FrameDecoder();
  const received: Record<string, unknown>[] = [];
  Object.assign(child, {
    stdout,
    stdin: { write: (bytes: Uint8Array, callback?: (error: Error | null) => void) => {
      for (const frame of decoder.push(bytes)) {
        const decoded = decodeProtocolMessage(frame);
        received.push(decoded as Record<string, unknown>);
        void Promise.resolve().then(() => dispatchCredentialFill(backend, parseCredentialFillRequest(decoded)))
          .then(result => ({ type: "credential-response", id: (decoded as Record<string, unknown>).id, result }),
            (error: unknown) => ({ type: "error", id: (decoded as Record<string, unknown>).id,
              code: error instanceof BrowserBackendError ? error.code : "OPERATION_FAILED", message: "Synthetic credential refusal" }))
          .then(response => stdout.emit("data", Buffer.from(encodeProtocolMessage(response))));
      }
      callback?.(null);
      return true;
    } },
    kill: () => { queueMicrotask(() => child.emit("close", null, "SIGTERM")); return true; },
  });
  const worker = new NodeWorkerHandle(child as never);
  t.after(() => worker.terminate());
  context.createdPages[0]!.fieldType = "text";
  await assert.rejects(worker.fillCredential(await target(), "synthetic-password", undefined, { requirePasswordField: true }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_TARGET_INVALID");
  assert.equal(received[0]!.requirePasswordField, true);
  assert.equal(context.createdPages[0]!.calls.includes("credential-fill"), false);
  context.createdPages[0]!.fieldType = "password";
  assert.deepEqual(await worker.fillCredential(await target(), "synthetic-password", undefined, { requirePasswordField: true }), { status: "filled" });
  context.createdPages[0]!.fieldType = "text";
  assert.deepEqual(await worker.fillCredential(await target(), "synthetic-value", undefined, { requirePasswordField: false }), { status: "filled" });
  assert.equal(received.at(-1)!.requirePasswordField, false);
  assert.deepEqual(await worker.fillCredential(await target(), "synthetic-value"), { status: "filled" });
  assert.equal(Object.hasOwn(received.at(-1)!, "requirePasswordField"), false);
});
