import { createHash } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import os from "node:os"
import * as fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const SCRATCH_DIRECTORY = "/tmp/opencode"
const DEFAULT_DEPENDENCY_PACKAGE = path.join(SCRIPT_DIRECTORY, "package.json")
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
const MAX_DECLARATION_FILES = 512
const MAX_DECLARATION_BYTES = 2 * 1024 * 1024
const TYPE_PACKAGE = "@types/json-schema"
const TYPE_PACKAGE_VERSION = "7.0.15"
const TYPE_PACKAGE_INTEGRITY = "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA=="
const TYPE_DECLARATION_SHA256 = "f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1"
const TYPE_ARCHIVE_DIRECTORY = "json-schema"
const REGISTRY_ORIGIN = "https://registry.npmjs.org"
const REQUIRED_SOURCE_PINS = {
  typescript: { section: "devDependencies", version: "5.9.3" },
  "@types/node": { section: "devDependencies", version: "24.12.2" },
  ajv: { section: "devDependencies", version: "8.20.0" },
  [TYPE_PACKAGE]: { section: "devDependencies", version: TYPE_PACKAGE_VERSION },
  "@opencode/plugin": { section: "peerDependencies", version: "2.1.1" },
  "@opencode/theme": { section: "devDependencies", version: "2.1.1" },
  "@opentui/core": { section: "devDependencies", version: "0.6.6" },
  "@opentui/solid": { section: "devDependencies", version: "0.6.6" },
  "solid-js": { section: "devDependencies", version: "1.9.12" },
}
const STRICT_BUNDLE_PINS = ["typescript", "@types/node", "@opencode/plugin", "@opencode/theme", "@opentui/core", "@opentui/solid", "solid-js"]

export class CheckError extends Error {
  constructor(message) {
    super(message)
    this.name = "CheckError"
  }
}

function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function assertRegular(filePath, label) {
  let info
  try {
    info = fs.lstatSync(filePath)
  } catch (error) {
    throw new CheckError(`${label} is unavailable: ${error.code ?? error.message}`)
  }
  if (info.isSymbolicLink()) throw new CheckError(`${label} must not be a symbolic link: ${filePath}`)
  if (!info.isFile()) throw new CheckError(`${label} must be a regular file: ${filePath}`)
  return info
}

function assertDirectory(directoryPath, label) {
  let info
  try {
    info = fs.lstatSync(directoryPath)
  } catch (error) {
    throw new CheckError(`${label} is unavailable: ${error.code ?? error.message}`)
  }
  if (info.isSymbolicLink()) throw new CheckError(`${label} must not be a symbolic link: ${directoryPath}`)
  if (!info.isDirectory()) throw new CheckError(`${label} must be a directory: ${directoryPath}`)
  return info
}

export function assertNoSymlinkPath(filePath, boundary, label = "path", allowMissingLeaf = false) {
  const absolutePath = path.resolve(filePath)
  const absoluteBoundary = path.resolve(boundary)
  if (!isWithin(absoluteBoundary, absolutePath)) throw new CheckError(`${label} escapes the selected worktree: ${absolutePath}`)
  assertDirectory(absoluteBoundary, "selected worktree")
  const relative = path.relative(absoluteBoundary, absolutePath)
  let current = absoluteBoundary
  const segments = relative ? relative.split(path.sep) : []
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index])
    let info
    try {
      info = fs.lstatSync(current)
    } catch (error) {
      if (allowMissingLeaf && error.code === "ENOENT") return absolutePath
      throw new CheckError(`${label} path is unavailable: ${error.code ?? error.message}`)
    }
    if (info.isSymbolicLink()) throw new CheckError(`${label} must not traverse a symbolic link: ${current}`)
    if (index < segments.length - 1 && !info.isDirectory()) throw new CheckError(`${label} parent is not a directory: ${current}`)
  }
  return absolutePath
}

export function readBoundedFile(filePath, label, maxBytes = MAX_MANIFEST_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 64 * 1024 * 1024) throw new CheckError("invalid file read limit")
  const before = assertRegular(filePath, label)
  if (before.size > maxBytes) throw new CheckError(`${label} exceeds the ${maxBytes}-byte limit`)
  // A path inspected as regular can become a FIFO before open.
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  const unchanged = (left, right) => ["dev", "ino", "size", "mode", "nlink", "mtimeMs", "ctimeMs"].every(key => left[key] === right[key])
  try {
    const opened = fs.fstatSync(descriptor)
    if (!opened.isFile() || !unchanged(before, opened)) throw new CheckError(`${label} changed before bounded read; expected a regular file`)
    const buffer = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size < buffer.length) {
      const count = fs.readSync(descriptor, buffer, size, buffer.length - size, null)
      if (count === 0) break
      size += count
    }
    if (size > maxBytes) throw new CheckError(`${label} exceeds the ${maxBytes}-byte limit`)
    const after = fs.fstatSync(descriptor)
    const current = fs.lstatSync(filePath)
    if (!unchanged(opened, after) || !unchanged(after, current)) throw new CheckError(`${label} changed during bounded read`)
    return buffer.subarray(0, size)
  } finally { fs.closeSync(descriptor) }
}

function readJson(filePath, label) {
  const bytes = readBoundedFile(filePath, label)
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch (error) {
    throw new CheckError(`${label} is not valid JSON: ${error.message}`)
  }
}

function expectedPins(packageManifest) {
  for (const [name, { section, version }] of Object.entries(REQUIRED_SOURCE_PINS)) {
    if (packageManifest[section]?.[name] !== version) {
      throw new CheckError(`coordination package must pin ${name}@${version} in ${section}`)
    }
  }
  return Object.fromEntries(STRICT_BUNDLE_PINS.map(name => [name, REQUIRED_SOURCE_PINS[name].version]))
}

function packageRelativePath(name) {
  return name.startsWith("@") ? path.join(...name.split("/")) : name
}

function checkLockEntry(lock, packageName, expectedVersion, expectedIntegrity = null) {
  const key = `node_modules/${packageRelativePath(packageName).split(path.sep).join("/")}`
  const entry = lock.packages?.[key]
  if (!entry || entry.version !== expectedVersion || typeof entry.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+=*$/.test(entry.integrity)) {
    throw new CheckError(`selected dependency lockfile does not pin ${packageName}@${expectedVersion} with SHA-512 integrity`)
  }
  let resolved
  try {
    resolved = new URL(entry.resolved)
  } catch {
    throw new CheckError(`selected dependency lockfile has no valid public npm URL for ${packageName}@${expectedVersion}`)
  }
  if (resolved.origin !== REGISTRY_ORIGIN || resolved.username || resolved.password) {
    throw new CheckError(`selected dependency lockfile must resolve ${packageName}@${expectedVersion} from the public npm registry`)
  }
  if (expectedIntegrity && entry.integrity !== expectedIntegrity) {
    throw new CheckError(`selected dependency lockfile does not have the authentic SHA-512 integrity for ${packageName}@${expectedVersion}`)
  }
  return entry
}

export function validatePackageDependencySource(packageManifest, lock) {
  expectedPins(packageManifest)
  if (lock.lockfileVersion !== 3) throw new CheckError("coordination package lockfile must use lockfileVersion 3")
  const root = lock.packages?.[""]
  if (!root || root.name !== packageManifest.name || root.version !== packageManifest.version) {
    throw new CheckError("coordination package lockfile root does not match its package manifest")
  }
  for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
    const declared = packageManifest[section] ?? {}
    const locked = root[section] ?? {}
    if (Object.keys(declared).length !== Object.keys(locked).length) {
      throw new CheckError(`coordination package lockfile ${section} do not match the package manifest`)
    }
    for (const [name, version] of Object.entries(declared)) {
      if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version) || locked[name] !== version) {
        throw new CheckError(`coordination package lockfile ${section} do not exactly pin ${name}`)
      }
      checkLockEntry(lock, name, version, name === TYPE_PACKAGE ? TYPE_PACKAGE_INTEGRITY : null)
    }
  }
  return { pins: expectedPins(packageManifest) }
}

function validateSelectedBundlePins(dependencyManifest, lock, pins) {
  for (const [name, version] of Object.entries(pins)) {
    const declared = ["dependencies", "devDependencies", "peerDependencies"]
      .map(section => dependencyManifest[section]?.[name])
      .filter(value => value !== undefined)
    if (declared.length === 0 || declared.some(value => value !== version)) {
      throw new CheckError(`selected dependency package must pin ${name}@${version}; found ${declared.join(", ") || "missing"}`)
    }
    const lockRoot = lock.packages?.[""]
    const locked = ["dependencies", "devDependencies", "peerDependencies"]
      .map(section => lockRoot?.[section]?.[name])
      .filter(value => value !== undefined)
    if (locked.length === 0 || locked.some(value => value !== version)) {
      throw new CheckError(`selected dependency lockfile root must pin ${name}@${version}`)
    }
    checkLockEntry(lock, name, version)
  }
}

function installedPackage(dependencyRoot, repoRoot, name, expectedVersion, lock) {
  const packagePath = path.join(dependencyRoot, "node_modules", packageRelativePath(name))
  assertNoSymlinkPath(packagePath, repoRoot, `${name} installation`)
  const manifestPath = path.join(packagePath, "package.json")
  assertNoSymlinkPath(manifestPath, repoRoot, `${name} manifest`)
  const manifest = readJson(manifestPath, `${name} package manifest`)
  if (manifest.name !== name || manifest.version !== expectedVersion) {
    throw new CheckError(`${name} installed version mismatch: expected ${expectedVersion}, found ${manifest.version ?? "unknown"}`)
  }
  const lockEntry = checkLockEntry(lock, name, expectedVersion)
  return { name, version: expectedVersion, directory: packagePath, manifest, lockEntry }
}

function exportTypesFile(sdk, subpath, repoRoot) {
  const record = sdk.manifest.exports?.[subpath]
  const types = typeof record === "string" ? record : record?.types
  if (typeof types !== "string" || !types.startsWith("./") || types.includes("..")) {
    throw new CheckError(`installed @opencode/plugin ${subpath} export has no safe type declaration`)
  }
  const filePath = path.resolve(sdk.directory, types)
  assertNoSymlinkPath(filePath, repoRoot, `@opencode/plugin ${subpath} type declaration`)
  assertRegular(filePath, `@opencode/plugin ${subpath} type declaration`)
  return filePath
}

function exportWildcardTypes(sdk, repoRoot) {
  const types = sdk.manifest.exports?.["./*"]?.types
  if (types !== "./dist/*.d.ts") throw new CheckError("installed @opencode/plugin wildcard export must expose ./dist/*.d.ts declarations")
  const directory = path.join(sdk.directory, "dist")
  assertNoSymlinkPath(directory, repoRoot, "@opencode/plugin wildcard declaration directory")
  assertDirectory(directory, "@opencode/plugin wildcard declaration directory")
  const tuiContext = path.join(directory, "tui", "context.d.ts")
  assertNoSymlinkPath(tuiContext, repoRoot, "@opencode/plugin TUI context declaration")
  assertRegular(tuiContext, "@opencode/plugin TUI context declaration")
  return path.join(directory, "*.d.ts")
}

export function resolveDependencyBundle({ repoRoot, packageDirectory, dependencyPackage }) {
  const realRepoRoot = fs.realpathSync(repoRoot)
  const realPackageDirectory = assertNoSymlinkPath(packageDirectory, realRepoRoot, "coordination package")
  if (fs.realpathSync(realPackageDirectory) !== realPackageDirectory) throw new CheckError("coordination package path is not canonical")
  const manifest = readJson(path.join(realPackageDirectory, "package.json"), "coordination package manifest")
  const pins = expectedPins(manifest)
  const sourceLock = readJson(path.join(realPackageDirectory, "package-lock.json"), "coordination package lockfile")
  validatePackageDependencySource(manifest, sourceLock)
  const dependencyManifestPath = path.resolve(dependencyPackage)
  assertNoSymlinkPath(dependencyManifestPath, realRepoRoot, "dependency package manifest")
  const dependencyRoot = path.dirname(dependencyManifestPath)
  assertDirectory(dependencyRoot, "dependency package root")
  const dependencyManifest = readJson(dependencyManifestPath, "selected dependency package manifest")
  const lockPath = path.join(dependencyRoot, "package-lock.json")
  assertNoSymlinkPath(lockPath, realRepoRoot, "dependency package lockfile")
  const lock = readJson(lockPath, "selected dependency package lockfile")
  if (lock.lockfileVersion !== 3) throw new CheckError("selected dependency lockfile must use lockfileVersion 3")
  validateSelectedBundlePins(dependencyManifest, lock, pins)

  const compiler = installedPackage(dependencyRoot, realRepoRoot, "typescript", pins.typescript, lock)
  const compilerEntry = path.join(compiler.directory, "bin", "tsc")
  assertNoSymlinkPath(compilerEntry, realRepoRoot, "TypeScript CLI")
  assertRegular(compilerEntry, "TypeScript CLI")
  const nodeTypes = installedPackage(dependencyRoot, realRepoRoot, "@types/node", pins["@types/node"], lock)
  const nodeTypesEntry = path.join(nodeTypes.directory, "index.d.ts")
  assertNoSymlinkPath(nodeTypesEntry, realRepoRoot, "Node type declarations")
  assertRegular(nodeTypesEntry, "Node type declarations")
  const sdk = installedPackage(dependencyRoot, realRepoRoot, "@opencode/plugin", pins["@opencode/plugin"], lock)
  const sdkEntries = {
    server: exportTypesFile(sdk, ".", realRepoRoot),
    tui: exportTypesFile(sdk, "./tui", realRepoRoot),
    wildcard: exportWildcardTypes(sdk, realRepoRoot),
  }
  const supportPackages = Object.fromEntries(STRICT_BUNDLE_PINS
    .filter(name => !["typescript", "@types/node", "@opencode/plugin"].includes(name))
    .map(name => [name, installedPackage(dependencyRoot, realRepoRoot, name, pins[name], lock)]))
  const typeRoots = path.join(dependencyRoot, "node_modules", "@types")
  assertNoSymlinkPath(typeRoots, realRepoRoot, "installed @types root")
  assertDirectory(typeRoots, "installed @types root")
  return {
    repoRoot: realRepoRoot,
    packageDirectory: realPackageDirectory,
    dependencyRoot,
    dependencyManifestPath,
    compiler: { ...compiler, cli: compilerEntry },
    nodeTypes: { ...nodeTypes, entry: nodeTypesEntry },
    sdk: { ...sdk, entries: sdkEntries },
    supportPackages,
    typeRoots: [typeRoots],
    pins,
  }
}

export function hashTree(directory, limits = {}) {
  const maxFiles = limits.maxFiles ?? 10000
  const maxBytes = limits.maxBytes ?? 64 * 1024 * 1024
  const ignoredTopLevel = new Set(limits.ignoredTopLevel ?? [])
  const hash = createHash("sha256")
  let count = 0
  let bytes = 0
  const walk = (current, relative) => {
    const info = fs.lstatSync(current)
    if (info.isSymbolicLink()) throw new CheckError(`tree contains a symbolic link: ${current}`)
    if (info.isFile()) {
      count += 1
      bytes += info.size
      if (count > maxFiles || bytes > maxBytes) throw new CheckError("tree exceeds its bounded file or byte limit")
      const content = readBoundedFile(current, "tree file", Math.min(MAX_DECLARATION_BYTES, maxBytes - bytes + info.size))
      hash.update(`file\0${relative}\0${content.length}\0`)
      hash.update(content)
      return
    }
    if (!info.isDirectory()) throw new CheckError(`tree contains a non-regular entry: ${current}`)
    hash.update(`dir\0${relative}\0`)
    for (const entry of fs.readdirSync(current).sort()) {
      if (relative === "." && ignoredTopLevel.has(entry)) continue
      walk(path.join(current, entry), path.posix.join(relative, entry))
    }
  }
  walk(directory, ".")
  return { sha256: hash.digest("hex"), files: count, bytes }
}

function privateScratchRoot() {
  let info
  try {
    info = fs.lstatSync(SCRATCH_DIRECTORY)
  } catch (error) {
    throw new CheckError(`${SCRATCH_DIRECTORY} is unavailable: ${error.code ?? error.message}`)
  }
  if (info.isSymbolicLink() || !info.isDirectory() || fs.realpathSync(SCRATCH_DIRECTORY) !== SCRATCH_DIRECTORY) {
    throw new CheckError(`${SCRATCH_DIRECTORY} must be a canonical, non-symlink directory`)
  }
  if (info.uid !== process.getuid()) throw new CheckError(`${SCRATCH_DIRECTORY} must be owned by the current user`)
  return info
}

function assertPrivateScratchPath(candidate) {
  const absolutePath = path.resolve(candidate)
  if (!isWithin(SCRATCH_DIRECTORY, absolutePath) || absolutePath === SCRATCH_DIRECTORY) {
    throw new CheckError(`acquired declaration path must be beneath ${SCRATCH_DIRECTORY}`)
  }
  privateScratchRoot()
  let current = SCRATCH_DIRECTORY
  const segments = path.relative(SCRATCH_DIRECTORY, absolutePath).split(path.sep)
  for (const segment of segments) {
    current = path.join(current, segment)
    const info = fs.lstatSync(current)
    if (info.isSymbolicLink()) throw new CheckError(`private scratch path must not contain a symbolic link: ${current}`)
    if (info.uid !== process.getuid()) throw new CheckError(`private scratch path must be owned by the current user: ${current}`)
  }
  const scratchEntry = path.join(SCRATCH_DIRECTORY, segments[0])
  const scratchInfo = fs.lstatSync(scratchEntry)
  if (!scratchInfo.isDirectory() || scratchInfo.uid !== process.getuid() || (scratchInfo.mode & 0o077) !== 0) {
    throw new CheckError("acquired declaration scratch must be a private current-user directory")
  }
  return absolutePath
}

function pinnedJsonSchemaDeclaration(packageDirectory, manifest) {
  if ((manifest.types ?? manifest.typings ?? "index.d.ts") !== "index.d.ts") {
    throw new CheckError("json-schema package does not select the authentic pinned declaration bytes")
  }
  const declarationPath = path.join(packageDirectory, "index.d.ts")
  if (createHash("sha256").update(readBoundedFile(declarationPath, "json-schema declarations", MAX_DECLARATION_BYTES)).digest("hex") !== TYPE_DECLARATION_SHA256) {
    throw new CheckError("json-schema package does not contain the authentic pinned declaration bytes")
  }
  return declarationPath
}

export function validateAcquiredTypeRoot(typeRoot) {
  const canonicalRoot = assertPrivateScratchPath(typeRoot)
  assertDirectory(canonicalRoot, "acquired type root")
  const packageDirectory = path.join(canonicalRoot, "json-schema")
  assertPrivateScratchPath(packageDirectory)
  const packageManifest = readJson(path.join(packageDirectory, "package.json"), "acquired @types/json-schema package manifest")
  if (packageManifest.name !== TYPE_PACKAGE || packageManifest.version !== TYPE_PACKAGE_VERSION) {
    throw new CheckError(`acquired declaration package must be ${TYPE_PACKAGE}@${TYPE_PACKAGE_VERSION}`)
  }
  const declarationPath = pinnedJsonSchemaDeclaration(packageDirectory, packageManifest)
  assertPrivateScratchPath(declarationPath)
  assertRegular(declarationPath, "acquired json-schema declarations")
  const receiptPath = path.join(canonicalRoot, ".coordination-types-receipt.json")
  assertPrivateScratchPath(receiptPath)
  const receipt = readJson(receiptPath, "declaration acquisition receipt")
  const tree = hashTree(packageDirectory, { maxFiles: MAX_DECLARATION_FILES, maxBytes: MAX_DECLARATION_BYTES })
  const expectedIntegrity = receipt.tarballSha512 ? `sha512-${receipt.tarballSha512}` : ""
  if (receipt.packageName !== TYPE_PACKAGE || receipt.version !== TYPE_PACKAGE_VERSION || receipt.registry !== REGISTRY_ORIGIN ||
      receipt.registryIntegrity !== TYPE_PACKAGE_INTEGRITY || receipt.registryIntegrity !== expectedIntegrity || receipt.packageTreeSha256 !== tree.sha256 ||
      receipt.packageFileCount !== tree.files || !/^sha512-[A-Za-z0-9+/]+=*$/.test(expectedIntegrity)) {
    throw new CheckError("declaration acquisition receipt does not authenticate the installed package tree")
  }
  return { root: canonicalRoot, packageDirectory, declarationPath, tree }
}

function existingPinnedJsonSchema(bundle) {
  const packageDirectory = path.join(bundle.dependencyRoot, "node_modules", "@types", "json-schema")
  try {
    fs.lstatSync(packageDirectory)
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
  assertNoSymlinkPath(packageDirectory, bundle.repoRoot, "installed json-schema declaration package")
  const packageManifest = readJson(path.join(packageDirectory, "package.json"), "installed @types/json-schema package manifest")
  if (packageManifest.name !== TYPE_PACKAGE || packageManifest.version !== TYPE_PACKAGE_VERSION) {
    throw new CheckError(`installed declaration package must be ${TYPE_PACKAGE}@${TYPE_PACKAGE_VERSION}`)
  }
  checkLockEntry(readJson(path.join(bundle.dependencyRoot, "package-lock.json"), "selected dependency package lockfile"), TYPE_PACKAGE, TYPE_PACKAGE_VERSION, TYPE_PACKAGE_INTEGRITY)
  pinnedJsonSchemaDeclaration(packageDirectory, packageManifest)
  return path.join(bundle.dependencyRoot, "node_modules", "@types")
}

function parseCli(argv) {
  const options = { dependencyPackage: DEFAULT_DEPENDENCY_PACKAGE, typesRoot: null, acquire: false, timeout: 85_000, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") options.help = true
    else if (argument === "--dependency-package" || argument === "--types-root" || argument === "--timeout-ms") {
      const value = argv[++index]
      if (!value || value.startsWith("--")) throw new CheckError(`${argument} requires a path`)
      if (argument === "--dependency-package") options.dependencyPackage = value
      else if (argument === "--types-root") options.typesRoot = value
      else {
        const timeout = Number(value)
        if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 180_000) throw new CheckError("--timeout-ms must be an integer from 1000 through 180000")
        options.timeout = timeout
      }
    } else if (argument === "--acquire-json-schema-types") options.acquire = true
    else throw new CheckError(`unknown option: ${argument}`)
  }
  if (options.acquire && options.typesRoot) throw new CheckError("select either --types-root or --acquire-json-schema-types, not both")
  return options
}

export function helpText() {
  return [
    "Usage: node strict-check.mjs [--dependency-package <in-worktree-package.json>] [--types-root <@types-root>] [--timeout-ms <1000..180000>]",
    "       node strict-check.mjs [--dependency-package <in-worktree-package.json>] --acquire-json-schema-types [--timeout-ms <1000..180000>]",
    "",
    "The default dependency bundle is this package's exact package.json/package-lock.json; alternates must stay in this worktree.",
    "The declaration check is offline by default. Explicit acquisition fetches only @types/json-schema@7.0.15 from registry.npmjs.org,",
    "checks the registry SHA-512 integrity, extracts without lifecycle scripts, and keeps it under /tmp/opencode.",
  ].join("\n")
}

function gitRoot(directory) {
  try {
    return execFileSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch (error) {
    throw new CheckError(`cannot identify the selected worktree root with git rev-parse: ${error.message}`)
  }
}

function loadStrictConfig(packageDirectory) {
  const configPath = path.join(packageDirectory, "tsconfig.json")
  const config = readJson(configPath, "coordination TypeScript config")
  const compilerOptions = config.compilerOptions ?? {}
  if (compilerOptions.strict !== true || compilerOptions.noEmit !== true || compilerOptions.skipLibCheck !== false) {
    throw new CheckError("coordination tsconfig must retain strict:true, noEmit:true, and skipLibCheck:false")
  }
  return { configPath, config }
}

function makeScratchDirectory(prefix) {
  privateScratchRoot()
  const directory = fs.mkdtempSync(path.join(SCRATCH_DIRECTORY, prefix))
  const info = fs.lstatSync(directory)
  if (info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new CheckError("created compiler scratch is not private")
  return directory
}

async function responseBytes(url, maxBytes, label) {
  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" })
  } catch (error) {
    throw new CheckError(`${label} download failed: ${error.message}`)
  }
  if (!response.ok) throw new CheckError(`${label} download returned HTTP ${response.status}`)
  if (new URL(response.url).origin !== REGISTRY_ORIGIN) throw new CheckError(`${label} resolved outside the approved npm registry`)
  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new CheckError(`${label} exceeds its download size limit`)
  if (!response.body) throw new CheckError(`${label} returned an empty response body`)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new CheckError(`${label} exceeds its download size limit`)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

function inspectTarball(archivePath) {
  const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 })
  if (listing.error || listing.status !== 0) throw new CheckError(`could not inspect downloaded declaration archive: ${listing.error?.message ?? listing.stderr}`)
  const names = listing.stdout.trim().split("\n").filter(Boolean)
  if (names.length === 0 || names.length > MAX_DECLARATION_FILES) throw new CheckError("downloaded declaration archive has an invalid entry count")
  const seen = new Set()
  for (const name of names) {
    const normalized = path.posix.normalize(name)
    const segments = name.replace(/\/$/, "").split("/")
    if (!(name === TYPE_ARCHIVE_DIRECTORY || name.startsWith(`${TYPE_ARCHIVE_DIRECTORY}/`)) || name.startsWith("/") || normalized === ".." || normalized.startsWith("../") ||
        segments.some(segment => segment === "" || segment === "." || segment === "..") || name.includes("\\") || name.includes("\0")) {
      throw new CheckError(`downloaded declaration archive contains an unsafe path: ${JSON.stringify(name)}`)
    }
    if (seen.has(name)) throw new CheckError("downloaded declaration archive contains duplicate paths")
    seen.add(name)
  }
  const verbose = spawnSync("tar", ["-tvzf", archivePath], { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 })
  if (verbose.error || verbose.status !== 0) throw new CheckError(`could not inspect declaration archive entry types: ${verbose.error?.message ?? verbose.stderr}`)
  const lines = verbose.stdout.trim().split("\n").filter(Boolean)
  if (lines.length !== names.length) throw new CheckError("declaration archive listing was inconsistent")
  let totalBytes = 0
  for (const line of lines) {
    if (!(line.startsWith("-") || line.startsWith("d"))) throw new CheckError("downloaded declaration archive contains a link or special file")
    const match = line.match(/^\S+\s+\S+\s+(\d+)\s+/)
    if (!match) throw new CheckError("could not bound a declaration archive entry")
    totalBytes += Number(match[1])
    if (totalBytes > MAX_DECLARATION_BYTES) throw new CheckError("downloaded declarations exceed the uncompressed size limit")
  }
  return names.length
}

export async function acquireJsonSchemaTypes() {
  const scratch = makeScratchDirectory("coordination-json-schema-")
  let keep = false
  try {
    const metadataUrl = `${REGISTRY_ORIGIN}/@types%2fjson-schema/${TYPE_PACKAGE_VERSION}`
    const metadataBytes = await responseBytes(metadataUrl, 1024 * 1024, "npm registry metadata")
    let metadata
    try {
      metadata = JSON.parse(metadataBytes.toString("utf8"))
    } catch (error) {
      throw new CheckError(`npm registry metadata is invalid JSON: ${error.message}`)
    }
    const integrity = metadata.dist?.integrity
    const tarballUrl = metadata.dist?.tarball
    if (metadata.name !== TYPE_PACKAGE || metadata.version !== TYPE_PACKAGE_VERSION ||
        integrity !== TYPE_PACKAGE_INTEGRITY || typeof tarballUrl !== "string") {
      throw new CheckError("npm registry metadata did not identify the exact pinned declaration package")
    }
    const tarball = new URL(tarballUrl)
    if (tarball.origin !== REGISTRY_ORIGIN || !tarball.pathname.endsWith(`/json-schema-${TYPE_PACKAGE_VERSION}.tgz`)) {
      throw new CheckError("npm registry supplied an unexpected declaration tarball URL")
    }
    const archive = await responseBytes(tarball.href, 5 * 1024 * 1024, "declaration tarball")
    const digest = createHash("sha512").update(archive).digest("base64")
    if (`sha512-${digest}` !== integrity) throw new CheckError("downloaded declaration tarball failed npm registry SHA-512 integrity validation")
    const archivePath = path.join(scratch, "package.tgz")
    fs.writeFileSync(archivePath, archive, { flag: "wx", mode: 0o600 })
    inspectTarball(archivePath)
    const extraction = path.join(scratch, "unpack")
    fs.mkdirSync(extraction, { mode: 0o700 })
    const extracted = spawnSync("tar", ["--no-same-owner", "--no-same-permissions", "--no-overwrite-dir", "-xzf", archivePath, "-C", extraction], {
      encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
    })
    if (extracted.error || extracted.status !== 0) throw new CheckError(`declaration extraction failed: ${extracted.error?.message ?? extracted.stderr}`)
    const extractedPackage = path.join(extraction, TYPE_ARCHIVE_DIRECTORY)
    assertDirectory(extractedPackage, "extracted declaration package")
    const packageManifest = readJson(path.join(extractedPackage, "package.json"), "extracted declaration package manifest")
    if (packageManifest.name !== TYPE_PACKAGE || packageManifest.version !== TYPE_PACKAGE_VERSION) {
      throw new CheckError("extracted declaration package did not match the registry pin")
    }
    const typeRoot = path.join(scratch, "node_modules", "@types")
    fs.mkdirSync(typeRoot, { recursive: true, mode: 0o700 })
    const targetPackage = path.join(typeRoot, "json-schema")
    fs.renameSync(extractedPackage, targetPackage)
    const tree = hashTree(targetPackage, { maxFiles: MAX_DECLARATION_FILES, maxBytes: MAX_DECLARATION_BYTES })
    const receipt = {
      packageName: TYPE_PACKAGE,
      version: TYPE_PACKAGE_VERSION,
      registry: REGISTRY_ORIGIN,
      registryIntegrity: integrity,
      tarballSha512: digest,
      packageTreeSha256: tree.sha256,
      packageFileCount: tree.files,
    }
    fs.writeFileSync(path.join(typeRoot, ".coordination-types-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 })
    fs.rmSync(archivePath)
    fs.rmSync(extraction, { recursive: true })
    validateAcquiredTypeRoot(typeRoot)
    keep = true
    return { typeRoot, scratch, integrity, packageTreeSha256: tree.sha256 }
  } finally {
    if (!keep) fs.rmSync(scratch, { recursive: true, force: true })
  }
}

function resolveSelectedTypesRoot(bundle, requestedRoot) {
  if (!requestedRoot) {
    const installed = existingPinnedJsonSchema(bundle)
    if (installed) return { root: installed, package: path.join(installed, "json-schema"), origin: "in-worktree lockfile" }
    return null
  }
  const absolute = path.resolve(requestedRoot)
  const local = path.join(bundle.dependencyRoot, "node_modules", "@types")
  if (absolute === local) {
    const installed = existingPinnedJsonSchema(bundle)
    if (!installed) throw new CheckError(`selected in-worktree declaration package is missing: ${TYPE_PACKAGE}@${TYPE_PACKAGE_VERSION}`)
    return { root: installed, package: path.join(installed, "json-schema"), origin: "in-worktree lockfile" }
  }
  const acquired = validateAcquiredTypeRoot(absolute)
  return { root: acquired.root, package: acquired.packageDirectory, origin: "registry integrity-checked private scratch" }
}

function makeTemporaryConfig(bundle, baseConfigPath, typesRoot, scratch) {
  const paths = {
    "@opencode/plugin": [bundle.sdk.entries.server],
    "@opencode/plugin/tui": [bundle.sdk.entries.tui],
    "@opencode/plugin/*": [bundle.sdk.entries.wildcard],
  }
  const typeRoots = [...bundle.typeRoots]
  if (typesRoot) {
    const declarationPath = path.join(typesRoot.package, "index.d.ts")
    assertRegular(declarationPath, "json-schema declaration entry point")
    paths["json-schema"] = [declarationPath]
    typeRoots.push(typesRoot.root)
  }
  const config = {
    extends: baseConfigPath,
    compilerOptions: {
      baseUrl: bundle.packageDirectory,
      paths,
      typeRoots,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
  }
  const temporaryConfigPath = path.join(scratch, "tsconfig.json")
  fs.writeFileSync(temporaryConfigPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 })
  return temporaryConfigPath
}

export function runCompiler({ bundle, baseConfigPath, typesRoot, timeout = 85_000 }) {
  const scratch = makeScratchDirectory("coordination-tsc-")
  try {
    const temporaryConfig = makeTemporaryConfig(bundle, baseConfigPath, typesRoot, scratch)
    process.stdout.write(`Strict TypeScript ${bundle.compiler.version}; strict=true; noEmit=true; skipLibCheck=false\n`)
    const result = spawnSync(process.execPath, [bundle.compiler.cli, "--project", temporaryConfig], {
      cwd: bundle.packageDirectory,
      stdio: "inherit",
      timeout,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, npm_config_ignore_scripts: "true" },
    })
    if (result.error?.code === "ETIMEDOUT") {
      process.stderr.write(`Strict TypeScript check exceeded its ${timeout}ms bound\n`)
      return 124
    }
    if (result.error) {
      process.stderr.write(`Could not execute TypeScript: ${result.error.message}\n`)
      return 127
    }
    if (result.signal) return 128 + (os.constants.signals[result.signal] ?? 1)
    if (result.status !== 0) {
      process.stderr.write(`TypeScript exited with status ${result.status ?? 1}\n`)
      return result.status ?? 1
    }
    process.stdout.write("Strict TypeScript check passed with library checking enabled.\n")
    return 0
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

export async function main(argv = process.argv.slice(2)) {
  let scratch = null
  try {
    const options = parseCli(argv)
    if (options.help) {
      process.stdout.write(`${helpText()}\n`)
      return 0
    }
    if (process.versions.node.split(".").map(Number)[0] < 22) throw new CheckError("Node.js 22 or newer is required for this bounded source check")
    const repoRoot = fs.realpathSync(gitRoot(SCRIPT_DIRECTORY))
    if (path.resolve(SCRIPT_DIRECTORY) !== path.join(repoRoot, "tools", "session-coordination")) {
      throw new CheckError("strict checker must run from the canonical tools/session-coordination source in the selected worktree")
    }
    const dependencyPackage = path.resolve(SCRIPT_DIRECTORY, options.dependencyPackage)
    const bundle = resolveDependencyBundle({ repoRoot, packageDirectory: SCRIPT_DIRECTORY, dependencyPackage })
    const { configPath } = loadStrictConfig(SCRIPT_DIRECTORY)
    let selectedTypesRoot = resolveSelectedTypesRoot(bundle, options.typesRoot)
    if (options.acquire) {
      const acquired = await acquireJsonSchemaTypes()
      scratch = acquired.scratch
      selectedTypesRoot = resolveSelectedTypesRoot(bundle, acquired.typeRoot)
      process.stdout.write(`Acquired ${TYPE_PACKAGE}@${TYPE_PACKAGE_VERSION} into private scratch with integrity ${acquired.integrity}\n`)
      process.stdout.write(`Reuse with: --types-root ${acquired.typeRoot}\n`)
    }
    if (!selectedTypesRoot) process.stderr.write(`Strict library check will report unresolved declarations; ${TYPE_PACKAGE}@${TYPE_PACKAGE_VERSION} is absent. Use --acquire-json-schema-types explicitly or provide a verified --types-root.\n`)
    const status = runCompiler({ bundle, baseConfigPath: configPath, typesRoot: selectedTypesRoot, timeout: options.timeout })
    if (scratch) {
      process.stdout.write(`Private declaration scratch retained at ${scratch}\n`)
      scratch = null
    }
    return status
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
