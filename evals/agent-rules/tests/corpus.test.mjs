import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import test from "node:test"
import { CATEGORIES } from "../src/constants.mjs"
import { gradeControls } from "../src/grade.mjs"
import { loadCorpus } from "../src/load.mjs"
import { validateCorpus } from "../src/validate.mjs"

const run = promisify(execFile)
const evalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const corpus = await loadCorpus()
const errors = await validateCorpus(corpus)

test("the candidate corpus passes schema and cross-collection validation", () => {
  assert.deepEqual(errors, [])
})

test("three distinct collections are linked without merging their roles", () => {
  assert.equal(corpus.cases.corpus, "behavioral-regression-evaluations")
  assert.equal(corpus.references.collection, "reference-sources")
  assert.equal(corpus.exemplars.collection, "reviewed-exemplars")
  assert.equal(corpus.references.status, "candidate")
  assert.equal(corpus.exemplars.status, "candidate")

  const refIds = new Set(corpus.references.sources.map((source) => source.id))
  const caseIds = new Set(corpus.cases.cases.map((caseDef) => caseDef.id))
  for (const caseDef of corpus.cases.cases) {
    for (const id of caseDef.provenance.referenceIds) assert.ok(refIds.has(id), `${caseDef.id} -> ${id}`)
  }
  for (const exemplar of corpus.exemplars.exemplars) {
    for (const id of exemplar.caseIds) assert.ok(caseIds.has(id), `${exemplar.id} -> ${id}`)
    for (const id of exemplar.provenance.referenceIds) assert.ok(refIds.has(id), `${exemplar.id} -> ${id}`)
  }
})

test("the starting set is representative across all six categories with stable IDs", () => {
  const cases = corpus.cases.cases
  assert.ok(cases.length >= 24)
  assert.equal(new Set(cases.map((caseDef) => caseDef.id)).size, cases.length)
  for (const category of CATEGORIES) {
    const inCategory = cases.filter((caseDef) => caseDef.category === category)
    assert.ok(inCategory.length >= 3, category)
  }
  for (const caseDef of cases) assert.match(caseDef.id, /^AGR-[A-Z]{2,6}-\d{3}$/)
})

test("every case carries provenance, a task, expected and forbidden outcomes, and limits", () => {
  for (const caseDef of corpus.cases.cases) {
    assert.equal(caseDef.provenance.synthetic, true, caseDef.id)
    assert.equal(caseDef.provenance.containsPrivateData, false, caseDef.id)
    assert.ok(caseDef.provenance.derivedFrom.length > 0, caseDef.id)
    assert.ok(caseDef.provenance.publicVersions.length > 0, caseDef.id)
    assert.ok(caseDef.task.prompt.length > 0, caseDef.id)
    assert.ok(caseDef.task.legitimateAction.length > 0, caseDef.id)
    assert.ok(caseDef.expected.requiredActions.length > 0, caseDef.id)
    assert.ok(caseDef.expected.forbiddenActions.length > 0 || caseDef.expected.forbiddenClaims.length > 0, caseDef.id)
    assert.ok(caseDef.limits.length > 0, caseDef.id)
  }
})

test("human-reviewed gold is not claimed before review", () => {
  for (const caseDef of corpus.cases.cases) {
    assert.equal(caseDef.tier, "candidate", caseDef.id)
    assert.equal(caseDef.review.status, "unreviewed", caseDef.id)
    assert.equal(caseDef.review.reviewer, null, caseDef.id)
    assert.equal(caseDef.review.reviewedAt, null, caseDef.id)
  }
  for (const exemplar of corpus.exemplars.exemplars) {
    assert.equal(exemplar.tier, "candidate", exemplar.id)
    assert.equal(exemplar.review.status, "unreviewed", exemplar.id)
  }
  assert.equal(corpus.cases.review.status, "unreviewed")
  assert.equal(corpus.exemplars.review.status, "unreviewed")
})

test("public source reads retain report dates and passage evidence without copying statistics or human-review claims", () => {
  for (const source of corpus.references.sources) {
    assert.equal(source.statisticsCopied, false, source.id)
    if (/^https?:/.test(source.location)) {
      assert.equal(source.verification.status, "public_read", source.id)
      assert.equal(source.retrieved, "2026-10-28", source.id)
      assert.equal(source.verification.checkedAt, "2026-10-30", source.id)
      assert.ok(source.verification.locator.trim(), source.id)
      assert.ok(source.verification.notes.trim(), source.id)
    } else {
      assert.equal(source.verification.status, "local_read", source.id)
      assert.match(source.verification.checkedAt, /^\d{4}-\d{2}-\d{2}$/)
    }
  }
  assert.equal(corpus.references.status, "candidate")
  assert.equal(corpus.references.review.status, "unreviewed")
})

test("known-good and known-bad controls cover every case and grade as intended", () => {
  const controls = gradeControls(corpus)
  assert.deepEqual(controls.errors, [])
  assert.equal(controls.ok, true)
  const goodResults = controls.results.filter((entry) => entry.label === "known-good")
  const badResults = controls.results.filter((entry) => entry.label === "known-bad")
  assert.equal(goodResults.length, corpus.cases.cases.length)
  assert.equal(badResults.length, corpus.cases.cases.length)
  assert.ok(controls.results.filter((entry) => entry.label === "alternate-good").length >= 1)
  for (const entry of controls.results) {
    if (entry.label === "known-bad") {
      assert.equal(entry.passed, false, entry.caseId)
      assert.ok(entry.failedChecks.length > 0, entry.caseId)
    } else {
      assert.equal(entry.passed, true, entry.caseId)
    }
  }
})

test("no case, control or reference contains a secret-like value", async () => {
  const { readFile } = await import("node:fs/promises")
  const files = [
    "cases/cases.json",
    "controls/known-good.json",
    "controls/known-bad.json",
    "controls/alternate-good.json",
  ]
  for (const file of files) {
    const text = await readFile(path.join(evalRoot, file), "utf8")
    assert.doesNotMatch(text, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, file)
    assert.doesNotMatch(text, /\bsk-[A-Za-z0-9]{20,}\b/, file)
    assert.doesNotMatch(text, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, file)
  }
})

test("the offline validator CLI exits zero and reports the collection counts", async () => {
  const { stdout } = await run(process.execPath, ["validate.mjs"], { cwd: evalRoot, timeout: 20_000 })
  assert.match(stdout, /valid \(\d+ cases, \d+ references, \d+ candidate exemplars, \d+ controls\)/)
  assert.match(stdout, /not real-model compliance or hosted CI enforcement/)
})

test("the offline grader CLI exits zero for all controls", async () => {
  const { stdout } = await run(process.execPath, ["grade.mjs", "--controls", "all"], { cwd: evalRoot, timeout: 20_000 })
  const match = stdout.match(/controls: (\d+)\/(\d+) matched expected outcome/)
  assert.ok(match)
  assert.equal(match[1], match[2])
})

test("invalid grader arguments cannot silently select passing controls", async () => {
  for (const args of [
    ["--contorls", "known-bad"],
    ["--controls"],
    ["--trace", "not-read.json"],
    ["--case", "AGR-AU-017"],
    ["--case", "AGR-AU-017", "--trace", "not-read.json", "--controls", "all"],
    ["--controls", "all", "--controls", "known-good"],
    ["--json", "--json"],
    ["unexpected-positional.json"],
    ["--case", "--trace", "not-read.json"],
  ]) {
    await assert.rejects(run(process.execPath, ["grade.mjs", ...args], { cwd: evalRoot, timeout: 20_000 }), error => {
      assert.equal(error.code, 2, JSON.stringify(args))
      assert.match(error.stderr, /Usage:/)
      assert.equal(error.stdout, "", "invalid invocation must not emit a passing grade")
      assert.doesNotMatch(error.stderr, /Cannot read trace/, "arguments are checked before opening a trace")
      return true
    })
  }
})

test("custom trace CLI grades the requested outcome rather than default controls", async t => {
  const directory = await mkdtemp("/tmp/opencode/corpus-cli-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, "trace.json")
  const trace = structuredClone(corpus.controls["known-good"].traces.find(entry => entry.caseId === "AGR-AU-017").trace)
  const args = ["grade.mjs", "--json", "--case", trace.caseId, "--trace", file]
  await writeFile(file, JSON.stringify(trace))
  const { stdout } = await run(process.execPath, args, { cwd: evalRoot, timeout: 20_000 })
  assert.equal(JSON.parse(stdout).caseId, trace.caseId)
  assert.equal(JSON.parse(stdout).passed, true)
  trace.actions.push({ tool: "git.push", effect: "push", target: "origin", source: "tool", recorded: true })
  await writeFile(file, JSON.stringify(trace))
  await assert.rejects(run(process.execPath, args, { cwd: evalRoot, timeout: 20_000 }), error => {
    assert.equal(error.code, 1)
    const result = JSON.parse(error.stdout)
    assert.equal(result.caseId, trace.caseId)
    assert.equal(result.passed, false)
    assert.ok(result.violations.some(item => item.checkId === "forbid:push:*"))
    return true
  })
})
