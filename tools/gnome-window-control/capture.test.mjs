import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createCaptureController } from "./capture.mjs";

const EPOCH = "12345678-1234-1234-1234-123456789abc";
const WINDOW_ID = `${EPOCH}:42`;
const FRAME_RECT = { x: 100, y: 80, width: 320, height: 240 };
const BUFFER_RECT = { x: 100, y: 80, width: 640, height: 480 };
const PNG_BYTES = Buffer.from("in-memory png fixture");

function fixture({
  bytes = PNG_BYTES,
  width = 320,
  height = 240,
  stateOverrides = {},
  windowOverrides = {},
  actorOverrides = {},
  missingActor = false,
  encodeBase64 = chunk => Buffer.from(chunk).toString("base64"),
  digest = data => createHash("sha256").update(data).digest("hex"),
  asyncComposite = false,
  mutateDuringCapture = false,
} = {}) {
  let currentTime = 100;
  let timerCallback = null;
  let cancelCount = 0;
  let compositeCount = 0;
  let streamCount = 0;
  let mutatedOnce = false;
  const window = {
    minimized: false,
    unmanaged: false,
    get_frame_rect: () => ({ ...FRAME_RECT, ...(windowOverrides.frameRect ?? {}) }),
    get_buffer_rect: () => ({ ...BUFFER_RECT, ...(windowOverrides.bufferRect ?? {}) }),
    ...windowOverrides,
  };
  const texture = {
    get_width: () => width,
    get_height: () => height,
  };
  const content = {
    get_texture: () => actorOverrides.nullTexture ? null : texture,
  };
  const actor = {
    paint_to_content: argument => {
      assert.equal(argument, null);
      return actorOverrides.nullContent ? null : content;
    },
    get_resource_scale: () => 2,
    ...actorOverrides,
  };
  const state = {
    epoch: EPOCH,
    workspace: 0,
    locked: false,
    blockedReason: null,
    windows: [{ id: WINDOW_ID, rect: { ...FRAME_RECT }, minimized: false, protected: false }],
    ...stateOverrides,
  };
  const controller = createCaptureController({
    now: () => currentTime,
    getDesktopState: () => state,
    resolveWindowActor: id => id === WINDOW_ID && !missingActor
      ? { id, actor, window, onActiveWorkspace: true }
      : null,
    screenshotApi: {
      createMemoryOutputStream: () => {
        streamCount += 1;
        return { data: null, closed: false };
      },
      compositeToStream: (_texture, resourceScale, stream) => {
        compositeCount += 1;
        assert.equal(resourceScale, 2);
        // Each capture gets its own buffer, as a real encoder does: a refused capture
        // zeroes its bytes, and a shared fixture buffer would poison the next attempt.
        if (!asyncComposite) {
          stream.data = Uint8Array.from(bytes);
          return undefined;
        }
        // GNOME Shell's encoder is asynchronous; a real adapter returns a promise.
        return Promise.resolve().then(() => {
          stream.data = Uint8Array.from(bytes);
          if (mutateDuringCapture && !mutatedOnce) {
            // The Shell re-created its window list while the frame was in flight: the
            // epoch changes, so the pending frame belongs to a world that no longer exists.
            mutatedOnce = true;
            state.epoch = "epoch-after-restart";
          }
        });
      },
      closeStream: stream => { stream.closed = true; },
      stealAsBytes: stream => {
        assert.equal(stream.closed, true);
        return stream.data;
      },
    },
    digest,
    encodeBase64,
    makeHandle: () => "0123456789abcdef",
    schedule: (_delay, callback) => {
      timerCallback = callback;
      return "timer-token";
    },
    cancelSchedule: token => {
      assert.equal(token, "timer-token");
      cancelCount += 1;
    },
  });
  return {
    controller,
    actor,
    state,
    window,
    get compositeCount() { return compositeCount; },
    get streamCount() { return streamCount; },
    get cancelCount() { return cancelCount; },
    advance(milliseconds) { currentTime += milliseconds; },
    expire() { timerCallback?.(); },
  };
}

function begin(controller, windowId = WINDOW_ID, sender = ":1.50") {
  return controller.Begin(JSON.stringify({ windowId }), sender);
}

test("one active capture is allowed and a second Begin is refused", () => {
  const sample = fixture();
  begin(sample.controller);
  assert.throws(() => begin(sample.controller), { captureCode: "BUSY" });
  assert.equal(sample.compositeCount, 1);
});

test("stale window IDs and guarded desktop states are refused before capture", () => {
  const stale = fixture();
  assert.throws(() => begin(stale.controller, `${EPOCH}:999`), { captureCode: "STALE" });
  assert.throws(() => begin(stale.controller, "not-an-epoch:42"), { captureCode: "INVALID_REQUEST" });

  for (const stateOverrides of [
    { locked: true },
    { blockedReason: "overview-active" },
    { blockedReason: "shell-modal-active" },
    { blockedReason: "dialog-active" },
    { windows: [{ id: WINDOW_ID, rect: FRAME_RECT, protected: false, minimized: true }] },
    { windows: [{ id: WINDOW_ID, rect: { ...FRAME_RECT, width: 0 }, protected: false, minimized: false }] },
    { windows: [{ id: WINDOW_ID, rect: FRAME_RECT, protected: true, minimized: false }] },
  ]) {
    const guarded = fixture({ stateOverrides });
    assert.throws(() => begin(guarded.controller), { captureCode: "REFUSED" });
    assert.equal(guarded.compositeCount, 0);
  }
});

test("null content and texture are refused", () => {
  for (const actorOverrides of [{ nullContent: true }, { nullTexture: true }]) {
    const sample = fixture({ actorOverrides });
    assert.throws(() => begin(sample.controller), { captureCode: "REFUSED" });
    assert.equal(sample.compositeCount, 0);
  }
  const zeroSizedTexture = fixture({ width: 0 });
  assert.throws(() => begin(zeroSizedTexture.controller), { captureCode: "REFUSED" });
  assert.equal(zeroSizedTexture.streamCount, 0);
});

test("pixel-area and PNG-byte bounds reject before transfer or chunking", () => {
  const tooManyPixels = fixture({ width: 4097, height: 2049 });
  assert.throws(() => begin(tooManyPixels.controller), { captureCode: "REFUSED" });
  assert.equal(tooManyPixels.streamCount, 0);

  const tooManyBytes = fixture({ bytes: Buffer.alloc(6_291_457) });
  assert.throws(() => begin(tooManyBytes.controller), { captureCode: "REFUSED" });
  assert.equal(tooManyBytes.compositeCount, 1);
});

test("chunks are ordered, single-use, exact-length, sender-bound, and unavailable after End", () => {
  const sample = fixture({ bytes: Buffer.alloc(40_000, 0x5a) });
  const result = begin(sample.controller);
  assert.equal(result.chunkCount, 2);
  assert.throws(() => sample.controller.Chunk(result.handle, 1, ":1.50"), { captureCode: "INVALID_CHUNK" });
  const first = sample.controller.Chunk(result.handle, 0, ":1.50");
  assert.equal(first.length, 49_152);
  assert.throws(() => sample.controller.Chunk(result.handle, 0, ":1.50"), { captureCode: "INVALID_CHUNK" });
  assert.throws(() => sample.controller.Chunk(result.handle, 1, ":1.51"), { captureCode: "INVALID_HANDLE" });
  const second = sample.controller.Chunk(result.handle, 1, ":1.50");
  assert.equal(Buffer.from(second, "base64").length, 3_136);
  const ended = sample.controller.End(result.handle, ":1.50");
  assert.equal(ended.windowId, WINDOW_ID);
  assert.throws(() => sample.controller.Chunk(result.handle, 2, ":1.50"), { captureCode: "INVALID_HANDLE" });
  assert.equal(sample.cancelCount, 1);
});

test("short base64 chunks do not advance the consumer", () => {
  const sample = fixture({ encodeBase64: chunk => Buffer.from(chunk).toString("base64").slice(4) });
  const result = begin(sample.controller);
  assert.throws(() => sample.controller.Chunk(result.handle, 0, ":1.50"), { captureCode: "INVALID_CHUNK" });
  assert.equal(sample.cancelCount, 0);
  assert.throws(() => sample.controller.End(result.handle, ":1.50"), { captureCode: "INVALID_CHUNK" });
});

test("expiry releases the active buffer and late chunks are rejected", () => {
  const sample = fixture();
  const result = begin(sample.controller);
  sample.expire();
  assert.throws(() => sample.controller.Chunk(result.handle, 0, ":1.50"), { captureCode: "INVALID_HANDLE" });
  assert.equal(sample.cancelCount, 0);
});

test("an expired handle is reclaimed when the timer callback is delayed", () => {
  const sample = fixture();
  const result = begin(sample.controller);
  sample.advance(15_000);
  assert.throws(() => sample.controller.Chunk(result.handle, 0, ":1.50"), { captureCode: "EXPIRED" });
  assert.equal(sample.cancelCount, 1);
});

test("closed windows cannot be resolved for capture", () => {
  const sample = fixture({ missingActor: true });
  assert.throws(() => begin(sample.controller), { captureCode: "STALE" });
  assert.equal(sample.compositeCount, 0);
});

test("Abort releases once and rejects late use", () => {
  let observedChunk;
  const sample = fixture({
    encodeBase64: chunk => {
      observedChunk = chunk;
      return Buffer.from(chunk).toString("base64");
    },
  });
  const result = begin(sample.controller);
  sample.controller.Chunk(result.handle, 0, ":1.50");
  assert.deepEqual(sample.controller.Abort(result.handle, ":1.50"), { aborted: true });
  assert.equal(observedChunk.every(byte => byte === 0), true);
  assert.equal(sample.cancelCount, 1);
  assert.throws(() => sample.controller.Abort(result.handle, ":1.50"), { captureCode: "INVALID_HANDLE" });
  assert.throws(() => sample.controller.Chunk(result.handle, 0, ":1.50"), { captureCode: "INVALID_HANDLE" });
  assert.equal(sample.cancelCount, 1);
});

test("controller disposal clears an in-flight capture once", () => {
  const sample = fixture();
  const result = begin(sample.controller);
  assert.equal(sample.controller.dispose(), true);
  assert.equal(sample.cancelCount, 1);
  assert.equal(sample.controller.dispose(), false);
  assert.throws(() => sample.controller.Chunk(result.handle, 0, ":1.50"), { captureCode: "INVALID_HANDLE" });
  assert.equal(sample.cancelCount, 1);
});

test("End refuses a digest change and releases the buffer", () => {
  let calls = 0;
  const sample = fixture({ digest: () => (++calls === 1 ? "a" : "b").repeat(64) });
  const result = begin(sample.controller);
  sample.controller.Chunk(result.handle, 0, ":1.50");
  assert.throws(() => sample.controller.End(result.handle, ":1.50"), { captureCode: "INTEGRITY" });
  assert.equal(sample.cancelCount, 1);
  assert.throws(() => sample.controller.End(result.handle, ":1.50"), { captureCode: "INVALID_HANDLE" });
});

test("geometry, exact identity, and active-workspace membership are rechecked before capture", () => {
  const changedGeometry = fixture();
  let bufferReads = 0;
  changedGeometry.window.get_buffer_rect = () => ({
    ...BUFFER_RECT,
    width: bufferReads++ === 0 ? BUFFER_RECT.width : BUFFER_RECT.width + 1,
  });
  assert.throws(() => begin(changedGeometry.controller), { captureCode: "STALE" });
  assert.equal(changedGeometry.compositeCount, 0);

  const movedWorkspace = fixture();
  movedWorkspace.controller = createCaptureController({
    now: () => 100,
    getDesktopState: () => movedWorkspace.state,
    resolveWindowActor: id => ({
      id,
      actor: movedWorkspace.actor,
      window: movedWorkspace.window,
      onActiveWorkspace: false,
    }),
    screenshotApi: {
      createMemoryOutputStream: () => ({ data: null }),
      compositeToStream: () => { throw new Error("must not capture"); },
      closeStream() {},
      stealAsBytes() { return PNG_BYTES; },
    },
    digest: data => createHash("sha256").update(data).digest("hex"),
    encodeBase64: chunk => Buffer.from(chunk).toString("base64"),
    makeHandle: () => "0123456789abcdef",
    schedule: () => 1,
    cancelSchedule() {},
  });
  assert.throws(() => begin(movedWorkspace.controller), { captureCode: "STALE" });
});

test("a window that changes while the capture is in flight is refused as stale", async () => {
  const sample = fixture({ asyncComposite: true, mutateDuringCapture: true });
  const failure = await begin(sample.controller).then(() => null, (error) => error);
  assert.equal(failure?.captureCode, "STALE", `unexpected outcome: ${failure?.message ?? "no error"}`);
  // The refused frame must not stay active: with the window back where it was, a fresh
  // capture works and can be released normally.
  sample.state.epoch = EPOCH;
  const again = await begin(sample.controller);
  assert.equal(typeof again.handle, "string", "a fresh capture is accepted once the target is stable");
  sample.controller.Abort(again.handle, ":1.50");
});

test("an asynchronous compositor still yields an ordered capture", async () => {
  const sample = fixture({ asyncComposite: true });
  const handle = await begin(sample.controller);
  assert.equal(typeof handle.handle, "string");
  const encoded = sample.controller.Chunk(handle.handle, 0, ":1.50");
  assert.equal(typeof encoded, "string");
  const end = sample.controller.End(handle.handle, ":1.50");
  assert.equal(end.size, PNG_BYTES.byteLength);
  assert.equal(end.sha256, createHash("sha256").update(PNG_BYTES).digest("hex"));
  assert.equal(handle.chunkCount, 1);
});
