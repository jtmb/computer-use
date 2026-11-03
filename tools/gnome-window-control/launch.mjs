import { RuntimeError } from "./runtime-contract.mjs";

const LAUNCH_CODES = Object.freeze({
  INVALID_REQUEST: "INVALID_INPUT",
  REFUSED: "INVALID_CONTEXT",
  NOT_FOUND: "INVALID_INPUT",
  INVALID_HANDLE: "STALE_TARGET",
});
const DESKTOP_ID = /^[A-Za-z0-9._-]{1,128}$/;

export class LaunchError extends RuntimeError {
  constructor(launchCode) {
    super(LAUNCH_CODES[launchCode] ?? "INTERNAL");
    this.name = "LaunchError";
    this.launchCode = LAUNCH_CODES[launchCode] ? launchCode : "REFUSED";
  }
}

function fail(code) {
  throw new LaunchError(code);
}

function validDesktopId(desktopId) {
  if (typeof desktopId !== "string" || !DESKTOP_ID.test(desktopId) || !desktopId.includes("."))
    fail("INVALID_REQUEST");
  return desktopId;
}

function windowIds(listWindows) {
  let windows;
  try {
    windows = listWindows();
  } catch {
    fail("REFUSED");
  }
  if (!Array.isArray(windows))
    fail("REFUSED");
  const ids = [];
  for (const window of windows) {
    const id = typeof window === "string" ? window : window?.id;
    if (typeof id !== "string" || id.length === 0)
      fail("REFUSED");
    if (!ids.includes(id))
      ids.push(id);
  }
  return { windows, ids };
}

function launchKey(desktopId, beforeWindowIds) {
  return JSON.stringify([desktopId, [...beforeWindowIds].sort()]);
}

const UINT32_MAX = 0xffff_ffff;

export function createLaunchController({
  now = () => Date.now(),
  eventTimestamp = now,
  getDesktopState,
  appSystem,
  listWindows,
}) {
  if (typeof now !== "function" || typeof eventTimestamp !== "function" ||
      typeof getDesktopState !== "function" ||
      !appSystem || typeof appSystem.lookup_app !== "function" || typeof listWindows !== "function")
    throw new TypeError("Launch controller dependencies are incomplete");

  let disposed = false;
  const launches = new Map();

  function desktopState() {
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
    const focused = Array.isArray(state.windows)
      ? state.windows.find(window => window?.id === state.focusedWindowId)
      : null;
    if (focused?.protected)
      fail("REFUSED");
    return state;
  }

  function launch(desktopId, sender) {
    if (disposed)
      fail("INVALID_HANDLE");
    validDesktopId(desktopId);
    if (typeof sender !== "string" || sender.length === 0)
      fail("INVALID_REQUEST");
    const state = desktopState();
    if (desktopId.startsWith("org.gnome.Shell"))
      fail("REFUSED");

    let app;
    try {
      app = appSystem.lookup_app(desktopId);
    } catch {
      fail("REFUSED");
    }
    if (!app)
      fail("NOT_FOUND");

    const before = windowIds(listWindows);
    const at = now();
    if (!Number.isSafeInteger(at) || at < 0)
      fail("REFUSED");
    // Activation takes a Clutter event timestamp (uint32 milliseconds), not epoch
    // milliseconds: GJS rejects an out-of-range argument and the launch is refused.
    const timestamp = eventTimestamp();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > UINT32_MAX)
      fail("REFUSED");
    try {
      if (typeof app.activate_full === "function")
        app.activate_full(state.workspace, timestamp);
      else if (typeof app.open_new_window === "function")
        app.open_new_window(timestamp);
      else if (typeof appSystem.open_new_window === "function")
        appSystem.open_new_window(desktopId, timestamp);
      else
        fail("REFUSED");
    } catch (error) {
      if (error instanceof LaunchError)
        throw error;
      fail("REFUSED");
    }
    const key = launchKey(desktopId, before.ids);
    launches.delete(key);
    // The bookkeeping clock stays wall-clock time; confirm() compares against it.
    launches.set(key, at);
    if (launches.size > 128)
      launches.delete(launches.keys().next().value);
    return { desktopId, beforeWindowIds: before.ids, at };
  }

  function confirm(beforeWindowIds, { desktopId, timeoutMs } = {}) {
    if (disposed)
      fail("INVALID_HANDLE");
    validDesktopId(desktopId);
    if (!Array.isArray(beforeWindowIds) || beforeWindowIds.some(id => typeof id !== "string" || id.length === 0) ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
      fail("INVALID_REQUEST");
    const current = windowIds(listWindows);
    const launchAt = launches.get(launchKey(desktopId, beforeWindowIds));
    if (launchAt !== undefined) {
      const currentTime = now();
      if (!Number.isSafeInteger(currentTime) || currentTime < launchAt)
        fail("REFUSED");
      if (currentTime - launchAt > timeoutMs)
        return { appeared: false, windowIds: [] };
    }
    const previous = new Set(beforeWindowIds);
    const appeared = current.windows
      .filter(window => {
        const id = typeof window === "string" ? window : window.id;
        const hasAppId = typeof window !== "string" && Object.prototype.hasOwnProperty.call(window, "appId");
        return !previous.has(id) && (!hasAppId || window.appId === desktopId);
      })
      .map(window => typeof window === "string" ? window : window.id);
    return { appeared: appeared.length > 0, windowIds: appeared };
  }

  function dispose() {
    if (disposed)
      return false;
    disposed = true;
    launches.clear();
    return true;
  }

  return Object.freeze({ launch, confirm, dispose });
}
