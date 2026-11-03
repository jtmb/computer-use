import assert from "node:assert/strict";
import test from "node:test";
import { createInputController } from "./input.mjs";

// Model only the native void-notify/queued-task boundary, not a compositor or GTK delivery.
function queuedSeat() {
  const rect = { x: 100, y: 80, width: 320, height: 240 };
  const observation = { windowId: "owned", width: 320, height: 240, frameRect: rect,
    bufferRect: rect, resourceScale: 1, sha256: "a".repeat(64) };
  const pending = [], delivered = [], timers = new Map(), counts = new Map(), devices = [];
  let timerId = 0, destroyed = 0;
  const seat = {
    InputDeviceType: { POINTER_DEVICE: "pointer", KEYBOARD_DEVICE: "keyboard" },
    ButtonState: { PRESSED: 1, RELEASED: 0 }, KeyState: { PRESSED: 1, RELEASED: 0 },
    create_virtual_device(kind) {
      const id = devices.length;
      const device = {
        notify_absolute_motion(time, x, y) { pending.push({ kind: "motion", id, time, x, y }); },
        notify_button(time, value, state) { pending.push({ kind: "button", id, time, value, state }); },
        notify_keyval(time, value, state) { pending.push({ kind: "key", id, time, value, state }); },
        destroy() { destroyed++; },
      };
      devices.push({ kind, device });
      return device;
    },
  };
  const controller = createInputController({
    now: () => 1000, eventTimestamp: () => 1_000_000, seat,
    getDesktopState: () => ({ locked: false, blockedReason: null, focusedWindowId: "owned",
      windows: [{ id: "owned", rect, minimized: false, protected: false }] }),
    resolveWindow: () => ({ id: "owned", onActiveWorkspace: true,
      window: { get_frame_rect: () => rect, get_buffer_rect: () => rect } }),
    pointerPosition: () => ({ x: 110, y: 110 }),
    schedule(delay, callback) { const id = ++timerId; timers.set(id, { delay, callback }); return id; },
    cancelSchedule(id) { timers.delete(id); },
    resolveKeyval: name => name === "ctrl" ? { keyval: 0xffe3, modifiers: [] } : null,
    maxPixels: 1_000_000,
  });
  return {
    controller, pending, delivered, timers, devices,
    get destroyed() { return destroyed; },
    begin: () => controller.begin(observation, ":1.owned"),
    fire(delay) {
      const selected = [...timers.entries()].filter(([, timer]) => timer.delay === delay);
      assert.equal(selected.length, 1);
      timers.delete(selected[0][0]); selected[0][1].callback();
    },
    drain() {
      for (const event of pending.splice(0)) {
        if (event.kind === "button" || event.kind === "key") {
          const key = `${event.id}/${event.kind}/${event.value}`;
          const count = (counts.get(key) ?? 0) + (event.state === 1 ? 1 : -1);
          assert.ok(count === 0 || count === 1, "native device counters must not see duplicate presses/releases");
          counts.set(key, count);
        }
        delivered.push(event);
      }
    },
    heldCount: () => [...counts.values()].reduce((sum, count) => sum + count, 0),
  };
}

for (const duration of [undefined, 0]) {
  test(`zero-duration click ${duration === undefined ? "default" : "explicit"} queues exact pairs and cleanup without a timer or device retirement`, () => {
    const sample = queuedSeat();
    const request = { x: 10, y: 30, clickCount: 2, keyChord: "ctrl" };
    if (duration !== undefined) request.durationMs = duration;
    const result = sample.controller.click(sample.begin(), ":1.owned", request);
    assert.equal(result.action, "click");
    assert.equal(typeof result.then, "undefined");
    assert.deepEqual(sample.pending.map(event => [event.kind, event.state]), [
      ["key", 1], ["motion", undefined], ["button", 1], ["button", 0],
      ["button", 1], ["button", 0], ["key", 0],
    ]);
    assert.ok(sample.pending.every(event => event.time === 1_000_000), "no invented minimum timestamp spacing");
    assert.equal(sample.timers.size, 0, "operation expiry was consumed and no timed release was selected");
    assert.equal(sample.delivered.length, 0, "dispatch reply does not acknowledge native event delivery");
    const queued = sample.pending.length;
    sample.controller.releaseAll(":1.owned");
    assert.equal(sample.pending.length, queued, "completed cleanup must not enqueue duplicate releases");
    assert.equal(sample.destroyed, 0);
    sample.drain();
    assert.equal(sample.heldCount(), 0);
    assert.equal(sample.delivered.filter(event => event.kind === "button").length, 4);
    sample.controller.click(sample.begin(), ":1.owned", { x: 10, y: 30 });
    assert.equal(sample.devices.filter(device => device.kind === "pointer").length, 1, "the pointer device stays cached");
    sample.drain();
    assert.equal(sample.heldCount(), 0);
    assert.equal(sample.timers.size, 0);
    sample.controller.dispose();
  });
}

test("zero-duration contrast: explicit100ms retains the hold and releases once without claiming native drain", () => {
  const sample = queuedSeat();
  const result = sample.controller.click(sample.begin(), ":1.owned", { x: 10, y: 30, durationMs: 100 });
  assert.equal(result.action, "click");
  assert.deepEqual(sample.pending.filter(event => event.kind === "button").map(event => event.state), [1]);
  assert.deepEqual([...sample.timers.values()].map(timer => timer.delay), [100]);
  assert.throws(() => sample.begin(), { inputCode: "BUSY" });
  assert.equal(sample.delivered.length, 0);
  sample.drain();
  assert.equal(sample.heldCount(), 1);
  sample.fire(100);
  assert.deepEqual(sample.pending.map(event => [event.kind, event.state]), [["button", 0]]);
  assert.equal(sample.heldCount(), 1, "even the release callback only enqueues the native notification");
  assert.equal(typeof sample.begin(), "string", "controller ownership can end before native processing");
  sample.controller.dispose();
  assert.equal(sample.timers.size, 0);
  sample.drain();
  assert.equal(sample.heldCount(), 0);
  assert.deepEqual(sample.delivered.filter(event => event.kind === "button").map(event => event.state), [1, 0]);
});
