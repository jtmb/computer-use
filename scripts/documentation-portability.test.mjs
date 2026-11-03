import assert from "node:assert/strict"
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (name) => readFile(path.join(root, name), "utf8")
const sharedSkills = ["development-conventions", "skill-maintenance", "readme-maintenance"]
const sharedFiles = [
  ".opencode/skills/development-conventions/SKILL.md",
  ".opencode/skills/development-conventions/README.md",
  ".opencode/skills/development-conventions/references/create-readme/guidelines.md",
  ".opencode/skills/development-conventions/references/write-docs/guide.md",
  ".opencode/skills/development-conventions/references/sources/api-aggregation-patterns/source-index.md",
  ".opencode/skills/development-conventions/references/sources/computer-use-operations/source-index.md",
  ".opencode/skills/development-conventions/references/sources/computer-use-operations/references/mcp-tool-parity.md",
  ".opencode/skills/development-conventions/references/sources/computer-use-operations/references/layered-crud.md",
  ".opencode/skills/skill-maintenance/SKILL.md",
  ".opencode/skills/skill-maintenance/README.md",
  ".opencode/skills/readme-maintenance/SKILL.md",
  ".opencode/skills/readme-maintenance/README.md",
  ".opencode/skills/readme-maintenance/references/readme-layout.md",
]

function frontmatterValue(text, key) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
  assert.ok(match, "SKILL.md has YAML frontmatter")
  const field = match[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
  return field?.[1].trim().replace(/^(["'])(.*)\1$/, "$2")
}

test("documentation guidance requires a source-backed, human-readable feature inventory", async () => {
  const text = await read(".opencode/skills/development-conventions/references/write-docs/guide.md")
  for (const phrase of [
    "docs/features.md",
    "human-readable",
    "Inspect implementation",
    "present in source",
    "available at runtime",
    "verified, blocked, or deferred",
    "link locally",
    "feature is added, removed, or materially changed",
  ]) assert.ok(text.includes(phrase), phrase)
  assert.doesNotMatch(text, /computer-use|\/home\/(?:james|shak)|~\/repos\//i)
})

test("shared skill guidance discovers consumer paths, metadata rules, and tools", async () => {
  const text = (await Promise.all(sharedFiles.map(read))).join("\n")
  assert.match(text, /consumer project/i)
  assert.match(text, /do not assume/i)
  assert.match(text, /validator/i)
  assert.doesNotMatch(text, /~\/repos\/computer-use|\/home\/(?:james|shak)\/repos\/computer-use|~\/.opencode-v2-pilot/i)
  assert.doesNotMatch(text, /\.{1,2}\/scripts\/(?:health-check|setup-opencode|check-skill-docs)\.sh?/i)
  assert.doesNotMatch(text, /metadata, required by this repository|this repository requires metadata|under 500 lines|under 170 physical lines/i)
})

test("computer-use README rules are local while the shared layout reference stays generic", async () => {
  const shared = await read(".opencode/skills/readme-maintenance/references/readme-layout.md")
  const local = await read("docs/readme-layout.md")
  assert.match(shared, /consumer project's own style/i)
  assert.doesNotMatch(shared, /computer-use|Splice|OpenCode README|170 physical lines|under 170/i)
  for (const phrase of ["Splice", "170 physical lines", "centered header", "setup prompt", "OpenCode"])
    assert.ok(local.includes(phrase), phrase)
})

test("skill frontmatter remains name/description metadata, without exporting local schema requirements", async () => {
  for (const skill of sharedSkills) {
    const text = await read(`.opencode/skills/${skill}/SKILL.md`)
    assert.equal(frontmatterValue(text, "name"), skill)
    assert.ok(frontmatterValue(text, "description"), `${skill}: description`)
    assert.match(text, /^metadata:\s*$/m, `${skill}: existing source metadata is preserved`)
  }
  const guidance = await read(".opencode/skills/skill-maintenance/references/documentation-and-metadata.md")
  assert.match(guidance, /consumer project's instructions/i)
  assert.match(guidance, /not a universal repository schema/i)
  assert.match(guidance, /Do not require a `README\.md`/)
})

test("README maintenance keeps the shared no-question contract", async () => {
  const skill = await read(".opencode/skills/readme-maintenance/SKILL.md")
  const usage = await read(".opencode/skills/readme-maintenance/README.md")
  assert.match(skill, /Auto-approve and autonomous work/)
  assert.match(skill, /autonomous-work\.md/)
  assert.match(skill, /record the blocker and continue independent work/)
  assert.match(usage, /Auto-approve means no interactive questions/)
  assert.match(usage, /autonomous-work\.md/)
})

test("local markdown links in the changed shared bundles resolve from their containing files", async () => {
  const files = [...sharedFiles]
  const references = path.join(root, ".opencode/skills/skill-maintenance/references")
  for (const entry of await readdir(references, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md"))
      files.push(path.relative(root, path.join(references, entry.name)))
  }

  for (const file of files) {
    const text = await read(file)
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim().split(/\s+/, 1)[0]
      if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1)
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue
      const localPath = decodeURIComponent(target.split(/[?#]/, 1)[0])
      assert.ok(localPath, `${file}: empty local link`)
      await stat(path.resolve(path.dirname(path.join(root, file)), localPath))
    }
  }
})
