import { stat } from "node:fs/promises"
import path from "node:path"
import {
  CASE_ID_PATTERN,
  CATEGORIES,
  CLAIM_PATTERN,
  EFFECTS,
  EXEMPLAR_ID_PATTERN,
  MIN_CASES,
  MIN_CASES_PER_CATEGORY,
  REFERENCE_ID_PATTERN,
  REVIEW_STATUSES,
  SCHEMA_VERSION,
  SEVERITIES,
  SOURCES,
  SOURCE_KINDS,
  TASK_MODES,
  TIERS,
} from "./constants.mjs"
import { targetSetsOverlap } from "./targets.mjs"

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const hasText = (value) => typeof value === "string" && value.trim().length > 0
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const isUrl = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
const add = (errors, where, message) => errors.push(`${where}: ${message}`)
const targetKey = (rule) => rule.target ?? rule.targetGlob ?? "*"
const checkKey = (kind, rule) => `${kind}:${rule.effect}:${targetKey(rule)}`

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private-key material"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "GitHub token"],
  [/\bsk-[A-Za-z0-9]{20,}\b/, "API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS key"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  [/(?:\bpassword|\bpasswd|\bsecret|\bapi[_-]?key|\baccess[_-]?token)\s*[:=]\s*["']?[^\s"']{8,}/i, "assigned secret"],
]

function scanSecrets(value, where, errors) {
  if (typeof value === "string") {
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(value)) add(errors, where, `contains secret-like ${label}`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecrets(item, `${where}[${index}]`, errors))
    return
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) scanSecrets(item, `${where}.${key}`, errors)
  }
}

function validateReviewAndTier(value, where, errors, { allowReviewed = false } = {}) {
  if (!isObject(value.review)) {
    add(errors, `${where}.review`, "must be an object")
    return
  }
  const review = value.review
  if (!REVIEW_STATUSES.has(review.status)) add(errors, `${where}.review.status`, "must be unreviewed or human_reviewed")
  if (!TIERS.has(value.tier)) add(errors, `${where}.tier`, "must be candidate or gold")

  if (review.status === "unreviewed") {
    if (review.reviewer != null) add(errors, `${where}.review.reviewer`, "must be null before review")
    if (review.reviewedAt != null) add(errors, `${where}.review.reviewedAt`, "must be null before review")
    if (review.evidence != null) add(errors, `${where}.review.evidence`, "must be null before review")
    if (value.tier !== "candidate") add(errors, `${where}.tier`, "gold requires recorded human review")
  }

  if (review.status === "human_reviewed") {
    if (!allowReviewed) add(errors, `${where}.review.status`, "this candidate collection must remain unreviewed in this release")
    if (!hasText(review.reviewer)) add(errors, `${where}.review.reviewer`, "human reviewer is required")
    else if (/^(agent|model|automated|auto)\b/i.test(review.reviewer)) {
      add(errors, `${where}.review.reviewer`, "must identify a human reviewer, not an automated actor")
    }
    if (!isDate(review.reviewedAt)) add(errors, `${where}.review.reviewedAt`, "must be an ISO date")
    if (!hasText(review.evidence)) add(errors, `${where}.review.evidence`, "review evidence is required")
  }

  if (value.tier === "gold" && review.status !== "human_reviewed") {
    add(errors, `${where}.tier`, "gold requires human_reviewed status")
  }
}

function validateManifest(file, where, errors, { collection, corpus } = {}) {
  if (!isObject(file)) {
    add(errors, where, "must be an object")
    return false
  }
  if (file.schemaVersion !== SCHEMA_VERSION) add(errors, `${where}.schemaVersion`, `must be ${SCHEMA_VERSION}`)
  if (!hasText(file.corpusVersion)) add(errors, `${where}.corpusVersion`, "is required")
  if (collection && file.collection !== collection) add(errors, `${where}.collection`, `must be ${collection}`)
  if (corpus && file.corpus !== corpus) add(errors, `${where}.corpus`, `must be ${corpus}`)
  if (file.status !== "candidate") add(errors, `${where}.status`, "must remain candidate until human review")
  if (!isObject(file.review)) add(errors, `${where}.review`, "must be an object")
  else if (file.review.status !== "unreviewed") add(errors, `${where}.review.status`, "manifest must remain unreviewed in this release")
  else {
    if (file.review.reviewer != null) add(errors, `${where}.review.reviewer`, "must be null before review")
    if (file.review.reviewedAt != null) add(errors, `${where}.review.reviewedAt`, "must be null before review")
    if (file.review.evidence != null) add(errors, `${where}.review.evidence`, "must be null before review")
  }
  return true
}

function validateTargetRule(rule, where, errors) {
  if (!isObject(rule)) {
    add(errors, where, "must be an object")
    return false
  }
  if (!EFFECTS.has(rule.effect)) add(errors, `${where}.effect`, `unknown effect: ${String(rule.effect)}`)
  const hasTarget = rule.target !== undefined
  const hasGlob = rule.targetGlob !== undefined
  if (hasTarget && hasGlob) add(errors, where, "target and targetGlob are mutually exclusive")
  if (hasTarget && !hasText(rule.target)) add(errors, `${where}.target`, "must be a non-empty string")
  if (hasGlob && !hasText(rule.targetGlob)) add(errors, `${where}.targetGlob`, "must be a non-empty string")
  if (rule.source !== undefined && !SOURCES.has(rule.source)) add(errors, `${where}.source`, "must be tool, assistant or event")
  return true
}

function validateClaimRule(rule, where, errors) {
  if (!isObject(rule)) {
    add(errors, where, "must be an object")
    return
  }
  if (!CLAIM_PATTERN.test(String(rule.claim ?? ""))) add(errors, `${where}.claim`, "must be a lowercase claim tag")
}

function validateCase(caseDef, where, errors, refIds) {
  if (!isObject(caseDef)) {
    add(errors, where, "must be an object")
    return
  }
  if (!CASE_ID_PATTERN.test(String(caseDef.id ?? ""))) add(errors, `${where}.id`, "must match AGR-<CATEGORY>-<NNN>")
  if (!Number.isInteger(caseDef.version) || caseDef.version < 1) add(errors, `${where}.version`, "must be a positive integer")
  if (!CATEGORIES.includes(caseDef.category)) add(errors, `${where}.category`, "must be a known category")
  if (!SEVERITIES.has(caseDef.severity)) add(errors, `${where}.severity`, "must be low, medium, high or critical")
  if (!hasText(caseDef.title) || caseDef.title.length > 160) add(errors, `${where}.title`, "must be 1-160 characters")

  if (!isObject(caseDef.provenance)) add(errors, `${where}.provenance`, "must be an object")
  else {
    const provenance = caseDef.provenance
    if (provenance.synthetic !== true) add(errors, `${where}.provenance.synthetic`, "must be true")
    if (provenance.containsPrivateData !== false) add(errors, `${where}.provenance.containsPrivateData`, "must be false")
    if (!Array.isArray(provenance.derivedFrom) || provenance.derivedFrom.length === 0) {
      add(errors, `${where}.provenance.derivedFrom`, "must list at least one incident or source")
    }
    if (!Array.isArray(provenance.referenceIds) || provenance.referenceIds.length === 0) {
      add(errors, `${where}.provenance.referenceIds`, "must reference at least one catalogued source")
    } else {
      for (const id of provenance.referenceIds) {
        if (!refIds.has(id)) add(errors, `${where}.provenance.referenceIds`, `unknown reference ${id}`)
      }
    }
    if (!Array.isArray(provenance.publicVersions) || provenance.publicVersions.length === 0 || provenance.publicVersions.some((item) => !hasText(item))) {
      add(errors, `${where}.provenance.publicVersions`, "must be a non-empty array of version-scope strings")
    }
    if (!hasText(provenance.generalization)) add(errors, `${where}.provenance.generalization`, "is required")
  }

  if (!isObject(caseDef.task)) add(errors, `${where}.task`, "must be an object")
  else {
    if (!TASK_MODES.has(caseDef.task.mode)) add(errors, `${where}.task.mode`, "must be plan, build, auto or review")
    if (!hasText(caseDef.task.prompt) || caseDef.task.prompt.length > 4000) add(errors, `${where}.task.prompt`, "must be 1-4000 characters")
    if (!Array.isArray(caseDef.task.context) || caseDef.task.context.some((item) => !hasText(item))) {
      add(errors, `${where}.task.context`, "must be an array of non-empty strings")
    }
    if (!hasText(caseDef.task.legitimateAction)) add(errors, `${where}.task.legitimateAction`, "is required so refusal-everything is not accepted")
  }

  if (!isObject(caseDef.expected)) {
    add(errors, `${where}.expected`, "must be an object")
  } else {
    const expected = caseDef.expected
    const requiredKeys = new Set()
    const requiredRules = []
    if (!Array.isArray(expected.requiredActions) || expected.requiredActions.length === 0) {
      add(errors, `${where}.expected.requiredActions`, "must contain at least one observable outcome")
    } else {
      expected.requiredActions.forEach((rule, index) => {
        const ruleWhere = `${where}.expected.requiredActions[${index}]`
        if (!validateTargetRule(rule, ruleWhere, errors)) return
        if (!Number.isInteger(rule.min) || rule.min < 1) add(errors, `${ruleWhere}.min`, "must be a positive integer")
        if (!SOURCES.has(rule.source)) add(errors, `${ruleWhere}.source`, "must be tool, assistant or event")
        if (!hasText(rule.description)) add(errors, `${ruleWhere}.description`, "must describe the observable outcome")
        const key = checkKey("require", rule)
        if (requiredKeys.has(key)) add(errors, ruleWhere, `duplicate required check ${key}`)
        requiredKeys.add(key)
        requiredRules.push(rule)
      })
    }

    const forbiddenKeys = new Set()
    for (const [name, kind] of [["forbiddenActions", "forbid"]]) {
      if (!Array.isArray(expected[name])) {
        add(errors, `${where}.expected.${name}`, "must be an array")
        continue
      }
      expected[name].forEach((rule, index) => {
        const ruleWhere = `${where}.expected.${name}[${index}]`
        if (!validateTargetRule(rule, ruleWhere, errors)) return
        if (!hasText(rule.reason)) add(errors, `${ruleWhere}.reason`, "must explain the forbidden effect")
        if (rule.severity !== undefined && !SEVERITIES.has(rule.severity)) add(errors, `${ruleWhere}.severity`, "is invalid")
        const key = checkKey(kind, rule)
        if (forbiddenKeys.has(key)) add(errors, ruleWhere, `duplicate forbidden check ${key}`)
        forbiddenKeys.add(key)
        const conflict = requiredRules.find((required) => targetSetsOverlap(required, rule))
        if (conflict) add(errors, ruleWhere, `contradicts a required check ${checkKey("require", conflict)}`)
      })
    }

    if (!Array.isArray(expected.forbiddenClaims)) {
      add(errors, `${where}.expected.forbiddenClaims`, "must be an array")
    } else {
      const seen = new Set()
      expected.forbiddenClaims.forEach((rule, index) => {
        const ruleWhere = `${where}.expected.forbiddenClaims[${index}]`
        validateClaimRule(rule, ruleWhere, errors)
        if (!hasText(rule.reason)) add(errors, `${ruleWhere}.reason`, "must explain the forbidden claim")
        if (rule.severity !== undefined && !SEVERITIES.has(rule.severity)) add(errors, `${ruleWhere}.severity`, "is invalid")
        if (seen.has(rule.claim)) add(errors, ruleWhere, `duplicate forbidden claim ${rule.claim}`)
        seen.add(rule.claim)
      })
    }

    if (!Array.isArray(expected.claimGrounding)) {
      add(errors, `${where}.expected.claimGrounding`, "must be an array")
    } else {
      const seen = new Set()
      const forbiddenClaims = new Set((expected.forbiddenClaims ?? []).map((rule) => rule.claim))
      expected.claimGrounding.forEach((rule, index) => {
        const ruleWhere = `${where}.expected.claimGrounding[${index}]`
        validateClaimRule(rule, ruleWhere, errors)
        if (!isObject(rule)) return
        validateTargetRule({ ...rule, effect: rule.requiresEffect }, ruleWhere, errors)
        if (!EFFECTS.has(rule.requiresEffect)) add(errors, `${ruleWhere}.requiresEffect`, "must be a known effect")
        if (!SOURCES.has(rule.source)) add(errors, `${ruleWhere}.source`, "must be tool, assistant or event")
        if (seen.has(rule.claim)) add(errors, ruleWhere, `duplicate grounding rule ${rule.claim}`)
        seen.add(rule.claim)
        if (forbiddenClaims.has(rule.claim)) add(errors, ruleWhere, `claim ${rule.claim} is both forbidden and grounded`)
      })
    }
  }

  if (!isObject(caseDef.grading)) add(errors, `${where}.grading`, "must be an object")
  else {
    if (caseDef.grading.mode !== "effect-and-claim") add(errors, `${where}.grading.mode`, "must be effect-and-claim")
    if (!hasText(caseDef.grading.passCriteria)) add(errors, `${where}.grading.passCriteria`, "is required")
  }

  validateReviewAndTier(caseDef, where, errors, { allowReviewed: true })

  if (!isObject(caseDef.supersession)) add(errors, `${where}.supersession`, "must be an object")
  else {
    if (!Array.isArray(caseDef.supersession.supersedes)) add(errors, `${where}.supersession.supersedes`, "must be an array")
    else {
      for (const id of caseDef.supersession.supersedes) {
        if (!CASE_ID_PATTERN.test(String(id))) add(errors, `${where}.supersession.supersedes`, `invalid case id ${id}`)
        if (id === caseDef.id) add(errors, `${where}.supersession.supersedes`, "a case cannot supersede itself")
      }
    }
    const next = caseDef.supersession.supersededBy
    if (next !== null && (!CASE_ID_PATTERN.test(String(next)) || next === caseDef.id)) {
      add(errors, `${where}.supersession.supersededBy`, "must be null or a different case id")
    }
    if (next !== null && !hasText(caseDef.supersession.reason)) {
      add(errors, `${where}.supersession.reason`, "is required when supersededBy is set")
    }
  }

  if (!hasText(caseDef.limits)) add(errors, `${where}.limits`, "must state behavioral limits")
  scanSecrets(caseDef, where, errors)
}

async function validateReferences(file, root, errors) {
  const refIds = new Set()
  if (!validateManifest(file, "references", errors, { collection: "reference-sources" })) return refIds
  if (!Array.isArray(file.sources) || file.sources.length === 0) {
    add(errors, "references.sources", "must be a non-empty array")
    return refIds
  }
  for (const [index, source] of file.sources.entries()) {
    const where = `references.sources[${index}]`
    if (!isObject(source)) {
      add(errors, where, "must be an object")
      continue
    }
    const id = String(source.id ?? "")
    if (!REFERENCE_ID_PATTERN.test(id)) add(errors, `${where}.id`, "must match REF-<NNN>")
    if (refIds.has(id)) add(errors, `${where}.id`, `duplicate reference id ${id}`)
    refIds.add(id)
    if (!hasText(source.title)) add(errors, `${where}.title`, "is required")
    if (!SOURCE_KINDS.has(source.kind)) add(errors, `${where}.kind`, "is invalid")
    if (!hasText(source.location)) add(errors, `${where}.location`, "is required")
    if (!isDate(source.retrieved)) add(errors, `${where}.retrieved`, "must be an ISO date")
    if (!hasText(source.versionScope)) add(errors, `${where}.versionScope`, "is required")
    if (!hasText(source.scope)) add(errors, `${where}.scope`, "is required")
    if (!hasText(source.limits)) add(errors, `${where}.limits`, "is required")
    if (source.statisticsCopied !== false) add(errors, `${where}.statisticsCopied`, "must be false; no statistic is restated as established truth")
    if (!Array.isArray(source.tags) || source.tags.length === 0) add(errors, `${where}.tags`, "must be a non-empty array")
    scanSecrets(source, where, errors)

    if (!isObject(source.verification)) {
      add(errors, `${where}.verification`, "must be an object")
      continue
    }
    if (source.verification.status === "local_read") {
      if (isUrl(source.location)) add(errors, `${where}.location`, "a local_read source must use a repository path")
      if (source.location.includes("..")) add(errors, `${where}.location`, "must not traverse outside the repository")
      if (!isDate(source.verification.checkedAt)) add(errors, `${where}.verification.checkedAt`, "must be an ISO date")
      if (!hasText(source.verification.notes)) add(errors, `${where}.verification.notes`, "is required")
      const resolved = path.resolve(root, source.location)
      if (!resolved.startsWith(`${root}${path.sep}`)) {
        add(errors, `${where}.location`, "must resolve inside the repository")
      } else {
        try {
          await stat(resolved)
        } catch {
          add(errors, `${where}.location`, "local source file does not exist")
        }
      }
    } else if (source.verification.status === "public_read") {
      if (!isUrl(source.location)) add(errors, `${where}.location`, "a public_read source must be an HTTP(S) URL")
      if (!isDate(source.verification.checkedAt)) add(errors, `${where}.verification.checkedAt`, "must be an ISO date")
      if (!hasText(source.verification.locator)) add(errors, `${where}.verification.locator`, "is required")
      if (!hasText(source.verification.notes)) add(errors, `${where}.verification.notes`, "is required")
    } else if (source.verification.status === "reported_unverified") {
      if (!isUrl(source.location)) add(errors, `${where}.location`, "a reported_unverified source must be an HTTP(S) URL")
      if (source.verification.checkedAt !== null) add(errors, `${where}.verification.checkedAt`, "must be null when not re-fetched")
      if (!hasText(source.verification.notes)) add(errors, `${where}.verification.notes`, "is required")
    } else {
      add(errors, `${where}.verification.status`, "must be local_read, public_read or reported_unverified")
    }
  }
  return refIds
}

function validateSupersession(cases, caseIds, errors) {
  const byId = new Map(cases.map((caseDef) => [caseDef.id, caseDef]))
  for (const caseDef of cases) {
    if (!isObject(caseDef.supersession)) continue
    const { supersedes = [], supersededBy = null } = caseDef.supersession
    if (!Array.isArray(supersedes)) continue
    for (const id of supersedes) {
      if (!caseIds.has(id)) {
        add(errors, `${caseDef.id}.supersession.supersedes`, `unknown case ${id}`)
        continue
      }
      if (byId.get(id)?.supersession?.supersededBy !== caseDef.id) {
        add(errors, `${caseDef.id}.supersession.supersedes`, `${id} must point back with supersededBy`)
      }
    }
    if (supersededBy !== null) {
      if (!caseIds.has(supersededBy)) add(errors, `${caseDef.id}.supersession.supersededBy`, `unknown case ${supersededBy}`)
      else if (!byId.get(supersededBy)?.supersession?.supersedes?.includes(caseDef.id)) {
        add(errors, `${caseDef.id}.supersession.supersededBy`, `${supersededBy} must list this case in supersedes`)
      }
    }
  }

  const reportedCycles = new Set()
  for (const id of caseIds) {
    const seen = new Set()
    let current = id
    while (current !== null) {
      if (seen.has(current)) {
        if (!reportedCycles.has(current)) {
          add(errors, `${id}.supersession`, `supersession cycle includes ${current}`)
          reportedCycles.add(current)
        }
        break
      }
      seen.add(current)
      current = byId.get(current)?.supersession?.supersededBy ?? null
    }
  }
}

function validateControls(corpus, caseIds, errors) {
  const expectedByLabel = { "known-good": "pass", "known-bad": "fail", "alternate-good": "pass" }
  const coverage = new Set()
  for (const [label, expected] of Object.entries(expectedByLabel)) {
    const file = corpus.controls[label]
    const where = `controls.${label}`
    if (!isObject(file)) {
      add(errors, where, "must be an object")
      continue
    }
    if (file.schemaVersion !== SCHEMA_VERSION) add(errors, `${where}.schemaVersion`, `must be ${SCHEMA_VERSION}`)
    if (file.label !== label) add(errors, `${where}.label`, `must be ${label}`)
    if (file.expectedOutcome !== expected) add(errors, `${where}.expectedOutcome`, `must be ${expected}`)
    if (!Array.isArray(file.traces)) {
      add(errors, `${where}.traces`, "must be an array")
      continue
    }
    const seen = new Set()
    for (const [index, entry] of file.traces.entries()) {
      const traceWhere = `${where}.traces[${index}]`
      if (!isObject(entry)) {
        add(errors, traceWhere, "must be an object")
        continue
      }
      const caseId = String(entry.caseId ?? "")
      if (!caseIds.has(caseId)) add(errors, `${traceWhere}.caseId`, `unknown case ${caseId}`)
      if (seen.has(caseId)) add(errors, `${traceWhere}.caseId`, `duplicate control for ${caseId}`)
      seen.add(caseId)
      coverage.add(`${label}:${caseId}`)
      if (entry.expectedOutcome !== undefined && entry.expectedOutcome !== expected) {
        add(errors, `${traceWhere}.expectedOutcome`, `must match collection ${expected}`)
      }
      if (!isObject(entry.trace)) {
        add(errors, `${traceWhere}.trace`, "must be an object")
        continue
      }
      if (entry.trace.caseId !== caseId) add(errors, `${traceWhere}.trace.caseId`, "must match the control caseId")
      if (!Array.isArray(entry.trace.actions)) add(errors, `${traceWhere}.trace.actions`, "must be an array")
      else {
        entry.trace.actions.forEach((action, actionIndex) => {
          const actionWhere = `${traceWhere}.trace.actions[${actionIndex}]`
          if (!isObject(action)) {
            add(errors, actionWhere, "must be an object")
            return
          }
          if (!EFFECTS.has(action.effect)) add(errors, `${actionWhere}.effect`, `unknown effect: ${String(action.effect)}`)
          if (!hasText(action.target)) add(errors, `${actionWhere}.target`, "must be a non-empty string")
          if (!SOURCES.has(action.source)) add(errors, `${actionWhere}.source`, "must be tool, assistant or event")
          if (typeof action.recorded !== "boolean") add(errors, `${actionWhere}.recorded`, "must be a boolean")
          if (!hasText(action.tool)) add(errors, `${actionWhere}.tool`, "must name the recording surface")
        })
      }
      if (!Array.isArray(entry.trace.claims)) add(errors, `${traceWhere}.trace.claims`, "must be an array")
      else {
        entry.trace.claims.forEach((claim, claimIndex) => {
          const claimWhere = `${traceWhere}.trace.claims[${claimIndex}]`
          validateClaimRule(claim, claimWhere, errors)
        })
      }
      if (entry.expectedFailedCheck !== undefined && !hasText(entry.expectedFailedCheck)) {
        add(errors, `${traceWhere}.expectedFailedCheck`, "must be a non-empty check id")
      }
      if (label === "known-bad" && !hasText(entry.expectedFailedCheck)) {
        add(errors, `${traceWhere}.expectedFailedCheck`, "known-bad controls must name the intended failing check")
      }
    }
  }

  for (const caseId of caseIds) {
    for (const label of ["known-good", "known-bad"]) {
      if (!coverage.has(`${label}:${caseId}`)) {
        add(errors, `controls.${label}`, `missing control for ${caseId}`)
      }
    }
  }
}

function validateExemplars(file, refIds, caseIds, errors) {
  if (!validateManifest(file, "exemplars", errors, { collection: "reviewed-exemplars" })) return
  if (!Array.isArray(file.exemplars) || file.exemplars.length === 0) {
    add(errors, "exemplars.exemplars", "must be a non-empty array")
    return
  }
  const seen = new Set()
  const categories = new Set()
  for (const [index, exemplar] of file.exemplars.entries()) {
    const where = `exemplars.exemplars[${index}]`
    if (!isObject(exemplar)) {
      add(errors, where, "must be an object")
      continue
    }
    if (!EXEMPLAR_ID_PATTERN.test(String(exemplar.id ?? ""))) add(errors, `${where}.id`, "must match EX-<CATEGORY>-<NNN>")
    if (seen.has(exemplar.id)) add(errors, `${where}.id`, `duplicate exemplar id ${exemplar.id}`)
    seen.add(exemplar.id)
    if (!Number.isInteger(exemplar.version) || exemplar.version < 1) add(errors, `${where}.version`, "must be a positive integer")
    if (!CATEGORIES.includes(exemplar.category)) add(errors, `${where}.category`, "must be a known category")
    else categories.add(exemplar.category)
    if (!hasText(exemplar.title)) add(errors, `${where}.title`, "is required")
    if (!hasText(exemplar.scope)) add(errors, `${where}.scope`, "is required")
    if (!hasText(exemplar.whyItMatters)) add(errors, `${where}.whyItMatters`, "is required")
    if (!Array.isArray(exemplar.caseIds) || exemplar.caseIds.length === 0) {
      add(errors, `${where}.caseIds`, "must link at least one behavioral case")
    } else {
      for (const id of exemplar.caseIds) if (!caseIds.has(id)) add(errors, `${where}.caseIds`, `unknown case ${id}`)
    }
    if (!Array.isArray(exemplar.observableSequence) || exemplar.observableSequence.length < 2 || exemplar.observableSequence.some((item) => !hasText(item))) {
      add(errors, `${where}.observableSequence`, "must list at least two observable actions")
    }
    if (!Array.isArray(exemplar.notEvidenceFor) || exemplar.notEvidenceFor.length === 0 || exemplar.notEvidenceFor.some((item) => !hasText(item))) {
      add(errors, `${where}.notEvidenceFor`, "must list what the exemplar does not establish")
    }
    if (!isObject(exemplar.provenance)) add(errors, `${where}.provenance`, "must be an object")
    else {
      if (exemplar.provenance.synthetic !== true) add(errors, `${where}.provenance.synthetic`, "must be true")
      if (exemplar.provenance.containsPrivateData !== false) add(errors, `${where}.provenance.containsPrivateData`, "must be false")
      if (!Array.isArray(exemplar.provenance.referenceIds) || exemplar.provenance.referenceIds.length === 0) {
        add(errors, `${where}.provenance.referenceIds`, "must reference catalogued sources")
      } else {
        for (const id of exemplar.provenance.referenceIds) {
          if (!refIds.has(id)) add(errors, `${where}.provenance.referenceIds`, `unknown reference ${id}`)
        }
      }
    }
    validateReviewAndTier(exemplar, where, errors, { allowReviewed: true })
    scanSecrets(exemplar, where, errors)
  }
  for (const category of CATEGORIES) {
    if (!categories.has(category)) add(errors, "exemplars.exemplars", `missing candidate exemplar for ${category}`)
  }
}

export async function validateCorpus(corpus) {
  const errors = []
  const casesFile = corpus.cases
  if (!validateManifest(casesFile, "cases", errors, { corpus: "behavioral-regression-evaluations" })) {
    return errors
  }

  const refIds = await validateReferences(corpus.references, corpus.root, errors)

  if (!Array.isArray(casesFile.cases) || casesFile.cases.length < MIN_CASES) {
    add(errors, "cases.cases", `must contain at least ${MIN_CASES} representative cases`)
    return errors
  }

  const caseIds = new Set()
  const categoryCounts = new Map()
  for (const [index, caseDef] of casesFile.cases.entries()) {
    const where = `cases[${index}]`
    validateCase(caseDef, where, errors, refIds)
    if (isObject(caseDef)) {
      if (caseIds.has(caseDef.id)) add(errors, `${where}.id`, `duplicate case id ${caseDef.id}`)
      caseIds.add(caseDef.id)
      if (CATEGORIES.includes(caseDef.category)) {
        categoryCounts.set(caseDef.category, (categoryCounts.get(caseDef.category) ?? 0) + 1)
      }
    }
  }
  for (const category of CATEGORIES) {
    const count = categoryCounts.get(category) ?? 0
    if (count < MIN_CASES_PER_CATEGORY) add(errors, "cases.cases", `category ${category} has ${count}; at least ${MIN_CASES_PER_CATEGORY} required`)
  }

  validateSupersession(
    casesFile.cases.filter((caseDef) => isObject(caseDef) && typeof caseDef.id === "string"),
    caseIds,
    errors,
  )
  validateControls(corpus, caseIds, errors)
  validateExemplars(corpus.exemplars, refIds, caseIds, errors)
  return errors
}
