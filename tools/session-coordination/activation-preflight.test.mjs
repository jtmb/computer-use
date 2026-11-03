import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const SOURCE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const SCRATCH_ROOT = "/tmp/opencode"
const PACKAGE_EXPORTS = { ".": "./index.ts", "./tui": "./tui.ts" }
const PINS = {
  typescript: "5.9.3",
  "@types/node": "24.12.2",
  "@opencode/plugin": "2.1.1",
  "@opencode/theme": "2.1.1",
  "@opentui/core": "0.6.6",
  "@opentui/solid": "0.6.6",
  "solid-js": "1.9.12",
}
const SOURCE_DEV_DEPENDENCIES = {
  "@opencode/theme": PINS["@opencode/theme"],
  "@opentui/core": PINS["@opentui/core"],
  "@opentui/solid": PINS["@opentui/solid"],
  "@types/json-schema": "7.0.15",
  "@types/node": PINS["@types/node"],
  ajv: "8.20.0",
  "solid-js": PINS["solid-js"],
  typescript: PINS.typescript,
}
const LOCK_INTEGRITY = `sha512-${"B".repeat(44)}`
const JSON_SCHEMA_INTEGRITY = "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA=="

function write(filePath, text, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, text, { mode })
}

function json(filePath, value) {
  write(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function lockEntry(name, version, integrity = LOCK_INTEGRITY) {
  const encoded = encodeURIComponent(name)
  const basename = name.split("/").at(-1)
  return { version, resolved: `https://registry.npmjs.org/${encoded}/-/${basename}-${version}.tgz`, integrity }
}

function lockRoot(manifest) {
  return Object.fromEntries(["name", "version", "dependencies", "devDependencies", "peerDependencies"]
    .filter(key => manifest[key] !== undefined)
    .map(key => [key, manifest[key]]))
}

function fixture(t, { localDependencies = false } = {}) {
  const baseInfo = fs.lstatSync(SCRATCH_ROOT)
  assert.equal(baseInfo.isSymbolicLink(), false)
  assert.equal(baseInfo.uid, process.getuid())
  const taskRoot = fs.mkdtempSync(path.join(SCRATCH_ROOT, "coordination-preflight-tests-"))
  t.after(() => fs.rmSync(taskRoot, { recursive: true, force: true }))
  const repoRoot = path.join(taskRoot, "repo")
  const packageDirectory = path.join(repoRoot, "tools", "session-coordination")
  const dependencyRoot = localDependencies ? packageDirectory : path.join(repoRoot, "tools", "opencode-plugins", "resource-monitor")
  const binDirectory = path.join(taskRoot, "bin")
  fs.mkdirSync(packageDirectory, { recursive: true, mode: 0o700 })
  fs.mkdirSync(dependencyRoot, { recursive: true, mode: 0o700 })
  fs.mkdirSync(binDirectory, { recursive: true, mode: 0o700 })

  fs.copyFileSync(path.join(SOURCE_DIRECTORY, "activation-preflight.mjs"), path.join(packageDirectory, "activation-preflight.mjs"))
  fs.copyFileSync(path.join(SOURCE_DIRECTORY, "strict-check.mjs"), path.join(packageDirectory, "strict-check.mjs"))
  const packageManifest = {
    name: "opencode-session-coordination",
    version: "0.1.0",
    private: true,
    type: "module",
    exports: PACKAGE_EXPORTS,
    peerDependencies: { "@opencode/plugin": PINS["@opencode/plugin"] },
    devDependencies: SOURCE_DEV_DEPENDENCIES,
  }
  json(path.join(packageDirectory, "package.json"), packageManifest)
  const sourceLockPackages = Object.fromEntries(Object.entries({
    ...SOURCE_DEV_DEPENDENCIES,
    "@opencode/plugin": PINS["@opencode/plugin"],
  }).map(([name, version]) => [`node_modules/${name}`, lockEntry(name, version, name === "@types/json-schema" ? JSON_SCHEMA_INTEGRITY : LOCK_INTEGRITY)]))
  const sourceLock = { lockfileVersion: 3, packages: { "": lockRoot(packageManifest), ...sourceLockPackages } }
  json(path.join(packageDirectory, "package-lock.json"), sourceLock)
  write(path.join(packageDirectory, ".gitignore"), "/local-state/\n/node_modules/\n")
  for (const filename of Object.values(PACKAGE_EXPORTS)) write(path.join(packageDirectory, filename), "export {}\n")
  json(path.join(packageDirectory, "tsconfig.json"), { compilerOptions: { strict: true, noEmit: true, skipLibCheck: false }, include: ["*.ts"] })

  const depManifest = {
    name: "fixture-dependencies",
    version: "0.1.0",
    dependencies: { "@opencode/plugin": PINS["@opencode/plugin"] },
    devDependencies: Object.fromEntries(Object.entries(PINS).filter(([name]) => name !== "@opencode/plugin")),
  }
  if (!localDependencies) {
    json(path.join(dependencyRoot, "package.json"), depManifest)
    const locked = Object.fromEntries(Object.entries(PINS).map(([name, version]) => [`node_modules/${name}`, lockEntry(name, version)]))
    json(path.join(dependencyRoot, "package-lock.json"), { lockfileVersion: 3, packages: { "": lockRoot(depManifest), ...locked } })
  }
  const modules = path.join(dependencyRoot, "node_modules")
  const compiler = path.join(modules, "typescript")
  const sdk = path.join(modules, "@opencode", "plugin")
  const nodeTypes = path.join(modules, "@types", "node")
  json(path.join(compiler, "package.json"), { name: "typescript", version: PINS.typescript })
  write(path.join(compiler, "bin", "tsc"), "process.exit(0)\n")
  json(path.join(nodeTypes, "package.json"), { name: "@types/node", version: PINS["@types/node"], types: "index.d.ts" })
  write(path.join(nodeTypes, "index.d.ts"), "export {}\n")
  json(path.join(sdk, "package.json"), {
    name: "@opencode/plugin",
    version: PINS["@opencode/plugin"],
    exports: { ".": { types: "./dist/promise/index.d.ts" }, "./tui": { types: "./dist/tui/index.d.ts" }, "./*": { types: "./dist/*.d.ts" } },
  })
  write(path.join(sdk, "dist", "promise", "index.d.ts"), "export {}\n")
  write(path.join(sdk, "dist", "tui", "index.d.ts"), "export {}\n")
  write(path.join(sdk, "dist", "tui", "context.d.ts"), "export {}\n")
  for (const name of ["@opencode/theme", "@opentui/core", "@opentui/solid", "solid-js"]) {
    json(path.join(modules, ...name.split("/"), "package.json"), { name, version: PINS[name] })
  }

  write(path.join(binDirectory, "git"), "#!/bin/sh\nprintf '%s\\n' \"$PREFLIGHT_TEST_ROOT\"\n", 0o700)
  write(path.join(binDirectory, "opencode"), "#!/bin/sh\nexit 0\n", 0o700)
  const configPath = path.join(repoRoot, "opencode.jsonc")
  write(configPath, `{
  // Preserve this selected project's existing options and plugins.
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["example-plugin@1.2.3",],
  "mcp": {"servers": {}},
}\n`)

  return {
    taskRoot,
    repoRoot,
    packageDirectory,
    dependencyRoot,
    dependencyPackage: path.join(dependencyRoot, "package.json"),
    configPath,
    stateDirectory: path.join(packageDirectory, "local-state"),
    binDirectory,
  }
}

function invoke(paths, extraArgs = [], env = {}, useDefaultDependencyPackage = false) {
  const script = path.join(paths.packageDirectory, "activation-preflight.mjs")
  const dependencyArguments = useDefaultDependencyPackage ? [] : ["--dependency-package", path.relative(paths.repoRoot, paths.dependencyPackage)]
  const result = spawnSync(process.execPath, [script,
    "--root", paths.repoRoot,
    "--config", path.relative(paths.repoRoot, paths.configPath),
    "--state-directory", paths.stateDirectory,
    ...dependencyArguments,
    ...extraArgs,
  ], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${paths.binDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      PREFLIGHT_TEST_ROOT: paths.repoRoot,
      ...env,
    },
  })
  let output = null
  try {
    output = JSON.parse(result.stdout || result.stderr)
  } catch {}
  return { ...result, output }
}

test("refuses activation with no additive proposal while preserving config and absent state", t => {
  const paths = fixture(t)
  const before = fs.readFileSync(paths.configPath)
  const result = invoke(paths)
  assert.equal(result.status, 2, result.stderr || result.stdout)
  assert.equal(result.output.sourceReadiness, "ready-source")
  assert.equal(result.output.activationPreflight, "blocked")
  assert.equal(result.output.retirement.activation, "refused")
  assert.equal(result.output.selectedConfigEntry, "absent")
  assert.equal(result.output.liveRegistration, "not checked")
  assert.equal(result.output.config.liveRegistration, "not checked")
  assert.equal(result.output.config.writesPerformed, false)
  assert.equal(result.output.config.format, "JSONC")
  assert.equal(result.output.config.proposal, null)
  assert.equal(result.output.config.rollback, null)
  assert.match(result.output.config.retirement, /retired/)
  assert.equal(result.output.stateDirectory.exists, false)
  assert.equal(result.output.stateDirectory.createdOrChanged, false)
  assert.deepEqual(fs.readFileSync(paths.configPath), before)
  assert.equal(fs.existsSync(paths.stateDirectory), false)
})

test("defaults dependency readiness to this package's exact local lock bundle", t => {
  const paths = fixture(t, { localDependencies: true })
  const before = fs.readFileSync(paths.configPath)
  const result = invoke(paths, [], {}, true)
  assert.equal(result.status, 2, result.stderr || result.stdout)
  assert.equal(result.output.sourceReadiness, "ready-source")
  assert.equal(result.output.activationPreflight, "blocked")
  assert.equal(result.output.config.proposal, null)
  assert.equal(result.output.checks.find(check => check.name === "pinned-native-sdk-and-compiler").detail.dependencyPackage,
    path.join(paths.packageDirectory, "package.json"))
  assert.deepEqual(fs.readFileSync(paths.configPath), before)
  assert.equal(fs.existsSync(paths.stateDirectory), false)
})

test("private state preflight rejects writable ancestors even when the state leaf is absent", t => {
  const paths = fixture(t)
  fs.chmodSync(path.join(paths.repoRoot, "tools"), 0o775)
  const before = fs.readFileSync(paths.configPath)
  const result = invoke(paths)
  assert.equal(result.status, 2)
  assert.match(result.stdout, /unsafe coordination ancestor/)
  assert.deepEqual(fs.readFileSync(paths.configPath), before)
  assert.equal(fs.existsSync(paths.stateDirectory), false)
  assert.equal(fs.statSync(path.join(paths.repoRoot, "tools")).mode & 0o777, 0o775, "never chmod shared source to make preflight pass")
})

test("explicit ignored root-private state avoids shared tools ancestors and stays read-only", t => {
  const paths = fixture(t)
  fs.chmodSync(path.join(paths.repoRoot, "tools"), 0o775)
  paths.stateDirectory = path.join(paths.repoRoot, ".session-coordination")
  write(path.join(paths.repoRoot, ".gitignore"), "/.session-coordination/\n")
  const before = fs.readFileSync(paths.configPath)
  const missing = invoke(paths)
  assert.equal(missing.status, 2, missing.stderr || missing.stdout)
  assert.equal(missing.output.activationPreflight, "blocked")
  assert.equal(missing.output.stateDirectory.path, paths.stateDirectory)
  assert.equal(missing.output.config.proposal, null)
  assert.equal(fs.existsSync(paths.stateDirectory), false)
  fs.mkdirSync(paths.stateDirectory, { mode: 0o700 })
  const existing = invoke(paths)
  assert.equal(existing.status, 2, existing.stderr || existing.stdout)
  assert.equal(existing.output.activationPreflight, "blocked")
  assert.equal(existing.output.stateDirectory.exists, true)
  assert.deepEqual(fs.readFileSync(paths.configPath), before)
})

test("root-private state still refuses missing ignore rules and public leaf permissions", t => {
  const paths = fixture(t)
  paths.stateDirectory = path.join(paths.repoRoot, ".session-coordination")
  write(path.join(paths.repoRoot, ".gitignore"), "/unrelated/\n")
  assert.equal(invoke(paths).status, 2)
  write(path.join(paths.repoRoot, ".gitignore"), "/.session-coordination/\n")
  fs.mkdirSync(paths.stateDirectory, { mode: 0o755 })
  const publicResult = invoke(paths)
  assert.equal(publicResult.status, 2)
  assert.match(publicResult.stdout, /current-user-owned and private/)
  assert.equal(fs.statSync(paths.stateDirectory).mode & 0o777, 0o755)
})

test("default source readiness fails closed on a tampered package-local TUI lock entry", t => {
  const paths = fixture(t, { localDependencies: true })
  const lockPath = path.join(paths.packageDirectory, "package-lock.json")
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
  lock.packages["node_modules/@opentui/core"].integrity = "sha1-fabricated"
  json(lockPath, lock)
  const before = fs.readFileSync(paths.configPath)
  const result = invoke(paths, [], {}, true)
  assert.equal(result.status, 2)
  assert.equal(result.output.sourceReadiness, "blocked")
  assert.match(JSON.stringify(result.output.checks), /SHA-512 integrity/)
  assert.deepEqual(fs.readFileSync(paths.configPath), before)
  assert.equal(fs.existsSync(paths.stateDirectory), false)
})

test("inspects the exact selected .opencode config file without proposing an entry", t => {
  const paths = fixture(t)
  const nestedConfig = path.join(paths.repoRoot, ".opencode", "opencode.json")
  write(nestedConfig, `{"plugins":[],"model":"example/model"}\n`)
  const before = fs.readFileSync(nestedConfig)
  const result = invoke(paths, ["--config", path.relative(paths.repoRoot, nestedConfig)])
  assert.equal(result.status, 2, result.stderr || result.stdout)
  assert.equal(result.output.activationPreflight, "blocked")
  assert.equal(result.output.selectedConfigEntry, "absent")
  assert.equal(result.output.config.proposal, null)
  assert.deepEqual(fs.readFileSync(nestedConfig), before)
  assert.equal(fs.existsSync(paths.stateDirectory), false)
})

test("rejects a root that disagrees with git rev-parse identity", t => {
  const paths = fixture(t)
  const result = invoke(paths, [], { PREFLIGHT_TEST_ROOT: path.join(paths.taskRoot, "different-root") })
  assert.equal(result.status, 2)
  assert.equal(result.output.activationPreflight, "blocked")
  assert.match(result.output.errors[0], /does not match git rev-parse/)
  assert.equal(result.output.liveRegistration, "not checked")
})

test("refuses symlinked config and state paths without following them", t => {
  const configPaths = fixture(t)
  const externalConfig = path.join(configPaths.taskRoot, "external-config.json")
  write(externalConfig, "{}\n")
  fs.rmSync(configPaths.configPath)
  fs.symlinkSync(externalConfig, configPaths.configPath)
  const badConfig = invoke(configPaths)
  assert.equal(badConfig.status, 2)
  assert.match(badConfig.output.errors[0], /symbolic link/)

  const statePaths = fixture(t)
  const externalState = path.join(statePaths.taskRoot, "external-state")
  fs.mkdirSync(externalState, { mode: 0o700 })
  fs.symlinkSync(externalState, statePaths.stateDirectory, "dir")
  const badState = invoke(statePaths)
  assert.equal(badState.status, 2)
  assert.match(badState.stdout, /private-state-path/)
  assert.equal(fs.lstatSync(statePaths.stateDirectory).isSymbolicLink(), true)
})

test("reports malformed config and malformed plugin entries as blockers", t => {
  const malformed = fixture(t)
  write(malformed.configPath, "{ not-json: true\n")
  const malformedResult = invoke(malformed)
  assert.equal(malformedResult.status, 2)
  assert.match(malformedResult.output.errors[0], /malformed/)

  const pluginEntry = fixture(t)
  write(pluginEntry.configPath, `{"plugins":[{"options": {"unexpected": true}}]}\n`)
  const pluginResult = invoke(pluginEntry)
  assert.equal(pluginResult.status, 2)
  assert.match(pluginResult.output.errors[0], /malformed plugin entry/)
})

test("missing and wrong-version SDK dependencies block source readiness but remain read-only", t => {
  const missing = fixture(t)
  const missingSdk = path.join(missing.dependencyRoot, "node_modules", "@opencode", "plugin")
  fs.rmSync(missingSdk, { recursive: true })
  const missingResult = invoke(missing)
  assert.equal(missingResult.status, 2)
  assert.equal(missingResult.output.sourceReadiness, "blocked")
  assert.equal(missingResult.output.config.proposal, null)
  assert.match(JSON.stringify(missingResult.output.checks), /installation path is unavailable/)
  assert.equal(fs.existsSync(missing.stateDirectory), false)

  const wrong = fixture(t)
  json(path.join(wrong.dependencyRoot, "node_modules", "@opencode", "plugin", "package.json"), {
    name: "@opencode/plugin", version: "2.0.0", exports: { ".": { types: "./dist/promise/index.d.ts" }, "./tui": { types: "./dist/tui/index.d.ts" } },
  })
  const wrongResult = invoke(wrong)
  assert.equal(wrongResult.status, 2)
  assert.equal(wrongResult.output.sourceReadiness, "blocked")
  assert.match(JSON.stringify(wrongResult.output.checks), /installed version mismatch/)
})

test("reports a still-present retired entry as a blocker and never rewrites it", t => {
  const paths = fixture(t)
  const before = `{"plugins":[{"package":"./tools/session-coordination","options":{"stateDirectory":"/tmp/other"}}]}\n`
  write(paths.configPath, before)
  const result = invoke(paths)
  assert.equal(result.status, 2)
  assert.equal(result.output.activationPreflight, "blocked")
  assert.equal(result.output.selectedConfigEntry, "present")
  assert.equal(result.output.config.proposal, null)
  assert.match(JSON.stringify(result.output.checks), /retired coordination package is still referenced/)
  assert.equal(fs.readFileSync(paths.configPath, "utf8"), before)
})

test("reports unavailable OpenCode CLI without querying a service or claiming live status", t => {
  const paths = fixture(t)
  const onlyGit = path.join(paths.taskRoot, "only-git")
  fs.mkdirSync(onlyGit, { mode: 0o700 })
  fs.copyFileSync(path.join(paths.binDirectory, "git"), path.join(onlyGit, "git"))
  fs.chmodSync(path.join(onlyGit, "git"), 0o700)
  const result = invoke(paths, [], { PATH: onlyGit })
  assert.equal(result.status, 2)
  assert.equal(result.output.sourceReadiness, "ready-source")
  assert.equal(result.output.activationPreflight, "blocked")
  assert.match(JSON.stringify(result.output.checks), /OpenCode CLI was not found/)
  assert.equal(result.output.liveRegistration, "not checked")
})

test("rejects config and dependency paths outside the selected worktree", t => {
  const paths = fixture(t)
  const outsideConfig = path.join(paths.taskRoot, "other.json")
  write(outsideConfig, "{}\n")
  const configResult = invoke(paths, ["--config", outsideConfig])
  assert.equal(configResult.status, 2)
  assert.match(configResult.output.errors[0], /explicitly selected project/)

  const dependencyResult = invoke(paths, ["--dependency-package", outsideConfig])
  assert.equal(dependencyResult.status, 2)
  assert.match(JSON.stringify(dependencyResult.output.checks), /escapes the selected worktree/)
})
