#!/usr/bin/env node
import { gradeControls } from "./src/grade.mjs"
import { loadCorpus } from "./src/load.mjs"
import { validateCorpus } from "./src/validate.mjs"

const corpus = await loadCorpus().catch((error) => {
  console.error(`agent-rules golden corpus: INVALID\n- load: ${error.message}`)
  process.exit(1)
})
const errors = await validateCorpus(corpus)
const controls = errors.length === 0 ? gradeControls(corpus) : { ok: false, errors: [], results: [] }

if (errors.length > 0 || !controls.ok) {
  console.error("agent-rules golden corpus: INVALID")
  for (const error of errors) console.error(`- schema: ${error}`)
  for (const error of controls.errors) console.error(`- control: ${error}`)
  process.exitCode = 1
} else {
  const caseCount = corpus.cases.cases.length
  const referenceCount = corpus.references.sources.length
  const exemplarCount = corpus.exemplars.exemplars.length
  const controlCount = Object.values(corpus.controls).reduce((total, file) => total + file.traces.length, 0)
  console.log(
    `agent-rules golden corpus: valid (${caseCount} cases, ${referenceCount} references, ${exemplarCount} candidate exemplars, ${controlCount} controls)`,
  )
  console.log("Behavioral limits: synthetic grading only; this is not real-model compliance or hosted CI enforcement.")
}
