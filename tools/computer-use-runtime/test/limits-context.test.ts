import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTURE_CHUNK_BYTES,
  CAPTURE_DEADLINE_MS,
  CAPTURE_MAX_PIXELS,
  createPermissionRequest,
  LIMITS,
  MAX_BROWSER_WORKERS,
  MAX_TABS_PER_WORKER,
  PNG_MAX_BYTES,
  RuntimeError,
  TIMED_INPUT_MAX_MS,
  validateCallerAttribution,
} from "../src/index.ts";

test("limits match the runtime contract and the aggregate is frozen", () => {
  assert.deepEqual(LIMITS, {
    PNG_MAX_BYTES: 6_291_456,
    CAPTURE_MAX_PIXELS: 8_388_608,
    CAPTURE_CHUNK_BYTES: 49_152,
    CAPTURE_DEADLINE_MS: 15_000,
    TIMED_INPUT_MAX_MS: 2_000,
    MAX_BROWSER_WORKERS: 2,
    MAX_TABS_PER_WORKER: 8,
  });
  assert.ok(Object.isFrozen(LIMITS));
  assert.equal(PNG_MAX_BYTES, LIMITS.PNG_MAX_BYTES);
  assert.equal(CAPTURE_MAX_PIXELS, LIMITS.CAPTURE_MAX_PIXELS);
  assert.equal(CAPTURE_CHUNK_BYTES, LIMITS.CAPTURE_CHUNK_BYTES);
  assert.equal(CAPTURE_DEADLINE_MS, LIMITS.CAPTURE_DEADLINE_MS);
  assert.equal(TIMED_INPUT_MAX_MS, LIMITS.TIMED_INPUT_MAX_MS);
  assert.equal(MAX_BROWSER_WORKERS, LIMITS.MAX_BROWSER_WORKERS);
  assert.equal(MAX_TABS_PER_WORKER, LIMITS.MAX_TABS_PER_WORKER);
});

test("caller attribution validates fields and returns the permission source shape", () => {
  const attribution = validateCallerAttribution({
    sessionID: "ses-8f4c",
    agent: "computer-use",
    messageID: "msg-a129",
    callID: "tool-42",
  });
  assert.deepEqual(createPermissionRequest("window.read", attribution), {
    permission: "window.read",
    source: { type: "tool", messageID: "msg-a129", id: "tool-42" },
  });
});

test("caller attribution rejects missing, blank, and over-length fields", () => {
  assert.throws(() => validateCallerAttribution({ sessionID: "ses" }), {
    code: "INVALID_CONTEXT",
  });
  assert.throws(
    () =>
      validateCallerAttribution({
        sessionID: "ses",
        agent: " ",
        messageID: "msg",
        callID: "call",
      }),
    { code: "INVALID_CONTEXT" },
  );
  assert.throws(
    () =>
      validateCallerAttribution({
        sessionID: "s".repeat(257),
        agent: "agent",
        messageID: "msg",
        callID: "call",
      }),
    { code: "INVALID_CONTEXT" },
  );
});

test("permission request rejects an invalid permission name", () => {
  const attribution = validateCallerAttribution({
    sessionID: "ses-8f4c",
    agent: "computer-use",
    messageID: "msg-a129",
    callID: "tool-42",
  });
  assert.throws(() => createPermissionRequest("  ", attribution), RuntimeError);
});
