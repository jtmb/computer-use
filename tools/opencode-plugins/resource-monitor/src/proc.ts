import { open, opendir } from "node:fs/promises"

export type ProcEntry = {
  pid: number
  ppid: number
  utime: number
  stime: number
  startTimeTicks: number
  rssPages: number
  comm: string
  isService?: boolean
}

export type ProcReader = {
  list: (rootPid: number) => Promise<ProcEntry[]>
  pageSize: number
  clockTicks: number
}

export type ProcLimits = {
  maxProcesses: number
  maxDepth: number
  maxChildren: number
  maxChildrenTextBytes: number
}

export type ProcUnits = { pageSize: number; clockTicks: number }
export type ProcTextReader = (path: string, maxBytes: number) => Promise<string | undefined>
export type ProcReaderDependencies = {
  discoverUnits?: () => Promise<ProcUnits>
  readText?: ProcTextReader
  listTasks?: (path: string) => Promise<number[] | undefined>
}
export type ElfLayout = { wordBytes: 4 | 8; littleEndian: boolean }
export type ProcUnitDependencies = {
  platform?: string
  readElfHeader?: () => Promise<Uint8Array>
  readAuxv?: () => Promise<Uint8Array | undefined>
}

// Bounds for one /proc traversal. These are DoS ceilings for a corrupt or hostile
// process tree, not expected values: a real desktop session stays far below them.
export const DEFAULT_PROC_LIMITS: Readonly<ProcLimits> = Object.freeze({
  maxProcesses: 4_096,
  maxDepth: 64,
  maxChildren: 512,
  maxChildrenTextBytes: 65_536,
})

const MAX_PROC_TEXT_BYTES = 65_536
const MAX_STAT_BYTES = 4_096
const MAX_CMDLINE_BYTES = 16_384
const PROC_READ_CHUNK_BYTES = 8_192
const MAX_AUXV_BYTES = 4_096
const ELF_PREFIX_BYTES = 6
const MAX_TASKS = 4_096

async function listProcTasks(path: string): Promise<number[] | undefined> {
  try {
    const directory = await opendir(path)
    const tasks: number[] = []
    for await (const entry of directory) {
      const tid = Number(entry.name)
      if (!Number.isSafeInteger(tid) || tid <= 0 || String(tid) !== entry.name || !entry.isDirectory()) {
        throw new Error("malformed live task list")
      }
      if (tasks.length >= MAX_TASKS) throw new Error("task traversal exceeded maxTasks")
      tasks.push(tid)
    }
    return tasks
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

// ELF magic is 0x7f "ELF"; byte 4 selects 32/64-bit words and byte 5 selects
// endianness. /proc/self/auxv is encoded in the same layout as the running binary.
export function parseElfLayout(header: Uint8Array): ElfLayout {
  if (header.length !== ELF_PREFIX_BYTES || header[0] !== 0x7f || header[1] !== 0x45 ||
    header[2] !== 0x4c || header[3] !== 0x46 ||
    (header[4] !== 1 && header[4] !== 2) || (header[5] !== 1 && header[5] !== 2)) {
    throw new Error("unsupported executable ELF layout")
  }
  return { wordBytes: header[4] === 1 ? 4 : 8, littleEndian: header[5] === 1 }
}

function readAuxvWord(bytes: Uint8Array, offset: number, layout: ElfLayout): number {
  let value = 0
  for (let index = 0; index < layout.wordBytes; index += 1) {
    value = value * 256 + bytes[offset + (layout.littleEndian ? layout.wordBytes - 1 - index : index)]!
    if (!Number.isSafeInteger(value)) throw new Error("auxv word exceeds the supported integer range")
  }
  return value
}

// auxv is a sequence of (type, value) word pairs. AT_PAGESZ (6) and AT_CLKTCK (17)
// are the only entries we need: they convert rss pages and stat ticks into bytes
// and seconds without shelling out to getconf.
export function parseAuxvUnits(bytes: Uint8Array, layout: ElfLayout): ProcUnits {
  const { wordBytes, littleEndian } = layout
  if ((wordBytes !== 4 && wordBytes !== 8) || typeof littleEndian !== "boolean" || bytes.length === 0 ||
    bytes.length > MAX_AUXV_BYTES || bytes.length % (wordBytes * 2) !== 0) {
    throw new Error("invalid auxiliary vector layout")
  }

  let pageSize: number | undefined
  let clockTicks: number | undefined
  let terminated = false
  for (let offset = 0; offset < bytes.length; offset += wordBytes * 2) {
    const type = readAuxvWord(bytes, offset, layout)
    if (type === 0) {
      if (readAuxvWord(bytes, offset + wordBytes, layout) !== 0 || offset + wordBytes * 2 !== bytes.length) {
        throw new Error("invalid auxiliary vector terminator")
      }
      terminated = true
      break
    }
    // Other auxv entries can contain process addresses; never interpret or expose them.
    if (type !== 6 && type !== 17) continue
    const value = readAuxvWord(bytes, offset + wordBytes, layout)
    if (value <= 0) throw new Error("invalid Linux proc unit")
    if (type === 6) {
      if (pageSize !== undefined) throw new Error("duplicate auxv page size")
      pageSize = value
    } else {
      if (clockTicks !== undefined) throw new Error("duplicate auxv clock ticks")
      clockTicks = value
    }
  }
  if (!terminated || pageSize === undefined || clockTicks === undefined) {
    throw new Error("Linux proc units are unavailable in auxv")
  }
  return { pageSize, clockTicks }
}

export async function readElfHeader(opener: typeof open = open): Promise<Uint8Array> {
  const handle = await opener("/proc/self/exe", "r")
  try {
    const header = Buffer.alloc(ELF_PREFIX_BYTES)
    let total = 0
    while (total < header.length) {
      const remaining = header.length - total
      const { bytesRead } = await handle.read(header, total, remaining, null)
      if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > remaining) {
        throw new Error("invalid executable header read result")
      }
      if (bytesRead === 0) throw new Error("executable ELF header is truncated")
      total += bytesRead
    }
    return header
  } finally {
    await handle.close().catch(() => {})
  }
}

export async function discoverProcUnits(dependencies: ProcUnitDependencies = {}): Promise<ProcUnits> {
  if ((dependencies.platform ?? process.platform) !== "linux") throw new Error("Linux proc units are unavailable")
  const header = await (dependencies.readElfHeader ?? readElfHeader)()
  const layout = parseElfLayout(header)
  const bytes = await (dependencies.readAuxv ?? (() => readBoundedProcBytes("/proc/self/auxv", MAX_AUXV_BYTES)))()
  if (!bytes) throw new Error("Linux auxiliary vector is unavailable")
  return parseAuxvUnits(bytes, layout)
}

export async function readBoundedProcBytes(
  path: string,
  maxBytes: number,
  opener: typeof open = open,
): Promise<Buffer | undefined> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_PROC_TEXT_BYTES) {
    throw new RangeError(`maxBytes must be between 0 and ${MAX_PROC_TEXT_BYTES}`)
  }

  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await opener(path, "r")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }

  try {
    const chunks: Buffer[] = []
    let total = 0
    // Read one byte past the budget so an oversized file is detected instead of
    // silently truncated; /proc files report size 0 and must be streamed.
    while (total <= maxBytes) {
      const buffer = Buffer.alloc(Math.min(PROC_READ_CHUNK_BYTES, maxBytes + 1 - total))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
      if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) {
        throw new Error("invalid bounded proc read result")
      }
      if (bytesRead === 0) break
      chunks.push(buffer.subarray(0, bytesRead))
      total += bytesRead
    }
    if (total > maxBytes) throw new Error(`proc file exceeded ${maxBytes} bytes`)
    return Buffer.concat(chunks, total)
  } finally {
    await handle.close().catch(() => {})
  }
}

export async function readBoundedProcText(
  path: string,
  maxBytes: number,
  opener: typeof open = open,
): Promise<string | undefined> {
  return (await readBoundedProcBytes(path, maxBytes, opener))?.toString("utf8")
}

// /proc/<pid>/stat puts the executable name in parentheses, and that name may
// itself contain spaces or parentheses. Split on the last ")" so field indices
// stay stable, then index from the post-comm suffix (state is field 0 there).
export function parseStat(text: string, pid: number): ProcEntry | undefined {
  const open = text.indexOf("(")
  const close = text.lastIndexOf(")")
  if (open < 0 || close <= open || text[close + 1] !== " " || text.slice(0, open).trim() !== String(pid)) return undefined

  const comm = text.slice(open + 1, close)
  const fields = text.slice(close + 2).trim().split(/\s+/)
  const number = (index: number) => Number(fields[index])
  const ppid = number(1)
  const utime = number(11)
  const stime = number(12)
  const startTimeTicks = number(19)
  const rssPages = number(21)
  const required = [pid, ppid, utime, stime, startTimeTicks, rssPages]

  if (!required.every(Number.isSafeInteger) || required.some((value) => value < 0) || pid === 0) return undefined
  return { pid, ppid, utime, stime, startTimeTicks, rssPages, comm }
}

export function isServiceCommand(cmdline: string | undefined): boolean {
  if (!cmdline) return false
  const args = cmdline.includes("\0") ? cmdline.split("\0").filter(Boolean) : cmdline.trim().split(/\s+/).filter(Boolean)
  const executable = args[0]?.split("/").pop()
  return executable === "opencode" && args.slice(1).includes("serve") && args.slice(1).includes("--service")
}

// Breadth-first walk of the parent/child graph. `seen` guards against cycles
// (and against a rootPid that reappears as its own descendant) so a malformed
// snapshot cannot loop forever.
export function selectProcessTree(entries: readonly ProcEntry[], rootPid: number): ProcEntry[] {
  const byParent = new Map<number, ProcEntry[]>()
  const byPid = new Map<number, ProcEntry>()

  for (const entry of entries) {
    const children = byParent.get(entry.ppid) ?? []
    children.push(entry)
    byParent.set(entry.ppid, children)
    byPid.set(entry.pid, entry)
  }

  const selected: ProcEntry[] = []
  const queue = [rootPid]
  const seen = new Set<number>()
  while (queue.length > 0) {
    const pid = queue.shift()!
    if (seen.has(pid)) continue
    seen.add(pid)
    const entry = byPid.get(pid)
    if (entry) selected.push(entry)
    for (const child of byParent.get(pid) ?? []) queue.push(child.pid)
  }
  return selected
}

// A shared `opencode serve --service` process belongs to the whole machine, so
// its resource use must not be attributed to whichever session happens to be
// inspected. Drop the service PIDs and everything they spawned.
export function excludeServiceSubtrees(entries: readonly ProcEntry[], servicePids: ReadonlySet<number>): ProcEntry[] {
  const byParent = new Map<number, ProcEntry[]>()
  for (const entry of entries) byParent.set(entry.ppid, [...(byParent.get(entry.ppid) ?? []), entry])

  const excluded = new Set(servicePids)
  const queue = [...servicePids]
  while (queue.length > 0) {
    const pid = queue.shift()!
    for (const child of byParent.get(pid) ?? []) {
      if (excluded.has(child.pid)) continue
      excluded.add(child.pid)
      queue.push(child.pid)
    }
  }
  return entries.filter((entry) => !excluded.has(entry.pid))
}

function validateLimits(limits: ProcLimits): void {
  const within = (value: number, maximum: number, minimum = 0) =>
    Number.isSafeInteger(value) && value >= minimum && value <= maximum
  if (!within(limits.maxProcesses, DEFAULT_PROC_LIMITS.maxProcesses, 1)
    || !within(limits.maxDepth, DEFAULT_PROC_LIMITS.maxDepth)
    || !within(limits.maxChildren, DEFAULT_PROC_LIMITS.maxChildren)
    || !within(limits.maxChildrenTextBytes, MAX_PROC_TEXT_BYTES)) {
    throw new RangeError("proc limits must be within the bounded supported ranges")
  }
}

export async function createProcReader(
  procRoot = "/proc",
  limits: ProcLimits = DEFAULT_PROC_LIMITS,
  dependencies: ProcReaderDependencies = {},
): Promise<ProcReader> {
  validateLimits(limits)

  const units = await (dependencies.discoverUnits ?? discoverProcUnits)()
  if (!Number.isSafeInteger(units.pageSize) || units.pageSize <= 0
    || !Number.isSafeInteger(units.clockTicks) || units.clockTicks <= 0) {
    throw new Error("Linux proc page size and clock ticks are unavailable")
  }
  const readText = dependencies.readText ?? readBoundedProcText
  const listTasks = dependencies.listTasks ?? listProcTasks
  const list = async (rootPid: number): Promise<ProcEntry[]> => {
    if (!Number.isSafeInteger(rootPid) || rootPid <= 0) throw new RangeError("rootPid must be a positive safe integer")

    const entries: ProcEntry[] = []
    const pending: Array<{ pid: number; depth: number; parentPid?: number }> = [{ pid: rootPid, depth: 0 }]
    const seen = new Set<number>()

    while (pending.length > 0) {
      const item = pending.shift()!
      const pid = item.pid
      if (seen.has(pid)) continue
      seen.add(pid)

      const statPath = `${procRoot}/${pid}/stat`
      const statText = await readText(statPath, MAX_STAT_BYTES)
      if (statText === undefined) continue
      const stat = parseStat(statText, pid)
      if (!stat) throw new Error(`malformed live proc stat: ${pid}`)
      // A PID is only trusted if its parent still matches the edge that queued it;
      // otherwise the PID was recycled between listing and reading.
      if (item.parentPid !== undefined && stat.ppid !== item.parentPid) continue
      if (entries.length >= limits.maxProcesses) throw new Error("process traversal exceeded maxProcesses")

      const cmdline = await readText(`${procRoot}/${pid}/cmdline`, MAX_CMDLINE_BYTES)
      if (cmdline === undefined) {
        if (await readText(statPath, MAX_STAT_BYTES) === undefined) continue
        throw new Error(`missing live proc cmdline: ${pid}`)
      }
      const confirmedText = await readText(statPath, MAX_STAT_BYTES)
      if (confirmedText === undefined) continue
      const confirmed = parseStat(confirmedText, pid)
      if (!confirmed) throw new Error(`malformed live proc stat: ${pid}`)
      // startTimeTicks is the stable identity for a PID. Re-check it after the
      // cmdline read so a process that exited mid-read is skipped, not misreported.
      if (confirmed.ppid !== stat.ppid || confirmed.startTimeTicks !== stat.startTimeTicks) continue
      stat.isService = isServiceCommand(cmdline)
      entries.push(stat)

      const tasks = await listTasks(`${procRoot}/${pid}/task`)
      if (tasks === undefined) {
        if (await readText(statPath, MAX_STAT_BYTES) === undefined) {
          entries.pop()
          continue
        }
        throw new Error(`missing live children list: ${pid}`)
      }
      if (tasks.length === 0 || tasks.length > MAX_TASKS || tasks.some((tid) => !Number.isSafeInteger(tid) || tid <= 0)) {
        throw new Error("invalid or oversized live task list")
      }
      const children = new Set<number>()
      let childrenBytes = 0
      for (const tid of new Set(tasks)) {
        const childrenText = await readText(`${procRoot}/${pid}/task/${tid}/children`, limits.maxChildrenTextBytes - childrenBytes)
        // Threads can exit between enumeration and acquisition; process identity is rechecked below.
        if (childrenText === undefined) {
          if (await readText(`${procRoot}/${pid}/task/${tid}/stat`, MAX_STAT_BYTES) !== undefined) {
            throw new Error(`missing live children list: ${pid}/${tid}`)
          }
          continue
        }
        childrenBytes += Buffer.byteLength(childrenText, "utf8")
        if (childrenBytes > limits.maxChildrenTextBytes) throw new Error("children list exceeded byte limit")
        const trimmed = childrenText.trim()
        for (const child of trimmed === "" ? [] : trimmed.split(/\s+/)) {
          const childPid = Number(child)
          if (!Number.isSafeInteger(childPid) || childPid <= 0 || String(childPid) !== child) {
            throw new Error("invalid live child PID")
          }
          children.add(childPid)
          if (children.size > limits.maxChildren) throw new Error("children list exceeded maxChildren")
        }
      }
      const afterText = await readText(statPath, MAX_STAT_BYTES)
      if (afterText === undefined) {
        entries.pop()
        continue
      }
      const after = parseStat(afterText, pid)
      if (!after || after.startTimeTicks !== stat.startTimeTicks || after.ppid !== stat.ppid) {
        throw new Error("process identity changed during traversal")
      }
      if (item.depth >= limits.maxDepth && children.size > 0) throw new Error("process traversal exceeded maxDepth")

      for (const childPid of children) {
        if (seen.has(childPid) || pending.some((queued) => queued.pid === childPid)) continue
        if (seen.size + pending.length >= limits.maxProcesses) throw new Error("process traversal exceeded maxProcesses")
        pending.push({ pid: childPid, depth: item.depth + 1, parentPid: pid })
      }
    }
    return entries
  }

  return { list, ...units }
}
