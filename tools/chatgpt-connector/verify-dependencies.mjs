import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const required = {
  "@modelcontextprotocol/sdk": "1.30.0",
  "@opencode/client": "2.0.7",
  "@opencode/plugin": "2.0.7",
}

const PACKAGE_JSON_BYTES = 1024 * 1024
const LOCK_JSON_BYTES = 8 * 1024 * 1024

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** @param {string} path */
async function requireRegular(path) {
  const metadata = await lstat(path, { bigint: true })
  if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
    throw new Error("expected a regular package file")
  }
  return metadata
}

/** @param {import("node:fs").BigIntStats} left @param {import("node:fs").BigIntStats} right */
function sameFile(left, right) {
  return right.isFile() && left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
}

/** @param {string} path @param {number} maximum @returns {Promise<Record<string, unknown>>} */
async function json(path, maximum) {
  const expected = await requireRegular(path)
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat({ bigint: true })
    if (!sameFile(expected, before)) throw new Error("package file changed during inspection")
    if (before.size > BigInt(maximum)) throw new Error("package metadata exceeds its byte budget")
    const buffer = Buffer.alloc(maximum + 1)
    let total = 0
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null)
      if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length - total) throw new Error("invalid package read")
      if (bytesRead === 0) break
      total += bytesRead
    }
    if (total > maximum) throw new Error("package metadata exceeds its byte budget")
    if (!sameFile(expected, await handle.stat({ bigint: true })) ||
        !sameFile(expected, await lstat(path, { bigint: true })) || await realpath(path) !== path) {
      throw new Error("package file changed during inspection")
    }
    /** @type {unknown} */
    let value
    try { value = JSON.parse(buffer.subarray(0, total).toString("utf8")) }
    catch { throw new Error("invalid package metadata JSON") }
    if (!record(value)) throw new Error("invalid package metadata object")
    return value
  } finally {
    await handle.close()
  }
}

/** @param {unknown} value @param {string} version */
function lockedPackage(value, version) {
  if (!record(value) || value.version !== version || typeof value.resolved !== "string" || typeof value.integrity !== "string" ||
      !value.integrity.startsWith("sha512-")) return false
  let url
  try { url = new URL(value.resolved) } catch { return false }
  if (url.protocol !== "https:" || url.host !== "registry.npmjs.org" || url.username || url.password || url.search || url.hash) return false
  const encoded = value.integrity.slice(7), digest = Buffer.from(encoded, "base64")
  return digest.length === 64 && digest.toString("base64") === encoded
}

/** @param {string} root */
export async function verifyDependencies(root) {
  root = resolve(root)
  const manifestPath = join(root, "package.json")
  const lockPath = join(root, "package-lock.json")
  const manifest = await json(manifestPath, PACKAGE_JSON_BYTES)
  const lock = await json(lockPath, LOCK_JSON_BYTES)
  const manifestDependencies = manifest.dependencies
  const packages = lock.packages
  const lockedRoot = record(packages) ? packages[""] : undefined
  const lockedDependencies = record(lockedRoot) ? lockedRoot.dependencies : undefined
  if (!record(manifestDependencies) || !record(packages) || !record(lockedDependencies)) {
    throw new Error("the package-local npm lockfile is incomplete")
  }

  const dependencyNames = Object.keys(required).sort()
  const manifestNames = Object.keys(manifestDependencies).sort()
  const lockedNames = Object.keys(lockedDependencies).sort()
  if (
    lock.lockfileVersion !== 3 ||
    JSON.stringify(manifestNames) !== JSON.stringify(dependencyNames) ||
    JSON.stringify(lockedNames) !== JSON.stringify(dependencyNames)
  ) {
    throw new Error("the package-local npm lockfile is incomplete")
  }

  for (const [name, version] of Object.entries(required)) {
    if (manifestDependencies[name] !== version || lockedDependencies[name] !== version) {
      throw new Error(`package metadata does not retain the required ${name} pin`)
    }
    const locked = packages[`node_modules/${name}`]
    if (!lockedPackage(locked, version)) {
      throw new Error(`package lock does not verify the required ${name} pin`)
    }

    const packagePath = join(root, "node_modules", ...name.split("/"), "package.json")
    const installed = await json(packagePath, PACKAGE_JSON_BYTES)
    if (installed.version !== version) throw new Error(`installed ${name} version does not match its pin`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyDependencies(fileURLToPath(new URL(".", import.meta.url)))
  } catch (error) {
    const message = error instanceof Error ? error.message : "dependency verification failed"
    process.stderr.write(`chatgpt-mcp: dependency verification failed: ${message}\n`)
    process.exitCode = 1
  }
}
