// Logical input accounting for the title-CAS work.
//
// The budget only adds up costs the caller declares: it does not open files, allocate the declared
// bytes or authenticate a size, and a successful reservation is not permission to read, write or
// trust anything. `maxFiles` caps a shared logical unit whose concrete meaning (real reads,
// callbacks, dirents, overlay inventory) belongs to the future integration; it is not a
// source-file count.
//
// The first refusal is latched as the exact error object. Later check/reserve/remaining calls
// rethrow it without reading the clock or signal again, and snapshot stays a diagnostic view.
// While one operation is active, nested check/reserve/remaining calls are refused as `reentrant`
// and latch that refusal; snapshot remains callable and never reads a hook.
// A reservation commits only after its final lifecycle check, so no hook runs after charges are
// consumed and no rollback or refill path exists.
import { performance } from "node:perf_hooks"

export const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 2097152,
  maxAggregateBytes: 67108864,
  maxFiles: 10000,
  maxMetadataBytes: 2097152,
  timeoutMs: 30000,
})

const OPTION_FIELDS = Object.freeze(["limits", "signal", "now"])
const COST_FIELDS = Object.freeze(["contentBytes", "metadataBytes", "units", "fileBytes"])

export class InputBudgetError extends Error {
  constructor(code, message, detail) {
    super(`input-budget/${code}: ${message}`)
    this.name = "InputBudgetError"
    this.code = code
    this.detail = Object.freeze(detail ?? {})
  }
}

const createError = (code, message, detail) => new InputBudgetError(code, message, detail)

const snapshotRecord = (value, code, what) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  // Descriptor snapshot: accessor fields are refused instead of invoked, and symbol keys are
  // rejected so a record cannot smuggle a second meaning past the known-field check.
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const fields = new Map()
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") throw createError(code, `${what} must not use symbol fields`, {})
    const descriptor = descriptors[key]
    if (!Object.hasOwn(descriptor, "value")) throw createError(code, `${what} must not use accessor properties`, {})
    fields.set(key, descriptor.value)
  }
  return fields
}

const rejectUnknown = (fields, allowed, code, what) => {
  for (const key of fields.keys()) {
    if (!allowed.includes(key)) throw createError(code, `${what} has unexpected field ${key}`, { key })
  }
}

const normalizeLimits = (overrides) => {
  if (overrides === undefined) return DEFAULT_LIMITS
  const fields = snapshotRecord(overrides, "invalidLimits", "limits")
  const limits = { ...DEFAULT_LIMITS }
  for (const [key, value] of fields) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw createError("unknownLimit", `unknown limit ${key}`, { key })
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw createError("invalidLimit", `${key} must be a positive integer`, { key })
    }
    if (value > DEFAULT_LIMITS[key]) {
      throw createError("limitIncrease", `${key} may only be reduced`, { key, value, max: DEFAULT_LIMITS[key] })
    }
    limits[key] = value
  }
  return Object.freeze(limits)
}

const readCost = (cost, limits) => {
  const fields = snapshotRecord(cost, "invalidCost", "cost")
  rejectUnknown(fields, COST_FIELDS, "invalidCost", "cost")
  const read = (name) => {
    if (!fields.has(name)) return 0
    const value = fields.get(name)
    if (!Number.isSafeInteger(value) || value < 0) {
      throw createError("invalidCost", `cost ${name} must be a non-negative safe integer`, { field: name })
    }
    return value
  }
  const contentBytes = read("contentBytes")
  const metadataBytes = read("metadataBytes")
  const units = read("units")
  if (fields.has("fileBytes") && read("fileBytes") > limits.maxFileBytes) {
    // A declared size is only bounded here; it is not charged, authenticated or evidence of IO.
    throw createError("fileTooLarge", "fileBytes exceeds maxFileBytes", { field: "fileBytes" })
  }
  return { contentBytes, metadataBytes, units }
}

const create = (options) => {
  const optionFields = snapshotRecord(options, "invalidOptions", "options")
  rejectUnknown(optionFields, OPTION_FIELDS, "invalidOptions", "options")
  const limits = normalizeLimits(optionFields.get("limits"))
  const signal = optionFields.get("signal")
  if (signal !== undefined && signal !== null && typeof signal !== "object") {
    throw createError("invalidOptions", "signal must be an AbortSignal-like object", {})
  }
  const nowInput = optionFields.get("now")
  if (nowInput !== undefined && typeof nowInput !== "function") {
    throw createError("invalidClock", "now must be a function", {})
  }
  const clock = nowInput === undefined ? () => performance.now() : nowInput

  const startupAborted = () => {
    if (signal === undefined || signal === null) return false
    try {
      return Boolean(signal.aborted)
    } catch {
      throw createError("internal", "signal failed while starting the input budget", {})
    }
  }

  // Startup obeys the same abort-before/after-clock rule as later lifecycle checks: a cancelled
  // factory throws and never returns an already-failed budget.
  if (startupAborted()) throw createError("aborted", "input budget was cancelled during startup", {})
  let start
  try {
    start = clock()
  } catch {
    if (startupAborted()) throw createError("aborted", "input budget was cancelled during startup", {})
    throw createError("invalidClock", "clock failed while starting the budget", {})
  }
  if (startupAborted()) throw createError("aborted", "input budget was cancelled during startup", {})
  if (typeof start !== "number" || !Number.isFinite(start)) {
    throw createError("invalidClock", "clock must return a finite number", {})
  }
  const deadline = start + limits.timeoutMs
  if (!Number.isFinite(deadline)) throw createError("invalidClock", "clock and timeout must form a finite deadline", {})

  // One lifetime state and one monotonic clock read per factory. The deadline starts here and
  // cannot be restarted, extended, refilled or restored.
  let previous = start
  let failure = null
  let active = false
  const usage = { contentBytes: 0, metadataBytes: 0, units: 0 }

  const fail = (code, message, detail) => {
    const error = createError(code, message, detail)
    if (!failure) failure = error
    throw failure
  }

  // Both trusted seams are wrapped so a callback that latches a refusal, even when the callback
  // swallows that refusal, cannot be followed by another hook or a commit: the latched first
  // error wins immediately after the callback returns.
  const isAborted = () => {
    if (signal === undefined || signal === null) return false
    let value
    try {
      value = signal.aborted
    } catch {
      if (failure) throw failure
      fail("internal", "signal failed during accounting", {})
    }
    if (failure) throw failure
    return Boolean(value)
  }

  const readClock = () => {
    let value
    try {
      value = clock()
    } catch {
      if (failure) throw failure
      // A clock that throws after cancelling the signal is still a cancellation refusal.
      if (isAborted()) fail("aborted", "input budget was cancelled", {})
      fail("invalidClock", "clock failed during accounting", {})
    }
    if (failure) throw failure
    return value
  }

  const assertLive = () => {
    if (isAborted()) fail("aborted", "input budget was cancelled", {})
    const current = readClock()
    // A clock that cancels the signal must not let the reservation continue.
    if (isAborted()) fail("aborted", "input budget was cancelled", {})
    if (typeof current !== "number" || !Number.isFinite(current)) {
      fail("invalidClock", "clock must return a finite number", {})
    }
    if (current < previous) fail("invalidClock", "clock must not regress", {})
    previous = current
    if (current >= deadline) fail("deadline", "input budget deadline exceeded", {})
  }

  const reentrant = (operation) => {
    const error = createError("reentrant", "nested input budget operation is not allowed", { operation })
    if (!failure) failure = error
    return failure
  }

  const run = (operation, body) => {
    if (failure) throw failure
    if (active) throw reentrant(operation)
    active = true
    try {
      return body()
    } catch (error) {
      // Preserve the exact first refusal; a later typed or unexpected error never replaces it.
      if (!failure) {
        failure =
          error instanceof InputBudgetError
            ? error
            : createError("internal", "unexpected failure while accounting input budget", {})
      }
      throw failure
    } finally {
      active = false
    }
  }

  const check = () => run("check", () => assertLive())

  const remaining = () =>
    run("remaining", () => {
      assertLive()
      return Object.freeze({
        contentBytes: limits.maxAggregateBytes - usage.contentBytes,
        metadataBytes: limits.maxMetadataBytes - usage.metadataBytes,
        units: limits.maxFiles - usage.units,
      })
    })

  const reserve = (cost = {}) =>
    run("reserve", () => {
      assertLive()
      const charges = readCost(cost, limits)
      if (failure) throw failure
      const contentLeft = limits.maxAggregateBytes - usage.contentBytes
      if (charges.contentBytes > contentLeft) {
        fail("aggregateBudget", "content byte budget exhausted", { required: charges.contentBytes, remaining: contentLeft })
      }
      const metadataLeft = limits.maxMetadataBytes - usage.metadataBytes
      if (charges.metadataBytes > metadataLeft) {
        fail("metadataBudget", "metadata byte budget exhausted", { required: charges.metadataBytes, remaining: metadataLeft })
      }
      const unitsLeft = limits.maxFiles - usage.units
      if (charges.units > unitsLeft) {
        fail("unitBudget", "logical unit budget exhausted", { required: charges.units, remaining: unitsLeft })
      }
      // Linearization point: this is the last clock/signal read. Everything below is a plain
      // all-or-none commit, so no later hook can fail after charges were consumed.
      assertLive()
      usage.contentBytes += charges.contentBytes
      usage.metadataBytes += charges.metadataBytes
      usage.units += charges.units
      return Object.freeze({
        usage: Object.freeze({
          contentBytes: usage.contentBytes,
          metadataBytes: usage.metadataBytes,
          units: usage.units,
        }),
        remaining: Object.freeze({
          contentBytes: limits.maxAggregateBytes - usage.contentBytes,
          metadataBytes: limits.maxMetadataBytes - usage.metadataBytes,
          units: limits.maxFiles - usage.units,
        }),
      })
    })

  const snapshot = () =>
    Object.freeze({
      limits: Object.freeze({ ...limits }),
      usage: Object.freeze({
        contentBytes: usage.contentBytes,
        metadataBytes: usage.metadataBytes,
        units: usage.units,
      }),
      failure: failure === null ? null : failure.code,
    })

  return Object.freeze({ check, reserve, remaining, snapshot })
}

export function createInputBudget(options = {}) {
  try {
    return create(options)
  } catch (error) {
    if (error instanceof InputBudgetError) throw error
    throw createError("internal", "unexpected failure while creating the input budget", {})
  }
}
