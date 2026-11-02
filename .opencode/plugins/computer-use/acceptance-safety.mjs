const WINDOW_ID = /^[A-Za-z0-9._-]{1,96}:[0-9]{1,10}$/u
const DESKTOP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u
const ENVIRONMENT_ALLOWLIST = new Set([
  "HOME",
  "PATH",
  "LANG",
  "DBUS_SESSION_BUS_ADDRESS",
  "XDG_RUNTIME_DIR",
  "DISPLAY",
  "WAYLAND_DISPLAY",
])

function requiredExact(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value) || /[*?\[\]]/u.test(value)) {
    throw new Error(`${label} must be an exact current identifier`)
  }
  return value
}

export function parseAcceptanceArgs(argv, { allowLaunchDesktopId = true, requireLaunchForEffects = false } = {}) {
  const values = new Map()
  let allowEffects = false
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]
    if (name === "--allow-effects") {
      if (allowEffects) throw new Error("--allow-effects may be supplied only once")
      allowEffects = true
      continue
    }
    if (!["--window-id", "--app-id", "--launch-desktop-id"].includes(name))
      throw new Error(`unsupported option: ${name}`)
    if (name === "--launch-desktop-id" && !allowLaunchDesktopId)
      throw new Error("--launch-desktop-id is not valid for this harness")
    if (values.has(name)) throw new Error(`${name} may be supplied only once`)
    const value = argv[index + 1]
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--"))
      throw new Error(`${name} requires a value`)
    values.set(name, value)
    index += 1
  }

  const windowId = requiredExact(values.get("--window-id"), "--window-id", WINDOW_ID)
  const appId = requiredExact(values.get("--app-id"), "--app-id", DESKTOP_ID)
  const selectedLaunchId = values.get("--launch-desktop-id")
  if (selectedLaunchId !== undefined && !allowEffects)
    throw new Error("--launch-desktop-id requires --allow-effects")
  if (requireLaunchForEffects && allowEffects && selectedLaunchId === undefined)
    throw new Error("--allow-effects requires an explicit --launch-desktop-id")
  if (selectedLaunchId !== undefined)
    requiredExact(selectedLaunchId, "--launch-desktop-id", DESKTOP_ID)

  return Object.freeze({
    windowId,
    appId,
    allowEffects,
    ...(selectedLaunchId === undefined ? {} : { launchDesktopId: selectedLaunchId }),
  })
}

export function parseInventoryText(text) {
  if (typeof text !== "string") throw new Error("desktop.windows returned no text")
  const start = text.indexOf("{")
  if (start < 0) throw new Error("desktop.windows returned no inventory object")
  let inventory
  try {
    inventory = JSON.parse(text.slice(start))
  } catch {
    throw new Error("desktop.windows returned invalid inventory JSON")
  }
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory) || inventory.ok !== true ||
      !Array.isArray(inventory.windows) || inventory.windows.length > 128)
    throw new Error("desktop.windows returned an unavailable or invalid inventory")
  return inventory
}

function rectangle(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} has no current geometry`)
  for (const key of ["x", "y", "width", "height"]) {
    if (!Number.isSafeInteger(value[key]) || (key === "width" || key === "height") && value[key] < 1)
      throw new Error(`${label} has invalid ${key} geometry`)
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}

function inventoryProjection(inventory) {
  if (!inventory || typeof inventory !== "object" || inventory.ok !== true ||
      !Array.isArray(inventory.windows) || inventory.windows.length > 128)
    throw new Error("desktop.windows returned an unavailable or invalid inventory")
  if (inventory.locked === true || inventory.blockedReason)
    throw new Error("desktop.windows is locked or blocked; refusing target validation")
  const seen = new Set()
  const windows = inventory.windows.map((window, index) => {
    if (!window || typeof window !== "object" || typeof window.id !== "string" || window.id.length === 0)
      throw new Error(`desktop.windows item ${index} has no exact ID`)
    if (seen.has(window.id)) throw new Error(`desktop.windows contains duplicate ID ${window.id}`)
    seen.add(window.id)
    if (typeof window.appId !== "string" || !Number.isSafeInteger(window.pid))
      throw new Error(`desktop.windows item ${window.id} has invalid app or PID metadata`)
    return {
      id: window.id,
      appId: window.appId,
      pid: window.pid,
      rect: rectangle(window.rect, `window ${window.id}`),
    }
  }).sort((first, second) => first.id.localeCompare(second.id))
  const focusedWindowId = inventory.focusedWindowId ?? null
  if (focusedWindowId !== null && typeof focusedWindowId !== "string")
    throw new Error("desktop.windows returned invalid focus metadata")
  return { focusedWindowId, windows }
}

export function selectUniqueTarget(inventory, options) {
  requiredExact(options?.windowId, "--window-id", WINDOW_ID)
  requiredExact(options?.appId, "--app-id", DESKTOP_ID)
  const projection = inventoryProjection(inventory)
  const matches = projection.windows.filter((window) => window.id === options.windowId)
  if (matches.length !== 1)
    throw new Error(matches.length === 0
      ? `target ${options.windowId} is absent from the fresh inventory`
      : `target ${options.windowId} is not unique in the fresh inventory`)
  const target = matches[0]
  if (target.appId !== options.appId)
    throw new Error(`target ${options.windowId} app ID does not match the selected --app-id`)
  return target
}

export function selectUniqueRunTarget(inventory, runTag, titleFragment = "target1") {
  if (typeof runTag !== "string" || runTag.length < 1 || runTag.length > 128 ||
      /[*?\[\]\u0000-\u001f\u007f-\u009f]/u.test(runTag))
    throw new Error("run tag must be an exact non-empty value")
  if (typeof titleFragment !== "string" || titleFragment.length < 1 || titleFragment.length > 128)
    throw new Error("target title fragment must be a non-empty bounded value")
  inventoryProjection(inventory)
  const matches = inventory.windows.filter((window) =>
    typeof window.title === "string" && window.title.includes(runTag) && window.title.includes(titleFragment))
  if (matches.length !== 1)
    throw new Error(`fresh run inventory must contain exactly one target match; found ${matches.length}`)
  return {
    windowId: requiredExact(matches[0].id, "target window ID", WINDOW_ID),
    appId: requiredExact(matches[0].appId, "target app ID", DESKTOP_ID),
  }
}

export function assertInventoryUnchanged(before, after) {
  if (JSON.stringify(inventoryProjection(before)) !== JSON.stringify(inventoryProjection(after)))
    throw new Error("desktop inventory changed during the read-only capture (IDs, app, PID, geometry, or focus)")
}

export async function captureWithStableTarget({ options, inventory, capture }) {
  const before = await inventory()
  const target = selectUniqueTarget(before, options)
  let result
  let captureError
  let captureFailed = false
  try {
    result = await capture(target)
  } catch (error) {
    captureFailed = true
    captureError = error
  }
  const after = await inventory()
  assertInventoryUnchanged(before, after)
  if (captureFailed) throw captureError
  return { target, result, before, after }
}

export async function runExplicitEffects(options, run) {
  if (options?.allowEffects !== true) return undefined
  if (typeof run !== "function") throw new TypeError("effect runner must be a function")
  if (options.launchDesktopId !== undefined)
    requiredExact(options.launchDesktopId, "--launch-desktop-id", DESKTOP_ID)
  return run({ launchDesktopId: options.launchDesktopId })
}

export async function withOwnedDaemonSuspension(control, operation, registerExitCleanup = () => () => {}) {
  if (!control || typeof control.isCurrent !== "function" || typeof control.suspend !== "function" ||
      typeof control.resume !== "function" || !control.isCurrent())
    throw new Error("the owned bridge daemon is absent, stale, replaced, or stopped")
  if (!control.suspend()) throw new Error("could not suspend the current owned bridge daemon")
  let removeExitCleanup = () => {}
  let resumedByCleanup = false
  const resumeOwned = () => {
    const resumed = control.resume()
    if (resumed) resumedByCleanup = true
    return resumed
  }
  try {
    removeExitCleanup = registerExitCleanup(resumeOwned) ?? (() => {})
    return await operation()
  } finally {
    try {
      removeExitCleanup()
    } finally {
      const stillCurrent = control.isCurrent()
      const resumed = resumeOwned()
      if (stillCurrent && !resumed && !resumedByCleanup)
        throw new Error("could not resume the current owned bridge daemon")
    }
  }
}

export function checkSanitizedEnvironmentNames(names) {
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string"))
    return { ok: false, unexpected: ["invalid environment metadata"], secretish: [] }
  const unexpected = names.filter((name) => !ENVIRONMENT_ALLOWLIST.has(name))
  const secretish = names.filter((name) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AWS|OPENAI|ANTHROPIC/iu.test(name))
  return { ok: unexpected.length === 0 && secretish.length === 0, unexpected, secretish }
}
