import assert from "node:assert/strict"
import test from "node:test"
import { open, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createProcReader,
  DEFAULT_PROC_LIMITS,
  discoverProcUnits,
  isServiceCommand,
  parseAuxvUnits,
  parseElfLayout,
  parseStat,
  readBoundedProcBytes,
  readBoundedProcText,
  readElfHeader,
  type ElfLayout,
  type ProcEntry,
  type ProcReader,
  type ProcUnits,
} from "../src/proc.ts"
import { createResourceMonitor, sampleResources } from "../src/monitor.ts"
import { footerText, formatCpu, formatMiB, resourceTone } from "../src/format.ts"
import {
  isPrimaryMouseButton,
  isResourcePanel,
  openPanelOrFallback,
  registerResourceFooterSlots,
  RESOURCE_FOOTER_SLOTS,
  RESOURCE_PANEL_NAME,
} from "../src/registration.ts"
import { DEFAULT_INTERVAL_MS, MAX_INTERVAL_MS, MIN_INTERVAL_MS, normalizeIntervalMs } from "../src/options.ts"

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "proc")
const fixtureUnits = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "proc-units.json"), "utf8")) as ProcUnits
const fixtureDependencies = { discoverUnits: async () => fixtureUnits }
const entry = (pid: number, ppid: number, ticks: number, rssPages: number, isService = false, startTimeTicks = pid): ProcEntry => ({
  pid,
  ppid,
  utime: ticks,
  stime: 0,
  startTimeTicks,
  rssPages,
  comm: "node",
  isService,
})

function syntheticStat(pid: number, ppid: number, started: number): string {
  const fields = Array<string>(22).fill("0")
  fields[0] = "S"
  fields[1] = String(ppid)
  fields[11] = "1"
  fields[19] = String(started)
  fields[21] = "1"
  return `${pid} (synthetic fixture) ${fields.join(" ")}\n`
}

function fakeTimers() {
  let callback: (() => void) | undefined
  let cleared = false
  return {
    schedule: (next: () => void, delay: number) => {
      assert.equal(delay, 1_000)
      callback = next
      return () => { cleared = true }
    },
    tick: () => callback?.(),
    isCleared: () => cleared,
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

test("parses a real-shaped proc stat record with spaces and parentheses in comm", () => {
  const parsed = parseStat("42 (worker with ) parens) S 41 0 0 0 0 0 0 0 0 0 123 7 0 0 0 0 0 0 99 4096 17", 42)
  assert.deepEqual(parsed, {
    pid: 42,
    ppid: 41,
    utime: 123,
    stime: 7,
    startTimeTicks: 99,
    rssPages: 17,
    comm: "worker with ) parens",
  })
  assert.equal(parseStat("42 (broken) S 41", 42), undefined)
  assert.equal(parseStat("42 (broken) S 41 0 0 0 0 0 0 0 0 0 -1 0 0 0 0 0 0 0 0 99 0 17", 42), undefined)
})

test("proc stat records must identify the requested PID", () => {
  const stat = syntheticStat(102, 101, 900)
  assert.equal(parseStat(stat, 102)?.pid, 102)
  assert.equal(parseStat(stat, 103), undefined)
})

test("reads the bounded fixture process tree from real proc-formatted files", async () => {
  const reader = await createProcReader(fixtureRoot, undefined, fixtureDependencies)
  const entries = await reader.list(101)
  assert.deepEqual(entries.map(({ pid, ppid }) => [pid, ppid]), [[101, 1], [102, 101]])
  assert.deepEqual(entries.map(({ utime, stime, rssPages }) => [utime, stime, rssPages]), [[100, 20, 128], [40, 10, 32]])
  assert.deepEqual(entries.map(({ startTimeTicks }) => startTimeTicks), [500, 900])
  assert.deepEqual({ pageSize: reader.pageSize, clockTicks: reader.clockTicks }, fixtureUnits)
  assert.equal(entries.some((item) => "cmdline" in item), false)
  assert.equal(entries.every((item) => item.isService === false), true)
})

function auxvFixture(layout: ElfLayout, pairs: ReadonlyArray<readonly [number | bigint, number | bigint]>): Buffer {
  const bytes = Buffer.alloc(pairs.length * layout.wordBytes * 2)
  for (const [index, pair] of pairs.entries()) {
    for (const [part, value] of pair.entries()) {
      const offset = (index * 2 + part) * layout.wordBytes
      if (layout.wordBytes === 4) {
        if (layout.littleEndian) bytes.writeUInt32LE(Number(value), offset)
        else bytes.writeUInt32BE(Number(value), offset)
      } else if (layout.littleEndian) bytes.writeBigUInt64LE(BigInt(value), offset)
      else bytes.writeBigUInt64BE(BigInt(value), offset)
    }
  }
  return bytes
}

test("decodes 32- and 64-bit ELF layouts and auxv units in both byte orders", async () => {
  for (const wordBytes of [4, 8] as const) {
    for (const littleEndian of [true, false]) {
      const layout = { wordBytes, littleEndian }
      const header = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, wordBytes === 4 ? 1 : 2, littleEndian ? 1 : 2])
      const ignoredValue = wordBytes === 8 ? 0xffffffffffffffffn : 0xffffffff
      const bytes = auxvFixture(layout, [[3, ignoredValue], [6, 65_536], [17, 250], [0, 0]])
      assert.deepEqual(parseElfLayout(header), layout)
      assert.deepEqual(parseAuxvUnits(bytes, layout), fixtureUnits)
      assert.deepEqual(await discoverProcUnits({
        platform: "linux", readElfHeader: async () => header, readAuxv: async () => bytes,
      }), fixtureUnits)
    }
  }
})

test("rejects malformed, ambiguous, missing, and unsafe auxiliary vector units", async () => {
  const layout: ElfLayout = { wordBytes: 8, littleEndian: true }
  const invalidCases: ReadonlyArray<ReadonlyArray<readonly [number | bigint, number | bigint]>> = [
    [[6, 4096], [0, 0]],
    [[6, 4096], [6, 4096], [17, 100], [0, 0]],
    [[6, 4096], [17, 100], [17, 100], [0, 0]],
    [[6, 0], [17, 100], [0, 0]],
    [[6, 4096], [17, 0], [0, 0]],
    [[6, 4096], [17, 100]],
    [[6, 4096], [17, 100], [0, 1]],
    [[6, 4096], [17, 100], [0, 0], [5, 8]],
    [[6, 9007199254740992n], [17, 100], [0, 0]],
  ]
  for (const pairs of invalidCases) {
    assert.throws(() => parseAuxvUnits(auxvFixture(layout, pairs), layout))
  }
  assert.throws(() => parseAuxvUnits(Buffer.alloc(15), layout), /layout/)
  assert.throws(() => parseAuxvUnits(Buffer.alloc(4_112), layout), /layout/)
  assert.throws(() => parseElfLayout(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 3, 1])), /ELF/)
  assert.throws(() => parseElfLayout(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 3])), /ELF/)
  assert.throws(() => parseElfLayout(Uint8Array.from([0, 0x45, 0x4c, 0x46, 2, 1])), /ELF/)
  assert.throws(() => parseElfLayout(Uint8Array.from([0x7f, 0x45])), /ELF/)
  for (const littleEndian of [true, false]) {
    const kernelLayout = { wordBytes: 8 as const, littleEndian }
    const bytes = auxvFixture(kernelLayout, [[6, 4096], [17, 100], [0, 0]])
    assert.throws(() => parseAuxvUnits(bytes, { wordBytes: 4, littleEndian }))
  }

  let reads = 0
  await assert.rejects(discoverProcUnits({ platform: "darwin", readElfHeader: async () => { reads++; return new Uint8Array() } }), /unavailable/)
  assert.equal(reads, 0)
  const header = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1])
  await assert.rejects(discoverProcUnits({ platform: "linux", readElfHeader: async () => header, readAuxv: async () => undefined }), /unavailable/)
  await assert.rejects(discoverProcUnits({ platform: "linux", readElfHeader: async () => { throw new Error("header unavailable") } }), /header unavailable/)
  await assert.rejects(createProcReader(fixtureRoot, undefined, {
    discoverUnits: async () => { throw new Error("auxv unavailable") },
  }), /auxv unavailable/)
  await assert.rejects(createProcReader(fixtureRoot, undefined, {
    discoverUnits: async () => ({ pageSize: 0, clockTicks: 250 }),
  }), /unavailable/)
})

test("reads exactly the ELF prefix even on short reads and closes on failure", async () => {
  const bytes = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 99])
  let cursor = 0
  let closed = false
  const opener = (async (path: string) => {
    assert.equal(path, "/proc/self/exe")
    return {
      read: async (buffer: Buffer, offset: number, length: number) => {
        const bytesRead = Math.min(2, length, bytes.length - cursor)
        bytes.copy(buffer, offset, cursor, cursor + bytesRead)
        cursor += bytesRead
        return { bytesRead, buffer }
      },
      close: async () => { closed = true },
    }
  }) as unknown as typeof open
  assert.deepEqual(await readElfHeader(opener), bytes.subarray(0, 6))
  assert.equal(cursor, 6)
  assert.equal(closed, true)

  closed = false
  const truncated = (async () => ({
    read: async (buffer: Buffer) => ({ bytesRead: 0, buffer }),
    close: async () => { closed = true },
  })) as unknown as typeof open
  await assert.rejects(readElfHeader(truncated), /truncated/)
  assert.equal(closed, true)
})

test("reads live Linux auxv units without starting a helper process", { skip: process.platform !== "linux" }, async () => {
  const units = await discoverProcUnits()
  assert.ok(Number.isSafeInteger(units.pageSize) && units.pageSize > 0)
  assert.ok(Number.isSafeInteger(units.clockTicks) && units.clockTicks > 0)
  const source = await readFile(new URL("../src/proc.ts", import.meta.url), "utf8")
  assert.doesNotMatch(source, /node:child_process|Bun\.spawn|\bexecFile\b/)
})

test("bounds proc reads during acquisition and detects a growing children file", async () => {
  let content = Buffer.from("1 2 ")
  let cursor = 0
  let calls = 0
  let bytesReadTotal = 0
  let largestBuffer = 0
  let closed = false
  const opener = (async () => ({
    read: async (buffer: Buffer, offset: number, length: number) => {
      calls++
      if (calls === 2) content = Buffer.concat([content, Buffer.from("3 4 5")])
      largestBuffer = Math.max(largestBuffer, length)
      const bytesRead = Math.min(2, length, content.length - cursor)
      if (bytesRead > 0) content.copy(buffer, offset, cursor, cursor + bytesRead)
      cursor += bytesRead
      bytesReadTotal += bytesRead
      return { bytesRead, buffer }
    },
    close: async () => { closed = true },
  })) as unknown as typeof open

  await assert.rejects(readBoundedProcText("children", 8, opener), /exceeded 8 bytes/)
  assert.equal(bytesReadTotal, 9)
  assert.ok(largestBuffer <= 9)
  assert.equal(closed, true)

  await assert.rejects(readBoundedProcBytes("children", 65_537, opener), /maxBytes/)

  const limited = await createProcReader(fixtureRoot, {
    ...DEFAULT_PROC_LIMITS,
    maxChildrenTextBytes: 2,
  }, fixtureDependencies)
  await assert.rejects(limited.list(101), /exceeded 2 bytes/)
})

test("applies per-file caps and returns only a service classification, never argv", async () => {
  const requested: Array<{ path: string; maxBytes: number }> = []
  const reader = await createProcReader(fixtureRoot, undefined, {
    ...fixtureDependencies,
    readText: (path, maxBytes) => {
      requested.push({ path, maxBytes })
      return readBoundedProcText(path, maxBytes)
    },
  })
  const entries = await reader.list(101)
  assert.equal(entries.some((item) => "cmdline" in item), false)
  for (const pid of [101, 102]) {
    assert.ok(requested.some((item) => item.path.endsWith(`/${pid}/stat`) && item.maxBytes === 4_096))
    assert.ok(requested.some((item) => item.path.endsWith(`/${pid}/cmdline`) && item.maxBytes === 16_384))
    assert.ok(requested.some((item) => item.path.endsWith(`/${pid}/task/${pid}/children`)
      && item.maxBytes === DEFAULT_PROC_LIMITS.maxChildrenTextBytes))
  }
})

test("selects only the TUI process subtree and excludes a service and its descendants", () => {
  const all = [entry(10, 1, 0, 1), entry(11, 10, 0, 2), entry(12, 10, 0, 3, true), entry(13, 12, 0, 4), entry(20, 1, 0, 5)]
  const first = sampleResources(all, 10, undefined, 1_000, fixtureUnits)
  assert.deepEqual([...first.sample.processes.keys()], [10, 11])
  assert.equal(first.snapshot.processCount, 2)
  assert.equal(isServiceCommand("/usr/bin/opencode\0serve\0--service\0"), true)
  assert.equal(isServiceCommand("node\0script.js\0serve\0--service\0"), false)
})

test("discovers children of non-leader threads once and tolerates exited threads", async () => {
  const reader = await createProcReader(fixtureRoot, undefined, {
    ...fixtureDependencies,
    listTasks: async (path) => path.endsWith("/101/task") ? [101, 201, 202] : [102],
    readText: async (path, cap) => {
      if (path.endsWith("/101/task/101/children")) return ""
      if (path.endsWith("/101/task/201/children")) return "102 102"
      if (path.endsWith("/101/task/202/children")) return undefined
      return readBoundedProcText(path, cap)
    },
  })
  assert.deepEqual((await reader.list(101)).map((item) => item.pid), [101, 102])
})

test("bounds task enumeration and aggregate per-process child acquisition", async () => {
  const oversized = await createProcReader(fixtureRoot, undefined, {
    ...fixtureDependencies, listTasks: async () => Array.from({ length: 4097 }, (_, i) => i + 1),
  })
  await assert.rejects(oversized.list(101), /oversized live task list/)
  const bounded = await createProcReader(fixtureRoot, { ...DEFAULT_PROC_LIMITS, maxChildrenTextBytes: 3 }, {
    ...fixtureDependencies,
    listTasks: async () => [101, 201],
    readText: async (path, cap) => {
      if (path.endsWith("/children")) {
        if (cap < 3) throw new Error("aggregate child cap")
        return "102"
      }
      return readBoundedProcText(path, cap)
    },
  })
  await assert.rejects(bounded.list(101), /aggregate child cap/)
})

test("rejects a process identity change during thread traversal", async () => {
  let stats = 0
  const reader = await createProcReader(fixtureRoot, undefined, {
    ...fixtureDependencies,
    readText: async (path, cap) => {
      const text = await readBoundedProcText(path, cap)
      if (path.endsWith("/101/stat") && ++stats > 2) return text?.replace("500", "501")
      return text
    },
  })
  await assert.rejects(reader.list(101), /identity changed/)
})

test("a queued child with a changed parent is skipped before argv or thread reads", async () => {
  let inspectedArgv = false
  let inspectedThreads = false
  const reader = await createProcReader(fixtureRoot, undefined, {
    ...fixtureDependencies,
    readText: async (path, cap) => {
      if (path.endsWith("/102/stat")) return syntheticStat(102, 999, 900)
      if (path.endsWith("/102/cmdline")) inspectedArgv = true
      if (path.endsWith("/102/task/102/children")) inspectedThreads = true
      return readBoundedProcText(path, cap)
    },
  })
  assert.deepEqual((await reader.list(101)).map(({ pid }) => pid), [101])
  assert.equal(inspectedArgv, false)
  assert.equal(inspectedThreads, false)
})

test("PID reuse or reparenting during argv acquisition cannot publish or traverse the replacement", async () => {
  for (const replacement of [syntheticStat(102, 999, 900), syntheticStat(102, 101, 901)]) {
    let argvRead = false
    let inspectedThreads = false
    const reader = await createProcReader(fixtureRoot, undefined, {
      ...fixtureDependencies,
      readText: async (path, cap) => {
        if (path.endsWith("/102/stat") && argvRead) return replacement
        if (path.endsWith("/102/cmdline")) argvRead = true
        if (path.endsWith("/102/task/102/children")) inspectedThreads = true
        return readBoundedProcText(path, cap)
      },
    })
    assert.deepEqual((await reader.list(101)).map(({ pid }) => pid), [101])
    assert.equal(inspectedThreads, false)
  }
})

test("refuses missing child lists on a still-live thread", async () => {
  const reader = await createProcReader(fixtureRoot, undefined, {
    ...fixtureDependencies,
    listTasks: async () => [101],
    readText: async (path, cap) => {
      if (path.endsWith("/children")) return undefined
      if (path.endsWith("/task/101/stat")) return "live thread"
      return readBoundedProcText(path, cap)
    },
  })
  await assert.rejects(reader.list(101), /missing live children list/)
})

test("samples the running Linux test process with the actual proc reader", { skip: process.platform !== "linux" }, async () => {
  const reader = await createProcReader()
  const first = sampleResources(await reader.list(process.pid), process.pid, undefined, performance.now(), reader)
  await flush()
  const second = sampleResources(await reader.list(process.pid), process.pid, first.sample, performance.now(), reader)
  assert.ok(second.sample.processes.has(process.pid))
  assert.ok(second.snapshot.processCount >= 1)
  assert.ok(Number.isFinite(second.snapshot.rssBytes) && second.snapshot.rssBytes > 0)
  assert.ok(Number.isFinite(second.snapshot.cpuPercent) && second.snapshot.cpuPercent! >= 0)
})

test("computes CPU from tick deltas, keeps multicore values, and handles PID reuse", () => {
  const reader = fixtureUnits
  const first = sampleResources([entry(10, 1, 100, 10), entry(11, 10, 25, 5)], 10, undefined, 1_000, reader)
  const second = sampleResources([entry(10, 1, 500, 20), entry(11, 10, 1, 7, undefined, 999)], 10, first.sample, 2_000, reader)
  assert.equal(first.snapshot.cpuPercent, undefined)
  assert.equal(second.snapshot.cpuPercent, 160)
  assert.equal(second.snapshot.rssBytes, 27 * fixtureUnits.pageSize)
  assert.equal(second.snapshot.processCount, 2)
})

test("normalizes only bounded finite integer polling intervals", () => {
  assert.equal(normalizeIntervalMs(MIN_INTERVAL_MS), MIN_INTERVAL_MS)
  assert.equal(normalizeIntervalMs(MAX_INTERVAL_MS), MAX_INTERVAL_MS)
  for (const value of [MIN_INTERVAL_MS - 1, MAX_INTERVAL_MS + 1, 1_000.5, Number.MAX_SAFE_INTEGER, Infinity, "2000", null]) {
    assert.equal(normalizeIntervalMs(value), DEFAULT_INTERVAL_MS)
  }
})

test("formats truthful unknown values, CPU/RAM text, and severity thresholds", () => {
  const normal = { cpuPercent: 7, rssBytes: 371 * 1_048_576, processCount: 2 }
  assert.equal(formatMiB(normal.rssBytes), "371 MiB")
  assert.equal(formatCpu(undefined), "?%")
  assert.equal(footerText({ ...normal, cpuPercent: undefined }), "CPU ?% · RAM 371 MiB")
  assert.equal(resourceTone(normal), "normal")
  assert.equal(resourceTone({ ...normal, cpuPercent: 80 }), "warning")
  assert.equal(resourceTone({ ...normal, rssBytes: 2 * 1_073_741_824 }), "error")
  assert.equal(footerText({ rssBytes: Number.NaN, processCount: 0 }), "CPU ?% · RAM ? MiB")
})

test("retains a valid last sample through transient reader errors and stops future reads", async () => {
  const timers = fakeTimers()
  let reads = 0
  let now = 1_000
  const snapshots: number[] = []
  const reader: ProcReader = {
    ...fixtureUnits,
    list: async () => {
      reads++
      if (reads === 2) throw new Error("temporary proc read failure")
      return [entry(10, 1, reads, 2)]
    },
  }
  const stop = createResourceMonitor(reader, 10, 1_000, (snapshot) => snapshots.push(snapshot.rssBytes), {
    now: () => now,
    schedule: timers.schedule,
  })
  await flush()
  assert.deepEqual(snapshots, [2 * fixtureUnits.pageSize])
  timers.tick()
  await flush()
  assert.deepEqual(snapshots, [2 * fixtureUnits.pageSize])
  now += 1_000
  timers.tick()
  await flush()
  assert.deepEqual(snapshots, [2 * fixtureUnits.pageSize, 2 * fixtureUnits.pageSize])
  stop()
  assert.equal(timers.isCleared(), true)
  timers.tick()
  await flush()
  assert.equal(reads, 3)
})

test("does not overlap scans or publish an in-flight result after disposal", async () => {
  const timers = fakeTimers()
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  let reads = 0
  let updates = 0
  const reader: ProcReader = {
    ...fixtureUnits,
    list: async () => {
      reads++
      await pending
      return [entry(10, 1, 1, 1)]
    },
  }
  const stop = createResourceMonitor(reader, 10, 1_000, () => { updates++ }, {
    schedule: timers.schedule,
  })
  timers.tick()
  assert.equal(reads, 1)
  stop()
  release()
  await flush()
  assert.equal(updates, 0)
  assert.equal(timers.isCleared(), true)
})

test("validates proc reader roots and bounds before traversal", async () => {
  await assert.rejects(createProcReader(fixtureRoot, { maxProcesses: 0, maxDepth: 1, maxChildren: 1, maxChildrenTextBytes: 10 }, fixtureDependencies), /proc limits/)
  const reader = await createProcReader(fixtureRoot, undefined, fixtureDependencies)
  await assert.rejects(reader.list(0), /rootPid/)
  await assert.rejects(reader.list(104), /malformed live proc stat/)
  await assert.rejects(reader.list(103), /missing live children list/)
  const bounded = await createProcReader(fixtureRoot, { maxProcesses: 1, maxDepth: 1, maxChildren: 2, maxChildrenTextBytes: 20 }, fixtureDependencies)
  await assert.rejects(bounded.list(101), /maxProcesses/)
})

test("registers only append-only status contributions and cleans both up", () => {
  const claims: string[] = []
  const stopped: string[] = []
  const stop = registerResourceFooterSlots((claim) => {
    claims.push(claim.append)
    return () => stopped.push(claim.append)
  }, () => null)
  assert.deepEqual(claims, ["home.footer.status", "prompt.footer.status"])
  assert.deepEqual(claims, [...RESOURCE_FOOTER_SLOTS])
  stop()
  assert.deepEqual(stopped, claims)
})

test("exposes a root TUI entry point for the installed OpenCode loader", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    exports: { "./tui": string }
  }
  assert.equal(manifest.exports["./tui"], "./tui.tsx")
  const entrypoint = await readFile(new URL("../tui.tsx", import.meta.url), "utf8")
  assert.match(entrypoint, /^export \{ default \} from "\.\/src\/tui\.tsx"\s*$/)
})

test("source contract uses only the namespaced session panel and keeps the default sidebar untouched", async () => {
  assert.equal(RESOURCE_PANEL_NAME, "splice.resource-monitor")
  assert.equal(isResourcePanel(RESOURCE_PANEL_NAME), true)
  assert.equal(isResourcePanel("some-other-plugin.panel"), false)
  const source = await readFile(new URL("../src/tui.tsx", import.meta.url), "utf8")
  assert.match(source, /append: "session\.panel"/)
  assert.doesNotMatch(source, /replace\s*:/)
  assert.doesNotMatch(source, /sidebar\.(?:content|footer)/)
})

test("opens a session panel when available and falls back to a home dialog", () => {
  let fallback = 0
  assert.equal(openPanelOrFallback(() => true, () => { fallback++ }), "panel")
  assert.equal(fallback, 0)
  assert.equal(openPanelOrFallback(() => false, () => { fallback++ }), "fallback")
  assert.equal(fallback, 1)
  assert.equal(isPrimaryMouseButton(0), true)
  assert.equal(isPrimaryMouseButton(1), false)
  assert.equal(isPrimaryMouseButton(2), false)
})
