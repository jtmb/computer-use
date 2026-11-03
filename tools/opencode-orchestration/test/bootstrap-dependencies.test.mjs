import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { BUN_BINARY_SHA256, BUN_INTEGRITY, BUN_VERSION, NATIVE_PIN, NODE_VERSION } from "../../opencode-native-row/runtime-prerequisites.mjs"

const inventory = JSON.parse(await readFile(new URL("../bootstrap-dependencies.json", import.meta.url), "utf8"))

test("bootstrap inventory agrees with the existing reviewed native runtime pins", () => {
  const bun = inventory.required.find(item => item.name === "bun")
  assert.equal(inventory.schemaVersion, 1)
  assert.equal(inventory.nativeSource.commit, NATIVE_PIN)
  assert.equal(inventory.nativeSource.version, "2.1.1")
  assert.equal(bun.version, BUN_VERSION)
  assert.equal(bun.integrity, BUN_INTEGRITY)
  assert.equal(bun.binarySha256, BUN_BINARY_SHA256)
  assert.equal(bun.source, `https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-${BUN_VERSION}.tgz`)
  assert.equal(bun.member, "package/bin/bun")
  assert.match(bun.destination, /^runtime\/bun-[a-zA-Z0-9.-]+\/bun$/)
})

test("CLI bootstrap is filtered, lock-preserving and does not enable lifecycle scripts", () => {
  const workspace = inventory.required.find(item => item.name === "@opencode/cli-workspace-dependencies")
  assert.deepEqual(workspace.arguments, ["install", "--frozen-lockfile", "--ignore-scripts", "--filter", "@opencode/cli"])
  assert.equal(workspace.source, "nativeSource.lockfile")
  assert.equal(workspace.cacheRelativeToNativeCheckout, "node_modules/.cache/bun-install")
  for (const key of ["lockfileSha256", "manifestSha256", "configurationSha256"]) assert.match(inventory.nativeSource[key], /^[a-f0-9]{64}$/)
  assert.equal(inventory.policy.lockfileChanges, "refuse")
  for (const key of ["globalInstall", "sharedRestart", "clientReplacement", "gitPrInput"]) assert.equal(inventory.policy[key], false)
})

test("Node26 is conditional, not silently made a global consumer prerequisite", () => {
  assert.equal(inventory.nodeArtifactBuild.version, NODE_VERSION)
  assert.match(inventory.nodeArtifactBuild.requiredWhen, /Bun-native tests do not require Node26/)
  assert.match(inventory.nodeArtifactBuild.existingVerifiedScratchRuntime, /not a bootstrap installation/)
  assert.equal(inventory.scope, "optional-native-chat-bar-build")
})

test("native check tooling includes the root-owned declaration without changing upstream pins", () => {
  const checks = inventory.nativeCheckWorkspace
  assert.deepEqual(checks.arguments, ["install", "--frozen-lockfile", "--ignore-scripts", "--filter", "@opencode/cli", "--filter", "opencode"])
  assert.equal(checks.source, "nativeSource.lockfile")
  assert.deepEqual(checks.demonstratedDeclaration, { name: "@types/mime-types", version: "3.0.1" })
  assert.match(checks.requiredWhen, /CLI-only filter does not link these/)
})

test("setup routes maintainers to the inventory without claiming an implemented onboarding flag", async () => {
  const setup = await readFile(new URL("../../../setup.md", import.meta.url), "utf8")
  const guide = await readFile(new URL("../README.md", import.meta.url), "utf8")
  assert.match(setup, /tools\/opencode-orchestration\/README\.md#bootstrap-dependency-inventory/)
  assert.match(guide, /bootstrap-dependencies\.json/)
  assert.match(guide, /not yet wired into `scripts\/onboard\.sh`/)
})
