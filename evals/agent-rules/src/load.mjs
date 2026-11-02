import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CorpusError } from "./errors.mjs"

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
)

export function pathsFor(root = REPO_ROOT) {
  const evalRoot = path.join(root, "evals/agent-rules")
  return {
    cases: path.join(evalRoot, "cases/cases.json"),
    knownGood: path.join(evalRoot, "controls/known-good.json"),
    knownBad: path.join(evalRoot, "controls/known-bad.json"),
    alternateGood: path.join(evalRoot, "controls/alternate-good.json"),
    references: path.join(root, "docs/golden-corpus/reference-sources/index.json"),
    exemplars: path.join(root, "docs/golden-corpus/reviewed-exemplars/index.json"),
  }
}

export function parseJson(text, label = "input") {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new CorpusError(`${label}: invalid JSON: ${error.message}`)
  }
}

export async function readJson(file, label = file) {
  let text
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    throw new CorpusError(`${label}: cannot read file: ${error.message}`)
  }
  return parseJson(text, label)
}

export async function loadCorpus({ root = REPO_ROOT } = {}) {
  const paths = pathsFor(root)
  const [cases, knownGood, knownBad, alternateGood, references, exemplars] =
    await Promise.all([
      readJson(paths.cases, "cases"),
      readJson(paths.knownGood, "known-good controls"),
      readJson(paths.knownBad, "known-bad controls"),
      readJson(paths.alternateGood, "alternate-good controls"),
      readJson(paths.references, "reference sources"),
      readJson(paths.exemplars, "reviewed exemplars"),
    ])

  return {
    root,
    paths,
    cases,
    controls: {
      "known-good": knownGood,
      "known-bad": knownBad,
      "alternate-good": alternateGood,
    },
    references,
    exemplars,
  }
}
