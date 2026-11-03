import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { after, before, test } from "node:test"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const pin = "ba546ec1598a70db2570e9c6258028d955ba8f58"
const patchHash = "91ff1912ab3bfd9a10ec2114ff30dd43f10e793de3e7d9df9929269a833a6e55"
const workerHash = "0b09a3765c71acbda620cfada384e324c47684b10f0995a857b61daa116b13e3"
const files = ["packages/core/src/plugin/host.ts", "packages/plugin/src/effect/session.ts",
  "packages/plugin/src/promise/adapter.ts", "packages/plugin/src/promise/session.ts"]
let root = process.env.NATIVE_ROW_SOURCE_CHECKOUT
let scratch = process.env.NATIVE_ACTIVE_SCRATCH
const json = path => JSON.parse(readFileSync(path, "utf8"))
const digest = bytes => createHash("sha256").update(bytes).digest("hex")
function git(directory, ...args) {
  return execFileSync("git", ["--no-optional-locks", "-C", directory, ...args],
    { encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024 }).trim()
}

function declarations() {
  const lock = json(join(here, "package-lock.json"))
  const paths = {}
  for (const [name, version, module] of [["json-schema", "7.0.15", "json-schema"], ["mime-types", "3.0.1", "mime-types"]]) {
    const directory = realpathSync(join(here, "node_modules/@types", name))
    assert.ok(directory.startsWith(`${realpathSync(join(here, "node_modules"))}/`))
    assert.equal(json(join(directory, "package.json")).version, version)
    const entry = lock.packages[`node_modules/@types/${name}`]
    assert.equal(entry.version, version)
    assert.equal(new URL(entry.resolved).host, "registry.npmjs.org")
    assert.ok(entry.integrity.startsWith("sha512-"))
    paths[module] = [join(directory, "index.d.ts")]
  }
  assert.equal(digest(readFileSync(paths["json-schema"][0])), "f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1")
  assert.equal(digest(readFileSync(paths["mime-types"][0])), "c0b69899a086f2049f739fb1b5ed76ec8bea7a826347ed42c2661ceca2d3ebd1")
  const node = realpathSync(join(here, "node_modules/@types/node"))
  assert.ok(node.startsWith(`${realpathSync(join(here, "node_modules"))}/`))
  assert.equal(json(join(node, "package.json")).version, "26.6.6")
  assert.equal(lock.packages["node_modules/@types/node"].version, "26.6.6")
  assert.equal(lock.packages["node_modules/@types/node"].integrity, "sha512-MzQj+8Kx3XI40OmUAE6Qoh58ZMNstNNMwn2nfd3qWsfe7nDNSqJNzes4njhz6AHwrSHOffSLwXU6yb474Q4aog==")
  return paths
}

function checkTypes(variant, kind) {
  const ts = createRequire(join(root, "packages/plugin/package.json"))("typescript")
  const paths = declarations()
  const typeRoots = [join(here, "node_modules/@types"), join(root, "packages/plugin/node_modules/@types"), join(root, "packages/core/node_modules/@types")]
  let options, roots, host
  if (kind === "surface" || kind.startsWith("ambient")) {
    options = { strict: true, noEmit: true, skipLibCheck: false, target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true, types: ["bun"], typeRoots: kind === "ambient-old" ? [join(root, "packages/plugin/node_modules/@types")] : typeRoots,
      lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"], paths }
    roots = [join(scratch, variant, kind.startsWith("ambient") ? "ambient.ts" : "surface.ts")]
  } else {
    const configPath = join(root, "packages/core/tsconfig.json")
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    assert.equal(config.error, undefined)
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath), {}, configPath)
    options = { ...parsed.options, strict: true, skipLibCheck: false, noEmit: true, declaration: false,
      emitDeclarationOnly: false, composite: false, incremental: false, tsBuildInfoFile: undefined, rootDir: undefined,
      typeRoots, paths: { ...parsed.options.paths, ...paths } }
    roots = [join(root, "packages/core/src/plugin/host.ts")]
    host = ts.createCompilerHost(options)
    const original = host.getSourceFile.bind(host)
    const overlays = new Map(files.map(file => [resolve(root, file), join(scratch, variant, file)]))
    host.getSourceFile = (name, language, onError, fresh) => {
      const path = resolve(name), actual = existsSync(path) ? realpathSync(path) : path
      const selected = overlays.get(path) ?? overlays.get(actual)
      return selected ? ts.createSourceFile(name, readFileSync(selected, "utf8"), language, true) : original(name, language, onError, fresh)
    }
  }
  const program = ts.createProgram({ rootNames: roots, options, host })
  console.error(JSON.stringify({ phase: "program-created", kind, files: program.getSourceFiles().length, rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024) }))
  const diagnostics = ts.getPreEmitDiagnostics(program).map(value => ({ code: value.code, file: value.file?.fileName,
    message: ts.flattenDiagnosticMessageText(value.messageText, "\n") }))
  console.log(JSON.stringify({ compiler: ts.version, strict: true, skipLibCheck: false, kind, diagnostics }))
}

function run(variant, mode, kind) {
  const args = kind ? ["--max-old-space-size=2048", fileURLToPath(import.meta.url)] :
    ["--experimental-transform-types", "--loader", join(here, "session-active-loader.mjs"), join(here, "session-active-runtime.mjs")]
  return spawnSync(process.execPath, args, { cwd: join(root, "packages/plugin"), encoding: "utf8",
    timeout: kind === "host" ? 270000 : kind ? 170000 : 30000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NATIVE_ROW_SOURCE_CHECKOUT: root, NATIVE_ACTIVE_SCRATCH: scratch,
      NATIVE_ACTIVE_OVERLAY: join(scratch, variant), NATIVE_ACTIVE_MODE: mode,
      NATIVE_ACTIVE_CHECK: kind ?? "", NATIVE_ACTIVE_VARIANT: variant } })
}
function success(result) {
  assert.equal(result.error, undefined, result.stdout + result.stderr)
  assert.equal(result.status, 0, result.stdout + result.stderr)
}

if (process.env.NATIVE_ACTIVE_CHECK) {
  checkTypes(process.env.NATIVE_ACTIVE_VARIANT, process.env.NATIVE_ACTIVE_CHECK)
} else {
  before(() => {
    assert.ok(root?.startsWith("/"), "NATIVE_ROW_SOURCE_CHECKOUT must select an absolute pinned source checkout")
    root = realpathSync(root)
    assert.equal(realpathSync(git(root, "rev-parse", "--show-toplevel")), root)
    assert.equal(git(root, "rev-parse", "HEAD"), pin)
    assert.equal(git(root, "status", "--porcelain", "--untracked-files=all", "--", ...files), "")
    assert.equal(digest(readFileSync(join(here, "session-active.patch"))), patchHash)
    assert.equal(digest(readFileSync(join(here, "session-active.worker.patch"))), workerHash)
    declarations()
    scratch = mkdtempSync("/tmp/opencode/session-active-parent-test-")
    const surface = `import type { SessionApi as E } from "@opencode/client/effect/api"
import type { SessionApi as P } from "@opencode/client/promise/api"
import type { SessionDomain as ED } from "./packages/plugin/src/effect/session.ts"
import type { SessionDomain as PD } from "./packages/plugin/src/promise/session.ts"
declare const e: ED, p: PD, signal: AbortSignal
const ea: E<unknown>["active"] = e.active
const pa: P["active"] = p.active
pa({ signal }); void ea
`
    for (const variant of ["baseline", "worker", "misapplied-worker", "patched"]) {
      const directory = join(scratch, variant)
      for (const file of files) {
        const destination = join(directory, file)
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, execFileSync("git", ["-C", root, "show", `${pin}:${file}`]))
      }
      symlinkSync(join(root, "packages/plugin/node_modules"), join(directory, "node_modules"), "dir")
      for (const type of ["effect", "promise"]) symlinkSync(join(root, `packages/plugin/src/${type}/registration.ts`),
        join(directory, `packages/plugin/src/${type}/registration.ts`), "file")
      writeFileSync(join(directory, "surface.ts"), surface)
      writeFileSync(join(directory, "ambient.ts"), "export {}\n")
      git(directory, "init", "--quiet"); git(directory, "add", "--", ...files)
      if (variant !== "baseline") {
        const patch = join(here, variant === "patched" ? "session-active.patch" : "session-active.worker.patch")
        const extra = variant === "worker" ? ["--unidiff-zero"] : []
        git(directory, "apply", "--check", "--whitespace=error-all", ...extra, patch)
        git(directory, "apply", "--whitespace=error-all", ...extra, patch)
      }
    }
  })
  after(() => {
    if (root) assert.equal(git(root, "status", "--porcelain", "--untracked-files=all", "--", ...files), "")
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  })

  test("contextual patch changes exactly four pinned files; native host mapping executes and adapter validates output", () => {
    assert.deepEqual(git(join(scratch, "patched"), "diff", "--name-only").split("\n").sort(), files.toSorted())
    git(join(scratch, "patched"), "diff", "--check")
    const result = run("patched", "positive"); success(result)
    assert.ok(result.stdout.includes("native-map-and-schema-pass"))
  })
  test("a plain successful apply of the worker zero-context patch is not proof of correct placement", () => {
    const result = run("misapplied-worker", "positive")
    assert.notEqual(result.status, 0)
    assert.ok(result.stderr.includes("SyntaxError: Unexpected token") || result.stderr.includes("native session.active mapping missing"), result.stdout + result.stderr)
  })
  test("the correctly placed worker bridge fails the pre-abort negative control", () => {
    const result = run("worker", "pre-abort")
    assert.notEqual(result.status, 0)
    assert.ok(result.stderr.includes("Missing expected rejection"), result.stdout + result.stderr)
  })
  test("patched native active forwards pre-abort and in-flight abort without altering other adapters", () => {
    for (const mode of ["pre-abort", "mid-abort", "failure", "invalid-output"]) {
      const result = run("patched", mode); success(result)
      assert.ok(result.stdout.includes(`${mode}-pass`))
    }
  })
  test("genuine Node declarations resolve the native Bun ambient mismatch without changing installed upstream types", { timeout: 180000 }, () => {
    const before = run("baseline", "", "ambient-old"); success(before)
    const errors = JSON.parse(before.stdout.trim()).diagnostics
    assert.deepEqual(errors.map(error => error.code).sort(), [2304, 2552, 2552, 2694])
    const result = run("patched", "", "ambient"); success(result)
    assert.deepEqual(JSON.parse(result.stdout.trim()).diagnostics, [])
  })
  test("unpatched active type surface fails only for missing active under authentic library checking", { timeout: 180000 }, () => {
    const before = run("baseline", "", "surface"); success(before)
    const absent = JSON.parse(before.stdout.trim()).diagnostics
    assert.equal(absent.length, 2)
    assert.ok(absent.every(value => value.code === 2339 && value.message.includes("active")), JSON.stringify(absent))
  })
  test("patched public active contracts pass authentic library checking", { timeout: 180000 }, () => {
    const result = run("patched", "", "surface"); success(result)
    assert.deepEqual(JSON.parse(result.stdout.trim()).diagnostics, [])
  })
  test("actual patched core host typechecks with genuine declarations and no diagnostic filtering", { timeout: 280000 }, () => {
    const result = run("patched", "", "host"); success(result)
    assert.deepEqual(JSON.parse(result.stdout.trim()).diagnostics, [])
  })
}
