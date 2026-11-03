import { LIMITS, RuntimeError } from "./runtime-contract.mjs";

const INPUT_CODES = Object.freeze({
  INVALID_REQUEST: "INVALID_INPUT",
  REFUSED: "INVALID_CONTEXT",
  BUSY: "INVALID_CONTEXT",
  STALE: "STALE_TARGET",
  FOCUS_CHANGED: "STALE_TARGET",
  POINTER_CONSTRAINED: "INVALID_CONTEXT",
  INVALID_HANDLE: "STALE_TARGET",
  EXPIRED: "STALE_TARGET",
  INPUT_FAILED: "INTERNAL",
});
const OPERATION_TTL_MS = 10_000;
const POINTER_TOLERANCE = 2;
const POINTER_POLL_MS = 16;
const POINTER_POLL_ATTEMPTS = 6;
const POINTER_CONVERGENCE_US = 100_000;
const CLICK_COUNT_MAX = 10;
const SCROLL_AMOUNT_MAX = 100;
const MODIFIER_NAMES = new Set([
  "shift", "shift_l", "shift_r", "ctrl", "control", "control_l", "control_r",
  "alt", "alt_l", "alt_r", "option", "super", "super_l", "super_r", "meta",
  "hyper", "cmd", "command", "win", "windows",
]);

export class InputError extends RuntimeError {
  constructor(inputCode) {
    super(INPUT_CODES[inputCode] ?? "INTERNAL");
    this.name = "InputError";
    this.inputCode = INPUT_CODES[inputCode] ? inputCode : "INPUT_FAILED";
  }
}

function fail(code) {
  throw new InputError(code);
}

function rectangle(value) {
  if (!value || !["x", "y", "width", "height"].every(key => Number.isSafeInteger(value[key])))
    fail("INVALID_REQUEST");
  if (value.width <= 0 || value.height <= 0)
    fail("INVALID_REQUEST");
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function sameRectangle(first, second) {
  return ["x", "y", "width", "height"].every(key => first[key] === second[key]);
}

function validDuration(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > LIMITS.TIMED_INPUT_MAX_MS)
    fail("INVALID_REQUEST");
  return value;
}

/**
 * Clutter virtual-device calls take a guint64 event timestamp in monotonic microseconds.
 */
function eventTime(eventTimestamp) {
  if (typeof eventTimestamp !== "function")
    fail("INPUT_FAILED");
  const timestamp = eventTimestamp();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0)
    fail("INPUT_FAILED");
  return timestamp;
}

export function createInputController({
  now = () => Date.now(),
  getDesktopState,
  seat,
  resolveWindow,
  pointerPosition,
  schedule,
  cancelSchedule,
  resolveKeyval,
  maxPixels,
  eventTimestamp,
}) {
  if (typeof getDesktopState !== "function" || !seat ||
      typeof seat.create_virtual_device !== "function" ||
      typeof resolveWindow !== "function" || typeof pointerPosition !== "function" ||
      typeof schedule !== "function" || typeof cancelSchedule !== "function" ||
      typeof resolveKeyval !== "function" || !Number.isSafeInteger(maxPixels) || maxPixels <= 0 ||
      typeof now !== "function" || (eventTimestamp !== undefined && typeof eventTimestamp !== "function"))
    throw new TypeError("Input controller dependencies are incomplete");

  let activeOperation = null;
  let inFlight = null;
  let pointerDevice = null;
  let keyboardDevice = null;
  let disposed = false;
  let sequence = 0;
  const held = [];
  const expiredIds = new Set();

  function token() {
    sequence += 1;
    return `${Math.trunc(now()).toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function cancelTimer(timer) {
    if (timer === null || timer === undefined)
      return;
    try {
      cancelSchedule(timer);
    } catch {
      // Release and invalidation must finish even when the source already fired.
    }
  }

  function removeExpired(record) {
    if (activeOperation !== record)
      return false;
    activeOperation = null;
    expiredIds.add(record.operationId);
    if (expiredIds.size > 128)
      expiredIds.delete(expiredIds.values().next().value);
    cancelTimer(record.timer);
    record.timer = null;
    return true;
  }

  function expireIfDue(record) {
    const elapsed = now() - record.createdAt;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= OPERATION_TTL_MS) {
      removeExpired(record);
      fail("EXPIRED");
    }
  }

  function assertState(record) {
    let state;
    try {
      state = getDesktopState();
    } catch {
      fail("REFUSED");
    }
    if (!state || typeof state !== "object" || state.locked || state.blockedReason)
      fail("REFUSED");
    if (state.focusedWindowId !== record.windowId)
      fail("FOCUS_CHANGED");
    const matches = Array.isArray(state.windows)
      ? state.windows.filter(window => window?.id === record.windowId)
      : [];
    if (matches.length !== 1)
      fail("STALE");
    const inventoryWindow = matches[0];
    if (inventoryWindow.protected || inventoryWindow.minimized)
      fail("REFUSED");
    let inventoryFrame;
    try {
      inventoryFrame = rectangle(inventoryWindow.rect);
    } catch {
      fail("STALE");
    }
    if (!sameRectangle(inventoryFrame, record.frameRect))
      fail("STALE");

    let resolved;
    try {
      resolved = resolveWindow(record.windowId);
    } catch {
      fail("STALE");
    }
    if (!resolved || resolved.id !== record.windowId || resolved.onActiveWorkspace === false || !resolved.window)
      fail("STALE");
    let frameRect;
    let bufferRect;
    try {
      frameRect = rectangle(resolved.window.get_frame_rect());
      bufferRect = rectangle(resolved.window.get_buffer_rect());
    } catch {
      fail("STALE");
    }
    if (!sameRectangle(frameRect, record.frameRect) || !sameRectangle(bufferRect, record.bufferRect))
      fail("STALE");
    return state;
  }

  function validateObservation(observation, sender) {
    if (typeof sender !== "string" || sender.length === 0 || !observation ||
        typeof observation !== "object" || Array.isArray(observation) ||
        typeof observation.windowId !== "string" || observation.windowId.length === 0 ||
        !Number.isSafeInteger(observation.width) || observation.width <= 0 ||
        !Number.isSafeInteger(observation.height) || observation.height <= 0 ||
        !Number.isSafeInteger(observation.width * observation.height) ||
        observation.width * observation.height > maxPixels ||
        !Number.isFinite(observation.resourceScale) || observation.resourceScale <= 0 ||
        typeof observation.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(observation.sha256))
      fail("INVALID_REQUEST");
    let bufferRect;
    let frameRect;
    try {
      bufferRect = rectangle(observation.bufferRect);
      frameRect = rectangle(observation.frameRect);
    } catch {
      fail("INVALID_REQUEST");
    }
    return {
      windowId: observation.windowId,
      width: observation.width,
      height: observation.height,
      bufferRect,
      frameRect,
      resourceScale: observation.resourceScale,
      sha256: observation.sha256.toLowerCase(),
    };
  }

  function createDevice(kind) {
    if (disposed)
      fail("INVALID_HANDLE");
    const deviceType = seat.InputDeviceType?.[kind === "pointer" ? "POINTER_DEVICE" : "KEYBOARD_DEVICE"];
    if (deviceType === undefined)
      fail("INPUT_FAILED");
    try {
      const device = seat.create_virtual_device(deviceType);
      if (!device)
        fail("INPUT_FAILED");
      return device;
    } catch (error) {
      if (error instanceof InputError)
        throw error;
      fail("INPUT_FAILED");
    }
  }

  function getPointerDevice() {
    if (!pointerDevice)
      pointerDevice = createDevice("pointer");
    return pointerDevice;
  }

  function getKeyboardDevice() {
    if (!keyboardDevice)
      keyboardDevice = createDevice("keyboard");
    return keyboardDevice;
  }

  function pressKeyval(record, run, keyval) {
    assertState(record);
    const device = getKeyboardDevice();
    try {
      device.notify_keyval(eventTime(eventTimestamp), keyval, seat.KeyState.PRESSED);
      held.push({ kind: "key", device, value: keyval, run });
    } catch {
      fail("INPUT_FAILED");
    }
  }

  function pressButton(record, run, button) {
    assertState(record);
    const device = getPointerDevice();
    try {
      device.notify_button(eventTime(eventTimestamp), button, seat.ButtonState.PRESSED);
      held.push({ kind: "button", device, value: button, run });
    } catch {
      fail("INPUT_FAILED");
    }
  }

  function releaseOne(index) {
    const item = held[index];
    if (!item)
      return;
    const state = item.kind === "key" ? seat.KeyState.RELEASED : seat.ButtonState.RELEASED;
    const method = item.kind === "key" ? "notify_keyval" : "notify_button";
    item.device[method](eventTime(eventTimestamp), item.value, state);
    held.splice(index, 1);
  }

  function releaseHeld(owner = null) {
    let failed = false;
    for (let index = held.length - 1; index >= 0; index -= 1) {
      if (owner !== null && held[index].run !== owner)
        continue;
      try {
        releaseOne(index);
      } catch {
        failed = true;
      }
    }
    if (failed)
      fail("INPUT_FAILED");
  }

  function consumeOperation(operationId, sender) {
    if (typeof operationId !== "string" || !activeOperation || activeOperation.operationId !== operationId) {
      if (typeof operationId === "string" && expiredIds.has(operationId))
        fail("EXPIRED");
      fail("INVALID_HANDLE");
    }
    const record = activeOperation;
    if (typeof sender !== "string" || sender !== record.sender)
      fail("INVALID_HANDLE");
    expireIfDue(record);
    activeOperation = null;
    cancelTimer(record.timer);
    record.timer = null;
    return record;
  }

  function pointFor(record, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
        x >= record.width || y >= record.height)
      fail("INVALID_REQUEST");
    const point = {
      x: record.bufferRect.x + x * record.bufferRect.width / record.width,
      y: record.bufferRect.y + y * record.bufferRect.height / record.height,
    };
    if (point.x < record.bufferRect.x || point.y < record.bufferRect.y ||
        point.x >= record.bufferRect.x + record.bufferRect.width ||
        point.y >= record.bufferRect.y + record.bufferRect.height)
      fail("INVALID_REQUEST");
    return point;
  }

  function pointerSettled(point) {
    let actual;
    try {
      actual = pointerPosition();
    } catch {
      return false;
    }
    return Boolean(actual) && Number.isFinite(actual.x) && Number.isFinite(actual.y) &&
      Math.hypot(actual.x - point.x, actual.y - point.y) <= POINTER_TOLERANCE;
  }

  function monotonicMicroseconds() {
    try {
      return eventTime(eventTimestamp);
    } catch {
      return null;
    }
  }

  function waitForPointer(record, run, point) {
    if (pointerSettled(point))
      return null;
    // The Clutter event clock is monotonic; the attempt cap still bounds the
    // wait when that provider cannot supply a usable deadline.
    const started = monotonicMicroseconds();
    const deadline = started === null ? null : started + POINTER_CONVERGENCE_US;
    return new Promise((resolve, reject) => {
      let attempts = 0;
      let settled = false;
      const finish = error => {
        if (settled)
          return;
        settled = true;
        const timer = run.waitTimer;
        run.waitTimer = null;
        run.cancelWait = null;
        if (timer !== null)
          cancelTimer(timer);
        if (error)
          reject(error);
        else
          resolve();
      };
      run.cancelWait = () => finish(new InputError("INPUT_FAILED"));
      const poll = () => {
        // A callback already queued by the source may still run after finish.
        if (settled)
          return;
        run.waitTimer = null;
        if (run.finished) {
          finish(new InputError("INPUT_FAILED"));
          return;
        }
        attempts += 1;
        try {
          assertState(record);
        } catch (error) {
          finish(error instanceof InputError ? error : new InputError("INPUT_FAILED"));
          return;
        }
        if (pointerSettled(point)) {
          finish(null);
          return;
        }
        const current = deadline === null ? null : monotonicMicroseconds();
        if ((current !== null && current >= deadline) || attempts >= POINTER_POLL_ATTEMPTS) {
          finish(new InputError("POINTER_CONSTRAINED"));
          return;
        }
        try {
          run.waitTimer = schedule(POINTER_POLL_MS, poll);
        } catch {
          finish(new InputError("INPUT_FAILED"));
        }
      };
      try {
        run.waitTimer = schedule(POINTER_POLL_MS, poll);
      } catch {
        finish(new InputError("INPUT_FAILED"));
      }
    });
  }

  function movePointer(record, run, point) {
    assertState(record);
    const device = getPointerDevice();
    try {
      device.notify_absolute_motion(eventTime(eventTimestamp), point.x, point.y);
    } catch {
      fail("INPUT_FAILED");
    }
    return waitForPointer(record, run, point);
  }

  function keySequence(record, run, key, hold = false) {
    let resolved;
    try {
      resolved = resolveKeyval(key);
    } catch {
      fail("INVALID_REQUEST");
    }
    if (!resolved || !Number.isSafeInteger(resolved.keyval) || resolved.keyval <= 0 ||
        !Array.isArray(resolved.modifiers) ||
        resolved.modifiers.some(value => !Number.isSafeInteger(value) || value <= 0))
      fail("INVALID_REQUEST");
    const start = held.length;
    for (const modifier of resolved.modifiers)
      pressKeyval(record, run, modifier);
    pressKeyval(record, run, resolved.keyval);
    if (!hold)
      releaseFrom(start);
    return start;
  }

  function modifierKeyvals(keyChord) {
    if (keyChord === undefined || keyChord === null || keyChord === "")
      return [];
    const parts = Array.isArray(keyChord)
      ? keyChord
      : typeof keyChord === "string" ? keyChord.split("+") : null;
    if (!parts || parts.length === 0 || parts.some(part => typeof part !== "string" || part.length === 0))
      fail("INVALID_REQUEST");
    const result = [];
    for (const name of parts) {
      if (!MODIFIER_NAMES.has(name.toLowerCase()))
        fail("INVALID_REQUEST");
      let resolved;
      try {
        resolved = resolveKeyval(name);
      } catch {
        fail("INVALID_REQUEST");
      }
      if (!resolved || !Number.isSafeInteger(resolved.keyval) || resolved.keyval <= 0 ||
          !Array.isArray(resolved.modifiers) || resolved.modifiers.length !== 0)
        fail("INVALID_REQUEST");
      result.push(resolved.keyval);
    }
    return result;
  }

  function releaseFrom(start) {
    for (let index = held.length - 1; index >= start; index -= 1) {
      try {
        releaseOne(index);
      } catch {
        fail("INPUT_FAILED");
      }
    }
  }

  function scheduleTimedRelease(record, run, durationMs) {
    if (durationMs === 0)
      return;
    run.timed = true;
    run.timer = null;
    run.finished = false;
    const timer = schedule(durationMs, () => {
      if (run.finished)
        return;
      run.finished = true;
      try {
        releaseHeld(run);
      } finally {
        if (inFlight === run)
          inFlight = null;
      }
    });
    if (run.finished)
      cancelTimer(timer);
    else
      run.timer = timer;
  }

  function assertRunActive(run) {
    if (disposed || run.finished || inFlight !== run)
      fail("INPUT_FAILED");
  }

  function failRun(run, error) {
    let cleanupError = null;
    try {
      releaseHeld(run);
    } catch (release) {
      cleanupError = release;
    } finally {
      if (inFlight === run)
        inFlight = null;
    }
    if (cleanupError)
      throw cleanupError;
    if (error instanceof InputError)
      throw error;
    fail("INPUT_FAILED");
  }

  function completeRun(run, value) {
    let cleanupError = null;
    try {
      if (!run.timed)
        releaseHeld(run);
    } catch (release) {
      cleanupError = release;
    } finally {
      if (!run.timed && inFlight === run)
        inFlight = null;
    }
    if (cleanupError)
      throw cleanupError;
    return value;
  }

  function perform(operationId, sender, callback) {
    if (disposed)
      fail("INVALID_HANDLE");
    if (inFlight)
      fail("BUSY");
    if (held.length > 0)
      fail("INPUT_FAILED");
    const run = {
      sender, timer: null, timed: false, finished: false, waitTimer: null, cancelWait: null,
    };
    inFlight = run;
    let record;
    try {
      record = consumeOperation(operationId, sender);
      assertState(record);
      const pending = callback(record, run);
      if (pending !== null && typeof pending?.then === "function") {
        return Promise.resolve(pending).then(
          value => completeRun(run, value),
          error => failRun(run, error),
        );
      }
      return completeRun(run, pending);
    } catch (error) {
      return failRun(run, error);
    }
  }

  function begin(observation, sender) {
    if (disposed)
      fail("INVALID_HANDLE");
    if (inFlight)
      fail("BUSY");
    if (held.length > 0)
      fail("INPUT_FAILED");
    if (activeOperation) {
      expireIfDue(activeOperation);
      if (activeOperation)
        fail("BUSY");
    }
    const verified = validateObservation(observation, sender);
    assertState(verified);
    const record = {
      ...verified,
      sender,
      operationId: token(),
      createdAt: now(),
      timer: null,
    };
    activeOperation = record;
    try {
      record.timer = schedule(OPERATION_TTL_MS, () => removeExpired(record));
    } catch {
      activeOperation = null;
      fail("INPUT_FAILED");
    }
    return record.operationId;
  }

  function click(operationId, sender, {
    x,
    y,
    button = 1,
    clickCount = 1,
    durationMs = 0,
    keyChord,
  } = {}) {
    return perform(operationId, sender, (record, run) => {
      const duration = validDuration(durationMs);
      if (!Number.isSafeInteger(button) || button < 1 || button > 32 ||
          !Number.isSafeInteger(clickCount) || clickCount < 1 || clickCount > CLICK_COUNT_MAX ||
          (duration > 0 && clickCount !== 1))
        fail("INVALID_REQUEST");
      const point = pointFor(record, x, y);
      for (const modifier of modifierKeyvals(keyChord))
        pressKeyval(record, run, modifier);
      const settle = movePointer(record, run, point);
      const dispatch = () => {
        assertRunActive(run);
        for (let index = 0; index < clickCount; index += 1) {
          pressButton(record, run, button);
          if (duration > 0) {
            scheduleTimedRelease(record, run, duration);
            break;
          }
          releaseFrom(held.length - 1);
        }
        return { action: "click", at: now(), windowId: record.windowId, points: [point] };
      };
      return settle ? settle.then(dispatch) : dispatch();
    });
  }

  function drag(operationId, sender, { fromX, fromY, toX, toY, durationMs = 0 } = {}) {
    return perform(operationId, sender, (record, run) => {
      const duration = validDuration(durationMs);
      const from = pointFor(record, fromX, fromY);
      const to = pointFor(record, toX, toY);
      const dragTo = () => {
        assertRunActive(run);
        pressButton(record, run, 1);
        const settle = movePointer(record, run, to);
        const finish = () => {
          assertRunActive(run);
          scheduleTimedRelease(record, run, duration);
          return { action: "drag", at: now(), windowId: record.windowId, points: [from, to] };
        };
        return settle ? settle.then(finish) : finish();
      };
      const settle = movePointer(record, run, from);
      return settle ? settle.then(dragTo) : dragTo();
    });
  }

  function scroll(operationId, sender, { x, y, direction, amount = 1 } = {}) {
    return perform(operationId, sender, (record, run) => {
      const directions = {
        up: seat.ScrollDirection?.UP,
        down: seat.ScrollDirection?.DOWN,
        left: seat.ScrollDirection?.LEFT,
        right: seat.ScrollDirection?.RIGHT,
      };
      const scrollDirection = directions[direction];
      if (scrollDirection === undefined || !Number.isSafeInteger(amount) || amount < 1 || amount > SCROLL_AMOUNT_MAX)
        fail("INVALID_REQUEST");
      const point = pointFor(record, x, y);
      const settle = movePointer(record, run, point);
      const dispatch = () => {
        assertRunActive(run);
        const device = getPointerDevice();
        for (let index = 0; index < amount; index += 1) {
          assertState(record);
          try {
            device.notify_discrete_scroll(
              eventTime(eventTimestamp), scrollDirection, seat.ScrollSource?.WHEEL,
            );
          } catch {
            fail("INPUT_FAILED");
          }
        }
        return { action: "scroll", at: now(), windowId: record.windowId, points: [point] };
      };
      return settle ? settle.then(dispatch) : dispatch();
    });
  }

  function pressKey(operationId, sender, { key, durationMs = 0 } = {}) {
    return perform(operationId, sender, (record, run) => {
      const duration = validDuration(durationMs);
      const start = keySequence(record, run, key, duration > 0);
      if (duration > 0)
        scheduleTimedRelease(record, run, duration);
      else
        releaseFrom(start);
      return { action: "pressKey", at: now(), windowId: record.windowId };
    });
  }

  function typeText(operationId, sender, { text } = {}) {
    return perform(operationId, sender, (record, run) => {
      if (typeof text !== "string" || Array.from(text).length > 1024 ||
          Array.from(text).some(character => {
            const codePoint = character.codePointAt(0);
            return codePoint < 0x20 || codePoint > 0x7e;
          }))
        fail("INVALID_REQUEST");
      for (const character of text)
        keySequence(record, run, character);
      return { action: "typeText", at: now(), windowId: record.windowId };
    });
  }

  function releaseAll(sender) {
    if (inFlight && inFlight.timer !== null)
      cancelTimer(inFlight.timer);
    if (inFlight) {
      if (typeof inFlight.cancelWait === "function")
        inFlight.cancelWait();
      inFlight.finished = true;
    }
    inFlight = null;
    releaseHeld();
    return { released: true };
  }

  function dispose() {
    if (disposed)
      return false;
    if (activeOperation) {
      cancelTimer(activeOperation.timer);
      activeOperation = null;
    }
    if (inFlight) {
      if (inFlight.timer !== null)
        cancelTimer(inFlight.timer);
      if (typeof inFlight.cancelWait === "function")
        inFlight.cancelWait();
      inFlight.finished = true;
    }
    inFlight = null;
    releaseHeld();
    disposed = true;
    pointerDevice = null;
    keyboardDevice = null;
    expiredIds.clear();
    return true;
  }

  return Object.freeze({ begin, click, drag, scroll, pressKey, typeText, releaseAll, dispose });
}
