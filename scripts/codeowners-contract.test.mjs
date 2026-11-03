import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../.github/CODEOWNERS", import.meta.url), "utf8")
const protectedPaths = [
  "AGENTS.md", "opencode.json", "global/cli.json",
  ".opencode/skills/README.md", ".opencode/plugins/example/index.ts",
  "config/mcp-versions.json", "scripts/ci-offline.mjs",
  "tools/session-coordination/tool.ts", "evals/agent-rules/case.json",
  "docs/golden-corpus/README.md", ".github/workflows/ci.yml",
  ".github/CODEOWNERS", "future-unclassified-source.txt",
]

// Source contract for the deliberately simple patterns used here, not GitHub's parser.
function verify(text) {
  const rules = text.split("\n").map(line => line.split("#")[0].trim()).filter(Boolean).map(line => {
    const [pattern, ...owners] = line.split(" ").filter(Boolean)
    assert.ok(pattern === "*" || (pattern.startsWith("/") &&
      !["*", "?", "[", "]", "!", "\\", ".."].some(value => pattern.includes(value))), "unsupported pattern needs a reviewed contract")
    assert.ok(owners.length > 0, "ownerless rules must not clear routing")
    return { pattern, owners }
  })
  assert.ok(rules.some(rule => rule.pattern === "*"), "default owner required")
  assert.ok(rules.some(rule => rule.pattern === "/.github/CODEOWNERS"), "explicit ownership-file protection required")
  for (const file of protectedPaths) {
    let owners = []
    for (const rule of rules) {
      const target = rule.pattern.slice(1)
      if (rule.pattern === "*" || file === target || (target.endsWith("/") && file.startsWith(target))) owners = rule.owners
    }
    assert.deepEqual(owners, ["@jtmb"], file)
  }
}

test("source routes sensitive, ownership and future paths to the repository owner", () => {
  verify(source)
})

test("last-match overrides and ownerless rules cannot silently remove owner review routing", () => {
  for (const extra of ["/.github/CODEOWNERS @other", "/global/ @other", "/.github/workflows/", "/tools/ @other @jtmb"]) {
    assert.throws(() => verify(`${source}\n${extra}\n`), undefined, extra)
  }
})

test("missing default, missing self-protection and unsupported patterns fail the source contract", () => {
  assert.throws(() => verify(source.replace("* @jtmb", "")), /default owner required/)
  assert.throws(() => verify(source.replace("/.github/CODEOWNERS @jtmb", "")), /ownership-file protection/)
  assert.throws(() => verify(`${source}\n!/.github/ @jtmb`), /unsupported pattern/)
})

test("routing comments do not claim hosted enforcement or independent same-account approvals", () => {
  assert.ok(source.includes("required owner approval needs separately configured"))
  assert.ok(source.includes("base branch"))
  assert.ok(source.includes("do not constitute independent human approvals"))
})
