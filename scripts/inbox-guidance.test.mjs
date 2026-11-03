import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

// Static instruction-text contracts: they prove shipped guidance contains or
// omits required wording. They do not prove runtime behavior, native enforcement,
// model compliance or that a coordination transport is installed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = name => readFile(path.join(root, name), "utf8")
const compact = text => text.replace(/\s+/g, " ").trim()

const coordinationSkill = ".opencode/skills/cross-session-coordination/SKILL.md"
const coordinationGuide = ".opencode/skills/cross-session-coordination/README.md"
const protocol = ".opencode/skills/cross-session-coordination/references/protocol.md"
const modelResume = ".opencode/skills/cross-session-coordination/references/model-and-resume.md"
const orchestrationSkill = ".opencode/skills/agent-orchestration/SKILL.md"
const orchestrationGuide = ".opencode/skills/agent-orchestration/README.md"

const coordinationDocs = [coordinationSkill, coordinationGuide, protocol, modelResume]
const resultDocs = [coordinationSkill, coordinationGuide, protocol, orchestrationSkill, orchestrationGuide]
const sendDocs = [coordinationSkill, coordinationGuide, protocol]

async function compactDoc(file) {
  return compact(await read(file))
}

test("retired custom inbox and mailbox guidance is absent", async () => {
  const obsolete = [
    "agent mailbox",
    "mailbox-only",
    "Agent inbox",
    "unread inbox",
    "Mark seen",
    "Inbox-only means",
    "Read effective recipient policy",
    "The default agent inbox is a dedicated mailbox",
    "Keep routine reports in the dedicated mailbox",
    "Preserve native mailbox policy",
    "read the current recipient's bounded derived unread inbox once",
    "At relevant task/reconnect or expected-result boundaries, read",
  ]
  for (const file of [...coordinationDocs, orchestrationSkill, orchestrationGuide]) {
    const text = await compactDoc(file)
    for (const phrase of obsolete) {
      assert.equal(text.includes(phrase), false, `${file} must not retain obsolete mailbox guidance: ${phrase}`)
    }
  }
  for (const file of coordinationDocs) {
    const text = await compactDoc(file)
    for (const phrase of ["Ctrl+P", "recipient settings", "custom receive-settings UI recommendation"]) {
      assert.equal(text.includes(phrase), false, `${file} must not recommend an inbox UI/settings surface: ${phrase}`)
    }
  }
})

test("delegated results return through native child completion without send or ACK", async () => {
  for (const file of resultDocs) {
    const text = (await compactDoc(file)).toLowerCase()
    assert.ok(text.includes("native child completion notifications"), `${file} names the native result return path`)
    assert.ok(text.includes("no separate send, mailbox read or acknowledgement"), `${file} states normal delegation needs no send or ACK`)
  }
  const skill = (await compactDoc(coordinationSkill)).toLowerCase()
  assert.ok(skill.includes("no mandatory unread read, acknowledgement, polling loop or startup mailbox check"))
  assert.ok(skill.includes("historical stored messages are inert"))
})

test("cross-session sends require direct specific authorization and never fall back to the prompt queue", async () => {
  for (const file of sendDocs) {
    const text = (await compactDoc(file)).toLowerCase()
    assert.ok(text.includes("directly and specifically authorizes that send"), `${file} requires direct specific send authority`)
    assert.ok(text.includes("actual supported transport"), `${file} requires a verified transport`)
    assert.ok(text.includes("the exact recipient and the goal intent"), `${file} verifies recipient and goal intent`)
    assert.ok(text.includes("never fall back to injecting peer traffic into the human prompt queue"), `${file} forbids prompt-queue fallback`)
  }
})

test("removal keeps upstream native input distinct and preserves provenance, receipts, permissions and ownership", async () => {
  const skill = (await compactDoc(coordinationSkill)).toLowerCase()
  const protocolText = (await compactDoc(protocol)).toLowerCase()
  for (const text of [skill, protocolText]) {
    assert.ok(text.includes("does not remove upstream native session/input APIs".toLowerCase()), "upstream native input is not claimed removed")
  }
  assert.ok(skill.includes("peer context, not a direct user instruction"))
  assert.ok(skill.includes("one writer per exact path/scope"))
  assert.ok(skill.includes("goal planning and lifecycle stay with the parent coordinator"))
  assert.ok(skill.includes("do not bypass an actual native deny"))
  assert.ok(protocolText.includes("a stored or admitted input is not observed processing"))
  assert.ok(protocolText.includes("explicit acknowledgement is seen-only"))
  assert.ok(protocolText.includes("this checklist does not register tools"))
  assert.ok(skill.includes("source tests are not live synchronization, enforcement or agent-comprehension acceptance"))
})

test("shared workflow retirement does not claim a consumer runtime was changed", async () => {
  for (const file of sendDocs) {
    const text = await compactDoc(file)
    assert.ok(text.includes("removed from this workflow"), file)
    assert.ok(text.includes("Do not infer a consumer runtime's registration state from this guidance"), file)
  }
})
