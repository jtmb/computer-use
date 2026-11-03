// Synthetic fixtures only: real files under /tmp/opencode, with a fake *read-only git boundary*
// that supplies tracked-file facts. Nothing here runs a compiler, imports Bun, or touches the
// pinned checkout. Fixtures and stage workspaces are retained, never reused or deleted.
import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import { mock } from "node:test"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  CLIENT_GENERATED,
  PACKAGES,
  PINNED_HEAD,
  ROOT_FILES,
  StageRefusal,
  createStage,
  preflight,
  stage,
} from "./typecheck-stage.mjs"

const BASE = "/tmp/opencode"

function prepareFixtureBase(directory) {
  assert.equal(fs.realpathSync(path.dirname(directory)), path.dirname(directory), "fixture parent must be canonical")
  try { fs.mkdirSync(directory, { mode: 0o700 }) } catch (error) {
    if (error.code !== "EEXIST") throw error
  }
  const stat = fs.lstatSync(directory)
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), "fixture base must be a real directory")
  assert.equal(fs.realpathSync(directory), directory, "fixture base must be canonical")
  assert.equal(stat.uid, process.getuid(), "fixture base must belong to the test user")
}

// Hosted CI may not have the approved scratch directory yet; never chmod an existing one.
prepareFixtureBase(BASE)

const DEPS = {
  core: ["ai", "codemode", "plugin", "plugin-browser", "schema", "util", "http-recorder"],
  server: ["client", "core", "plugin", "protocol", "schema", "simulation", "util"],
  plugin: ["ai", "client", "protocol", "schema", "theme", "util"],
  client: ["httpapi-codegen", "protocol", "schema"],
  protocol: ["schema"],
  schema: [],
  util: [],
  ai: ["schema", "http-recorder"],
  theme: [],
  simulation: ["ai", "core", "plugin", "protocol", "util"],
  "httpapi-codegen": [],
  codemode: [],
  "plugin-browser": ["plugin", "schema"],
  "http-recorder": [],
  script: [],
}

const fixture = () => fs.mkdtempSync(path.join(BASE, "tsstage-fixture-"))

function link(nmDir, spec, target) {
  const destination = path.join(nmDir, ...spec.split("/"))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.symlinkSync(target, destination)
}

function walkFiles(root, relative = "") {
  const out = []
  const absolute = path.join(root, relative)
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "store") continue
      out.push(...walkFiles(root, child))
      continue
    }
    out.push(child)
  }
  return out.sort()
}

function fakeGit({ head = PINNED_HEAD, status = "", files, raw } = {}) {
  return (args) => {
    const command = args[0]
    const ok = (stdout) => ({ status: 0, stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout), stderr: Buffer.alloc(0) })
    if (command === "rev-parse") return ok(`${head}\n`)
    if (command === "status") return ok(status)
    if (command === "ls-files") {
      if (raw !== undefined) return ok(raw)
      return ok(files.map((file) => `${file}\0`).join(""))
    }
    throw new Error(`unexpected git command ${command}`)
  }
}

function buildFixture({ after } = {}) {
  const root = fixture()
  const write = (relative, content) => {
    const absolute = path.join(root, relative)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, content)
  }

  write("package.json", JSON.stringify({
    name: "opencode",
    version: "2.1.1",
    private: true,
    dependencies: { "@opencode/script": "workspace:*", "@opencode/plugin": "workspace:*" },
    devDependencies: { "@opencode/client": "workspace:*", effect: "4.0.1" },
  }, null, 2))
  write("bun.lock", "// synthetic lock\n")
  write("bunfig.toml", "[install]\n")
  write("tsconfig.json", JSON.stringify({ extends: "@tsconfig/bun/tsconfig.json" }, null, 2))
  write("store/effect/package.json", JSON.stringify({ name: "effect", version: "4.0.1" }))
  write("store/@types/bun/package.json", JSON.stringify({ name: "@types/bun", version: "1.4.0" }))

  for (const name of PACKAGES) {
    write(`packages/${name}/package.json`, JSON.stringify({
      name: `@opencode/${name}`,
      ...(name === "script" ? {} : { version: "2.1.1" }),
      exports: { ".": "./src/index.ts" },
      dependencies: Object.fromEntries((DEPS[name] ?? []).filter(dep => dep !== "http-recorder").map((dep) => [`@opencode/${dep}`, "workspace:*"])),
      ...(["core", "ai"].includes(name) ? { devDependencies: { "@opencode/http-recorder": "workspace:*" } } : {}),
    }, null, 2))
    write(`packages/${name}/tsconfig.json`, JSON.stringify({
      extends: "@tsconfig/bun/tsconfig.json",
      compilerOptions: { types: ["bun"] },
      include: ["src"],
    }, null, 2))
    write(`packages/${name}/src/index.ts`, `export const value = "${name}"\n`)

    const modules = path.join(root, "packages", name, "node_modules")
    fs.mkdirSync(modules, { recursive: true })
    link(modules, "effect", path.join(root, "store/effect"))
    link(modules, "@types/bun", path.join(root, "store/@types/bun"))
    for (const dep of DEPS[name] ?? []) link(modules, `@opencode/${dep}`, path.join(root, "packages", dep))
  }

  write("packages/core/tsconfig.tests.json", JSON.stringify({ extends: "./tsconfig.json", include: ["test"] }, null, 2))
  write("packages/core/drizzle.config.ts", "export default {}\n")
  write("packages/core/script/build.ts", "console.log('build')\n")
  write("packages/core/test/lib/effect.ts", "export {}\n")
  write("packages/plugin-browser/tsconfig.test.json", JSON.stringify({ extends: "./tsconfig.json" }, null, 2))

  for (const dir of CLIENT_GENERATED) write(`${dir}/client.ts`, `// generated for ${dir}\n`)

  const rootModules = path.join(root, "node_modules")
  fs.mkdirSync(path.join(rootModules, ".bin"), { recursive: true })
  fs.writeFileSync(path.join(rootModules, ".bin", "tsc"), "#!/bin/sh\n")
  fs.chmodSync(path.join(rootModules, ".bin", "tsc"), 0o755)
  link(rootModules, "effect", path.join(root, "store/effect"))
  link(rootModules, "@opencode/client", path.join(root, "packages/client"))
  link(rootModules, "@opencode/plugin", path.join(root, "packages/plugin"))
  link(rootModules, "@opencode/script", path.join(root, "packages/script"))

  const context = { root, write, files: walkFiles(root) }
  if (after) after(context)
  return { root, files: context.files, git: (options) => fakeGit({ files: context.files, ...options }) }
}

async function refusal(promise, code) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof StageRefusal, `expected StageRefusal, got ${error}`)
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    return error
  }
  assert.fail(`expected refusal ${code}`)
}

const stageFixture = (built, options = {}) => stage({ nativeRoot: built.root, runGit: built.git(), ...options })

test("stages the complete reviewed 15-package set with a success receipt", async () => {
  const built = buildFixture()
  const result = await stageFixture(built)
  assert.ok(fs.lstatSync(result.root).isDirectory())
  assert.equal(result.receipt.status, "success")
  assert.deepEqual(result.receipt.selectedPackages, PACKAGES)
  assert.equal(result.receipt.closure, "fixed reviewed package set; not a discovered or universal dynamic closure")
  assert.equal(result.receipt.counts.files, built.files.length - CLIENT_GENERATED.length * 1)
  assert.ok(result.receipt.notes.includes("no compiler executed"))
  assert.ok(result.receipt.notes.includes("no TypeScript program enumeration"))
  assert.ok(result.receipt.notes.includes("no type or diagnostic claim"))
})

test("copies tracked configs and manifests byte for byte", async () => {
  const built = buildFixture()
  const result = await stageFixture(built)
  for (const relative of [
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "tsconfig.json",
    "packages/core/tsconfig.json",
    "packages/core/tsconfig.tests.json",
    "packages/core/drizzle.config.ts",
    "packages/core/script/build.ts",
    "packages/plugin-browser/tsconfig.test.json",
    "packages/util/package.json",
  ]) {
    const source = fs.readFileSync(path.join(built.root, relative))
    const staged = fs.readFileSync(path.join(result.root, relative))
    assert.deepEqual(staged, source, relative)
    const recorded = result.receipt.files.find((file) => file.path === relative)
    assert.equal(recorded.size, source.length, relative)
  }
})

test("binds every selected workspace package to the staged copy", async () => {
  const built = buildFixture()
  const result = await stageFixture(built)
  const staged = new Set()
  for (const link of result.receipt.links.root) if (link.kind === "staged") staged.add(link.spec)
  for (const [name, links] of Object.entries(result.receipt.links.packages)) {
    for (const link of links) {
      if (link.kind !== "staged") continue
      assert.ok(link.resolved.startsWith(result.root + path.sep), `${name} ${link.spec}`)
      staged.add(link.spec)
    }
  }
  for (const dep of ["@opencode/client", "@opencode/plugin", "@opencode/schema", "@opencode/core"]) {
    assert.ok([...staged].includes(dep), `missing staged binding for ${dep}`)
  }
  for (const entry of result.receipt.declaredWorkspaceDependencies) {
    for (const dependency of entry.deps) {
      assert.ok(staged.has(dependency.spec), `${entry.label} declares ${dependency.name} without a staged binding`)
    }
  }
  const utilLink = result.receipt.links.packages.core.find((link) => link.spec === "@opencode/util")
  assert.equal(utilLink.kind, "staged")
  assert.equal(utilLink.resolved, path.join(result.root, "packages", "util"))
})

test("keeps node_modules real and private and leaves fresh generated directories", async () => {
  const built = buildFixture()
  const result = await stageFixture(built)
  assert.equal(fs.lstatSync(result.root).mode & 0o777, 0o700)
  const roots = [path.join(result.root, "node_modules"), ...PACKAGES.map((name) => path.join(result.root, "packages", name, "node_modules"))]
  for (const modules of roots) {
    const stat = fs.lstatSync(modules)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), modules)
    assert.equal(stat.mode & 0o777, 0o700, modules)
  }
  assert.equal(fs.existsSync(path.join(result.root, "packages", "core", "node_modules", ".ts-dist")), false)
  for (const dir of CLIENT_GENERATED) {
    const absolute = path.join(result.root, ...dir.split("/"))
    const stat = fs.lstatSync(absolute)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), dir)
    assert.deepEqual(fs.readdirSync(absolute), [], dir)
  }
  assert.equal(fs.lstatSync(result.receiptPath).mode & 0o777, 0o600)
  assert.equal(fs.lstatSync(path.join(result.root, "packages", "util", "src", "index.ts")).mode & 0o777, 0o600)
})

test("links external dependencies absolutely and never into the stage", async () => {
  const built = buildFixture()
  const result = await stageFixture(built)
  const links = [...result.receipt.links.root, ...Object.values(result.receipt.links.packages).flat()]
  const external = links.filter((entry) => entry.kind === "external")
  assert.ok(external.length > 0)
  for (const entry of external) {
    assert.ok(path.isAbsolute(entry.target), entry.spec)
    assert.equal(entry.resolved, fs.realpathSync(entry.target))
    assert.ok(!entry.resolved.startsWith(result.root + path.sep), `${entry.spec} resolved into the stage`)
  }
  const bin = fs.lstatSync(path.join(result.root, "node_modules", ".bin"))
  assert.ok(bin.isSymbolicLink())
})

test("refuses a pin mismatch before allocating", async () => {
  const built = buildFixture()
  const error = await refusal(stageFixture(built, { runGit: fakeGit({ head: "0".repeat(40), files: built.files }) }), "headMismatch")
  assert.equal(error.allocated, false)
})

test("refuses a dirty scoped worktree", async () => {
  const built = buildFixture()
  await refusal(stageFixture(built, { runGit: fakeGit({ files: built.files, status: " M packages/core/src/bus.ts\n" }) }), "dirtyWorktree")
})

test("refuses missing required config", async () => {
  const built = buildFixture({
    after: ({ root, files }) => {
      fs.rmSync(path.join(root, "packages/core/tsconfig.tests.json"))
      files.splice(files.indexOf("packages/core/tsconfig.tests.json"), 1)
    },
  })
  await refusal(stageFixture(built), "missingRequiredInput")
})

test("refuses unsafe tracked paths", async () => {
  const built = buildFixture()
  await refusal(stageFixture(built, { runGit: fakeGit({ files: [...built.files, "../escape.ts"] }) }), "unsafePath")
})

test("refuses symlinked inputs", async () => {
  const built = buildFixture({
    after: ({ root, files }) => {
      const target = path.join(root, "packages/theme/src/index.ts")
      fs.rmSync(target)
      fs.symlinkSync(path.join(root, "packages/theme/src/index.ts.bak"), target)
      fs.writeFileSync(path.join(root, "packages/theme/src/index.ts.bak"), "export {}\n")
      files.push("packages/theme/src/index.ts.bak")
    },
  })
  await refusal(stageFixture(built), "symlinkSource")
})

test("refuses a file over the per-file bound", async () => {
  const built = buildFixture({
    after: ({ root, files }) => {
      const absolute = path.join(root, "packages/httpapi-codegen/src/big.ts")
      fs.writeFileSync(absolute, "x".repeat(2 * 1024 * 1024 + 1))
      files.push("packages/httpapi-codegen/src/big.ts")
      files.sort()
    },
  })
  await refusal(stageFixture(built), "fileTooLarge")
})

test("refuses an aggregate over a reduced limit", async () => {
  const built = buildFixture()
  await refusal(stageFixture(built, { limits: { maxAggregateBytes: 1024 } }), "aggregateTooLarge")
})

test("refuses duplicate tracked paths", async () => {
  const built = buildFixture()
  await refusal(stageFixture(built, { runGit: fakeGit({ files: [...built.files, "bun.lock"] }) }), "duplicateInput")
})

test("refuses an existing destination", async () => {
  const built = buildFixture()
  const destination = fs.mkdtempSync(path.join(BASE, "tsstage-destination-"))
  await refusal(stageFixture(built, { destination }), "destinationExists")
})

test("refuses a source mutation between acquisition and staging and retains the workspace", async () => {
  const built = buildFixture()
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git() })
  fs.appendFileSync(path.join(built.root, "packages/util/src/index.ts"), "// changed\n")
  const error = await refusal(createStage(plan), "sourceMutated")
  assert.equal(error.allocated, true)
  assert.ok(error.stageRoot && fs.existsSync(error.stageRoot))
  const receipt = JSON.parse(fs.readFileSync(path.join(error.stageRoot, "typecheck-stage-receipt.json"), "utf8"))
  assert.equal(receipt.status, "failed")
  assert.equal(receipt.error.code, "sourceMutated")
})

test("refuses an unselected workspace link", async () => {
  const built = buildFixture({
    after: ({ root }) => {
      fs.mkdirSync(path.join(root, "packages/extra"), { recursive: true })
      fs.writeFileSync(path.join(root, "packages/extra/package.json"), JSON.stringify({ name: "@opencode/extra" }))
      link(path.join(root, "node_modules"), "@opencode/extra", path.join(root, "packages/extra"))
    },
  })
  const error = await refusal(stageFixture(built), "unselectedWorkspaceLink")
  assert.equal(error.detail.package, "extra")
})

test("refuses an unselected workspace dependency", async () => {
  const built = buildFixture({
    after: ({ root, files }) => {
      const manifest = path.join(root, "packages/theme/package.json")
      const value = JSON.parse(fs.readFileSync(manifest, "utf8"))
      value.dependencies = { "@opencode/extra": "workspace:*" }
      fs.writeFileSync(manifest, JSON.stringify(value, null, 2))
      assert.ok(files.includes("packages/theme/package.json"))
    },
  })
  await refusal(stageFixture(built), "workspaceDependencyUnselected")
})

test("refuses a broken dependency link", async () => {
  const built = buildFixture({
    after: ({ root }) => {
      const modules = path.join(root, "packages/schema/node_modules")
      fs.rmSync(path.join(modules, "effect"))
      link(modules, "effect", path.join(root, "store/missing"))
    },
  })
  await refusal(stageFixture(built), "dependencyTargetMissing")
})

test("refuses untracked files inside a selected package", async () => {
  const built = buildFixture({
    after: ({ root }) => fs.writeFileSync(path.join(root, "packages/schema/src/extra.ts"), "export {}\n"),
  })
  await refusal(stageFixture(built), "untrackedInput")
})

test("refuses non-regular inputs", async () => {
  const built = buildFixture({
    after: ({ root }) => {
      const target = path.join(root, "packages/theme/src/index.ts")
      fs.rmSync(target)
      fs.mkdirSync(target)
    },
  })
  await refusal(stageFixture(built), "nonRegularInput")
})

test("refuses a limit increase", async () => {
  const built = buildFixture()
  await refusal(stageFixture(built, { limits: { maxFiles: 10001 } }), "limitOverride")
})

test("refuses when the acquisition deadline is exceeded", async () => {
  const built = buildFixture()
  let calls = 0
  const now = () => (calls++ === 0 ? 0 : 1_000_000)
  await refusal(stageFixture(built, { limits: { timeoutMs: 5 }, now }), "acquisitionTimeout")
})

test("refuses oversized git metadata", async () => {
  const built = buildFixture()
  await refusal(stageFixture(built, { runGit: fakeGit({ raw: Buffer.alloc(2 * 1024 * 1024 + 1, 0x61) }) }), "gitOutputTooLarge")
})

test("a file grown after metadata cannot evade the shared acquisition budget", async () => {
  const built = buildFixture()
  const target = path.join(built.root, "bun.lock")
  const total = built.files.filter(file => !CLIENT_GENERATED.some(dir => file.startsWith(dir + "/")))
    .reduce((sum, file) => sum + fs.statSync(path.join(built.root, file)).size, 0)
  const open = fs.openSync
  let changed = false
  const hook = mock.method(fs, "openSync", function (file, ...args) {
    if (!changed && file === target) {
      changed = true
      fs.appendFileSync(target, "x".repeat(128))
    }
    return open.call(fs, file, ...args)
  })
  try {
    await refusal(preflight({ nativeRoot: built.root, runGit: built.git(), limits: { maxAggregateBytes: total + 64 } }), "sourceMutated")
    assert.equal(changed, true)
  } finally { hook.mock.restore() }
})

test("the acquisition deadline is checked after the last successful read", async () => {
  const built = buildFixture()
  const staged = built.files.filter(file => !CLIENT_GENERATED.some(dir => file.startsWith(dir + "/"))).sort()
  const last = path.join(built.root, staged.at(-1))
  let clock = 0
  const read = fs.readSync
  const hook = mock.method(fs, "readSync", function (fd, ...args) {
    const count = read.call(fs, fd, ...args)
    if (fs.readlinkSync(`/proc/self/fd/${fd}`) === last) clock = 1001
    return count
  })
  try {
    await refusal(preflight({ nativeRoot: built.root, runGit: built.git(), limits: { timeoutMs: 1000 }, now: () => clock }), "acquisitionTimeout")
  } finally { hook.mock.restore() }
})

test("an ancestor alias is not accepted as a canonical native source root", async () => {
  const built = buildFixture()
  const parent = fixture()
  fs.symlinkSync(path.dirname(built.root), path.join(parent, "alias"))
  const alias = path.join(parent, "alias", path.basename(built.root))
  await refusal(preflight({ nativeRoot: alias, runGit: built.git() }), "nativeRoot")
})

test("a staged plan cannot be redirected by mutating the checked base directory", async () => {
  const built = buildFixture()
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git() })
  const alternate = fixture()
  try { plan.baseDir = alternate } catch (error) {
    assert.ok(error instanceof TypeError)
    assert.deepEqual(fs.readdirSync(alternate), [])
    return
  }
  await refusal(createStage(plan), "invalidPlan")
  assert.deepEqual(fs.readdirSync(alternate), [], "a modified plan must refuse before allocation")
})

// --- additional controls for the hardened acquisition/plan checks ------------------------------

const stagedFiles = (files) =>
  files.filter((file) => !CLIENT_GENERATED.some((dir) => file.startsWith(dir + "/"))).sort()

test("accepts the exact aggregate budget and refuses one byte less", async () => {
  const built = buildFixture()
  const total = stagedFiles(built.files).reduce((sum, file) => sum + fs.statSync(path.join(built.root, file)).size, 0)
  const exact = await stageFixture(built, { limits: { maxAggregateBytes: total } })
  assert.equal(exact.receipt.status, "success")
  await refusal(stageFixture(built, { limits: { maxAggregateBytes: total - 1 } }), "aggregateTooLarge")
})

test("a growth inside the aggregate budget is still refused as a source mutation", async () => {
  const built = buildFixture()
  const target = path.join(built.root, "bunfig.toml")
  const open = fs.openSync
  let changed = false
  const hook = mock.method(fs, "openSync", function (file, ...args) {
    if (!changed && file === target) {
      changed = true
      fs.appendFileSync(target, "y".repeat(8))
    }
    return open.call(fs, file, ...args)
  })
  try {
    await refusal(preflight({ nativeRoot: built.root, runGit: built.git() }), "sourceMutated")
    assert.equal(changed, true)
  } finally {
    hook.mock.restore()
  }
})

test("stages only the reviewed scopes and copies no native neighbour", async () => {
  const built = buildFixture()
  const result = await stageFixture(built)
  for (const file of result.receipt.files) {
    const inScope = ROOT_FILES.includes(file.path) || PACKAGES.some((name) => file.path.startsWith(`packages/${name}/`))
    assert.ok(inScope, `copied an out-of-scope input: ${file.path}`)
  }
  for (const absent of ["packages/unreviewed", "packages/extra", "README.md", ".opencode"]) {
    assert.equal(fs.existsSync(path.join(result.root, absent)), false, absent)
  }
})

test("excludes only the client generated trees, not lookalike paths elsewhere", async () => {
  const built = buildFixture({
    after: ({ root, files }) => {
      const lookalike = "packages/theme/src/effect/api/keep.ts"
      fs.mkdirSync(path.join(root, "packages/theme/src/effect/api"), { recursive: true })
      fs.writeFileSync(path.join(root, lookalike), "export const kept = true\n")
      files.push(lookalike)
      files.sort()
    },
  })
  const result = await stageFixture(built)
  assert.ok(result.receipt.files.some((file) => file.path === "packages/theme/src/effect/api/keep.ts"))
  for (const file of result.receipt.files) {
    assert.ok(!CLIENT_GENERATED.some((dir) => file.path.startsWith(dir + "/")), file.path)
  }
})

test("refuses a fabricated plan without allocating", async () => {
  const error = await refusal(createStage({ baseDir: BASE, files: [] }), "invalidPlan")
  assert.equal(error.allocated, false)
})

test("refuses a plan whose acquired bytes were changed after preflight", async () => {
  const built = buildFixture()
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git() })
  const file = plan.files.find((entry) => entry.path === "bunfig.toml")
  file.data[0] = file.data[0] ^ 0x01
  const error = await refusal(createStage(plan), "invalidPlan")
  assert.equal(error.allocated, false)
})

test("a leaf swapped for a FIFO before open is refused without blocking", async () => {
  const built = buildFixture()
  const target = path.join(built.root, "packages/theme/src/index.ts")
  const scratch = fixture()
  const fifo = path.join(scratch, "fifo")
  const created = spawnSync("mkfifo", [fifo], { encoding: "utf8" })
  assert.equal(created.status, 0, created.stderr)
  const open = fs.openSync
  let swapped = false
  const hook = mock.method(fs, "openSync", function (file, ...args) {
    if (!swapped && file === target) {
      swapped = true
      fs.rmSync(target)
      fs.renameSync(fifo, target)
    }
    return open.call(fs, file, ...args)
  })
  try {
    await refusal(preflight({ nativeRoot: built.root, runGit: built.git() }), "nonRegularInput")
    assert.equal(swapped, true)
  } finally {
    hook.mock.restore()
  }
})

test("an invalid manifest is refused without echoing its content", async () => {
  const built = buildFixture({
    after: ({ root }) => fs.writeFileSync(path.join(root, "packages/theme/package.json"), '{"TOPSECRET": "leak", '),
  })
  const error = await refusal(stageFixture(built), "invalidManifest")
  assert.ok(!error.message.includes("TOPSECRET"))
  assert.ok(!JSON.stringify(error.detail ?? {}).includes("TOPSECRET"))
})

test("the CLI refuses a missing or duplicated flag", () => {
  const module = fileURLToPath(new URL("./typecheck-stage.mjs", import.meta.url))
  const missing = spawnSync(process.execPath, [module, "--native"], { encoding: "utf8" })
  assert.equal(missing.status, 1)
  assert.ok(missing.stderr.includes("requires a value"))
  const duplicate = spawnSync(process.execPath, [module, "--native", "/tmp/opencode/a", "--native", "/tmp/opencode/b"], {
    encoding: "utf8",
  })
  assert.equal(duplicate.status, 1)
  assert.ok(duplicate.stderr.includes("duplicate"))
})

test("dependency-link completion cannot turn an expired job into success", async () => {
  const built = buildFixture()
  let clock = 0
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git(), now: () => clock, limits: { timeoutMs: 1000 } })
  const symlink = fs.symlinkSync
  let linked = false
  const hook = mock.method(fs, "symlinkSync", function (...args) {
    const result = symlink.call(fs, ...args)
    linked = true
    clock = 1001
    return result
  })
  try {
    await refusal(createStage(plan, { now: () => clock }), "acquisitionTimeout")
    assert.equal(linked, true)
  } finally { hook.mock.restore() }
})

test("a cached source ancestor must not conceal a later alias during acquisition", async () => {
  const built = buildFixture({ after: ({ root, files }) => {
    const second = "packages/theme/src/second.ts"
    fs.writeFileSync(path.join(root, second), "export const second = true\n")
    files.push(second)
  } })
  const directory = path.join(built.root, "packages/theme/src")
  const moved = path.join(fixture(), "moved-src")
  const open = fs.openSync
  let aliased = false
  const hook = mock.method(fs, "openSync", function (file, ...args) {
    if (!aliased && file === path.join(directory, "index.ts")) {
      fs.renameSync(directory, moved)
      fs.symlinkSync(moved, directory)
      aliased = true
    }
    return open.call(fs, file, ...args)
  })
  try {
    await refusal(preflight({ nativeRoot: built.root, runGit: built.git() }), "symlinkSource")
    assert.equal(aliased, true)
  } finally { hook.mock.restore() }
})

test("a source root rebound after preflight is refused before stage allocation", async () => {
  const built = buildFixture()
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git() })
  const moved = path.join(fixture(), "moved-root")
  fs.renameSync(built.root, moved)
  fs.symlinkSync(moved, built.root)
  await assert.rejects(createStage(plan), error => {
    assert.ok(error instanceof StageRefusal)
    assert.ok(["nativeRoot", "symlinkSource"].includes(error.code))
    assert.equal(error.allocated, false)
    return true
  })
})

test("an expired job refuses before starting the next git call", async () => {
  const built = buildFixture()
  const base = built.git()
  let clock = 0
  let calls = 0
  const runGit = (args, options) => {
    calls += 1
    const result = base(args, options)
    if (calls === 1) clock = 1001
    return result
  }
  await refusal(
    preflight({ nativeRoot: built.root, runGit, now: () => clock, limits: { timeoutMs: 1000 } }),
    "acquisitionTimeout",
  )
  assert.equal(calls, 1, "no further git call may start after the deadline")
})

test("a dependency target rebound after preflight is refused at link time", async () => {
  const built = buildFixture()
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git() })
  const target = path.join(built.root, "store/effect")
  fs.renameSync(target, `${target}-real`)
  fs.symlinkSync(`${target}-real`, target)
  await refusal(createStage(plan), "dependencyTargetMissing")
})

test("a deadline crossed by receipt writing cannot leave a success receipt", async () => {
  const built = buildFixture()
  let clock = 0
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git(), now: () => clock, limits: { timeoutMs: 1000 } })
  const write = fs.writeSync
  const hook = mock.method(fs, "writeSync", function (fd, ...args) {
    const result = write.call(fs, fd, ...args)
    if (fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith("/typecheck-stage-receipt.json")) clock = 1001
    return result
  })
  try {
    const error = await refusal(createStage(plan, { now: () => clock }), "acquisitionTimeout")
    assert.equal(error.allocated, true)
    const receipt = JSON.parse(fs.readFileSync(path.join(error.stageRoot, "typecheck-stage-receipt.json"), "utf8"))
    assert.equal(receipt.status, "failed")
    assert.equal(receipt.error.code, "acquisitionTimeout")
  } finally { hook.mock.restore() }
})

test("a concurrent receipt replacement is preserved and a failure sidecar carries precedence", async () => {
  const built = buildFixture()
  let clock = 0
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git(), now: () => clock, limits: { timeoutMs: 1000 } })
  const lstat = fs.lstatSync
  let replaced = false
  let replacement
  const hook = mock.method(fs, "lstatSync", function (file, ...args) {
    const result = lstat.call(fs, file, ...args)
    if (!replaced && typeof file === "string" && file.endsWith("/typecheck-stage-receipt.json")) {
      replaced = true
      fs.renameSync(file, `${file}.published-by-us`)
      replacement = '{"status":"concurrent replacement"}\n'
      fs.writeFileSync(file, replacement)
      clock = 1001
    }
    return result
  })
  try {
    const error = await refusal(createStage(plan, { now: () => clock }), "acquisitionTimeout")
    assert.equal(replaced, true)
    assert.equal(error.receiptStatus, "preserved")
    assert.ok(error.failurePath && fs.existsSync(error.failurePath))
    const sidecar = JSON.parse(fs.readFileSync(error.failurePath, "utf8"))
    assert.equal(sidecar.status, "failed")
    assert.equal(sidecar.error.code, "acquisitionTimeout")
    assert.ok(sidecar.precedence.includes("overrides"))
    const primary = fs.readFileSync(path.join(error.stageRoot, "typecheck-stage-receipt.json"), "utf8")
    assert.equal(primary, replacement, "the concurrent replacement must be byte-identical")
  } finally {
    hook.mock.restore()
  }
})

test("a partially written failure receipt is not reported as success", async () => {
  const built = buildFixture()
  let clock = 0
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git(), now: () => clock, limits: { timeoutMs: 1000 } })
  const write = fs.writeSync
  let receiptWrites = 0
  const hook = mock.method(fs, "writeSync", function (fd, buffer, offset, length, position) {
    const target = fs.readlinkSync(`/proc/self/fd/${fd}`)
    if (target.endsWith("/typecheck-stage-receipt.json")) {
      receiptWrites += 1
      if (receiptWrites === 1) {
        const written = write.call(fs, fd, buffer, offset, length, position)
        clock = 1001
        return written
      }
      // Deliberately publish only a fragment of the failure document.
      return write.call(fs, fd, buffer, offset, 5, position)
    }
    return write.call(fs, fd, buffer, offset, length, position)
  })
  try {
    const error = await refusal(createStage(plan, { now: () => clock }), "acquisitionTimeout")
    assert.equal(receiptWrites >= 2, true)
    assert.equal(error.receiptStatus, "preserved")
    assert.ok(error.failurePath && fs.existsSync(error.failurePath))
    const sidecar = JSON.parse(fs.readFileSync(error.failurePath, "utf8"))
    assert.equal(sidecar.status, "failed")
    const primary = fs.readFileSync(path.join(error.stageRoot, "typecheck-stage-receipt.json"), "utf8")
    assert.ok(!primary.includes('"success"'), "a truncated receipt must not retain a success claim")
    assert.throws(() => JSON.parse(primary))
  } finally {
    hook.mock.restore()
  }
})

test("an in-place concurrent receipt edit is preserved rather than truncated", async () => {
  const built = buildFixture()
  let clock = 0
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git(), now: () => clock, limits: { timeoutMs: 1000 } })
  const lstat = fs.lstatSync
  const replacement = '{"status":"concurrent in-place edit"}\n'
  let changed = false
  const hook = mock.method(fs, "lstatSync", function (file, ...args) {
    const result = lstat.call(fs, file, ...args)
    if (!changed && typeof file === "string" && file.endsWith("/typecheck-stage-receipt.json")) {
      changed = true
      fs.writeFileSync(file, replacement)
      clock = 1001
    }
    return result
  })
  try {
    const error = await refusal(createStage(plan, { now: () => clock }), "acquisitionTimeout")
    assert.equal(fs.readFileSync(path.join(error.stageRoot, "typecheck-stage-receipt.json"), "utf8"), replacement)
    assert.equal(JSON.parse(fs.readFileSync(error.failurePath, "utf8")).status, "failed")
  } finally { hook.mock.restore() }
})

test("receipt recovery uses nonblocking open if the leaf becomes a FIFO", async () => {
  const built = buildFixture()
  let clock = 0
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git(), now: () => clock, limits: { timeoutMs: 1000 } })
  const lstat = fs.lstatSync
  const open = fs.openSync
  let changed = false
  let recoveryFlags
  const statHook = mock.method(fs, "lstatSync", function (file, ...args) {
    const result = lstat.call(fs, file, ...args)
    if (!changed && typeof file === "string" && file.endsWith("/typecheck-stage-receipt.json")) {
      changed = true
      fs.renameSync(file, `${file}.original`)
      assert.equal(spawnSync("mkfifo", [file]).status, 0)
      clock = 1001
    }
    return result
  })
  const openHook = mock.method(fs, "openSync", function (file, flags, ...args) {
    if (changed && typeof file === "string" && file.endsWith("/typecheck-stage-receipt.json")) {
      recoveryFlags = flags
      // Avoid hanging the test runner when exercising the unsafe old flags.
      if (!(flags & fs.constants.O_NONBLOCK)) throw new Error("blocking FIFO open prevented by test boundary")
    }
    return open.call(fs, file, flags, ...args)
  })
  try {
    const error = await refusal(createStage(plan, { now: () => clock }), "acquisitionTimeout")
    assert.ok(recoveryFlags & fs.constants.O_NONBLOCK)
    assert.ok(fs.lstatSync(path.join(error.stageRoot, "typecheck-stage-receipt.json")).isFIFO())
    assert.equal(JSON.parse(fs.readFileSync(error.failurePath, "utf8")).status, "failed")
  } finally { openHook.mock.restore(); statHook.mock.restore() }
})

test("a short primary receipt write refuses instead of retrying without a deadline", async () => {
  const built = buildFixture()
  const plan = await preflight({ nativeRoot: built.root, runGit: built.git() })
  const write = fs.writeSync
  let calls = 0
  const hook = mock.method(fs, "writeSync", function (fd, buffer, offset, length, position) {
    if (fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith("/typecheck-stage-receipt.json")) {
      calls += 1
      if (calls === 1) return write.call(fs, fd, buffer, offset, 5, position)
    }
    return write.call(fs, fd, buffer, offset, length, position)
  })
  try {
    const error = await refusal(createStage(plan), "writeVerifyFailed")
    assert.equal(calls, 1)
    assert.equal(JSON.parse(fs.readFileSync(error.failurePath, "utf8")).status, "failed")
  } finally { hook.mock.restore() }
})

test("fixture startup creates an absent private base and rejects an existing alias", () => {
  const outer = fixture()
  const fresh = path.join(outer, "fresh")
  prepareFixtureBase(fresh)
  const before = fs.lstatSync(fresh)
  assert.equal(before.mode & 0o777, 0o700)
  prepareFixtureBase(fresh)
  assert.equal(fs.lstatSync(fresh).ino, before.ino)
  const alias = path.join(outer, "alias")
  fs.symlinkSync(fresh, alias)
  assert.throws(() => prepareFixtureBase(alias), { code: "ERR_ASSERTION" })
  assert.ok(fs.lstatSync(alias).isSymbolicLink())
  assert.equal(fs.lstatSync(fresh).ino, before.ino)
})

test("reviewed metadata closure retains recorder dev links and the root script workspace", async () => {
  assert.deepEqual(PACKAGES, ["core", "server", "plugin", "client", "protocol", "schema", "util", "ai", "theme", "simulation", "httpapi-codegen", "codemode", "plugin-browser", "http-recorder", "script"])
  const closure = JSON.parse(fs.readFileSync(new URL("./workspace-closure-2026-10-31.json", import.meta.url), "utf8"))
  assert.deepEqual(PACKAGES, closure.selectedPackages)
  assert.equal(closure.parentVerification.selectedMetadataClosureVerified, true)
  assert.equal(closure.fullProgramGraphVerified, false)
  assert.equal(closure.nativeStageExecuted, false)
  assert.equal(closure.fullTypesVerified, false)
  const result = await stageFixture(buildFixture())
  for (const name of ["core", "ai"]) {
    const link = result.receipt.links.packages[name].find(entry => entry.spec === "@opencode/http-recorder")
    assert.equal(link?.kind, "staged")
    assert.equal(link.resolved, path.join(result.root, "packages/http-recorder"))
    const manifest = JSON.parse(fs.readFileSync(path.join(result.root, "packages", name, "package.json"), "utf8"))
    assert.equal(manifest.devDependencies["@opencode/http-recorder"], "workspace:*")
  }
  const script = result.receipt.links.root.find(entry => entry.spec === "@opencode/script")
  assert.equal(script?.resolved, path.join(result.root, "packages/script"))
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(result.root, "packages/script/package.json"), "utf8")), "version"), false)
})
