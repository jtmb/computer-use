import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const graph = JSON.parse(await readFile(new URL("docs/document-authoring-transitive-candidates-2026-10-31.json", root), "utf8"))
const direct = await readFile(new URL("docs/document-authoring-candidates-2026-10-30.json", root))
const normalize = text => text.replace(/\s+/g, " ").trim()

// These contracts protect the dated record's accounting, not its external source authenticity.
function verifyRecord(value) {
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.coverage.status, "incomplete")
  assert.equal(value.directCandidateSource.sha256, createHash("sha256").update(direct).digest("hex"))
  assert.equal(value.coverage.nodesTotalSelected, value.nodes.length)
  const requirements = value.nodes.flatMap(node => node.baseRequiresDist.map(raw => `${node.distribution}\0${normalize(raw)}`)).sort()
  const edges = value.edges.map(edge => `${edge.from}\0${normalize(edge.requirement + (edge.marker ? `; ${edge.marker}` : ""))}`).sort()
  assert.deepEqual(edges, requirements, "every retained requirement must have exactly one disposition")
  assert.equal(value.coverage.declaredRequirementStrings, requirements.length)
  assert.equal(value.coverage.edgesBuilt, edges.length)
  assert.equal(value.coverage.uncoveredDeclaredRequirements, 0)
  for (const status of ["included", "excluded", "unresolved"])
    assert.equal(value.coverage[`${status}Edges`], value.edges.filter(edge => edge.status === status).length)
  const names = new Set(value.nodes.map(node => `${node.distribution} ${node.version}`))
  assert.equal(names.size, value.nodes.length)
  for (const edge of value.edges) {
    assert.ok(["included", "excluded", "unresolved"].includes(edge.status))
    if (edge.status === "included") assert.ok(names.has(edge.selectedCandidate), edge.selectedCandidate)
    else assert.equal(edge.selectedCandidate, null)
  }
  const acquisition = value.sourceAcquisition
  assert.equal(acquisition.httpRequestsTotal, acquisition.receipts.length)
  assert.equal(acquisition.versionRequestsRecorded, acquisition.receipts.filter(row => row.kind === "version").length)
  assert.equal(acquisition.discoveryRequests, acquisition.receipts.filter(row => row.kind === "discovery").length)
  assert.equal(acquisition.aggregateBytesUsed, acquisition.receipts.reduce((sum, row) => sum + row.bytes, 0))
  assert.equal(acquisition.aggregateBytesRemaining, acquisition.aggregateCapBytes - acquisition.aggregateBytesUsed)
  assert.ok(acquisition.versionRequestsRecorded <= acquisition.versionRequestCap)
  assert.equal(acquisition.largestResponseBytes, Math.max(...acquisition.receipts.map(row => row.bytes)))
  for (const flag of ["hardPreAcquisitionCapsProven", "singleSharedBudgetProven", "rawResponseBodyIntegrityProven",
    "rawResponseBodiesPreserved", "resolvedLock", "closureEstablished", "artifactBytesVerified", "importsTested",
    "vulnerabilityReviewComplete", "authoringOrHardenedXmlReady", "rightsApproval"])
    assert.equal(value.limits[flag], false, `historical unverified outcome must remain false: ${flag}`)
  assert.equal(value.acquisitionEnforcement.sharedAggregateBudgetEnforced, false)
  assert.equal(value.acquisitionEnforcement.perResponseCheckAfterChunkRead, true)
  assert.ok(value.edges.some(edge => edge.from === "cffi" && edge.requirement === "pycparser" && edge.status === "unresolved"))
}

test("dated metadata graph accounts for all saved requirements and disclosed acquisition limits", () => verifyRecord(graph))

test("an omitted optional dependency cannot disappear behind unchanged coverage counts", () => {
  const altered = structuredClone(graph)
  const index = altered.edges.findIndex(edge => edge.from === "Pillow")
  assert.ok(index >= 0)
  altered.edges.splice(index, 1)
  assert.throws(() => verifyRecord(altered), /every retained requirement/)
})

test("receipt totals and source limitations cannot be promoted by a green graph", () => {
  const wrongBytes = structuredClone(graph)
  wrongBytes.sourceAcquisition.aggregateBytesUsed += 1
  assert.throws(() => verifyRecord(wrongBytes))
  for (const flag of ["hardPreAcquisitionCapsProven", "rawResponseBodyIntegrityProven", "closureEstablished", "rightsApproval"]) {
    const promoted = structuredClone(graph)
    promoted.limits[flag] = true
    assert.throws(() => verifyRecord(promoted), /historical unverified outcome/)
  }
})
