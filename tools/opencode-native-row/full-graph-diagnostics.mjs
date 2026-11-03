import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"

export const SCHEMA = "native-full-graph-diagnostics/v1"
export const EXPECTATIONS_SCHEMA = "native-full-graph-expectations/v1"

// These are the repository-mandated limits for the full 2,827-file native graph.
// Lowering them is a test choice; raising them is refused by normalizeExpectations.
// The acquisition bounds are additions that only make reads stricter.
export const LIMITS = Object.freeze({
  ownedRSSMiB: 1536,
  availableFloorMiB: 1280,
  prelaunchMiB: 2816,
  deadlineMs: 90000,
  stdoutBytes: 2 * 1024 * 1024,
  stderrBytes: 256 * 1024,
  receiptBytes: 64 * 1024 * 1024,
  sampleMs: 100,
  expectationsBytes: 8 * 1024 * 1024,
  graphReceiptBytes: 64 * 1024 * 1024,
  compilerBytes: 128 * 1024 * 1024,
  apiModuleBytes: 16 * 1024 * 1024,
  fileBytes: 128 * 1024 * 1024,
  graphTotalBytes: 512 * 1024 * 1024,
  acquisitionMs: 120000,
  samplerEntries: 8192,
  samplerMs: 100,
  postExitGraceMs: 2000,
  drainMs: 250,
})

export const FAMILIES = Object.freeze([
  "config", "program", "global", "syntactic", "bind", "declaration", "semantic",
])

const FAMILY_METHODS = Object.freeze({
  config: "getConfigFileParsingDiagnostics",
  program: "getProgramDiagnostics",
  global: "getGlobalDiagnostics",
  syntactic: "getSyntacticDiagnostics",
  bind: "getBindDiagnostics",
  declaration: "getDeclarationDiagnostics",
  semantic: "getSemanticDiagnostics",
})

const FILE_SCOPED = Object.freeze(["syntactic", "bind", "declaration", "semantic"])
const EXIT = Object.freeze({ clean: 0, "compiler-error": 1, incomplete: 2, "invalid-config": 3 })

const digest = bytes => createHash("sha256").update(bytes).digest("hex")
const samplerSleep = new Int32Array(new SharedArrayBuffer(4))
const EMPTY_SHA256 = createHash("sha256").digest("hex")
const isAbsolute = value => typeof value === "string" && path.isAbsolute(value)
const isSha256 = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value)

function acquisitionError(code, message, label) {
  const error = new Error(`${label}: ${message}`)
  error.code = code
  return error
}

// Every file read in preflight, identity and receipt routes goes through this
// path: the final component must be a regular file, the byte budget is enforced
// before and during reading, and a file that changes or times out is refused
// rather than hashed from a mixture of old and new bytes. O_NONBLOCK is a Linux
// boundary: a path swapped for a FIFO between lstat and open must not block the
// guard. Regular-file reads are unaffected by the flag.
function acquireFile(file, { maxBytes, label = "file", deadline, collect = false, hooks = {} }) {
  if (!isAbsolute(file)) throw acquisitionError("acquisition-path", "path must be absolute", label)
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw acquisitionError("acquisition-budget", "maxBytes must be a positive integer", label)
  const deadlineAt = deadline ?? performance.now() + LIMITS.acquisitionMs
  const before = fs.lstatSync(file, { bigint: true })
  if (before.isSymbolicLink()) throw acquisitionError("acquisition-symlink", "refusing a symbolic link", label)
  if (!before.isFile()) throw acquisitionError("acquisition-nonregular", "not a regular file", label)
  if (before.size > BigInt(maxBytes)) throw acquisitionError("acquisition-size", `exceeds ${maxBytes} bytes`, label)
  hooks.beforeOpen?.(file)
  const nonBlock = process.platform === "linux" ? fs.constants.O_NONBLOCK : 0
  let fd
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | nonBlock)
  } catch (error) {
    if (error.code === "ELOOP") throw acquisitionError("acquisition-symlink", "refusing a symbolic link", label)
    if (error.code === "ENOENT") throw acquisitionError("acquisition-missing", "file disappeared before it was opened", label)
    if (error.code === "ENXIO") throw acquisitionError("acquisition-nonregular", "not a regular file", label)
    throw error
  }
  try {
    const opened = fs.fstatSync(fd, { bigint: true })
    if (!opened.isFile()) throw acquisitionError("acquisition-nonregular", "not a regular file", label)
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw acquisitionError("acquisition-replaced", "file was replaced before it was opened", label)
    }
    const hash = createHash("sha256")
    const chunks = collect ? [] : null
    const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, maxBytes + 1))
    let position = 0
    for (;;) {
      if (performance.now() > deadlineAt) throw acquisitionError("acquisition-timeout", "acquisition deadline exceeded", label)
      // Request only one byte beyond the remaining budget, so a file that grows
      // after the fstat check cannot cause a large read before refusal.
      const request = Math.min(buffer.length, maxBytes - position + 1)
      hooks.beforeRead?.(position, file)
      const read = fs.readSync(fd, buffer, 0, request, position)
      if (read === 0) break
      hooks.afterRead?.(read, position)
      position += read
      if (position > maxBytes) throw acquisitionError("acquisition-size", `exceeds ${maxBytes} bytes`, label)
      hash.update(buffer.subarray(0, read))
      if (chunks) chunks.push(Buffer.from(buffer.subarray(0, read)))
      hooks.afterChunk?.(position, file)
    }
    const after = fs.fstatSync(fd, { bigint: true })
    const final = fs.lstatSync(file, { bigint: true })
    const unchanged = after.size === BigInt(position)
      && final.size === before.size
      && final.dev === before.dev
      && final.ino === before.ino
      && final.mtimeNs === before.mtimeNs
      && final.ctimeNs === before.ctimeNs
    if (!unchanged) throw acquisitionError("acquisition-changed", "file changed while it was read", label)
    return { sha256: hash.digest("hex"), bytes: position, data: chunks ? Buffer.concat(chunks, position) : null }
  } finally {
    fs.closeSync(fd)
  }
}

export function readStableFile(file, options) {
  return acquireFile(file, { ...options, collect: true }).data
}

export function hashStableFile(file, options) {
  const result = acquireFile(file, { ...options, collect: false })
  return { sha256: result.sha256, bytes: result.bytes }
}

function readStableJson(file, options) {
  const data = readStableFile(file, options)
  try {
    return JSON.parse(data.toString("utf8"))
  } catch (error) {
    throw acquisitionError("acquisition-json", error.message, options.label)
  }
}

function invalid(message) {
  const error = new Error(message)
  error.code = "invalid-expectations"
  return error
}

export function namesDigest(names) {
  return digest(Buffer.from(JSON.stringify([...names].sort())))
}

export function plainDiagnostic(diagnostic) {
  const plain = {
    code: diagnostic.code,
    category: diagnostic.category,
    pos: diagnostic.pos,
    end: diagnostic.end,
    text: diagnostic.text,
  }
  if (diagnostic.fileName !== undefined) plain.fileName = diagnostic.fileName
  if (diagnostic.reportsUnnecessary) plain.reportsUnnecessary = true
  if (diagnostic.reportsDeprecated) plain.reportsDeprecated = true
  if (diagnostic.messageChain) plain.messageChain = diagnostic.messageChain.map(plainDiagnostic)
  if (diagnostic.relatedInformation) plain.relatedInformation = diagnostic.relatedInformation.map(plainDiagnostic)
  return plain
}

function writeAll(fd, bytes) {
  let offset = 0
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset)
    if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) {
      throw new Error("receipt write made invalid progress")
    }
    offset += written
  }
}

const PROC_TEXT_BYTES = 64 * 1024

function readBoundedProc(file, maxBytes = PROC_TEXT_BYTES) {
  let fd
  try {
    fd = fs.openSync(file, "r")
    const buffer = Buffer.allocUnsafe(maxBytes + 1)
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0)
    if (read > maxBytes) throw new Error(`${file} exceeds ${maxBytes} bytes`)
    return buffer.toString("utf8", 0, read)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

function readBoundedText(io, file, maxBytes = PROC_TEXT_BYTES) {
  if (io.readBounded) return io.readBounded(file, maxBytes)
  const value = io.readFileSync(file, "utf8")
  if (typeof value !== "string") throw new Error(`${file} is not text`)
  if (Buffer.byteLength(value) > maxBytes) throw new Error(`${file} exceeds ${maxBytes} bytes`)
  return value
}

export function parseMemAvailable(text) {
  if (typeof text !== "string") throw new Error("meminfo is not text")
  const lines = text.split("\n").filter(line => line.startsWith("MemAvailable:"))
  if (lines.length !== 1) throw new Error("MemAvailable is missing or duplicated")
  const match = /^MemAvailable:[ \t]+([0-9]+)[ \t]+kB$/.exec(lines[0].trim())
  if (!match) throw new Error("MemAvailable has an unexpected format")
  const kib = Number(match[1])
  if (!Number.isSafeInteger(kib) || kib <= 0) throw new Error("MemAvailable is not a positive safe value")
  return kib / 1024
}

function parseVmRss(text) {
  const rssLines = text.split("\n").filter(line => line.startsWith("VmRSS:"))
  const match = rssLines.length === 1 ? /^VmRSS:[ \t]+([0-9]+)[ \t]+kB$/.exec(rssLines[0].trim()) : null
  const value = match ? Number(match[1]) : null
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function availableMiB() {
  return parseMemAvailable(readBoundedProc("/proc/meminfo"))
}

// Samples the owned process tree: the worker and every descendant that can be
// reached through /proc task children. Missing or malformed data is an unknown
// reading, so it throws instead of contributing zero bytes to a budget. Reads
// are byte-bounded, the tree is entry-bounded and the sample has a cooperative
// deadline (checked between reads, so a blocked /proc read can still overrun).
const defaultProcIo = Object.freeze({
  readFileSync: fs.readFileSync,
  readdirSync: fs.readdirSync,
  readBounded: readBoundedProc,
})

function observeStatFile(io, expectedId, file) {
  let stat
  try {
    stat = readBoundedText(io, file)
  } catch (error) {
    return error.code === "ENOENT"
      ? { kind: "missing", error: null }
      : { kind: "unknown", error: error.code ?? error.message }
  }
  if (typeof stat !== "string") return { kind: "unknown", error: "not text" }
  const end = stat.lastIndexOf(")")
  if (end < 0 || !stat.startsWith(`${expectedId} (`)) return { kind: "unknown", error: "malformed" }
  const fields = stat.slice(end + 1).trim().split(/\s+/)
  const state = fields[0]
  const ppidText = fields[1]
  const pgrpText = fields[2]
  const start = fields[19]
  if (!/^[A-Z]$/.test(state ?? "") || !/^[0-9]+$/.test(ppidText ?? "")
    || !/^[0-9]+$/.test(pgrpText ?? "") || !/^[0-9]+$/.test(start ?? "")) {
    return { kind: "unknown", error: "malformed" }
  }
  if (!Number.isSafeInteger(Number(ppidText)) || !Number.isSafeInteger(Number(pgrpText))) {
    return { kind: "unknown", error: "malformed" }
  }
  return { kind: "ok", state, ppid: Number(ppidText), pgrp: Number(pgrpText), startTime: start }
}

function observeProcessStat(io, pid) {
  return observeStatFile(io, pid, `/proc/${pid}/stat`)
}

function observeThreadStat(io, pid, tid) {
  return observeStatFile(io, tid, `/proc/${pid}/task/${tid}/stat`)
}

// A task's Z state is not a process exit: exit_notify() marks the group leader
// EXIT_ZOMBIE even while sibling threads keep the shared mm and continue to
// allocate. Classify the whole task group before accepting a leader as gone.
// An unavailable directory, an omitted leader or a listed task that vanished
// without a positive Z/X reading is not group-death proof.
function observeThreadGroup(io, pid, leaderObservation,
  { maxEntries = LIMITS.samplerEntries, account = null, measureRss = false, retried = false } = {}) {
  let tasks
  let unavailable = null
  account?.()
  try {
    tasks = io.readdirSync(`/proc/${pid}/task`)
  } catch (error) {
    unavailable = error.code ?? "task directory unavailable"
  }
  if (unavailable !== null && !retried) {
    return observeThreadGroup(io, pid, leaderObservation, { maxEntries, account, measureRss, retried: true })
  }
  if (unavailable !== null) return { kind: "unknown", error: unavailable }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    if (!retried) {
      return observeThreadGroup(io, pid, leaderObservation, { maxEntries, account, measureRss, retried: true })
    }
    return { kind: "unknown", error: "empty task directory" }
  }
  if (tasks.length > maxEntries) return { kind: "unknown", error: "task bound" }
  const seen = new Set()
  const live = []
  let liveState = null
  let sawLeader = false
  let vanished = false
  for (const tidText of tasks) {
    if (typeof tidText !== "string" || !/^[0-9]+$/.test(tidText)) {
      return { kind: "unknown", error: "malformed thread id" }
    }
    const tid = Number(tidText)
    if (!Number.isSafeInteger(tid) || tid < 1) return { kind: "unknown", error: "unsafe thread id" }
    if (seen.has(tid)) return { kind: "unknown", error: "duplicate thread id" }
    seen.add(tid)
    let thread
    if (tid === pid) {
      sawLeader = true
      thread = leaderObservation
    } else {
      account?.()
      thread = observeThreadStat(io, pid, tid)
    }
    if (thread.kind === "missing") {
      vanished = true
      continue
    }
    if (thread.kind !== "ok") return { kind: "unknown", error: thread.error ?? "thread stat unavailable" }
    if (thread.state !== "Z" && thread.state !== "X") {
      live.push(tid)
      liveState ??= thread.state
    }
  }
  if (live.length === 0) {
    if ((!sawLeader || vanished) && !retried) {
      return observeThreadGroup(io, pid, leaderObservation, { maxEntries, account, measureRss, retried: true })
    }
    if (!sawLeader || vanished) return { kind: "unknown", error: "thread group is incomplete" }
    return { kind: "gone", tasks }
  }
  if (!measureRss) return { kind: "live", state: liveState, tasks }
  let stillLive = 0
  let unproven = vanished
  for (const tid of live) {
    // A thread can carry PF_EXITING after exit_mm() removed its mm but before
    // exit_notify() marks it Z. Re-stat briefly, charged to the same budget.
    // Missing VmRSS never proves that the group exited: a still-live task must
    // remain unknown until RSS or a positive exit state can be observed.
    for (let attempt = 0; attempt < 3; attempt++) {
      account?.()
      const thread = attempt === 0 && tid === pid
        ? leaderObservation : observeThreadStat(io, pid, tid)
      if (thread.kind === "missing") break
      if (thread.kind !== "ok") return { kind: "unknown", error: thread.error ?? "thread stat unavailable" }
      if (thread.state === "Z" || thread.state === "X") break
      let status
      account?.()
      try {
        status = readBoundedText(io, `/proc/${pid}/task/${tid}/status`)
      } catch (error) {
        if (error.code === "ENOENT") break
        return { kind: "unknown", error: error.code ?? "thread status unavailable" }
      }
      const lines = status.split("\n")
      if (!lines.some(line => line.startsWith("VmRSS:"))) {
        account?.()
        Atomics.wait(samplerSleep, 0, 0, 1)
        continue
      }
      const kib = parseVmRss(status)
      if (kib === null) return { kind: "unknown", error: "thread RSS is malformed" }
      return { kind: "live", state: liveState, rssKiB: kib, tasks }
    }
    account?.()
    const finalThread = observeThreadStat(io, pid, tid)
    if (finalThread.kind === "ok" && finalThread.state !== "Z" && finalThread.state !== "X") {
      stillLive++
    } else if (finalThread.kind === "missing") {
      unproven = true
    } else if (finalThread.kind !== "ok") {
      return { kind: "unknown", error: finalThread.error ?? "thread stat unavailable" }
    }
  }
  if (stillLive === 0 && !unproven) return { kind: "gone", tasks }
  return { kind: "unknown", error: "live thread RSS unavailable" }
}

// A group read widens the PID-reuse window. Re-bind the leader's start time
// before any gone/live conclusion is used for monitoring or cleanup.
function rebindLeader(io, pid, expectedStartTime, account) {
  const observation = observeProcessStat(io, pid)
  account?.()
  if (observation.kind === "missing") return { kind: "missing" }
  if (observation.kind !== "ok") return { kind: "unknown", error: observation.error }
  if (observation.startTime !== expectedStartTime) return { kind: "reused" }
  if (observation.state !== "Z") return { kind: "live", observation }
  return { kind: "zombie", observation }
}

export function readProcessStartTime(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null
  const observation = observeProcessStat(defaultProcIo, pid)
  return observation.kind === "ok" ? observation.startTime : null
}

// Tri-state ownership observation. A boolean false cannot distinguish a
// confirmed exit/reuse from an unreadable or malformed identity, and treating
// the latter as "gone" would drop a live child from cleanup. A same-identity
// leader in Z is only gone when its task group is complete and has no live
// thread; unreadable, vanished or leader-omitted group data stays "unknown" and
// cleanup must fail closed. The extra group reads share the sampler entry/time
// envelope and return unknown before further task IO when it is exhausted.
export function observeOwnedProcess(pid, startTime, io = defaultProcIo,
  { now = () => performance.now(), deadlineMs = LIMITS.samplerMs, maxEntries = LIMITS.samplerEntries, accountWork } = {}) {
  if (!Number.isSafeInteger(pid) || pid < 1 || typeof startTime !== "string" || !/^[0-9]+$/.test(startTime)
    || typeof now !== "function" || !Number.isFinite(deadlineMs) || deadlineMs < 0 || deadlineMs > LIMITS.samplerMs
    || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > LIMITS.samplerEntries) {
    return "unknown"
  }
  const clockStarted = now()
  if (!Number.isFinite(clockStarted)) return "unknown"
  const deadlineAt = clockStarted + deadlineMs
  const wallDeadlineAt = performance.now() + deadlineMs
  let entries = 0
  const budgetError = message => {
    const error = new Error(message)
    error.code = "observer-budget"
    return error
  }
  const account = () => {
    accountWork?.()
    entries++
    if (entries > maxEntries) throw budgetError("the observer exceeds the sampler entry bound")
    const current = now()
    if (!Number.isFinite(current) || current < clockStarted || current > deadlineAt || performance.now() > wallDeadlineAt) {
      throw budgetError("the observer exceeds the sampler deadline")
    }
  }
  let observation
  try {
    account()
    observation = observeProcessStat(io, pid)
    account()
  } catch (error) {
    if (error.code === "observer-budget") return "unknown"
    throw error
  }
  if (observation.kind === "missing") return "missing"
  if (observation.kind !== "ok") return "unknown"
  if (observation.startTime !== startTime) return "reused"
  if (observation.state !== "Z") return "alive"
  let group
  try {
    group = observeThreadGroup(io, pid, observation, { maxEntries, account })
  } catch (error) {
    if (error.code === "observer-budget") return "unknown"
    throw error
  }
  // Even an unavailable or incomplete group must be followed by an identity
  // rebind; only a vanished/reused leader resolves it, never unclear group data.
  let confirmed
  try {
    account()
    confirmed = rebindLeader(io, pid, startTime, account)
  } catch (error) {
    if (error.code === "observer-budget") return "unknown"
    throw error
  }
  if (confirmed.kind === "missing") return "missing"
  if (confirmed.kind === "reused") return "reused"
  if (confirmed.kind === "unknown") return "unknown"
  if (group.kind === "unknown") return "unknown"
  if (group.kind === "live") return "alive"
  return confirmed.kind === "zombie" ? "missing" : "unknown"
}

export function sameOwnedProcess(pid, startTime) {
  return observeOwnedProcess(pid, startTime) === "alive"
}

function walkOwnedTree(pid, io, { maxEntries = LIMITS.samplerEntries, deadlineMs = LIMITS.samplerMs,
  identities = false, expectedStartTime, accountWork } = {}) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("owned RSS requires a safe positive process id")
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > LIMITS.samplerEntries) {
    throw new Error("sampler entry bound must be a positive integer no larger than the fixed limit")
  }
  if (!Number.isFinite(deadlineMs) || deadlineMs < 0 || deadlineMs > LIMITS.samplerMs) {
    throw new Error("sampler deadline must be non-negative and no larger than the fixed limit")
  }
  const deadlineAt = performance.now() + deadlineMs
  const pending = [{ pid, parent: null }]
  const seen = new Set()
  const processes = identities ? [] : null
  let rss = 0
  let entries = 0
  const account = () => {
    accountWork?.()
    entries++
    if (entries > maxEntries) throw new Error("the owned process tree exceeds the sampler entry bound")
    if (performance.now() > deadlineAt) throw new Error("the owned process tree exceeds the sampler deadline")
  }
  while (pending.length) {
    const { pid: current, parent } = pending.pop()
    if (seen.has(current)) continue
    account()
    if (!identities) seen.add(current)
    if (!Number.isSafeInteger(current) || current < 1) throw new Error("the owned process tree has an unsafe process id")
    let observation = null
    let group = null
    let tasks = null
    let recoveredGroup = null
    if (identities) {
      observation = observeProcessStat(io, current)
      if (observation.kind === "missing") {
        if (current === pid) throw new Error(`the owned root process ${pid} is gone`)
        continue
      }
      if (observation.kind !== "ok") {
        throw new Error(`identity is unavailable for process ${current}: ${observation.error}`)
      }
      if (current === pid && expectedStartTime !== undefined && observation.startTime !== expectedStartTime) {
        throw new Error(`the owned root process ${pid} identity changed`)
      }
      let leaderState = null
      if (current !== pid) {
        // A PID whose PPID no longer matches the process that enumerated it is a
        // reuse/reparent, not an owned child; never adopt it.
        if (observation.ppid !== parent) continue
      }
      seen.add(current)
      if (observation.state === "Z") {
        // EXIT_ZOMBIE is per task. A group leader can be a zombie while sibling
        // threads still own the mm, so only an empty live-thread set is gone.
        group = observeThreadGroup(io, current, observation, { maxEntries, account, measureRss: true })
        if (group.kind === "unknown") {
          account()
          const confirmed = rebindLeader(io, current, observation.startTime, account)
          if (current !== pid) {
            if (confirmed.kind === "missing" || confirmed.kind === "reused") continue
            throw new Error(`the thread group is unavailable for process ${current}: ${group.error}`)
          }
          if (confirmed.kind === "missing") {
            processes.push({ pid: current, startTime: observation.startTime, state: "Z",
              pgrp: observation.pgrp, ppid: observation.ppid })
            return { rssMiB: 0, processes, workEntries: entries }
          }
          if (confirmed.kind === "reused") {
            throw new Error(`the owned root process ${pid} identity changed`)
          }
          throw new Error(`the thread group is unavailable for process ${current}: ${group.error}`)
        }
        if (group.kind === "gone") {
          account()
          const confirmed = rebindLeader(io, current, observation.startTime, account)
          if (current !== pid) {
            if (confirmed.kind === "missing" || confirmed.kind === "zombie" || confirmed.kind === "reused") continue
            throw new Error(`the thread group is unavailable for process ${current}: ${confirmed.error ?? confirmed.kind}`)
          }
          processes.push({ pid: current, startTime: observation.startTime, state: "Z",
            pgrp: observation.pgrp, ppid: observation.ppid })
          if (confirmed.kind === "missing" || confirmed.kind === "zombie") {
            return { rssMiB: 0, processes, workEntries: entries }
          }
          if (confirmed.kind === "reused") {
            throw new Error(`the owned root process ${pid} identity changed`)
          }
          throw new Error(`the thread group is unavailable for process ${current}: ${confirmed.error ?? confirmed.kind}`)
        }
        if (current === pid && expectedStartTime !== undefined) {
          account()
          const confirmed = rebindLeader(io, current, expectedStartTime, account)
          if (confirmed.kind === "reused" || confirmed.kind === "missing") {
            throw new Error(`the owned root process ${pid} identity changed`)
          }
          if (confirmed.kind === "unknown") {
            throw new Error(`the thread group is unavailable for process ${current}: ${confirmed.error}`)
          }
        }
        leaderState = observation.state
        tasks = group.tasks
      }
      processes.push({ pid: current, startTime: observation.startTime,
        state: group?.state ?? observation.state, pgrp: observation.pgrp, ppid: observation.ppid,
        ...(leaderState ? { leaderState } : {}) })
    }
    const processGone = () => {
      if (identities) {
        // A child can lose its mm after the first stat read. Only a fresh,
        // budgeted exit observation of a group with no live thread permits
        // omitting its unavailable RSS.
        account()
        const fresh = observeProcessStat(io, current)
        if (fresh.kind === "missing") return true
        if (fresh.kind !== "ok" || fresh.startTime !== observation.startTime) return false
        const freshGroup = observeThreadGroup(io, current, fresh, { maxEntries, account, measureRss: true })
        if (freshGroup.kind === "live") {
          account()
          const confirmed = rebindLeader(io, current, observation.startTime, account)
          if (confirmed.kind === "missing") return true
          if (confirmed.kind === "reused" || confirmed.kind === "unknown") return false
          recoveredGroup = freshGroup
          return false
        }
        if (freshGroup.kind === "unknown") {
          account()
          return rebindLeader(io, current, observation.startTime, account).kind === "missing"
        }
        if (freshGroup.kind !== "gone") return false
        account()
        const confirmed = rebindLeader(io, current, observation.startTime, account)
        return confirmed.kind === "missing" || confirmed.kind === "zombie"
      }
      const observed = observeProcessStat(io, current)
      if (observed.kind === "missing") return true
      if (observed.kind !== "ok" || observed.state !== "Z") return false
      const observedGroup = observeThreadGroup(io, current, observed, { maxEntries, account, measureRss: true })
      if (observedGroup.kind === "live") {
        account()
        const confirmed = rebindLeader(io, current, observed.startTime, account)
        if (confirmed.kind === "missing") return true
        if (confirmed.kind === "reused" || confirmed.kind === "unknown") return false
        recoveredGroup = observedGroup
        return false
      }
      if (observedGroup.kind === "unknown") {
        account()
        return rebindLeader(io, current, observed.startTime, account).kind === "missing"
      }
      if (observedGroup.kind !== "gone") return false
      account()
      const confirmed = rebindLeader(io, current, observed.startTime, account)
      return confirmed.kind === "missing" || confirmed.kind === "zombie"
    }
    let kib = group?.rssKiB ?? null
    if (kib === null) {
      let status
      try {
        status = readBoundedText(io, `/proc/${current}/status`)
      } catch (error) {
        if (current !== pid && error.code === "ENOENT" && processGone()) continue
        throw new Error(`owned RSS is unavailable for process ${current}: ${error.code ?? error.message}`)
      }
      if (typeof status !== "string") throw new Error(`owned RSS is malformed for process ${current}`)
      kib = parseVmRss(status)
      // Linux can remove an exiting root's mm before stat becomes Z. Recheck
      // briefly, charging each attempt to the original work/deadline budget;
      // persistent or unverifiable data still refuses rather than becoming zero.
      for (let retry = 0; identities && current === pid && group === null && (kib === null || kib === 0) && retry < 3; retry++) {
        account()
        const fresh = observeProcessStat(io, current)
        if (fresh.kind !== "ok" || fresh.startTime !== observation.startTime) {
          throw new Error(`identity is unavailable for process ${current} during RSS recheck`)
        }
        if (fresh.state === "Z") {
          const freshGroup = observeThreadGroup(io, current, fresh, { maxEntries, account, measureRss: true })
          if (freshGroup.kind === "unknown") {
            account()
            const confirmed = rebindLeader(io, current, expectedStartTime ?? observation.startTime, account)
            if (confirmed.kind === "missing") {
              processes[processes.length - 1].state = "Z"
              return { rssMiB: 0, processes, workEntries: entries }
            }
            if (confirmed.kind === "reused") {
              throw new Error(`the owned root process ${pid} identity changed`)
            }
            throw new Error(`the thread group is unavailable for process ${current}: ${freshGroup.error}`)
          }
          if (freshGroup.kind === "gone") {
            account()
            const confirmed = rebindLeader(io, current, expectedStartTime ?? observation.startTime, account)
            if (confirmed.kind === "missing" || confirmed.kind === "zombie") {
              processes[processes.length - 1].state = "Z"
              return { rssMiB: 0, processes, workEntries: entries }
            }
            if (confirmed.kind === "reused") {
              throw new Error(`the owned root process ${pid} identity changed`)
            }
            throw new Error(`the thread group is unavailable for process ${current}: ${confirmed.error ?? confirmed.kind}`)
          }
          account()
          const confirmed = rebindLeader(io, current, expectedStartTime ?? observation.startTime, account)
          if (confirmed.kind === "reused" || confirmed.kind === "missing") {
            throw new Error(`the owned root process ${pid} identity changed`)
          }
          if (confirmed.kind === "unknown") {
            throw new Error(`the thread group is unavailable for process ${current}: ${confirmed.error}`)
          }
          processes[processes.length - 1].state = freshGroup.state
          processes[processes.length - 1].leaderState = "Z"
          tasks = freshGroup.tasks
          group = freshGroup
          kib = freshGroup.rssKiB
          break
        }
        Atomics.wait(samplerSleep, 0, 0, 1)
        kib = parseVmRss(readBoundedText(io, `/proc/${current}/status`))
      }
    }
    if (kib === null) {
      if (current !== pid) {
        if (processGone()) continue
        if (recoveredGroup !== null) {
          group = recoveredGroup
          tasks = recoveredGroup.tasks
          kib = recoveredGroup.rssKiB
          const entry = processes[processes.length - 1]
          entry.state = recoveredGroup.state
          entry.leaderState = "Z"
        }
      }
      if (kib === null) throw new Error(`owned RSS is malformed for process ${current}`)
    }
    if (current === pid && kib === 0) {
      throw new Error("the owned root process reports zero resident memory")
    }
    rss += kib / 1024
    if (tasks === null) {
      try {
        tasks = io.readdirSync(`/proc/${current}/task`)
      } catch (error) {
        if (error.code === "ENOENT") {
          account()
          if (identities) {
            const confirmed = rebindLeader(io, current, observation.startTime, account)
            if (confirmed.kind === "missing") {
              if (current !== pid) continue
              return { rssMiB: rss, processes, workEntries: entries }
            }
            if (confirmed.kind === "reused") throw new Error(`identity changed for process ${current}`)
          } else {
            // Without a sampled start time, a still-present PID cannot be
            // classified as reused or exited just because its task list failed.
            const fresh = observeProcessStat(io, current)
            account()
            if (fresh.kind === "missing") {
              if (current !== pid) continue
              return { rssMiB: rss, processes, workEntries: entries }
            }
          }
        }
        throw new Error(`process tree is unavailable for process ${current}: ${error.code ?? error.message}`)
      }
      if (!Array.isArray(tasks) || tasks.length === 0) throw new Error(`process tree is empty for process ${current}`)
      if (tasks.length > maxEntries) throw new Error("the owned process tree exceeds the sampler task bound")
    }
    for (const tid of tasks) {
      account()
      if (typeof tid !== "string" || !/^[0-9]+$/.test(tid)) throw new Error(`process tree has a malformed thread id for process ${current}`)
      if (!Number.isSafeInteger(Number(tid)) || Number(tid) < 1) throw new Error(`process tree has an unsafe thread id for process ${current}`)
      let children
      try {
        children = readBoundedText(io, `/proc/${current}/task/${tid}/children`)
      } catch (error) {
        // Task disappearance alone does not prove that this live process has
        // no descendants: children can be reparented to another group member.
        if (error.code === "ENOENT" && processGone()) continue
        throw new Error(`process tree is unavailable for process ${current}: ${error.code ?? error.message}`)
      }
      if (typeof children !== "string") throw new Error(`process tree is malformed for process ${current}`)
      const text = children.trim()
      if (text === "") continue
      for (const id of text.split(/\s+/)) {
        if (!/^[0-9]+$/.test(id)) throw new Error(`process tree has a malformed child id for process ${current}`)
        const childId = Number(id)
        if (!Number.isSafeInteger(childId) || childId < 1) throw new Error(`process tree has an unsafe child id for process ${current}`)
        if (pending.length + seen.size >= maxEntries) throw new Error("the owned process tree exceeds the sampler entry bound")
        pending.push({ pid: childId, parent: current })
      }
    }
  }
  if (!(rss > 0) && !(identities && processes.some(entry => entry.pid === pid && entry.state === "Z"))) {
    throw new Error("the owned process tree reports no resident memory")
  }
  return { rssMiB: rss, processes, workEntries: entries }
}

export function sampleOwnedTree(pid, io = defaultProcIo, options = {}) {
  return walkOwnedTree(pid, io, { ...options, identities: true })
}

export function ownedRssMiB(pid, io = defaultProcIo, options = {}) {
  return walkOwnedTree(pid, io, { ...options, identities: false }).rssMiB
}

function git(directory, args) {
  return execFileSync("git", ["--no-optional-locks", "-C", directory, ...args],
    { encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024 }).trim()
}

function sameLimits(limits) {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) return false
  const keys = Object.keys(LIMITS)
  if (Object.keys(limits).length !== keys.length) return false
  return keys.every(key => limits[key] === LIMITS[key])
}

const EXPECTATION_KEYS = Object.freeze({
  top: ["schema", "compiler", "project", "overlays", "native", "limits", "runtime"],
  compiler: ["version", "executable", "apiModule", "sha256", "apiModuleSha256"],
  project: ["config", "configSha256", "rootFiles", "graphFiles", "namesSha256", "graphReceipt", "graphReceiptSha256", "options", "overlayPaths"],
  overlay: ["path", "sha256", "originalSha256"],
  native: ["root"],
})

const RUNTIME_GOGC_PERCENTS = Object.freeze([10, 25])
const WORKER_PATH = "/usr/bin:/bin"

// The optional runtime expectation is deliberately narrower than an env map:
// one plain own data property with an exact lower-allocation setting. Getters are never
// invoked, accessors and symbols are refused, and inherited properties cannot
// stand in for an own key. GOGC is the only knob the caller can request.
function normalizeRuntimeExpectation(value) {
  if (value === undefined) return null
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("runtime must be a plain object with goGcPercent: 10 or 25")
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid("runtime must be an ordinary own-data record")
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw invalid("runtime must not carry symbol keys")
  }
  const keys = Object.getOwnPropertyNames(value)
  if (keys.length !== 1 || keys[0] !== "goGcPercent") {
    throw invalid("runtime must contain exactly goGcPercent")
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "goGcPercent")
  if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
    throw invalid("runtime.goGcPercent must be an own enumerable data property")
  }
  if (typeof descriptor.value !== "number" || !RUNTIME_GOGC_PERCENTS.includes(descriptor.value)) {
    throw invalid("runtime.goGcPercent must be the number 10 or 25")
  }
  return Object.freeze({ goGcPercent: descriptor.value })
}

function readRuntimeExpectation(raw) {
  const descriptor = Object.getOwnPropertyDescriptor(raw, "runtime")
  if (descriptor === undefined) {
    if ("runtime" in raw) throw invalid("runtime must be an explicit own data property")
    return null
  }
  if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true || descriptor.value === undefined) {
    throw invalid("runtime must be an explicit own enumerable data property")
  }
  return normalizeRuntimeExpectation(descriptor.value)
}

// A fresh, frozen environment is the only environment a worker receives. It
// never copies the parent's environment, so an inherited GOMEMLIMIT, GODEBUG,
// NODE_OPTIONS or token cannot reach the compiler process. GOGC is added only
// for an explicit runtime expectation; omission keeps the previous environment
// exactly, which leaves the runtime's default initial target unchanged.
export function buildWorkerEnvironment(configDirectory, runtime = null) {
  if (typeof configDirectory !== "string" || !isAbsolute(configDirectory)) {
    throw new Error("worker environment requires an absolute config directory")
  }
  const normalized = runtime === null || runtime === undefined ? null : normalizeRuntimeExpectation(runtime)
  const environment = {
    PATH: WORKER_PATH,
    HOME: configDirectory,
    TMPDIR: configDirectory,
  }
  if (normalized !== null) environment.GOGC = String(normalized.goGcPercent)
  return Object.freeze(environment)
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw invalid(`${label}.${key} is not part of the expectations schema`)
  }
}

export function normalizeExpectations(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("expectations must be an object")
  const runtime = readRuntimeExpectation(raw)
  rejectUnknownKeys(raw, EXPECTATION_KEYS.top, "expectations")
  if (raw.schema !== EXPECTATIONS_SCHEMA) throw invalid(`expectations schema must be ${EXPECTATIONS_SCHEMA}`)
  if (raw.limits !== undefined && !sameLimits(raw.limits)) {
    throw invalid("limits must exactly equal the mandated 1536/1280/2816/90000 envelope")
  }

  const compiler = raw.compiler
  if (!compiler || typeof compiler !== "object" || Array.isArray(compiler)) throw invalid("compiler block required")
  rejectUnknownKeys(compiler, EXPECTATION_KEYS.compiler, "compiler")
  for (const key of ["executable", "apiModule"]) {
    if (!isAbsolute(compiler[key])) throw invalid(`compiler.${key} must be an absolute path`)
  }
  if (!isSha256(compiler.sha256)) throw invalid("compiler.sha256 must be a lowercase sha256")
  if (!isSha256(compiler.apiModuleSha256)) throw invalid("compiler.apiModuleSha256 must be a lowercase sha256")

  const project = raw.project
  if (!project || typeof project !== "object" || Array.isArray(project)) throw invalid("project block required")
  rejectUnknownKeys(project, EXPECTATION_KEYS.project, "project")
  if (!isAbsolute(project.config)) throw invalid("project.config must be an absolute path")
  if (!isSha256(project.configSha256)) throw invalid("project.configSha256 must be a lowercase sha256")
  if (!project.options || typeof project.options !== "object" || Array.isArray(project.options)
    || Object.keys(project.options).length === 0) {
    throw invalid("project.options must be a non-empty object of observed compiler options")
  }
  if (project.graphFiles !== undefined && (!Number.isInteger(project.graphFiles) || project.graphFiles < 1)) {
    throw invalid("project.graphFiles must be a positive integer when present")
  }
  if (project.namesSha256 !== undefined && !isSha256(project.namesSha256)) {
    throw invalid("project.namesSha256 must be a lowercase sha256")
  }
  if (project.rootFiles !== undefined) {
    if (!Array.isArray(project.rootFiles) || !project.rootFiles.every(isAbsolute)) {
      throw invalid("project.rootFiles must be absolute paths when present")
    }
  }
  if (project.graphReceipt !== undefined) {
    if (!isAbsolute(project.graphReceipt)) throw invalid("project.graphReceipt must be an absolute path")
    if (!Number.isInteger(project.graphFiles) || project.graphFiles < 1) {
      throw invalid("project.graphFiles is required with graphReceipt")
    }
    if (!isSha256(project.namesSha256)) throw invalid("project.namesSha256 is required with graphReceipt")
    if (!isSha256(project.graphReceiptSha256)) throw invalid("project.graphReceiptSha256 is required with graphReceipt")
  }
  if (!Array.isArray(project.overlayPaths) || !project.overlayPaths.every(value => typeof value === "string" && value)) {
    throw invalid("project.overlayPaths must be an array of repository-relative paths")
  }
  if (new Set(project.overlayPaths).size !== project.overlayPaths.length) {
    throw invalid("project.overlayPaths must not contain duplicates")
  }

  const overlays = raw.overlays ?? {}
  if (typeof overlays !== "object" || Array.isArray(overlays)) throw invalid("overlays must be an object")
  const overlayKeys = Object.keys(overlays).sort()
  if (JSON.stringify(overlayKeys) !== JSON.stringify([...project.overlayPaths].sort())) {
    throw invalid("overlays must contain exactly the declared overlayPaths")
  }
  for (const [rel, entry] of Object.entries(overlays)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid(`overlays.${rel} must be an object`)
    rejectUnknownKeys(entry, EXPECTATION_KEYS.overlay, `overlays.${rel}`)
    if (!isAbsolute(entry.path)) throw invalid(`overlays.${rel}.path must be absolute`)
    if (!isSha256(entry.sha256)) throw invalid(`overlays.${rel}.sha256 must be a lowercase sha256`)
    if (!isSha256(entry.originalSha256)) throw invalid(`overlays.${rel}.originalSha256 must be a lowercase sha256`)
  }

  const native = raw.native
  if (native !== undefined) {
    if (!native || typeof native !== "object" || Array.isArray(native)) throw invalid("native must be an object")
    rejectUnknownKeys(native, EXPECTATION_KEYS.native, "native")
    if (!isAbsolute(native.root)) throw invalid("native.root must be absolute")
  }
  if (overlayKeys.length > 0 && (!native || typeof native.root !== "string")) {
    throw invalid("native.root is required when overlays are declared")
  }

  return Object.freeze({
    schema: EXPECTATIONS_SCHEMA,
    compiler: Object.freeze({ ...compiler }),
    project: Object.freeze({ ...project, overlayPaths: Object.freeze([...project.overlayPaths]) }),
    overlays: Object.freeze({ ...overlays }),
    native: native === undefined ? null : Object.freeze({ ...native }),
    runtime,
    limits: LIMITS,
  })
}

function verifyGraphReceipt(receiptPath, project) {
  const check = { receipt: receiptPath, receiptSha256: null, verified: false, files: null, entriesChecked: 0, bytes: 0,
    mismatchCount: 0, mismatches: [], graphSha256: null, namesSha256: null, error: null }
  const deadline = performance.now() + LIMITS.acquisitionMs
  let bytes
  try {
    bytes = readStableFile(receiptPath, { maxBytes: LIMITS.graphReceiptBytes, label: "graph receipt", deadline })
  } catch (error) {
    check.error = error.message
    return check
  }
  check.receiptSha256 = digest(bytes)
  if (check.receiptSha256 !== project.graphReceiptSha256) {
    check.error = "graph receipt bytes do not match the expected receipt digest"
    return check
  }
  let receipt
  try {
    receipt = JSON.parse(bytes.toString("utf8"))
  } catch (error) {
    check.error = `graph receipt is not JSON: ${error.message}`
    return check
  }
  if (!Number.isInteger(receipt.files) || receipt.files < 1) {
    check.error = "graph receipt files must be a positive integer"
    return check
  }
  if (!Array.isArray(receipt.entries) || receipt.entries.length !== receipt.files) {
    check.error = "graph receipt entry count does not match its file count"
    return check
  }
  if (receipt.files !== project.graphFiles) {
    check.error = `graph receipt has ${receipt.files} files, expected ${project.graphFiles}`
    return check
  }
  if (receipt.graphSha256 !== undefined) {
    check.graphSha256 = digest(Buffer.from(JSON.stringify(receipt.entries)))
    if (check.graphSha256 !== receipt.graphSha256) {
      check.error = "graph receipt content does not match its recorded digest"
      return check
    }
  }
  if (receipt.config !== undefined && receipt.config !== project.config) {
    check.error = "graph receipt was produced for a different project config"
    return check
  }
  if (receipt.rootFiles !== undefined && project.rootFiles !== undefined
    && JSON.stringify(receipt.rootFiles) !== JSON.stringify(project.rootFiles)) {
    check.error = "graph receipt root files differ from expectations"
    return check
  }
  const names = new Set()
  for (const entry of receipt.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      check.error = "graph receipt entry is not an object"
      return check
    }
    for (const key of Object.keys(entry)) {
      if (!["name", "sha256", "bytes"].includes(key)) {
        check.error = `graph receipt entry has unknown key ${key}`
        return check
      }
    }
    if (!isAbsolute(entry.name) || !isSha256(entry.sha256)
      || (entry.bytes !== undefined && (!Number.isInteger(entry.bytes) || entry.bytes < 0))) {
      check.error = "graph receipt entry is malformed"
      return check
    }
    if (names.has(entry.name)) {
      check.error = `graph receipt repeats ${entry.name}`
      return check
    }
    names.add(entry.name)
    const remaining = LIMITS.graphTotalBytes - check.bytes
    if (remaining < 1) {
      check.error = "graph bytes exceed the acquisition bound"
      return check
    }
    try {
      const hashed = hashStableFile(entry.name, { maxBytes: Math.min(LIMITS.fileBytes, remaining), label: "graph entry", deadline })
      check.bytes += hashed.bytes
      if (hashed.sha256 !== entry.sha256) {
        check.mismatchCount++
        if (check.mismatches.length < 8) check.mismatches.push(entry.name)
      }
    } catch (error) {
      if (error.code === "acquisition-timeout") {
        check.error = error.message
        return check
      }
      if (error.code === "acquisition-size" && remaining < LIMITS.fileBytes) {
        check.error = "a graph entry would exceed the remaining graph byte bound"
        return check
      }
      check.mismatchCount++
      if (check.mismatches.length < 8) check.mismatches.push(`${entry.name} (${error.code ?? "read-error"})`)
    }
    check.entriesChecked++
  }
  check.namesSha256 = namesDigest([...names])
  check.files = receipt.files
  if (project.rootFiles !== undefined) {
    for (const file of project.rootFiles) {
      if (!names.has(file)) {
        check.error = `root file ${file} is not a graph entry`
        return check
      }
    }
  }
  check.verified = check.entriesChecked === receipt.files
    && check.mismatchCount === 0
    && check.namesSha256 === project.namesSha256
  if (!check.verified && check.error === null) {
    check.error = check.mismatchCount > 0 ? "graph source bytes changed" : "graph name identity does not match expectations"
  }
  return check
}

function acquireDigest(file, { maxBytes, label, deadline }) {
  try {
    return { ...hashStableFile(file, { maxBytes, label, deadline }), error: null }
  } catch (error) {
    return { sha256: null, bytes: 0, error }
  }
}

export function preflight(expectations) {
  const checks = { limits: LIMITS }
  const deadline = performance.now() + LIMITS.acquisitionMs

  const compiler = acquireDigest(expectations.compiler.executable, { maxBytes: LIMITS.compilerBytes, label: "compiler", deadline })
  const module = acquireDigest(expectations.compiler.apiModule, { maxBytes: LIMITS.apiModuleBytes, label: "api module", deadline })
  checks.compiler = {
    path: expectations.compiler.executable,
    sha256: compiler.sha256,
    expectedSha256: expectations.compiler.sha256,
    verified: compiler.error === null && compiler.sha256 === expectations.compiler.sha256,
    error: compiler.error?.message ?? null,
    apiModule: expectations.compiler.apiModule,
    apiModuleSha256: module.sha256,
    apiModuleExpectedSha256: expectations.compiler.apiModuleSha256,
    apiModuleVerified: module.error === null && module.sha256 === expectations.compiler.apiModuleSha256,
    apiModuleError: module.error?.message ?? null,
  }

  const config = acquireDigest(expectations.project.config, { maxBytes: LIMITS.fileBytes, label: "project config", deadline })
  const rootFiles = (expectations.project.rootFiles ?? []).map(file => {
    const hashed = acquireDigest(file, { maxBytes: LIMITS.fileBytes, label: "root file", deadline })
    return { path: file, sha256: hashed.sha256, error: hashed.error?.message ?? null }
  })
  checks.project = {
    config: expectations.project.config,
    configSha256: config.sha256,
    configError: config.error?.message ?? null,
    configVerified: config.error === null && config.sha256 === expectations.project.configSha256,
    verified: config.error === null && config.sha256 === expectations.project.configSha256
      && rootFiles.every(entry => entry.error === null),
    graphFiles: expectations.project.graphFiles ?? null,
    options: expectations.project.options,
    rootFiles,
  }

  checks.graph = expectations.project.graphReceipt === undefined
    ? { receipt: null, verified: false, reason: "no graph receipt supplied" }
    : verifyGraphReceipt(expectations.project.graphReceipt, expectations.project)

  const overlays = []
  let overlayProblem = null
  for (const rel of expectations.project.overlayPaths) {
    const entry = expectations.overlays[rel]
    const original = path.join(expectations.native.root, rel)
    const overlay = acquireDigest(entry.path, { maxBytes: LIMITS.fileBytes, label: `overlay ${rel}`, deadline })
    const originalFile = acquireDigest(original, { maxBytes: LIMITS.fileBytes, label: `original ${rel}`, deadline })
    overlays.push({ rel, path: entry.path, sha256: overlay.sha256, expectedSha256: entry.sha256,
      error: overlay.error?.message ?? null, original, originalSha256: originalFile.sha256,
      expectedOriginalSha256: entry.originalSha256, originalError: originalFile.error?.message ?? null })
    if (overlay.error !== null || overlay.sha256 !== entry.sha256) overlayProblem ??= `${rel}: overlay bytes differ`
    if (originalFile.error !== null || originalFile.sha256 !== entry.originalSha256) overlayProblem ??= `${rel}: pinned original bytes differ`
  }
  let nativeRoot = null
  let status = ""
  if (expectations.project.overlayPaths.length > 0) {
    try {
      if (fs.lstatSync(expectations.native.root).isSymbolicLink()) overlayProblem ??= "native root is a symbolic link"
      nativeRoot = fs.realpathSync(expectations.native.root)
      if (git(nativeRoot, ["rev-parse", "--show-toplevel"]) !== nativeRoot) overlayProblem ??= "native root is not a git work tree"
      status = git(nativeRoot, ["status", "--porcelain", "--untracked-files=all", "--", ...expectations.project.overlayPaths])
      if (status !== "") overlayProblem ??= "native overlay targets are not clean"
    } catch (error) {
      overlayProblem ??= `native identity cannot be verified (${error.code ?? error.message})`
    }
  }
  checks.overlays = {
    verified: overlayProblem === null,
    problem: overlayProblem,
    nativeRoot,
    nativeStatus: status,
    files: overlays,
  }

  checks.identityComplete = checks.compiler.verified
    && checks.compiler.apiModuleVerified
    && checks.project.verified
    && checks.graph.verified === true
    && checks.overlays.verified
  checks.availableMiB = (() => { try { return availableMiB() } catch { return null } })()
  checks.wouldSpawn = checks.identityComplete
    && checks.availableMiB !== null
    && checks.availableMiB >= LIMITS.prelaunchMiB
  return checks
}

class ReceiptWriter {
  constructor(file, budgetBytes) {
    this.file = file
    this.budgetBytes = budgetBytes
    this.bytes = 0
    this.fd = fs.openSync(file, "wx", 0o600)
  }
  line(kind, body) {
    const bytes = Buffer.from(`${JSON.stringify({ schema: SCHEMA, kind, ...body })}\n`)
    if (this.bytes + bytes.length > this.budgetBytes) {
      const error = new Error(`receipt budget of ${this.budgetBytes} bytes exceeded`)
      error.code = "receipt-budget"
      throw error
    }
    writeAll(this.fd, bytes)
    this.bytes += bytes.length
  }
  sync() { fs.fsyncSync(this.fd) }
  close() { try { fs.fsyncSync(this.fd) } finally { fs.closeSync(this.fd) } }
}

function workerFailure(stage, error) {
  const failure = new Error(error?.message ?? String(error))
  failure.code = "worker-failure"
  failure.stage = stage
  return failure
}

export async function runWorker({ expectations: rawExpectations, receiptPath, receiptBudgetBytes = LIMITS.receiptBytes }) {
  if (!Number.isInteger(receiptBudgetBytes) || receiptBudgetBytes < 1 || receiptBudgetBytes > LIMITS.receiptBytes) {
    throw new Error("receipt budget must be an integer between 1 and the mandated bound")
  }
  const expectations = normalizeExpectations(rawExpectations)
  const writer = new ReceiptWriter(receiptPath, receiptBudgetBytes)
  const startedAt = performance.now()
  const counts = {}
  const terminalCounts = {}
  let stage = "header"
  let api = null
  const hash = createHash("sha256")
  let diagnostics = 0
  let errors = 0
  let warnings = 0
  let peakSelfRssMiB = 0
  let names = []
  let observedOptions = null
  let observedRootFiles = null
  let observedNamesSha256 = null
  let iteratedFiles = 0
  const familyElapsed = {}
  const sample = () => { peakSelfRssMiB = Math.max(peakSelfRssMiB, process.memoryUsage().rss / 1048576) }

  const recordAll = (family, list, file = null) => {
    let recorded = 0
    for (const diagnostic of list ?? []) {
      const plain = plainDiagnostic(diagnostic)
      writer.line("diagnostic", { family, file, diagnostic: plain })
      hash.update(JSON.stringify(plain))
      hash.update("\n")
      recorded++
      diagnostics++
      if (plain.category === 1) errors++
      else if (plain.category === 0) warnings++
    }
    counts[family] = (counts[family] ?? 0) + recorded
    return recorded
  }

  const completeFamily = (family, { files, namesSha256, started, queries, queryDigest }) => {
    familyElapsed[family] = Math.round(performance.now() - started)
    terminalCounts[family] = counts[family] ?? 0
    writer.line("family", { family, files, namesSha256, queries, queryDigest,
      diagnostics: terminalCounts[family], elapsedMs: familyElapsed[family] })
    writer.sync()
  }

  const startFamily = family => {
    const scoped = FILE_SCOPED.includes(family)
    const files = scoped ? names.length : 0
    writer.line("family-start", { family, files, namesSha256: scoped ? observedNamesSha256 : null })
    return files
  }

  const trailerBody = () => ({
    graphFiles: names.length,
    graphFilesExpected: expectations.project.graphFiles ?? null,
    namesSha256: observedNamesSha256,
    iteratedFiles,
    rootFiles: observedRootFiles,
    options: observedOptions,
    families: { ...terminalCounts },
    familyElapsed: { ...familyElapsed },
    diagnostics,
    errorCount: errors,
    warningCount: warnings,
    diagnosticsSha256: hash.copy().digest("hex"),
    elapsedMs: Math.round(performance.now() - startedAt),
    peakSelfRssMiB: Math.round(peakSelfRssMiB * 100) / 100,
  })

  try {
    const workerGoGc = process.env.GOGC
    const requestedGoGc = expectations.runtime === null ? null : String(expectations.runtime.goGcPercent)
    // A malformed environment value is not evidence content: retain only match/mismatch/unset.
    const observedWorkerGoGc = workerGoGc === undefined ? null
      : workerGoGc === requestedGoGc ? workerGoGc : "mismatch"
    const runtimeHeader = expectations.runtime === null ? null : Object.freeze({
      goGcPercent: expectations.runtime.goGcPercent,
      observedWorkerGoGc,
    })
    writer.line("header", {
      config: expectations.project.config,
      compiler: expectations.compiler.executable,
      compilerSha256: expectations.compiler.sha256,
      apiModule: expectations.compiler.apiModule,
      apiModuleSha256: expectations.compiler.apiModuleSha256,
      expectationsSha256: digest(Buffer.from(JSON.stringify(rawExpectations))),
      limits: LIMITS,
      startedAt: new Date().toISOString(),
      ...(runtimeHeader ? { runtime: runtimeHeader } : {}),
    })
    // The requested setting is a configuration/worker-environment observation,
    // not an internal Go heap measurement. A worker that was not started with
    // the exact variable refuses here, before the native API is imported.
    stage = "runtime"
    if (expectations.runtime !== null && observedWorkerGoGc !== requestedGoGc) {
      throw workerFailure("runtime",
        new Error(workerGoGc === undefined ? `worker GOGC is unset, requested ${requestedGoGc}`
          : `worker GOGC does not match requested ${requestedGoGc}`))
    }
    const identityDeadline = performance.now() + LIMITS.acquisitionMs
    stage = "compiler-identity"
    const compilerHash = hashStableFile(expectations.compiler.executable,
      { maxBytes: LIMITS.compilerBytes, label: "compiler", deadline: identityDeadline })
    if (compilerHash.sha256 !== expectations.compiler.sha256) {
      throw workerFailure("compiler", new Error("compiler bytes do not match the expected sha256"))
    }

    stage = "module"
    const moduleHash = hashStableFile(expectations.compiler.apiModule,
      { maxBytes: LIMITS.apiModuleBytes, label: "api module", deadline: identityDeadline })
    if (moduleHash.sha256 !== expectations.compiler.apiModuleSha256) {
      throw workerFailure("module", new Error("api module bytes do not match the expected sha256"))
    }
    const apiModule = await import(pathToFileURL(expectations.compiler.apiModule).href)

    stage = "config"
    api = new apiModule.API({ cwd: path.dirname(expectations.project.config), tsserverPath: expectations.compiler.executable })
    try {
      api.parseConfigFile(expectations.project.config)
    } catch (error) {
      writer.line("trailer", { status: "invalid-config", stage: "config", detail: error.message, ...trailerBody() })
      return { status: "invalid-config", exitCode: 0 }
    }

    stage = "snapshot"
    const snapshot = api.updateSnapshot({ openProjects: [expectations.project.config] })
    const project = snapshot.getProject(expectations.project.config)
    if (!project) {
      writer.line("trailer", { status: "invalid-config", stage: "project", detail: "the configured project was not loaded", ...trailerBody() })
      return { status: "invalid-config", exitCode: 0 }
    }

    stage = "names"
    names = [...project.program.getSourceFileNames()].sort()
    if (names.length === 0) throw workerFailure("graph", new Error("the program reports no source files"))
    if (names.some(name => typeof name !== "string" || name.length === 0)) throw workerFailure("graph", new Error("the program reported an invalid source file name"))
    if (new Set(names).size !== names.length) throw workerFailure("graph", new Error("the program reported duplicate source file names"))
    observedNamesSha256 = namesDigest(names)
    observedOptions = project.program.getCompilerOptions()
    observedRootFiles = [...project.rootFiles]
    writer.line("graph", {
      graphFiles: names.length,
      namesSha256: observedNamesSha256,
      options: observedOptions,
      rootFiles: observedRootFiles,
    })

    // A config that cannot be parsed still yields a project shell; its declared
    // compiler options are not meaningful, so config diagnostics are recorded
    // and classified before option or graph identity checks.
    stage = "family:config"
    let started = performance.now()
    const configFiles = startFamily("config")
    recordAll("config", project.program.getConfigFileParsingDiagnostics(), null)
    completeFamily("config", { files: configFiles, namesSha256: null, started, queries: 0, queryDigest: EMPTY_SHA256 })
    if ((counts.config ?? 0) > 0) {
      writer.line("trailer", { status: "invalid-config", stage: "config-diagnostics",
        detail: "the configuration produced parsing or option diagnostics", ...trailerBody() })
      return { status: "invalid-config", exitCode: 0 }
    }

    stage = "graph"
    if (expectations.project.graphFiles !== undefined && names.length !== expectations.project.graphFiles) {
      throw workerFailure("graph", new Error(`program graph has ${names.length} files, expected ${expectations.project.graphFiles}`))
    }
    if (expectations.project.namesSha256 !== undefined && observedNamesSha256 !== expectations.project.namesSha256) {
      throw workerFailure("graph", new Error("program file names do not match the expected graph digest"))
    }

    stage = "options"
    const mismatches = []
    for (const [key, expected] of Object.entries(expectations.project.options)) {
      const actual = observedOptions[key] ?? null
      if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push({ key, expected, actual })
    }
    if (mismatches.length > 0) throw workerFailure("options", new Error(`compiler options differ: ${JSON.stringify(mismatches)}`))
    if (expectations.project.rootFiles !== undefined
      && JSON.stringify(observedRootFiles) !== JSON.stringify(expectations.project.rootFiles)) {
      throw workerFailure("options", new Error("project root files differ from expectations"))
    }

    for (const family of ["program", "global"]) {
      stage = `family:${family}`
      started = performance.now()
      const files = startFamily(family)
      recordAll(family, project.program[FAMILY_METHODS[family]](), null)
      completeFamily(family, { files, namesSha256: null, started, queries: 0, queryDigest: EMPTY_SHA256 })
    }

    // The pinned TypeScript 7.0.2 sync API accepts a file argument for these
    // four families. Every sorted program name is queried and emits its own file
    // record (including zero-diagnostic files), so the receipt proves per-file
    // coverage instead of only a family total.
    for (const family of FILE_SCOPED) {
      stage = `family:${family}`
      started = performance.now()
      const files = startFamily(family)
      const queryHash = createHash("sha256")
      for (let index = 0; index < names.length; index++) {
        const fileDiagnostics = project.program[FAMILY_METHODS[family]](names[index]) ?? []
        writer.line("file", { family, index, name: names[index], diagnostics: fileDiagnostics.length })
        queryHash.update(JSON.stringify({ name: names[index], diagnostics: fileDiagnostics.length }))
        queryHash.update("\n")
        recordAll(family, fileDiagnostics, names[index])
        iteratedFiles++
        if (index % 250 === 0) { sample(); writer.sync() }
      }
      sample()
      completeFamily(family, { files, namesSha256: observedNamesSha256, started,
        queries: names.length, queryDigest: queryHash.digest("hex") })
    }

    stage = "trailer"
    writer.line("trailer", { status: "completed", ...trailerBody() })
    writer.sync()
    return { status: errors > 0 ? "compiler-error" : "clean", exitCode: 0 }
  } catch (error) {
    if (error.code === "receipt-budget") {
      try { writer.close() } catch {}
      process.stderr.write(`${JSON.stringify({ schema: SCHEMA, worker: "receipt-budget", detail: error.message })}\n`)
      return { status: "incomplete", exitCode: 5 }
    }
    const failure = error.code === "worker-failure" ? error : workerFailure(stage, error)
    try {
      writer.line("trailer", { status: "failed", failure: { stage: failure.stage, message: failure.message }, ...trailerBody() })
      writer.sync()
    } catch (writeError) {
      if (writeError.code !== "receipt-budget") throw writeError
    }
    return { status: "incomplete", exitCode: 4 }
  } finally {
    try { api?.close?.() } catch {}
    try { writer.close() } catch {}
  }
}

const RECEIPT_KEYS = Object.freeze({
  header: ["schema", "kind", "config", "compiler", "compilerSha256", "apiModule", "apiModuleSha256",
    "expectationsSha256", "limits", "startedAt"],
  graph: ["schema", "kind", "graphFiles", "namesSha256", "options", "rootFiles"],
  "family-start": ["schema", "kind", "family", "files", "namesSha256"],
  file: ["schema", "kind", "family", "index", "name", "diagnostics"],
  diagnostic: ["schema", "kind", "family", "file", "diagnostic"],
  family: ["schema", "kind", "family", "files", "namesSha256", "queries", "queryDigest",
    "diagnostics", "elapsedMs"],
})

const TRAILER_BASE_KEYS = Object.freeze(["schema", "kind", "status", "graphFiles", "graphFilesExpected",
  "namesSha256", "iteratedFiles", "rootFiles", "options", "families", "familyElapsed", "diagnostics",
  "errorCount", "warningCount", "diagnosticsSha256", "elapsedMs", "peakSelfRssMiB"])

const TRAILER_STATUS_KEYS = Object.freeze({
  "invalid-config": ["stage", "detail"],
  failed: ["failure"],
})

const DIAGNOSTIC_KEYS = Object.freeze(["code", "category", "pos", "end", "text", "fileName",
  "reportsUnnecessary", "reportsDeprecated", "messageChain", "relatedInformation"])

function exactKeys(value, allowed, label) {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return `${label} has keys ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
  }
  return null
}

const RUNTIME_HEADER_KEYS = Object.freeze(["goGcPercent", "observedWorkerGoGc"])

function validateRuntimeHeader(runtime) {
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    return "header.runtime must be an object"
  }
  const error = exactKeys(runtime, RUNTIME_HEADER_KEYS, "header.runtime")
  if (error) return error
  if (!RUNTIME_GOGC_PERCENTS.includes(runtime.goGcPercent)) {
    return "header.runtime.goGcPercent must be 10 or 25"
  }
  if (![null, String(runtime.goGcPercent), "mismatch"].includes(runtime.observedWorkerGoGc)) {
    return "header.runtime.observedWorkerGoGc must match the requested percentage, mismatch or null"
  }
  return null
}

function validateHeader(entry) {
  for (const key of Object.keys(entry)) {
    if (key !== "runtime" && !RECEIPT_KEYS.header.includes(key)) {
      return `header has unknown key ${key}`
    }
  }
  for (const key of RECEIPT_KEYS.header) {
    if (!Object.hasOwn(entry, key)) return `header is missing ${key}`
  }
  if (!isAbsolute(entry.config) || !isAbsolute(entry.compiler) || !isAbsolute(entry.apiModule)) {
    return "header paths must be absolute"
  }
  if (!isSha256(entry.compilerSha256) || !isSha256(entry.apiModuleSha256) || !isSha256(entry.expectationsSha256)) {
    return "header digests must be lowercase sha256"
  }
  if (!sameLimits(entry.limits)) return "header limits differ from the mandated envelope"
  if (typeof entry.startedAt !== "string" || entry.startedAt.length === 0) return "header startedAt must be a string"
  if (entry.runtime !== undefined) {
    const runtimeError = validateRuntimeHeader(entry.runtime)
    if (runtimeError) return runtimeError
  }
  return null
}

function validateGraph(entry) {
  const error = exactKeys(entry, RECEIPT_KEYS.graph, "graph observation")
  if (error) return error
  if (!Number.isInteger(entry.graphFiles) || entry.graphFiles < 1) return "graph observation needs a positive file count"
  if (!isSha256(entry.namesSha256)) return "graph observation needs a lowercase sha256 name digest"
  if (!entry.options || typeof entry.options !== "object" || Array.isArray(entry.options)
    || Object.keys(entry.options).length === 0) {
    return "graph observation needs the observed compiler options"
  }
  if (!Array.isArray(entry.rootFiles) || !entry.rootFiles.every(isAbsolute)) {
    return "graph observation needs absolute root files"
  }
  return null
}

function validateFamilyStart(entry, graph) {
  const error = exactKeys(entry, RECEIPT_KEYS["family-start"], "family-start")
  if (error) return error
  if (!FAMILIES.includes(entry.family)) return `family-start has unknown family ${entry.family}`
  if (!Number.isInteger(entry.files) || entry.files < 0) return "family-start needs a non-negative file count"
  const scoped = FILE_SCOPED.includes(entry.family)
  const expected = scoped ? graph.graphFiles : 0
  if (entry.files !== expected) return `family-start ${entry.family} declares ${entry.files} files, expected ${expected}`
  if (scoped ? entry.namesSha256 !== graph.namesSha256 : entry.namesSha256 !== null) {
    return `family-start ${entry.family} has the wrong name digest`
  }
  return null
}

function validateDiagnostic(diagnostic, depth = 0) {
  if (depth > 8) return "diagnostic nesting exceeds the supported depth"
  if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)) return "diagnostic must be an object"
  for (const key of Object.keys(diagnostic)) {
    if (!DIAGNOSTIC_KEYS.includes(key)) return `diagnostic has unknown key ${key}`
  }
  if (!Number.isInteger(diagnostic.code) || diagnostic.code < 0) return "diagnostic code must be a non-negative integer"
  if (!Number.isInteger(diagnostic.category) || diagnostic.category < 0 || diagnostic.category > 3) {
    return "diagnostic category must be an integer from 0 to 3"
  }
  if (!Number.isInteger(diagnostic.pos) || !Number.isInteger(diagnostic.end)) return "diagnostic positions must be integers"
  if (typeof diagnostic.text !== "string") return "diagnostic text must be a string"
  if (diagnostic.fileName !== undefined && !isAbsolute(diagnostic.fileName)) return "diagnostic fileName must be absolute"
  for (const key of ["reportsUnnecessary", "reportsDeprecated"]) {
    if (diagnostic[key] !== undefined && diagnostic[key] !== true) return `${key} must be true when present`
  }
  for (const key of ["messageChain", "relatedInformation"]) {
    if (diagnostic[key] === undefined) continue
    if (!Array.isArray(diagnostic[key])) return `${key} must be an array`
    for (const nested of diagnostic[key]) {
      const error = validateDiagnostic(nested, depth + 1)
      if (error) return error
    }
  }
  return null
}

function validateTrailer(entry) {
  const statusExtras = TRAILER_STATUS_KEYS[entry.status] ?? []
  if (!["completed", "invalid-config", "failed"].includes(entry.status)) return `unknown trailer status ${entry.status}`
  const error = exactKeys(entry, [...TRAILER_BASE_KEYS, ...statusExtras], "trailer")
  if (error) return error
  if (!Number.isInteger(entry.graphFiles) || entry.graphFiles < 0) return "trailer graphFiles must be a non-negative integer"
  if (entry.graphFilesExpected !== null && (!Number.isInteger(entry.graphFilesExpected) || entry.graphFilesExpected < 1)) {
    return "trailer graphFilesExpected must be null or a positive integer"
  }
  if (entry.namesSha256 !== null && !isSha256(entry.namesSha256)) return "trailer namesSha256 must be null or a sha256"
  if (!Number.isInteger(entry.iteratedFiles) || entry.iteratedFiles < 0) return "trailer iteratedFiles must be a non-negative integer"
  if (entry.rootFiles !== null && (!Array.isArray(entry.rootFiles) || !entry.rootFiles.every(isAbsolute))) {
    return "trailer rootFiles must be null or absolute paths"
  }
  if (entry.options !== null && (typeof entry.options !== "object" || Array.isArray(entry.options))) {
    return "trailer options must be null or an object"
  }
  if (!entry.families || typeof entry.families !== "object" || Array.isArray(entry.families)) {
    return "trailer families must be an object"
  }
  for (const [family, count] of Object.entries(entry.families)) {
    if (!FAMILIES.includes(family) || !Number.isInteger(count) || count < 0) return "trailer family counts are malformed"
  }
  if (!entry.familyElapsed || typeof entry.familyElapsed !== "object" || Array.isArray(entry.familyElapsed)) {
    return "trailer familyElapsed must be an object"
  }
  for (const [family, value] of Object.entries(entry.familyElapsed)) {
    if (!FAMILIES.includes(family) || !Number.isFinite(value) || value < 0) return "trailer familyElapsed is malformed"
  }
  for (const key of ["diagnostics", "errorCount", "warningCount"]) {
    if (!Number.isInteger(entry[key]) || entry[key] < 0) return `trailer ${key} must be a non-negative integer`
  }
  if (!isSha256(entry.diagnosticsSha256)) return "trailer diagnosticsSha256 must be a lowercase sha256"
  for (const key of ["elapsedMs", "peakSelfRssMiB"]) {
    if (!Number.isFinite(entry[key]) || entry[key] < 0) return `trailer ${key} must be a non-negative number`
  }
  if (entry.status === "invalid-config") {
    if (!["config", "project", "config-diagnostics"].includes(entry.stage)) return "invalid-config trailer has an unknown stage"
    if (typeof entry.detail !== "string") return "invalid-config trailer needs a detail string"
  }
  if (entry.status === "failed") {
    if (!entry.failure || typeof entry.failure !== "object" || Array.isArray(entry.failure)) return "failed trailer needs a failure"
    const failureKeys = exactKeys(entry.failure, ["stage", "message"], "failure")
    if (failureKeys) return failureKeys
    if (typeof entry.failure.stage !== "string" || typeof entry.failure.message !== "string") return "failure fields must be strings"
  }
  return null
}

function validateCompletion(result) {
  const { trailer, graph } = result
  const terminated = Object.keys(result.families)
  const reported = Object.keys(trailer.families)
  for (const family of reported) {
    if (!result.families[family]) return `trailer reports ${family} without a family terminal`
    if (trailer.families[family] !== result.families[family].diagnostics) {
      return `trailer count for ${family} differs from the recorded diagnostics`
    }
  }
  if (reported.length !== terminated.length || terminated.some(family => !reported.includes(family))) {
    return "trailer family counts do not cover exactly the terminated families"
  }
  const elapsed = Object.keys(trailer.familyElapsed)
  if (elapsed.length !== terminated.length || terminated.some(family => !elapsed.includes(family))) {
    return "trailer family times do not cover exactly the terminated families"
  }
  if (trailer.diagnostics !== result.diagnostics) return "trailer diagnostic total differs from the recorded diagnostics"
  if (trailer.errorCount !== result.errors) return "trailer error count differs from the recorded diagnostics"
  if (trailer.warningCount !== result.warnings) return "trailer warning count differs from the recorded diagnostics"
  let terminatedQueries = 0
  for (const family of terminated) {
    const terminal = result.families[family]
    if (FILE_SCOPED.includes(family)) {
      if (!graph || terminal.namesSha256 !== graph.namesSha256) return `${family} terminal has the wrong name digest`
      if (!graph || terminal.queries !== graph.graphFiles) return `${family} terminal did not query every program file`
      terminatedQueries += terminal.queries
    } else if (terminal.namesSha256 !== null || terminal.queries !== 0) {
      return `${family} terminal claims file queries in a whole-program family`
    }
  }
  if (trailer.iteratedFiles < terminatedQueries) return "trailer iterated fewer files than the terminated families"
  if (graph && trailer.iteratedFiles > FILE_SCOPED.length * graph.graphFiles) {
    return "trailer iterated more queries than the four file-scoped families can issue"
  }
  if (graph) {
    if (trailer.graphFiles !== graph.graphFiles) return "trailer graph file count differs from the graph observation"
    if (trailer.namesSha256 !== graph.namesSha256) return "trailer name digest differs from the graph observation"
    if (trailer.options !== null && JSON.stringify(trailer.options) !== JSON.stringify(graph.options)) {
      return "trailer options differ from the graph observation"
    }
    if (trailer.rootFiles !== null && JSON.stringify(trailer.rootFiles) !== JSON.stringify(graph.rootFiles)) {
      return "trailer root files differ from the graph observation"
    }
  } else {
    if (trailer.graphFiles !== 0 || trailer.namesSha256 !== null || trailer.iteratedFiles !== 0) {
      return "trailer claims graph data without a graph observation"
    }
  }
  if (trailer.status === "completed") {
    if (!graph) return "completed receipt has no graph observation"
    if (result.header?.runtime && result.header.runtime.observedWorkerGoGc !== String(result.header.runtime.goGcPercent)) {
      return "completed receipt did not observe the requested GOGC in the worker environment"
    }
    if (terminated.length !== FAMILIES.length || JSON.stringify(terminated) !== JSON.stringify([...FAMILIES])) {
      return "completed receipt must cover exactly the seven families in canonical order"
    }
    if (trailer.iteratedFiles !== FILE_SCOPED.length * graph.graphFiles) {
      return "completed receipt did not query every program file in every file-scoped family"
    }
    if (trailer.iteratedFiles !== terminatedQueries) return "completed receipt query total differs from the family terminals"
  } else if (trailer.status === "invalid-config") {
    if (terminated.length > 1) return "invalid-config receipt has unrelated family terminals"
    if (terminated.length === 1 && (terminated[0] !== "config" || result.families.config.diagnostics < 1)) {
      return "invalid-config receipt has an unrelated family terminal"
    }
    if (trailer.iteratedFiles !== 0) return "invalid-config receipt claims file iteration"
  }
  return null
}

export function parseWorkerReceipt(text, { keepRecords = false, keepFiles = false } = {}) {
  const result = {
    ok: false, error: null, complete: typeof text === "string" && text.endsWith("\n"), lines: 0,
    header: null, graph: null, families: {}, familyStart: {}, diagnostics: 0, errors: 0, warnings: 0,
    trailer: null, digest: null, digestMatches: false, corrupt: false,
  }
  if (keepRecords) result.records = []
  if (keepFiles) result.files = []
  if (typeof text !== "string") {
    result.error = "receipt must be a string"
    return result
  }
  const lines = text.split("\n")
  lines.pop()
  result.lines = lines.length
  const hash = createHash("sha256")
  const fail = message => {
    result.ok = false
    result.error = message
    result.corrupt = true
    return result
  }
  let familyIndex = -1
  let current = null
  let stage = "header"
  const closeFile = () => {
    if (!current?.file) return null
    if (current.file.seen !== current.file.declared) {
      return `${current.family} file ${current.file.name} declared ${current.file.declared} diagnostics but ${current.file.seen} were recorded`
    }
    current.file = null
    return null
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line === "") return fail(`line ${index + 1} is empty`)
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      return fail(`line ${index + 1} is not JSON`)
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail(`line ${index + 1} is not an object`)
    if (entry.schema !== SCHEMA) return fail(`line ${index + 1} has an unknown schema`)
    if (index === 0) {
      if (entry.kind !== "header") return fail("the first line must be the receipt header")
      const error = validateHeader(entry)
      if (error) return fail(error)
      result.header = entry
      stage = "graph"
      continue
    }
    if (stage === "trailer") return fail(`line ${index + 1} follows the terminal trailer`)
    if (entry.kind === "header") return fail("the receipt contains more than one header")
    if (entry.kind === "graph") {
      if (stage !== "graph") return fail("the graph observation must appear once and before the family records")
      const error = validateGraph(entry)
      if (error) return fail(error)
      result.graph = entry
      stage = "families"
      continue
    }
    if (entry.kind === "trailer") {
      const error = validateTrailer(entry)
      if (error) return fail(error)
      // A worker failure may end in the middle of the active family; that is
      // recorded as an unterminated family rather than a claimed completion.
      if (current && entry.status !== "failed") return fail("the trailer appears before the active family terminal")
      current = null
      result.trailer = entry
      stage = "trailer"
      continue
    }
    if (stage !== "families" || !result.graph) return fail(`family record at line ${index + 1} precedes the graph observation`)
    if (entry.kind === "family-start") {
      if (current) return fail("a family-start appears inside an active family")
      const expected = FAMILIES[familyIndex + 1]
      if (entry.family !== expected) return fail(`expected family ${expected ?? "none"}, received ${entry.family}`)
      const error = validateFamilyStart(entry, result.graph)
      if (error) return fail(error)
      result.familyStart[entry.family] = entry.files
      current = { family: entry.family, files: entry.files, namesSha256: entry.namesSha256,
        diagnostics: 0, index: -1, lastName: null, file: null, queries: 0, names: [], queryHash: createHash("sha256") }
      continue
    }
    if (entry.kind === "file") {
      const keys = exactKeys(entry, RECEIPT_KEYS.file, "file record")
      if (keys) return fail(keys)
      if (!current) return fail(`file record at line ${index + 1} is outside a started family`)
      if (entry.family !== current.family) return fail(`file record family ${entry.family} does not match the active family ${current.family}`)
      if (!FILE_SCOPED.includes(current.family)) return fail(`file record in the whole-program family ${current.family}`)
      if (entry.index !== current.index + 1) return fail(`${current.family} file index ${entry.index} does not follow ${current.index}`)
      if (!isAbsolute(entry.name)) return fail("file record name must be absolute")
      if (current.lastName !== null && !(entry.name > current.lastName)) {
        return fail(`${current.family} file names must be sorted and unique`)
      }
      if (!Number.isInteger(entry.diagnostics) || entry.diagnostics < 0) {
        return fail("file record diagnostics must be a non-negative integer")
      }
      const pending = closeFile()
      if (pending) return fail(pending)
      current.file = { name: entry.name, declared: entry.diagnostics, seen: 0 }
      current.index = entry.index
      current.lastName = entry.name
      current.queries++
      current.names.push(entry.name)
      current.queryHash.update(JSON.stringify({ name: entry.name, diagnostics: entry.diagnostics }))
      current.queryHash.update("\n")
      if (keepFiles) result.files.push({ family: entry.family, index: entry.index, name: entry.name, diagnostics: entry.diagnostics })
      continue
    }
    if (entry.kind === "diagnostic") {
      const keys = exactKeys(entry, RECEIPT_KEYS.diagnostic, "diagnostic record")
      if (keys) return fail(keys)
      if (!current) return fail(`diagnostic at line ${index + 1} is outside a started family`)
      if (entry.family !== current.family) return fail(`diagnostic family ${entry.family} does not match the active family ${current.family}`)
      if (FILE_SCOPED.includes(current.family)) {
        if (!current.file) return fail("a file-scoped diagnostic appears before a file record")
        if (entry.file !== current.file.name) return fail("diagnostic file does not match the active file record")
        current.file.seen++
      } else if (entry.file !== null) {
        return fail("a whole-program diagnostic must not name a file")
      }
      const error = validateDiagnostic(entry.diagnostic)
      if (error) return fail(error)
      current.diagnostics++
      result.diagnostics++
      if (entry.diagnostic.category === 1) result.errors++
      else if (entry.diagnostic.category === 0) result.warnings++
      hash.update(JSON.stringify(entry.diagnostic))
      hash.update("\n")
      if (keepRecords) result.records.push({ family: entry.family, file: entry.file, diagnostic: entry.diagnostic })
      continue
    }
    if (entry.kind === "family") {
      if (!current) return fail("a family terminal appears without a family-start")
      if (entry.family !== current.family) return fail("family terminal does not match the active family")
      const pending = closeFile()
      if (pending) return fail(pending)
      const keys = exactKeys(entry, RECEIPT_KEYS.family, "family terminal")
      if (keys) return fail(keys)
      if (!Number.isInteger(entry.diagnostics) || entry.diagnostics !== current.diagnostics) {
        return fail(`${entry.family} terminal reports ${entry.diagnostics} diagnostics but ${current.diagnostics} were recorded`)
      }
      if (entry.files !== current.files) return fail(`${entry.family} terminal changed the declared file count`)
      if (entry.namesSha256 !== current.namesSha256) return fail(`${entry.family} terminal has the wrong name digest`)
      if (FILE_SCOPED.includes(entry.family) && namesDigest(current.names) !== current.namesSha256) {
        return fail(`${entry.family} file names do not match the graph name digest`)
      }
      if (!Number.isInteger(entry.queries) || entry.queries !== current.queries) {
        return fail(`${entry.family} terminal reports ${entry.queries} file queries but ${current.queries} were recorded`)
      }
      if (entry.queryDigest !== current.queryHash.digest("hex")) return fail(`${entry.family} terminal query digest does not match the file records`)
      if (!Number.isFinite(entry.elapsedMs) || entry.elapsedMs < 0) return fail(`${entry.family} terminal has an invalid elapsed time`)
      result.families[entry.family] = { family: entry.family, files: entry.files,
        diagnostics: entry.diagnostics, queries: entry.queries, namesSha256: entry.namesSha256,
        queryDigest: entry.queryDigest, elapsedMs: entry.elapsedMs }
      current = null
      familyIndex++
      continue
    }
    return fail(`line ${index + 1} has unknown kind ${entry.kind}`)
  }
  result.digest = hash.digest("hex")
  result.digestMatches = result.trailer !== null && result.trailer.diagnosticsSha256 === result.digest
  if (!result.trailer) return fail("the receipt has no terminal trailer")
  if (current) return fail("the receipt ends inside an active family")
  if (!result.digestMatches) return fail("the receipt diagnostic digest does not match its trailer")
  const completion = validateCompletion(result)
  if (completion) return fail(completion)
  result.ok = true
  return result
}

export function classifyRun({ preflight: checks, guard, parsed, identityAfter }) {
  const completedFamilies = parsed ? Object.keys(parsed.families).sort() : []
  const base = { completedFamilies, diagnostics: parsed?.diagnostics ?? 0,
    errors: parsed?.errors ?? 0, warnings: parsed?.warnings ?? 0 }
  if (!guard?.spawned) return { ...base, status: "incomplete", reason: guard?.reason ?? "not-spawned" }
  if (guard.reason) return { ...base, status: "incomplete", reason: guard.reason }
  if (guard.code === 5) return { ...base, status: "incomplete", reason: "receipt-budget" }
  if (!parsed) return { ...base, status: "incomplete", reason: "worker-receipt-missing" }
  if (!parsed.complete) return { ...base, status: "incomplete", reason: "receipt-truncated" }
  if (!parsed.ok) return { ...base, status: "incomplete", reason: "receipt-invalid", detail: parsed.error }
  if (!parsed.trailer) return { ...base, status: "incomplete", reason: "receipt-without-trailer" }
  if (!parsed.digestMatches) return { ...base, status: "incomplete", reason: "diagnostic-digest-mismatch" }
  if (parsed.trailer.status === "invalid-config") return { ...base, status: "invalid-config", reason: "config-diagnostics" }
  if (parsed.trailer.status === "failed") {
    const stage = parsed.trailer.failure?.stage ?? "unknown"
    return { ...base, status: "incomplete", reason: `worker-failure:${stage}` }
  }
  if (parsed.trailer.status !== "completed") return { ...base, status: "incomplete", reason: "unexpected-worker-status" }
  if (!checks.identityComplete) return { ...base, status: "incomplete", reason: "identity-incomplete" }
  if (guard.signal !== null && guard.signal !== undefined) return { ...base, status: "incomplete", reason: `worker-signal:${guard.signal}` }
  if (guard.code !== 0) return { ...base, status: "incomplete", reason: `worker-exit:${guard.code}` }
  if (identityAfter === undefined || identityAfter === null) {
    return { ...base, status: "incomplete", reason: "identity-unverified" }
  }
  if (identityAfter.stable !== true) return { ...base, status: "incomplete", reason: "identity-drift" }
  if (!guard.cleanup || guard.cleanup.verified !== true) {
    return { ...base, status: "incomplete", reason: "cleanup-unverified" }
  }
  if (JSON.stringify(completedFamilies) !== JSON.stringify([...FAMILIES].sort())) {
    return { ...base, status: "incomplete", reason: "family-incomplete" }
  }
  const graph = parsed.graph
  if (!graph) return { ...base, status: "incomplete", reason: "graph-observation-missing" }
  if (checks.project.graphFiles !== null && graph.graphFiles !== checks.project.graphFiles) {
    return { ...base, status: "incomplete", reason: "graph-count-mismatch" }
  }
  if (checks.graph.namesSha256 && graph.namesSha256 !== checks.graph.namesSha256) {
    return { ...base, status: "incomplete", reason: "graph-names-mismatch" }
  }
  if (parsed.trailer.iteratedFiles !== FILE_SCOPED.length * graph.graphFiles) {
    return { ...base, status: "incomplete", reason: "iteration-incomplete" }
  }
  if (parsed.errors > 0) return { ...base, status: "compiler-error", reason: "diagnostics-reported" }
  return { ...base, status: "clean", reason: null }
}

export function reverifyIdentity(expectations) {
  try {
    const checks = preflight(expectations)
    return {
      stable: checks.identityComplete,
      compilerSha256: checks.compiler.sha256,
      compilerVerified: checks.compiler.verified,
      apiModuleSha256: checks.compiler.apiModuleSha256,
      apiModuleVerified: checks.compiler.apiModuleVerified,
      config: checks.project.config,
      configSha256: checks.project.configSha256,
      configVerified: checks.project.configVerified,
      rootFiles: checks.project.rootFiles,
      graph: {
        verified: checks.graph.verified,
        files: checks.graph.files,
        entriesChecked: checks.graph.entriesChecked,
        bytes: checks.graph.bytes,
        receiptSha256: checks.graph.receiptSha256,
        graphSha256: checks.graph.graphSha256,
        namesSha256: checks.graph.namesSha256,
        mismatchCount: checks.graph.mismatchCount,
        mismatches: checks.graph.mismatches,
        error: checks.graph.error ?? null,
      },
      overlays: {
        verified: checks.overlays.verified,
        problem: checks.overlays.problem,
        nativeStatus: checks.overlays.nativeStatus,
      },
    }
  } catch (error) {
    return { stable: false, error: error.message }
  }
}

export function verifyReceiptBinding(expectations, parsed, expectationsSha256) {
  if (!parsed?.ok) return "receipt-invalid"
  const header = parsed.header
  if (!header) return "header-missing"
  if (header.config !== expectations.project.config) return "header-config-mismatch"
  if (header.compiler !== expectations.compiler.executable) return "header-compiler-mismatch"
  if (header.compilerSha256 !== expectations.compiler.sha256) return "header-compiler-digest-mismatch"
  if (header.apiModule !== expectations.compiler.apiModule) return "header-api-module-mismatch"
  if (header.apiModuleSha256 !== expectations.compiler.apiModuleSha256) return "header-api-module-digest-mismatch"
  if (header.expectationsSha256 !== expectationsSha256) return "expectations-mismatch"
  const expectedRuntime = expectations.runtime ?? null
  const headerRuntime = header.runtime ?? null
  if (expectedRuntime === null) {
    if (headerRuntime !== null) return "runtime-unexpected"
  } else {
    if (headerRuntime === null) return "runtime-missing"
    if (headerRuntime.goGcPercent !== expectedRuntime.goGcPercent) return "runtime-go-gc-mismatch"
    if (headerRuntime.observedWorkerGoGc !== String(expectedRuntime.goGcPercent)) return "runtime-observation-mismatch"
  }
  const graph = parsed.graph
  if (!graph) return "graph-observation-missing"
  if (expectations.project.graphFiles !== undefined && graph.graphFiles !== expectations.project.graphFiles) {
    return "graph-count-mismatch"
  }
  if (expectations.project.namesSha256 !== undefined && graph.namesSha256 !== expectations.project.namesSha256) {
    return "graph-names-mismatch"
  }
  for (const [key, expected] of Object.entries(expectations.project.options)) {
    if (JSON.stringify(graph.options[key] ?? null) !== JSON.stringify(expected)) return `option-mismatch:${key}`
  }
  if (expectations.project.rootFiles !== undefined
    && JSON.stringify(graph.rootFiles) !== JSON.stringify(expectations.project.rootFiles)) {
    return "root-files-mismatch"
  }
  return null
}

const SUPERVISOR_LIMIT_KEYS = Object.freeze(["prelaunchMiB", "availableFloorMiB", "ownedRSSMiB", "deadlineMs",
  "sampleMs", "samplerMs", "postExitGraceMs", "drainMs", "stdoutBytes", "stderrBytes"])

function assertSupervisorLimits(limits) {
  for (const key of SUPERVISOR_LIMIT_KEYS) {
    const value = limits[key]
    if (!Number.isFinite(value) || value <= 0 || value > LIMITS[key]) {
      throw new Error(`supervisor limit ${key} must be positive and no greater than the mandated bound`)
    }
  }
}

// Runs a child under the owned-process guard. Injections are a test seam only;
// guardedRun always passes the real spawn/sampler/frozen limits. The root and
// every sampled descendant identity are tracked while the root is alive, the
// deadline and available-memory floor continue after root exit, and a bounded
// post-exit grace terminates only verified descendants. Unknown or reused
// identities are never signalled and make the cleanup unverified.
export async function superviseProcess({
  command, args, cwd, env,
  spawn: spawnImpl = spawn,
  available = availableMiB,
  sampleTree = sampleOwnedTree,
  readStartTime = readProcessStartTime,
  observeOwned,
  sameOwned,
  now = () => performance.now(),
  limits = LIMITS,
}) {
  assertSupervisorLimits(limits)
  // A legacy boolean seam cannot distinguish gone from unknown; it is mapped to
  // "unknown" on false so cleanup fails closed instead of claiming a live child
  // was gone. Production uses the tri-state observer.
  const observeImpl = observeOwned
    ?? (sameOwned ? (pid, start) => (sameOwned(pid, start) ? "alive" : "unknown") : observeOwnedProcess)
  // A registry walk, its forest samples and any resulting signals share one
  // allowance; starting a new observer must not replenish it for every PID.
  const observationBudget = (durationMs = limits.samplerMs) => {
    const clockStarted = now()
    const wallDeadline = performance.now() + durationMs
    let entries = 0
    let failure = null
    const fail = message => {
      failure ??= Object.assign(new Error(message), { code: "observer-budget" })
      throw failure
    }
    const check = () => {
      if (failure) throw failure
      const current = now()
      if (!Number.isFinite(clockStarted) || !Number.isFinite(current) || current < clockStarted
        || current - clockStarted > durationMs || performance.now() > wallDeadline) {
        fail("aggregate ownership observation exceeded its deadline")
      }
    }
    const account = (count = 1) => {
      check()
      if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.samplerEntries - entries) {
        fail("aggregate ownership observation exceeded its entry bound")
      }
      entries += count
      check()
    }
    return {
      account, check, entries: () => entries,
      options() {
        check()
        const deadlineMs = Math.min(limits.samplerMs,
          durationMs - (now() - clockStarted), wallDeadline - performance.now())
        const maxEntries = LIMITS.samplerEntries - entries
        if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || maxEntries < 1) {
          fail("aggregate ownership observation has no remaining budget")
        }
        return { now, deadlineMs, maxEntries, accountWork: account }
      },
    }
  }
  const observe = (pid, start, budget) => {
    budget.account()
    const state = observeImpl(pid, start, undefined, budget.options())
    budget.check()
    return state
  }
  const sample = (pid, start, budget) => {
    budget.account()
    const before = budget.entries()
    const tree = sampleTree(pid, undefined, { ...budget.options(), expectedStartTime: start })
    // An injected sampler can report work without using the shared callback.
    // Preserve that charge without charging real callback-accounted work twice.
    const work = tree.workEntries ?? tree.processes?.length ?? 1
    if (!Number.isSafeInteger(work) || work < 0) budget.account(NaN)
    budget.account(Math.max(0, work - (budget.entries() - before)))
    return tree
  }
  const result = {
    spawned: false, reason: null, stdout: "", stderr: "", stdoutBytes: 0, stderrBytes: 0,
    rssSamples: 0, postExitSamples: 0, postExitChecks: 0, peakRSSMiB: null,
    descendantSignals: 0, cleanup: null,
  }
  const started = now()
  let child = null
  let timer = null
  let closeInfo = null
  let exited = false
  let rootExitedAt = null
  let sampled = false
  let startTime = null
  let rootSignalled = false
  let pendingClose = false
  let settled = false
  let settle = null
  const registry = new Map()
  const done = new Promise(resolve => { settle = resolve })
  const finish = () => { if (!settled) { settled = true; settle() } }
  const merge = sample => {
    for (const entry of sample?.processes ?? []) {
      if (!Number.isSafeInteger(entry.pid) || entry.pid < 1) continue
      if (typeof entry.startTime !== "string" || !/^[0-9]+$/.test(entry.startTime)) continue
      if (entry.pid === result.pid) continue
      const previous = registry.get(entry.pid)
      if (previous && previous.startTime !== entry.startTime) {
        throw new Error("a sampled descendant identity changed")
      }
      if (!previous && registry.size >= LIMITS.samplerEntries) {
        throw new Error("the cumulative owned registry exceeds the sampler entry bound")
      }
      registry.set(entry.pid, {
        pid: entry.pid, startTime: entry.startTime, state: entry.state ?? null,
        pgrp: entry.pgrp ?? null, ppid: entry.ppid ?? null,
      })
    }
  }
  const observeRegistry = budget => {
    const alive = []
    const unknown = []
    for (const entry of [...registry.values()]) {
      const state = observe(entry.pid, entry.startTime, budget)
      if (state === "missing" || state === "reused") registry.delete(entry.pid)
      else if (state === "unknown") unknown.push(entry)
      else alive.push(entry)
    }
    return { alive, unknown }
  }
  const signalDescendants = budget => {
    let signalled = 0
    for (const entry of [...registry.values()]) {
      if (observe(entry.pid, entry.startTime, budget) !== "alive") continue
      try {
        process.kill(entry.pid, "SIGKILL")
        signalled++
        result.descendantSignals++
      } catch (error) {
        if (error.code !== "ESRCH") result.descendantSignalError = error.code ?? "unknown"
      }
    }
    return signalled
  }
  const signalRootGroup = (reason, budget = observationBudget()) => {
    if (!child?.pid || rootSignalled) return
    let state = "unknown"
    try {
      if (startTime !== null) state = observe(result.pid, startTime, budget)
    } catch { /* An exhausted or unverifiable identity never permits a signal. */ }
    if (state !== "alive") {
      result.rootSignal = "worker-identity-unverified"
      return
    }
    try {
      process.kill(-child.pid, "SIGKILL")
      rootSignalled = true
      result.rootSignal = reason
    } catch (error) {
      result.rootSignal = error.code === "ESRCH" ? "worker-already-gone" : `kill-failed:${error.code ?? "unknown"}`
    }
  }
  const stop = (reason, budget) => {
    result.reason ??= reason
    if (!settled) signalRootGroup(reason, budget)
    finish()
  }
  const sampleDescendants = (alive, budget, baseRSS = 0) => {
    if (alive.length === 0) return
    const known = new Set(alive.map(entry => entry.pid))
    const roots = alive.filter(entry => !known.has(entry.ppid))
    let total = baseRSS
    for (const entry of roots) {
      let tree
      try {
        tree = sample(entry.pid, entry.startTime, budget)
      } catch (error) {
        const state = observe(entry.pid, entry.startTime, budget)
        if (state === "missing" || state === "reused") {
          registry.delete(entry.pid)
          continue
        }
        throw error
      }
      merge(tree)
      budget.check()
      total += tree.rssMiB
    }
    if (exited) {
      result.postExitSamples++
      result.postExitRSSMiB = total
    } else {
      result.retainedRSSSamples = (result.retainedRSSSamples ?? 0) + 1
    }
    result.peakRSSMiB = Math.max(result.peakRSSMiB ?? 0, total)
    if (result.peakRSSMiB > limits.ownedRSSMiB) stop("owned-rss-budget", budget)
  }
  const tick = () => {
    if (settled) return
    const budget = observationBudget()
    try {
      if (now() - started > limits.deadlineMs) return stop("deadline", budget)
      const memory = available()
      result.minimumAvailableMiB = result.minimumAvailableMiB === undefined
        ? memory : Math.min(result.minimumAvailableMiB, memory)
      if (memory < limits.availableFloorMiB) return stop("available-memory-floor", budget)
      if (!exited) {
        const tree = sample(child.pid, startTime, budget)
        merge(tree)
        budget.check()
        const root = tree.processes?.find(entry => entry.pid === result.pid)
        if (root?.state === "Z") {
          exited = true
          rootExitedAt ??= now()
          registry.delete(result.pid)
          result.rssSamples++
          sampled = true
          return
        }
        result.peakRSSMiB = Math.max(result.peakRSSMiB ?? 0, tree.rssMiB)
        result.rssSamples++
        sampled = true
        if (result.peakRSSMiB > limits.ownedRSSMiB) return stop("owned-rss-budget", budget)
        const included = new Set((tree.processes ?? []).map(entry => entry.pid))
        const retained = []
        for (const entry of registry.values()) {
          if (included.has(entry.pid)) continue
          const state = observe(entry.pid, entry.startTime, budget)
          if (state === "missing" || state === "reused") registry.delete(entry.pid)
          else if (state === "unknown") return stop("descendant-identity-unavailable", budget)
          else retained.push(entry)
        }
        sampleDescendants(retained, budget, tree.rssMiB)
        return
      }
      result.postExitChecks++
      registry.delete(result.pid)
      const observed = observeRegistry(budget)
      sampleDescendants(observed.alive, budget)
      if (pendingClose) return finish()
      if (rootExitedAt === null) return
      if (now() - rootExitedAt <= limits.postExitGraceMs) return
      if (observed.alive.length > 0) {
        signalDescendants(budget)
        return stop("descendant-close-timeout", budget)
      }
      if (observed.unknown.length > 0) return stop("descendant-identity-unavailable", budget)
      return stop("descendant-cleanup-unverified", budget)
    } catch (error) {
      // A root that has exited between the last event and this sample must not
      // be mistaken for a monitor failure; switch to the post-exit path.
      let rootState = "unknown"
      try {
        if (startTime !== null) rootState = observe(result.pid, startTime, budget)
      } catch { /* Keep the failed sample's exhausted budget; do not replenish it. */ }
      let budgetFailed = false
      try { budget.check() } catch { budgetFailed = true }
      if (!budgetFailed && !exited && child && (child.exitCode !== null || child.signalCode !== null
        || rootState === "missing" || rootState === "reused")) {
        exited = true
        rootExitedAt ??= now()
        return
      }
      result.monitorError = String(error.message ?? error).slice(0, 512)
      return stop("monitor-unavailable", budget)
    }
  }
  const finalCleanup = () => {
    if (!result.spawned || !Number.isSafeInteger(result.pid) || result.pid < 1) {
      return { signalled: false, verified: false, reason: "no-child" }
    }
    const didSignal = () => rootSignalled || result.descendantSignals > 0
    try {
      // Both drain loops and all their identity checks share the existing
      // cleanup deadline and entry allowance, rather than resetting per PID.
      const budget = observationBudget(limits.drainMs)
      const drainUntil = now() + limits.drainMs
      registry.delete(result.pid)
      let observed = observeRegistry(budget)
      if (observed.alive.length > 0) {
        signalDescendants(budget)
        observed = observeRegistry(budget)
        while (observed.alive.length > 0 && now() < drainUntil) {
          Atomics.wait(samplerSleep, 0, 0, Math.min(10, budget.options().deadlineMs))
          observed = observeRegistry(budget)
        }
        if (observed.alive.length > 0) {
          return { signalled: didSignal(), verified: false, reason: "descendant-cleanup-unverified", descendants: observed.alive.length }
        }
      }
      if (closeInfo === null) {
        let rootState = startTime === null ? "unknown" : observe(result.pid, startTime, budget)
        if (rootState === "alive") {
          signalRootGroup("cleanup", budget)
          while (rootState === "alive" && now() < drainUntil) {
            Atomics.wait(samplerSleep, 0, 0, Math.min(10, budget.options().deadlineMs))
            rootState = observe(result.pid, startTime, budget)
          }
        }
        if (rootState !== "missing" && rootState !== "reused") {
          return { signalled: didSignal(), verified: false,
            reason: rootState === "unknown" ? "worker-identity-unverified" : "worker-cleanup-unverified" }
        }
      }
      budget.check()
      if (observed.unknown.length > 0) {
        return { signalled: didSignal(), verified: false, reason: "descendant-identity-unavailable", descendants: observed.unknown.length }
      }
      if (!sampled) return { signalled: didSignal(), verified: false, reason: "no-sample" }
      if (registry.size === 0) {
        return { signalled: didSignal(), verified: true, reason: result.descendantSignals > 0
          ? "descendants-terminated" : rootSignalled ? "worker-close" : "no-owned-descendants-observed" }
      }
      return { signalled: didSignal(), verified: true,
        reason: result.descendantSignals > 0 ? "descendants-terminated" : "owned-descendants-gone" }
    } catch (error) {
      result.cleanupError = String(error.message ?? error).slice(0, 512)
      return { signalled: didSignal(), verified: false, reason: "descendant-cleanup-unverified" }
    }
  }
  try {
    try {
      result.initialAvailableMiB = available()
    } catch {
      result.reason = "memory-unavailable"
      return result
    }
    result.minimumAvailableMiB = result.initialAvailableMiB
    if (result.initialAvailableMiB < limits.prelaunchMiB) {
      result.reason = "prelaunch-memory-guard"
      return result
    }
    try {
      child = spawnImpl(command, args, { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"], env })
    } catch (error) {
      result.error = error.message
      result.reason = "spawn-error"
      return result
    }
    result.spawned = true
    result.pid = child.pid
    // A failed exec emits "error" asynchronously; keep it observed even when the
    // pid is unusable so it cannot become an uncaught exception.
    child.once("error", () => {})
    if (!Number.isSafeInteger(child.pid) || child.pid < 1) {
      result.spawned = false
      result.reason = "spawn-error"
      return result
    }
    startTime = readStartTime(child.pid)
    result.workerStartTime = startTime
    if (!child.stdout || !child.stderr) {
      result.reason = "spawn-error"
      return result
    }
    child.once("exit", () => { exited = true; rootExitedAt = now() })
    child.once("close", (code, signal) => {
      closeInfo = { code, signal }
      // Guarantee at least one post-exit guard check before a close that races
      // the root's exit; the next tick finishes the run.
      if (exited && result.postExitChecks === 0) {
        pendingClose = true
        return
      }
      finish()
    })
    child.once("error", error => { result.error = error.message; stop("spawn-error") })
    const buffers = { stdout: [], stderr: [] }
    const sizes = { stdout: 0, stderr: 0 }
    for (const [stream, field, cap] of [[child.stdout, "stdout", limits.stdoutBytes], [child.stderr, "stderr", limits.stderrBytes]]) {
      stream.on("data", chunk => {
        sizes[field] += chunk.length
        if (sizes[field] > cap) return stop(`${field}-budget`)
        buffers[field].push(chunk)
      })
    }
    tick()
    timer = setInterval(tick, limits.sampleMs)
    await done
    clearInterval(timer)
    timer = null
    if (closeInfo) Object.assign(result, closeInfo)
    else { result.code = null; result.signal = null }
    result.stdout = Buffer.concat(buffers.stdout).toString("utf8")
    result.stderr = Buffer.concat(buffers.stderr).toString("utf8")
    result.stdoutBytes = sizes.stdout
    result.stderrBytes = sizes.stderr
    return result
  } finally {
    clearInterval(timer)
    // Release our ends of the pipes even when a descendant's identity could not
    // be verified; an unverified survivor is never signalled, and the run stays
    // incomplete rather than holding the caller's event loop open forever.
    if (child) {
      try { child.stdout?.destroy() } catch { /* already closed */ }
      try { child.stderr?.destroy() } catch { /* already closed */ }
      try { child.stdin?.destroy() } catch { /* already closed */ }
      try { child.unref?.() } catch { /* already gone */ }
    }
    result.cleanup = finalCleanup()
    result.ownedProcesses = [...registry.values()].slice(0, 64).map(entry => ({
      pid: entry.pid, startTime: entry.startTime, state: entry.state, pgrp: entry.pgrp, ppid: entry.ppid,
    }))
    result.ownedProcessCount = registry.size
    if (result.spawned && !["worker-close", "owned-descendants-gone", "descendants-terminated",
      "no-owned-descendants-observed"].includes(result.cleanup.reason)) {
      result.reason ??= result.cleanup.reason
    }
    result.elapsedSeconds = (now() - started) / 1000
  }
}

export async function guardedRun({ expectationsPath, receiptPath }) {
  const raw = readStableJson(expectationsPath, { maxBytes: LIMITS.expectationsBytes, label: "expectations" })
  const expectations = normalizeExpectations(raw)
  const checks = preflight(expectations)
  const workerReceipt = `${receiptPath}.ndjson`
  const fd = fs.openSync(receiptPath, "wx", 0o600)
  const result = {
    schema: SCHEMA,
    observedAt: new Date().toISOString(),
    expectationsPath,
    expectationsSha256: digest(Buffer.from(JSON.stringify(raw))),
    runtime: expectations.runtime,
    limits: LIMITS,
    preflight: checks,
    spawned: false,
    reason: null,
    workerReceipt: { path: workerReceipt },
  }
  const started = performance.now()
  try {
    if (fs.existsSync(workerReceipt)) {
      result.reason = "worker-receipt-exists"
      return result
    }
    if (!checks.identityComplete) {
      result.reason = "identity-incomplete"
      return result
    }
    const script = fileURLToPath(import.meta.url)
    let supervised
    try {
      supervised = await superviseProcess({
        command: process.execPath,
        args: [script, "worker", "--expectations", expectationsPath, "--receipt", workerReceipt,
          "--receipt-budget", String(LIMITS.receiptBytes)],
        cwd: path.dirname(expectations.project.config),
        env: buildWorkerEnvironment(path.dirname(expectations.project.config), expectations.runtime),
        limits: LIMITS,
      })
    } catch (error) {
      result.reason = `supervisor-error:${error.message}`
      supervised = { spawned: false, cleanup: { signalled: false, verified: false, reason: "supervisor-error" } }
    }
    Object.assign(result, supervised)

    try {
      const bytes = readStableFile(workerReceipt, { maxBytes: LIMITS.receiptBytes, label: "worker receipt" })
      result.workerReceipt.bytes = bytes.length
      result.workerReceipt.sha256 = digest(bytes)
      result.workerReceipt.parsed = parseWorkerReceipt(bytes.toString("utf8"))
    } catch (error) {
      result.workerReceipt.readError = error.message
      result.reason ??= error.code === "acquisition-size" ? "receipt-oversized"
        : error.code === "acquisition-changed" ? "receipt-changed"
          : error.code === "acquisition-symlink" || error.code === "acquisition-nonregular" ? "receipt-nonregular"
            : "receipt-unreadable"
    }
    const binding = verifyReceiptBinding(expectations, result.workerReceipt.parsed, result.expectationsSha256)
    if (binding) result.reason ??= binding
    result.identityAfter = reverifyIdentity(expectations)
    result.classification = classifyRun({ preflight: checks, guard: result, parsed: result.workerReceipt.parsed, identityAfter: result.identityAfter })
    result.status = result.classification.status
    return result
  } finally {
    result.supervisorElapsedSeconds = result.elapsedSeconds ?? null
    result.elapsedSeconds = (performance.now() - started) / 1000
    if (!result.classification) {
      result.classification = { status: "incomplete", reason: result.reason ?? "not-spawned",
        completedFamilies: [], diagnostics: 0, errors: 0, warnings: 0 }
      result.status = "incomplete"
    }
    try {
      const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n")
      let offset = 0
      while (offset < bytes.length) {
        const written = fs.writeSync(fd, bytes, offset, bytes.length - offset)
        if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) throw new Error("receipt write made invalid progress")
        offset += written
      }
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
  }
}

function parseFlags(args) {
  const flags = {}
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`)
    const key = arg.slice(2)
    if (key === "") throw new Error("empty flag name")
    if (Object.hasOwn(flags, key)) throw new Error(`duplicate flag ${arg}`)
    const value = args[++index]
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${arg}`)
    flags[key] = value
  }
  return flags
}

function requireFlags(flags, allowed, required = allowed) {
  for (const key of Object.keys(flags)) {
    if (!allowed.includes(key)) throw new Error(`unexpected flag --${key}`)
  }
  for (const key of required) {
    if (flags[key] === undefined) throw new Error(`missing required flag --${key}`)
  }
}

const USAGE = `usage:
  full-graph-diagnostics.mjs preflight --expectations <file>
  full-graph-diagnostics.mjs run --expectations <file> --receipt <file>
  full-graph-diagnostics.mjs worker --expectations <file> --receipt <file> [--receipt-budget <bytes>]
  full-graph-diagnostics.mjs digest --graph <receipt.json>
`

export async function main(argv) {
  const [command, ...rest] = argv
  const flags = parseFlags(rest)
  if (command === "preflight") {
    requireFlags(flags, ["expectations"])
    const raw = readStableJson(flags.expectations, { maxBytes: LIMITS.expectationsBytes, label: "expectations" })
    const checks = preflight(normalizeExpectations(raw))
    process.stdout.write(JSON.stringify(checks, null, 2) + "\n")
    return checks.identityComplete ? 0 : 2
  }
  if (command === "digest") {
    requireFlags(flags, ["graph"])
    const receipt = readStableJson(flags.graph, { maxBytes: LIMITS.graphReceiptBytes, label: "graph receipt" })
    if (!Array.isArray(receipt.entries) || receipt.entries.length === 0) throw new Error("graph receipt has no entries")
    if (Number.isInteger(receipt.files) && receipt.files !== receipt.entries.length) {
      throw new Error("graph receipt file count does not match its entries")
    }
    const names = new Set()
    for (const entry of receipt.entries) {
      if (!entry || !isAbsolute(entry.name) || !isSha256(entry.sha256)) throw new Error("graph receipt entry is malformed")
      if (names.has(entry.name)) throw new Error(`graph receipt repeats ${entry.name}`)
      names.add(entry.name)
    }
    process.stdout.write(JSON.stringify({
      files: receipt.entries.length,
      graphSha256: digest(Buffer.from(JSON.stringify(receipt.entries))),
      namesSha256: namesDigest([...names]),
    }) + "\n")
    return 0
  }
  if (command === "worker") {
    requireFlags(flags, ["expectations", "receipt", "receipt-budget"], ["expectations", "receipt"])
    const budget = flags["receipt-budget"] === undefined ? LIMITS.receiptBytes : Number(flags["receipt-budget"])
    const raw = readStableJson(flags.expectations, { maxBytes: LIMITS.expectationsBytes, label: "expectations" })
    const outcome = await runWorker({ expectations: raw, receiptPath: flags.receipt, receiptBudgetBytes: budget })
    return outcome.exitCode
  }
  if (command === "run") {
    requireFlags(flags, ["expectations", "receipt"])
    const result = await guardedRun({ expectationsPath: flags.expectations, receiptPath: flags.receipt })
    process.stdout.write(JSON.stringify({
      schema: result.schema, status: result.status, reason: result.classification?.reason ?? null,
      completedFamilies: result.classification?.completedFamilies ?? [], diagnostics: result.classification?.diagnostics ?? 0,
      errors: result.classification?.errors ?? 0, warnings: result.classification?.warnings ?? 0,
      spawned: result.spawned, receipt: flags.receipt, workerReceipt: result.workerReceipt?.path ?? null,
    }) + "\n")
    return EXIT[result.status] ?? 2
  }
  process.stderr.write(USAGE)
  return 64
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code }, error => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 64
  })
}
