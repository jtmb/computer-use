import assert from "node:assert/strict";
import test from "node:test";

import { createLaunchController } from "./launch.mjs";

const SENDER = ":1.50";

function fixture({ stateOverrides = {}, app = { activate_full() {} }, initialWindows = [] } = {}) {
  let currentTime = 123456;
  const state = {
    locked: false,
    blockedReason: null,
    overview: false,
    modalCount: 0,
    workspace: 3,
    focusedWindowId: null,
    windows: [],
    ...stateOverrides,
  };
  let windows = [...initialWindows];
  const controller = createLaunchController({
    now: () => currentTime,
    getDesktopState: () => state,
    appSystem: { lookup_app: id => id === "org.example.Editor" || id === "org.example.Target" ? app : null },
    listWindows: () => windows,
  });
  return {
    controller,
    state,
    setWindows(value) { windows = value; },
    advance(milliseconds) { currentTime += milliseconds; },
  };
}

test("desktop IDs require a dot and only the allowed characters", () => {
  const sample = fixture();
  for (const id of ["", "editor", "org.example.Bad Space", "org.example/Bad", "x".repeat(129)]) {
    assert.throws(
      () => sample.controller.launch(id, SENDER),
      { launchCode: "INVALID_REQUEST" },
    );
  }
});

test("locked, modal, overview, and protected focused windows are refused", () => {
  for (const stateOverrides of [
    { locked: true },
    { modalCount: 1 },
    { overview: true },
    { focusedWindowId: "protected", windows: [{ id: "protected", protected: true }] },
  ]) {
    const sample = fixture({ stateOverrides });
    assert.throws(
      () => sample.controller.launch("org.example.Editor", SENDER),
      { launchCode: "REFUSED" },
    );
  }
});

test("unknown and Shell applications are refused", () => {
  const sample = fixture();
  assert.throws(() => sample.controller.launch("org.example.Unknown", SENDER), { launchCode: "NOT_FOUND" });
  assert.throws(() => sample.controller.launch("org.gnome.Shell.Extensions", SENDER), { launchCode: "REFUSED" });
});

test("launch returns the pre-launch IDs and activates on the current workspace and timestamp", () => {
  const calls = [];
  const sample = fixture({
    app: { activate_full: (workspace, timestamp) => calls.push({ workspace, timestamp }) },
    initialWindows: [{ id: "old-window", appId: "org.example.Editor" }],
  });
  const result = sample.controller.launch("org.example.Editor", SENDER);
  assert.deepEqual(calls, [{ workspace: 3, timestamp: 123456 }]);
  assert.deepEqual(result, {
    desktopId: "org.example.Editor",
    beforeWindowIds: ["old-window"],
    at: 123456,
  });
});

test("activation uses the uint32 Shell timestamp while bookkeeping keeps wall-clock time", () => {
  const calls = [];
  const wallClock = 1_793_000_000_000;      // epoch ms: overflows a uint32 argument
  const shellTime = 987_654;                // global.get_current_time()
  const sample = fixture({
    app: { activate_full: (workspace, timestamp) => calls.push({ workspace, timestamp }) },
  });
  sample.controller.dispose?.();
  const controller = createLaunchController({
    now: () => wallClock,
    eventTimestamp: () => shellTime,
    getDesktopState: () => sample.state,
    appSystem: { lookup_app: () => ({ activate_full: (workspace, timestamp) => calls.push({ workspace, timestamp }) }) },
    listWindows: () => [],
  });
  const result = controller.launch("org.example.Editor", SENDER);
  assert.deepEqual(calls, [{ workspace: 3, timestamp: shellTime }]);
  assert.equal(result.at, wallClock, "confirm() must compare against wall-clock time");
});

test("an activation timestamp outside uint32 is refused instead of passed to the Shell", () => {
  for (const timestamp of [1_793_000_000_000, 4_294_967_296, -1, NaN, 0.5]) {
    let activations = 0;
    const controller = createLaunchController({
      now: () => 1_793_000_000_000,
      eventTimestamp: () => timestamp,
      getDesktopState: () => ({
        locked: false, blockedReason: null, overview: false, modalCount: 0,
        workspace: 3, focusedWindowId: null, windows: [],
      }),
      appSystem: { lookup_app: () => ({ activate_full() { activations++; } }) },
      listWindows: () => [],
    });
    assert.throws(() => controller.launch("org.example.Editor", SENDER), { launchCode: "REFUSED" });
    assert.equal(activations, 0, `invalid activation timestamp ${timestamp} never reaches Shell`);
  }
});

test("open_new_window is the fallback when activate_full is unavailable", () => {
  const calls = [];
  const sample = fixture({ app: { open_new_window: timestamp => calls.push(timestamp) } });
  sample.controller.launch("org.example.Editor", SENDER);
  assert.deepEqual(calls, [123456]);
});

test("confirm reports false before appearance and true for a new matching window", () => {
  const sample = fixture({ initialWindows: [{ id: "old" }] });
  const launched = sample.controller.launch("org.example.Editor", SENDER);
  assert.deepEqual(
    sample.controller.confirm(launched.beforeWindowIds, { desktopId: launched.desktopId, timeoutMs: 5000 }),
    { appeared: false, windowIds: [] },
  );
  sample.setWindows([
    { id: "old" },
    { id: "editor-window", appId: "org.example.Editor" },
  ]);
  assert.deepEqual(
    sample.controller.confirm(launched.beforeWindowIds, { desktopId: launched.desktopId, timeoutMs: 5000 }),
    { appeared: true, windowIds: ["editor-window"] },
  );
});

test("confirm ignores unrelated new windows and allows records without app IDs", () => {
  const sample = fixture({ initialWindows: [{ id: "old" }] });
  sample.setWindows([
    { id: "old" },
    { id: "unrelated", appId: "org.other.App" },
  ]);
  assert.deepEqual(
    sample.controller.confirm(["old"], { desktopId: "org.example.Editor", timeoutMs: 1000 }),
    { appeared: false, windowIds: [] },
  );
  sample.setWindows([{ id: "old" }, { id: "no-app-id" }]);
  assert.deepEqual(
    sample.controller.confirm(["old"], { desktopId: "org.example.Editor", timeoutMs: 1000 }),
    { appeared: true, windowIds: ["no-app-id"] },
  );
});

test("confirm stops reporting appearances after its launch timeout", () => {
  const sample = fixture();
  const launched = sample.controller.launch("org.example.Editor", SENDER);
  sample.setWindows([{ id: "late-window", appId: "org.example.Editor" }]);
  sample.advance(1001);
  assert.deepEqual(
    sample.controller.confirm(launched.beforeWindowIds, { desktopId: launched.desktopId, timeoutMs: 1000 }),
    { appeared: false, windowIds: [] },
  );
});

test("dispose invalidates launch and confirmation", () => {
  const sample = fixture();
  assert.equal(sample.controller.dispose(), true);
  assert.equal(sample.controller.dispose(), false);
  assert.throws(() => sample.controller.launch("org.example.Editor", SENDER), { launchCode: "INVALID_HANDLE" });
  assert.throws(
    () => sample.controller.confirm([], { desktopId: "org.example.Editor", timeoutMs: 0 }),
    { launchCode: "INVALID_HANDLE" },
  );
});
