import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const sourceBytes = await readFile(new URL("docs/document-authoring-transitive-candidates-2026-10-31.json", root))
const graph = JSON.parse(sourceBytes)
const screen = JSON.parse(await readFile(new URL("docs/document-authoring-vulnerability-screen-2026-10-31.json", root)))
const headerBytes = await readFile(new URL("docs/document-authoring-native-header-facts-2026-10-31.json", root))
const headers = JSON.parse(headerBytes)
const nativeScreen = JSON.parse(await readFile(new URL("docs/document-authoring-native-advisory-screen-2026-10-31.json", root)))
const hash = value => createHash("sha256").update(value).digest("hex")
const key = (name, version) => `${name.toLowerCase()}\0${version}`
const acceptanceLimits = ["fullSecurityReview", "securityClearance", "candidateExistenceEstablishedByQuery", "completeDependencyClosure", "vendoredNativeLibrariesReviewed", "abiOrImportsVerified", "authoringOrHardenedXmlReady", "rightsApproval", "installationAuthorized"]

// These checks preserve a dated observation's integrity and limits, not live advisory coverage.
function verify(value) {
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.sourceRecord.sha256, hash(sourceBytes))
  const queries = value.request.queries
  assert.equal(queries.length, graph.nodes.length)
  assert.equal(value.queriedCandidates, queries.length)
  assert.deepEqual(queries.map(q => key(q.package.name, q.version)).sort(), graph.nodes.map(n => key(n.distribution, n.version)).sort(), "every selected candidate must be queried exactly once")
  for (const query of queries) {
    assert.deepEqual(Object.keys(query).sort(), ["package", "version"])
    assert.deepEqual(Object.keys(query.package).sort(), ["ecosystem", "name"])
    assert.equal(query.package.ecosystem, "PyPI")
  }
  const request = JSON.stringify(value.request)
  assert.equal(Buffer.byteLength(request), value.requestBytes)
  assert.equal(hash(request), value.requestSha256)
  assert.equal(Buffer.byteLength(value.rawResponseUtf8), value.responseBytes)
  assert.equal(hash(value.rawResponseUtf8), value.responseSha256, "raw response digest must match actual retained bytes")
  const response = JSON.parse(value.rawResponseUtf8)
  assert.equal(response.results.length, queries.length, "batch result slots must match query positions")
  const complete = response.results.every(row => !row.next_page_token)
  assert.equal(value.allBatchPagesObserved, complete, "pagination cannot disappear behind an empty result")
  const ids = [...new Set(response.results.flatMap(row => (row.vulns ?? []).map(v => v.id)))].sort()
  assert.deepEqual(value.advisoryIdsReturned, ids)
  const acquisition = value.acquisition
  assert.equal(acquisition.bytesAcquired, value.responseBytes)
  assert.ok(acquisition.dataRequests <= acquisition.dataRequestLimit)
  assert.ok(acquisition.bytesAcquired < acquisition.byteLimit)
  assert.ok(acquisition.elapsedMs < acquisition.durationLimitMs)
  assert.equal(acquisition.redirects, "refused")
  assert.equal(acquisition.tls, "normal verified TLS")
  assert.deepEqual(Object.keys(value.limits).sort(), [...acceptanceLimits].sort(), "screen must retain acceptance limits")
  for (const flag of acceptanceLimits) assert.equal(value.limits[flag], false, `screen cannot promote acceptance: ${flag}`)
  assert.equal(value.knownAffectedPositiveControlRun, false)
  assert.equal(value.advisoryDetailsFetched, 0)
  for (const amount of Object.values(value.actions)) assert.equal(amount, 0)
}

test("dated OSV query preserves all 21 candidate inputs and raw request/response digests", () => verify(screen))

test("a dropped candidate is not hidden by an empty advisory response", () => {
  const changed = structuredClone(screen)
  changed.request.queries.pop()
  assert.throws(() => verify(changed), { code: "ERR_ASSERTION" })
})

test("a modified raw response cannot retain an old authenticity claim", () => {
  const changed = structuredClone(screen)
  changed.rawResponseUtf8 += " "
  changed.responseBytes += 1
  assert.throws(() => verify(changed), error => error.code === "ERR_ASSERTION" && error.message.includes("raw response digest"))
})

test("an unresolved page is not promoted to a complete empty database screen", () => {
  const changed = structuredClone(screen)
  const response = JSON.parse(changed.rawResponseUtf8)
  response.results[0].next_page_token = "more"
  changed.rawResponseUtf8 = JSON.stringify(response)
  changed.responseBytes = Buffer.byteLength(changed.rawResponseUtf8)
  changed.responseSha256 = hash(changed.rawResponseUtf8)
  assert.throws(() => verify(changed), error => error.code === "ERR_ASSERTION" && error.message.includes("pagination"))
})

test("no advisory IDs never becomes safety, closure, runtime or installation approval", () => {
  for (const flag of Object.keys(screen.limits)) {
    const changed = structuredClone(screen)
    changed.limits[flag] = true
    assert.throws(() => verify(changed), error => error.code === "ERR_ASSERTION" && error.message.includes("cannot promote acceptance"))
    const omitted = structuredClone(screen)
    delete omitted.limits[flag]
    assert.throws(() => verify(omitted), error => error.code === "ERR_ASSERTION" && error.message.includes("retain acceptance limits"))
  }
})

test("the spent metadata budget and unresolved pycparser edge stay independent", () => {
  assert.ok(graph.edges.some(edge => edge.from === "cffi" && edge.requirement === "pycparser" && edge.status === "unresolved"))
  assert.equal(screen.actions.pypiRequests, 0)
  assert.equal(graph.limits.vulnerabilityReviewComplete, false)
  assert.ok(screen.remaining.some(text => text.includes("exhausted PyPI")))
})

function verifyHeaders(value) {
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.wheel.sha256, "c6c0c13128a32eb04a51357e56a094e13aa8e6d3d1884de2e9ae923f6915e1a8")
  assert.equal(value.wheel.bytes, 5099355)
  const expected = [
    ["lxml/includes/libxml/xmlversion.h", 5112, "a15a5a13fc5bb6d69e64d14a4ae49f70b39c796cfb2d080a3fbd59d66b1764da", "LIBXML", "2.14.6", "21406"],
    ["lxml/includes/libxslt/xsltconfig.h", 2910, "715e6c71d44aeb198e1de3a0dce0b0ea105f710fe7aed36cfed29e7d7ebbdf4e", "LIBXSLT", "1.1.43", "10143"],
  ]
  assert.equal(value.members.length, expected.length, "retain both exact selected headers")
  for (const [index, [member, bytes, sha256, prefix, dotted, numeric]] of expected.entries()) {
    const actual = value.members[index]
    assert.equal(actual.member, member)
    assert.equal(actual.status, "read")
    assert.equal(actual.bytes, bytes)
    assert.equal(actual.sha256, sha256, "retain source member identity")
    assert.deepEqual(actual.macros, [
      { name: `${prefix}_DOTTED_VERSION`, declaredValue: JSON.stringify(dotted) },
      { name: `${prefix}_VERSION`, declaredValue: numeric },
      { name: `${prefix}_VERSION_STRING`, declaredValue: JSON.stringify(numeric) },
    ], "retain declarations, not inferred linked versions")
  }
  assert.equal(value.selectedHeaderBytes, value.members.reduce((sum, member) => sum + member.bytes, 0))
  assert.ok(value.selectedHeaderBytes <= value.limits.selectedReadBytes)
  assert.ok(value.wheel.bytes <= value.limits.archiveBytes)
  assert.ok(value.elapsedMs < value.limits.jobCooperativeSeconds * 1000)
  assert.equal(value.sourcePreserved, true)
  assert.deepEqual(Object.keys(value.acceptance).sort(), ["linkedBinaryVersionsVerified", "abiVerified", "nativeAdvisoryReviewComplete", "fullSecurityReview", "rightsApproval", "installationAuthorized"].sort(), "retain header acceptance limits")
  for (const flag of Object.values(value.acceptance)) assert.equal(flag, false, "header declarations cannot promote acceptance")
  for (const amount of Object.values(value.actions)) assert.equal(amount, 0)
}

test("local native headers retain exact packaged declarations and non-promotion limits", () => verifyHeaders(headers))

test("missing headers, changed declarations and member identity drift are detected", () => {
  for (const change of [
    value => value.members.pop(),
    value => { value.members[0].macros[0].declaredValue = '"2.14.7"' },
    value => { value.members[1].sha256 = "0".repeat(64) },
  ]) {
    const changed = structuredClone(headers)
    change(changed)
    assert.throws(() => verifyHeaders(changed), { code: "ERR_ASSERTION" })
  }
})

test("packaged headers cannot waive linked-version, ABI, rights or security gates", () => {
  for (const flag of Object.keys(headers.acceptance)) {
    const promoted = structuredClone(headers)
    promoted.acceptance[flag] = true
    assert.throws(() => verifyHeaders(promoted), error => error.code === "ERR_ASSERTION" && error.message.includes("cannot promote acceptance"))
    const omitted = structuredClone(headers)
    delete omitted.acceptance[flag]
    assert.throws(() => verifyHeaders(omitted), error => error.code === "ERR_ASSERTION" && error.message.includes("retain header acceptance limits"))
  }
})

function verifyNativeScreen(value) {
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.headerFacts.sha256, hash(headerBytes), "native screen must bind the actual packaged-header observation")
  const expected = [
    ["CVE-2025-49794", "libxml2", "2.14.6", "2.15.0"],
    ["CVE-2026-0989", "libxml2", "2.14.6", null],
    ["CVE-2025-7424", "libxslt", "1.1.43", "1.1.44"],
    ["CVE-2025-7425", "libxml2", "2.14.6", "2.15.2"],
  ]
  assert.equal(value.advisories.length, expected.length)
  for (const [index, [id, packageName, declared, upper]] of expected.entries()) {
    const advisory = value.advisories[index]
    assert.equal(advisory.id, id)
    assert.equal(advisory.source, `https://cveawg.mitre.org/api/cve/${id}`)
    assert.equal(advisory.packageName, packageName, "retain CNA product attribution, including the libxslt-title/libxml2-product mismatch")
    assert.equal(advisory.declaredVersion, declared)
    if (upper === null) {
      assert.equal(advisory.upstreamRange, null, "missing upstream range cannot become a fabricated classification")
      assert.equal(advisory.classification, "unknown-no-upstream-range")
    } else {
      assert.deepEqual(advisory.upstreamRange, { version: "0", lessThan: upper, versionType: "semver", status: "affected", defaultStatus: "unaffected" })
      assert.equal(advisory.classification, "inside-published-range-only")
      const left = declared.split(".").map(Number)
      const right = upper.split(".").map(Number)
      const firstDifference = left.findIndex((part, i) => part !== right[i])
      assert.ok(firstDifference >= 0 && left[firstDifference] < right[firstDifference], "the declared version must actually be below the recorded boundary")
    }
    assert.equal(Object.hasOwn(advisory, "firstFixedRelease"), false, "a CNA exclusive boundary is not automatically a first fixed release")
    assert.ok(advisory.qualification.length > 30)
  }
  assert.equal(value.advisories[3].titleAlsoNamesLibxslt, true)
  const release = value.releaseEvidence.find(item => item.version === "1.1.45")
  assert.equal(release.includedReleaseVersion, "1.1.44")
  assert.equal(release.includedReleaseDate, "2025-11-23")
  assert.ok(release.explicitFixIds.includes("CVE-2025-7424"))
  assert.equal(value.releaseEvidence.find(item => item.version === "2.14.0").provesSelectedWheelAbi, false)
  assert.equal(value.acquisition.parentFetchCalls, value.acquisition.parentCveRecordsOpened + value.acquisition.parentGnomeNotesOrIndexRequests)
  for (const flag of ["childNetworkCountsIndependentlyAudited", "boundedBeforeFetch", "rawBodiesRetained", "byteIntegrityVerified"]) assert.equal(value.acquisition[flag], false)
  const flags = ["wheelAffectedEstablished", "linkedIdentityVerified", "abiVerified", "branchBackportsVerified", "exhaustiveVulnerabilityReview", "securityClearance", "installationAuthorized", "humanAcceptance"]
  assert.deepEqual(Object.keys(value.limits).sort(), flags.sort(), "retain native advisory acceptance limits")
  for (const flag of flags) assert.equal(value.limits[flag], false, "native range comparison cannot promote acceptance")
  for (const amount of Object.values(value.actions)) assert.equal(amount, 0)
}

test("native advisory evidence retains actual header identity, CNA ranges and release-level qualifications", () => verifyNativeScreen(nativeScreen))

test("missing ranges and conflicting product attribution cannot be silently repaired or cleared", () => {
  for (const change of [
    value => { value.headerFacts.sha256 = "0".repeat(64) },
    value => { value.advisories[1].upstreamRange = { lessThan: "2.15.2" } },
    value => { value.advisories[3].packageName = "libxslt" },
    value => { value.advisories[0].firstFixedRelease = "2.15.0" },
    value => { value.advisories[2].upstreamRange.lessThan = "1.1.43" },
  ]) {
    const changed = structuredClone(nativeScreen)
    change(changed)
    assert.throws(() => verifyNativeScreen(changed), { code: "ERR_ASSERTION" })
  }
})

test("native advisory observations cannot waive unknown wheel, backport, ABI or security acceptance", () => {
  for (const flag of Object.keys(nativeScreen.limits)) {
    const promoted = structuredClone(nativeScreen)
    promoted.limits[flag] = true
    assert.throws(() => verifyNativeScreen(promoted), error => error.code === "ERR_ASSERTION" && error.message.includes("cannot promote acceptance"))
    const omitted = structuredClone(nativeScreen)
    delete omitted.limits[flag]
    assert.throws(() => verifyNativeScreen(omitted), error => error.code === "ERR_ASSERTION" && error.message.includes("retain native advisory acceptance limits"))
  }
})

async function loadResources() {
  return JSON.parse(await readFile(new URL("docs/document-authoring-native-resource-facts-2026-10-31.json", root)))
}

// Preserve selected static observations without depending on private local receipts in CI.
function verifyResources(value) {
  assert.equal(value.schemaVersion, 1)
  assert.deepEqual(value.wheel, {
    filename: headers.wheel.filename,
    bytes: headers.wheel.bytes,
    sha256: headers.wheel.sha256,
    inventorySHA256: "2ee0e93a54e831f0aa51553545ce339f441ee5f3b8cabf3e05385b71cc2a6b10",
    entries: 188,
  }, "resource observations must bind the unchanged selected wheel")
  assert.equal(value.sourceReceipt.sha256, "d80cc87bda44d230f01a136ce6b00242ca24f8c7a7b9e3e01ed5e31963512e41", "retain actual preserved receipt identity")
  assert.equal(value.noticeBinding.member, "lxml-6.1.3.dist-info/licenses/LICENSES.txt")
  assert.equal(value.noticeBinding.sha256, "388fa99f3bde4447cd5a4cbb114037be026854db6cfe89e112691c1d8abdcf3c", "retain actual notice identity")
  assert.deepEqual(value.members.map(member => [member.member, member.bytes, member.sha256]), [
    ["lxml/isoschematron/resources/xsl/RNG2Schtrn.xsl", 3172, "39b79bb01f16b7e777b8803f539354f394e99d0dcfc4f5f7f1374e02aa2c31a7"],
    ["lxml/isoschematron/resources/xsl/XSD2Schtrn.xsl", 4563, "430791ac820cfb315c820f7c19703609a59f21b8151345ca11e6127efbfaec0d"],
    ["lxml/isoschematron/resources/rng/iso-schematron.rng", 18337, "56c5b13f28b78958890c36e3249c34c169041e42ebcfdce8080f3324ba2bf4de"],
  ], "retain all three complete selected resource identities")
  for (const member of value.members) {
    assert.equal(member.completeTextRead, true)
    assert.equal(member.readbackVerified, true)
  }
  assert.deepEqual(value.members.slice(0, 2).map(member => member.permissionGrantObservedInSelectedText), [false, false], "author attribution is not a permission grant")
  assert.deepEqual(value.members.slice(0, 2).map(member => member.documentFunctionCallSites), [2, 2], "retain static resource loading sites, not executed network claims")
  assert.deepEqual(value.members.map(member => member.attribution), [
    "Created by Eddie Robertsson 2002/06/01; 2009/12/10 namespace change attributed to Holger Joukl.",
    "Based on an original transform by Eddie Robertsson; dated fn/er changes and 2009/12/10 namespace change attributed to Holger Joukl.",
    "Copyright ISO/IEC 2015.",
  ], "retain observed author attribution, not an invented license")
  assert.deepEqual(value.members.slice(0, 2).map(member => member.resourceLoadingObservation), [
    "Static document() calls use RELAX-NG include href and externalRef href attributes, including recursive inclusion. No transformation is run.",
    "Static document() calls use XML Schema include/import/redefine schemaLocation attributes, including recursive inclusion. No transformation is run.",
  ], "retain exact static loading routes and non-execution qualification")
  assert.equal(value.members[2].permissionGrantObservedInSelectedText, true)
  assert.deepEqual(value.members[2].conditions, ["retain permission notice and disclaimer", "modified copies include the specified ISO/IEC 19757-3 nonconformance notice"])
  assert.deepEqual(value.nativePayloads.map(member => [member.member, member.declaredBytes]), [
    ["lxml/_elementpath.cpython-314-x86_64-linux-gnu.so", 200944],
    ["lxml/builder.cpython-314-x86_64-linux-gnu.so", 120928],
    ["lxml/etree.cpython-314-x86_64-linux-gnu.so", 5112760],
    ["lxml/objectify.cpython-314-x86_64-linux-gnu.so", 2875840],
    ["lxml/sax.cpython-314-x86_64-linux-gnu.so", 173920],
    ["lxml/html/_difflib.cpython-314-x86_64-linux-gnu.so", 521120],
    ["lxml/html/diff.cpython-314-x86_64-linux-gnu.so", 332752],
  ], "native inventory is metadata, not linked-library identification")
  assert.equal(value.selectedBytes, value.members.reduce((sum, member) => sum + member.bytes, 0))
  assert.equal(value.selectedBytes, 26072)
  assert.equal(value.limits.selectedAggregateBytes, 65536)
  assert.equal(value.limits.selectedMembers, 16)
  assert.equal(value.limits.jobCooperativeSeconds, 20)
  assert.ok(value.selectedBytes <= value.limits.selectedAggregateBytes)
  assert.ok(value.elapsedMs < value.limits.jobCooperativeSeconds * 1000)
  assert.deepEqual(value.exactRunnerQueries, ["test.py", "lxml/test.py", "src/lxml/test.py"].map(member => ({ member, present: false })))
  for (const phrase of ["Exact named paths only", "not a general GPL-content absence proof", "not executed", "not a complete rights review", "not atomic"]) {
    assert.ok(value.qualification.includes(phrase), `retain selected-resource qualification: ${phrase}`)
  }
  const flags = ["fullRightsApproval", "nativeLinkedIdentity", "abiVerified", "xmlSafety", "authoringReady", "installationAuthorized"]
  assert.deepEqual(Object.keys(value.acceptance).sort(), flags.sort(), "retain resource acceptance limits")
  for (const flag of flags) assert.equal(value.acceptance[flag], false, "static resource observations cannot promote acceptance")
  for (const amount of Object.values(value.actions)) assert.equal(amount, 0)
}

test("selected lxml resources retain complete member identities, rights observations and native inventory limits", async () => {
  verifyResources(await loadResources())
})

test("missing resource, source receipt, attribution or static loading evidence cannot silently disappear", async () => {
  const resources = await loadResources()
  for (const change of [
    value => value.members.pop(),
    value => { value.members[0].sha256 = "0".repeat(64) },
    value => { value.sourceReceipt.sha256 = "0".repeat(64) },
    value => { value.members[1].permissionGrantObservedInSelectedText = true },
    value => { value.members[0].documentFunctionCallSites = 0 },
    value => value.members[2].conditions.pop(),
    value => value.nativePayloads.pop(),
    value => { value.qualification = "Complete GPL absence proof" },
  ]) {
    const changed = structuredClone(resources)
    change(changed)
    assert.throws(() => verifyResources(changed), { code: "ERR_ASSERTION" })
  }
})

test("static resource inspection cannot waive rights, native, XML, authoring or installation gates", async () => {
  const resources = await loadResources()
  for (const flag of Object.keys(resources.acceptance)) {
    const promoted = structuredClone(resources)
    promoted.acceptance[flag] = true
    assert.throws(() => verifyResources(promoted), error => error.code === "ERR_ASSERTION" && error.message.includes("cannot promote acceptance"))
    const omitted = structuredClone(resources)
    delete omitted.acceptance[flag]
    assert.throws(() => verifyResources(omitted), error => error.code === "ERR_ASSERTION" && error.message.includes("retain resource acceptance limits"))
  }
})

test("resource review retains the actual notice, author attribution and schema-loading routes", async () => {
  const resources = await loadResources()
  for (const change of [
    value => { value.noticeBinding.sha256 = "0".repeat(64) },
    value => { value.members[0].attribution = "public domain" },
    value => { value.members[1].resourceLoadingObservation = "no resource loading" },
  ]) {
    const changed = structuredClone(resources)
    change(changed)
    assert.throws(() => verifyResources(changed), { code: "ERR_ASSERTION" })
  }
})
