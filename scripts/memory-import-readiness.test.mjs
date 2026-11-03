import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { parseOptions, resolveEffective } from "../tools/opencode-plugins/provider-fallback/src/config.ts"
import {
  appendSidebarContribution,
} from "../tools/opencode-plugins/provider-fallback/src/sidebar.ts"
import {
  isResourcePanel,
  openPanelOrFallback,
  registerResourceFooterSlots,
  RESOURCE_FOOTER_SLOTS,
  RESOURCE_PANEL_NAME,
} from "../tools/opencode-plugins/resource-monitor/src/registration.ts"
import { runSyntheticReadinessProbe } from "./memory-import-readiness.mjs"

const REPOSITORY = path.resolve(fileURLToPath(new URL("..", import.meta.url)))

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(REPOSITORY, relativePath), "utf8"))
}

test("optional imports remain private and absent from default project and global config", async () => {
  const projectConfig = await json("opencode.json")
  const optionalNames = ["chatgpt", "resource-monitor", "provider-fallback"]
  for (const name of optionalNames) {
    assert.doesNotMatch(JSON.stringify(projectConfig), new RegExp(name, "i"))
  }
  assert.deepEqual(Object.keys(projectConfig.mcp.servers).sort(), ["github", "playwright"])

  const globalConfig = await readFile(path.join(REPOSITORY, "global/opencode.jsonc"), "utf8")
  for (const name of optionalNames) assert.doesNotMatch(globalConfig, new RegExp(name, "i"))

  const pluginDiscovery = path.join(REPOSITORY, ".opencode", "plugins")
  const packages = [
    "tools/opencode-plugins/resource-monitor",
    "tools/opencode-plugins/provider-fallback",
    "tools/chatgpt-connector",
  ]
  for (const relativePath of packages) {
    const packagePath = path.join(REPOSITORY, relativePath)
    const distance = path.relative(pluginDiscovery, packagePath)
    const isInsideDiscovery = distance === "" ||
      (!path.isAbsolute(distance) && distance !== ".." && !distance.startsWith(`..${path.sep}`))
    assert.equal(isInsideDiscovery, false, `${relativePath} must stay outside automatic plugin discovery`)
    const manifest = await json(path.join(relativePath, "package.json"))
    assert.equal(manifest.private, true, `${relativePath} must remain an explicit private opt-in`)
  }
})

test("import pins and unspecified upstream license boundaries stay explicit", async () => {
  const packages = [
    {
      root: "tools/opencode-plugins/resource-monitor",
      evidence: "tools/opencode-plugins/resource-monitor/README.md",
    },
    {
      root: "tools/opencode-plugins/provider-fallback",
      evidence: "tools/opencode-plugins/provider-fallback/PROVENANCE.md",
    },
    {
      root: "tools/chatgpt-connector",
      evidence: "tools/chatgpt-connector/README.md",
    },
  ]

  for (const entry of packages) {
    const manifest = await json(path.join(entry.root, "package.json"))
    const lock = await json(path.join(entry.root, "package-lock.json"))
    const sourceEvidence = await readFile(path.join(REPOSITORY, entry.evidence), "utf8")
    assert.equal(manifest.license, undefined, `${entry.root} must not invent a license`)
    assert.deepEqual(lock.packages[""].dependencies ?? {}, manifest.dependencies ?? {})
    assert.match(sourceEvidence, /b17182cd5bcd55c282a94ea18f87a16460813c35/)
    assert.match(sourceEvidence, /unspecified/i)
    assert.match(sourceEvidence, /no license|does not add an invented license/i)
  }

  for (const relativePath of [
    "tools/opencode-plugins/resource-monitor",
    "tools/opencode-plugins/provider-fallback",
  ]) {
    const manifest = await json(path.join(relativePath, "package.json"))
    const lock = await json(path.join(relativePath, "package-lock.json"))
    assert.equal(manifest.devDependencies["@opentui/core"], "0.6.6")
    assert.equal(lock.packages["node_modules/@opentui/core"].version, "0.6.6")
    assert.deepEqual(lock.packages["node_modules/@opentui/core"].engines, {
      bun: ">=1.3.14",
      node: ">=26.4.0",
    })
  }

  const connectorManifest = await json("tools/chatgpt-connector/package.json")
  const connectorLock = await json("tools/chatgpt-connector/package-lock.json")
  assert.deepEqual(connectorManifest.dependencies, {
    "@modelcontextprotocol/sdk": "1.30.0",
    "@opencode/client": "2.0.7",
    "@opencode/plugin": "2.0.7",
  })
  assert.deepEqual(connectorLock.packages[""].dependencies, connectorManifest.dependencies)
  const launcher = await readFile(path.join(REPOSITORY, "scripts/chatgpt-mcp.sh"), "utf8")
  assert.match(launcher, /selected MCP profile's trusted Node\.js runtime/)
  assert.match(launcher, /verify-dependencies\.mjs/)
})

test("provider routing is inactive without an explicit chain", () => {
  const config = parseOptions(undefined)
  assert.equal(config.valid, true)
  assert.deepEqual(config.defaultChain, [])
  assert.equal(resolveEffective(undefined, config).enabled, false)
})

test("panel adapters append and clean up without replacing native surfaces", () => {
  const footerClaims = []
  const stopped = []
  const stopFooters = registerResourceFooterSlots((claim) => {
    footerClaims.push(claim.append)
    return () => stopped.push(claim.append)
  }, () => null)
  assert.deepEqual(footerClaims, [...RESOURCE_FOOTER_SLOTS])
  stopFooters()
  assert.deepEqual(stopped, footerClaims)
  assert.equal(RESOURCE_PANEL_NAME, "splice.resource-monitor")
  assert.equal(isResourcePanel(RESOURCE_PANEL_NAME), true)
  assert.equal(isResourcePanel("another.plugin.panel"), false)

  let dialogFallbacks = 0
  assert.equal(openPanelOrFallback(() => true, () => { dialogFallbacks += 1 }), "panel")
  assert.equal(openPanelOrFallback(() => false, () => { dialogFallbacks += 1 }), "fallback")
  assert.equal(dialogFallbacks, 1)

  const nativeContribution = { append: "sidebar.content", render: () => "native sidebar" }
  const contributions = [nativeContribution]
  const cleanup = appendSidebarContribution((contribution) => {
    contributions.push(contribution)
    return () => {
      const index = contributions.indexOf(contribution)
      if (index >= 0) contributions.splice(index, 1)
    }
  }, () => "optional fallback status")
  assert.equal(contributions[0], nativeContribution)
  assert.equal(contributions[1].append, "sidebar.content")
  assert.equal("replace" in contributions[1], false)
  cleanup()
  assert.deepEqual(contributions, [nativeContribution])
})

test("synthetic routing, stale-poisoned handling, no-match, and tool-only overhead are bounded", async () => {
  const report = await runSyntheticReadinessProbe()
  assert.deepEqual(report.scopeRouting.repoDefault, ["repo"])
  assert.deepEqual(report.scopeRouting.explicitGlobal, ["global"])
  assert.deepEqual(new Set(report.scopeRouting.both), new Set(["repo", "global"]))
  assert.equal(report.scopeRouting.noMatchCount, 0)
  assert.equal(report.stalePoisoned.updated, "2020-01-01")
  assert.equal(report.stalePoisoned.verified, "2020-01-01")
  assert.equal(report.stalePoisoned.markedUntrusted, true)
  assert.ok(report.toolOnlyOverhead.scannedFiles > 2)
  assert.ok(report.toolOnlyOverhead.scannedFiles <= 64)
  assert.ok(report.toolOnlyOverhead.scannedBytes > 20_000)
  assert.ok(report.toolOnlyOverhead.scannedBytes <= 512 * 1024)
  assert.ok(report.toolOnlyOverhead.combinedResponseBytes < 4 * 1024)
  assert.equal(report.toolOnlyOverhead.modelInvoked, false)
  assert.equal(report.toolOnlyOverhead.realMemoryWritten, false)
})
