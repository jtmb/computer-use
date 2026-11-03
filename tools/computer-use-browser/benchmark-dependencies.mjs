import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PACKAGE_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)))
const REPOSITORY_DIRECTORY = resolve(PACKAGE_DIRECTORY, "../..")
const REGISTRY_ORIGIN = "https://registry.npmjs.org"
const MAX_JSON_BYTES = 8 * 1024 * 1024
const DEPENDENCIES = Object.freeze({
  dependencies: Object.freeze({ "playwright-core": "1.63.0-alpha-2026-08-31" }),
  devDependencies: Object.freeze({
    "@opencode/plugin": "2.1.1",
    "@types/json-schema": "7.0.15",
    "@types/node": "22.18.6",
    typescript: "5.9.3",
  }),
})
const PINNED_INTEGRITIES = Object.freeze({
  "playwright-core": "sha512-1ek0Lyr12h6jcs/WTcNoVtzZkQp7D/90PsMuBW/Rm6h3AsWAbzpqj0geMv8+8Tzzr9CSUYvg9kznrVZINQMXXw==",
  "@opencode/plugin": "sha512-wvbvx/GeFNL7lb2Aj0IlXxPN01J6L1qJ2IbkUE5FaLmnC78aLjibzFP+wuzb28yUAM65dYw7WJRvHv+5GZRL8Q==",
  "@types/json-schema": "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA==",
  "@types/node": "sha512-r8uszLPpeIWbNKtvWRt/DbVi5zbqZyj1PTmhRMqBMvDnaz1QpmSKujUtJLrqGZeoM8v72MfYggDceY4K1itzWQ==",
  typescript: "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
})

export class BenchmarkDependencyError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "BenchmarkDependencyError"
    this.code = code
  }
}

function fail(code, message) {
  throw new BenchmarkDependencyError(code, message)
}

function isWithin(root, target) {
  const path = relative(root, target)
  return path === "" || (path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(path))
}

function equalRecord(actual, expected, label) {
  const actualEntries = Object.entries(actual ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right))
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${label} do not exactly match the browser benchmark pins`)
  }
}

function validateIntegrity(integrity, label) {
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${label} has no SHA-512 integrity`)
  }
  const digest = integrity.slice("sha512-".length)
  const decoded = Buffer.from(digest, "base64")
  if (decoded.length !== 64 || decoded.toString("base64") !== digest) {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${label} has malformed SHA-512 integrity`)
  }
}

function validateRegistryEntry(key, entry) {
  if (!key.startsWith("node_modules/") || entry?.link === true || typeof entry.version !== "string") {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `unsupported lock entry: ${key}`)
  }
  const marker = key.lastIndexOf("node_modules/") + "node_modules/".length
  const installName = key.slice(marker)
  const name = entry.name ?? installName
  if (typeof name !== "string" || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)) {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${key} has an invalid npm package identity`)
  }
  const baseName = name.slice(name.lastIndexOf("/") + 1)
  const expectedUrl = `${REGISTRY_ORIGIN}/${name}/-/${baseName}-${entry.version}.tgz`
  let url
  try {
    url = new URL(entry.resolved)
  } catch {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${key} has no valid HTTPS npm tarball URL`)
  }
  if (url.origin !== REGISTRY_ORIGIN || url.username || url.password || url.search || url.hash || entry.resolved !== expectedUrl) {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${key} must resolve from the public HTTPS npm registry`)
  }
  validateIntegrity(entry.integrity, key)
  return { installName, name }
}

export function validateBenchmarkDependencyLock(manifest, lock) {
  if (manifest?.name !== "computer-use-browser" || manifest.version !== "0.1.0" ||
      lock?.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== "object") {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", "browser benchmark manifest/lock identity is invalid")
  }
  if (Object.hasOwn(manifest, "overrides") || Object.hasOwn(manifest, "resolutions")) {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", "browser benchmark dependency overrides are not permitted")
  }
  for (const section of ["optionalDependencies", "peerDependencies", "peerDependenciesMeta", "bundledDependencies", "bundleDependencies", "workspaces"]) {
    if (Object.hasOwn(manifest, section)) fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `package.json ${section} are not permitted`)
  }
  for (const [section, expected] of Object.entries(DEPENDENCIES)) {
    equalRecord(manifest[section], expected, `package.json ${section}`)
  }
  const root = lock.packages[""]
  if (root?.name !== manifest.name || root.version !== manifest.version) {
    fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", "package-lock root does not match package.json")
  }
  for (const section of Object.keys(DEPENDENCIES)) equalRecord(root[section], DEPENDENCIES[section], `package-lock ${section}`)
  for (const section of ["optionalDependencies", "peerDependencies", "peerDependenciesMeta"]) {
    equalRecord(root[section], {}, `package-lock ${section}`)
  }

  let registryPackages = 0
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === "") continue
    const { installName, name } = validateRegistryEntry(key, entry)
    registryPackages += 1
    const expectedVersion = DEPENDENCIES.dependencies[installName] ?? DEPENDENCIES.devDependencies[installName]
    if (expectedVersion && key === `node_modules/${installName}`) {
      if (name !== installName || entry.version !== expectedVersion) {
        fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${name} must be locked at ${expectedVersion}`)
      }
      const expectedIntegrity = PINNED_INTEGRITIES[name]
      if (expectedIntegrity && entry.integrity !== expectedIntegrity) {
        fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `${name}@${expectedVersion} does not match its reviewed SHA-512 integrity`)
      }
    }
  }
  for (const [section, expected] of Object.entries(DEPENDENCIES)) {
    for (const [name, version] of Object.entries(expected)) {
      const entry = lock.packages[`node_modules/${name}`]
      if (!entry || entry.version !== version) {
        fail("BENCHMARK_DEPENDENCY_LOCK_INVALID", `package-lock is missing ${name}@${version}`)
      }
    }
  }
  return { directPins: Object.values(DEPENDENCIES).reduce((count, section) => count + Object.keys(section).length, 0), registryPackages }
}

async function assertDirectoryPath(target, boundary, label, code = "BENCHMARK_DEPENDENCY_PATH_UNSAFE") {
  if (!isWithin(boundary, target)) fail(code, `${label} escaped the selected browser package`)
  const boundaryInfo = await lstat(boundary).catch((error) => {
    fail(code, `${label} boundary is unavailable: ${error.code ?? error.message}`)
  })
  if (!boundaryInfo.isDirectory() || boundaryInfo.isSymbolicLink() || await realpath(boundary) !== boundary) {
    fail(code, `${label} boundary must be a canonical real directory`)
  }
  let current = boundary
  for (const part of relative(boundary, target).split(/[\\/]+/u).filter(Boolean)) {
    current = join(current, part)
    const info = await lstat(current).catch((error) => {
      fail(code, `${label} is unavailable: ${error.code ?? error.message}`)
    })
    if (!info.isDirectory() || info.isSymbolicLink()) fail(code, `${label} contains a symlink or non-directory`)
  }
  if (await realpath(target) !== target) fail(code, `${label} is not canonical`)
}

async function readJson(path, label, code) {
  const sameFile = (left, right) => ["dev", "ino", "mode", "nlink", "size", "mtimeMs", "ctimeMs"]
    .every(key => left[key] === right[key])
  const before = await lstat(path).catch((error) => fail(code, `${label} is unavailable: ${error.code ?? error.message}`))
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_JSON_BYTES) {
    fail(code, `${label} must be a bounded regular file without links`)
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error) => {
    fail(code, `${label} could not be opened safely: ${error.code ?? error.message}`)
  })
  try {
    const after = await handle.stat()
    if (!after.isFile() || !sameFile(before, after) || after.size > MAX_JSON_BYTES) {
      fail(code, `${label} changed while it was opened`)
    }
    const buffer = Buffer.alloc(MAX_JSON_BYTES + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, Math.min(64 * 1024, buffer.length - size), null)
      if (bytesRead === 0) break
      size += bytesRead
    }
    if (size > MAX_JSON_BYTES) fail(code, `${label} exceeds the size limit`)
    const finalInfo = await handle.stat()
    const current = await lstat(path).catch(() => fail(code, `${label} path changed while it was read`))
    if (!sameFile(after, finalInfo) || !sameFile(after, current) || size !== after.size) {
      fail(code, `${label} changed while it was read`)
    }
    try {
      return JSON.parse(buffer.subarray(0, size).toString("utf8"))
    } catch {
      fail(code, `${label} is not valid JSON`)
    }
  } finally {
    await handle.close()
  }
}

async function readSource() {
  await assertDirectoryPath(REPOSITORY_DIRECTORY, REPOSITORY_DIRECTORY, "selected repository")
  await assertDirectoryPath(PACKAGE_DIRECTORY, REPOSITORY_DIRECTORY, "browser package")
  const code = "BENCHMARK_DEPENDENCY_LOCK_INVALID"
  const manifest = await readJson(join(PACKAGE_DIRECTORY, "package.json"), "browser package manifest", code)
  const lock = await readJson(join(PACKAGE_DIRECTORY, "package-lock.json"), "browser package lockfile", code)
  const summary = validateBenchmarkDependencyLock(manifest, lock)
  return { manifest, lock, summary }
}

export async function verifyBenchmarkDependencyLock() {
  const { summary } = await readSource()
  return summary
}

export async function verifyBenchmarkDependencyInstallation() {
  const { lock } = await readSource()
  const nodeModules = join(PACKAGE_DIRECTORY, "node_modules")
  await assertDirectoryPath(nodeModules, PACKAGE_DIRECTORY, "package-local node_modules", "BENCHMARK_DEPENDENCY_INSTALL_UNAVAILABLE")
  const installed = {}
  for (const [section, pins] of Object.entries(DEPENDENCIES)) {
    for (const [name, version] of Object.entries(pins)) {
      const directory = join(nodeModules, ...name.split("/"))
      await assertDirectoryPath(directory, PACKAGE_DIRECTORY, `${name} installation`,
        name === "@opencode/plugin" ? "PLUGIN_SDK_ESCAPE" : "BENCHMARK_DEPENDENCY_INSTALL_UNAVAILABLE")
      const manifest = await readJson(join(directory, "package.json"), `${name} installed manifest`, "BENCHMARK_DEPENDENCY_INSTALL_UNAVAILABLE")
      const key = `node_modules/${name}`
      const entry = lock.packages[key]
      if (manifest.name !== name || manifest.version !== version || entry?.version !== version ||
          (PINNED_INTEGRITIES[name] && entry.integrity !== PINNED_INTEGRITIES[name])) {
        const code = name === "@opencode/plugin" ? "PLUGIN_SDK_VERSION_MISMATCH" : "BENCHMARK_DEPENDENCY_INSTALL_MISMATCH"
        fail(code, `${name} installed version or lock identity does not match ${version}`)
      }
      installed[name] = directory
    }
  }
  return {
    packageRoot: PACKAGE_DIRECTORY,
    repositoryRoot: REPOSITORY_DIRECTORY,
    sdkPath: installed["@opencode/plugin"],
    playwrightPath: installed["playwright-core"],
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyBenchmarkDependencyLock()
    process.stdout.write(`Validated ${result.directPins} exact browser benchmark pins and ${result.registryPackages} public npm SHA-512 lock entries.\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "dependency lock validation failed"}\n`)
    process.exitCode = 1
  }
}
