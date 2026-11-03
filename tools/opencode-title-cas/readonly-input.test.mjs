// Synthetic fixtures only: private directories under /tmp/opencode, created per test and removed
// after this file's run. No native checkout, compiler, package or network is touched.
import test, { after } from "node:test"
import { spawnSync } from "node:child_process"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { DEFAULT_LIMITS, ReadonlyInputError, createReadonlyInput } from "./readonly-input.mjs"

const BASE = "/tmp/opencode"
try { fs.mkdirSync(BASE, { mode: 0o700 }) } catch (error) {
  if (error.code !== "EEXIST") throw error
}
const baseStat = fs.lstatSync(BASE)
assert.ok(baseStat.isDirectory() && !baseStat.isSymbolicLink())
assert.equal(fs.realpathSync(BASE), BASE)
assert.equal(baseStat.uid, process.getuid())
const fixtures = []

const fixture = () => {
  const dir = fs.mkdtempSync(path.join(BASE, "readonly-input-"))
  fixtures.push(dir)
  return dir
}
const put = (root, relative, data) => {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
}
after(() => {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true })
})

const refusal = (run, code) => {
  try {
    run()
  } catch (error) {
    assert.ok(error instanceof ReadonlyInputError, `expected ReadonlyInputError, got ${error}`)
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    return error
  }
  assert.fail(`expected refusal ${code}`)
}

test("serves all five callbacks with defined results and no writers", () => {
  const root = fixture()
  put(root, "a.txt", "hello")
  put(root, "empty.txt", "")
  put(root, "bom.txt", "\uFEFFbom")
  put(root, "dir/inner.txt", "x")
  const input = createReadonlyInput({ roots: [root] })

  assert.deepEqual(Object.keys(input).sort(), ["directoryExists", "fileExists", "getAccessibleEntries", "readFile", "realpath", "report"])
  assert.equal("writeFile" in input, false)
  assert.equal("removeFile" in input, false)

  assert.equal(input.readFile(path.join(root, "a.txt")), "hello")
  assert.equal(input.readFile(path.join(root, "empty.txt")), "")
  assert.equal(input.readFile(path.join(root, "bom.txt")), "\uFEFFbom")
  assert.equal(input.readFile(path.join(root, "missing.txt")), null)
  assert.equal(input.readFile(path.join(root, "dir")), null)

  assert.equal(input.fileExists(path.join(root, "a.txt")), true)
  assert.equal(input.fileExists(path.join(root, "dir")), false)
  assert.equal(input.fileExists(path.join(root, "missing.txt")), false)
  assert.equal(input.directoryExists(path.join(root, "dir")), true)
  assert.equal(input.directoryExists(path.join(root, "a.txt")), false)
  assert.deepEqual(input.getAccessibleEntries(path.join(root, "dir")), { files: ["inner.txt"], directories: [] })
  assert.deepEqual(input.getAccessibleEntries(path.join(root, "a.txt")), { files: [], directories: [] })
  assert.deepEqual(input.getAccessibleEntries(path.join(root, "missing")), { files: [], directories: [] })
  assert.equal(input.realpath(path.join(root, "a.txt")), path.join(root, "a.txt"))
  assert.equal(input.realpath(path.join(root, "missing.txt")), path.join(root, "missing.txt"))
  assert.equal(typeof input.realpath(path.join(root, "missing.txt")), "string")
})

test("resolves relative paths against cwd and spans multiple roots", () => {
  const first = fixture()
  const second = fixture()
  put(first, "nested/rel.txt", "relative")
  put(second, "other.txt", "second root")
  const input = createReadonlyInput({ roots: [first, second], cwd: path.join(first, "nested") })

  assert.equal(input.readFile("rel.txt"), "relative")
  assert.equal(input.directoryExists("."), true)
  assert.equal(input.readFile(path.join(second, "other.txt")), "second root")
  assert.equal(input.readFile(path.join(first, "missing.txt")), null)
})

test("follows internal and cross-root symlinks", () => {
  const first = fixture()
  const second = fixture()
  put(first, "target.txt", "target")
  put(first, "realdir/x.txt", "x")
  put(second, "cross.txt", "cross")
  fs.symlinkSync(path.join(first, "target.txt"), path.join(first, "link.txt"))
  fs.symlinkSync(path.join(first, "realdir"), path.join(first, "dirlink"))
  fs.symlinkSync(path.join(second, "cross.txt"), path.join(first, "crosslink.txt"))

  const input = createReadonlyInput({ roots: [first, second] })
  assert.equal(input.readFile(path.join(first, "link.txt")), "target")
  assert.equal(input.directoryExists(path.join(first, "dirlink")), true)
  assert.deepEqual(input.getAccessibleEntries(path.join(first, "dirlink")), { files: ["x.txt"], directories: [] })
  assert.equal(input.readFile(path.join(first, "crosslink.txt")), "cross")
})

test("refuses symlink escapes and latches the adapter", () => {
  const root = fixture()
  const outside = fixture()
  put(root, "inside.txt", "in")
  put(outside, "secret.txt", "out")
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "escape.txt"))
  const input = createReadonlyInput({ roots: [root] })

  refusal(() => input.fileExists(path.join(root, "escape.txt")), "pathEscape")
  refusal(() => input.fileExists(path.join(root, "inside.txt")), "pathEscape")
  assert.equal(input.report().usage.failure, "pathEscape")
})

test("refuses symlink cycles", () => {
  const root = fixture()
  fs.symlinkSync(path.join(root, "b"), path.join(root, "a"))
  fs.symlinkSync(path.join(root, "a"), path.join(root, "b"))
  const input = createReadonlyInput({ roots: [root] })
  refusal(() => input.fileExists(path.join(root, "a")), "linkCycle")
})

test("refuses path escapes and malformed path inputs", () => {
  const root = fixture()
  put(root, "a.txt", "a")
  refusal(() => createReadonlyInput({ roots: [root] }).fileExists(".."), "pathEscape")
  refusal(() => createReadonlyInput({ roots: [root] }).fileExists("/etc/passwd"), "pathEscape")
  refusal(() => createReadonlyInput({ roots: [root] }).fileExists(""), "invalidPath")
  refusal(() => createReadonlyInput({ roots: [root] }).fileExists("a\0b"), "invalidPath")
  refusal(() => createReadonlyInput({ roots: [root] }).fileExists("x".repeat(5000)), "invalidPath")
})

test("validates roots and cwd at creation", () => {
  const root = fixture()
  const other = fixture()
  refusal(() => createReadonlyInput({ roots: [] }), "invalidRoots")
  refusal(() => createReadonlyInput({ roots: ["relative/path"] }), "invalidRoot")
  refusal(() => createReadonlyInput({ roots: [path.join(root, "missing")] }), "invalidRoot")
  fs.symlinkSync(root, path.join(other, "rootlink"))
  refusal(() => createReadonlyInput({ roots: [path.join(other, "rootlink")] }), "invalidRoot")
  refusal(() => createReadonlyInput({ roots: [root], cwd: other }), "cwdOutsideRoots")
})

test("detects root replacement and keeps the refusal latched", () => {
  const base = fixture()
  const root = path.join(base, "root")
  fs.mkdirSync(root)
  put(root, "a.txt", "a")
  const input = createReadonlyInput({ roots: [root] })
  assert.equal(input.fileExists(path.join(root, "a.txt")), true)

  fs.renameSync(root, path.join(base, "moved"))
  fs.mkdirSync(root)
  refusal(() => input.fileExists(path.join(root, "a.txt")), "rootChanged")
  refusal(() => input.directoryExists(root), "rootChanged")
})

test("refuses an oversized file by existence and read but still lists its name", () => {
  const root = fixture()
  put(root, "big.bin", Buffer.alloc(DEFAULT_LIMITS.maxFileBytes + 1, 0x61))
  put(root, "ok.txt", "ok")
  refusal(() => createReadonlyInput({ roots: [root] }).fileExists(path.join(root, "big.bin")), "fileTooLarge")
  refusal(() => createReadonlyInput({ roots: [root] }).readFile(path.join(root, "big.bin")), "fileTooLarge")
  const listing = createReadonlyInput({ roots: [root] }).getAccessibleEntries(root)
  assert.deepEqual(listing, { files: ["big.bin", "ok.txt"], directories: [] })
})

test("enforces the per-file boundary exactly under a reduced limit", () => {
  const root = fixture()
  put(root, "four.txt", "abcd")
  put(root, "five.txt", "abcde")
  const input = createReadonlyInput({ roots: [root], limits: { maxFileBytes: 4 } })
  assert.equal(input.readFile(path.join(root, "four.txt")), "abcd")
  refusal(() => input.readFile(path.join(root, "five.txt")), "fileTooLarge")
})

test("charges aggregate bytes across repeated reads and keeps the failure", () => {
  const root = fixture()
  put(root, "six.txt", "abcdef")
  const input = createReadonlyInput({ roots: [root], limits: { maxAggregateBytes: 10 } })
  assert.equal(input.readFile(path.join(root, "six.txt")), "abcdef")
  refusal(() => input.readFile(path.join(root, "six.txt")), "aggregateBudget")
  assert.equal(input.report().usage.aggregateBytes, 6)
  refusal(() => input.fileExists(path.join(root, "six.txt")), "aggregateBudget")
})

test("enforces the repeated-read budget before the shared callback budget", () => {
  const root = fixture()
  put(root, "a.txt", "a")
  const input = createReadonlyInput({ roots: [root], limits: { maxFiles: 2 } })
  assert.equal(input.readFile(path.join(root, "a.txt")), "a")
  assert.equal(input.readFile(path.join(root, "a.txt")), "a")
  refusal(() => input.readFile(path.join(root, "a.txt")), "fileBudget")
})

test("enforces the callback budget for non-read callbacks", () => {
  const root = fixture()
  put(root, "a.txt", "a")
  const input = createReadonlyInput({ roots: [root], limits: { maxFiles: 2 } })
  assert.equal(input.fileExists(path.join(root, "a.txt")), true)
  assert.equal(input.directoryExists(root), true)
  refusal(() => input.realpath(root), "callBudget")
})

test("enforces directory-entry and metadata budgets", () => {
  const entries = fixture()
  for (const name of ["a", "b", "c", "d"]) put(entries, name, name)
  refusal(() => createReadonlyInput({ roots: [entries], limits: { maxFiles: 3 } }).getAccessibleEntries(entries), "entryBudget")

  const long = fixture()
  put(long, "abcdef", "x")
  refusal(() => createReadonlyInput({ roots: [long], limits: { maxMetadataBytes: 5 } }).getAccessibleEntries(long), "metadataBudget")
})

test("counts link traversal against the shared entry budget", () => {
  const root = fixture()
  put(root, "target.txt", "t")
  for (const [name, target] of [["l4", "target.txt"], ["l3", "l4"], ["l2", "l3"], ["l1", "l2"]]) {
    fs.symlinkSync(path.join(root, target), path.join(root, name))
  }
  refusal(
    () => createReadonlyInput({ roots: [root], limits: { maxFiles: 3 } }).fileExists(path.join(root, "l1")),
    "entryBudget",
  )
})

test("enforces the cooperative deadline and cancellation", () => {
  const root = fixture()
  put(root, "a.txt", "a")
  let clock = 0
  const input = createReadonlyInput({ roots: [root], limits: { timeoutMs: 100 }, now: () => clock })
  assert.equal(input.fileExists(path.join(root, "a.txt")), true)
  clock = 1000
  refusal(() => input.fileExists(path.join(root, "a.txt")), "deadline")

  refusal(() => createReadonlyInput({ roots: [root], signal: AbortSignal.abort() }), "aborted")
  const controller = new AbortController()
  const cancelled = createReadonlyInput({ roots: [root], signal: controller.signal })
  controller.abort()
  refusal(() => cancelled.fileExists(path.join(root, "a.txt")), "aborted")
})

test("validates limits and cannot be widened through the caller's object", () => {
  const root = fixture()
  put(root, "ten.txt", "0123456789")
  refusal(() => createReadonlyInput({ roots: [root], limits: { nope: 1 } }), "unknownLimit")
  refusal(() => createReadonlyInput({ roots: [root], limits: { maxFiles: 0 } }), "invalidLimit")
  refusal(() => createReadonlyInput({ roots: [root], limits: { maxFiles: -1 } }), "invalidLimit")
  refusal(() => createReadonlyInput({ roots: [root], limits: { maxFiles: 1.5 } }), "invalidLimit")
  refusal(() => createReadonlyInput({ roots: [root], limits: { maxFiles: DEFAULT_LIMITS.maxFiles + 1 } }), "limitIncrease")

  const limits = { maxFileBytes: 4 }
  const input = createReadonlyInput({ roots: [root], limits })
  limits.maxFileBytes = 4096
  refusal(() => input.readFile(path.join(root, "ten.txt")), "fileTooLarge")
  assert.throws(() => {
    input.report().limits.maxFileBytes = 1
  }, TypeError)
})

test("bounds every read request by the remaining aggregate budget", () => {
  const root = fixture()
  put(root, "chunk.txt", Buffer.alloc(70000, 0x61))
  const wants = []
  const io = {
    readSync: (fd, buffer, offset, length, position) => {
      wants.push(length)
      return fs.readSync(fd, buffer, offset, length, position)
    },
  }
  const input = createReadonlyInput({ roots: [root], io, limits: { maxAggregateBytes: 70000 } })
  assert.equal(input.readFile(path.join(root, "chunk.txt")).length, 70000)
  assert.deepEqual(wants, [65536, 4464])
  assert.equal(input.report().usage.aggregateBytes, 70000)
})

test("refuses a file that grows between resolution and open", () => {
  const root = fixture()
  put(root, "grow.txt", "seed")
  const io = {
    openSync: (file, flags) => {
      fs.appendFileSync(file, "xx")
      return fs.openSync(file, flags)
    },
  }
  refusal(() => createReadonlyInput({ roots: [root], io }).readFile(path.join(root, "grow.txt")), "sourceMutated")
})

test("refuses a short read instead of returning partial content", () => {
  const root = fixture()
  put(root, "short.txt", "abc")
  let first = true
  const io = {
    readSync: (fd, buffer, offset) => {
      if (!first) return 0
      first = false
      buffer[offset] = 0x61
      return 1
    },
  }
  refusal(() => createReadonlyInput({ roots: [root], io }).readFile(path.join(root, "short.txt")), "shortRead")
})

test("refuses a file replaced while it is being read", () => {
  const root = fixture()
  put(root, "swap.txt", "original")
  const io = {
    openSync: (file, flags) => {
      const fd = fs.openSync(file, flags)
      fs.renameSync(file, `${file}.old`)
      fs.writeFileSync(file, "replacement")
      return fd
    },
  }
  refusal(() => createReadonlyInput({ roots: [root], io }).readFile(path.join(root, "swap.txt")), "sourceMutated")
})

test("refuses invalid UTF-8 instead of reporting a missing or lossy file", () => {
  const root = fixture()
  put(root, "bad.bin", Buffer.from([0xff, 0xfe, 0xfd]))
  refusal(() => createReadonlyInput({ roots: [root] }).readFile(path.join(root, "bad.bin")), "unsupportedEncoding")
})

test("reports usage and latches the first failure code", () => {
  const root = fixture()
  put(root, "a.txt", "a")
  const input = createReadonlyInput({ roots: [root] })
  assert.equal(input.report().usage.failure, null)
  assert.equal(input.readFile(path.join(root, "a.txt")), "a")
  assert.equal(input.report().usage.reads, 1)
  refusal(() => input.fileExists("../escape"), "pathEscape")
  assert.equal(input.report().usage.failure, "pathEscape")
  refusal(() => input.fileExists(path.join(root, "a.txt")), "pathEscape")
})

test("directory links are not silently relabelled as files during enumeration", () => {
  const root = fixture()
  put(root, "actual/entry.ts", "export {}")
  fs.symlinkSync("actual", path.join(root, "linked"))
  const input = createReadonlyInput({ roots: [root] })
  assert.deepEqual(input.getAccessibleEntries(root), { files: [], directories: ["actual", "linked"] })
})

test("a requested alias changed during acquisition cannot return the old target", () => {
  const root = fixture()
  put(root, "first.txt", "first")
  put(root, "other.txt", "other")
  const alias = path.join(root, "alias")
  fs.symlinkSync("first.txt", alias)
  const input = createReadonlyInput({ roots: [root], io: {
    readSync: (...args) => {
      const count = fs.readSync(...args)
      fs.unlinkSync(alias)
      fs.symlinkSync("other.txt", alias)
      return count
    },
  } })
  refusal(() => input.readFile(alias), "sourceMutated")
})

test("directory replacement during enumeration refuses instead of publishing stale entries", () => {
  const root = fixture()
  put(root, "dir/original.ts", "export {}")
  const input = createReadonlyInput({ roots: [root], io: {
    opendirSync: directory => {
      const opened = fs.opendirSync(directory)
      fs.renameSync(directory, `${directory}.old`)
      fs.mkdirSync(directory)
      put(directory, "replacement.ts", "export {}")
      return opened
    },
  } })
  refusal(() => input.getAccessibleEntries(path.join(root, "dir")), "sourceMutated")
})

test("unexpected read IO errors latch a typed refusal for every later callback", () => {
  const root = fixture()
  put(root, "file.ts", "export {}")
  const input = createReadonlyInput({ roots: [root], io: {
    readSync: () => { throw Object.assign(new Error("synthetic read failure"), { code: "EIO" }) },
  } })
  const first = refusal(() => input.readFile("file.ts"), "ioError")
  assert.throws(() => input.fileExists("file.ts"), error => error === first)
})

test("link metadata is refused before readlink would acquire beyond the remaining budget", () => {
  const root = fixture()
  put(root, "target.ts", "export {}")
  fs.symlinkSync("target.ts", path.join(root, "alias"))
  let reads = 0
  const input = createReadonlyInput({ roots: [root], limits: { maxMetadataBytes: 1 }, io: {
    readlinkSync: link => { reads++; return fs.readlinkSync(link) },
  } })
  refusal(() => input.fileExists("alias"), "metadataBudget")
  assert.equal(reads, 0, "metadata cap must apply before acquisition")
})

test("directory entry exhaustion refuses before acquiring an extra entry", () => {
  const root = fixture()
  put(root, "a", "a")
  put(root, "b", "b")
  let reads = 0
  const input = createReadonlyInput({ roots: [root], limits: { maxFiles: 1 }, io: {
    opendirSync: directory => {
      const opened = fs.opendirSync(directory)
      return { readSync: () => { reads++; return opened.readSync() }, closeSync: () => opened.closeSync() }
    },
  } })
  refusal(() => input.getAccessibleEntries(root), "entryBudget")
  assert.equal(reads, 1, "entry cap must apply before acquiring another record")
})

test("the exact deadline is exhausted rather than one final success window", () => {
  const root = fixture()
  put(root, "a", "a")
  let clock = 0
  const input = createReadonlyInput({ roots: [root], limits: { timeoutMs: 10 }, now: () => clock })
  clock = 10
  refusal(() => input.fileExists("a"), "deadline")
})

test("an ancestor rebound after opening is checked before the first content read", () => {
  const root = fixture()
  const outside = fixture()
  put(root, "dir/a", "allowed")
  put(outside, "a", "outside")
  let reads = 0
  const input = createReadonlyInput({ roots: [root], io: {
    openSync: (file, flags) => {
      const fd = fs.openSync(file, flags)
      fs.renameSync(path.join(root, "dir"), path.join(root, "dir.old"))
      fs.symlinkSync(outside, path.join(root, "dir"))
      return fd
    },
    readSync: (...args) => { reads++; return fs.readSync(...args) },
  } })
  assert.throws(() => input.readFile("dir/a"), ReadonlyInputError)
  assert.equal(reads, 0, "ancestor rebind must be detected before content acquisition")
})

test("a symlink to a file is listed as a file, not a directory", () => {
  const root = fixture()
  put(root, "file.ts", "export {}")
  fs.symlinkSync("file.ts", path.join(root, "flink"))
  const input = createReadonlyInput({ roots: [root] })
  assert.deepEqual(input.getAccessibleEntries(root), { files: ["file.ts", "flink"], directories: [] })
})

test("a dangling link entry refuses instead of hiding the input", () => {
  const root = fixture()
  fs.symlinkSync("missing.ts", path.join(root, "dangling"))
  refusal(() => createReadonlyInput({ roots: [root] }).getAccessibleEntries(root), "danglingEntry")
})

test("an escaping link entry refuses instead of hiding the input", () => {
  const root = fixture()
  const outside = fixture()
  put(outside, "secret.ts", "export {}")
  fs.symlinkSync(path.join(outside, "secret.ts"), path.join(root, "escape"))
  refusal(() => createReadonlyInput({ roots: [root] }).getAccessibleEntries(root), "pathEscape")
})

test("a non-regular directory entry refuses instead of hiding the input", () => {
  const root = fixture()
  const fifo = path.join(root, "pipe")
  const created = spawnSync("mkfifo", [fifo], { encoding: "utf8" })
  assert.equal(created.status, 0, created.stderr)
  refusal(() => createReadonlyInput({ roots: [root] }).getAccessibleEntries(root), "nonRegularEntry")
})

test("an external approved root replaced mid-run is refused", () => {
  const first = fixture()
  const base = fixture()
  const second = path.join(base, "second")
  fs.mkdirSync(second)
  put(second, "a.txt", "a")
  put(first, "b.txt", "b")
  const input = createReadonlyInput({ roots: [first, second] })
  assert.equal(input.readFile(path.join(second, "a.txt")), "a")
  fs.renameSync(second, path.join(base, "moved"))
  fs.mkdirSync(second)
  refusal(() => input.readFile(path.join(second, "a.txt")), "rootChanged")
})

test("an in-place write during the read is refused", () => {
  const root = fixture()
  const file = path.join(root, "grow.ts")
  put(root, "grow.ts", "export {}")
  const io = {
    readSync: (...args) => {
      const count = fs.readSync(...args)
      fs.appendFileSync(file, "//")
      return count
    },
  }
  refusal(() => createReadonlyInput({ roots: [root], io }).readFile(file), "sourceMutated")
})

test("reports exact per-file read and byte accounting", () => {
  const root = fixture()
  put(root, "three.ts", "abc")
  const input = createReadonlyInput({ roots: [root] })
  assert.equal(input.readFile(path.join(root, "three.ts")), "abc")
  const usage = input.report().usage
  assert.equal(usage.reads, 1)
  assert.equal(usage.aggregateBytes, 3)
  assert.equal(usage.failure, null)
})

test("content close finishing at the deadline cannot publish success", () => {
  const root = fixture()
  put(root, "a", "a")
  let clock = 0
  const input = createReadonlyInput({ roots: [root], now: () => clock, limits: { timeoutMs: 10 }, io: {
    closeSync: fd => { fs.closeSync(fd); clock = 10 },
  } })
  refusal(() => input.readFile("a"), "deadline")
})

test("cancellation during content close latches before returning a value", () => {
  const root = fixture()
  put(root, "a", "a")
  const controller = new AbortController()
  const input = createReadonlyInput({ roots: [root], signal: controller.signal, io: {
    closeSync: fd => { fs.closeSync(fd); controller.abort() },
  } })
  const first = refusal(() => input.readFile("a"), "aborted")
  assert.throws(() => input.fileExists("a"), error => error === first)
})

test("directory name metadata capacity is checked before acquiring a record", () => {
  const root = fixture()
  put(root, "long-name", "x")
  let reads = 0
  const input = createReadonlyInput({ roots: [root], limits: { maxMetadataBytes: 1 }, io: {
    opendirSync: (...args) => {
      const directory = fs.opendirSync(...args)
      return { readSync: () => { reads++; return directory.readSync() }, closeSync: () => directory.closeSync() }
    },
  } })
  refusal(() => input.getAccessibleEntries(root), "metadataBudget")
  assert.equal(reads, 0, "unknown-size dirent cannot be acquired beyond the remaining name budget")
})

test("in-place directory mutation while enumerating is not a stable input result", () => {
  const root = fixture()
  put(root, "a", "a")
  let changed = false
  const input = createReadonlyInput({ roots: [root], io: {
    opendirSync: (...args) => {
      const directory = fs.opendirSync(...args)
      return { readSync: () => {
        const entry = directory.readSync()
        if (!changed) { changed = true; put(root, "new-entry", "x") }
        return entry
      }, closeSync: () => directory.closeSync() }
    },
  } })
  refusal(() => input.getAccessibleEntries(root), "sourceMutated")
})

test("cross-root link resolution rechecks the origin root before publishing existence", () => {
  const base = fixture()
  const first = path.join(base, "first")
  fs.mkdirSync(first)
  const second = fixture()
  put(second, "a", "a")
  fs.symlinkSync(path.join(second, "a"), path.join(first, "alias"))
  let changed = false
  const input = createReadonlyInput({ roots: [first, second], io: {
    lstatSync: file => {
      const value = fs.lstatSync(file)
      if (!changed && file === path.join(second, "a")) {
        changed = true
        fs.renameSync(first, path.join(base, "moved"))
        fs.mkdirSync(first)
        fs.symlinkSync(path.join(second, "a"), path.join(first, "alias"))
      }
      return value
    },
  } })
  assert.throws(() => input.fileExists(path.join(first, "alias")), ReadonlyInputError)
})

test("directory names retain Unicode and refuse invalid UTF-8 instead of changing paths", () => {
  const valid = fixture()
  put(valid, "é-😀.ts", "export {}")
  assert.deepEqual(createReadonlyInput({ roots: [valid] }).getAccessibleEntries(valid), { files: ["é-😀.ts"], directories: [] })
  const invalid = fixture()
  fs.writeFileSync(Buffer.concat([Buffer.from(`${invalid}/`), Buffer.from([0xff])]), "x")
  refusal(() => createReadonlyInput({ roots: [invalid] }).getAccessibleEntries(invalid), "unsupportedEncoding")
})
