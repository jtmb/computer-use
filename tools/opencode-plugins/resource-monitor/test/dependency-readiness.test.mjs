import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("../", import.meta.url))
const json = async file => JSON.parse(await readFile(path.join(root, file), "utf8"))

test("monitor source dependencies are exact, private, public-integrity locked and installed locally", async () => {
  const manifest = await json("package.json"), lock = await json("package-lock.json")
  assert.equal(manifest.private, true)
  assert.equal(manifest.license, undefined)
  assert.equal(lock.lockfileVersion, 3)
  const pins = { "@opencode/plugin": "2.1.1", "@opencode/theme": "2.1.1", "@opentui/core": "0.6.6",
    "@opentui/solid": "0.6.6", "@types/json-schema": "7.0.15", "@types/node": "24.12.2",
    "solid-js": "1.9.12", "typescript": "5.9.3" }
  const modules = await realpath(path.join(root, "node_modules"))
  for (const [name, version] of Object.entries(pins)) {
    assert.equal(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name], version, name)
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version, name)
    const installed = await realpath(path.join(modules, name))
    assert.ok(installed.startsWith(`${modules}${path.sep}`), name)
    assert.equal((await json(`node_modules/${name}/package.json`)).version, version, name)
  }
  assert.deepEqual(lock.packages[""].dependencies, manifest.dependencies)
  assert.deepEqual(lock.packages[""].devDependencies, manifest.devDependencies)
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue
    const url = new URL(entry.resolved)
    assert.equal(url.protocol, "https:", name)
    assert.equal(url.host, "registry.npmjs.org", name)
    assert.equal(url.username + url.password + url.search + url.hash, "", name)
    assert.equal(entry.link, undefined, name)
    assert.ok(entry.integrity?.startsWith("sha512-"), name)
    assert.equal(Buffer.from(entry.integrity.slice(7), "base64").length, 64, name)
  }
  const bytes = await readFile(path.join(root, "node_modules/@types/json-schema/index.d.ts"))
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1")
})

test("the actual monitor compiler settings reject a broken external declaration", { timeout: 30000 }, async t => {
  const config = await json("tsconfig.json")
  assert.equal(config.compilerOptions.strict, true)
  assert.equal(config.compilerOptions.noEmit, true)
  const scratch = await mkdtemp("/tmp/opencode/resource-monitor-library-test-")
  t.after(() => rm(scratch, { recursive: true, force: true }))
  await writeFile(path.join(scratch, "external.d.ts"), "export declare const value: MissingExternalContract;\n")
  await writeFile(path.join(scratch, "tsconfig.json"), JSON.stringify({
    compilerOptions: { ...config.compilerOptions, types: [], typeRoots: [] }, files: ["external.d.ts"],
  }))
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--project", path.join(scratch, "tsconfig.json")],
    { cwd: root, encoding: "utf8", timeout: 25000, maxBuffer: 1024 * 1024 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 2, "library checking must not silently hide an external declaration error")
  assert.ok(result.stdout.includes("TS2304") && result.stdout.includes("MissingExternalContract"), result.stdout + result.stderr)
  assert.equal(config.compilerOptions.skipLibCheck, false)
})
