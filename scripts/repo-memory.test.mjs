import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (name) => readFile(path.join(root, name), "utf8")
const indexPath = "MEMORY.md"
const protocolPath = "docs/memory/README.md"
const interactionContinuationPattern = /questions are discussion\/steering, not automatic work stoppage/i

function markdownSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    // GitHub replaces each whitespace character, so removing an em dash from
    // "boundary — untested" leaves two spaces and a double hyphen. Collapsing
    // runs here would reject links that actually work on GitHub.
    .replace(/\s/g, "-")
}

test("memory index stays within its line budget and points to source authority", async () => {
  const index = await read(indexPath)
  assert.ok(index.split(/\r?\n/).length <= 40, "MEMORY.md must stay at or below 40 lines")
  assert.match(index, /\[docs\/memory\/README\.md\]\(docs\/memory\/README\.md\)/)
  assert.match(index, /\[AGENTS\.md\]\(AGENTS\.md#goal-progress-and-backlog\)/)
  assert.match(index, /not a diary/i)
  assert.match(index, /Do not duplicate plans or status/)
})

test("durable decision recall is selectively routed and current choices precede older preferences", async () => {
  const instructions = await read("AGENTS.md"), index = await read(indexPath)
  assert.match(instructions, /When recalling an agreement or reconciling conflicting historical choices/)
  assert.match(instructions, /load `task-memory` and search relevant decisions before acting/)
  assert.match(instructions, /Confirmed durable decisions use the approved decision-capture workflow/)
  assert.match(instructions, /explicit supersession and source-linked readback/)
  assert.ok(index.includes("docs/memory/agent-inbox.md"))
  assert.ok(index.includes("docs/memory/orchestration-method.md"))
  assert.match(index, /current task-specific decisions take precedence over older defaults/i)
  assert.ok(index.indexOf("docs/memory/orchestration-method.md") < index.indexOf("docs/memory/coordination-workflow.md"))
})

test("explicit interaction preference is durable and routed once at chat startup without runtime injection", async () => {
  const instructions = await read("AGENTS.md"), index = await read(indexPath)
  const note = await read("docs/memory/interaction-preferences.md")
  assert.ok(index.includes("docs/memory/interaction-preferences.md"))
  assert.match(instructions, /startup boundary, explicitly read \[interaction preferences\]/)
  assert.match(instructions, /once, within the same two-note total/)
  assert.match(instructions, interactionContinuationPattern)
  assert.match(note, /"kind": "preference"/)
  for (const phrase of ["candid, independent advice", "benefits, drawbacks, alternatives", "not automatic cancellation", "continue already-authorized work", "safety, permission, mode", "not a runtime hook"])
    assert.ok(note.includes(phrase), phrase)
})

test("interaction continuation wording accepts sentence case but rejects removal of the actual instruction", async () => {
  const instructions = await read("AGENTS.md")
  assert.match(instructions.toLowerCase(), interactionContinuationPattern)
  assert.match(instructions.toUpperCase(), interactionContinuationPattern)
  const omitted = instructions.replace(interactionContinuationPattern, "interaction continuation clause omitted")
  assert.notEqual(omitted, instructions)
  assert.throws(() => assert.match(omitted, interactionContinuationPattern), { code: "ERR_ASSERTION" })
})

test("repository root and note destinations are explicitly bounded", async () => {
  const protocol = await read(protocolPath)
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
  assert.equal(path.resolve(root), path.resolve(gitRoot), "test must run from the repository root")
  assert.match(protocol, /consumer repository's `AGENTS\.md` and relevant project configuration/)
  assert.match(protocol, /git rev-parse --show-toplevel/)
  assert.match(protocol, /Discover existing memory files and conventions before creating/)
  assert.match(protocol, /Only when a reusable fact or project decision is worth keeping/)
  assert.match(protocol, /`docs\/memory\/<topic>\.md`/)
  assert.match(protocol, /within that root/)
  assert.match(protocol, /Do not write through symlinks, outside the intended root, or across repositories/)
  assert.match(protocol, /If there is no verified repository, do not guess a home-directory, global, or other repository destination/)
})

test("retrieval is targeted and has explicit token and injection budgets", async () => {
  const protocol = await read(protocolPath)
  assert.match(protocol, /Search the memory index and grep for the topic before opening notes/)
  assert.match(protocol, /at most one or two small, relevant notes/)
  assert.match(protocol, /not the whole memory tree on every turn/)
  assert.match(protocol, /aim for about 200 words/)
  assert.match(protocol, /not a memory service or automatic prompt injection/)
  assert.match(protocol, /do not require or add a memory blob to every prompt/)
})

test("notes are factual, dated, source-linked, and not a task diary", async () => {
  const protocol = await read(protocolPath)
  assert.match(protocol, /factual, concise/)
  assert.match(protocol, /dated with when its facts were last verified/)
  assert.match(protocol, /Link to existing source or evidence using repository-relative paths instead of copying transcripts/)
  assert.match(protocol, /update or deduplicate a relevant note/)
  assert.match(protocol, /Do not use memory as an append-only diary/)
  assert.match(protocol, /update or remove stale claims/)
  assert.match(protocol, /Illustrative note template/)
  assert.match(protocol, /The placeholders below are not factual notes/)
  assert.match(protocol, /<Concise fact or current project decision>/)
  assert.match(protocol, /<repository-relative path>/)
})

test("global memory is explicit and RAG retrieval stays scoped and bounded", async () => {
  const protocol = await read(protocolPath)
  assert.match(protocol, /Repository scope is the default/)
  assert.match(protocol, /Global scope is a separate, explicit choice/)
  assert.match(protocol, /actual OpenCode data directory/)
  assert.match(protocol, /Never promote repository notes automatically/)
  assert.match(protocol, /native read\/edit and\s+external-directory permissions/)
  for (const field of ["id", "title", "tags", "kind", "sources"])
    assert.ok(protocol.includes(`\`${field}\``), field)
  assert.match(protocol, /title\/tag boosts plus body terms/)
  assert.match(protocol, /snippets with scope, note ID, score and file\/line/)
  assert.match(protocol, /limits\/truncation/)
  assert.match(protocol, /local lexical retrieval, not embedding-based semantic search/)
})

test("privacy, external-store, and Git safety boundaries are explicit", async () => {
  const protocol = await read(protocolPath)
  assert.match(protocol, /Never put secrets, credentials, tokens, private conversations, or personal account data in Git-ready notes/)
  assert.match(protocol, /does not imply migration from any external store/)
  assert.match(protocol, /does not require an external provider/)
  assert.match(protocol, /Preserve existing data/)
  assert.match(protocol, /Do not automatically stage, commit, or push/)
})

test("maintenance policy separates existing schema from proposed reversible operations", async () => {
  const plan = await read("docs/memory/maintenance-plan.md")
  const protocol = await read(protocolPath)
  assert.ok(protocol.includes("(maintenance-plan.md)"))
  for (const section of ["## Existing tool versus proposed maintenance", "## Token-efficient review", "## Archive-first action gate", "## Restore, retention, and acceptance before implementation"])
    assert.ok(plan.includes(section), section)
  for (const boundary of [
    "Unknown metadata is refused", "`pinned`", "`expires`", "`supersededBy`",
    "review signal", "not a deletion criterion", "read at most", "not pagination",
    "no cron job or timer", "exact authority", "not authorization", "concurrent",
    "not archival", "lossless restore", "not those future",
  ]) assert.ok(plan.toLowerCase().includes(boundary.toLowerCase()), boundary)
})

test("instructions stay authoritative and goal planning stays parent-only", async () => {
  const protocol = await read(protocolPath)
  const instructions = await read("AGENTS.md")
  assert.match(protocol, /Project instructions in `AGENTS\.md`.*govern agent behavior/)
  assert.match(protocol, /task progress, goal plans, and lifecycle decisions belong to the parent and goal tools/)
  assert.match(protocol, /Never duplicate goal plans, status, or goal exports/)
  assert.match(instructions, /## Goal progress and backlog[\s\S]*Goal planning is parent-only/)
  assert.match(instructions, /Use goal tools/)
  assert.match(instructions, /Never edit raw state\/derived fields/)
})

test("memory documentation links resolve inside the verified repository", async () => {
  const gitRoot = path.resolve(execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  }).trim())
  for (const file of [indexPath, protocolPath, "docs/memory/maintenance-plan.md"]) {
    const text = await read(file)
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim()
      if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1)
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue
      const [resource, fragment] = target.split("#", 2)
      const decoded = decodeURIComponent(resource.split("?", 1)[0])
      const destination = path.resolve(path.dirname(path.join(root, file)), decoded)
      const relative = path.relative(gitRoot, destination)
      assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${file}: link escapes repository: ${target}`)
      await stat(destination)
      const [realRoot, realDestination] = await Promise.all([realpath(gitRoot), realpath(destination)])
      const realRelative = path.relative(realRoot, realDestination)
      assert.ok(realRelative && !realRelative.startsWith("..") && !path.isAbsolute(realRelative), `${file}: link resolves outside repository: ${target}`)
      if (fragment) {
        const linkedText = await readFile(destination, "utf8")
        const headings = [...linkedText.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((heading) => markdownSlug(heading[1]))
        assert.ok(headings.includes(decodeURIComponent(fragment)), `${file}: missing heading #${fragment} in ${resource}`)
      }
    }
  }
})
