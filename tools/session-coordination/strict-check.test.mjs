import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { hashTree, resolveDependencyBundle, runCompiler, validateAcquiredTypeRoot } from "./strict-check.mjs"

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const SCRATCH_ROOT = "/tmp/opencode"
const EXPECTED = {
  typescript: "5.9.3",
  "@types/node": "24.12.2",
  "@opencode/plugin": "2.1.1",
  "@opencode/theme": "2.1.1",
  "@opentui/core": "0.6.6",
  "@opentui/solid": "0.6.6",
  "solid-js": "1.9.12",
}
const SOURCE_DEV_DEPENDENCIES = {
  "@opencode/theme": EXPECTED["@opencode/theme"],
  "@opentui/core": EXPECTED["@opentui/core"],
  "@opentui/solid": EXPECTED["@opentui/solid"],
  "@types/json-schema": "7.0.15",
  "@types/node": EXPECTED["@types/node"],
  ajv: "8.20.0",
  "solid-js": EXPECTED["solid-js"],
  typescript: EXPECTED.typescript,
}
const LOCK_INTEGRITY = `sha512-${"A".repeat(44)}`
const JSON_SCHEMA_INTEGRITY = "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA=="

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

function write(filePath, text, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, text, { mode })
}

function json(filePath, value) {
  write(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function fixture(t) {
  const baseInfo = fs.lstatSync(SCRATCH_ROOT)
  assert.equal(baseInfo.isSymbolicLink(), false)
  assert.equal(baseInfo.uid, process.getuid())
  const taskRoot = fs.mkdtempSync(path.join(SCRATCH_ROOT, "coordination-strict-tests-"))
  t.after(() => fs.rmSync(taskRoot, { recursive: true, force: true }))
  const repoRoot = path.join(taskRoot, "repo")
  const packageDirectory = path.join(repoRoot, "tools", "session-coordination")
  const dependencyRoot = path.join(repoRoot, "tools", "opencode-plugins", "resource-monitor")
  fs.mkdirSync(packageDirectory, { recursive: true, mode: 0o700 })
  fs.mkdirSync(dependencyRoot, { recursive: true, mode: 0o700 })
  const packageManifest = {
    name: "opencode-session-coordination",
    version: "0.1.0",
    private: true,
    type: "module",
    peerDependencies: { "@opencode/plugin": EXPECTED["@opencode/plugin"] },
    devDependencies: SOURCE_DEV_DEPENDENCIES,
  }
  json(path.join(packageDirectory, "package.json"), packageManifest)
  const sourceLockPackages = Object.fromEntries(Object.entries({
    ...SOURCE_DEV_DEPENDENCIES,
    "@opencode/plugin": EXPECTED["@opencode/plugin"],
  }).map(([name, version]) => [`node_modules/${name}`, lockEntry(name, version, name === "@types/json-schema" ? JSON_SCHEMA_INTEGRITY : LOCK_INTEGRITY)]))
  json(path.join(packageDirectory, "package-lock.json"), { lockfileVersion: 3, packages: { "": lockRoot(packageManifest), ...sourceLockPackages } })
  json(path.join(packageDirectory, "tsconfig.json"), {
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: false, types: ["node"] },
    include: ["*.ts", "test/*.ts"],
  })
  const dependencyManifest = {
    name: "fixture-dependencies",
    version: "0.1.0",
    dependencies: { "@opencode/plugin": EXPECTED["@opencode/plugin"] },
    devDependencies: Object.fromEntries(Object.entries(EXPECTED).filter(([name]) => name !== "@opencode/plugin")),
  }
  json(path.join(dependencyRoot, "package.json"), dependencyManifest)
  const lockPackages = Object.fromEntries(Object.entries(EXPECTED).map(([name, version]) => [`node_modules/${name}`, lockEntry(name, version)]))
  json(path.join(dependencyRoot, "package-lock.json"), { lockfileVersion: 3, packages: { "": lockRoot(dependencyManifest), ...lockPackages } })

  const modules = path.join(dependencyRoot, "node_modules")
  const typescript = path.join(modules, "typescript")
  const sdk = path.join(modules, "@opencode", "plugin")
  const nodeTypes = path.join(modules, "@types", "node")
  json(path.join(typescript, "package.json"), { name: "typescript", version: EXPECTED.typescript })
  write(path.join(typescript, "bin", "tsc"), `
const fs = require("node:fs")
const project = process.argv[process.argv.indexOf("--project") + 1]
const config = JSON.parse(fs.readFileSync(project, "utf8"))
if (process.env.STRICT_CHECK_CAPTURE) fs.writeFileSync(process.env.STRICT_CHECK_CAPTURE, JSON.stringify({ config, args: process.argv.slice(2) }))
if (process.env.STRICT_CHECK_FAIL === "true") {
  process.stderr.write("fixture TS7016 diagnostic\\n")
  process.exit(2)
}
process.stdout.write("fixture compiler ran\\n")
`, 0o600)
  const sdkManifest = {
    name: "@opencode/plugin",
    version: EXPECTED["@opencode/plugin"],
    exports: {
      ".": { types: "./dist/promise/index.d.ts" },
      "./tui": { types: "./dist/tui/index.d.ts" },
      "./*": { types: "./dist/*.d.ts" },
    },
  }
  json(path.join(sdk, "package.json"), sdkManifest)
  write(path.join(sdk, "dist", "promise", "index.d.ts"), "export declare const fixture: true\n")
  write(path.join(sdk, "dist", "tui", "index.d.ts"), "export declare const fixtureTui: true\n")
  write(path.join(sdk, "dist", "tui", "context.d.ts"), "export declare const fixtureContext: true\n")
  json(path.join(nodeTypes, "package.json"), { name: "@types/node", version: EXPECTED["@types/node"], types: "index.d.ts" })
  write(path.join(nodeTypes, "index.d.ts"), "declare namespace NodeJS { interface ProcessEnv { [key: string]: string | undefined } }\n")
  for (const name of ["@opencode/theme", "@opentui/core", "@opentui/solid", "solid-js"]) {
    json(path.join(modules, ...name.split("/"), "package.json"), { name, version: EXPECTED[name] })
  }

  return { taskRoot, repoRoot, packageDirectory, dependencyRoot, dependencyPackage: path.join(dependencyRoot, "package.json"), typescript, nodeTypes, sdk }
}

test("resolves exact in-worktree compiler, Node types, SDK exports, and integrity-pinned lock entries", t => {
  const paths = fixture(t)
  const bundle = resolveDependencyBundle({ repoRoot: paths.repoRoot, packageDirectory: paths.packageDirectory, dependencyPackage: paths.dependencyPackage })
  assert.equal(bundle.compiler.version, EXPECTED.typescript)
  assert.equal(bundle.nodeTypes.version, EXPECTED["@types/node"])
  assert.equal(bundle.sdk.version, EXPECTED["@opencode/plugin"])
  assert.equal(bundle.sdk.entries.server, path.join(paths.sdk, "dist/promise/index.d.ts"))
  assert.equal(bundle.sdk.entries.tui, path.join(paths.sdk, "dist/tui/index.d.ts"))
  assert.equal(bundle.sdk.entries.wildcard, path.join(paths.sdk, "dist/*.d.ts"))
  assert.ok(bundle.compiler.lockEntry.integrity.startsWith("sha512-"))
})

test("refuses an absent compiler and a wrong installed SDK version", t => {
  const paths = fixture(t)
  fs.rmSync(path.join(paths.typescript, "package.json"))
  assert.throws(() => resolveDependencyBundle({ repoRoot: paths.repoRoot, packageDirectory: paths.packageDirectory, dependencyPackage: paths.dependencyPackage }), /typescript manifest path is unavailable/)

  json(path.join(paths.typescript, "package.json"), { name: "typescript", version: EXPECTED.typescript })
  json(path.join(paths.sdk, "package.json"), { name: "@opencode/plugin", version: "2.1.0", exports: { ".": { types: "./dist/promise/index.d.ts" }, "./tui": { types: "./dist/tui/index.d.ts" } } })
  assert.throws(() => resolveDependencyBundle({ repoRoot: paths.repoRoot, packageDirectory: paths.packageDirectory, dependencyPackage: paths.dependencyPackage }), /installed version mismatch/)
})

test("refuses dependency roots or installed packages reached through symlinks", t => {
  const paths = fixture(t)
  const packagePath = path.join(paths.dependencyRoot, "node_modules", "@opencode", "plugin")
  const movedPath = path.join(paths.dependencyRoot, "node_modules", "@opencode", "plugin-real")
  fs.renameSync(packagePath, movedPath)
  fs.symlinkSync(movedPath, packagePath, "dir")
  assert.throws(() => resolveDependencyBundle({ repoRoot: paths.repoRoot, packageDirectory: paths.packageDirectory, dependencyPackage: paths.dependencyPackage }), /symbolic link/)
})

test("compiler runs from a private scratch config without weakening strict library checking", t => {
  const paths = fixture(t)
  const bundle = resolveDependencyBundle({ repoRoot: paths.repoRoot, packageDirectory: paths.packageDirectory, dependencyPackage: paths.dependencyPackage })
  const capture = path.join(paths.taskRoot, "compiler-capture.json")
  const prior = process.env.STRICT_CHECK_CAPTURE
  process.env.STRICT_CHECK_CAPTURE = capture
  try {
    assert.equal(runCompiler({ bundle, baseConfigPath: path.join(paths.packageDirectory, "tsconfig.json"), typesRoot: null, timeout: 10_000 }), 0)
  } finally {
    if (prior === undefined) delete process.env.STRICT_CHECK_CAPTURE
    else process.env.STRICT_CHECK_CAPTURE = prior
  }
  const captured = JSON.parse(fs.readFileSync(capture, "utf8"))
  assert.equal(captured.config.compilerOptions.strict, true)
  assert.equal(captured.config.compilerOptions.noEmit, true)
  assert.equal(captured.config.compilerOptions.skipLibCheck, false)
  assert.equal(captured.config.compilerOptions.paths["@opencode/plugin"][0], bundle.sdk.entries.server)
  assert.equal(captured.config.compilerOptions.paths["@opencode/plugin/*"][0], bundle.sdk.entries.wildcard)
  assert.equal(fs.existsSync(path.dirname(captured.args[captured.args.indexOf("--project") + 1])), false)
})

test("compiler diagnostics and nonzero status are preserved", t => {
  const paths = fixture(t)
  const bundle = resolveDependencyBundle({ repoRoot: paths.repoRoot, packageDirectory: paths.packageDirectory, dependencyPackage: paths.dependencyPackage })
  const prior = process.env.STRICT_CHECK_FAIL
  process.env.STRICT_CHECK_FAIL = "true"
  try {
    assert.equal(runCompiler({ bundle, baseConfigPath: path.join(paths.packageDirectory, "tsconfig.json"), typesRoot: null, timeout: 10_000 }), 2)
  } finally {
    if (prior === undefined) delete process.env.STRICT_CHECK_FAIL
    else process.env.STRICT_CHECK_FAIL = prior
  }
})

test("a self-rehashed acquisition receipt cannot authenticate fabricated json-schema declarations", t => {
  const paths = fixture(t)
  const typeRoot = path.join(paths.taskRoot, "node_modules", "@types")
  const packageDirectory = path.join(typeRoot, "json-schema")
  json(path.join(packageDirectory, "package.json"), {
    name: "@types/json-schema", version: "7.0.15", types: "index.d.ts",
  })
  write(path.join(packageDirectory, "index.d.ts"), "export interface JSONSchema7 { fabricated: true }\n")
  const tree = hashTree(packageDirectory)
  const integrity = "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA=="
  json(path.join(typeRoot, ".coordination-types-receipt.json"), {
    packageName: "@types/json-schema", version: "7.0.15", registry: "https://registry.npmjs.org",
    registryIntegrity: integrity, tarballSha512: integrity.slice("sha512-".length),
    packageTreeSha256: tree.sha256, packageFileCount: tree.files,
  })
  assert.throws(() => validateAcquiredTypeRoot(typeRoot), /pinned declaration bytes/)
})

function bundleAtFilesystemBoundary(paths, operation) {
  const moduleUrl = new URL("./strict-check.mjs", import.meta.url).href
  const boundary = `export * from "node:fs";
    import * as fs from "node:fs";
    import { execFileSync } from "node:child_process";
    let changed = false;
    function change(file) {
      if (!changed && file === ${JSON.stringify(paths.dependencyPackage)}) {
        changed = true;
        ${operation}
      }
    }
    export function readFileSync(file, ...args) { change(file); return fs.readFileSync(file, ...args); }
    export function openSync(file, ...args) { change(file); return fs.openSync(file, ...args); }
  `
  const script = `
    import { registerHooks } from "node:module";
    registerHooks({resolve(specifier, context, next) {
      if (specifier === "node:fs" && context.parentURL === ${JSON.stringify(moduleUrl)})
        return {url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(boundary)}`)}, shortCircuit:true};
      return next(specifier, context);
    }});
    const {resolveDependencyBundle} = await import(${JSON.stringify(moduleUrl)});
    try {
      resolveDependencyBundle(${JSON.stringify({ repoRoot: paths.repoRoot, packageDirectory: paths.packageDirectory, dependencyPackage: paths.dependencyPackage })});
      process.stdout.write(JSON.stringify({blocked:false}));
    } catch (error) { process.stdout.write(JSON.stringify({blocked:true,error:error.message})); }
  `
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", timeout: 5_000 })
  assert.equal(result.error, undefined, "bounded manifest reads must not wait for a FIFO writer")
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test("a manifest growing after inspection cannot escape the allocation bound", t => {
  const paths = fixture(t)
  const result = bundleAtFilesystemBoundary(paths, 'fs.appendFileSync(file, " ".repeat(2 * 1024 * 1024));')
  assert.equal(result.blocked, true)
  assert.match(result.error, /limit|changed/)
})

test("a manifest replaced by a FIFO before open fails without blocking", t => {
  const paths = fixture(t)
  const result = bundleAtFilesystemBoundary(paths, 'fs.unlinkSync(file); execFileSync("mkfifo", [file]);')
  assert.equal(result.blocked, true)
  assert.match(result.error, /regular file|changed/)
})

test("CLI documents offline-by-default acquisition and rejects out-of-worktree dependency selection", () => {
  const script = path.join(REPOSITORY_ROOT, "tools/session-coordination/strict-check.mjs")
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8", timeout: 10_000 })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /default dependency bundle is this package's exact package\.json\/package-lock\.json/)
  assert.match(help.stdout, /declaration check is offline by default/)
  const outside = spawnSync(process.execPath, [script, "--dependency-package", "/tmp/opencode/not-a-repository/package.json"], { encoding: "utf8", timeout: 10_000 })
  assert.equal(outside.status, 2)
  assert.match(outside.stderr, /escapes the selected worktree/)
})
