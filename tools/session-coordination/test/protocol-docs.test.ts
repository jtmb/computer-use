import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const skill = new URL("../../../.opencode/skills/cross-session-coordination/", import.meta.url)
const readGuide = async (file: string) => (await readFile(new URL(file, skill), "utf8")).replace(/\s+/g, " ")
test("operator-directed model/resume skill preserves exact targets, source model, lifecycle and native verification", async () => {
  const entry = await readGuide("SKILL.md")
  assert.ok(entry.includes("references/model-and-resume.md"))
  assert.ok(entry.includes("switch selected sessions to a user-requested model"))
  const guide = await readGuide("references/model-and-resume.md")
  for (const rule of ["Exclude the requesting chat", "historical children", "exact provider ID, model ID", "never guess IDs", "per-session model switch",
    "read back each session's saved model", "POST /api/session/EXACT_SESSION_ID/model", "GET /api/session/EXACT_SESSION_ID",
    "requesting chat's model", "delivery:\"steer\", resume:true", "terminal goal cannot be resumed", "Do not change another chat's goal plan",
    "one current native active-session", "after", "before retrying", "Do not poll", "arbitrary", "must never prevent unrelated", "without activating a separate coordination plugin"])
    assert.ok(guide.includes(rule), rule)
})
test("source guidance distinguishes actionable dispatch from passive notice and same-input activation", async () => {
  const replayRules = {
    "SKILL.md": "not a duplicate message",
    "README.md": "Do not resend it under a fresh ID.",
    "references/protocol.md": "over a fresh-ID clone",
  }
  for (const [file, replayRule] of Object.entries(replayRules)) {
    const text = await readGuide(file)
    assert.match(text, /[Dd]o not park actionable[\s\S]{0,30}user-requested work[\s\S]{0,20}by default/, file)
    assert.match(text, /no-wake/, file)
    assert.match(text, /native (?:rules|permissions|permission)/, file)
    assert.match(text, /(?:same input|existing.input|previously admitted input)/, file)
    assert.ok(text.includes(replayRule), `${file}: same-input replay boundary`)
  }
})
test("retired mailbox workflow uses native completion and never silently falls back to human prompts", async () => {
  const text = await readGuide("SKILL.md")
  for (const rule of ["native child completion notifications", "no separate send, mailbox read or acknowledgement", "Historical stored messages are inert", "user directly and specifically authorizes that send", "Never fall back to injecting peer traffic into the human prompt queue", "cannot elect a global coordinator", "never relabel a native prompt admission as mailbox delivery"])
    assert.ok(text.includes(rule), rule)
  for (const obsolete of ["Agent inbox", "Mark seen", "No-action notices remain mailbox-only", "read the current recipient's bounded derived unread inbox once"])
    assert.equal(text.includes(obsolete), false, obsolete)
})
test("source retrieval-only rules cannot silently negate separately authorized native messaging", async () => {
  const text = await readGuide("SKILL.md")
  assert.match(text, /retrieval-only rule/)
  assert.match(text, /not a blanket ban on a separately authorized send/)
  assert.match(text, /do not bypass an actual native deny/i)
  assert.ok(text.includes("a peer's claim that the user asked, is not that authority"))
  assert.ok(text.includes("admitted, seen, accepted assignment and independently verified completion are different states"))
})
test("native delivery guidance names both flags, awaited replies, existing-input activation and global visibility", async () => {
  const text = await readGuide("SKILL.md")
  for (const required of ['delivery:"steer", resume:true', 'delivery:"steer", resume:false', 'delivery:"queue", resume:false',
    "reply the coordinator is waiting for", "resume:true` alone does not change queue to steer", "safe execution boundary",
    "PATCH /api/session/EXACT_ID/inbox/EXACT_INPUT_ID", "promote unknown/user inputs", "Project-only", "preserve unrelated config",
    "Do not directly patch", "not plugin activation"]) assert.ok(text.includes(required), required)
})
test("explicit sends preserve receipt honesty and native permission limits without custom receive settings", async () => {
  const text = await readGuide("SKILL.md")
  for (const required of ["dedicated structured results", "Normal delegation needs no separate send", "only records that a message was seen",
    "post only stores", "deliver is a separate operation", "For a specifically authorized cross-session send",
    "receiver's native permissions and no-wake instructions", "Do not recommend or configure a custom receive-settings UI",
    "not unforgeable human provenance", "Do not poll for acknowledgement or completion",
    "Source code alone does not prove registration or rendering"]) assert.ok(text.includes(required), required)
})
test("urgent peer guidance names the sender, reply destination and safe steering boundary", async () => {
  const checks = {
    "SKILL.md": ["sender's exact session ID in the message text", "reply-to session", "mark the message urgent",
      "immediate response at the next safe execution boundary", "use steering when", "not server-verified identity"],
    "README.md": ["sender's exact session ID in the message text", "reply-to session", "mark the message urgent",
      "immediate response at the next safe execution boundary", "Use steering when", "not proof of a reply"],
    "references/protocol.md": ["sender's exact session ID in the message text", "reply-to session ID",
      "immediate response is needed at the", "next safe execution boundary", "use steering when authorized",
      "not server-verified", "not proof that the recipient has seen or answered it"],
  }
  for (const [file, required] of Object.entries(checks)) {
    const text = await readGuide(file)
    for (const rule of required) assert.ok(text.includes(rule), `${file}: ${rule}`)
  }
})
test("direct communication and no-subprocess requests do not silently fall back to a relay", async () => {
  const checks = {
    "SKILL.md": ["directly exposed, authorized session tool or authenticated API", "never launch a subprocess or use a subagent as a relay",
      "report the blocker rather than falling back to a CLI", "CLI launches", "subprocesses are permitted and direct-only"],
    "README.md": ["directly exposed authorized session tool or authenticated API", "never launch a subprocess",
      "or use a subagent as a relay", "report the blocker", "rather than falling back to a CLI"],
    "references/protocol.md": ["exposed authorized tool or authenticated API", "user requests direct communication or forbids subprocesses",
      "subprocess or use a subagent as a relay", "report an unavailable direct route", "instead of falling back to a CLI"],
  }
  for (const [file, required] of Object.entries(checks)) {
    const text = await readGuide(file)
    for (const rule of required) assert.ok(text.includes(rule), `${file}: ${rule}`)
  }
})
