import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const bundle = path.join(root, ".opencode/skills/planning")
const read = (name) => readFile(path.join(bundle, name), "utf8")

// Source-contract checks, not a model-behavior or rendered-client acceptance test.
test("repository instructions require the plan in Plan-mode chat, not only a goal ID", async () => {
  const text = await readFile(path.join(root, "AGENTS.md"), "utf8")
  assert.match(text, /## Plan-mode responses/)
  assert.match(text, /Always show the substantive plan in chat/)
  assert.match(text, /clickable Markdown link/)
  assert.match(text, /not only a goal ID, tool result, or file path/)
})

test("planning skill requires verified links without authorizing file writes", async () => {
  const text = await read("SKILL.md")
  assert.match(text, /Always output the substantive plan in chat in Plan mode/)
  assert.match(text, /Verify the file exists before linking/)
  assert.match(text, /If no authorized plan file exists, show the plan inline/)
  assert.match(text, /Do not create a file merely to supply a link/)
  assert.match(text, /Do not claim a repository export exists/)
  assert.match(text, /Keep commit and push as\s+separate approvals/)
})

test("usage and rubric cover both persisted and inline-only plans", async () => {
  const usage = await read("README.md")
  const examples = await read("references/examples-and-review.md")
  assert.match(usage, /Plan-mode answers always include the substantive plan in chat/)
  assert.match(usage, /goal record alone is not a clickable plan document/)
  assert.match(examples, /Example: saved plan versus inline-only plan/)
  assert.match(examples, /Plan-mode visibility/)
  assert.match(examples, /not a verified link/)
  assert.match(examples, /not a live model-behavior test/)
})

test("planning bundle keeps valid metadata, local links and bounded guidance", async () => {
  const text = await read("SKILL.md")
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(frontmatter, "missing frontmatter")
  assert.match(frontmatter[1], /^name: planning$/m)
  const description = frontmatter[1].match(/^description: (.+)$/m)?.[1]
  assert.ok(description && description.length <= 1024)
  assert.match(frontmatter[1], /schema-version: "1"/)
  assert.match(frontmatter[1], /category: "maintenance"/)
  assert.ok(text.split("\n").length < 500)
  for (const name of ["SKILL.md", "README.md", "references/examples-and-review.md"]) {
    const content = await read(name)
    assert.match(content, /^[\x00-\x7f]*$/)
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(match[1])) continue
      const target = path.resolve(bundle, path.dirname(name), match[1].split("#")[0])
      await assert.doesNotReject(readFile(target), `${name}: missing link ${match[1]}`)
    }
  }
})
