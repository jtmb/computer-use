import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("../", import.meta.url))
const json = async name => JSON.parse(await readFile(path.join(root, name), "utf8"))
const pins = {
  "@opencode/plugin": "2.1.1", "@opencode/theme": "2.1.1",
  "@opentui/core": "0.6.6", "@opentui/solid": "0.6.6", "solid-js": "1.9.12",
  "@types/json-schema": "7.0.15", "@types/node": "22.18.6", "typescript": "5.9.3",
}

test("the private fallback package has exact SDK/theme/compiler/declaration pins and public integrity-locked dependencies", async () => {
  const manifest = await json("package.json"), lock = await json("package-lock.json")
  assert.equal(manifest.private, true)
  assert.equal(manifest.license, undefined, "dependency provisioning does not invent an import license")
  assert.equal(lock.lockfileVersion, 3)
  for (const [name, version] of Object.entries(pins)) {
    assert.equal(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name], version, name)
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version, name)
  }
  assert.deepEqual(lock.packages[""].dependencies, manifest.dependencies)
  assert.deepEqual(lock.packages[""].devDependencies, manifest.devDependencies)
  for (const [name, item] of Object.entries(lock.packages)) {
    if (!name) continue
    const url = new URL(item.resolved)
    assert.equal(url.protocol, "https:", name)
    assert.equal(url.host, "registry.npmjs.org", name)
    assert.equal(url.username + url.password + url.search + url.hash, "", name)
    assert.equal(item.link, undefined, name)
    assert.ok(item.integrity?.startsWith("sha512-"), name)
    assert.equal(Buffer.from(item.integrity.slice(7), "base64").length, 64, name)
  }
})

test("installed source dependencies resolve inside this exact package, not a borrowed package or alias", async () => {
  const local = await realpath(path.join(root, "node_modules"))
  for (const [name, version] of Object.entries(pins)) {
    const directory = await realpath(path.join(root, "node_modules", name))
    assert.ok(directory.startsWith(`${local}${path.sep}`), name)
    assert.equal((await json(`node_modules/${name}/package.json`)).version, version, name)
  }
  const sdk = fileURLToPath(import.meta.resolve("@opencode/plugin"))
  assert.ok(sdk.startsWith(path.join(local, "@opencode/plugin/")))
  const declarations = await readFile(path.join(root, "node_modules/@types/json-schema/index.d.ts"))
  const { createHash } = await import("node:crypto")
  assert.equal(createHash("sha256").update(declarations).digest("hex"), "f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1")
})

test("the actual pinned compiler rejects a broken external declaration under the package's library-checking settings", { timeout: 30000 }, async t => {
  const config = await json("tsconfig.json")
  assert.equal(config.compilerOptions.strict, true)
  assert.equal(config.compilerOptions.noEmit, true)
  const scratch = await mkdtemp("/tmp/opencode/provider-fallback-library-test-")
  t.after(() => rm(scratch, { recursive: true, force: true }))
  await writeFile(path.join(scratch, "external.d.ts"), "export declare const value: MissingExternalContract;\n")
  await writeFile(path.join(scratch, "tsconfig.json"), JSON.stringify({
    compilerOptions: { ...config.compilerOptions, types: [], typeRoots: [] },
    files: ["external.d.ts"],
  }))
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--project", path.join(scratch, "tsconfig.json")],
    { cwd: root, encoding: "utf8", timeout: 25000, maxBuffer: 1024 * 1024 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 2, "skipLibCheck must not hide an external declaration error")
  assert.ok(result.stdout.includes("TS2304") && result.stdout.includes("MissingExternalContract"), result.stdout + result.stderr)
  assert.equal(config.compilerOptions.skipLibCheck, false)
})
