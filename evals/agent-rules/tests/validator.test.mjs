import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { CorpusError } from "../src/errors.mjs"
import { loadCorpus, parseJson } from "../src/load.mjs"
import { validateCorpus } from "../src/validate.mjs"

const corpus = await loadCorpus()
const baseErrors = await validateCorpus(corpus)
const mutate = async (change) => {
  const copy = structuredClone(corpus)
  change(copy)
  return validateCorpus(copy)
}
const expectError = (errors, fragment) =>
  assert.ok(
    errors.some((error) => error.includes(fragment)),
    `expected "${fragment}" in:\n${errors.join("\n")}`,
  )

test("the unmodified corpus is valid", () => {
  assert.deepEqual(baseErrors, [])
})

test("control outcome overrides cannot contradict their collection label", async () => {
  for (const label of ["known-good", "known-bad", "alternate-good"]) {
    const errors = await mutate(copy => {
      copy.controls[label].traces[0].expectedOutcome = label === "known-bad" ? "pass" : "fail"
    })
    expectError(errors, "expectedOutcome: must match collection")
  }
})

test("corrupt JSON is rejected with a corpus error", async () => {
  const text = await readFile(new URL("./fixtures/invalid/corrupt.json", import.meta.url), "utf8")
  assert.throws(() => parseJson(text, "corrupt fixture"), CorpusError)
  await assert.rejects(loadCorpus({ root: "/tmp/opencode/does-not-exist" }), CorpusError)
})

test("missing case IDs and duplicate case IDs are rejected", async () => {
  const missing = await mutate((copy) => {
    delete copy.cases.cases[0].id
  })
  expectError(missing, ".id: must match AGR-<CATEGORY>-<NNN>")

  const duplicate = await mutate((copy) => {
    copy.cases.cases[1].id = copy.cases.cases[0].id
  })
  expectError(duplicate, "duplicate case id")
})

test("gold cannot be claimed while review is unreviewed", async () => {
  const errors = await mutate((copy) => {
    copy.cases.cases[0].tier = "gold"
  })
  expectError(errors, "gold requires recorded human review")
  expectError(errors, "gold requires human_reviewed status")

  const manifest = await mutate((copy) => {
    copy.cases.review.reviewer = "agent:auto"
  })
  expectError(manifest, "must be null before review")
})

test("human_reviewed requires a human reviewer, date and evidence", async () => {
  const errors = await mutate((copy) => {
    const caseDef = copy.cases.cases[0]
    caseDef.tier = "gold"
    caseDef.review = { status: "human_reviewed", reviewer: null, reviewedAt: null, evidence: null }
  })
  expectError(errors, "human reviewer is required")
  expectError(errors, "must be an ISO date")
  expectError(errors, "review evidence is required")
})

test("an automated actor cannot satisfy human review", async () => {
  const errors = await mutate((copy) => {
    const caseDef = copy.cases.cases[0]
    caseDef.tier = "gold"
    caseDef.review = { status: "human_reviewed", reviewer: "agent:auto", reviewedAt: "2026-10-29", evidence: "review.md" }
  })
  expectError(errors, "must identify a human reviewer")
})

test("a structurally valid declared human review is accepted while the manifest stays candidate", async () => {
  const errors = await mutate((copy) => {
    const caseDef = copy.cases.cases[0]
    caseDef.tier = "gold"
    caseDef.review = { status: "human_reviewed", reviewer: "Jane Reviewer", reviewedAt: "2026-10-29", evidence: "docs/review.md" }
  })
  assert.deepEqual(errors, [])
})

test("unknown effects and contradictory required/forbidden rules are rejected", async () => {
  const unknown = await mutate((copy) => {
    copy.cases.cases[0].expected.requiredActions.push({
      effect: "frobnicate",
      target: "somewhere",
      source: "tool",
      min: 1,
      description: "not a real effect",
    })
  })
  expectError(unknown, "unknown effect")

  const contradictory = await mutate((copy) => {
    copy.cases.cases[0].expected.forbiddenActions.push({
      effect: "inspect",
      target: "screen",
      reason: "contradicts the required observation",
      severity: "high",
    })
  })
  expectError(contradictory, "contradicts a required check")
})

// Exact-key comparison misses a glob that overlaps the other rule, which would
// accept a case that no trace can pass.
test("a forbidden exact target inside a required glob is rejected", async () => {
  const errors = await mutate((copy) => {
    const [required] = copy.cases.cases[0].expected.requiredActions
    required.targetGlob = "config/*"
    delete required.target
    copy.cases.cases[0].expected.forbiddenActions.push({
      effect: "inspect",
      target: "config/settings.json",
      reason: "overlaps the required glob",
      severity: "high",
    })
  })
  expectError(errors, "contradicts a required check")
})

test("a forbidden glob covering a required exact target is rejected", async () => {
  const errors = await mutate((copy) => {
    copy.cases.cases[0].expected.forbiddenActions.push({
      effect: "inspect",
      targetGlob: "scr*",
      reason: "overlaps the required exact target",
      severity: "high",
    })
  })
  expectError(errors, "contradicts a required check")
})

test("two overlapping globs are rejected while disjoint globs remain valid", async () => {
  const overlapping = await mutate((copy) => {
    const [required] = copy.cases.cases[0].expected.requiredActions
    required.targetGlob = "config/*"
    delete required.target
    copy.cases.cases[0].expected.forbiddenActions.push({
      effect: "inspect",
      targetGlob: "config/*.json",
      reason: "overlaps the required glob",
      severity: "high",
    })
  })
  expectError(overlapping, "contradicts a required check")

  const disjoint = await mutate((copy) => {
    const [required] = copy.cases.cases[0].expected.requiredActions
    required.targetGlob = "config/*"
    delete required.target
    copy.cases.cases[0].expected.forbiddenActions.push({
      effect: "inspect",
      targetGlob: "logs/*",
      reason: "never matches the required tree",
      severity: "high",
    })
  })
  assert.ok(
    !disjoint.some((error) => error.includes("contradicts a required check")),
    disjoint.join("\n"),
  )
})

test("a claim cannot be both forbidden and grounded", async () => {
  const errors = await mutate((copy) => {
    copy.cases.cases[0].expected.forbiddenClaims.push({
      claim: "screen_observed",
      reason: "contradicts the grounding rule",
      severity: "high",
    })
  })
  expectError(errors, "is both forbidden and grounded")
})

test("invalid forbidden-action sources cannot silently disable a prohibition", async () => {
  const errors = await mutate(copy => {
    copy.cases.cases[0].expected.forbiddenActions[0].source = "typo"
  })
  expectError(errors, "forbiddenActions[0].source: must be tool, assistant or event")
})

test("claim-grounding targets use the same validated target semantics as actions", async () => {
  for (const [fields, fragment] of [
    [{ target: "primary_source", targetGlob: "*" }, "target and targetGlob are mutually exclusive"],
    [{ target: 7 }, ".target: must be a non-empty string"],
    [{ targetGlob: [] }, ".targetGlob: must be a non-empty string"],
  ]) {
    const errors = await mutate(copy => {
      const rule = copy.cases.cases[0].expected.claimGrounding[0]
      delete rule.target
      delete rule.targetGlob
      Object.assign(rule, fields)
    })
    expectError(errors, fragment)
  }
})

test("dangling and cyclic supersession links are rejected", async () => {
  const dangling = await mutate((copy) => {
    copy.cases.cases[0].supersession.supersededBy = "AGR-ROUTE-999"
    copy.cases.cases[0].supersession.reason = "synthetic replacement"
  })
  expectError(dangling, "unknown case AGR-ROUTE-999")

  const cycle = await mutate((copy) => {
    const [first, second] = copy.cases.cases
    first.supersession = { supersedes: [second.id], supersededBy: second.id, reason: "cycle" }
    second.supersession = { supersedes: [first.id], supersededBy: first.id, reason: "cycle" }
  })
  expectError(cycle, "supersession cycle")
})

test("broken, missing and duplicate reference sources are rejected", async () => {
  const broken = await mutate((copy) => {
    copy.cases.cases[0].provenance.referenceIds = ["REF-999"]
  })
  expectError(broken, "unknown reference REF-999")

  const missingFile = await mutate((copy) => {
    copy.references.sources.find((source) => source.id === "REF-001").location = "docs/missing-reference-source.md"
  })
  expectError(missingFile, "local source file does not exist")

  const duplicate = await mutate((copy) => {
    copy.references.sources[1].id = copy.references.sources[0].id
  })
  expectError(duplicate, "duplicate reference id")
})

test("reported external sources cannot masquerade as read or restate statistics", async () => {
  const notUrl = await mutate((copy) => {
    copy.references.sources.find((source) => /^https?:/.test(source.location)).location = "not-a-url"
  })
  expectError(notUrl, "must be an HTTP(S) URL")

  const statistics = await mutate((copy) => {
    copy.references.sources[0].statisticsCopied = true
  })
  expectError(statistics, "must be false; no statistic is restated")
})

const markPublicRead = (copy) => {
  const source = copy.references.sources.find(source => /^https?:/.test(source.location))
  source.verification = {
    status: "public_read", checkedAt: "2026-10-30",
    locator: "Repository knowledge section",
    notes: "Source supports structured guidance; no local model outcome is established.",
  }
  return source
}

test("a dated public-source read is distinct from human review and preserves report provenance", async () => {
  const copy = structuredClone(corpus)
  const source = markPublicRead(copy)
  const original = corpus.references.sources.find(item => item.id === source.id)
  assert.equal(source.retrieved, original.retrieved)
  assert.equal(copy.references.status, "candidate")
  assert.equal(copy.references.review.status, "unreviewed")
  assert.deepEqual(await validateCorpus(copy), [])
})

test("public-read records require a URL, check date, passage locator and material finding", async () => {
  for (const [field, value, fragment] of [
    ["location", "docs/local-only.md", "must be an HTTP(S) URL"],
    ["checkedAt", null, "checkedAt: must be an ISO date"],
    ["locator", "", "locator: is required"],
    ["notes", "", "notes: is required"],
  ]) {
    const errors = await mutate(copy => {
      const source = markPublicRead(copy)
      if (field === "location") source.location = value
      else source.verification[field] = value
    })
    expectError(errors, fragment)
  }
})

test("an unretrieved report stays supported but cannot acquire a checked date", async () => {
  const copy = structuredClone(corpus)
  const source = markPublicRead(copy)
  source.verification = { status: "reported_unverified", checkedAt: null, notes: "Historical report; no source read." }
  assert.deepEqual(await validateCorpus(copy), [])
  source.verification.checkedAt = "2026-10-30"
  expectError(await validateCorpus(copy), "must be null when not re-fetched")
  source.verification = { status: "local_read", checkedAt: "2026-10-30", notes: "Incorrect local-source claim." }
  expectError(await validateCorpus(copy), "a local_read source must use a repository path")
})

test("candidate exemplars cannot claim gold, human review or unknown cases", async () => {
  const gold = await mutate((copy) => {
    copy.exemplars.exemplars[0].tier = "gold"
  })
  expectError(gold, "gold requires recorded human review")

  const unknownCase = await mutate((copy) => {
    copy.exemplars.exemplars[0].caseIds = ["AGR-ROUTE-999"]
  })
  expectError(unknownCase, "unknown case AGR-ROUTE-999")

  const manifestReview = await mutate((copy) => {
    copy.exemplars.review.status = "human_reviewed"
  })
  expectError(manifestReview, "manifest must remain unreviewed")
})

test("missing exemplar category coverage is rejected", async () => {
  const errors = await mutate((copy) => {
    copy.exemplars.exemplars = copy.exemplars.exemplars.filter((exemplar) => exemplar.category !== "skill-routing")
  })
  expectError(errors, "missing candidate exemplar for skill-routing")
})

test("controls must cover every case and reject unknown or duplicate case IDs", async () => {
  const missing = await mutate((copy) => {
    copy.controls["known-good"].traces.pop()
  })
  expectError(missing, "missing control for")

  const unknown = await mutate((copy) => {
    copy.controls["known-good"].traces.push({
      caseId: "AGR-XXX-999",
      trace: { caseId: "AGR-XXX-999", actions: [], claims: [] },
    })
  })
  expectError(unknown, "unknown case AGR-XXX-999")

  const duplicate = await mutate((copy) => {
    copy.controls["known-good"].traces.push(structuredClone(copy.controls["known-good"].traces[0]))
  })
  expectError(duplicate, "duplicate control for")
})

test("control labels, expected outcomes and action effects are validated", async () => {
  const outcome = await mutate((copy) => {
    copy.controls["known-bad"].expectedOutcome = "pass"
  })
  expectError(outcome, "expectedOutcome: must be fail")

  const effect = await mutate((copy) => {
    copy.controls["known-good"].traces[0].trace.actions[0].effect = "frobnicate"
  })
  expectError(effect, "unknown effect: frobnicate")

  const failedCheck = await mutate((copy) => {
    delete copy.controls["known-bad"].traces[0].expectedFailedCheck
  })
  expectError(failedCheck, "must name the intended failing check")
})

test("private-data claims and secret-like values are rejected", async () => {
  const privateData = await mutate((copy) => {
    copy.cases.cases[0].provenance.containsPrivateData = true
  })
  expectError(privateData, "must be false")

  const versionScope = await mutate((copy) => {
    delete copy.cases.cases[0].provenance.publicVersions
  })
  expectError(versionScope, "publicVersions: must be a non-empty array")

  const secret = await mutate((copy) => {
    copy.cases.cases[0].title += ` ghp_${"a".repeat(36)}`
  })
  expectError(secret, "contains secret-like GitHub token")
})

test("a case without a legitimate action is rejected so refusal-everything cannot pass review", async () => {
  const errors = await mutate((copy) => {
    copy.cases.cases[0].task.legitimateAction = ""
  })
  expectError(errors, "is required so refusal-everything is not accepted")
})

test("too few cases or categories are rejected without imposing the 30-case proposal as a quota", async () => {
  const tooFew = await mutate((copy) => {
    copy.cases.cases = copy.cases.cases.slice(0, 10)
  })
  expectError(tooFew, "must contain at least 24 representative cases")

  const category = await mutate((copy) => {
    copy.cases.cases = copy.cases.cases.filter((caseDef) => caseDef.category !== "skill-routing")
  })
  expectError(category, "category skill-routing has 0; at least 3 required")
})
