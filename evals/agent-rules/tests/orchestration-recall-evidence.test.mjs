import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const run = JSON.parse(await readFile(new URL("../runs/2026-10-31-orchestration-recall-native.json", import.meta.url)))

// These checks retain a reviewed observation's bindings and limits, not model compliance.
function verify(value) {
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.identity.sessionID, "ses_e6e830e81ffeVIZlW5fa5KBbGX")
  assert.equal(value.identity.parentID, "ses_e78fdcc9affeNOlKMRek7Yobo3")
  assert.equal(value.identity.allObservedAssistantModelsMatch, true)
  assert.equal(value.identity.providerEffectiveModel, null)
  assert.equal(value.identity.providerEffectiveEffort, null)
  assert.deepEqual(value.prompt, { suppliedAnswer: false, suppliedTargetNoteIdOrPath: false, readOnly: true, inboxRetrial: false, fixtureCreated: false, goalPlanningAssigned: false })
  assert.equal(value.audit.messages, value.audit.uniqueMessages)
  assert.equal(value.audit.messages, value.audit.pages.reduce((sum, page) => sum + page.messages, 0))
  assert.equal(value.audit.completedTools, Object.values(value.audit.toolCounts).reduce((sum, count) => sum + count, 0))
  assert.deepEqual(value.audit.toolCounts, { skill: 3, read: 7, shell: 4, execute: 1 }, "retain observed categories, not only their sum")
  assert.equal(value.audit.bytesAcquired, value.audit.metadataBytes + value.audit.pages.reduce((sum, page) => sum + page.bytes, 0))
  assert.ok(value.audit.bytesAcquired < value.audit.byteLimit)
  assert.ok(value.audit.elapsedMs < value.audit.durationLimitMs)
  assert.equal(value.audit.completeAssistantPagination, true)
  assert.equal(value.audit.pages.at(-1).messages, 0, "retain the actual terminal empty page, not a short-page assumption")
  for (const flag of ["completeLiveTrace", "rawMessagesPersisted", "reasoningExportedOrPersisted"]) assert.equal(value.audit[flag], false)
  const search = value.bindings.memorySearch
  assert.equal(search.scope, "repo")
  assert.equal(search.kind, "decision")
  assert.equal(search.limit, 3)
  assert.equal(search.truncated, false)
  assert.equal(search.notesAreUntrustedData, true)
  assert.deepEqual(search.targetCitation, { file: "docs/memory/orchestration-method.md", line: 25 })
  assert.equal(value.bindings.finalAnswer.messageID, "msg_1917e006f001z0CW3fomb5o40q")
  assert.equal(value.bindings.finalAnswer.textSha256, "86499fe2c9c48f80179689d7702c50f35aad30c8ff998912216c1bcf635b28ee")
  const review = value.parentSemanticReview
  assert.equal(review.narrowDecisionRecallSupported, true)
  assert.deepEqual(review.methods, ["Solo", "Background subagents", "Foreground subagent"])
  assert.equal(review.currentChatSelectionInferred, false)
  for (const flag of ["taskScopedDeepseekOverrideNotGlobalDefault", "selectionIsNotAuthorization", "nativeChildCompletionNotMandatoryInboxReads", "parentOnlyGoalPlanningRetained", "sourceOnlySelectorNotLoadedAcceptance"]) assert.equal(review[flag], true)
  assert.equal(value.procedureAssessment.status, "failed", "retain procedure failure separately from correct recall")
  assert.equal(value.procedureAssessment.broadScopeScans.length, 2)
  assert.deepEqual(value.procedureAssessment.broadScopeScans.map(({ messageID, callID }) => ({ messageID, callID })), [
    { messageID: "msg_1917d9be4001i4gSup1PFQ0jlE", callID: "call_01_q09rwmIYbD6cImmo7wMm3875" },
    { messageID: "msg_1917dd264001oD6Ww0rZmfic0H", callID: "call_00_hqQg2prabql7HIU7bfBC4316" },
  ], "retain actual failed-scan message/call bindings")
  assert.equal(value.procedureAssessment.chainedShellInputsObserved, true)
  assert.equal(value.procedureAssessment.actualSourceScanBytesAndFileCoverageVerified, false)
  for (const flag of ["outputHeadDoesNotBoundScanAcquisition", "reportedTwoScansVersusFourShellCalls", "reportedEightExplicitReadsVersusSevenReadCalls", "commentsReferenceReadAfterOrchestrationSourceRead"]) {
    assert.equal(value.procedureAssessment[flag], true, `retain observed failure qualification: ${flag}`)
  }
  assert.equal(value.procedureAssessment.autoModeIndependentlyEstablished, false, "unknown mode cannot become an observed authority claim")
  assert.deepEqual(Object.keys(value.limits).sort(), ["fullInstructionCompliance", "generalUnpromptedRecall", "loadedSelectorAcceptance", "completeLiveTrace", "matchedBenchmark", "humanAcceptance"].sort())
  for (const flag of Object.values(value.limits)) assert.equal(flag, false, "narrow recall cannot promote acceptance")
}

test("actual orchestration recall preserves bounded native bindings and source-only semantics", () => verify(run))

test("altered pagination, lost citation and inferred selection fail independently", () => {
  for (const mutate of [
    value => { value.audit.pages.pop() },
    value => { value.bindings.memorySearch.targetCitation.file = "another-note.md" },
    value => { value.parentSemanticReview.currentChatSelectionInferred = true },
    value => { value.parentSemanticReview.taskScopedDeepseekOverrideNotGlobalDefault = false },
  ]) {
    const changed = structuredClone(run)
    mutate(changed)
    assert.throws(() => verify(changed), { code: "ERR_ASSERTION" })
  }
})

test("correct recall cannot erase observed scans or become general compliance/runtime acceptance", () => {
  const erased = structuredClone(run)
  erased.procedureAssessment.status = "passed"
  assert.throws(() => verify(erased), error => error.code === "ERR_ASSERTION" && error.message.includes("procedure failure"))
  for (const flag of Object.keys(run.limits)) {
    const changed = structuredClone(run)
    changed.limits[flag] = true
    assert.throws(() => verify(changed), error => error.code === "ERR_ASSERTION" && error.message.includes("cannot promote acceptance"))
  }
})

test("retained failure observations cannot lose their call identities", () => {
  for (const field of ["callID", "messageID"]) {
    for (const index of [0, 1]) {
      const changed = structuredClone(run)
      delete changed.procedureAssessment.broadScopeScans[index][field]
      assert.throws(() => verify(changed), { code: "ERR_ASSERTION" }, `scan ${index} must retain ${field}`)
    }
  }
})

test("late-reference and reporting failures cannot disappear behind the failed status", () => {
  for (const field of ["outputHeadDoesNotBoundScanAcquisition", "reportedTwoScansVersusFourShellCalls", "reportedEightExplicitReadsVersusSevenReadCalls", "commentsReferenceReadAfterOrchestrationSourceRead"]) {
    const changed = structuredClone(run)
    delete changed.procedureAssessment[field]
    assert.throws(() => verify(changed), { code: "ERR_ASSERTION" }, `${field} must remain explicit`)
  }
})

test("unknown mode and unseeded recall remain distinct from authority or a supplied answer", () => {
  for (const change of [
    value => { value.procedureAssessment.autoModeIndependentlyEstablished = true },
    value => { value.prompt.suppliedAnswer = true },
    value => { value.prompt.suppliedTargetNoteIdOrPath = true },
    value => { value.prompt.goalPlanningAssigned = true },
  ]) {
    const changed = structuredClone(run)
    change(changed)
    assert.throws(() => verify(changed), { code: "ERR_ASSERTION" })
  }
})

test("fixed tool totals cannot hide changed observed tool categories", () => {
  const changed = structuredClone(run)
  changed.audit.toolCounts.shell -= 1
  changed.audit.toolCounts.read += 1
  assert.throws(() => verify(changed), { code: "ERR_ASSERTION" })
})
