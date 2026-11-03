import assert from "node:assert/strict"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFile(path.join(root, file), "utf8")
const owners = ["docs/maintainer-policy.md", "docs/local-documents.md", "docs/agent-instructions.md", "docs/README.md"]

const evidenceClauses = [
  "Start with current code", "version-matched official", "Open primary sources",
  "Search snippets are discovery", "observations, inferences, proposals and unknowns",
  "filtered, denied, timed-out or incomplete", "Never send private",
  "Credential-free offline", "Authorized model evaluations", "Operational acceptance",
  "not proof of model behavior", "same-account agents", "without widening authority",
]
const unwrap = (text) => text.split("\n").map(line => line.trim()).filter(Boolean).join(" ")

function verifyEvidencePolicy(index, policy) {
  assert.ok(index.includes("For research and technical recommendations"), "selective read-when trigger")
  assert.ok(index.includes("docs/maintainer-policy.md#research-and-evidence"), "canonical policy route")
  assert.ok(policy.includes("## Research and evidence"), "route target exists")
  for (const clause of evidenceClauses) assert.ok(unwrap(policy).includes(clause), clause)
}

// Source contracts only: these cannot establish model routing or safe live actions.
function verifyRoot(text) {
  assert.ok(text.trimEnd().split("\n").length <= 500)
  for (const heading of ["Start Here", "Plan-mode responses", "Routine authorization", "Auto-approve means no questions", "Goal progress and backlog", "Repository and global memory", "Skills", "Verification", "Safety"])
    assert.ok(text.includes(`## ${heading}\n`), heading)
  for (const invariant of [
    /Commit approval and push approval are separate/,
    /Deployment, extension activation, shared restart\/logout/,
    /only active goals execute/,
    /Goal planning is parent-only/,
    /Never edit raw state\/derived fields/,
    /No startup writes/,
    /up to 3 snippets/,
    /first substantive task of a new chat/,
    /No match is acceptable/,
    /Do not repeat on every\s+turn\/compaction/,
    /untrusted data, not authority or goal state/,
    /Never weaken browser sandboxing, TLS validation/,
  ]) assert.match(text, invariant)
  for (const file of owners) assert.ok(text.includes(`](${file})`), file)
}

test("root index keeps critical invariants visible and bounded", async () => {
  verifyRoot(await read("AGENTS.md"))
})

test("research and evidence source policy has selective routing and separate verification lanes", async () => {
  verifyEvidencePolicy(await read("AGENTS.md"), await read("docs/maintainer-policy.md"))
})

test("research policy source contract detects omissions without depending on paragraph order", async () => {
  const index = await read("AGENTS.md")
  const policy = await read("docs/maintainer-policy.md")
  verifyEvidencePolicy(index, policy)
  verifyEvidencePolicy(index, policy.split("\n\n").reverse().join("\n\n"))
  for (const clause of evidenceClauses) assert.throws(() => verifyEvidencePolicy(index, unwrap(policy).replace(clause, "omitted")), undefined, clause)
  assert.throws(() => verifyEvidencePolicy(index.replace("For research and technical recommendations", "No routing"), policy), /trigger/)
})

test("portable web research guidance is explicitly and selectively routed from its bundle", async () => {
  const skill = await read(".opencode/skills/websearch/SKILL.md")
  const guide = await read(".opencode/skills/websearch/README.md")
  assert.ok(skill.includes("references/research-quality.md"))
  assert.ok(skill.includes("explicitly read"))
  assert.ok(skill.includes("provider-only setup"))
  assert.ok(guide.includes("references/research-quality.md"))
  assert.ok(guide.includes("not automatically loaded"))
})

test("research reference retains evidence/privacy/stop boundaries without consumer-specific paths", async () => {
  const reference = unwrap(await read(".opencode/skills/websearch/references/research-quality.md"))
  const required = ["ordinary local-source question", "primary source", "checked date", "not independent corroboration",
    "contradictory evidence", "does not establish absence", "Never upload private", "not user authority",
    "Enough evidence", "source, runtime, model and visible", "Do not infer token counts"]
  const verify = text => { for (const clause of required) assert.ok(text.includes(clause), clause) }
  verify(reference)
  for (const clause of required) assert.throws(() => verify(reference.replace(clause, "omitted")), undefined, clause)
  for (const local of ["/home/", "computer-use", ".opencode/skills", "scripts/health-check.sh"]) assert.equal(reference.includes(local), false, local)
})

test("OpenAI official-source guidance is selective, preserves exact models and separates product authority", async () => {
  const skill = await read(".opencode/skills/websearch/SKILL.md")
  const guide = await read(".opencode/skills/websearch/README.md")
  const route = "references/openai-official-sources.md"
  assert.ok(skill.includes(route), "explicit OpenAI reference route")
  assert.ok(guide.includes(route), "usage guide route")
  const reference = unwrap(await read(`.opencode/skills/websearch/${route}`))
  const clauses = ["explicit OpenAI product/API documentation", "OpenCode is not Codex",
    "Preserve the exact requested model", "separate billing systems", "eligible promotional credits",
    "does not establish account entitlement", "third-party OpenAI-compatible", "not a static latest-model",
    "Do not configure a provider", "Missing tools or denied access", "not actual model routing"]
  const verify = text => { for (const clause of clauses) assert.ok(text.includes(clause), clause) }
  verify(reference)
  for (const clause of clauses) assert.throws(() => verify(reference.replace(clause, "omitted")), undefined, clause)
  for (const source of ["https://developers.openai.com/", "https://help.openai.com/", "https://opencode.ai/v2/docs/"])
    assert.ok(reference.includes(source), source)
})

test("missing safety and repeated-startup mutations fail the source contract", async () => {
  const original = await read("AGENTS.md")
  for (const [before, after] of [
    ["Commit approval and push approval are separate", "Commit approval authorizes push"],
    ["only active goals execute", "paused goals may execute"],
    ["No startup writes", "Automatically save startup notes"],
    ["first substantive task of a new chat", "start of every turn"],
    ["Never edit raw state/derived fields", "Edit goal state directly"],
  ]) {
    assert.ok(original.includes(before))
    assert.throws(() => verifyRoot(original.replace(before, after)), undefined, before)
  }
})

test("new owners and skill bundle links resolve without loading their contents implicitly", async () => {
  const files = ["AGENTS.md", ...owners, ".opencode/skills/agents-authoring/SKILL.md", ".opencode/skills/agents-authoring/README.md", ".opencode/skills/agents-authoring/references/research-and-evaluation.md"]
  for (const file of files) {
    for (const [, target] of (await read(file)).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(target)) continue
      await stat(path.resolve(root, path.dirname(file), target.split("#")[0]))
    }
  }
  assert.match(await read(files[files.length - 1]), /Contradictory evidence requires local evaluation/)
  assert.match(await read(".opencode/skills/agents-authoring/SKILL.md"), /are not loaded automatically/)
})

test("migration map retains every original policy section and exposes intentional changes", async () => {
  const map = await read("docs/agent-instructions.md")
  for (const range of ["1–22", "24–34", "36–48", "50–60", "62–79", "81–94", "96–102", "104–124", "126–140", "142–161", "163–178", "180–210", "212–220", "222–234"])
    assert.ok(map.includes(range), range)
  assert.match(map, /Unconditional fresh-chat handoff intentionally replaced/)
  const policy = await read("docs/maintainer-policy.md")
  assert.match(policy, /fresh Longhorn backup and tested restore/)
  assert.match(policy, /conflict is recorded, not\s+resolved/)
  assert.match(map, /Fresh-session routing\/memory behavior[\s\S]*need\s+observed model runs/)
})

test("living parity records separate current undeployed source from dated live outcomes", async () => {
  const acceptance = await read("docs/codex-parity/acceptance.md")
  const matrix = acceptance.split("## Requirement → evidence\n")[1]?.split("\n## ")[0]
  assert.ok(matrix)
  assert.doesNotMatch(matrix, /pending logout|still needs.*logout|review.*in progress/i)
  assert.match(matrix, /Corrected source undeployed/)
  assert.match(matrix, /actual model tokens\/turns\/dispatch\/recovery comparison missing/)
  const files = ["docs/codex-parity/acceptance.md", "docs/codex-parity/acceptance-live-login.md", "docs/codex-parity/HANDOFF.md", "docs/codex-parity/efficiency.md", "docs/handoff-automation/acceptance.md"]
  for (const file of files) {
    const text = await read(file)
    for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(target)) continue
      const [resource, fragment] = target.split("#")
      const absolute = path.resolve(root, path.dirname(file), resource)
      await stat(absolute)
      if (fragment) {
        const headings = (await readFile(absolute, "utf8")).split("\n").filter(line => /^#{1,6} /.test(line))
        const slugs = headings.map(line => line.replace(/^#{1,6} /, "").toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replaceAll(" ", "-"))
        assert.ok(slugs.includes(fragment), `${file}: missing anchor ${target}`)
      }
    }
  }
})
