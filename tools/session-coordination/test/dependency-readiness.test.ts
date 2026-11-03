import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

type Manifest = {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

type LockEntry = { version?: string; resolved?: string; integrity?: string }
type LockRoot = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}
type PackageLock = { lockfileVersion: number; packages: Record<string, LockEntry & LockRoot> }
type DependencyBundle = {
  dependencyRoot: string
  compiler: { version: string }
  nodeTypes: { version: string }
  sdk: { version: string }
  supportPackages: Record<string, { version: string }>
}

const PACKAGE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const REPOSITORY_ROOT = path.resolve(PACKAGE_DIRECTORY, "../..")
const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIRECTORY, "package.json"), "utf8")) as Manifest
const lock = JSON.parse(readFileSync(path.join(PACKAGE_DIRECTORY, "package-lock.json"), "utf8")) as PackageLock
const checkerPath = new URL("../strict-check.mjs", import.meta.url).href
const checker = await import(checkerPath) as {
  validatePackageDependencySource: (packageManifest: unknown, packageLock: unknown) => { pins: Record<string, string> }
  resolveDependencyBundle: (options: { repoRoot: string; packageDirectory: string; dependencyPackage: string }) => DependencyBundle
}

const EXPECTED_SOURCE_PINS = {
  "@opencode/theme": "2.1.1",
  "@opentui/core": "0.6.6",
  "@opentui/solid": "0.6.6",
  "@types/json-schema": "7.0.15",
  "@types/node": "24.12.2",
  ajv: "8.20.0",
  "@opencode/plugin": "2.1.1",
  "solid-js": "1.9.12",
  typescript: "5.9.3",
}
const EXPECTED_BUNDLE_PINS = {
  typescript: "5.9.3",
  "@types/node": "24.12.2",
  "@opencode/plugin": "2.1.1",
  "@opencode/theme": "2.1.1",
  "@opentui/core": "0.6.6",
  "@opentui/solid": "0.6.6",
  "solid-js": "1.9.12",
}
const JSON_SCHEMA_INTEGRITY = "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA=="
const JSON_SCHEMA_DECLARATION_SHA256 = "f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1"

test("the package-local manifest and v3 lock provide exact public SHA-512 dependency pins", () => {
  for (const [name, version] of Object.entries(EXPECTED_SOURCE_PINS)) {
    const section = name === "@opencode/plugin" ? "peerDependencies" : "devDependencies"
    assert.equal(manifest[section]?.[name], version, `${section}.${name}`)
    const entry = lock.packages[`node_modules/${name}`]
    assert.equal(entry?.version, version, `lock version for ${name}`)
    assert.match(entry?.integrity ?? "", /^sha512-[A-Za-z0-9+/]+=*$/, `SHA-512 integrity for ${name}`)
    assert.equal(new URL(entry?.resolved ?? "").origin, "https://registry.npmjs.org", `public registry URL for ${name}`)
  }

  const nodePackages = Object.entries(lock.packages).filter(([key]) => key.startsWith("node_modules/"))
  assert.ok(nodePackages.length > 0)
  for (const [key, entry] of nodePackages) {
    const resolved = new URL(entry.resolved ?? "")
    assert.equal(resolved.origin, "https://registry.npmjs.org", `${key} resolves only from the public npm registry`)
    assert.equal(resolved.username, "", `${key} URL has no embedded username`)
    assert.equal(resolved.password, "", `${key} URL has no embedded password`)
    assert.match(entry.integrity ?? "", /^sha512-[A-Za-z0-9+/]+=*$/, `${key} has a SHA-512 integrity`)
  }

  const validated = checker.validatePackageDependencySource(manifest, lock)
  assert.deepEqual(validated.pins, EXPECTED_BUNDLE_PINS)
  assert.equal(lock.lockfileVersion, 3)
})

test("the default local bundle resolves the installed authentic compiler, SDK, and TUI declaration closure", () => {
  const bundle = checker.resolveDependencyBundle({
    repoRoot: REPOSITORY_ROOT,
    packageDirectory: PACKAGE_DIRECTORY,
    dependencyPackage: path.join(PACKAGE_DIRECTORY, "package.json"),
  })
  assert.equal(bundle.dependencyRoot, PACKAGE_DIRECTORY)
  assert.equal(bundle.compiler.version, "5.9.3")
  assert.equal(bundle.nodeTypes.version, "24.12.2")
  assert.equal(bundle.sdk.version, "2.1.1")
  assert.deepEqual(Object.fromEntries(Object.entries(bundle.supportPackages).map(([name, value]) => [name, value.version])), {
    "@opencode/theme": "2.1.1",
    "@opentui/core": "0.6.6",
    "@opentui/solid": "0.6.6",
    "solid-js": "1.9.12",
  })

  const jsonSchemaDirectory = path.join(PACKAGE_DIRECTORY, "node_modules", "@types", "json-schema")
  const jsonSchemaManifest = JSON.parse(readFileSync(path.join(jsonSchemaDirectory, "package.json"), "utf8")) as Manifest
  const declarationHash = createHash("sha256").update(readFileSync(path.join(jsonSchemaDirectory, "index.d.ts"))).digest("hex")
  assert.equal(jsonSchemaManifest.name, "@types/json-schema")
  assert.equal(jsonSchemaManifest.version, "7.0.15")
  assert.equal(declarationHash, JSON_SCHEMA_DECLARATION_SHA256)
  assert.equal(lock.packages["node_modules/@types/json-schema"].integrity, JSON_SCHEMA_INTEGRITY)
})

test("source readiness rejects a version range in place of an exact pinned dependency", () => {
  const changed = structuredClone(manifest)
  changed.devDependencies!["@opentui/core"] = "^0.6.6"
  assert.throws(() => checker.validatePackageDependencySource(changed, lock), /must pin @opentui\/core@0\.6\.6/)
})

test("source readiness rejects non-registry lock URLs and modified JSON Schema integrity", () => {
  const nonRegistry = structuredClone(lock)
  nonRegistry.packages["node_modules/@opentui/core"].resolved = "file:../../unreviewed/opentui-core.tgz"
  assert.throws(() => checker.validatePackageDependencySource(manifest, nonRegistry), /public npm registry/)

  const modifiedIntegrity = structuredClone(lock)
  modifiedIntegrity.packages["node_modules/@types/json-schema"].integrity = `sha512-${"A".repeat(44)}`
  assert.throws(() => checker.validatePackageDependencySource(manifest, modifiedIntegrity), /authentic SHA-512 integrity/)
})
