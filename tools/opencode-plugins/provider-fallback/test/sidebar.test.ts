import assert from "node:assert/strict"
import test from "node:test"

import {
  appendSidebarContribution,
  formatSidebarStatus,
  parseProviderFallbackStatus,
  type SidebarContribution,
} from "../src/sidebar.ts"

test("appends the status contribution without replacing the built-in sidebar", () => {
  const builtIn: SidebarContribution<string> = { append: "sidebar.content", render: () => "native panel" }
  const contributions: SidebarContribution<string>[] = [builtIn]
  const cleanup = appendSidebarContribution((contribution) => {
    contributions.push(contribution)
    return () => {
      const index = contributions.indexOf(contribution)
      if (index >= 0) contributions.splice(index, 1)
    }
  }, () => "provider status")

  assert.equal(contributions.length, 2)
  assert.equal(contributions[0], builtIn)
  assert.equal(contributions[1]?.append, "sidebar.content")
  assert.equal("replace" in (contributions[1] as object), false)
  cleanup()
  assert.deepEqual(contributions, [builtIn])
})

test("validates typed status data before display", () => {
  assert.deepEqual(
    parseProviderFallbackStatus({ state: "configured", chainLength: 2, lastFallback: null }),
    { state: "configured", chainLength: 2, lastFallback: null },
  )
  assert.equal(parseProviderFallbackStatus({ state: "last-fallback", chainLength: 1, lastFallback: null }), undefined)
  assert.equal(parseProviderFallbackStatus({ state: "inactive", chainLength: -1, lastFallback: null }), undefined)
  assert.equal(parseProviderFallbackStatus({ state: "active", chainLength: 1, lastFallback: null }), undefined)
})

test("labels inactive, configured, and last-fallback states without claiming active routing", () => {
  assert.equal(
    formatSidebarStatus({ state: "inactive", chainLength: 0, lastFallback: null }),
    "Inactive; no effective fallback chain",
  )
  assert.equal(
    formatSidebarStatus({ state: "configured", chainLength: 2, lastFallback: null }),
    "Configured; waiting for a qualifying provider failure",
  )
  assert.equal(
    formatSidebarStatus({
      state: "last-fallback",
      chainLength: 2,
      lastFallback: { source: "primary/model", target: "backup/model", recordedAt: 1 },
    }),
    "Last fallback: primary/model → backup/model",
  )
})
