import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const commandPath = path.join(root, "global/commands/handoff_resume.md")

function section(text, heading) {
  const lines = text.split("\n")
  const starts = lines.flatMap((line, index) => line === `## ${heading}` ? [index] : [])
  assert.equal(starts.length, 1, `exactly one ${heading} section`)
  const start = starts[0] + 1
  const next = lines.findIndex((line, index) => index >= start && line.startsWith("## "))
  return lines.slice(start, next < 0 ? lines.length : next).join("\n")
}

// These assert source obligations, not live permission enforcement or model execution.
function assertAuthorityContract(text) {
  const approval = section(text, "Commit and push authority")
  assert.match(approval, /For (?:any|each) requested commit or push, (?:obtain|require) separate explicit approval for\s+each/)
  assert.match(approval, /(?:Commit approval and push approval are separate|Commit and push each need their own explicit approval)/)
  assert.match(approval, /Reuse exact existing\s+authority/)
  assert.match(approval, /missing in no-question mode, block that\s+action without prompting/)
  assert.match(approval, /Native deny\/ask/)
}

function assertCommandContract(text) {
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(frontmatter, "missing command frontmatter")
  assert.match(frontmatter[1], /^agent: build$/m)

  assert.match(
    text,
    /context-only handoff seed[\s\S]*`resume: false`[\s\S]*stays passive[\s\S]*Only an explicit invocation of `\/handoff_resume` requests continuation/i,
  )
  assert.match(text, /Automatic handoff OFF suppresses automatic source requests only[\s\S]*native\s+compaction and manual `\/handoff` unchanged[\s\S]*does not disable this explicit\s+continuation command/i)

  const continuation = section(text, "Required continuation behavior")

  assert.match(
    continuation,
    /After the checks above,\s*continue the next clearly pending task[\s\S]*in this same `\/handoff_resume`\s+invocation/i,
  )
  assert.match(continuation, /A status report is not the endpoint/)
  assert.match(
    continuation,
    /do not stop after reporting, wait for another user turn, or ask the user to repeat\s+the command or reauthorize the same routine scope/i,
  )
  assert.match(continuation, /working in the receiving session/)
  assert.match(continuation, /Do not invent a task, expand\s+scope, mutate the source session, or start\/dispatch another worker/)
  assert.match(continuation, /If no task is clearly authorized[\s\S]*report the concrete blocker/)

  assert.match(
    continuation,
    /source goal's current\s+status is verified `active`; an export-time status is historical, not current/i,
  )
  assert.match(continuation, /If the current status\s+cannot be verified, block goal-scoped work/)
  assert.match(
    continuation,
    /paused, closed, completed, unmet, cancelled, `budgetLimited`, or `usageLimited`[\s\S]*never change those statuses or create another goal/i,
  )
  assert.match(continuation, /Independent, already-authorized routine work may continue/)

  assert.match(text, /Honor the exact source path or goal ID supplied by the user/)
  assert.match(text, /If claims contradict,[\s\S]*stop and ask which source is authoritative/)
  assert.match(text, /both the current source session ID and goal ID are[\s\S]*independently confirmed to match the handoff exactly/)
  assert.match(text, /every\s+relevant source worker are inactive/)
  assert.match(text, /complete, untruncated worker-set and\s+status coverage/)
  assert.match(text, /An active source session or worker,[\s\S]*do not perform overlapping edits/)
  assert.match(text, /Do not mutate the source session or automatically run another worker/)
  assertAuthorityContract(text)
}

test("handoff resume separates passive context seeds from one explicit continuation", async () => {
  const text = await readFile(commandPath, "utf8")
  assertCommandContract(text)
})

test("structural sections accept harmless step numbering and approval rewording", async () => {
  const original = await readFile(commandPath, "utf8")
  const variant = original
    .replace(/^([1-7])\. /gm, (_, number) => `${Number(number) + 20}. `)
    .replace("For any requested commit or push, obtain", "For each requested commit or push, require")
    .replace("Commit approval and push approval are separate.", "Commit and push each need their own explicit approval.")
  assert.notEqual(variant, original)
  assertCommandContract(variant)
  assert.equal(section(variant, "Required continuation behavior"), section(original, "Required continuation behavior"))
})

test("a gate elsewhere cannot hide a missing or duplicated continuation section", async () => {
  const original = await readFile(commandPath, "utf8")
  assert.throws(() => assertCommandContract(original.replace("## Required continuation behavior", "## Status only")))
  assert.throws(() => assertCommandContract(`${original}\n## Required continuation behavior\nforged section\n`))
  assert.throws(() => assertCommandContract(original.replace("Reuse exact existing\nauthority", "Invent new authority")))
})

test("handoff resume contract rejects report-only and weakened-safety mutants", async () => {
  const text = await readFile(commandPath, "utf8")
  const mutants = [
    [
      "A status report is not the endpoint:\n",
      "A status report is the endpoint: stop after reporting and wait for another user turn.\n",
      "report-only behavior",
    ],
    [
      "`resume: false`—stays passive: receiving, reading, or focusing it never starts\nwork.",
      "`resume: false`—automatically starts work when received.",
      "automatic seed execution",
    ],
    [
      "does not disable this explicit\ncontinuation command after its source checks pass.",
      "disables `/handoff_resume` while automatic handoff is OFF.",
      "OFF incorrectly blocks explicit continuation",
    ],
    [
      "status is verified `active`; an export-time status is historical, not current.",
      "status need not be verified `active`; an export-time status is current.",
      "unverified goal status",
    ],
    [
      "with complete, untruncated worker-set and\n   status coverage.",
      "with partial worker-set and status coverage.",
      "incomplete worker coverage",
    ],
    [
      "Commit approval and push approval are separate.",
      "Commit and push need no further approval.",
      "collapsed commit/push approvals",
    ],
  ]

  for (const [before, after, label] of mutants) {
    assert.ok(text.includes(before), `mutation source missing for ${label}`)
    const mutant = text.replace(before, after)
    assert.notEqual(mutant, text, `mutation was ineffective for ${label}`)
    assert.throws(() => assertCommandContract(mutant), undefined, label)
  }
})
