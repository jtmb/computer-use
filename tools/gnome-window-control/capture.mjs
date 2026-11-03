import {
  LIMITS,
  RuntimeError,
} from "./runtime-contract.mjs";

const { CAPTURE_CHUNK_BYTES, CAPTURE_DEADLINE_MS, CAPTURE_MAX_PIXELS, PNG_MAX_BYTES } = LIMITS;
const REQUEST_MAX_BYTES = 16_384;
const BASE64_CHUNK_BYTES = Math.floor(CAPTURE_CHUNK_BYTES / 4) * 3;
const WINDOW_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9]+)$/i;

const CAPTURE_CODES = Object.freeze({
  INVALID_REQUEST: "INVALID_INPUT",
  REFUSED: "INVALID_CONTEXT",
  BUSY: "INVALID_CONTEXT",
  STALE: "STALE_TARGET",
  INVALID_HANDLE: "STALE_TARGET",
  INVALID_CHUNK: "INVALID_INPUT",
  EXPIRED: "STALE_TARGET",
  INTEGRITY: "INTERNAL",
  CAPTURE_FAILED: "INTERNAL",
});

export class CaptureError extends RuntimeError {
  constructor(captureCode) {
    super(CAPTURE_CODES[captureCode] ?? "INTERNAL");
    this.name = "CaptureError";
    this.captureCode = CAPTURE_CODES[captureCode] ? captureCode : "CAPTURE_FAILED";
  }
}

function fail(code) {
  throw new CaptureError(code);
}

function utf8Length(value) {
  let length = 0;
  for (const character of value) {
    const point = character.codePointAt(0);
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return length;
}

function rectangle(value) {
  if (!value || !["x", "y", "width", "height"].every(key => Number.isSafeInteger(value[key])))
    fail("REFUSED");
  const result = { x: value.x, y: value.y, width: value.width, height: value.height };
  if (result.width <= 0 || result.height <= 0)
    fail("REFUSED");
  return result;
}

function sameRectangle(first, second) {
  return ["x", "y", "width", "height"].every(key => first[key] === second[key]);
}

function requestWindowId(requestJson) {
  if (typeof requestJson !== "string" || utf8Length(requestJson) > REQUEST_MAX_BYTES)
    fail("INVALID_REQUEST");
  let request;
  try {
    request = JSON.parse(requestJson);
  } catch {
    fail("INVALID_REQUEST");
  }
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).length !== 1 || Object.keys(request)[0] !== "windowId")
    fail("INVALID_REQUEST");
  if (typeof request.windowId !== "string" || !WINDOW_ID.test(request.windowId))
    fail("INVALID_REQUEST");
  return { windowId: request.windowId, epoch: request.windowId.match(WINDOW_ID)[1] };
}

function windowGeometry(window, inventoryRect) {
  if (!window || window.minimized || window.unmanaged)
    fail("STALE");
  const frameRect = rectangle(window.get_frame_rect());
  const bufferRect = rectangle(window.get_buffer_rect());
  if (!sameRectangle(frameRect, inventoryRect))
    fail("STALE");
  return { frameRect, bufferRect };
}

function asByteArray(value) {
  const data = value?.get_data instanceof Function ? value.get_data() : value;
  if (!(data instanceof Uint8Array))
    fail("CAPTURE_FAILED");
  if (data.byteLength === 0 || data.byteLength > PNG_MAX_BYTES)
    fail("REFUSED");
  return Uint8Array.from(data);
}

function base64Length(byteLength) {
  return Math.ceil(byteLength / 3) * 4;
}

function finishCapture(texture, actor, screenshotApi, width, height, resourceScale) {
  const stream = screenshotApi.createMemoryOutputStream();
  let closed = false;
  const finish = () => {
    try {
      screenshotApi.closeStream(stream);
      closed = true;
      const bytes = asByteArray(screenshotApi.stealAsBytes(stream));
      if (bytes.byteLength === 0 || bytes.byteLength > PNG_MAX_BYTES)
        fail("REFUSED");
      return { bytes, width, height, resourceScale };
    } catch (error) {
      if (!closed) {
        try {
          screenshotApi.closeStream(stream);
        } catch {
          // Preserve the capture failure if a partially written stream also refuses to close.
        }
      }
      throw error;
    }
  };
  const composed = screenshotApi.compositeToStream(texture, resourceScale, stream);
  // The compositor's encoder is asynchronous in GNOME Shell; the test harness
  // supplies a synchronous fake. Support both without duplicating validation.
  if (composed && typeof composed.then === "function") {
    return composed.then(finish, error => {
      if (!closed) {
        try {
          screenshotApi.closeStream(stream);
        } catch {
          // The encoder failure is the failure worth reporting.
        }
      }
      throw error instanceof CaptureError ? error : new CaptureError("CAPTURE_FAILED");
    });
  }
  return finish();
}

function captureTexture(actor, screenshotApi) {
  let content;
  let texture;
  try {
    content = actor.paint_to_content(null);
    if (!content)
      fail("REFUSED");
    texture = content.get_texture();
    if (!texture)
      fail("REFUSED");
    const width = texture.get_width();
    const height = texture.get_height();
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
        !Number.isSafeInteger(width * height) || width * height > CAPTURE_MAX_PIXELS)
      fail("REFUSED");
    const resourceScale = actor.get_resource_scale();
    if (!Number.isFinite(resourceScale) || resourceScale <= 0)
      fail("REFUSED");
    return finishCapture(texture, actor, screenshotApi, width, height, resourceScale);
  } catch (error) {
    if (error instanceof CaptureError)
      throw error;
    fail("CAPTURE_FAILED");
  }
}

export function createCaptureController({
  now = () => Date.now(),
  getDesktopState,
  resolveWindowActor,
  screenshotApi,
  digest,
  encodeBase64,
  makeHandle,
  schedule,
  cancelSchedule,
}) {
  if (typeof getDesktopState !== "function" || typeof resolveWindowActor !== "function" ||
      typeof digest !== "function" || typeof encodeBase64 !== "function" ||
      typeof makeHandle !== "function" || typeof schedule !== "function" ||
      typeof cancelSchedule !== "function" || !screenshotApi ||
      typeof screenshotApi.createMemoryOutputStream !== "function" ||
      typeof screenshotApi.compositeToStream !== "function" ||
      typeof screenshotApi.closeStream !== "function" ||
      typeof screenshotApi.stealAsBytes !== "function")
    throw new TypeError("Capture controller dependencies are incomplete");

  let active = null;
  let sequence = 0;

  function release(record, fromTimer = false) {
    if (active !== record || record.released)
      return false;
    record.released = true;
    if (!fromTimer && record.timer !== null) {
      try {
        cancelSchedule(record.timer);
      } catch {
        // Buffer release must complete even if removing an already-fired source fails.
      }
    }
    record.bytes.fill(0);
    record.bytes = null;
    active = null;
    return true;
  }

  function expireIfDue(record) {
    const elapsed = now() - record.createdAt;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= CAPTURE_DEADLINE_MS) {
      release(record);
      fail("EXPIRED");
    }
  }

  function desktopTarget(windowId, expected = null) {
    let state;
    try {
      state = getDesktopState();
    } catch {
      fail("REFUSED");
    }
    if (!state || typeof state !== "object" || state.locked || state.blockedReason ||
        state.overview || state.overviewVisible || (state.modalCount ?? 0) > 0 ||
        state.focusedDialog || state.focusedWindowProtected)
      fail("REFUSED");
    const idMatch = windowId.match(WINDOW_ID);
    if (!idMatch || state.epoch !== idMatch[1])
      fail("STALE");
    const matches = Array.isArray(state.windows) ? state.windows.filter(item => item.id === windowId) : [];
    if (matches.length !== 1)
      fail("STALE");
    const entry = matches[0];
    if (entry.protected || entry.minimized)
      fail("REFUSED");
    const inventoryRect = rectangle(entry.rect);

    let resolved;
    try {
      resolved = resolveWindowActor(windowId);
    } catch {
      fail("STALE");
    }
    if (!resolved || resolved.id !== windowId || resolved.onActiveWorkspace === false ||
        !resolved.actor || !resolved.window)
      fail("STALE");
    const geometry = windowGeometry(resolved.window, inventoryRect);
    if (expected && (resolved.actor !== expected.actor || resolved.window !== expected.window ||
        !sameRectangle(geometry.frameRect, expected.frameRect) ||
        !sameRectangle(geometry.bufferRect, expected.bufferRect)))
      fail("STALE");
    return { state, entry, ...resolved, ...geometry };
  }

  function assertSender(record, sender) {
    expireIfDue(record);
    if (typeof sender !== "string" || sender !== record.sender)
      fail("INVALID_HANDLE");
  }

  function currentRecord(handle, sender) {
    const record = active;
    if (!record || typeof handle !== "string" || record.handle !== handle || record.released)
      fail("INVALID_HANDLE");
    assertSender(record, sender);
    return record;
  }

  function Begin(requestJson, sender) {
    if (active) {
      expireIfDue(active);
      if (active)
        fail("BUSY");
    }
    if (typeof sender !== "string" || sender.length === 0)
      fail("INVALID_REQUEST");
    const { windowId, epoch } = requestWindowId(requestJson);
    const initial = desktopTarget(windowId);
    if (initial.state.epoch !== epoch)
      fail("STALE");

    const verified = desktopTarget(windowId, initial);
    const captured = captureTexture(verified.actor, screenshotApi);
    if (captured && typeof captured.then === "function") {
      return captured.then(
        value => completeBegin(value, verified, windowId, epoch, sender),
        error => {
          throw error instanceof CaptureError ? error : new CaptureError("CAPTURE_FAILED");
        },
      );
    }
    return completeBegin(captured, verified, windowId, epoch, sender);
  }

  function completeBegin(captured, verified, windowId, epoch, sender) {
      try {
        // The compositor work is asynchronous. Re-verify the target before publishing a
        // frame: if the window moved, closed or became protected while the capture was in
        // flight, the frame no longer matches the window and must not be handed out.
        desktopTarget(windowId, verified);
        const sha256 = digest(captured.bytes);
        if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(sha256))
          fail("CAPTURE_FAILED");

        const nonce = makeHandle();
        sequence += 1;
        const handle = `${nonce}-${sequence.toString(36)}`;
        if (typeof nonce !== "string" || nonce.length < 16 || handle.length > 128)
          fail("CAPTURE_FAILED");

        const record = {
          handle,
          sender,
          createdAt: now(),
          sha256: sha256.toLowerCase(),
          bytes: captured.bytes,
          width: captured.width,
          height: captured.height,
          resourceScale: captured.resourceScale,
          bufferRect: verified.bufferRect,
          frameRect: verified.frameRect,
          windowId,
          epoch,
          chunkCount: Math.ceil(captured.bytes.byteLength / BASE64_CHUNK_BYTES),
          nextChunk: 0,
          timer: null,
          released: false,
        };
        active = record;
        record.timer = schedule(CAPTURE_DEADLINE_MS, () => {
          if (active === record)
            release(record, true);
        });
        if (active !== record || record.released)
          fail("EXPIRED");
        return {
          handle,
          size: captured.bytes.byteLength,
          chunkCount: record.chunkCount,
          width: record.width,
          height: record.height,
          resourceScale: record.resourceScale,
          bufferRect: record.bufferRect,
          frameRect: record.frameRect,
          windowId: record.windowId,
          epoch: record.epoch,
        };
      } catch (error) {
        if (active?.bytes === captured.bytes)
          release(active);
        else
          captured.bytes.fill(0);
        throw error;
      }
  }

  function Chunk(handle, index, sender) {
    const record = currentRecord(handle, sender);
    if (!Number.isSafeInteger(index) || index !== record.nextChunk || index < 0 || index >= record.chunkCount)
      fail("INVALID_CHUNK");
    const start = index * BASE64_CHUNK_BYTES;
    const expectedBytes = Math.min(BASE64_CHUNK_BYTES, record.bytes.byteLength - start);
    const bytes = record.bytes.subarray(start, start + expectedBytes);
    if (bytes.byteLength !== expectedBytes)
      fail("INVALID_CHUNK");
    let encoded;
    try {
      encoded = encodeBase64(bytes);
    } catch {
      fail("INVALID_CHUNK");
    }
    if (typeof encoded !== "string" || encoded.length !== base64Length(expectedBytes) ||
        encoded.length > CAPTURE_CHUNK_BYTES)
      fail("INVALID_CHUNK");
    record.nextChunk += 1;
    return encoded;
  }

  function End(handle, sender) {
    const record = currentRecord(handle, sender);
    if (record.nextChunk !== record.chunkCount)
      fail("INVALID_CHUNK");
    let sha256;
    try {
      sha256 = digest(record.bytes);
    } catch {
      release(record);
      fail("INTEGRITY");
    }
    if (typeof sha256 !== "string" || sha256.toLowerCase() !== record.sha256) {
      release(record);
      fail("INTEGRITY");
    }
    const result = {
      sha256: record.sha256,
      size: record.bytes.byteLength,
      width: record.width,
      height: record.height,
      resourceScale: record.resourceScale,
      bufferRect: record.bufferRect,
      frameRect: record.frameRect,
      windowId: record.windowId,
      epoch: record.epoch,
    };
    release(record);
    return result;
  }

  function Abort(handle, sender) {
    const record = currentRecord(handle, sender);
    release(record);
    return { aborted: true };
  }

  function dispose() {
    return active ? release(active) : false;
  }

  return Object.freeze({ Begin, Chunk, End, Abort, dispose });
}
