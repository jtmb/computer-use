import assert from "node:assert/strict"
import test from "node:test"
import { summarizeAssistantAudit } from "../src/assistant-audit-summary.mjs"

const message = (id, content = []) => ({ type: "assistant", id, content,
  model: { providerID: "deepseek", id: "deepseek-flash", variant: "high" } })
const tool = (id, status = "completed") => ({ type: "tool", id, name: "read", executed: false, state: { status } })
const audit = messages => ({ pages: 1, messages, completeAssistantPagination: true, completeLiveTrace: false })

test("summary retains reported model, unique IDs and actual tool states, not executed-flag inference", () => {
  const result = summarizeAssistantAudit(audit([
    message("msg_one", [tool("call_1"), { ...tool("call_2", "error"), executed: true }]),
    message("msg_two", [tool("call_3", "unrecognized")]),
  ]))
  assert.equal(result.uniqueAssistantMessages, 2)
  assert.deepEqual(result.reportedModels, [{ providerID: "deepseek", id: "deepseek-flash", variant: "high" }])
  assert.deepEqual(result.toolStates, { completed: 1, error: 1, running: 0, streaming: 0, unknown: 1 })
  assert.equal(result.completedTools, 1)
  assert.deepEqual(result.tools.map(item => item.callID), ["call_1", "call_2", "call_3"])
})

test("summary never exports assistant text, reasoning, tool input/output or arbitrary metadata", () => {
  const marker = "SYNTHETIC_BODY_NOT_FOR_EXPORT"
  const part = { ...tool("call_1"), metadata: { value: marker } }
  Object.defineProperties(part.state, {
    input: { get() { throw new Error(marker) } },
    content: { get() { throw new Error(marker) } },
  })
  const input = audit([message("msg_one", [
    { type: "text", text: marker }, { type: "reasoning", text: marker }, part,
  ])])
  input.metadata = { body: marker }
  const result = summarizeAssistantAudit(input)
  assert.equal(JSON.stringify(result).includes(marker), false)
  assert.deepEqual(Object.keys(result.tools[0]).sort(), ["callID", "messageID", "name", "status"])
  assert.equal("messages" in result, false)
})

test("missing or malformed model refs remain unknown and live trace status cannot be promoted", () => {
  const missing = message("msg_one")
  delete missing.model
  const malformed = { ...message("msg_two"), model: { providerID: "bad provider", id: "not a valid id" } }
  const input = { ...audit([missing, malformed]), completeAssistantPagination: false, completeLiveTrace: true }
  const result = summarizeAssistantAudit(input)
  assert.deepEqual(result.reportedModels, [])
  assert.equal(result.messagesWithoutValidModel, 2)
  assert.equal(result.completeAssistantPagination, false)
  assert.equal(result.completeLiveTrace, false)
  assert.equal(result.providerEffectiveModel, null)
  assert.equal(result.semanticGrade, null)
})

test("duplicate message or call IDs refuse rather than silently inflate evidence", () => {
  for (const input of [
    audit([message("msg_one"), message("msg_one")]),
    audit([message("msg_one", [tool("call_1"), tool("call_1")])]),
    audit([message("msg_one", [tool("call_1")]), message("msg_two", [tool("call_1")])]),
  ]) assert.throws(() => summarizeAssistantAudit(input), /^Error: Assistant audit summary refused$/)
})

test("fixed metadata limits refuse extra pages/messages/parts/tools without exporting rejected data", () => {
  const inputs = [
    { ...audit([]), pages: 5 },
    audit(Array.from({ length: 21 }, (_, index) => message(`msg_${index}`))),
    audit([message("msg_one", Array.from({ length: 129 }, () => ({ type: "text" })))]),
    audit([message("msg_one", Array.from({ length: 128 }, (_, index) => tool(`call_${index}`))), message("msg_two", [tool("call_extra")])]),
    audit([{ ...message("msg_one"), id: "SYNTHETIC PRIVATE ID" }]),
    audit([message("msg_one", [{ ...tool("call_1"), name: "SYNTHETIC PRIVATE NAME" }])]),
  ]
  for (const input of inputs) assert.throws(() => summarizeAssistantAudit(input), /^Error: Assistant audit summary refused$/)
})

test("empty terminal pagination remains concrete without invented model or completed actions", () => {
  const result = summarizeAssistantAudit(audit([]))
  assert.equal(result.uniqueAssistantMessages, 0)
  assert.equal(result.completedTools, 0)
  assert.equal(result.completeAssistantPagination, true)
  assert.deepEqual(result.tools, [])
  assert.deepEqual(result.reportedModels, [])
})
