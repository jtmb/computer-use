import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_LIMITS, InputBudgetError, createInputBudget } from "./input-budget.mjs"

const ZERO_USAGE = Object.freeze({ contentBytes: 0, metadataBytes: 0, units: 0 })

const thrown = (body) => {
  try {
    body()
  } catch (error) {
    return error
  }
  assert.fail("expected a refusal")
}

const refusal = (body, code) => {
  const error = thrown(body)
  assert.ok(error instanceof InputBudgetError)
  assert.equal(error.code, code)
  assert.ok(Object.isFrozen(error.detail))
  return error
}

const steppingClock = (values) => {
  let calls = 0
  const clock = () => values[Math.min(calls++, values.length - 1)]
  return { clock, calls: () => calls }
}

const countingSignal = () => {
  let aborted = false
  let reads = 0
  const signal = {}
  Object.defineProperty(signal, "aborted", {
    get() {
      reads += 1
      return aborted
    },
    set(value) {
      aborted = value
    },
  })
  return { signal, abort: () => { aborted = true }, reads: () => reads }
}

test("default limits exactly match the accepted helpers and are frozen", () => {
  assert.deepEqual(DEFAULT_LIMITS, {
    maxFileBytes: 2097152,
    maxAggregateBytes: 67108864,
    maxFiles: 10000,
    maxMetadataBytes: 2097152,
    timeoutMs: 30000,
  })
  assert.deepEqual(Object.keys(DEFAULT_LIMITS), [
    "maxFileBytes",
    "maxAggregateBytes",
    "maxFiles",
    "maxMetadataBytes",
    "timeoutMs",
  ])
  assert.ok(Object.isFrozen(DEFAULT_LIMITS))
})

test("the default constructor starts clean and exposes only the frozen four-method API", () => {
  const budget = createInputBudget()
  assert.ok(Object.isFrozen(budget))
  assert.deepEqual(Object.keys(budget).sort(), ["check", "remaining", "reserve", "snapshot"])
  assert.equal(budget.check(), undefined)
  assert.deepEqual(budget.remaining(), {
    contentBytes: 67108864,
    metadataBytes: 2097152,
    units: 10000,
  })

  const snapshot = budget.snapshot()
  assert.deepEqual(Object.keys(snapshot).sort(), ["failure", "limits", "usage"])
  assert.deepEqual(snapshot.limits, DEFAULT_LIMITS)
  assert.notEqual(snapshot.limits, DEFAULT_LIMITS)
  assert.deepEqual(snapshot.usage, ZERO_USAGE)
  assert.equal(snapshot.failure, null)
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.limits))
  assert.ok(Object.isFrozen(snapshot.usage))
})

test("sequential reservations share content, metadata and unit balances", () => {
  const budget = createInputBudget({
    limits: { maxAggregateBytes: 100, maxMetadataBytes: 50, maxFiles: 10, maxFileBytes: 20, timeoutMs: 1000 },
  })

  const first = budget.reserve({ contentBytes: 30, metadataBytes: 10, units: 2 })
  assert.deepEqual(Object.keys(first).sort(), ["remaining", "usage"])
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.usage))
  assert.ok(Object.isFrozen(first.remaining))
  assert.deepEqual(first.usage, { contentBytes: 30, metadataBytes: 10, units: 2 })
  assert.deepEqual(first.remaining, { contentBytes: 70, metadataBytes: 40, units: 8 })

  const second = budget.reserve({ contentBytes: 20, metadataBytes: 5, units: 3 })
  assert.deepEqual(second.usage, { contentBytes: 50, metadataBytes: 15, units: 5 })
  assert.deepEqual(second.remaining, { contentBytes: 50, metadataBytes: 35, units: 5 })
  assert.deepEqual(budget.remaining(), { contentBytes: 50, metadataBytes: 35, units: 5 })
  assert.deepEqual(budget.snapshot().usage, { contentBytes: 50, metadataBytes: 15, units: 5 })
})

test("exact limit use leaves zero balances, permits a zero reservation and refuses the next positive one", () => {
  const budget = createInputBudget({
    limits: { maxAggregateBytes: 10, maxMetadataBytes: 5, maxFiles: 2, timeoutMs: 1000 },
  })
  budget.reserve({ contentBytes: 5, metadataBytes: 2, units: 1 })
  budget.reserve({ contentBytes: 5, metadataBytes: 3, units: 1 })

  const remaining = budget.remaining()
  assert.deepEqual(remaining, { contentBytes: 0, metadataBytes: 0, units: 0 })
  assert.ok(Object.isFrozen(remaining))
  assert.deepEqual(budget.snapshot().usage, { contentBytes: 10, metadataBytes: 5, units: 2 })

  const zero = budget.reserve()
  assert.deepEqual(zero.usage, { contentBytes: 10, metadataBytes: 5, units: 2 })
  assert.deepEqual(zero.remaining, { contentBytes: 0, metadataBytes: 0, units: 0 })

  refusal(() => budget.reserve({ contentBytes: 1 }), "aggregateBudget")
  const snapshot = budget.snapshot()
  assert.deepEqual(snapshot.usage, { contentBytes: 10, metadataBytes: 5, units: 2 })
  assert.equal(snapshot.failure, "aggregateBudget")
})

test("each exhausted dimension refuses without consuming the others", () => {
  const content = createInputBudget({ limits: { maxAggregateBytes: 10, timeoutMs: 1000 } })
  content.reserve({ contentBytes: 10 })
  refusal(() => content.reserve({ contentBytes: 1 }), "aggregateBudget")
  assert.deepEqual(content.snapshot().usage, { contentBytes: 10, metadataBytes: 0, units: 0 })

  const metadata = createInputBudget({ limits: { maxMetadataBytes: 5, timeoutMs: 1000 } })
  metadata.reserve({ metadataBytes: 5 })
  refusal(() => metadata.reserve({ metadataBytes: 1 }), "metadataBudget")
  assert.deepEqual(metadata.snapshot().usage, { contentBytes: 0, metadataBytes: 5, units: 0 })

  const units = createInputBudget({ limits: { maxFiles: 2, timeoutMs: 1000 } })
  units.reserve({ units: 2 })
  refusal(() => units.reserve({ units: 1 }), "unitBudget")
  assert.deepEqual(units.snapshot().usage, { contentBytes: 0, metadataBytes: 0, units: 2 })
})

test("oversized fileBytes is refused independently and an accepted size is not charged", () => {
  const oversized = createInputBudget({ limits: { maxFileBytes: 4, timeoutMs: 1000 } })
  refusal(() => oversized.reserve({ fileBytes: 5 }), "fileTooLarge")
  assert.deepEqual(oversized.snapshot().usage, ZERO_USAGE)

  const accepted = createInputBudget({ limits: { maxFileBytes: 4, timeoutMs: 1000 } })
  const result = accepted.reserve({ fileBytes: 4 })
  assert.deepEqual(result.usage, ZERO_USAGE)
  assert.deepEqual(accepted.remaining(), {
    contentBytes: DEFAULT_LIMITS.maxAggregateBytes,
    metadataBytes: DEFAULT_LIMITS.maxMetadataBytes,
    units: DEFAULT_LIMITS.maxFiles,
  })
})

test("a mixed cost that exceeds one balance changes no counters and keeps the snapshot diagnostic", () => {
  const budget = createInputBudget({
    limits: { maxAggregateBytes: 20, maxMetadataBytes: 5, maxFiles: 2, timeoutMs: 1000 },
  })
  budget.reserve({ contentBytes: 10, metadataBytes: 2, units: 1 })

  const error = refusal(
    () => budget.reserve({ contentBytes: 5, metadataBytes: 4, units: 1 }),
    "metadataBudget",
  )
  const snapshot = budget.snapshot()
  assert.deepEqual(snapshot.usage, { contentBytes: 10, metadataBytes: 2, units: 1 })
  assert.equal(snapshot.failure, "metadataBudget")
  assert.equal(thrown(() => budget.reserve()), error)
  assert.deepEqual(budget.snapshot().usage, { contentBytes: 10, metadataBytes: 2, units: 1 })
})

test("invalid cost values are refused without charging", () => {
  const invalid = [
    { contentBytes: -1 },
    { contentBytes: NaN },
    { contentBytes: Infinity },
    { contentBytes: 1.5 },
    { contentBytes: true },
    { contentBytes: "1" },
    { contentBytes: 1n },
    { contentBytes: undefined },
    { contentBytes: Number.MAX_SAFE_INTEGER + 1 },
    { metadataBytes: -1 },
    { units: -1 },
    { units: 2.5 },
    { fileBytes: -1 },
  ]

  for (const cost of invalid) {
    const budget = createInputBudget({ limits: { timeoutMs: 1000 } })
    refusal(() => budget.reserve(cost), "invalidCost")
    assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
  }
})

test("non-record, accessor, symbol, unknown and inherited costs are refused without getters", () => {
  let getterCalls = 0
  const accessor = {}
  Object.defineProperty(accessor, "contentBytes", {
    enumerable: true,
    get() {
      getterCalls += 1
      return 1
    },
  })
  class Cost {
    constructor() {
      this.contentBytes = 1
    }
  }

  const invalid = [
    null,
    [],
    new Date(),
    new Cost(),
    Object.create({ contentBytes: 1 }),
    { [Symbol("bytes")]: 1 },
    { contentBytes: 1, extra: 0 },
    accessor,
  ]

  for (const cost of invalid) {
    const budget = createInputBudget({ limits: { timeoutMs: 1000 } })
    refusal(() => budget.reserve(cost), "invalidCost")
    assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
  }
  assert.equal(getterCalls, 0)
})

test("invalid options and limits refuse at the factory with typed errors", () => {
  const cases = [
    [null, "invalidOptions"],
    [[], "invalidOptions"],
    [new Date(), "invalidOptions"],
    [{ extra: 1 }, "invalidOptions"],
    [{ limits: null }, "invalidLimits"],
    [{ limits: [] }, "invalidLimits"],
    [{ limits: { unknown: 1 } }, "unknownLimit"],
    [{ limits: { maxFiles: 0 } }, "invalidLimit"],
    [{ limits: { maxFiles: -1 } }, "invalidLimit"],
    [{ limits: { maxFiles: 1.5 } }, "invalidLimit"],
    [{ limits: { maxFiles: "10" } }, "invalidLimit"],
    [{ limits: { maxFiles: 10001 } }, "limitIncrease"],
    [{ limits: Object.create({ maxFiles: 1 }) }, "invalidLimits"],
    [{ limits: { [Symbol("maxFiles")]: 1 } }, "invalidLimits"],
    [{ signal: 1 }, "invalidOptions"],
  ]

  for (const [options, code] of cases) {
    const error = thrown(() => createInputBudget(options))
    assert.ok(error instanceof InputBudgetError)
    assert.equal(error.code, code)
    assert.ok(Object.isFrozen(error.detail))
  }

  let getterCalls = 0
  const options = {}
  Object.defineProperty(options, "limits", {
    enumerable: true,
    get() {
      getterCalls += 1
      return {}
    },
  })
  assert.ok(thrown(() => createInputBudget(options)) instanceof InputBudgetError)

  const limitRecord = {}
  Object.defineProperty(limitRecord, "maxFiles", {
    enumerable: true,
    get() {
      getterCalls += 1
      return 1
    },
  })
  assert.ok(thrown(() => createInputBudget({ limits: limitRecord })) instanceof InputBudgetError)
  assert.equal(getterCalls, 0)
})

test("invalid clocks refuse at the factory", () => {
  const cases = [
    [{ now: 1 }, "invalidClock"],
    [{ now: null }, "invalidClock"],
    [{ now: () => NaN }, "invalidClock"],
    [{ now: () => Infinity }, "invalidClock"],
    [{ now: () => "1" }, "invalidClock"],
    [{ now: () => { throw new Error("tick") } }, "invalidClock"],
  ]

  for (const [options, code] of cases) {
    const error = thrown(() => createInputBudget(options))
    assert.ok(error instanceof InputBudgetError)
    assert.equal(error.code, code)
  }
})

test("inputs, results and snapshots are not aliased", () => {
  const limits = { maxAggregateBytes: 100, maxMetadataBytes: 50, maxFiles: 4, timeoutMs: 1000 }
  const budget = createInputBudget({ limits })
  const cost = { contentBytes: 10, metadataBytes: 5, units: 1 }
  const result = budget.reserve(cost)

  limits.maxAggregateBytes = 10000
  limits.maxFiles = 100
  cost.contentBytes = 99

  const snapshot = budget.snapshot()
  assert.equal(snapshot.limits.maxAggregateBytes, 100)
  assert.equal(snapshot.limits.maxFiles, 4)
  assert.deepEqual(result.usage, { contentBytes: 10, metadataBytes: 5, units: 1 })
  assert.deepEqual(budget.remaining(), { contentBytes: 90, metadataBytes: 45, units: 3 })

  assert.throws(() => {
    result.usage.contentBytes = 99
  }, TypeError)
  assert.throws(() => {
    snapshot.usage.units = 9
  }, TypeError)
  assert.throws(() => {
    snapshot.limits.maxFiles = 9
  }, TypeError)

  const again = budget.snapshot()
  assert.notEqual(again, snapshot)
  assert.notEqual(again.limits, snapshot.limits)
  assert.notEqual(again.usage, snapshot.usage)
  assert.deepEqual(again, snapshot)
})

test("the first refusal is the exact latched object and later calls invoke no hooks", () => {
  const signal = countingSignal()
  const clock = steppingClock([0])
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, signal: signal.signal, now: clock.clock })

  const first = refusal(() => budget.reserve({ contentBytes: -1 }), "invalidCost")
  const clockCalls = clock.calls()
  const signalReads = signal.reads()

  assert.equal(thrown(() => budget.check()), first)
  assert.equal(thrown(() => budget.reserve({ contentBytes: 0 })), first)
  assert.equal(thrown(() => budget.remaining()), first)
  assert.equal(clock.calls(), clockCalls)
  assert.equal(signal.reads(), signalReads)
})

test("cancellation before a reservation is refused with no charges", () => {
  const signal = countingSignal()
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, signal: signal.signal })
  signal.abort()
  refusal(() => budget.reserve({ contentBytes: 1, metadataBytes: 1, units: 1 }), "aborted")
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("a clock that cancels the signal cannot let the reservation commit", () => {
  let aborted = false
  let calls = 0
  const signal = {
    get aborted() {
      return aborted
    },
  }
  const clock = () => {
    calls += 1
    if (calls > 1) aborted = true
    return 0
  }
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, signal, now: clock })

  const error = refusal(() => budget.reserve({ contentBytes: 1 }), "aborted")
  assert.equal(error.code, "aborted")
  assert.equal(calls, 2)
  assert.equal(budget.snapshot().failure, "aborted")
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("cancellation observed at the final check refuses without committing", () => {
  let reads = 0
  const signal = {
    get aborted() {
      reads += 1
      return reads >= 5
    },
  }
  const clock = steppingClock([0])
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, signal, now: clock.clock })

  const error = refusal(() => budget.reserve({ contentBytes: 1, metadataBytes: 1, units: 1 }), "aborted")
  assert.equal(error.code, "aborted")
  assert.equal(reads, 5)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("a deadline reached at the final check refuses without committing", () => {
  const clock = steppingClock([0, 0, 10])
  const budget = createInputBudget({ limits: { timeoutMs: 10 }, now: clock.clock })

  refusal(() => budget.reserve({ contentBytes: 1, metadataBytes: 1, units: 1 }), "deadline")
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("exact-deadline, regressing, non-finite and throwing clocks are typed refusals", () => {
  const exact = createInputBudget({ limits: { timeoutMs: 10 }, now: steppingClock([0, 10]).clock })
  refusal(() => exact.reserve({ contentBytes: 1 }), "deadline")
  assert.deepEqual(exact.snapshot().usage, ZERO_USAGE)

  const regressing = createInputBudget({ limits: { timeoutMs: 100 }, now: steppingClock([0, 5, 4]).clock })
  refusal(() => regressing.reserve({ contentBytes: 1 }), "invalidClock")
  assert.deepEqual(regressing.snapshot().usage, ZERO_USAGE)

  const nonFinite = createInputBudget({ limits: { timeoutMs: 100 }, now: steppingClock([0, NaN]).clock })
  refusal(() => nonFinite.reserve({ contentBytes: 1 }), "invalidClock")
  assert.deepEqual(nonFinite.snapshot().usage, ZERO_USAGE)

  let calls = 0
  const throwingClock = () => {
    calls += 1
    if (calls > 1) throw new Error("tick")
    return 0
  }
  const throwing = createInputBudget({ limits: { timeoutMs: 100 }, now: throwingClock })
  refusal(() => throwing.reserve({ contentBytes: 1 }), "invalidClock")
  assert.deepEqual(throwing.snapshot().usage, ZERO_USAGE)
})

test("a committed reservation performs only the entry and final clock reads", () => {
  const clock = steppingClock([0])
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, now: clock.clock })
  const afterFactory = clock.calls()

  const result = budget.reserve({ contentBytes: 1, metadataBytes: 1, units: 1 })
  assert.equal(clock.calls(), afterFactory + 2)
  budget.snapshot()
  assert.equal(clock.calls(), afterFactory + 2)
  assert.deepEqual(result.usage, { contentBytes: 1, metadataBytes: 1, units: 1 })
})

test("a zero reservation still observes cancellation and the clock", () => {
  const signal = countingSignal()
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, signal: signal.signal })
  signal.abort()
  refusal(() => budget.reserve(), "aborted")
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)

  const late = createInputBudget({ limits: { timeoutMs: 10 }, now: steppingClock([0, 10]).clock })
  refusal(() => late.reserve(), "deadline")
  assert.deepEqual(late.snapshot().usage, ZERO_USAGE)
})

test("the diagnostic snapshot works after failure without invoking clock or signal", () => {
  const signal = countingSignal()
  const clock = steppingClock([0])
  const limits = { ...DEFAULT_LIMITS, timeoutMs: 1000 }
  const budget = createInputBudget({ limits, signal: signal.signal, now: clock.clock })
  signal.abort()

  const first = refusal(() => budget.check(), "aborted")
  const clockCalls = clock.calls()
  const signalReads = signal.reads()

  const snapshot = budget.snapshot()
  assert.equal(snapshot.failure, "aborted")
  assert.deepEqual(snapshot.usage, ZERO_USAGE)
  assert.deepEqual(snapshot.limits, limits)
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.limits))
  assert.ok(Object.isFrozen(snapshot.usage))
  assert.equal(clock.calls(), clockCalls)
  assert.equal(signal.reads(), signalReads)

  const again = budget.snapshot()
  assert.notEqual(again, snapshot)
  assert.notEqual(again.limits, snapshot.limits)
  assert.notEqual(again.usage, snapshot.usage)
  assert.deepEqual(again, snapshot)
  assert.equal(thrown(() => budget.check()), first)
})

test("unexpected failures become one latched typed error", () => {
  const budget = createInputBudget({ limits: { timeoutMs: 1000 } })
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error("hostile record")
    },
  })

  const error = refusal(() => budget.reserve(hostile), "internal")
  assert.equal(thrown(() => budget.check()), error)
  assert.equal(thrown(() => budget.remaining()), error)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("remaining checks and latches the lifetime deadline", () => {
  const budget = createInputBudget({ limits: { timeoutMs: 10 }, now: steppingClock([0, 10]).clock })
  const error = refusal(() => budget.remaining(), "deadline")
  assert.equal(thrown(() => budget.reserve()), error)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("remaining checks and latches cancellation", () => {
  const signal = new AbortController()
  const budget = createInputBudget({ signal: signal.signal })
  signal.abort()
  const error = refusal(() => budget.remaining(), "aborted")
  assert.equal(thrown(() => budget.check()), error)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("already cancelled startup refuses without calling the clock", () => {
  let reads = 0
  refusal(() => createInputBudget({ signal: { aborted: true }, now: () => { reads++; return 0 } }), "aborted")
  assert.equal(reads, 0)
})

test("a clock that cancels during startup cannot return a healthy budget", () => {
  const controller = new AbortController()
  refusal(() => createInputBudget({ signal: controller.signal, now() { controller.abort(); return 0 } }), "aborted")
})

test("caught clock reentrancy cannot overdraw a prechecked reservation", () => {
  let budget, calls = 0, nestedError
  budget = createInputBudget({ limits: { maxAggregateBytes: 1 }, now() {
    if (++calls === 3) {
      try { budget.reserve({ contentBytes: 1 }) } catch (error) { nestedError = error }
    }
    return 0
  } })
  const error = refusal(() => budget.reserve({ contentBytes: 1 }), "reentrant")
  assert.equal(error, nestedError)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("caught signal reentrancy cannot clear the first failure or consume counters", () => {
  let budget, reads = 0, trigger = false, nestedError
  const signal = { get aborted() {
    reads++
    if (trigger) {
      trigger = false
      try { budget.check() } catch (error) { nestedError = error }
    }
    return false
  } }
  budget = createInputBudget({ signal, now: () => 0 })
  trigger = true
  const error = refusal(() => budget.reserve({ contentBytes: 1 }), "reentrant")
  assert.equal(error, nestedError)
  const stoppedReads = reads
  assert.equal(thrown(() => budget.remaining()), error)
  assert.equal(reads, stoppedReads)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("a later unexpected hook error cannot replace the first reentrancy refusal", () => {
  let budget, trigger = false, nestedError
  const signal = { get aborted() {
    if (trigger) {
      trigger = false
      try { budget.check() } catch (error) { nestedError = error }
      throw new Error("later hook failure")
    }
    return false
  } }
  budget = createInputBudget({ signal, now: () => 0 })
  trigger = true
  const error = refusal(() => budget.reserve({ units: 1 }), "reentrant")
  assert.equal(error, nestedError)
  assert.equal(thrown(() => budget.check()), error)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("remaining performs its own lifecycle clock check and latches refusal", () => {
  const budget = createInputBudget({ limits: { timeoutMs: 100 }, now: steppingClock([0, 5, 4]).clock })
  assert.deepEqual(budget.remaining(), {
    contentBytes: DEFAULT_LIMITS.maxAggregateBytes,
    metadataBytes: DEFAULT_LIMITS.maxMetadataBytes,
    units: DEFAULT_LIMITS.maxFiles,
  })
  const error = refusal(() => budget.remaining(), "invalidClock")
  assert.equal(thrown(() => budget.check()), error)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("remaining refuses a clock that cancels during its own check", () => {
  let aborted = false
  let calls = 0
  const signal = {
    get aborted() {
      return aborted
    },
  }
  const clock = () => {
    calls += 1
    if (calls > 1) aborted = true
    return 0
  }
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, signal, now: clock })

  refusal(() => budget.remaining(), "aborted")
  assert.equal(calls, 2)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("snapshot is allowed during an active reservation and performs no hooks", () => {
  let budget
  let calls = 0
  let observed = null
  const clock = () => {
    calls += 1
    if (calls === 3) observed = budget.snapshot()
    return 0
  }
  budget = createInputBudget({ limits: { timeoutMs: 1000 }, now: clock })

  const result = budget.reserve({ contentBytes: 3, metadataBytes: 2, units: 1 })
  assert.ok(observed)
  assert.equal(observed.failure, null)
  assert.deepEqual(observed.usage, ZERO_USAGE)
  assert.equal(calls, 3)
  assert.deepEqual(result.usage, { contentBytes: 3, metadataBytes: 2, units: 1 })
})

test("a caught nested remaining during a reservation refuses reentrantly without committing", () => {
  let budget, calls = 0, nestedError
  budget = createInputBudget({ limits: { timeoutMs: 1000 }, now() {
    if (++calls === 3) {
      try { budget.remaining() } catch (error) { nestedError = error }
    }
    return 0
  } })

  const error = refusal(() => budget.reserve({ contentBytes: 1 }), "reentrant")
  assert.equal(error, nestedError)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("a later typed hook error cannot replace the first reentrancy refusal", () => {
  let budget, calls = 0, nestedError
  const clock = () => {
    calls += 1
    if (calls === 3) {
      try { budget.reserve({ contentBytes: 1 }) } catch (error) { nestedError = error }
      throw new InputBudgetError("invalidClock", "later typed failure", {})
    }
    return 0
  }
  budget = createInputBudget({ limits: { timeoutMs: 1000 }, now: clock })

  const error = refusal(() => budget.reserve({ contentBytes: 1 }), "reentrant")
  assert.equal(error, nestedError)
  assert.equal(thrown(() => budget.check()), error)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("a caught cost-trap reentrancy cannot commit a reservation", () => {
  let budget, nestedError
  const cost = new Proxy({}, {
    ownKeys() {
      try { budget.reserve({ contentBytes: 1 }) } catch (error) { nestedError = error }
      return []
    },
  })
  budget = createInputBudget({ limits: { timeoutMs: 1000 } })

  const error = refusal(() => budget.reserve(cost), "reentrant")
  assert.equal(error, nestedError)
  assert.equal(budget.snapshot().failure, "reentrant")
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})

test("a startup clock that throws after cancelling is refused as aborted", () => {
  const controller = new AbortController()
  let calls = 0
  const error = refusal(
    () => createInputBudget({ signal: controller.signal, now() { calls += 1; controller.abort(); throw new Error("tick") } }),
    "aborted",
  )
  assert.equal(calls, 1)
  assert.equal(error.code, "aborted")
})

test("an accounting clock that throws after cancelling is refused as aborted", () => {
  let calls = 0
  let aborted = false
  const signal = {
    get aborted() {
      return aborted
    },
  }
  const clock = () => {
    calls += 1
    if (calls > 1) {
      aborted = true
      throw new Error("tick")
    }
    return 0
  }
  const budget = createInputBudget({ limits: { timeoutMs: 1000 }, signal, now: clock })

  refusal(() => budget.remaining(), "aborted")
  assert.equal(calls, 2)
  assert.deepEqual(budget.snapshot().usage, ZERO_USAGE)
})
