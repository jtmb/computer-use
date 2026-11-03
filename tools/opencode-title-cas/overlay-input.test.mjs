import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { createHash } from "node:crypto"
import { createOverlayInput, OverlayInputError } from "./overlay-input.mjs"

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex")

const fsError = (code) => {
  const error = new Error(code)
  error.code = code
  return error
}

const normalize = (value) => path.posix.normalize(value)

const createFakeFs = () => {
  const nodes = new Map()
  const handles = new Map()
  const directories = new Set()
  const calls = {
    lstat: 0,
    readlink: 0,
    open: 0,
    fstat: 0,
    read: 0,
    close: 0,
    opendir: 0,
    dirRead: 0,
    dirClose: 0,
    realpath: 0,
  }
  const openedPaths = []
  const readRequests = []
  const hooks = {}
  let nextFd = 1
  let nextIno = 1

  const statFor = (node) => {
    const size =
      node.kind === "file"
        ? node.content.length
        : node.kind === "symlink"
          ? Buffer.byteLength(node.target, "utf8")
          : node.kind === "dir"
            ? 4096
            : 0
    const mode =
      node.kind === "file" ? 0o100644 : node.kind === "dir" ? 0o040755 : node.kind === "symlink" ? 0o120777 : 0o060644
    return {
      dev: node.dev,
      ino: node.ino,
      mode,
      size,
      mtimeMs: node.mtimeMs,
      ctimeMs: node.ctimeMs,
      isFile: () => node.kind === "file",
      isDirectory: () => node.kind === "dir",
      isSymbolicLink: () => node.kind === "symlink",
    }
  }

  const addNode = (target, node) => {
    const absolute = normalize(target)
    if (!absolute.startsWith("/")) throw new Error("fixture paths must be absolute")
    if (absolute !== "/" && nodes.has(absolute)) throw new Error(`duplicate fixture path ${absolute}`)
    nodes.set(absolute, { dev: 7, ino: nextIno++, mtimeMs: 1000, ctimeMs: 1000, ...node })
    return absolute
  }

  const addDir = (target) => addNode(target, { kind: "dir" })
  const addFile = (target, text, extra = {}) => addNode(target, { kind: "file", content: Buffer.from(text, "utf8"), ...extra })
  const addSymlink = (target, linkTarget) => addNode(target, { kind: "symlink", target: linkTarget })
  const addSpecial = (target) => addNode(target, { kind: "special" })

  const nodeAt = (target) => nodes.get(normalize(target))

  const checkAncestors = (absolute) => {
    if (absolute === "/") return
    const segments = absolute.split("/").filter(Boolean)
    let current = "/"
    for (let index = 0; index < segments.length - 1; index += 1) {
      current = path.posix.join(current, segments[index])
      const node = nodes.get(current)
      if (!node) throw fsError("ENOENT")
      if (node.kind !== "dir") throw fsError("ENOTDIR")
    }
  }

  const resolve = (target, depth = 0) => {
    if (depth > 64) throw fsError("ELOOP")
    const absolute = normalize(target)
    if (absolute === "/") {
      if (!nodes.has("/")) throw fsError("ENOENT")
      return "/"
    }
    const segments = absolute.split("/").filter(Boolean)
    let current = "/"
    for (let index = 0; index < segments.length; index += 1) {
      const next = path.posix.join(current, segments[index])
      const node = nodes.get(next)
      if (!node) throw fsError("ENOENT")
      if (node.kind === "symlink") {
        const base = path.posix.dirname(next)
        const targetPath = node.target.startsWith("/") ? node.target : path.posix.join(base, node.target)
        const rest = segments.slice(index + 1)
        return resolve(rest.length === 0 ? targetPath : path.posix.join(targetPath, ...rest), depth + 1)
      }
      if (index < segments.length - 1 && node.kind !== "dir") throw fsError("ENOTDIR")
      current = next
    }
    return current
  }

  const lstatSync = (target) => {
    calls.lstat += 1
    if (hooks.lstat) hooks.lstat(target)
    const absolute = normalize(target)
    const node = nodes.get(absolute)
    if (!node) {
      checkAncestors(absolute)
      throw fsError("ENOENT")
    }
    return statFor(node)
  }

  const readlinkSync = (target) => {
    calls.readlink += 1
    if (hooks.readlink) {
      const override = hooks.readlink(target)
      if (override !== undefined) return override
    }
    const node = nodes.get(normalize(target))
    if (!node) throw fsError("ENOENT")
    if (node.kind !== "symlink") throw fsError("EINVAL")
    return node.target
  }

  const openSync = (target, flags) => {
    calls.open += 1
    const resolved = resolve(target)
    openedPaths.push(resolved)
    const node = nodes.get(resolved)
    if (!node) throw fsError("ENOENT")
    if (node.kind !== "file") throw fsError("EISDIR")
    const fd = nextFd
    nextFd += 1
    handles.set(fd, { resolved, node, position: 0 })
    if (hooks.open) hooks.open(resolved, flags)
    return fd
  }

  const fstatSync = (fd) => {
    calls.fstat += 1
    if (hooks.fstat) hooks.fstat(fd)
    const handle = handles.get(fd)
    if (!handle) throw fsError("EBADF")
    return statFor(handle.node)
  }

  const readSync = (fd, buffer, offset, length, position) => {
    calls.read += 1
    readRequests.push(length)
    if (hooks.read) hooks.read(fd, length, position)
    const handle = handles.get(fd)
    if (!handle) throw fsError("EBADF")
    if (hooks.overReturn) return length + 1
    const start = position
    const available = Math.max(0, handle.node.content.length - start)
    let count = Math.min(length, available)
    if (hooks.shortRead !== undefined) count = Math.max(0, Math.min(count, hooks.shortRead))
    if (count > 0) handle.node.content.copy(buffer, offset, start, start + count)
    return count
  }

  const closeSync = (fd) => {
    calls.close += 1
    if (hooks.close) hooks.close(fd)
    if (!handles.has(fd)) throw fsError("EBADF")
    handles.delete(fd)
    if (hooks.closeThrows) throw fsError("EIO")
  }

  const opendirSync = (target, flags) => {
    calls.opendir += 1
    const resolved = resolve(target)
    const node = nodes.get(resolved)
    if (!node) throw fsError("ENOENT")
    if (node.kind !== "dir") throw fsError("ENOTDIR")
    const prefix = resolved === "/" ? "/" : `${resolved}/`
    const names = []
    for (const candidate of nodes.keys()) {
      if (candidate === resolved || !candidate.startsWith(prefix)) continue
      const rest = candidate.slice(prefix.length)
      if (rest.length === 0 || rest.includes("/")) continue
      names.push(rest)
    }
    names.sort()
    const entries = names.map((name) => {
      const child = nodes.get(path.posix.join(resolved, name))
      return {
        name: Buffer.from(name, "utf8"),
        isFile: () => child.kind === "file",
        isDirectory: () => child.kind === "dir",
        isSymbolicLink: () => child.kind === "symlink",
      }
    })
    const handle = { resolved, entries, index: 0, closed: false }
    directories.add(handle)
    if (hooks.opendir) hooks.opendir(resolved, flags)
    return {
      readSync() {
        calls.dirRead += 1
        if (hooks.dirRead) hooks.dirRead(handle)
        if (handle.index >= handle.entries.length) return null
        const entry = handle.entries[handle.index]
        handle.index += 1
        return entry
      },
      closeSync() {
        calls.dirClose += 1
        if (hooks.dirClose) hooks.dirClose(handle)
        if (handle.closed) throw fsError("EBADF")
        handle.closed = true
        directories.delete(handle)
        if (hooks.dirCloseThrows) throw fsError("EIO")
      },
    }
  }

  const realpathSync = (target) => {
    calls.realpath += 1
    if (hooks.realpath) hooks.realpath(target)
    return resolve(target)
  }

  const provider = {
    lstatSync,
    readlinkSync,
    openSync,
    fstatSync,
    readSync,
    closeSync,
    opendirSync,
    realpathSync,
  }

  return {
    nodes,
    calls,
    openedPaths,
    readRequests,
    hooks,
    handles,
    directories,
    addDir,
    addFile,
    addSymlink,
    addSpecial,
    nodeAt,
    provider,
    remove(target) {
      nodes.delete(normalize(target))
    },
    mutate(target, changes) {
      const node = nodes.get(normalize(target))
      if (!node) throw new Error(`cannot mutate missing ${target}`)
      Object.assign(node, changes, { mtimeMs: node.mtimeMs + 1, ctimeMs: node.ctimeMs + 1 })
    },
    touch(target) {
      const node = nodes.get(normalize(target))
      if (!node) throw new Error(`cannot touch missing ${target}`)
      node.mtimeMs += 1
      node.ctimeMs += 1
    },
  }
}

const overlayFixture = () => {
  const io = createFakeFs()
  io.addDir("/repo")
  io.addFile("/repo/plain.txt", "plain")
  io.addDir("/repo/other")
  io.addFile("/repo/other/x.txt", "x")
  io.addDir("/repo/overlay")
  io.addFile("/repo/overlay/physical.txt", "physical")
  io.addDir("/repo/overlay/src")
  io.addFile("/repo/overlay/src/a.txt", "ORIGINAL")
  io.addDir("/repo/overlay/src/sub")
  io.addFile("/repo/overlay/src/sub/b.txt", "B")
  io.addSymlink("/repo/alias-file", "/repo/overlay/src/a.txt")

  const entries = [
    {
      path: "src/a.txt",
      kind: "source",
      original: { text: "ORIGINAL", sha256: sha256("ORIGINAL") },
      result: { text: "RESULT", sha256: sha256("RESULT") },
    },
    {
      path: "src/sub/b.txt",
      kind: "config",
      original: { text: "B", sha256: sha256("B") },
      result: { text: "B2", sha256: sha256("B2") },
    },
    {
      path: "gen/deep/new.txt",
      kind: "generated",
      original: { absent: true },
      result: { text: "NEW", sha256: sha256("NEW") },
    },
  ]

  return {
    io,
    options: (overrides = {}) => ({
      roots: ["/repo"],
      cwd: "/repo",
      overlay: { root: "/repo/overlay", entries },
      io: io.provider,
      limits: { timeoutMs: 10000 },
      ...overrides,
    }),
    entries,
  }
}

const thrown = (body) => {
  try {
    body()
  } catch (error) {
    return error
  }
  assert.fail("expected a refusal")
}

const expectOverlayError = (body, code) => {
  const error = thrown(body)
  assert.ok(error instanceof OverlayInputError)
  assert.equal(error.code, code)
  assert.ok(Object.isFrozen(error.detail))
  return error
}

test("basic overlay composition serves files, directories and merged entries", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())

  assert.ok(Object.isFrozen(input))
  assert.deepEqual(Object.keys(input).sort(), [
    "directoryExists",
    "fileExists",
    "getAccessibleEntries",
    "readFile",
    "realpath",
    "report",
  ])

  assert.equal(input.readFile("overlay/src/a.txt"), "RESULT")
  assert.equal(input.readFile("/repo/overlay/src/a.txt"), "RESULT")
  assert.equal(input.readFile("alias-file"), "RESULT")
  assert.equal(input.readFile("overlay/gen/deep/new.txt"), "NEW")
  assert.equal(input.readFile("overlay/physical.txt"), "physical")
  assert.equal(input.readFile("overlay/src/a.txt"), "RESULT")
  assert.equal(input.fileExists("overlay/src/a.txt"), true)
  assert.equal(input.fileExists("overlay/gen"), false)
  assert.equal(input.directoryExists("overlay/gen"), true)
  assert.equal(input.directoryExists("overlay/src/a.txt"), false)
  assert.equal(input.realpath("overlay/gen/deep/new.txt"), "/repo/overlay/gen/deep/new.txt")
  assert.equal(input.realpath("alias-file"), "/repo/overlay/src/a.txt")

  assert.equal(input.readFile("overlay/gen"), null)
  assert.equal(input.readFile("overlay/missing.txt"), null)

  const root = input.getAccessibleEntries("overlay")
  assert.deepEqual(root, {
    files: ["physical.txt"],
    directories: ["gen", "src"],
  })
  assert.ok(Object.isFrozen(root))
  assert.ok(Object.isFrozen(root.files))
  assert.ok(Object.isFrozen(root.directories))

  const src = input.getAccessibleEntries("overlay/src")
  assert.deepEqual(src, {
    files: ["a.txt"],
    directories: ["sub"],
  })

  assert.deepEqual(input.getAccessibleEntries("overlay/src/a.txt"), { files: [], directories: [] })
  assert.deepEqual(input.getAccessibleEntries("overlay/gen"), {
    files: [],
    directories: ["deep"],
  })

  const report = input.report()
  assert.equal(report.failure, null)
  assert.equal(report.flags.native, false)
  assert.equal(report.flags.provenance, "unverified")
  assert.equal(report.flags.fullGraph, "unverified")
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.usage))
  assert.ok(Object.isFrozen(report.base))
  assert.ok(Object.isFrozen(report.overlay))
})

const expectFactoryFailure = (options, code) => expectOverlayError(() => createOverlayInput(options), code)

test("rejects malformed options, roots, overlays, providers and limits without invoking getters", () => {
  const fixture = overlayFixture()
  const base = fixture.options()
  let getterCalls = 0

  const rootsAccessor = new Array(1)
  Object.defineProperty(rootsAccessor, 0, {
    enumerable: true,
    get() {
      getterCalls += 1
      return "/repo"
    },
  })
  const optionsGetter = { ...base }
  Object.defineProperty(optionsGetter, "roots", {
    enumerable: true,
    get() {
      getterCalls += 1
      return ["/repo"]
    },
  })
  const overlayGetter = { ...base, overlay: {} }
  Object.defineProperty(overlayGetter.overlay, "root", {
    enumerable: true,
    get() {
      getterCalls += 1
      return "/repo/overlay"
    },
  })
  const limitsGetter = {}
  Object.defineProperty(limitsGetter, "maxFiles", {
    enumerable: true,
    get() {
      getterCalls += 1
      return 10
    },
  })
  const ioMissing = { ...base.io }
  delete ioMissing.lstatSync
  const ioExtra = { ...base.io, extra: () => {} }
  const ioGetter = { ...base.io }
  Object.defineProperty(ioGetter, "openSync", {
    enumerable: true,
    get() {
      getterCalls += 1
      return base.io.openSync
    },
  })

  const cases = [
    [null, "invalidOptions"],
    [[], "invalidOptions"],
    [{ ...base, extra: 1 }, "invalidOptions"],
    [{ ...base, roots: [] }, "invalidRoots"],
    [{ ...base, roots: ["relative"] }, "invalidRoot"],
    [{ ...base, roots: ["/repo\\x"] }, "invalidRoot"],
    [{ ...base, roots: ["C:/repo"] }, "invalidRoot"],
    [{ ...base, roots: rootsAccessor }, "invalidRoots"],
    [{ ...base, overlay: null }, "invalidOverlay"],
    [{ ...base, overlay: { root: "/repo/overlay" } }, "invalidOverlay"],
    [{ ...base, overlay: { root: "/repo/overlay", entries: new Array(1) } }, "invalidEntries"],
    [optionsGetter, "invalidOptions"],
    [overlayGetter, "invalidOverlay"],
    [{ ...base, limits: null }, "invalidLimits"],
    [{ ...base, limits: { maxFiles: 0 } }, "invalidLimit"],
    [{ ...base, limits: { maxFiles: 10001 } }, "limitIncrease"],
    [{ ...base, limits: { maxFiles: "10" } }, "invalidLimit"],
    [{ ...base, limits: { unknown: 1 } }, "unknownLimit"],
    [{ ...base, limits: limitsGetter }, "invalidLimits"],
    [{ ...base, io: ioMissing }, "invalidIo"],
    [{ ...base, io: ioExtra }, "invalidIo"],
    [{ ...base, io: ioGetter }, "invalidIo"],
    [{ ...base, now: null }, "invalidClock"],
    [{ ...base, signal: 1 }, "invalidOptions"],
  ]

  for (const [options, code] of cases) expectFactoryFailure(options, code)
  assert.equal(getterCalls, 0)
})

test("rejects malformed callback paths before provider IO and latches the first refusal", () => {
  for (const bad of ["", "a\\b", "C:x", "bad\0", "\ud800"]) {
    const fixture = overlayFixture()
    const input = createOverlayInput(fixture.options())
    const callsBefore = { ...fixture.io.calls }
    const error = expectOverlayError(() => input.readFile(bad), "invalidPath")
    assert.equal(thrown(() => input.fileExists("overlay/src/a.txt")), error)
    assert.deepEqual(fixture.io.calls, callsBefore)
  }
})

test("rejects present and absent original mismatches with typed conflicts", () => {
  const absentButEmpty = overlayFixture()
  absentButEmpty.io.addFile("/repo/overlay/src/empty.txt", "")
  expectFactoryFailure(
    absentButEmpty.options({
      overlay: {
        root: "/repo/overlay",
        entries: [
          ...absentButEmpty.entries,
          {
            path: "src/empty.txt",
            kind: "generated",
            original: { absent: true },
            result: { text: "E", sha256: sha256("E") },
          },
        ],
      },
    }),
    "overlayConflict",
  )

  const missingPresent = overlayFixture()
  expectFactoryFailure(
    missingPresent.options({
      overlay: {
        root: "/repo/overlay",
        entries: [
          ...missingPresent.entries,
          {
            path: "src/missing.txt",
            kind: "source",
            original: { text: "", sha256: sha256("") },
            result: { text: "M", sha256: sha256("M") },
          },
        ],
      },
    }),
    "overlayConflict",
  )

  const wrongText = overlayFixture()
  expectFactoryFailure(
    wrongText.options({
      overlay: {
        root: "/repo/overlay",
        entries: wrongText.entries.map((entry) =>
          entry.path === "src/a.txt"
            ? { ...entry, original: { text: "WRONG", sha256: sha256("WRONG") } }
            : entry,
        ),
      },
    }),
    "originalMismatch",
  )

  const directoryFile = overlayFixture()
  directoryFile.io.addDir("/repo/overlay/src/dirfile")
  expectFactoryFailure(
    directoryFile.options({
      overlay: {
        root: "/repo/overlay",
        entries: [
          ...directoryFile.entries,
          {
            path: "src/dirfile",
            kind: "source",
            original: { text: "x", sha256: sha256("x") },
            result: { text: "y", sha256: sha256("y") },
          },
        ],
      },
    }),
    "overlayConflict",
  )

  const fileDirectory = overlayFixture()
  fileDirectory.io.addFile("/repo/overlay/genfile", "x")
  expectFactoryFailure(
    fileDirectory.options({
      overlay: {
        root: "/repo/overlay",
        entries: [
          ...fileDirectory.entries,
          {
            path: "genfile/child.txt",
            kind: "generated",
            original: { absent: true },
            result: { text: "g", sha256: sha256("g") },
          },
        ],
      },
    }),
    "overlayConflict",
  )

  const symlinkFile = overlayFixture()
  symlinkFile.io.addSymlink("/repo/overlay/src/link.txt", "/repo/overlay/src/a.txt")
  expectFactoryFailure(
    symlinkFile.options({
      overlay: {
        root: "/repo/overlay",
        entries: [
          ...symlinkFile.entries,
          {
            path: "src/link.txt",
            kind: "source",
            original: { text: "ORIGINAL", sha256: sha256("ORIGINAL") },
            result: { text: "L", sha256: sha256("L") },
          },
        ],
      },
    }),
    "overlayAlias",
  )
})

test("binds only canonical, approved overlay roots", () => {
  const fileRoot = overlayFixture()
  expectFactoryFailure(fileRoot.options({ overlay: { root: "/repo/plain.txt", entries: fileRoot.entries } }), "overlayConflict")

  const outside = overlayFixture()
  outside.io.addDir("/outside")
  expectFactoryFailure(outside.options({ overlay: { root: "/outside", entries: outside.entries } }), "pathEscape")

  const symlinkRoot = overlayFixture()
  symlinkRoot.io.addSymlink("/repo/overlay-link", "/repo/overlay")
  expectFactoryFailure(
    symlinkRoot.options({ overlay: { root: "/repo/overlay-link", entries: symlinkRoot.entries } }),
    "overlayConflict",
  )

  const nonCanonical = overlayFixture()
  expectFactoryFailure(
    nonCanonical.options({ overlay: { root: "/repo/overlay/", entries: nonCanonical.entries } }),
    "invalidOverlayRoot",
  )
})

test("merges physical and virtual entries with sorted unique names and truthful link classification", () => {
  const fixture = overlayFixture()
  const longName = "L".repeat(3000)
  fixture.io.addFile(`/repo/overlay/${longName}`, "long")
  fixture.io.addSymlink("/repo/overlay/link-file", "/repo/overlay/src/a.txt")
  fixture.io.addSymlink("/repo/overlay/link-dir", "/repo/overlay/src")
  const input = createOverlayInput(fixture.options())

  const root = input.getAccessibleEntries("overlay")
  assert.deepEqual(root.files, [longName, "link-file", "physical.txt"].sort())
  assert.deepEqual(root.directories, ["gen", "link-dir", "src"].sort())
  assert.deepEqual(input.getAccessibleEntries("overlay/link-dir"), {
    files: ["a.txt"],
    directories: ["sub"],
  })
  assert.equal(input.readFile("overlay/link-file"), "RESULT")
})

test("refuses escaping, dangling and special physical entries instead of hiding them", () => {
  const escape = overlayFixture()
  escape.io.addSymlink("/repo/overlay/escape", "/etc")
  const escapeInput = createOverlayInput(escape.options())
  expectOverlayError(() => escapeInput.getAccessibleEntries("overlay"), "pathEscape")

  const dangling = overlayFixture()
  dangling.io.addSymlink("/repo/overlay/dangling", "/repo/missing")
  const danglingInput = createOverlayInput(dangling.options())
  expectOverlayError(() => danglingInput.getAccessibleEntries("overlay"), "danglingEntry")

  const special = overlayFixture()
  special.io.addSpecial("/repo/overlay/fifo")
  const specialInput = createOverlayInput(special.options())
  expectOverlayError(() => specialInput.getAccessibleEntries("overlay"), "nonRegularEntry")
})

test("serves Unicode overlay paths and directory names losslessly", () => {
  const fixture = overlayFixture()
  fixture.io.addDir("/repo/overlay/über")
  fixture.io.addFile("/repo/overlay/über/naïve.txt", "Ü")
  const entries = [
    ...fixture.entries,
    {
      path: "über/naïve.txt",
      kind: "source",
      original: { text: "Ü", sha256: sha256("Ü") },
      result: { text: "R", sha256: sha256("R") },
    },
    {
      path: "新/deep.txt",
      kind: "generated",
      original: { absent: true },
      result: { text: "N", sha256: sha256("N") },
    },
  ]
  const input = createOverlayInput(fixture.options({ overlay: { root: "/repo/overlay", entries } }))
  assert.equal(input.readFile("overlay/über/naïve.txt"), "R")
  assert.equal(input.readFile("overlay/新/deep.txt"), "N")
  assert.deepEqual(input.getAccessibleEntries("overlay/über"), {
    files: ["naïve.txt"],
    directories: [],
  })
})

test("constructor and callbacks share one content allowance", () => {
  const fixture = overlayFixture()
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const limit = usage.contentBytes + Buffer.byteLength("RESULT")
  const input = createOverlayInput(
    fixture.options({ limits: { timeoutMs: 10000, maxAggregateBytes: limit } }),
  )
  assert.equal(input.readFile("overlay/src/a.txt"), "RESULT")
  expectOverlayError(() => input.readFile("overlay/src/a.txt"), "aggregateBudget")
  assert.equal(input.report().failure, "aggregateBudget")
  assert.equal(input.report().usage.contentBytes, limit)
})

test("constructor and callbacks share one logical unit allowance", () => {
  const fixture = overlayFixture()
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const input = createOverlayInput(fixture.options({ limits: { timeoutMs: 10000, maxFiles: usage.units + 2 } }))
  assert.equal(input.fileExists("overlay/src/a.txt"), true)
  assert.equal(input.directoryExists("overlay/gen"), true)
  expectOverlayError(() => input.fileExists("overlay/src/a.txt"), "unitBudget")
  assert.equal(input.report().failure, "unitBudget")
})

test("metadata headroom is checked before directory name acquisition", () => {
  const fixture = overlayFixture()
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const input = createOverlayInput(
    fixture.options({ limits: { timeoutMs: 10000, maxMetadataBytes: usage.metadataBytes + 2000 } }),
  )
  const dirReadBefore = fixture.io.calls.dirRead
  expectOverlayError(() => input.getAccessibleEntries("overlay"), "metadataBudget")
  assert.equal(fixture.io.calls.dirRead, dirReadBefore)
  assert.equal(input.report().failure, "metadataBudget")
})

test("content capacity is checked before physical readSync", () => {
  const fixture = overlayFixture()
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const input = createOverlayInput(
    fixture.options({ limits: { timeoutMs: 10000, maxAggregateBytes: usage.contentBytes } }),
  )
  const readBefore = fixture.io.calls.read
  expectOverlayError(() => input.readFile("plain.txt"), "aggregateBudget")
  assert.equal(fixture.io.calls.read, readBefore)
  assert.equal(fixture.io.handles.size, 0)
})

test("unit capacity is checked before physical open and readlink acquisition", () => {
  const fixture = overlayFixture()
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const input = createOverlayInput(fixture.options({ limits: { timeoutMs: 10000, maxFiles: usage.units + 1 } }))
  const openBefore = fixture.io.calls.open
  const openError = thrown(() => input.readFile("plain.txt"))
  assert.ok(openError instanceof OverlayInputError)
  assert.ok(["unitBudget", "callBudget"].includes(openError.code))
  assert.equal(fixture.io.calls.open, openBefore)

  const linkFixture = overlayFixture()
  const linkProbe = createOverlayInput(linkFixture.options())
  const linkUsage = linkProbe.report().usage
  const linkInput = createOverlayInput(
    linkFixture.options({ limits: { timeoutMs: 10000, maxFiles: linkUsage.units + 1 } }),
  )
  const readlinkBefore = linkFixture.io.calls.readlink
  const linkError = thrown(() => linkInput.readFile("alias-file"))
  assert.ok(linkError instanceof OverlayInputError)
  assert.ok(["unitBudget", "callBudget"].includes(linkError.code))
  assert.equal(linkFixture.io.calls.readlink, readlinkBefore)
})

test("EOF directory reads still consume a unit and empty inventories are concrete", () => {
  const fixture = overlayFixture()
  fixture.io.addDir("/repo/empty")
  const input = createOverlayInput(fixture.options())
  const before = input.report().usage.units
  const result = input.getAccessibleEntries("empty")
  assert.deepEqual(result, { files: [], directories: [] })
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.files))
  assert.ok(Object.isFrozen(result.directories))
  assert.equal(fixture.io.calls.dirRead, 1)
  // One public call, one temporary component watch, and the EOF read each consume a unit.
  assert.equal(input.report().usage.units - before, 1 + 1 + 1)
})

test("the injected clock expires the shared lifetime across constructor and callbacks", t => {
  const fixture = overlayFixture()
  // Isolate the injected-ledger assertion from the separate real-wall-clock guard.
  t.mock.method(performance, "now", () => 0)
  let time = 0
  const input = createOverlayInput(
    fixture.options({ now: () => time, limits: { timeoutMs: 10 } }),
  )
  time = 100
  expectOverlayError(() => input.fileExists("overlay/src/a.txt"), "deadline")
  assert.equal(input.report().failure, "deadline")
})

test("the wall-clock guard expires even when the injected ledger clock remains fixed", t => {
  const fixture = overlayFixture()
  let wallTime = 0
  t.mock.method(performance, "now", () => wallTime)
  const input = createOverlayInput(fixture.options({ now: () => 0, limits: { timeoutMs: 10 } }))
  wallTime = 10
  expectOverlayError(() => input.fileExists("overlay/src/a.txt"), "deadline")
  assert.equal(input.report().failure, "deadline")
})

test("cancellation is sticky and report remains hook-free", () => {
  const fixture = overlayFixture()
  const controller = new AbortController()
  const input = createOverlayInput(fixture.options({ signal: controller.signal }))
  controller.abort()
  const callsBefore = { ...fixture.io.calls }
  const error = expectOverlayError(() => input.fileExists("overlay/src/a.txt"), "aborted")
  assert.equal(thrown(() => input.readFile("overlay/src/a.txt")), error)
  assert.deepEqual(fixture.io.calls, callsBefore)
  const report = input.report()
  assert.equal(report.failure, "aborted")
  assert.deepEqual(fixture.io.calls, callsBefore)
  assert.ok(Object.isFrozen(report.base.roots))
})

test("report after failure reads neither the clock nor the signal", () => {
  const fixture = overlayFixture()
  let aborted = false
  let signalReads = 0
  let clockCalls = 0
  const signal = {
    get aborted() {
      signalReads += 1
      return aborted
    },
  }
  const input = createOverlayInput(
    fixture.options({ signal, now: () => { clockCalls += 1; return 0 } }),
  )
  aborted = true
  expectOverlayError(() => input.fileExists("overlay/src/a.txt"), "aborted")
  const readsAfterFailure = signalReads
  const clocksAfterFailure = clockCalls
  const report = input.report()
  assert.equal(report.failure, "aborted")
  assert.equal(signalReads, readsAfterFailure)
  assert.equal(clockCalls, clocksAfterFailure)
})


test("detects watched root, original, missing-ancestor and kind changes before callbacks", () => {
  const rootChange = overlayFixture()
  const rootInput = createOverlayInput(rootChange.options())
  rootChange.io.touch("/repo")
  const openBefore = rootChange.io.calls.open
  expectOverlayError(() => rootInput.readFile("plain.txt"), "sourceMutated")
  assert.equal(rootChange.io.calls.open, openBefore)

  const originalChange = overlayFixture()
  const originalInput = createOverlayInput(originalChange.options())
  originalChange.io.mutate("/repo/overlay/src/a.txt", { content: Buffer.from("CHANGED") })
  expectOverlayError(() => originalInput.fileExists("overlay/src/a.txt"), "sourceMutated")

  const appearance = overlayFixture()
  const appearanceInput = createOverlayInput(appearance.options())
  appearance.io.addDir("/repo/overlay/gen")
  expectOverlayError(() => appearanceInput.fileExists("overlay/gen/deep/new.txt"), "sourceMutated")

  const kindChange = overlayFixture()
  const kindInput = createOverlayInput(kindChange.options())
  kindChange.io.mutate("/repo/overlay/src", { kind: "file", content: Buffer.from("x") })
  expectOverlayError(() => kindInput.fileExists("overlay/src/a.txt"), "sourceMutated")
})

test("a mutation during a callback refuses rather than returning stale output", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  fixture.io.hooks.read = () => {
    fixture.io.touch("/repo/overlay/src/a.txt")
  }
  expectOverlayError(() => input.readFile("plain.txt"), "sourceMutated")
})

test("a mutation during constructor binding refuses the factory", () => {
  const fixture = overlayFixture()
  fixture.io.hooks.read = () => {
    fixture.io.touch("/repo/overlay/src/a.txt")
  }
  expectFactoryFailure(fixture.options(), "sourceMutated")
})

test("short and over-returning physical reads refuse without refunding requested content", () => {
  const short = overlayFixture()
  const shortInput = createOverlayInput(short.options())
  short.io.hooks.shortRead = 0
  const shortBefore = shortInput.report().usage.contentBytes
  expectOverlayError(() => shortInput.readFile("plain.txt"), "shortRead")
  assert.equal(shortInput.report().usage.contentBytes - shortBefore, 5)
  assert.equal(short.io.handles.size, 0)

  const over = overlayFixture()
  const overInput = createOverlayInput(over.options())
  over.io.hooks.overReturn = true
  const overBefore = overInput.report().usage.contentBytes
  expectOverlayError(() => overInput.readFile("plain.txt"), "ioError")
  assert.equal(overInput.report().usage.contentBytes - overBefore, 5)
  assert.equal(over.io.handles.size, 0)
})

test("directory failures close the directory handle", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  fixture.io.hooks.dirRead = () => {
    throw fsError("EIO")
  }
  expectOverlayError(() => input.getAccessibleEntries("overlay"), "ioError")
  assert.equal(fixture.io.directories.size, 0)
})

test("oversized physical originals refuse before content open even when the overlay declares tiny text", () => {
  const fixture = overlayFixture()
  const hugePath = "/repo/overlay/src/huge.txt"
  fixture.io.addFile(hugePath, Buffer.alloc(5_850_000, 0x61))
  const entries = [
    ...fixture.entries,
    {
      path: "src/huge.txt",
      kind: "source",
      original: { text: "tiny", sha256: sha256("tiny") },
      result: { text: "t", sha256: sha256("t") },
    },
  ]
  expectFactoryFailure(
    fixture.options({ limits: { timeoutMs: 10000, maxFileBytes: 1024 }, overlay: { root: "/repo/overlay", entries } }),
    "fileTooLarge",
  )
  assert.ok(!fixture.io.openedPaths.includes(hugePath))
})

test("a caught reentrant public call during open refuses and closes the fd", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  let nested = null
  fixture.io.hooks.open = (resolved) => {
    if (resolved === "/repo/plain.txt") {
      try {
        input.fileExists("overlay/src/a.txt")
      } catch (error) {
        nested = error
      }
    }
  }

  const error = thrown(() => input.readFile("plain.txt"))
  assert.ok(error instanceof OverlayInputError)
  assert.equal(error.code, "reentrant")
  assert.equal(error, nested)
  assert.equal(fixture.io.handles.size, 0)

  const callsAfter = { ...fixture.io.calls }
  assert.equal(thrown(() => input.fileExists("overlay/src/a.txt")), error)
  assert.deepEqual(fixture.io.calls, callsAfter)
  const report = input.report()
  assert.equal(report.failure, "reentrant")
  assert.deepEqual(fixture.io.calls, callsAfter)
})

test("a caught reentrant public call from the clock or signal refuses the outer callback", () => {
  const fixture = overlayFixture()
  let input = null
  let armed = false
  let nested = null
  const now = () => {
    if (armed) {
      armed = false
      try {
        input.fileExists("overlay/src/a.txt")
      } catch (error) {
        nested = error
      }
    }
    return 0
  }
  input = createOverlayInput(fixture.options({ now }))
  armed = true
  const clockError = thrown(() => input.fileExists("overlay/src/a.txt"))
  assert.ok(clockError instanceof OverlayInputError)
  assert.equal(clockError.code, "reentrant")
  assert.equal(clockError, nested)

  const signalFixture = overlayFixture()
  let signalInput = null
  let signalArmed = false
  let signalNested = null
  const signal = {
    get aborted() {
      if (signalArmed) {
        signalArmed = false
        try {
          signalInput.fileExists("overlay/src/a.txt")
        } catch (error) {
          signalNested = error
        }
      }
      return false
    },
  }
  signalInput = createOverlayInput(signalFixture.options({ signal }))
  signalArmed = true
  const signalError = thrown(() => signalInput.fileExists("overlay/src/a.txt"))
  assert.ok(signalError instanceof OverlayInputError)
  assert.equal(signalError.code, "reentrant")
  assert.equal(signalError, signalNested)
})

test("all public responses are concrete and arrays are freshly frozen", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  assert.equal(typeof input.realpath("overlay/src/a.txt"), "string")
  assert.equal(typeof input.fileExists("overlay/src/a.txt"), "boolean")
  assert.equal(typeof input.directoryExists("overlay/src"), "boolean")
  assert.equal(input.readFile("overlay/gen"), null)
  assert.equal(input.readFile("overlay/missing"), null)
  const first = input.getAccessibleEntries("overlay")
  const second = input.getAccessibleEntries("overlay")
  assert.notEqual(first, second)
  assert.notEqual(first.files, second.files)
  assert.notEqual(first.directories, second.directories)
  assert.throws(() => {
    first.files.push("mutation")
  }, TypeError)
  assert.throws(() => {
    first.directories[0] = "mutation"
  }, TypeError)
})

test("normalizes dot segments but refuses callback escapes", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  assert.equal(input.readFile("./overlay/src/../src/a.txt"), "RESULT")
  assert.equal(input.readFile("/repo/../repo/overlay/src/a.txt"), "RESULT")
  expectOverlayError(() => input.readFile("../outside"), "pathEscape")
})

test("all namespace callbacks resolve aliases and missing paths concretely", () => {
  const fixture = overlayFixture()
  fixture.io.addSymlink("/repo/alias-dir", "/repo/overlay/src")
  const input = createOverlayInput(fixture.options())

  assert.equal(input.fileExists("alias-file"), true)
  assert.equal(input.directoryExists("alias-dir"), true)
  assert.equal(input.fileExists("alias-dir"), false)
  assert.equal(input.directoryExists("alias-file"), false)
  assert.equal(input.realpath("alias-dir"), "/repo/overlay/src")
  assert.deepEqual(input.getAccessibleEntries("alias-dir"), {
    files: ["a.txt"],
    directories: ["sub"],
  })
  assert.equal(input.fileExists("overlay/missing"), false)
  assert.equal(input.directoryExists("overlay/missing"), false)
  assert.equal(input.realpath("overlay/missing"), "/repo/overlay/missing")
  assert.equal(input.readFile("overlay/missing"), null)
  assert.deepEqual(input.getAccessibleEntries("overlay/missing"), { files: [], directories: [] })
  assert.deepEqual(input.getAccessibleEntries("plain.txt"), { files: [], directories: [] })
})

test("readlink refuses targets that exceed the reserved lstat size or lose text", () => {
  const longer = overlayFixture()
  const longerInput = createOverlayInput(longer.options())
  longer.io.hooks.readlink = () => "/repo/overlay/src/a.txt-EXTRA"
  expectOverlayError(() => longerInput.readFile("alias-file"), "sourceMutated")
  assert.equal(longer.io.calls.readlink, 1)

  const invalid = overlayFixture()
  const invalidInput = createOverlayInput(invalid.options())
  invalid.io.hooks.readlink = () => "/repo/overlay\\bad"
  expectOverlayError(() => invalidInput.readFile("alias-file"), "invalidLink")
})

test("zero metadata headroom refuses even an EOF directory read", () => {
  const fixture = overlayFixture()
  fixture.io.addDir("/repo/empty")
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const input = createOverlayInput(
    fixture.options({ limits: { timeoutMs: 10000, maxMetadataBytes: usage.metadataBytes + 2000 } }),
  )
  const dirReadBefore = fixture.io.calls.dirRead
  expectOverlayError(() => input.getAccessibleEntries("empty"), "metadataBudget")
  assert.equal(fixture.io.calls.dirRead, dirReadBefore)
})

test("directory metadata accounts actual name bytes rather than a fixed name reservation", () => {
  const fixture = overlayFixture()
  fixture.io.addDir("/repo/names")
  fixture.io.addFile("/repo/names/a", "")
  fixture.io.addFile("/repo/names/bb", "")
  const input = createOverlayInput(fixture.options())
  const before = input.report().usage.metadataBytes
  const entries = input.getAccessibleEntries("names")
  assert.deepEqual(entries.files, ["a", "bb"])
  const after = input.report().usage.metadataBytes
  const temporaryWatch = 128 + Buffer.byteLength("/repo/names")
  assert.equal(after - before - temporaryWatch, 1 + 2)
  assert.equal(input.report().base.usage.metadataBytes, 1 + 2)
})

test("a close-time mutation is caught after the callback and the handle is closed", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  fixture.io.hooks.close = () => {
    fixture.io.touch("/repo/overlay/src/a.txt")
  }
  expectOverlayError(() => input.readFile("plain.txt"), "sourceMutated")
  assert.equal(fixture.io.handles.size, 0)
})

test("a caught reentrant public call during opendir refuses and closes the directory", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  let nested = null
  fixture.io.hooks.opendir = (resolved) => {
    if (resolved === "/repo/overlay") {
      try {
        input.fileExists("overlay/src/a.txt")
      } catch (error) {
        nested = error
      }
    }
  }
  const error = thrown(() => input.getAccessibleEntries("overlay"))
  assert.ok(error instanceof OverlayInputError)
  assert.equal(error.code, "reentrant")
  assert.equal(error, nested)
  assert.equal(fixture.io.directories.size, 0)
})

test("constructor startup refuses deadline and cancellation during preparation", () => {
  const deadlineFixture = overlayFixture()
  let clockCalls = 0
  expectFactoryFailure(
    deadlineFixture.options({
      now: () => {
        clockCalls += 1
        return clockCalls === 1 ? 0 : 100
      },
      limits: { timeoutMs: 10 },
    }),
    "deadline",
  )

  const abortFixture = overlayFixture()
  const controller = new AbortController()
  expectFactoryFailure(
    abortFixture.options({
      now: () => {
        controller.abort()
        return 0
      },
      signal: controller.signal,
    }),
    "aborted",
  )

  const alreadyCancelled = overlayFixture()
  const cancelled = new AbortController()
  cancelled.abort()
  expectFactoryFailure(alreadyCancelled.options({ signal: cancelled.signal }), "aborted")
})

test("rejects symbol, inherited and accessor array/provider shapes", () => {
  const fixture = overlayFixture()
  const base = fixture.options()
  const entriesAccessor = new Array(1)
  Object.defineProperty(entriesAccessor, 0, {
    enumerable: true,
    get() {
      return fixture.entries[0]
    },
  })
  const entriesSymbol = [...fixture.entries]
  entriesSymbol[Symbol("extra")] = true
  const ioInherited = Object.create(base.io)
  const ioSymbol = { ...base.io, [Symbol("extra")]: () => {} }
  const customOptions = Object.assign(Object.create({ inherited: true }), base)

  expectFactoryFailure(
    { ...base, overlay: { root: "/repo/overlay", entries: entriesAccessor } },
    "invalidEntries",
  )
  expectFactoryFailure(
    { ...base, overlay: { root: "/repo/overlay", entries: entriesSymbol } },
    "invalidEntries",
  )
  expectFactoryFailure({ ...base, io: ioInherited }, "invalidIo")
  expectFactoryFailure({ ...base, io: ioSymbol }, "invalidIo")
  expectFactoryFailure(customOptions, "invalidOptions")
})

test("serves config replacements and distinguishes empty physical files from absence", () => {
  const fixture = overlayFixture()
  fixture.io.addFile("/repo/empty.txt", "")
  const input = createOverlayInput(fixture.options())
  assert.equal(input.readFile("overlay/src/sub/b.txt"), "B2")
  assert.equal(input.readFile("empty.txt"), "")
  assert.equal(input.fileExists("empty.txt"), true)
  assert.equal(input.readFile("no-such.txt"), null)
  assert.equal(input.fileExists("no-such.txt"), false)
  assert.equal(input.directoryExists("no-such.txt"), false)
})

test("a missing ancestor appearing during constructor binding refuses the factory", () => {
  const fixture = overlayFixture()
  fixture.io.hooks.read = () => {
    if (!fixture.io.nodeAt("/repo/overlay/gen")) fixture.io.addDir("/repo/overlay/gen")
  }
  expectFactoryFailure(fixture.options(), "sourceMutated")
})

test("clock and signal reentry errors remain the exact sticky first error", () => {
  const clockFixture = overlayFixture()
  let clockInput = null
  let clockArmed = false
  let clockNested = null
  const now = () => {
    if (clockArmed) {
      clockArmed = false
      try {
        clockInput.fileExists("overlay/src/a.txt")
      } catch (error) {
        clockNested = error
      }
    }
    return 0
  }
  clockInput = createOverlayInput(clockFixture.options({ now }))
  clockArmed = true
  const clockError = thrown(() => clockInput.fileExists("overlay/src/a.txt"))
  const clockCalls = { ...clockFixture.io.calls }
  assert.equal(thrown(() => clockInput.readFile("overlay/src/a.txt")), clockError)
  assert.deepEqual(clockFixture.io.calls, clockCalls)

  const signalFixture = overlayFixture()
  let signalInput = null
  let signalArmed = false
  let signalNested = null
  const signal = {
    get aborted() {
      if (signalArmed) {
        signalArmed = false
        try {
          signalInput.fileExists("overlay/src/a.txt")
        } catch (error) {
          signalNested = error
        }
      }
      return false
    },
  }
  signalInput = createOverlayInput(signalFixture.options({ signal }))
  signalArmed = true
  const signalError = thrown(() => signalInput.fileExists("overlay/src/a.txt"))
  const signalCalls = { ...signalFixture.io.calls }
  assert.equal(thrown(() => signalInput.readFile("overlay/src/a.txt")), signalError)
  assert.deepEqual(signalFixture.io.calls, signalCalls)
  assert.equal(clockNested, clockError)
  assert.equal(signalNested, signalError)
})

test("report is allowed during an active callback and remains hook-free", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  let observed = null
  fixture.io.hooks.open = (resolved) => {
    if (resolved === "/repo/plain.txt") observed = input.report()
  }
  assert.equal(input.readFile("plain.txt"), "plain")
  assert.ok(observed)
  assert.equal(observed.failure, null)
  assert.ok(Object.isFrozen(observed))
  assert.ok(Object.isFrozen(observed.flags))
})

test("an empty overlay still serves the physical root namespace", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options({ overlay: { root: "/repo/overlay", entries: [] } }))
  assert.equal(input.readFile("overlay"), null)
  assert.equal(input.fileExists("overlay"), false)
  assert.equal(input.directoryExists("overlay"), true)
  assert.equal(input.realpath("overlay"), "/repo/overlay")
  assert.deepEqual(input.getAccessibleEntries("overlay"), {
    files: ["physical.txt"],
    directories: ["src"],
  })
})

test("a file that grows after lstat is refused at fstat before buffer allocation and is closed", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options({ limits: { timeoutMs: 10000, maxFileBytes: 1024 } }))
  fixture.io.hooks.open = (resolved) => {
    if (resolved === "/repo/plain.txt") {
      fixture.io.mutate("/repo/plain.txt", { content: Buffer.alloc(3000, 0x61) })
    }
  }
  const readBefore = fixture.io.calls.read
  expectOverlayError(() => input.readFile("plain.txt"), "fileTooLarge")
  assert.equal(fixture.io.calls.read, readBefore)
  assert.equal(fixture.io.handles.size, 0)
})

test("an oversized directory name is refused without returning the entry", () => {
  const fixture = overlayFixture()
  fixture.io.addDir("/repo/longdir")
  fixture.io.addFile(`/repo/longdir/${"N".repeat(17000)}`, "")
  const input = createOverlayInput(fixture.options())
  expectOverlayError(() => input.getAccessibleEntries("longdir"), "metadataBudget")
  assert.equal(fixture.io.directories.size, 0)
})

test("source and config originals must be present before physical binding", () => {
  const fixture = overlayFixture()
  expectFactoryFailure(
    fixture.options({
      overlay: {
        root: "/repo/overlay",
        entries: [
          {
            path: "src/absent-source.txt",
            kind: "source",
            original: { absent: true },
            result: { text: "x", sha256: sha256("x") },
          },
        ],
      },
    }),
    "originalRequired",
  )
})

test("a non-function provider method is refused rather than falling back", () => {
  const fixture = overlayFixture()
  expectFactoryFailure({ ...fixture.options(), io: { ...fixture.io.provider, readSync: 1 } }, "invalidIo")
})

test("report freezes nested base roots and flags", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options())
  const report = input.report()
  assert.ok(Object.isFrozen(report.base.roots))
  assert.ok(Object.isFrozen(report.base.roots[0]))
  assert.ok(Object.isFrozen(report.flags))
  assert.equal(report.flags.pin, false)
  assert.equal(report.flags.native, false)
  assert.equal(report.flags.provenance, "unverified")
  assert.equal(report.flags.fullGraph, "unverified")
  assert.equal(report.sharedUsage, report.usage)
  assert.equal(report.baseReport, report.base)
  assert.equal(report.overlayUsage, report.overlay.usage)
  assert.ok(Object.isFrozen(input.report().overlay.usage))
})

test("cwd defaults to the first approved root when omitted", () => {
  const fixture = overlayFixture()
  const options = fixture.options()
  delete options.cwd
  const input = createOverlayInput(options)
  assert.equal(input.readFile("overlay/src/a.txt"), "RESULT")
  assert.equal(input.realpath("overlay/gen"), "/repo/overlay/gen")
})

test("accepts an actual empty original and generated absence under an existing directory", () => {
  const fixture = overlayFixture()
  fixture.io.addFile("/repo/overlay/src/empty.txt", "")
  const entries = [
    ...fixture.entries,
    {
      path: "src/empty.txt",
      kind: "source",
      original: { text: "", sha256: sha256("") },
      result: { text: "E", sha256: sha256("E") },
    },
    {
      path: "src/new.txt",
      kind: "generated",
      original: { absent: true },
      result: { text: "N", sha256: sha256("N") },
    },
  ]
  const input = createOverlayInput(fixture.options({ overlay: { root: "/repo/overlay", entries } }))
  assert.equal(input.readFile("overlay/src/empty.txt"), "E")
  assert.equal(input.readFile("overlay/src/new.txt"), "N")
  assert.deepEqual(input.getAccessibleEntries("overlay/src"), {
    files: ["a.txt", "empty.txt", "new.txt"],
    directories: ["sub"],
  })
})

test("readlink metadata is reserved before link acquisition", () => {
  const fixture = overlayFixture()
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const known = Buffer.byteLength("/repo/overlay/src/a.txt", "utf8")
  const input = createOverlayInput(
    fixture.options({ limits: { timeoutMs: 10000, maxMetadataBytes: usage.metadataBytes + known - 1 } }),
  )
  const readlinkBefore = fixture.io.calls.readlink
  expectOverlayError(() => input.readFile("alias-file"), "metadataBudget")
  assert.equal(fixture.io.calls.readlink, readlinkBefore)
})

test("root and cwd spellings normalize through the real base adapter", () => {
  const fixture = overlayFixture()
  const input = createOverlayInput(fixture.options({ roots: ["/repo/"], cwd: "/repo/./" }))
  assert.equal(input.readFile("overlay/src/a.txt"), "RESULT")
  assert.equal(input.realpath("overlay"), "/repo/overlay")
})

test("physical reads retain the requested alias through late content IO", () => {
  const fixture = overlayFixture()
  fixture.io.addSymlink("/repo/plain-alias", "/repo/plain.txt")
  const input = createOverlayInput(fixture.options())
  fixture.io.hooks.read = () => {
    fixture.io.mutate("/repo/plain-alias", { target: "/repo/other/x.txt" })
  }
  const error = expectOverlayError(() => input.readFile("plain-alias"), "sourceMutated")
  assert.equal(fixture.io.handles.size, 0)
  const calls = { ...fixture.io.calls }
  assert.equal(thrown(() => input.fileExists("plain-alias")), error)
  assert.deepEqual(fixture.io.calls, calls)
})

test("physical inventories retain the requested directory alias during enumeration", () => {
  const fixture = overlayFixture()
  fixture.io.addSymlink("/repo/dir-alias", "/repo/other")
  const input = createOverlayInput(fixture.options())
  fixture.io.hooks.dirRead = () => {
    fixture.io.mutate("/repo/dir-alias", { target: "/repo/overlay/src" })
  }
  expectOverlayError(() => input.getAccessibleEntries("dir-alias"), "sourceMutated")
  assert.equal(fixture.io.directories.size, 0)
})

test("overlay inventories retain aliases that were not part of startup binding", () => {
  const fixture = overlayFixture()
  fixture.io.addSymlink("/repo/overlay-alias", "/repo/overlay/src")
  const input = createOverlayInput(fixture.options())
  fixture.io.hooks.dirRead = () => {
    fixture.io.mutate("/repo/overlay-alias", { target: "/repo/other" })
  }
  expectOverlayError(() => input.getAccessibleEntries("overlay-alias"), "sourceMutated")
  assert.equal(fixture.io.directories.size, 0)
})

for (const operation of ["fileExists", "directoryExists", "realpath"]) {
  test(`existence and realpath alias stability: ${operation}`, () => {
    const fixture = overlayFixture()
    fixture.io.addSymlink("/repo/answer-alias", "/repo/overlay/src/a.txt")
    const input = createOverlayInput(fixture.options())
    let changed = false
    fixture.io.hooks.realpath = (target) => {
      if (!changed && target === "/repo" && fixture.io.calls.readlink > 0) {
        changed = true
        fixture.io.mutate("/repo/answer-alias", { target: "/repo/other/x.txt" })
      }
    }
    let error
    try {
      input[operation]("answer-alias")
    } catch (caught) {
      error = caught
    }
    assert.equal(changed, true)
    assert.ok(error instanceof OverlayInputError)
    assert.equal(error.code, "sourceMutated")
    assert.equal(thrown(() => input[operation]("answer-alias")), error)
  })
}

test("temporary component watches consume shared capacity on every call without becoming global watches", () => {
  const fixture = overlayFixture()
  fixture.io.addDir("/repo/transient")
  const input = createOverlayInput(fixture.options())
  const before = input.report().usage
  assert.equal(input.directoryExists("transient"), true)
  const first = input.report().usage
  assert.equal(first.units - before.units, 2)
  assert.equal(first.metadataBytes - before.metadataBytes, 128 + Buffer.byteLength("/repo/transient"))
  fixture.io.touch("/repo/transient")
  assert.equal(input.directoryExists("transient"), true)
  const second = input.report().usage
  assert.equal(second.units - first.units, 2)
  assert.equal(second.metadataBytes - first.metadataBytes, 128 + Buffer.byteLength("/repo/transient"))
})

test("watch acquisition refuses shared metadata exhaustion before opening a new physical file", () => {
  const fixture = overlayFixture()
  const probe = createOverlayInput(fixture.options())
  const usage = probe.report().usage
  const input = createOverlayInput(fixture.options({ limits: { maxMetadataBytes: usage.metadataBytes + 128 + Buffer.byteLength("/repo/plain.txt") - 1 } }))
  const opened = fixture.io.calls.open
  expectOverlayError(() => input.readFile("plain.txt"), "metadataBudget")
  assert.equal(fixture.io.calls.open, opened)
})





