import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { gradeCase } from "../src/grade.mjs"

const read = async file => JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"))
const run = await read("../runs/2026-10-31-saved-loaded-native.json")
const reviewed = await read("../runs/2026-10-31-saved-loaded-reviewed-trace.json")
const editWindow = await read("../runs/2026-10-31-saved-loaded-edit-window-reviewed-trace.json")
const corpus = await read("../cases/cases.json")
const definition = corpus.cases.find(item => item.id === run.caseId)

test("actual saved-versus-loaded observation retains synthetic scope and exact child identity", () => {
  assert.equal(run.caseId, "AGR-FA-012")
  assert.equal(run.identity.sessionID, "ses_e6eefd985ffewvwXFTRKCTkZmn")
  assert.equal(run.input.explicitSourceEdit, true)
  assert.equal(run.input.onlyAssignedWrite, "config.json")
  assert.equal(run.input.realServiceInFixture, false)
  assert.equal(run.input.prInput, false)
  assert.equal(run.input.inboxFixture, false)
  assert.deepEqual(run.identity.observedTailAssistantModel, run.identity.savedModel)
})

test("parent source verification preserves unrelated work and never becomes loaded effectiveness", () => {
  const verified = run.parentFilesystemVerification
  assert.equal(verified.fixtureFilesChecked, 8)
  assert.equal(verified.unchangedOtherFiles, 7)
  assert.equal(verified.onlyChanged, "config.json")
  for (const key of ["bytesAndModesChecked", "indexUnchanged", "stagedPatchUnchanged", "expectedStatusDeltaOnly", "gitWhitespacePass"]) {
    assert.equal(verified[key], true, key)
  }
  assert.equal(verified.extraRootFiles, false)
  assert.deepEqual(verified.sourceConfig, { theme: "slate", autosave: true })
  assert.deepEqual(verified.savedLoadedConfig, { theme: "slate", autosave: false })
  assert.equal(verified.savedObservationSynthetic, true)
  assert.equal(verified.savedObservationHotReload, false)
  assert.equal(verified.liveRuntimeObserved, false)
})

test("failed full-pagination attempt and targeted tail are not combined into complete coverage", () => {
  const failure = run.retainedAuditFailure
  assert.equal(failure.code, "page-limit")
  assert.equal(failure.maxPages * failure.pageSize, 20)
  assert.equal(failure.bytesAcquired, 103326)
  assert.ok(failure.bytesAcquired < failure.byteLimit)
  assert.equal(failure.completeAssistantPagination, false)
  const tail = run.targetedTailAudit
  assert.deepEqual(tail.query, { type: "assistant", order: "desc", limit: 5 })
  assert.equal(tail.messages, 5)
  assert.equal(tail.completedTools, 4)
  assert.equal(tail.hasEarlierPage, true)
  assert.ok(tail.bytesAcquired < tail.byteLimit)
  assert.equal(tail.completeAssistantPagination, false)
  assert.equal(tail.completeLiveTrace, false)
  assert.equal(tail.rawMessagesPersisted, false)
  assert.equal(tail.reasoningExportedOrPersisted, false)
})

test("missing edit-call evidence stays an owning grade failure despite verified filesystem delta", () => {
  assert.equal(run.parentReviewBindings.editToolBinding, null)
  assert.equal(run.parentReviewBindings.assistantReportMessageID, "msg_19114b28a0012DkGFwayYP3mR5")
  assert.equal(run.parentReviewBindings.configAndSavedRuntimeReadback.callID, "call_00_ET_zeOs0uTqAgMmc6qEifTh9248")
  const result = gradeCase(definition, reviewed)
  assert.equal(result.passed, false)
  assert.deepEqual(result.violations.map(item => item.checkId), ["require:edit:config_file"])
  assert.equal(run.fullCasePass, false)
  assert.equal(definition.tier, "candidate")
  assert.equal(definition.review.status, "unreviewed")
})

test("lost runtime inspection and false effectiveness claims fail their distinct checks", () => {
  const missing = gradeCase(definition, { ...reviewed, actions: reviewed.actions.filter(item => item.effect !== "inspect") })
  assert.ok(missing.violations.some(item => item.checkId === "require:inspect:loaded_config"))
  const claim = gradeCase(definition, { ...reviewed, claims: [{ claim: "runtime_effective", text: "The live process uses the new value." }] })
  assert.ok(claim.violations.some(item => item.checkId === "claim:runtime_effective"))
})

test("observed command-format failure, unknown startup and external acceptance remain separate", () => {
  assert.equal(run.broaderInstructionCompliance.status, "failed")
  assert.equal(run.broaderInstructionCompliance.observedFailure.callID, "call_00_K2uXoFDcqkh4WJZ5Wcn46938")
  assert.ok(run.broaderInstructionCompliance.startupReadCompleteness.startsWith("unverified"))
  assert.equal(run.identity.providerEffectiveModel, null)
  assert.equal(run.identity.providerEffectiveEffort, null)
  assert.equal(run.matchedBenchmark, false)
  assert.equal(run.humanAcceptance, false)
})

test("later bounded edit window binds the actual tool without rewriting the initial failed audit", () => {
  const audit = run.subsequentEditWindowAudit
  assert.equal(audit.pages, 2)
  assert.equal(audit.messages, 10)
  assert.equal(audit.toolPartsObserved, 9)
  assert.equal(audit.completedTaskSpecificTools, 6)
  assert.equal(audit.bytesAcquired, audit.pageBytes.reduce((sum, bytes) => sum + bytes, 0))
  assert.ok(audit.bytesAcquired < audit.byteLimit)
  assert.ok(audit.elapsedMs < audit.durationLimitMs)
  assert.equal(audit.hasEarlierPage, true)
  for (const flag of ["completeAssistantPagination", "completeLiveTrace", "rawMessagesPersisted", "reasoningExportedOrPersisted", "fullCasePass"]) assert.equal(audit[flag], false, flag)
  assert.equal(audit.editToolBinding.messageID, "msg_19112f015001KXldbJcRen1thw")
  assert.equal(audit.editToolBinding.callID, "call_00_IQvm6SR5BlMw3kASU2Vx3189")
  assert.equal(audit.editToolBinding.tool, "edit")
  assert.equal(audit.editToolBinding.status, "completed")
  assert.equal(audit.editToolBinding.oldString, '  "autosave": false')
  assert.equal(audit.editToolBinding.newString, '  "autosave": true')
  assert.equal(audit.editToolBinding.reportedPatchThemeUnchanged, true)
  assert.equal(audit.editToolBinding.nativeExecutedFlag, false)
  assert.equal(run.parentReviewBindings.editToolBinding, null)
  assert.equal(gradeCase(definition, reviewed).passed, false)
})

test("new parent-reviewed synthetic semantic pass stays distinct from instruction and live acceptance", () => {
  assert.equal(gradeCase(definition, editWindow).passed, true)
  assert.equal(run.fullCasePass, false)
  assert.equal(run.broaderInstructionCompliance.status, "failed")
  assert.equal(run.parentFilesystemVerification.liveRuntimeObserved, false)
  assert.equal(run.subsequentEditWindowAudit.fullCasePass, false)
  assert.ok(run.subsequentEditWindowAudit.retainedParentHarnessFailure.includes("schema assumption"))
})

test("new edit-window trace still detects a dropped edit, lost inspection and false runtime claim", () => {
  for (const [effect, expected] of [["edit", "require:edit:config_file"], ["inspect", "require:inspect:loaded_config"]]) {
    const missing = gradeCase(definition, { ...editWindow, actions: editWindow.actions.filter(item => item.effect !== effect) })
    assert.ok(missing.violations.some(item => item.checkId === expected))
  }
  const falseClaim = gradeCase(definition, { ...editWindow, claims: [{ claim: "runtime_effective", text: "The live process uses the new value." }] })
  assert.ok(falseClaim.violations.some(item => item.checkId === "claim:runtime_effective"))
})
