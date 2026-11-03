import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const bundle = path.join(root, ".opencode/skills/planning")
const readBundle = (name) => readFile(path.join(bundle, name), "utf8")

// These checks cover source instructions and an illustrative fixture, not live model behavior.
test("goal workflow guidance requires fresh, active-only progress reads", async () => {
  const skill = await readBundle("SKILL.md")
  const reference = await readBundle("references/goal-mode-usage.md")
  const docs = await readFile(path.join(root, "docs/goal-mode-usage.md"), "utf8")

  assert.match(skill, /call `get_goal` before goal work/i)
  assert.match(skill, /status and\s+`planRevision`/)
  assert.match(skill, /Continue work only while the goal is `active`/)
  assert.match(reference, /Continue `currentTask` first[\s\S]*derived\s+`nextTask`/)
  assert.match(reference, /If `nextTask` is null, inspect the full plan[\s\S]*next-phase/i)
  assert.match(reference, /concrete pending (?:successor )?tasks/)
  assert.match(reference, /concrete evidence[\s\S]*phase-level verification/i)
  assert.match(reference, /specific blocker/)
  assert.match(reference, /overall objective, immutable completion criteria, and completed\s+tasks/)
  assert.match(reference, /Do not mark the overall goal complete merely because the current task ended[\s\S]*`nextTask`/)
  assert.match(reference, /Never edit goal storage,[\s\S]*derived fields directly/)
  assert.match(reference, /planning-only request[\s\S]*does not authorize goal creation or lifecycle changes/)
  assert.match(docs, /currentTask` first[\s\S]*derived `nextTask`/)
  assert.match(docs, /inspect the current\s+status and `planRevision`/)
  assert.match(docs, /Continue only an `active` goal/)
  assert.match(docs, /concrete pending successor tasks/)
  assert.match(docs, /Mark a task complete only after its work is actually done and evidence is/)
  assert.match(docs, /immutable completion\s+criteria/)
  assert.match(docs, /Do not\s+close a goal because one task ended, `nextTask` is null/)
  assert.match(docs, /Never modify raw goal\s+storage, generated goal documents, or derived fields/)
  assert.match(docs, /A planning-only\s+request does not authorize goal creation or lifecycle changes/)
})

test("goal usage is discoverable without replacing plan-only response rules", async () => {
  const skill = await readBundle("SKILL.md")
  const usage = await readBundle("README.md")
  const rubric = await readBundle("references/examples-and-review.md")
  const docs = await readFile(path.join(root, "docs/goal-mode-usage.md"), "utf8")

  assert.match(skill, /first read \[the goal-mode\s+workflow\]\(references\/goal-mode-usage\.md\)/)
  assert.match(usage, /A planning request alone does not create or change a persistent goal/)
  assert.match(usage, /\[goal-mode usage\]\(\.\/references\/goal-mode-usage\.md\)/)
  assert.match(usage, /substantive plan in chat/)
  assert.match(usage, /clickable Markdown link/)
  assert.doesNotMatch(usage, /scripts\/(?:planning-contract|goal-workflow)\.test\.mjs/)
  assert.match(usage, /target project's own `AGENTS\.md`, test documentation, manifests/)
  assert.match(usage, /do not assume this skill's\s+source-repository scripts exist/)
  assert.match(usage, /In interactive mode/)
  assert.match(usage, /In auto\/no-question mode[\s\S]*instead of prompting/)
  assert.match(skill, /For Build auto[\s\S]*Do not ask routine questions/)
  assert.match(skill, /shared autonomy contract/)
  assert.match(skill, /In interactive mode, ask only when a missing decision blocks/)
  assert.match(skill, /In auto\/no-question mode[\s\S]*instead of prompting/)
  assert.match(rubric, /Goal progress \(when applicable\)/)
  assert.match(docs, /node --test scripts\/planning-contract\.test\.mjs/)
  assert.match(docs, /node --test scripts\/goal-workflow\.test\.mjs/)

  for (const name of [
    "SKILL.md",
    "README.md",
    "references/examples-and-review.md",
    "references/goal-mode-usage.md",
  ]) {
    const text = await readBundle(name)
    for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(target)) continue
      const resolved = path.resolve(bundle, path.dirname(name), target.split("#")[0])
      await assert.doesNotReject(
        readFile(resolved),
        `${name}: missing local link ${target}`,
      )
    }
  }
})

test("parallel goal work keeps a serial coordinator cursor and separate ownership evidence", async () => {
  const reference = await readBundle("references/goal-mode-usage.md")
  const docs = await readFile(path.join(root, "docs/goal-mode-usage.md"), "utf8")

  for (const text of [reference, docs]) {
    assert.match(text, /single coordinator (?:cursor|phase\/task cursor)/)
    assert.match(text, /separate child ownership\/verification\s+registry/)
    assert.match(text, /exact (?:child )?owner[\s\S]*task(?: and path|\/path) scope/)
    assert.match(text, /user-authorized,?\s+independent preparatory or review work\s+in parallel/)
    assert.match(text, /pending later-phase[\s\S]*(?:does not authorize|not permission to execute)/)
    assert.match(text, /pending parent\s+acceptance is not (?:verified )?task completion/)
    assert.match(text, /dependencies are satisfied/)
  }
})

test("goal planning remains parent-only even when implementation delegation is enabled", async () => {
  const files = [
    "AGENTS.md",
    ".opencode/skills/development-conventions/references/autonomous-work.md",
    ".opencode/skills/planning/SKILL.md",
    ".opencode/skills/agent-orchestration/SKILL.md",
    ".opencode/skills/planning/references/goal-mode-usage.md",
    "docs/goal-mode-usage.md",
  ]
  for (const file of files) {
    const text = await readFile(path.join(root, file), "utf8")
    assert.match(text, /Goal planning is parent-only/, file)
    assert.match(text, /(?:main|parent) coordinator[\s\S]*goal\s+plans/i, file)
    assert.match(text, /(?:prioriti[sz]|sequenc|next goal task)/i, file)
    assert.match(text, /lifecycle[\s\S]*completion/i, file)
    assert.match(text, /(?:implementation[\s\S]*verification|inspection[\s\S]*implementation[\s\S]*tests)/i, file)
    assert.match(text, /delegation\s+(?:authorization|permission)[\s\S]*does not/i, file)
  }
})

test("illustrative progress selection prefers currentTask, then nextTask, then inspection", async () => {
  const reference = await readBundle("references/goal-mode-usage.md")
  const match = reference.match(/```json\n([\s\S]*?)\n```/)
  assert.ok(match, "missing illustrative JSON fixture")
  const state = JSON.parse(match[1])

  const select = (snapshot) => {
    if (snapshot.status !== "active") return { kind: "stop" }
    if (snapshot.currentTask) return { kind: "task", id: snapshot.currentTask }
    if (snapshot.nextTask) return { kind: "task", id: snapshot.nextTask }
    return {
      kind: "inspect-plan",
      phase: snapshot.currentPhase.id,
      nextPhase: snapshot.nextPhase?.id ?? null,
    }
  }

  assert.equal(state.planRevision, 11)
  assert.equal(select(state).id, "current_task")
  const afterCurrentTask = { ...state, currentTask: null }
  assert.equal(select(afterCurrentTask).id, "features_inventory")
  const emptyCursor = { ...afterCurrentTask, nextTask: null }
  assert.deepEqual(select(emptyCursor), {
    kind: "inspect-plan",
    phase: "discovery",
    nextPhase: "implementation",
  })
  assert.notEqual(select(emptyCursor).id, "implementation_task")
  assert.equal(select({ ...state, status: "paused" }).kind, "stop")
  assert.match(reference, /not a live goal response or model\s+acceptance result/)
})
