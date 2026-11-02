#!/usr/bin/env node
import { gradeCase, gradeControls } from "./src/grade.mjs"
import { loadCorpus, readJson } from "./src/load.mjs"
import { validateCorpus } from "./src/validate.mjs"

const usage = "Usage: node grade.mjs [--controls all|known-good|known-bad|alternate-good | --case <case-id> --trace <trace.json>] [--json]"
const options = new Map()
const allowedSelections = new Set(["all", "known-good", "known-bad", "alternate-good"])
try {
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (!["--case", "--trace", "--controls", "--json"].includes(name)) throw new Error(`Unknown argument: ${name}`)
    if (options.has(name)) throw new Error(`Duplicate argument: ${name}`)
    if (name === "--json") {
      options.set(name, true)
      continue
    }
    const value = args[++index]
    if (!value || value.startsWith("-")) throw new Error(`${name} requires a value`)
    options.set(name, value)
  }
  if (options.has("--case") !== options.has("--trace")) throw new Error("--case and --trace are required together")
  if (options.has("--controls") && options.has("--case")) throw new Error("--controls cannot be combined with a custom trace")
  if (options.has("--controls") && !allowedSelections.has(options.get("--controls"))) throw new Error("Unknown control selection")
} catch (error) {
  console.error(`${error.message}\n${usage}`)
  process.exit(2)
}

const json = options.has("--json")
const corpus = await loadCorpus().catch((error) => {
  console.error(`Cannot load corpus: ${error.message}`)
  process.exit(1)
})
const errors = await validateCorpus(corpus)
if (errors.length > 0) {
  console.error("Cannot grade an invalid corpus:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

const caseId = options.get("--case")
if (caseId) {
  const traceFile = options.get("--trace")
  const caseDef = corpus.cases.cases.find((entry) => entry.id === caseId)
  if (!caseDef) {
    console.error(`Unknown case: ${caseId}`)
    process.exit(2)
  }
  const trace = await readJson(traceFile, traceFile).catch((error) => {
    console.error(`Cannot read trace: ${error.message}`)
    process.exit(1)
  })
  let result
  try {
    result = gradeCase(caseDef, trace)
  } catch (error) {
    console.error(`Invalid trace: ${error.message}`)
    process.exit(1)
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.caseId} score=${result.score.toFixed(2)}`)
    for (const violation of result.violations) {
      console.log(`- ${violation.severity} ${violation.checkId}: ${violation.detail}`)
    }
  }
  process.exit(result.passed ? 0 : 1)
}

const selection = options.get("--controls") ?? "all"

const controls = gradeControls(corpus)
const results = selection === "all" ? controls.results : controls.results.filter((entry) => entry.label === selection)
const failed = results.filter((entry) => entry.passed !== (entry.expectedOutcome === "pass"))

if (json) {
  console.log(JSON.stringify({ selection, ok: controls.ok && failed.length === 0, errors: controls.errors, results }, null, 2))
} else {
  for (const entry of results) {
    const status = entry.passed ? "PASS" : "FAIL"
    const checks = entry.failedChecks.length > 0 ? ` failed=${entry.failedChecks.join(",")}` : ""
    console.log(`${status} ${entry.label.padEnd(14)} ${entry.caseId}${checks}`)
  }
  console.log(
    `controls: ${results.length - failed.length}/${results.length} matched expected outcome` +
      (controls.errors.length > 0 ? `; ${controls.errors.length} error(s)` : ""),
  )
  for (const error of controls.errors) console.log(`- ${error}`)
}

process.exit(controls.ok && failed.length === 0 ? 0 : 1)
