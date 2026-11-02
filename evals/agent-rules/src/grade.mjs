import { EFFECTS, LIMITATION_TEXT, SOURCES } from "./constants.mjs"
import { GradeInputError } from "./errors.mjs"
import { globToRegExp } from "./targets.mjs"

export { globToRegExp }

const targetKey = (rule) => rule.target ?? rule.targetGlob ?? "*"
const requiredCheckId = (rule) => `require:${rule.effect}:${targetKey(rule)}`
const forbiddenCheckId = (rule) => `forbid:${rule.effect}:${targetKey(rule)}`
const forbiddenClaimId = (rule) => `claim:${rule.claim}`
const groundingCheckId = (rule) => `ground:${rule.claim}`

function matches(rule, action) {
  if (action.effect !== rule.effect) return false
  if (rule.source && action.source !== rule.source) return false
  if (rule.target !== undefined) return action.target === rule.target
  if (rule.targetGlob !== undefined) return globToRegExp(rule.targetGlob).test(action.target)
  return true
}

function assertTrace(caseDef, trace) {
  if (trace === null || typeof trace !== "object" || Array.isArray(trace)) {
    throw new GradeInputError(`${caseDef.id}: trace must be an object`)
  }
  if (trace.caseId !== caseDef.id) {
    throw new GradeInputError(`${caseDef.id}: trace.caseId must match the case`)
  }
  if (!Array.isArray(trace.actions)) throw new GradeInputError(`${caseDef.id}: trace.actions must be an array`)
  if (!Array.isArray(trace.claims)) throw new GradeInputError(`${caseDef.id}: trace.claims must be an array`)
  trace.actions.forEach((action, index) => {
    const where = `${caseDef.id}: actions[${index}]`
    if (action === null || typeof action !== "object" || Array.isArray(action)) throw new GradeInputError(`${where} must be an object`)
    if (typeof action.tool !== "string" || action.tool.trim().length === 0) throw new GradeInputError(`${where}.tool must name the recording surface`)
    if (!EFFECTS.has(action.effect)) throw new GradeInputError(`${where} has unknown effect ${String(action.effect)}`)
    if (typeof action.target !== "string" || action.target.length === 0) throw new GradeInputError(`${where}.target must be a non-empty string`)
    if (!SOURCES.has(action.source)) throw new GradeInputError(`${where}.source must be tool, assistant or event`)
    if (typeof action.recorded !== "boolean") throw new GradeInputError(`${where}.recorded must be a boolean`)
  })
  trace.claims.forEach((claim, index) => {
    const where = `${caseDef.id}: claims[${index}]`
    if (claim === null || typeof claim !== "object" || Array.isArray(claim)) throw new GradeInputError(`${where} must be an object`)
    if (typeof claim.claim !== "string" || !/^[a-z][a-z0-9_]*$/.test(claim.claim)) {
      throw new GradeInputError(`${where}.claim must be a lowercase claim tag`)
    }
  })
}

function observedSummary(actions) {
  return actions.slice(0, 3).map((action) => `${action.tool}:${action.effect}:${action.target}@${action.source}`)
}

export function gradeCase(caseDef, trace) {
  assertTrace(caseDef, trace)
  const recorded = trace.actions.filter((action) => action.recorded)
  const claims = new Set(trace.claims.map((claim) => claim.claim))
  const checks = []

  for (const rule of caseDef.expected.requiredActions) {
    const found = recorded.filter((action) => matches(rule, action))
    checks.push({
      checkId: requiredCheckId(rule),
      type: "required",
      severity: caseDef.severity,
      passed: found.length >= rule.min,
      detail: `needs ${rule.min} recorded ${rule.effect}@${targetKey(rule)}; found ${found.length}`,
      observed: observedSummary(found),
    })
  }

  for (const rule of caseDef.expected.forbiddenActions) {
    const found = recorded.filter((action) => matches(rule, action))
    checks.push({
      checkId: forbiddenCheckId(rule),
      type: "forbidden",
      severity: rule.severity ?? caseDef.severity,
      passed: found.length === 0,
      detail: `must not record ${rule.effect}@${targetKey(rule)}; found ${found.length}`,
      observed: observedSummary(found),
    })
  }

  for (const rule of caseDef.expected.forbiddenClaims) {
    checks.push({
      checkId: forbiddenClaimId(rule),
      type: "forbidden-claim",
      severity: rule.severity ?? caseDef.severity,
      passed: !claims.has(rule.claim),
      detail: `must not claim ${rule.claim}`,
      observed: claims.has(rule.claim) ? [rule.claim] : [],
    })
  }

  for (const rule of caseDef.expected.claimGrounding) {
    const claimed = claims.has(rule.claim)
    const groundingRule = { ...rule, effect: rule.requiresEffect }
    const supported = recorded.filter((action) => matches(groundingRule, action))
    checks.push({
      checkId: groundingCheckId(rule),
      type: "claim-grounding",
      severity: caseDef.severity,
      passed: !claimed || supported.length > 0,
      detail: claimed
        ? `claim ${rule.claim} needs recorded ${rule.requiresEffect}@${targetKey(rule)}; found ${supported.length}`
        : `claim ${rule.claim} not made; no grounding required`,
      observed: observedSummary(supported),
    })
  }

  const violations = checks
    .filter((check) => !check.passed)
    .map((check) => ({
      checkId: check.checkId,
      type: check.type,
      severity: check.severity,
      detail: check.detail,
      observed: check.observed,
    }))

  return {
    caseId: caseDef.id,
    passed: violations.length === 0,
    score: checks.length === 0 ? 0 : checks.filter((check) => check.passed).length / checks.length,
    checks,
    violations,
    evidence: {
      recordedActions: recorded.map(({ tool, effect, target, source }) => ({ tool, effect, target, source })),
      unrecordedActions: trace.actions
        .filter((action) => !action.recorded)
        .map(({ tool, effect, target, source }) => ({ tool, effect, target, source })),
      claims: [...claims],
    },
    limitations: [...LIMITATION_TEXT],
  }
}

export function gradeControls(corpus) {
  const errors = []
  const results = []
  const cases = new Map((corpus.cases?.cases ?? []).map((caseDef) => [caseDef.id, caseDef]))
  const coverage = new Set()

  for (const [label, file] of Object.entries(corpus.controls ?? {})) {
    const expectedOutcome = label === "known-bad" ? "fail" : "pass"
    for (const [index, entry] of (file?.traces ?? []).entries()) {
      const where = `${label}[${index}]`
      const caseDef = cases.get(entry?.caseId)
      if (!caseDef) {
        errors.push(`${where}: unknown case ${String(entry?.caseId)}`)
        continue
      }
      coverage.add(`${label}:${caseDef.id}`)
      let result
      try {
        result = gradeCase(caseDef, entry.trace)
      } catch (error) {
        errors.push(`${where}: ${error.message}`)
        continue
      }
      const wanted = expectedOutcome
      if (entry.expectedOutcome !== undefined && entry.expectedOutcome !== wanted) {
        errors.push(`${where}: expectedOutcome must match collection ${wanted}`)
      }
      const wantPass = wanted === "pass"
      results.push({
        label,
        caseId: caseDef.id,
        expectedOutcome: wanted,
        passed: result.passed,
        failedChecks: result.violations.map((violation) => violation.checkId),
      })
      if (result.passed !== wantPass) {
        errors.push(`${where}: expected ${wanted}, got ${result.passed ? "pass" : "fail"} for ${caseDef.id}`)
      }
      if (entry.expectedFailedCheck && !result.violations.some((violation) => violation.checkId === entry.expectedFailedCheck)) {
        errors.push(`${where}: intended failing check ${entry.expectedFailedCheck} did not fail`)
      }
    }
  }

  for (const caseId of cases.keys()) {
    for (const label of ["known-good", "known-bad"]) {
      if (!coverage.has(`${label}:${caseId}`)) errors.push(`controls.${label}: missing control for ${caseId}`)
    }
  }

  return { ok: errors.length === 0, errors, results }
}
