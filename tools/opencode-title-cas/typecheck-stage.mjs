// Complete typecheck-stage prerequisite for the pinned OpenCode tree.
//
// This module only *stages*: it verifies the pin, copies the reviewed tracked inputs byte for
// byte, and rebuilds real private `node_modules` directories out of read-only absolute links.
// It never runs a compiler, never enumerates a TypeScript program, and makes no claim about types
// or diagnostics. The reviewed package set below is fixed, not a discovered/universal closure.
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PINNED_HEAD = "ba546ec1598a70db2570e9c6258028d955ba8f58"

// Reviewed closure from source review: core -> {schema,util,plugin,ai,codemode,plugin-browser},
// plugin -> {client,protocol,theme,...}, server -> {simulation,...}, client -> {httpapi-codegen,...}.
// The initial 13-package set omitted recorder dev dependencies and the root script dependency.
// The reviewed 15 now closes observed manifest/config/workspace-link metadata, not the full program
// graph or the monorepo. Any further unselected workspace still refuses rather than linking native.
export const PACKAGES = Object.freeze([
  "core",
  "server",
  "plugin",
  "client",
  "protocol",
  "schema",
  "util",
  "ai",
  "theme",
  "simulation",
  "httpapi-codegen",
  "codemode",
  "plugin-browser",
  "http-recorder",
  "script",
])

export const ROOT_FILES = Object.freeze(["package.json", "bun.lock", "bunfig.toml", "tsconfig.json"])

// Left as fresh real private directories so the parent can generate into them later. Nothing else
// is allowed to be missing, ignored or untracked without a refusal.
export const CLIENT_GENERATED = Object.freeze([
  "packages/client/src/promise/generated",
  "packages/client/src/effect/generated",
  "packages/client/src/effect/api",
])

export const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 10000,
  maxFileBytes: 2 * 1024 * 1024,
  maxAggregateBytes: 64 * 1024 * 1024,
  maxGitStdoutBytes: 2 * 1024 * 1024,
  timeoutMs: 30000,
})

export const DEFAULT_BASE = "/tmp/opencode"

const ALLOWED_GIT = new Set(["rev-parse", "status", "ls-files"])
const SKIP_NODE_MODULES = new Set([".cache", ".ts-dist"])

export class StageRefusal extends Error {
  constructor(code, message, detail) {
    super(`${code}: ${message}`)
    this.name = "StageRefusal"
    this.code = code
    this.detail = detail
    this.allocated = false
    this.stageRoot = undefined
  }
}

const refuse = (code, message, detail) => {
  throw new StageRefusal(code, message, detail)
}

// --- limits and paths -------------------------------------------------------------------------

export function normalizeLimits(overrides = {}) {
  const limits = { ...DEFAULT_LIMITS }
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in DEFAULT_LIMITS)) refuse("limitOverride", `unknown limit ${key}`, { key })
    if (!Number.isInteger(value) || value <= 0) refuse("limitOverride", `${key} must be a positive integer`, { key, value })
    // Tests and callers may only tighten the reviewed bounds; a raise would be a silent cap ratchet.
    if (value > DEFAULT_LIMITS[key]) refuse("limitOverride", `${key} may only be reduced`, { key, value, max: DEFAULT_LIMITS[key] })
    limits[key] = value
  }
  return limits
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false
  if (value.startsWith("/") || value.startsWith("\\")) return false
  if (value.includes("\\") || value.includes("\0")) return false
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}

const under = (prefix, candidate) => candidate === prefix || candidate.startsWith(prefix + path.sep)

function realDir(value, code, label) {
  let stat
  try {
    stat = fs.lstatSync(value)
  } catch {
    refuse(code, `${label} does not exist: ${value}`, { value })
  }
  if (stat.isSymbolicLink()) refuse(code, `${label} is a symlink: ${value}`, { value })
  if (!stat.isDirectory()) refuse(code, `${label} is not a directory: ${value}`, { value })
  // A symlinked ancestor would make lstat on the leaf true while the tree behind it is another
  // copy; require the canonical path to equal the requested one. This is a sampled check, not an
  // atomic guarantee against a concurrent re-link.
  const requested = path.resolve(value)
  const resolved = fs.realpathSync(requested)
  if (resolved !== requested) refuse(code, `${label} is not canonical: ${requested} resolves to ${resolved}`, { requested, resolved })
  return requested
}

// --- read-only git boundary -------------------------------------------------------------------

// Args are argv arrays only, so tests can inject synthetic facts without a shell or a compiler.
// The injected boundary is a test seam, not authentication: the CLI accepts no git override, and a
// caller-supplied boundary is trusted only as read-only metadata for that caller's own fixture.
export function defaultRunGit(args, { cwd, maxBytes, timeoutMs }) {
  const command = args[0]
  if (!ALLOWED_GIT.has(command)) refuse("gitCommandRejected", `unexpected git command ${command}`, { args })
  const result = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd,
    maxBuffer: maxBytes + 1,
    timeout: timeoutMs,
    encoding: "buffer",
  })
  if (result.error) {
    if (result.error.code === "ETIMEDOUT" || result.signal) refuse("gitTimeout", `git ${command} exceeded ${timeoutMs}ms`, { args })
    if (result.error.code === "ENOBUFS") refuse("gitOutputTooLarge", `git ${command} exceeded ${maxBytes} bytes`, { args })
    refuse("gitFailed", `git ${command} failed: ${result.error.message}`, { args })
  }
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0)
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0)
  return { status: result.status ?? 1, stdout, stderr }
}

function readGit(runGit, args, { cwd, limits, timeoutMs, after }) {
  const result = runGit(args, { cwd, maxBytes: limits.maxGitStdoutBytes, timeoutMs })
  if (!result || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) {
    refuse("gitBoundary", `git ${args[0]} returned no byte buffers`, { args })
  }
  if (result.stdout.length > limits.maxGitStdoutBytes) {
    refuse("gitOutputTooLarge", `git ${args[0]} stdout ${result.stdout.length} exceeds ${limits.maxGitStdoutBytes}`, { args })
  }
  if (result.status !== 0) {
    // Exit status only: git stderr may quote repository content, so it is never copied onward.
    refuse("gitFailed", `git ${args[0]} exited ${result.status}`, { args })
  }
  if (after) after()
  return result.stdout
}

// Identity of a directory entry, compared before open, after open and after the last read.
const identity = (stat) => ({ size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, dev: stat.dev, ino: stat.ino })
const sameIdentity = (left, right) =>
  left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.dev === right.dev && left.ino === right.ino

// A directory entry whose canonical path differs from the expected one is a re-link candidate;
// ancestors are checked so a symlinked intermediate directory cannot stand in for a real one.
function assertRealAncestors(root, absolute, cache) {
  const relative = path.relative(root, absolute)
  if (relative.startsWith("..") || path.isAbsolute(relative)) refuse("unsafePath", `path escapes its root: ${absolute}`, { absolute })
  let current = root
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part)
    if (cache?.has(current)) continue
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink() || !stat.isDirectory()) refuse("symlinkSource", `path ancestor is not a real directory: ${current}`, { current })
    if (fs.realpathSync(current) !== current) refuse("symlinkSource", `path ancestor is not canonical: ${current}`, { current })
    cache?.add(current)
  }
}

// --- input acquisition ------------------------------------------------------------------------

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

// Acquisition is bounded by *observed* bytes, not the earlier metadata size: the identity is
// compared before the first read and again after the last one, and every read is charged against
// the shared budget. O_NONBLOCK keeps a leaf swapped for a FIFO from blocking the open; the
// fstat check then rejects it. This is sampled safety, not an atomic snapshot guarantee.
function acquireRegularFile(absolute, limits, expected, budget, checkDeadline, assertAncestors = () => {}) {
  checkDeadline("acquisition")
  assertAncestors("pre-open")
  let fd
  try {
    fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  } catch (error) {
    if (error.code === "ENOENT") refuse("missingInput", `tracked input is missing: ${absolute}`, { absolute })
    if (error.code === "ELOOP") refuse("symlinkSource", `input is a symlink: ${absolute}`, { absolute })
    refuse("readFailed", `cannot open ${absolute}: ${error.code ?? "error"}`, { absolute })
  }
  try {
    const opened = fs.fstatSync(fd)
    if (!opened.isFile()) refuse("nonRegularInput", `input is not a regular file: ${absolute}`, { absolute })
    const observed = identity(opened)
    if (!sameIdentity(expected, observed)) {
      refuse("sourceMutated", `input changed between metadata and open: ${absolute}`, { absolute, expected, observed })
    }
    // The leaf identity can survive a directory rebind, so the ancestors are re-checked against
    // the live tree rather than a cached verdict.
    assertAncestors("post-open")
    if (opened.size > limits.maxFileBytes) {
      refuse("fileTooLarge", `${absolute} is ${opened.size} bytes (max ${limits.maxFileBytes})`, { absolute, size: opened.size })
    }
    if (budget.used + opened.size > limits.maxAggregateBytes) {
      refuse("aggregateTooLarge", `aggregate acquisition exceeds ${limits.maxAggregateBytes} bytes`, { used: budget.used, next: opened.size })
    }
    const data = Buffer.allocUnsafe(opened.size)
    let offset = 0
    while (offset < opened.size) {
      checkDeadline("read")
      const read = fs.readSync(fd, data, offset, opened.size - offset, offset)
      if (read === 0) break
      offset += read
      budget.used += read
      if (budget.used > limits.maxAggregateBytes) {
        refuse("aggregateTooLarge", `aggregate acquisition exceeds ${limits.maxAggregateBytes} bytes`, { used: budget.used })
      }
    }
    if (offset !== opened.size) refuse("shortRead", `short read on ${absolute}`, { absolute, size: opened.size, read: offset })
    checkDeadline("read-eof")
    assertAncestors("post-read")
    const finished = identity(fs.fstatSync(fd))
    if (!sameIdentity(observed, finished)) {
      refuse("sourceMutated", `input changed during read: ${absolute}`, { absolute, opened: observed, finished })
    }
    return { data, ...observed, sha256: sha256(data) }
  } finally {
    fs.closeSync(fd)
  }
}

// --- dependency link planning -----------------------------------------------------------------

const workspacePackage = (nativeRoot, name) => fs.existsSync(path.join(nativeRoot, "packages", name, "package.json"))

function planNodeModules({ nativeRoot, label, sourceDir, limits, selected, checkDeadline }) {
  checkDeadline("dependency-planning")
  const links = []
  const skipped = []
  if (!fs.existsSync(sourceDir)) return { label, links, skipped, present: false }
  const stat = fs.lstatSync(sourceDir)
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    refuse("symbolicNodeModules", `${label} node_modules is not a real directory: ${sourceDir}`, { sourceDir })
  }
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))

  const planOne = (spec, entryPath) => {
    checkDeadline("dependency-planning")
    let target
    try {
      target = fs.realpathSync(entryPath)
    } catch {
      refuse("dependencyTargetMissing", `${label} link ${spec} has no readable target`, { spec, entryPath })
    }
    if (!fs.existsSync(target)) refuse("dependencyTargetMissing", `${label} link ${spec} target is missing`, { spec, target })
    if (spec.startsWith("@opencode/")) {
      const name = spec.slice("@opencode/".length)
      if (!name || name.includes("/")) refuse("unknownWorkspaceLink", `${label} has an unsupported @opencode spec ${spec}`, { spec })
      if (selected.has(name)) return { spec, kind: "staged", package: name, sourceTarget: target }
      if (workspacePackage(nativeRoot, name)) {
        // Never silently point a staged package at a native workspace copy: that would mix
        // patched staged sources with unpatched neighbours without saying so.
        refuse("unselectedWorkspaceLink", `${label} links workspace package @opencode/${name}, which is not in the reviewed set`, {
          spec,
          package: name,
          sourceTarget: target,
        })
      }
      return { spec, kind: "external", target }
    }
    return { spec, kind: "external", target }
  }

  for (const entry of entries) {
    if (SKIP_NODE_MODULES.has(entry.name)) {
      skipped.push({ name: entry.name, reason: "compiler-cache" })
      continue
    }
    if (entry.name.startsWith(".") && entry.name !== ".bin" && entry.name !== ".bun") {
      skipped.push({ name: entry.name, reason: "metadata" })
      continue
    }
    const entryPath = path.join(sourceDir, entry.name)
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      if (entry.name.startsWith("@")) {
        if (entry.isSymbolicLink()) {
          refuse("unsupportedLayout", `${label} scope ${entry.name} is a symlink`, { entryPath })
        }
        const children = fs.readdirSync(entryPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
        for (const child of children) {
          links.push(planOne(`${entry.name}/${child.name}`, path.join(entryPath, child.name)))
          if (links.length > limits.maxFiles) refuse("inputTooLarge", `${label} has too many dependency links`, { count: links.length })
        }
        continue
      }
      links.push(planOne(entry.name, entryPath))
      if (links.length > limits.maxFiles) refuse("inputTooLarge", `${label} has too many dependency links`, { count: links.length })
      continue
    }
    if (entry.isFile()) {
      links.push(planOne(entry.name, entryPath))
      continue
    }
    refuse("nonRegularInput", `${label} node_modules entry is not a regular file or directory: ${entryPath}`, { entryPath })
  }
  return { label, links, skipped, present: true }
}

function declaredWorkspaceDependencies(manifest, label, selected) {
  const declared = []
  for (const field of ["dependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (typeof range !== "string" || !range.startsWith("workspace:")) continue
      const bare = name.startsWith("@opencode/") ? name.slice("@opencode/".length) : name
      if (!selected.has(bare)) {
        refuse("workspaceDependencyUnselected", `${label} declares ${name}@${range} which is not in the reviewed set`, {
          dependency: name,
          range,
        })
      }
      declared.push({ name, spec: name })
    }
  }
  return declared
}

// --- preflight --------------------------------------------------------------------------------

const PLAN_REGISTRY = new WeakMap()

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value
  if (ArrayBuffer.isView(value)) return value
  if (seen.has(value)) return value
  seen.add(value)
  for (const key of Object.keys(value)) deepFreeze(value[key], seen)
  return Object.freeze(value)
}

function planFingerprint(plan) {
  const linkMaterial = (link) => [link.spec, link.kind, link.package ?? null, link.target ?? null]
  const material = {
    version: plan.version,
    head: plan.head,
    pin: plan.pin,
    nativeRoot: plan.nativeRoot,
    baseDir: plan.baseDir,
    destination: plan.destination ?? null,
    limits: plan.limits,
    deadline: plan.deadline,
    roots: plan.roots,
    packages: plan.packages,
    excludedGenerated: plan.excludedGenerated,
    files: plan.files.map((file) => [file.path, file.size, file.sha256, file.mtimeMs, file.ctimeMs, file.dev, file.ino]),
    links: {
      root: plan.links.root.links.map(linkMaterial),
      packages: plan.links.packages.map((entry) => [entry.label, entry.links.map(linkMaterial)]),
    },
    declared: plan.declaredWorkspaceDependencies.map((entry) => [entry.label, entry.deps.map((dep) => [dep.name, dep.spec])]),
  }
  return sha256(Buffer.from(JSON.stringify(material)))
}

function parseManifest(file, label) {
  try {
    return JSON.parse(file.data.toString("utf8"))
  } catch {
    // Never re-echo parser output: it can quote arbitrary file content.
    refuse("invalidManifest", `${label} package.json is not valid JSON`, { label })
  }
}

export async function preflight(options = {}) {
  const limits = normalizeLimits(options.limits)
  const runGit = options.runGit ?? defaultRunGit
  // One job deadline, started before any git call; each call gets only the remaining budget.
  const clock = options.now ?? Date.now
  const deadline = clock() + limits.timeoutMs
  const checkDeadline = (phase) => {
    if (clock() > deadline) refuse("acquisitionTimeout", `${phase} exceeded the ${limits.timeoutMs}ms job deadline`, { phase })
  }
  const remaining = () => deadline - clock()

  const nativeRoot = realDir(path.resolve(options.nativeRoot ?? "/home/james/repos/opencode-native-row"), "nativeRoot", "native checkout")
  const base = realDir(path.resolve(options.baseDir ?? DEFAULT_BASE), "baseDir", "approved scratch root")
  if (process.platform !== "win32" && path.resolve(base) !== "/tmp/opencode") {
    refuse("baseDir", `approved scratch root must be /tmp/opencode, got ${base}`, { base })
  }
  const selected = new Set(PACKAGES)
  const scopes = [...ROOT_FILES, ...PACKAGES.map((name) => `packages/${name}`)]
  // Directory identity is bound so a later rename+recreate at the same path is detected before any
  // allocation; mtime is deliberately excluded because a directory's entries legitimately change.
  const directoryIdentity = (value) => {
    const stat = fs.lstatSync(value)
    return { canonical: value, dev: stat.dev, ino: stat.ino }
  }
  const roots = { nativeRoot: directoryIdentity(nativeRoot), baseDir: directoryIdentity(base) }
  if (options.destination !== undefined) {
    try {
      roots.destinationParent = directoryIdentity(path.dirname(path.resolve(options.destination)))
    } catch {
      roots.destinationParent = undefined
    }
  }
  // A new git call must not start once the job deadline has expired; a clamped 1 ms retry would
  // turn an overdue job into forward progress.
  const git = (args) => {
    checkDeadline("git-pre")
    const left = remaining()
    if (left <= 0) refuse("acquisitionTimeout", "git call started after the job deadline", { phase: "git-pre" })
    return readGit(runGit, args, { cwd: nativeRoot, limits, timeoutMs: left, after: () => checkDeadline("git") })
  }

  const head = git(["rev-parse", "HEAD"]).toString("utf8").trim()
  if (head !== PINNED_HEAD) refuse("headMismatch", `native HEAD ${head} is not ${PINNED_HEAD}`, { head, pin: PINNED_HEAD })

  const status = git(["status", "--porcelain", "--untracked-files=all", "--", ...scopes])
  const dirty = status.toString("utf8").trim()
  if (dirty !== "") {
    // Count only: porcelain lines can quote arbitrary repository paths.
    refuse("dirtyWorktree", "selected native scopes have tracked or untracked changes", { lines: dirty.split("\n").length })
  }

  const raw = git(["ls-files", "-z", "--", ...scopes])
  const tracked = new Set()
  for (const entry of raw.toString("utf8").split("\0")) {
    if (entry === "") continue
    if (!safeRelative(entry)) refuse("unsafePath", `tracked path is not a safe relative path: ${entry}`, { entry })
    if (tracked.has(entry)) refuse("duplicateInput", `tracked path appears twice: ${entry}`, { entry })
    const inPackage = PACKAGES.some((name) => entry.startsWith(`packages/${name}/`))
    if (!inPackage && !ROOT_FILES.includes(entry)) {
      refuse("outOfScopePath", `tracked path is outside the reviewed scopes: ${entry}`, { entry })
    }
    tracked.add(entry)
    if (tracked.size > limits.maxFiles) refuse("inputTooLarge", `tracked inputs exceed ${limits.maxFiles} files`, { count: tracked.size })
  }

  const excludedGenerated = [...tracked].filter((entry) => CLIENT_GENERATED.some((dir) => entry.startsWith(dir + "/"))).sort()
  const generated = new Set(excludedGenerated)
  const staged = [...tracked].filter((entry) => !generated.has(entry)).sort()

  const required = [
    ...ROOT_FILES,
    ...PACKAGES.flatMap((name) => [`packages/${name}/package.json`, `packages/${name}/tsconfig.json`]),
    "packages/core/tsconfig.tests.json",
    "packages/core/drizzle.config.ts",
  ]
  for (const entry of required) {
    if (!tracked.has(entry)) refuse("missingRequiredInput", `required tracked input is absent: ${entry}`, { entry })
  }
  for (const name of PACKAGES) {
    if (!staged.some((entry) => entry.startsWith(`packages/${name}/src/`))) {
      refuse("missingRequiredInput", `package ${name} has no tracked src input`, { package: name })
    }
  }
  if (!staged.some((entry) => entry.startsWith("packages/core/script/"))) {
    refuse("missingRequiredInput", "core script inputs are absent", { entry: "packages/core/script" })
  }

  // Metadata bound before any content is read. Identity is captured here and re-checked around
  // every open/read, so a later size change cannot hide behind the earlier count.
  let aggregate = 0
  const metadata = new Map()
  for (const entry of staged) {
    checkDeadline("metadata")
    const absolute = path.join(nativeRoot, entry)
    let stat
    try {
      stat = fs.lstatSync(absolute)
    } catch {
      refuse("missingInput", `tracked input is missing: ${entry}`, { entry })
    }
    if (stat.isSymbolicLink()) refuse("symlinkSource", `input is a symlink: ${entry}`, { entry })
    if (!stat.isFile()) refuse("nonRegularInput", `input is not a regular file: ${entry}`, { entry })
    if (stat.size > limits.maxFileBytes) refuse("fileTooLarge", `${entry} is ${stat.size} bytes (max ${limits.maxFileBytes})`, { entry, size: stat.size })
    aggregate += stat.size
    if (aggregate > limits.maxAggregateBytes) {
      refuse("aggregateTooLarge", `aggregate input exceeds ${limits.maxAggregateBytes} bytes`, { aggregate })
    }
    metadata.set(entry, identity(stat))
  }
  checkDeadline("metadata-eof")

  // Anything on disk inside a selected package that is not tracked (ignored or untracked) would
  // make the copy an unannounced superset, so it is a refusal rather than a silent omission.
  const walkCache = new Set()
  const walk = (relative, absolute) => {
    checkDeadline("traversal")
    assertRealAncestors(nativeRoot, absolute, walkCache)
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`
      if (entry.isSymbolicLink()) refuse("symlinkSource", `selected tree contains a symlink: ${child}`, { entry: child })
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue
        if (CLIENT_GENERATED.includes(child)) continue
        walk(child, path.join(absolute, entry.name))
        continue
      }
      if (!entry.isFile()) refuse("nonRegularInput", `selected tree contains a non-regular entry: ${child}`, { entry: child })
      if (!tracked.has(child)) refuse("untrackedInput", `selected tree contains an untracked or ignored file: ${child}`, { entry: child })
    }
  }
  for (const name of PACKAGES) walk(`packages/${name}`, path.join(nativeRoot, "packages", name))
  checkDeadline("traversal-eof")

  // Actual acquired bytes are charged against the shared budget; the metadata sum is not trusted.
  const budget = { used: 0 }
  const files = []
  for (const entry of staged) {
    const absolute = path.join(nativeRoot, entry)
    assertRealAncestors(nativeRoot, absolute, walkCache)
    const acquired = acquireRegularFile(absolute, limits, metadata.get(entry), budget, checkDeadline, () =>
      assertRealAncestors(nativeRoot, absolute, new Set()),
    )
    files.push({ path: entry, ...acquired, mode: 0o600 })
  }
  checkDeadline("acquisition-eof")

  const byPath = new Map(files.map((file) => [file.path, file]))
  const rootManifest = parseManifest(byPath.get("package.json"), "root")
  const packageManifests = Object.fromEntries(
    PACKAGES.map((name) => [name, parseManifest(byPath.get(`packages/${name}/package.json`), name)]),
  )

  // Declared workspace dependencies must be inside the reviewed set.
  const declared = [{ label: "root", deps: declaredWorkspaceDependencies(rootManifest, "root", selected) }]
  for (const name of PACKAGES) {
    declared.push({ label: name, deps: declaredWorkspaceDependencies(packageManifests[name], name, selected) })
  }

  checkDeadline("links")
  const nativeRootModules = planNodeModules({
    nativeRoot,
    label: "root",
    sourceDir: path.join(nativeRoot, "node_modules"),
    limits,
    selected,
    checkDeadline,
  })
  if (!nativeRootModules.present) refuse("missingNodeModules", "native root node_modules is absent", {})
  const packageModules = PACKAGES.map((name) => {
    checkDeadline("links")
    return planNodeModules({
      nativeRoot,
      label: name,
      sourceDir: path.join(nativeRoot, "packages", name, "node_modules"),
      limits,
      selected,
      checkDeadline,
    })
  })
  checkDeadline("links-eof")

  // Every declared workspace dependency must be reachable from the package itself or the staged
  // root, which is how Node/Bun resolution walks upward.
  const rootSpecs = new Set(nativeRootModules.links.filter((link) => link.kind === "staged").map((link) => link.spec))
  for (const entry of declared) {
    const own = entry.label === "root" ? rootSpecs : new Set(packageModules.find((m) => m.label === entry.label).links.filter((l) => l.kind === "staged").map((l) => l.spec))
    for (const dep of entry.deps) {
      if (!own.has(dep.spec) && !rootSpecs.has(dep.spec)) {
        refuse("dependencyUnresolved", `${entry.label} declares ${dep.name} but no staged link provides it`, { dependency: dep.name })
      }
    }
  }

  const plan = {
    version: 1,
    head,
    pin: PINNED_HEAD,
    nativeRoot,
    baseDir: base,
    destination: options.destination,
    packages: PACKAGES.slice(),
    limits,
    deadline,
    roots,
    tracked: [...tracked].sort(),
    excludedGenerated,
    files,
    links: { root: nativeRootModules, packages: packageModules },
    declaredWorkspaceDependencies: declared,
    counts: { files: files.length, bytes: budget.used, excluded: excludedGenerated.length },
  }
  deepFreeze(plan)
  PLAN_REGISTRY.set(plan, planFingerprint(plan))
  return plan
}

// --- staging ----------------------------------------------------------------------------------

function allocate(plan) {
  if (plan.destination !== undefined) {
    const destination = path.resolve(plan.destination)
    if (!under(plan.baseDir, destination)) {
      refuse("destinationOutsideBase", `destination must live under ${plan.baseDir}`, { destination })
    }
    if (fs.existsSync(destination)) refuse("destinationExists", `destination already exists: ${destination}`, { destination })
    const parent = path.dirname(destination)
    realDir(parent, "destinationParent", "destination parent")
    const realParent = fs.realpathSync(parent)
    if (!under(fs.realpathSync(plan.baseDir), realParent)) {
      refuse("destinationOutsideBase", `destination parent resolves outside ${plan.baseDir}`, { realParent })
    }
    fs.mkdirSync(destination, { mode: 0o700 })
    return destination
  }
  return fs.mkdtempSync(path.join(plan.baseDir, "typecheck-stage-"))
}

function writePrivate(absolute, data) {
  // Also bound generated receipts; a failure path must not retry tiny writes indefinitely.
  if (data.length > DEFAULT_LIMITS.maxFileBytes) refuse("writeVerifyFailed", "output exceeds the fixed file bound", {})
  const fd = fs.openSync(absolute, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600)
  let identity
  try {
    const written = fs.writeSync(fd, data, 0, data.length, 0)
    if (written !== data.length) refuse("writeVerifyFailed", `short write: ${absolute}`, { absolute, written })
    const stat = fs.fstatSync(fd)
    identity = { dev: stat.dev, ino: stat.ino }
  } finally {
    fs.closeSync(fd)
  }
  const stat = fs.lstatSync(absolute)
  if (!stat.isFile() || stat.size !== data.length) refuse("writeVerifyFailed", `written file does not match: ${absolute}`, { absolute })
  if ((stat.mode & 0o777) !== 0o600) refuse("writeVerifyFailed", `written file is not private: ${absolute}`, { absolute })
  return identity
}

// Best-effort publication of a failure that happened after (or during) the success receipt write.
// The primary receipt is only rewritten when the path still resolves to the inode this process
// published; anything else is preserved and the authoritative failure goes to an exclusive sidecar
// (`typecheck-stage-failure.json`) whose `precedence` field overrides any stale success claim.
// This is a sampled, non-atomic handoff: a replacement landing between the check and the rewrite is
// detected afterwards and reported through the sidecar rather than claimed as an update.
function publishFailure({ stageRoot, receiptPath, published, failure }) {
  const sidecarPath = path.join(stageRoot, "typecheck-stage-failure.json")
  const failureBytes = Buffer.from(JSON.stringify(failure, null, 2) + "\n", "utf8")
  const sidecarFor = (primaryStatus) =>
    Buffer.from(
      JSON.stringify(
        {
          version: 1,
          tool: "typecheck-stage",
          status: "failed",
          precedence: "this failure artifact overrides any success claim in typecheck-stage-receipt.json",
          finishedAt: new Date().toISOString(),
          primary: { path: "typecheck-stage-receipt.json", status: primaryStatus },
          stage: failure.stage,
          counts: failure.counts,
          error: failure.error,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )
  const writeSidecar = (primaryStatus) => {
    try {
      writePrivate(sidecarPath, sidecarFor(primaryStatus))
      return sidecarPath
    } catch {
      return undefined
    }
  }

  if (published !== undefined) {
    let fd
    try {
      fd = fs.openSync(receiptPath, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    } catch {
      fd = undefined
    }
    if (fd !== undefined) {
      try {
        const stat = fs.fstatSync(fd)
        if (stat.isFile() && stat.dev === published.dev && stat.ino === published.ino &&
            stat.size === published.size && stat.size <= DEFAULT_LIMITS.maxFileBytes) {
          const previous = Buffer.alloc(stat.size)
          const count = fs.readSync(fd, previous, 0, previous.length, 0)
          const afterRead = fs.fstatSync(fd)
          const pathBeforeWrite = fs.lstatSync(receiptPath)
          // Inode ownership alone does not authorize overwriting a concurrent in-place edit.
          if (count !== previous.length || sha256(previous) !== published.sha256 ||
              !sameIdentity(identity(stat), identity(afterRead)) ||
              !sameIdentity(identity(stat), identity(pathBeforeWrite))) {
            return { status: "preserved", failurePath: writeSidecar("concurrently-edited") }
          }
          // Truncate first so a partial rewrite can never leave the old success text behind.
          fs.ftruncateSync(fd, 0)
          const written = fs.writeSync(fd, failureBytes, 0, failureBytes.length, 0)
          const final = fs.fstatSync(fd)
          if (written === failureBytes.length && final.size === failureBytes.length) {
            const after = fs.lstatSync(receiptPath)
            if (after.dev === published.dev && after.ino === published.ino && after.size === failureBytes.length) {
              return { status: "failed", path: receiptPath }
            }
          }
        }
      } catch {
        // fall through to the sidecar
      } finally {
        fs.closeSync(fd)
      }
    }
    return { status: "preserved", failurePath: writeSidecar("preserved-or-replaced") }
  }

  // No success receipt was published by this process. Create the failure receipt only when the
  // path is free; otherwise the existing artifact belongs to someone else and is left untouched.
  if (!fs.existsSync(receiptPath)) {
    try {
      writePrivate(receiptPath, failureBytes)
      return { status: "failed", path: receiptPath }
    } catch {
      // fall through to the sidecar
    }
  }
  return { status: "preserved", failurePath: writeSidecar("absent-or-unowned") }
}

function ensureDir(absolute) {
  fs.mkdirSync(absolute, { recursive: true, mode: 0o700 })
  const stat = fs.lstatSync(absolute)
  if (stat.isSymbolicLink() || !stat.isDirectory()) refuse("stageLayout", `staged directory is not real: ${absolute}`, { absolute })
  return absolute
}

function linkEntry(stageRoot, nodeModulesDir, link, checkDeadline) {
  checkDeadline("link")
  const target = link.kind === "staged" ? path.join(stageRoot, "packages", link.package) : link.target
  const destination = path.join(nodeModulesDir, ...link.spec.split("/"))
  ensureDir(path.dirname(destination))
  // Fresh ancestor verification at link time; a cached traversal verdict is not reused here.
  assertRealAncestors(stageRoot, destination, new Set())
  // Re-resolve the target so a rebind after planning is not linked silently.
  if (!fs.existsSync(target)) refuse("dependencyTargetMissing", `link target is missing: ${link.spec}`, { spec: link.spec })
  if (fs.realpathSync(target) !== target) {
    refuse(link.kind === "staged" ? "stageLayout" : "dependencyTargetMissing", `link target is not canonical: ${link.spec}`, {
      spec: link.spec,
      target,
    })
  }
  fs.symlinkSync(target, destination)
  checkDeadline("link-eof")
  const resolved = fs.realpathSync(destination)
  if (link.kind === "staged") {
    if (!under(stageRoot, resolved)) refuse("stageLayout", `staged link escaped the stage: ${link.spec}`, { spec: link.spec, resolved })
  } else if (under(stageRoot, resolved)) {
    refuse("stageLayout", `external link resolved into the stage: ${link.spec}`, { spec: link.spec, resolved })
  }
  // Re-check the parent chain and the resolution after creation; a rebind in either window is a
  // refusal rather than a silently different target.
  assertRealAncestors(stageRoot, destination, new Set())
  if (fs.realpathSync(destination) !== resolved) {
    refuse("stageLayout", `link resolution changed after creation: ${link.spec}`, { spec: link.spec })
  }
  if (link.kind === "external" && fs.realpathSync(target) !== target) {
    refuse("dependencyTargetMissing", `link target changed after creation: ${link.spec}`, { spec: link.spec })
  }
  checkDeadline("link-post")
  return { spec: link.spec, kind: link.kind, target, resolved }
}

export async function createStage(plan, options = {}) {
  // Trust only a preflight result produced by this module and unchanged since: a caller-mutated
  // or fabricated plan must refuse before any directory is allocated.
  const recorded = plan === null || typeof plan !== "object" ? undefined : PLAN_REGISTRY.get(plan)
  if (recorded === undefined) refuse("invalidPlan", "plan is not a preflight result from this module", {})
  if (planFingerprint(plan) !== recorded) refuse("invalidPlan", "plan changed after preflight", {})
  for (const file of plan.files) {
    if (!Buffer.isBuffer(file.data) || sha256(file.data) !== file.sha256) {
      refuse("invalidPlan", `bound plan bytes changed: ${file.path}`, { entry: file.path })
    }
  }

  const clock = options.now ?? Date.now
  const checkDeadline = (phase) => {
    if (clock() > plan.deadline) refuse("acquisitionTimeout", `${phase} exceeded the ${plan.limits.timeoutMs}ms job deadline`, { phase })
  }
  checkDeadline("stage-start")

  // Roots are re-validated against the identity bound at preflight *before* any allocation: a
  // rename+recreate (or rename+symlink) at the same path must not be accepted as the old tree.
  const revalidateRoot = (label, code, expected) => {
    if (!expected) return
    let stat
    try {
      stat = fs.lstatSync(expected.canonical)
    } catch {
      refuse(code, `${label} is missing before staging`, { root: expected.canonical })
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) refuse(code, `${label} is no longer a real directory`, { root: expected.canonical })
    if (fs.realpathSync(expected.canonical) !== expected.canonical) refuse(code, `${label} is no longer canonical`, { root: expected.canonical })
    if (stat.dev !== expected.dev || stat.ino !== expected.ino) refuse(code, `${label} identity changed since preflight`, { root: expected.canonical })
  }
  revalidateRoot("native root", "nativeRoot", plan.roots.nativeRoot)
  revalidateRoot("base", "baseDir", plan.roots.baseDir)
  revalidateRoot("destination parent", "destinationParent", plan.roots.destinationParent)
  checkDeadline("roots")

  const stageRoot = (() => {
    try {
      return allocate(plan)
    } catch (error) {
      if (error instanceof StageRefusal) error.allocated = false
      throw error
    }
  })()

  const receipt = {
    version: 1,
    tool: "typecheck-stage",
    status: "in_progress",
    createdAt: new Date().toISOString(),
    native: { root: plan.nativeRoot, head: plan.head, pin: plan.pin },
    stage: { root: stageRoot, baseDir: plan.baseDir },
    closure: "fixed reviewed package set; not a discovered or universal dynamic closure",
    selectedPackages: plan.packages,
    limits: plan.limits,
    counts: plan.counts,
    excluded: { nodeModulesTrees: true, clientGenerated: plan.excludedGenerated },
    declaredWorkspaceDependencies: plan.declaredWorkspaceDependencies,
    copied: { rootFiles: [], packages: {} },
    files: [],
    links: { root: [], packages: {} },
    notes: [
      "no compiler executed",
      "no TypeScript program enumeration",
      "no type or diagnostic claim",
      "partial failed workspaces are retained",
    ],
  }

  let publishedReceipt

  try {
    for (const file of plan.files) {
      checkDeadline("stage")
      const source = path.join(plan.nativeRoot, file.path)
      const absolute = path.join(stageRoot, file.path)
      // Fresh ancestor verification per write: no cached traversal verdict is trusted here.
      assertRealAncestors(plan.nativeRoot, source, new Set())
      ensureDir(path.dirname(absolute))
      assertRealAncestors(stageRoot, absolute, new Set())
      let current
      try {
        current = fs.lstatSync(source)
      } catch {
        refuse("sourceMutated", `source disappeared before staging: ${file.path}`, { entry: file.path })
      }
      if (
        !current.isFile() ||
        current.ino !== file.ino ||
        current.size !== file.size ||
        current.mtimeMs !== file.mtimeMs ||
        current.ctimeMs !== file.ctimeMs ||
        current.dev !== file.dev
      ) {
        refuse("sourceMutated", `source changed between acquisition and staging: ${file.path}`, { entry: file.path })
      }
      writePrivate(absolute, file.data)
      checkDeadline("stage-write")
      const writtenStat = fs.lstatSync(absolute)
      if (!writtenStat.isFile() || writtenStat.size !== file.size || writtenStat.size > plan.limits.maxFileBytes) {
        refuse("writeVerifyFailed", `staged file is not the expected bounded regular file: ${file.path}`, { entry: file.path })
      }
      const readback = acquireRegularFile(absolute, plan.limits, identity(writtenStat), { used: 0 }, checkDeadline, () =>
        assertRealAncestors(stageRoot, absolute, new Set()),
      )
      if (readback.size !== file.size || readback.sha256 !== file.sha256) {
        refuse("writeVerifyFailed", `staged bytes differ: ${file.path}`, { entry: file.path })
      }
      assertRealAncestors(plan.nativeRoot, source, new Set())
      assertRealAncestors(stageRoot, absolute, new Set())
      if (ROOT_FILES.includes(file.path)) receipt.copied.rootFiles.push(file.path)
      const parts = file.path.split("/")
      if (parts[0] === "packages" && parts.length > 2) {
        const bucket = (receipt.copied.packages[parts[1]] ??= [])
        bucket.push(file.path)
      }
      receipt.files.push({ path: file.path, size: file.size, sha256: file.sha256 })
    }
    checkDeadline("stage-eof")

    for (const dir of CLIENT_GENERATED) {
      checkDeadline("generated")
      const absolute = ensureDir(path.join(stageRoot, ...dir.split("/")))
      if (fs.readdirSync(absolute).length !== 0) refuse("stageLayout", `generated directory is not empty: ${dir}`, { dir })
    }
    checkDeadline("generated-eof")

    const roots = [
      { label: "root", dir: path.join(stageRoot, "node_modules"), plan: plan.links.root },
      ...plan.links.packages.map((entry) => ({
        label: entry.label,
        dir: path.join(stageRoot, "packages", entry.label, "node_modules"),
        plan: entry,
      })),
    ]
    for (const root of roots) {
      checkDeadline("links")
      ensureDir(root.dir)
      const links = []
      for (const link of root.plan.links) links.push(linkEntry(stageRoot, root.dir, link, checkDeadline))
      if (root.label === "root") receipt.links.root = links
      else receipt.links.packages[root.label] = links
    }
    checkDeadline("links-eof")

    // Final layout check: every selected package has a real private node_modules, and every
    // @opencode/<selected> link in the root and in each package points at the staged copy.
    for (const name of plan.packages) {
      checkDeadline("layout")
      const candidate = fs.lstatSync(path.join(stageRoot, "packages", name, "node_modules"))
      if (candidate.isSymbolicLink() || !candidate.isDirectory()) {
        refuse("stageLayout", `package ${name} node_modules is not a real directory`, { package: name })
      }
    }
    checkDeadline("layout-eof")
    for (const link of receipt.links.root) {
      if (!link.spec.startsWith("@opencode/")) continue
      const name = link.spec.slice("@opencode/".length)
      if (!plan.packages.includes(name)) continue
      if (!under(stageRoot, link.resolved)) refuse("stageLayout", `root link ${link.spec} does not point at the stage`, { spec: link.spec })
    }

    receipt.status = "success"
    receipt.finishedAt = new Date().toISOString()
    const receiptPath = path.join(stageRoot, "typecheck-stage-receipt.json")
    checkDeadline("receipt")
    assertRealAncestors(stageRoot, receiptPath, new Set())
    const payload = Buffer.from(JSON.stringify(receipt, null, 2) + "\n", "utf8")
    const publishedIdentity = writePrivate(receiptPath, payload)
    publishedReceipt = { ...publishedIdentity, size: payload.length, sha256: sha256(payload) }
    checkDeadline("receipt-eof")
    return { root: stageRoot, receiptPath, receipt }
  } catch (error) {
    const failure = {
      ...receipt,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: { code: error.code ?? "error", message: String(error.message ?? error) },
    }
    const receiptPath = path.join(stageRoot, "typecheck-stage-receipt.json")
    let outcome
    try {
      outcome = publishFailure({ stageRoot, receiptPath, published: publishedReceipt, failure })
    } catch {
      // The workspace is retained even if publication itself fails; the refusal still throws.
      outcome = { status: "unavailable" }
    }
    if (error instanceof StageRefusal) {
      error.allocated = true
      error.stageRoot = stageRoot
      error.receiptStatus = outcome.status
      if (outcome.path) error.receiptPath = outcome.path
      if (outcome.failurePath) error.failurePath = outcome.failurePath
    }
    throw error
  }
}

export async function stage(options = {}) {
  const plan = await preflight(options)
  return createStage(plan, options)
}

// --- CLI --------------------------------------------------------------------------------------

function parseArgs(argv) {
  const parsed = {}
  const seen = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== "--native" && flag !== "--base" && flag !== "--destination") {
      refuse("cliUsage", "unknown argument", { argument: flag })
    }
    if (seen.has(flag)) refuse("cliUsage", `duplicate argument ${flag}`, { argument: flag })
    seen.add(flag)
    const value = argv[index + 1]
    // A missing value must refuse rather than silently consume the next flag or a position.
    if (value === undefined || value.startsWith("--")) refuse("cliUsage", `${flag} requires a value`, { argument: flag })
    index += 1
    if (flag === "--native") parsed.nativeRoot = value
    else if (flag === "--base") parsed.baseDir = value
    else parsed.destination = value
  }
  return parsed
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await stage(parseArgs(process.argv.slice(2)))
    process.stdout.write(JSON.stringify({ root: result.root, receipt: result.receiptPath, counts: result.receipt.counts }) + "\n")
  } catch (error) {
    process.stderr.write(`${error.code ?? "error"}: ${error.message}\n`)
    if (error.stageRoot) process.stderr.write(`retained workspace: ${error.stageRoot}\n`)
    if (error.failurePath) process.stderr.write(`failure artifact: ${error.failurePath}\n`)
    else if (error.receiptStatus) process.stderr.write(`receipt status: ${error.receiptStatus}\n`)
    process.exitCode = 1
  }
}
