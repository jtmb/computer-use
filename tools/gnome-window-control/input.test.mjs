import assert from "node:assert/strict";
import test from "node:test";

import { createInputController } from "./input.mjs";
import { resolveKeyval } from "./keymap-fixture.mjs";

const SENDER = ":1.50";
const WINDOW_ID = "window-42";
const FRAME_RECT = { x: 100, y: 80, width: 320, height: 240 };
const BUFFER_RECT = { x: 90, y: 70, width: 640, height: 480 };
const OBSERVATION = {
  windowId: WINDOW_ID,
  width: 320,
  height: 240,
  bufferRect: BUFFER_RECT,
  frameRect: FRAME_RECT,
  resourceScale: 2,
  sha256: "a".repeat(64),
};

const KEYVALS = Object.freeze({
  Return: 0xff0d,
  Tab: 0xff09,
  super: 0xffeb,
  shift: 0xffe1,
  ctrl: 0xffe3,
  alt: 0xffe9,
});

function fixture({
  stateOverrides = {},
  constrainPointer = false,
  constrainAfterMotions = Infinity,
  pointerLagReads = 0,
  timestampStepPerPoll = 0,
  eventTimestamp = 1_234_567_890_123,
  deviceHasDestroy = false,
  provideEventTimestamp = true,
} = {}) {
  let currentTime = 1000;
  let eventTimestampValue = eventTimestamp;
  let timerSequence = 0;
  let pointer = { x: 0, y: 0 };
  let pendingPointer = null;
  let lagRemaining = 0;
  let motionCount = 0;
  const pointerReads = [];
  const scheduleLog = [];
  const releaseFailures = { key: false, button: false };
  const releaseAttempts = { key: 0, button: 0 };
  const events = [];
  const timers = new Map();
  const devices = [];
  const window = {
    get_frame_rect: () => ({ ...FRAME_RECT, ...(stateOverrides.frameRect ?? {}) }),
    get_buffer_rect: () => ({ ...BUFFER_RECT, ...(stateOverrides.bufferRect ?? {}) }),
  };
  const state = {
    locked: false,
    blockedReason: null,
    focusedWindowId: WINDOW_ID,
    windows: [{ id: WINDOW_ID, rect: { ...FRAME_RECT }, protected: false, minimized: false }],
    ...stateOverrides,
  };
  const seat = {
    InputDeviceType: { KEYBOARD_DEVICE: "keyboard", POINTER_DEVICE: "pointer" },
    ButtonState: { PRESSED: "button-down", RELEASED: "button-up" },
    KeyState: { PRESSED: "key-down", RELEASED: "key-up" },
    ScrollDirection: { UP: "up", DOWN: "down", LEFT: "left", RIGHT: "right" },
    ScrollSource: { WHEEL: "wheel" },
    create_virtual_device: type => {
      const device = {
        type,
        notify_absolute_motion: (time, x, y) => {
          events.push({ kind: "motion", x, y, time });
          motionCount += 1;
          if (!constrainPointer && motionCount <= constrainAfterMotions) {
            if (pointerLagReads > 0) {
              pendingPointer = { x, y };
              lagRemaining = pointerLagReads;
            } else {
              pointer = { x, y };
            }
          }
        },
        notify_button: (time, button, buttonState) => {
          if (buttonState === "button-up") {
            releaseAttempts.button += 1;
            if (releaseFailures.button)
              throw new Error("simulated button release failure");
          }
          events.push({ kind: "button", button, state: buttonState, time });
        },
        notify_keyval: (time, keyval, keyState) => {
          if (keyState === "key-up") {
            releaseAttempts.key += 1;
            if (releaseFailures.key)
              throw new Error("simulated key release failure");
          }
          events.push({ kind: "key", keyval, state: keyState, time });
        },
        notify_discrete_scroll: (time, direction, source) => events.push({ kind: "scroll", direction, source, time }),
      };
      if (deviceHasDestroy)
        device.destroy = () => {};
      devices.push(device);
      return device;
    },
  };
  const controller = createInputController({
    now: () => currentTime,
    ...(provideEventTimestamp ? { eventTimestamp: () => eventTimestampValue } : {}),
    getDesktopState: () => state,
    seat,
    resolveWindow: id => id === WINDOW_ID ? { id, window, onActiveWorkspace: true } : null,
    pointerPosition: () => {
      const current = { ...pointer };
      if (lagRemaining > 0) {
        lagRemaining -= 1;
        if (lagRemaining === 0 && pendingPointer) {
          pointer = pendingPointer;
          pendingPointer = null;
        }
      }
      pointerReads.push(current);
      return current;
    },
    schedule: (delay, callback) => {
      const timer = ++timerSequence;
      timers.set(timer, { delay, callback });
      scheduleLog.push(delay);
      if (delay < 1000)
        eventTimestampValue += timestampStepPerPoll;
      return timer;
    },
    cancelSchedule: timer => timers.delete(timer),
    resolveKeyval,
    maxPixels: 1_000_000,
  });
  return {
    controller,
    state,
    events,
    timers,
    devices,
    pointerReads,
    scheduleLog,
    releaseAttempts,
    setEventTimestamp(value) { eventTimestampValue = value },
    setReleaseFailure(kind, enabled) { releaseFailures[kind] = enabled },
    advance(milliseconds) { currentTime += milliseconds; },
    fire(delay) {
      const timer = [...timers.entries()].find(([, item]) => item.delay === delay);
      assert.ok(timer, `expected a scheduled ${delay}ms callback`);
      timers.delete(timer[0]);
      timer[1].callback();
    },
    async settle(promise) {
      let settled = false;
      let value;
      let failure;
      promise.then(
        result => { settled = true; value = result; },
        error => { settled = true; failure = error; },
      );
      for (let iteration = 0; iteration < 40 && !settled; iteration += 1) {
        await Promise.resolve();
        if (settled)
          break;
        const next = [...timers.entries()]
          .filter(([, item]) => item.delay <= 100)
          .sort((first, second) => first[1].delay - second[1].delay)[0];
        if (!next)
          continue;
        timers.delete(next[0]);
        next[1].callback();
      }
      await Promise.resolve();
      if (!settled)
        throw new Error("action did not settle within the test bound");
      if (failure)
        throw failure;
      return value;
    },
    begin(observation = OBSERVATION, sender = SENDER) {
      return controller.begin(observation, sender);
    },
  };
}

function pressed(events) {
  return events.filter(event => event.state === "key-down" || event.state === "button-down");
}

test("device calls carry Clutter microsecond timestamps beyond uint32", () => {
  const eventTimestamp = 987_654_321_012;
  const sample = fixture({ eventTimestamp, deviceHasDestroy: true });
  const operation = sample.begin();
  sample.controller.click(operation, SENDER, { x: 10, y: 10 });
  const timed = sample.events.filter(event => typeof event.time === "number");
  assert.ok(timed.length > 0, "expected device calls with timestamps");
  for (const event of timed)
    assert.equal(event.time, eventTimestamp, `${event.kind} must use the Clutter event time in microseconds`);
});

test("an event timestamp outside the safe integer range refuses before compositor input", () => {
  const sample = fixture({ deviceHasDestroy: true });
  const operation = sample.begin();
  sample.setEventTimestamp(Number.MAX_SAFE_INTEGER + 1);
  assert.throws(() => sample.controller.click(operation, SENDER, { x: 10, y: 10 }), { inputCode: "INPUT_FAILED" });
  assert.deepEqual(sample.events, []);
});

test("input refuses when no Clutter timestamp source is configured", () => {
  const sample = fixture({ deviceHasDestroy: true, provideEventTimestamp: false });
  const operation = sample.begin();
  assert.throws(() => sample.controller.click(operation, SENDER, { x: 10, y: 10 }), { inputCode: "INPUT_FAILED" });
  assert.deepEqual(sample.events, []);
});

test("virtual input devices without destroy() accept bounded input", () => {
  const sample = fixture();
  const operation = sample.begin();
  sample.controller.click(operation, SENDER, { x: 10, y: 10 });
  assert.equal(sample.devices.length, 1);
  assert.equal(typeof sample.devices[0].destroy, "undefined");
  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down", "button-up"]);
  assert.equal(sample.controller.dispose(), true);
});

test("click, drag, scroll, and text use bounded compositor device calls", () => {
  const sample = fixture();
  const clickId = sample.begin();
  const click = sample.controller.click(clickId, SENDER, { x: 10, y: 20 });
  assert.deepEqual(click.points, [{ x: 110, y: 110 }]);
  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down", "button-up"]);

  const dragId = sample.begin();
  sample.controller.drag(dragId, SENDER, { fromX: 0, fromY: 0, toX: 10, toY: 10 });
  assert.equal(sample.events.filter(event => event.kind === "motion").length, 3);

  const scrollId = sample.begin();
  sample.controller.scroll(scrollId, SENDER, { x: 2, y: 3, direction: "down", amount: 2 });
  assert.equal(sample.events.filter(event => event.kind === "scroll").length, 2);

  const textId = sample.begin();
  sample.controller.typeText(textId, SENDER, { text: "Hi!" });
  assert.deepEqual(sample.events.filter(event => event.kind === "key" && event.state === "key-down").map(event => event.keyval), [72, 105, 33]);
});

test("text dispatch uses the actual Shell resolver for all printable ASCII characters", () => {
  const sample = fixture();
  const codes = Array.from({ length: 95 }, (_, index) => index + 0x20);
  const textId = sample.begin();
  sample.controller.typeText(textId, SENDER, { text: String.fromCharCode(...codes) });
  assert.deepEqual(sample.events.filter(event => event.kind === "key" && event.state === "key-down").map(event => event.keyval), codes);
  assert.equal(sample.events.filter(event => event.state === "key-up").length, codes.length);
});

test("a second call during a timed action is refused as BUSY", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.controller.pressKey(operationId, SENDER, { key: "Return", durationMs: 100 });
  assert.throws(
    () => sample.controller.click("another-id", SENDER, { x: 1, y: 1 }),
    { inputCode: "BUSY" },
  );
  sample.fire(100);
  assert.equal(sample.events.filter(event => event.kind === "key" && event.state === "key-up").length, 1);
});

test("operation ids are sender-bound, consumed once, and expire after ten seconds", () => {
  const sample = fixture();
  const foreignId = sample.begin();
  assert.throws(() => sample.controller.click(foreignId, ":1.99", { x: 1, y: 1 }), { inputCode: "INVALID_HANDLE" });
  sample.controller.click(foreignId, SENDER, { x: 1, y: 1 });
  assert.throws(() => sample.controller.click(foreignId, SENDER, { x: 1, y: 1 }), { inputCode: "INVALID_HANDLE" });

  const expiredId = sample.begin();
  sample.advance(10_001);
  assert.throws(() => sample.controller.click(expiredId, SENDER, { x: 1, y: 1 }), { inputCode: "EXPIRED" });
  assert.equal(sample.events.filter(event => event.kind === "button").length, 2);
});

test("locked and blocked desktop states refuse begin without input", () => {
  for (const stateOverrides of [{ locked: true }, { blockedReason: "overview-active" }]) {
    const sample = fixture({ stateOverrides });
    assert.throws(() => sample.begin(), { inputCode: "REFUSED" });
    assert.deepEqual(sample.events, []);
  }
});

test("focus changes after begin refuse input with FOCUS_CHANGED", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.state.focusedWindowId = "window-elsewhere";
  assert.throws(() => sample.controller.click(operationId, SENDER, { x: 2, y: 3 }), { inputCode: "FOCUS_CHANGED" });
  assert.deepEqual(sample.events, []);
});

test("frame or buffer geometry changes after begin refuse input as stale", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.state.windows[0].rect.width += 1;
  assert.throws(() => sample.controller.click(operationId, SENDER, { x: 2, y: 3 }), { inputCode: "STALE" });
  assert.deepEqual(sample.events, []);

  const geometry = {};
  const changedBuffer = fixture({ stateOverrides: geometry });
  const bufferOperationId = changedBuffer.begin();
  geometry.bufferRect = { ...BUFFER_RECT, width: BUFFER_RECT.width + 1 };
  assert.throws(() => changedBuffer.controller.click(bufferOperationId, SENDER, { x: 2, y: 3 }), { inputCode: "STALE" });
  assert.deepEqual(changedBuffer.events, []);
});

test("out-of-range pixels are refused before any compositor input", () => {
  const sample = fixture();
  const operationId = sample.begin();
  assert.throws(() => sample.controller.click(operationId, SENDER, { x: OBSERVATION.width, y: 0 }), { inputCode: "INVALID_REQUEST" });
  assert.deepEqual(sample.events, []);
});

test("a stale pointer readback converges before the click is dispatched", async () => {
  const sample = fixture({ pointerLagReads: 2 });
  const operationId = sample.begin();
  const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10 });
  assert.equal(typeof pending?.then, "function");
  await sample.settle(pending);

  assert.deepEqual(
    sample.events.map(event => event.kind === "button" ? `${event.kind}-${event.state}` : event.kind),
    ["motion", "button-button-down", "button-button-up"],
  );
  assert.equal(sample.events.filter(event => event.kind === "motion").length, 1);
  assert.equal(sample.pointerReads.length, 3);
  assert.deepEqual(sample.scheduleLog.filter(delay => delay < 1000), [16, 16]);
});

test("a second action during pointer convergence is refused as BUSY", async () => {
  const sample = fixture({ pointerLagReads: 3 });
  const operationId = sample.begin();
  const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10 });

  assert.throws(() => sample.controller.pressKey("not-issued", SENDER, { key: "Return" }), { inputCode: "BUSY" });
  assert.throws(() => sample.begin(), { inputCode: "BUSY" });
  await sample.settle(pending);
  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down", "button-up"]);
});

test("permanent pointer nonconvergence fails closed after a bounded wait with zero presses", async () => {
  const sample = fixture({ constrainPointer: true });
  const operationId = sample.begin();
  const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10, keyChord: "super" });
  await assert.rejects(sample.settle(pending), { inputCode: "POINTER_CONSTRAINED" });

  assert.equal(sample.events.some(event => event.kind === "button"), false);
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down", "key-up"]);
  assert.equal(sample.events.filter(event => event.kind === "motion").length, 1);
  assert.equal(sample.pointerReads.length, 7);
  assert.equal(sample.scheduleLog.filter(delay => delay < 1000).length, 6);
  assert.equal(sample.timers.size, 0);
});

test("a monotonic deadline bounds convergence when the pointer never settles", async () => {
  const sample = fixture({ constrainPointer: true, timestampStepPerPoll: 40_000 });
  const operationId = sample.begin();
  const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10 });
  await assert.rejects(sample.settle(pending), { inputCode: "POINTER_CONSTRAINED" });

  assert.equal(sample.events.some(event => event.kind === "button"), false);
  assert.equal(sample.pointerReads.length, 4);
  assert.equal(sample.scheduleLog.filter(delay => delay < 1000).length, 3);
  assert.equal(sample.timers.size, 0);
});

test("a drag whose second motion never converges releases the held button", async () => {
  const sample = fixture({ constrainAfterMotions: 1 });
  const operationId = sample.begin();
  const pending = sample.controller.drag(operationId, SENDER, { fromX: 0, fromY: 0, toX: 10, toY: 10 });
  await assert.rejects(sample.settle(pending), { inputCode: "POINTER_CONSTRAINED" });

  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down", "button-up"]);
  assert.equal(sample.events.filter(event => event.kind === "motion").length, 2);
  assert.equal(sample.timers.size, 0);
});

test("target invalidation during pointer convergence refuses before any press", async () => {
  const sample = fixture({ pointerLagReads: 4 });
  const operationId = sample.begin();
  const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10, keyChord: "super" });
  sample.state.windows = [];

  await assert.rejects(sample.settle(pending), { inputCode: "STALE" });
  assert.equal(sample.events.some(event => event.kind === "button"), false);
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down", "key-up"]);
  assert.equal(sample.timers.size, 0);
});

test("dispose during pointer convergence cancels without a press", async () => {
  const sample = fixture({ pointerLagReads: 4 });
  const operationId = sample.begin();
  const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10, keyChord: "super" });

  assert.equal(sample.controller.dispose(), true);
  await assert.rejects(sample.settle(pending), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.events.some(event => event.kind === "button"), false);
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down", "key-up"]);
  assert.equal(sample.timers.size, 0);
});

test("releaseAll during pointer convergence cancels the action and releases held keys", async () => {
  const sample = fixture({ pointerLagReads: 4 });
  const operationId = sample.begin();
  const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10, keyChord: "super" });

  assert.deepEqual(sample.controller.releaseAll(SENDER), { released: true });
  await assert.rejects(sample.settle(pending), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.events.some(event => event.kind === "button"), false);
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down", "key-up"]);
  assert.equal(sample.timers.size, 0);
});

for (const stop of ["releaseAll", "dispose"]) {
  test(`${stop} after convergence but before dispatch prevents a queued click`, async () => {
    const sample = fixture({ pointerLagReads: 1 });
    const operationId = sample.begin();
    const pending = sample.controller.click(operationId, SENDER, { x: 10, y: 10 });
    sample.fire(16);
    sample.controller[stop](SENDER);
    const outcome = await sample.settle(pending).then(() => "completed", error => error.inputCode);
    assert.equal(sample.events.some(event => event.state === "button-down"), false,
      "a resolved motion wait must not dispatch after cancellation");
    assert.equal(outcome, "INPUT_FAILED");
  });
}

test("cancelled old promise cleanup cannot release a newer action's held key", async () => {
  const sample = fixture({ pointerLagReads: 4 });
  const pending = sample.controller.click(sample.begin(), SENDER, { x: 10, y: 10, keyChord: "super" });
  sample.controller.releaseAll(SENDER);
  sample.controller.pressKey(sample.begin(), SENDER, { key: "Tab", durationMs: 500 });
  await assert.rejects(sample.settle(pending), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.events.filter(event => event.state === "key-up" && event.keyval === KEYVALS.Tab).length, 0,
    "old cancelled work must not release input owned by the newer action");
  sample.fire(500);
  assert.equal(sample.events.filter(event => event.state === "key-up" && event.keyval === KEYVALS.Tab).length, 1);
});

test("releaseAll after drag convergence prevents the queued button press", async () => {
  const sample = fixture({ pointerLagReads: 1 });
  const operationId = sample.begin();
  const pending = sample.controller.drag(operationId, SENDER, { fromX: 0, fromY: 0, toX: 10, toY: 10 });
  sample.fire(16);
  sample.controller.releaseAll(SENDER);
  const outcome = await sample.settle(pending).then(() => "completed", error => error.inputCode);
  assert.equal(sample.events.some(event => event.state === "button-down"), false,
    "a resolved drag wait must not press after cancellation");
  assert.equal(outcome, "INPUT_FAILED");
  assert.equal(sample.timers.size, 0);
});

test("releaseAll after scroll convergence prevents queued wheel events", async () => {
  const sample = fixture({ pointerLagReads: 1 });
  const operationId = sample.begin();
  const pending = sample.controller.scroll(operationId, SENDER, { x: 10, y: 10, direction: "down", amount: 2 });
  sample.fire(16);
  sample.controller.releaseAll(SENDER);
  const outcome = await sample.settle(pending).then(() => "completed", error => error.inputCode);
  assert.equal(sample.events.some(event => event.kind === "scroll"), false,
    "a resolved scroll wait must not dispatch after cancellation");
  assert.equal(outcome, "INPUT_FAILED");
  assert.equal(sample.timers.size, 0);
});

test("a completed click's cleanup cannot release a newer timed hold", async () => {
  const sample = fixture({ pointerLagReads: 1 });
  const pending = sample.controller.click(sample.begin(), SENDER, { x: 10, y: 10 });
  let oldSettled = false;
  pending.then(() => { oldSettled = true; }, () => { oldSettled = true; });
  sample.fire(16);
  await Promise.resolve();
  assert.equal(sample.events.filter(event => event.kind === "button").length, 2);
  assert.equal(oldSettled, false, "successful completion cleanup must still be pending");

  sample.controller.releaseAll(SENDER);
  sample.controller.pressKey(sample.begin(), SENDER, { key: "Tab", durationMs: 500 });
  await sample.settle(pending);
  assert.equal(sample.events.filter(event => event.state === "key-up" && event.keyval === KEYVALS.Tab).length, 0,
    "old successful work must not release input owned by the newer action");
  sample.fire(500);
  assert.equal(sample.events.filter(event => event.state === "key-up" && event.keyval === KEYVALS.Tab).length, 1);
});

test("releaseAll during a drag's second pointer wait releases the held button", async () => {
  const sample = fixture({ constrainAfterMotions: 1 });
  const operationId = sample.begin();
  const pending = sample.controller.drag(operationId, SENDER, { fromX: 0, fromY: 0, toX: 10, toY: 10 });
  sample.controller.releaseAll(SENDER);
  await assert.rejects(sample.settle(pending), { inputCode: "INPUT_FAILED" });

  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down", "button-up"]);
  assert.equal(sample.timers.size, 0);
});

test("a queued old pointer callback cannot clear a drag's newer wait timer", async () => {
  const sample = fixture({ pointerLagReads: 1 });
  const pending = sample.controller.drag(sample.begin(), SENDER, { fromX: 0, fromY: 0, toX: 10, toY: 10 });
  const oldPoll = [...sample.timers.values()].find(timer => timer.delay === 16).callback;
  sample.fire(16);
  await Promise.resolve();
  assert.equal(sample.events.filter(event => event.kind === "motion").length, 2);
  oldPoll();
  sample.controller.releaseAll(SENDER);
  assert.equal(sample.timers.size, 0, "release must cancel the newer wait before promise cleanup runs");
  await assert.rejects(sample.settle(pending), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.timers.size, 0, "cancellation must retain the newer wait's timer identity");
  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down", "button-up"]);
});

test("a queued cancelled timed-release callback cannot release a newer key hold", () => {
  const sample = fixture();
  sample.controller.pressKey(sample.begin(), SENDER, { key: "Return", durationMs: 100 });
  const oldRelease = [...sample.timers.values()].find(timer => timer.delay === 100).callback;
  sample.controller.releaseAll(SENDER);
  sample.controller.pressKey(sample.begin(), SENDER, { key: "Tab", durationMs: 500 });
  oldRelease();
  assert.equal(sample.events.filter(event => event.state === "key-up" && event.keyval === KEYVALS.Tab).length, 0);
  assert.throws(() => sample.begin(), { inputCode: "BUSY" });
  sample.fire(500);
  assert.equal(sample.events.filter(event => event.state === "key-up" && event.keyval === KEYVALS.Tab).length, 1);
});

test("timed presses above two seconds, unknown keys, and overlong text are refused", () => {
  const sample = fixture();
  const tooLongId = sample.begin();
  assert.throws(() => sample.controller.pressKey(tooLongId, SENDER, { key: "Return", durationMs: 2001 }), { inputCode: "INVALID_REQUEST" });
  assert.deepEqual(sample.events, []);

  const unknownId = sample.begin();
  assert.throws(() => sample.controller.pressKey(unknownId, SENDER, { key: "NoSuchKey" }), { inputCode: "INVALID_REQUEST" });
  assert.deepEqual(sample.events, []);

  const textId = sample.begin();
  assert.throws(() => sample.controller.typeText(textId, SENDER, { text: "a".repeat(1025) }), { inputCode: "INVALID_REQUEST" });
  assert.deepEqual(sample.events, []);
});

test("releaseAll is idempotent and releases a timed key", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.controller.pressKey(operationId, SENDER, { key: "Tab", durationMs: 500 });
  assert.deepEqual(pressed(sample.events).map(event => event.kind), ["key"]);
  assert.deepEqual(sample.controller.releaseAll(":1.99"), { released: true });
  assert.deepEqual(sample.controller.releaseAll(SENDER), { released: true });
  assert.equal(sample.events.filter(event => event.kind === "key" && event.state === "key-up").length, 1);
  assert.equal(sample.timers.size, 0);
});

test("failed key release stays tracked, blocks input, and can be retried", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.setReleaseFailure("key", true);

  assert.throws(
    () => sample.controller.pressKey(operationId, SENDER, { key: "Return" }),
    { inputCode: "INPUT_FAILED" },
  );
  assert.equal(sample.releaseAttempts.key, 2);
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down"]);
  assert.throws(() => sample.controller.releaseAll(SENDER), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.releaseAttempts.key, 3);

  assert.throws(() => sample.begin(), { inputCode: "INPUT_FAILED" });
  const eventCount = sample.events.length;
  assert.throws(() => sample.controller.click("not-issued", SENDER, { x: 1, y: 1 }), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.events.length, eventCount);

  sample.setReleaseFailure("key", false);
  assert.deepEqual(sample.controller.releaseAll(SENDER), { released: true });
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down", "key-up"]);
  const nextOperation = sample.begin();
  sample.controller.click(nextOperation, SENDER, { x: 1, y: 1 });
});

test("failed button release stays tracked, blocks input, and can be retried", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.setReleaseFailure("button", true);

  assert.throws(
    () => sample.controller.click(operationId, SENDER, { x: 10, y: 10 }),
    { inputCode: "INPUT_FAILED" },
  );
  assert.equal(sample.releaseAttempts.button, 2);
  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down"]);
  assert.throws(() => sample.controller.releaseAll(SENDER), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.releaseAttempts.button, 3);

  assert.throws(() => sample.begin(), { inputCode: "INPUT_FAILED" });
  const eventCount = sample.events.length;
  assert.throws(() => sample.controller.click("not-issued", SENDER, { x: 1, y: 1 }), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.events.length, eventCount);

  sample.setReleaseFailure("button", false);
  assert.deepEqual(sample.controller.releaseAll(SENDER), { released: true });
  assert.deepEqual(sample.events.filter(event => event.kind === "button").map(event => event.state), ["button-down", "button-up"]);
});

test("dispose reports failed key release and permits an explicit retry", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.controller.pressKey(operationId, SENDER, { key: "Tab", durationMs: 500 });
  sample.setReleaseFailure("key", true);

  assert.throws(() => sample.controller.dispose(), { inputCode: "INPUT_FAILED" });
  assert.equal(sample.releaseAttempts.key, 1);
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down"]);

  sample.setReleaseFailure("key", false);
  assert.deepEqual(sample.controller.releaseAll(SENDER), { released: true });
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down", "key-up"]);
  assert.equal(sample.controller.dispose(), true);
});

test("timed release failure clears the queue but blocks input until release succeeds", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.controller.pressKey(operationId, SENDER, { key: "Tab", durationMs: 100 });
  sample.setReleaseFailure("key", true);

  assert.throws(() => sample.fire(100), { inputCode: "INPUT_FAILED" });
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down"]);
  assert.throws(() => sample.begin(), { inputCode: "INPUT_FAILED" });

  sample.setReleaseFailure("key", false);
  assert.deepEqual(sample.controller.releaseAll(SENDER), { released: true });
  assert.deepEqual(sample.events.filter(event => event.kind === "key").map(event => event.state), ["key-down", "key-up"]);
});

test("dispose releases held input and invalidates the controller", () => {
  const sample = fixture();
  const operationId = sample.begin();
  sample.controller.pressKey(operationId, SENDER, { key: "Return", durationMs: 1000 });
  assert.equal(sample.controller.dispose(), true);
  assert.equal(sample.controller.dispose(), false);
  assert.equal(sample.events.filter(event => event.kind === "key" && event.state === "key-up").length, 1);
  assert.throws(() => sample.controller.click(operationId, SENDER, { x: 1, y: 1 }), { inputCode: "INVALID_HANDLE" });

  const pending = fixture();
  const pendingId = pending.begin();
  pending.controller.dispose();
  assert.throws(() => pending.controller.click(pendingId, SENDER, { x: 1, y: 1 }), { inputCode: "INVALID_HANDLE" });
});
