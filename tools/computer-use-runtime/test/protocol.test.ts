import assert from "node:assert/strict";
import test from "node:test";
import {
  createProtocolCodec,
  MAX_PROTOCOL_FRAME_BYTES,
} from "../src/index.ts";

const codec = createProtocolCodec(["type", "requestId", "text", "nested", "items", "value"]);

function frameJson(json: string): Uint8Array {
  const payload = new TextEncoder().encode(json);
  const frame = new Uint8Array(payload.length + 4);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);
  return frame;
}

test("protocol codec round-trips bounded unicode messages", () => {
  const message = {
    type: "observe",
    requestId: "opaque-λ-42",
    text: "Zażółć gęślą jaźń 🌐",
    nested: { value: ["東京", "مرحبا", "🧭"] },
    items: [1, true, null],
  };
  assert.deepEqual(codec.decode(codec.encode(message)), message);
});

test("oversized declared frames are rejected from the prefix", () => {
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, MAX_PROTOCOL_FRAME_BYTES + 1, false);
  assert.throws(() => codec.decode(prefix), { code: "PROTOCOL_OVERFLOW" });
});

test("oversized strings and arrays are rejected", () => {
  assert.throws(() => codec.encode({ text: "x".repeat(8_193) }), {
    code: "PROTOCOL_OVERFLOW",
  });
  assert.throws(() => codec.encode({ items: Array(257).fill(0) }), {
    code: "PROTOCOL_OVERFLOW",
  });
});

test("unknown object keys are rejected on encoding and decoding", () => {
  assert.throws(() => codec.encode({ type: "observe", secretField: "x" }), {
    code: "PROTOCOL_INVALID",
  });
  assert.throws(() => codec.decode(frameJson('{"unknown":1}')), {
    code: "PROTOCOL_INVALID",
  });
});

test("trailing bytes after the declared frame are rejected", () => {
  const valid = codec.encode({ type: "observe" });
  const withTail = new Uint8Array(valid.length + 1);
  withTail.set(valid);
  withTail[withTail.length - 1] = 0x7b;
  assert.throws(() => codec.decode(withTail), { code: "PROTOCOL_INVALID" });
});

test("malformed JSON is returned as a typed protocol error", () => {
  assert.throws(() => codec.decode(frameJson("{not-json")), {
    code: "PROTOCOL_INVALID",
  });
});

test("more than four nested containers are rejected", () => {
  assert.throws(
    () => codec.encode({ nested: { nested: { nested: { nested: { nested: { value: 1 } } } } } }),
    { code: "PROTOCOL_OVERFLOW" },
  );
  assert.throws(
    () => codec.decode(frameJson('{"nested":{"nested":{"nested":{"nested":{"nested":{"value":1}}}}}}')),
    { code: "PROTOCOL_OVERFLOW" },
  );
});

test("exactly four nested levels are accepted", () => {
  const value = { nested: { nested: { nested: { nested: { value: "ok" } } } } };
  assert.deepEqual(codec.decode(codec.encode(value)), value);
});

test("non-finite numbers and invalid UTF-8 are rejected as typed errors", () => {
  assert.throws(() => codec.encode({ value: Number.NaN }), { code: "PROTOCOL_INVALID" });
  assert.throws(() => codec.encode({ value: Number.POSITIVE_INFINITY }), {
    code: "PROTOCOL_INVALID",
  });
  const invalidUtf8 = new Uint8Array([0, 0, 0, 1, 0xff]);
  assert.throws(() => codec.decode(invalidUtf8), { code: "PROTOCOL_INVALID" });
});

test("object key insertion order does not change encoded bytes", () => {
  const first = codec.encode({ type: "observe", requestId: "r-1", text: "hi" });
  const second = codec.encode({ text: "hi", type: "observe", requestId: "r-1" });
  assert.deepEqual(first, second);
});
