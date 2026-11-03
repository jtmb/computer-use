import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { appendFile, mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  BenchmarkDependencyError,
  validateBenchmarkDependencyLock,
  verifyBenchmarkDependencyLock,
} from "./benchmark-dependencies.mjs"

const packageRoot = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
const lock = JSON.parse(readFileSync(join(packageRoot, "package-lock.json"), "utf8"))
const benchmarkTsconfig = JSON.parse(readFileSync(join(packageRoot, "tsconfig.benchmark.json"), "utf8"))

function changedLock() {
  return structuredClone(lock)
}

function rejectsInvalidLock(action) {
  assert.throws(action, (error) => error instanceof BenchmarkDependencyError &&
    error.code === "BENCHMARK_DEPENDENCY_LOCK_INVALID")
}

test("browser benchmark lock pins the package-local SDK, Playwright and strict compiler closure", async () => {
  assert.deepEqual(await verifyBenchmarkDependencyLock(), validateBenchmarkDependencyLock(manifest, lock))
  assert.deepEqual(manifest.dependencies, { "playwright-core": "1.63.0-alpha-2026-08-31" })
  assert.deepEqual(manifest.devDependencies, {
    "@opencode/plugin": "2.1.1",
    "@types/json-schema": "7.0.15",
    "@types/node": "22.18.6",
    typescript: "5.9.3",
  })
})

test("benchmark TypeScript verification stays strict and resolves the real package-local SDK", () => {
  const options = benchmarkTsconfig.compilerOptions
  assert.equal(options.strict, true)
  assert.equal(options.noEmit, true)
  assert.equal(options.skipLibCheck, false)
  assert.deepEqual(options.paths["@opencode/plugin"], ["node_modules/@opencode/plugin/dist/promise/index.d.ts"])
  assert.equal(Object.hasOwn(options, "typeRoots"), false)
  assert.ok(benchmarkTsconfig.include.includes("benchmark-runtime/**/*.ts"))
  assert.ok(benchmarkTsconfig.include.includes("../../.opencode/plugins/computer-use/**/*.ts"))
  assert.ok(benchmarkTsconfig.exclude.includes("../../.opencode/plugins/computer-use/**/*.test.ts"))
})

test("browser dependency lock rejects drift in the exact package pins", () => {
  const changedManifest = structuredClone(manifest)
  changedManifest.dependencies["playwright-core"] = "1.63.0"
  rejectsInvalidLock(() => validateBenchmarkDependencyLock(changedManifest, lock))

  const changed = changedLock()
  changed.packages[""].devDependencies["@opencode/plugin"] = "2.1.0"
  rejectsInvalidLock(() => validateBenchmarkDependencyLock(manifest, changed))

  const unexpectedRoot = changedLock()
  unexpectedRoot.packages[""].optionalDependencies = { "unexpected-package": "1.0.0" }
  rejectsInvalidLock(() => validateBenchmarkDependencyLock(manifest, unexpectedRoot))
})

test("browser dependency lock rejects SDK or JSON schema integrity drift", () => {
  for (const name of ["@opencode/plugin", "@types/json-schema"]) {
    const changed = changedLock()
    changed.packages[`node_modules/${name}`].integrity = `sha512-${Buffer.alloc(64).toString("base64")}`
    rejectsInvalidLock(() => validateBenchmarkDependencyLock(manifest, changed))
  }
})

test("every transitive lock entry must use a public HTTPS npm SHA-512 tarball", () => {
  const key = Object.keys(lock.packages).find((entry) => entry !== "")
  assert.ok(key)

  const nonRegistry = changedLock()
  nonRegistry.packages[key].resolved = nonRegistry.packages[key].resolved.replace("https://registry.npmjs.org/", "http://registry.npmjs.org/")
  rejectsInvalidLock(() => validateBenchmarkDependencyLock(manifest, nonRegistry))

  const missingIntegrity = changedLock()
  delete missingIntegrity.packages[key].integrity
  rejectsInvalidLock(() => validateBenchmarkDependencyLock(manifest, missingIntegrity))
})

test("a dependency manifest growing after open cannot escape the actual read budget", async t => {
  const root = await mkdtemp("/tmp/opencode/benchmark-dependency-growth-")
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, "tools", "computer-use-browser")
  await mkdir(directory, { recursive: true })
  const manifestPath = join(directory, "package.json")
  await writeFile(manifestPath, JSON.stringify(manifest))
  await writeFile(join(directory, "package-lock.json"), JSON.stringify(lock))
  const helper = join(directory, "benchmark-dependencies.mjs")
  await writeFile(helper, await readFile(join(packageRoot, "benchmark-dependencies.mjs")))
  const local = await import(pathToFileURL(helper).href)
  const handle = await open(manifestPath, "r")
  const prototype = Object.getPrototypeOf(handle)
  await handle.close()
  const stat = prototype.stat, read = prototype.read, readAll = prototype.readFile
  let grew = false, acquiredBytes = 0
  t.mock.method(prototype, "stat", async function (...args) {
    const info = await stat.apply(this, args)
    if (!grew) {
      grew = true
      await appendFile(manifestPath, Buffer.alloc(9 * 1024 * 1024, 0x20))
    }
    return info
  })
  t.mock.method(prototype, "read", async function (...args) {
    const result = await read.apply(this, args)
    acquiredBytes += result.bytesRead
    return result
  })
  t.mock.method(prototype, "readFile", async function (...args) {
    const result = await readAll.apply(this, args)
    acquiredBytes += result.length
    return result
  })
  await assert.rejects(local.verifyBenchmarkDependencyLock(), error =>
    error instanceof local.BenchmarkDependencyError && error.code === "BENCHMARK_DEPENDENCY_LOCK_INVALID")
  assert.equal(grew, true, "the real fixture must change after the descriptor stat")
  assert.ok(acquiredBytes <= 8 * 1024 * 1024 + 1, `acquired ${acquiredBytes} bytes before refusal`)
})
