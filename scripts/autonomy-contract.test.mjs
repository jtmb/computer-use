import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const skillBundles = ["planning", "github-operations", "agent-orchestration", "handoff", "readme-gif", "skill-maintenance"]
const read = (name) => readFile(path.join(root, name), "utf8")

function autoSection(text, source) {
  const match = text.match(/^## Auto-approve and autonomous work\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)
  assert.ok(match, `${source} must have a distinct auto-approve section before its interactive workflow guidance`)
  return match[1]
}

function assertAutoQuestionPolicy(section, source) {
  assert.match(section, /Build auto[\s\S]*?(?:autonomous|no-question)/i, `${source}: identifies the relevant mode`)
  assert.match(section, /(?:do not ask|no interactive questions)[\s\S]*?(?:routine|Git)/i, `${source}: suppresses routine questions, including Git`)
  assert.match(section, /reasonable[\s-]+reversible defaults/i, `${source}: uses defaults for ordinary ambiguity`)
  assert.match(section, /essential (?:authority|data)[\s\S]*?record the blocker[\s\S]*?continue independent work[\s\S]*?instead of asking/i, `${source}: blocks only the unavailable action and continues independent work`)
  assert.match(section, /apply this rule to all interactive ask\/confirm steps below/i, `${source}: makes the no-question rule govern the skill's own later prompts`)
  assert.match(section, /shared autonomy contract[\s\S]*?autonomous-work\.md/i, `${source}: points to the shared contract`)
  assert.match(section, /Native policy[\s\S]*?(?:scope|mode restrictions)[\s\S]*?(?:self-grant|autoaccept)/i, `${source}: preserves higher-priority boundaries`)
}

test("repository policy makes Build auto uninterrupted and includes routine Git", async () => {
  const text = await read("AGENTS.md")
  const section = text.match(/^## Auto-approve means no questions\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]
  assert.ok(section, "AGENTS.md needs a distinct no-question section")
  assert.match(section, /Build auto[\s\S]*?do not interrupt[\s\S]*?goal/i)
  assert.match(section, /Do not call the `question` tool or ask the same thing in prose/)
  assert.match(section, /including routine Git work/i)
  assert.match(section, /reasonable,[\s\S]*?assumptions and verify/i)
  assert.match(section, /record a blocker and continue independent work instead/i)
  assert.match(section, /Delegation off\/unknown stays off without an opt-in question/i)
})

test("shared contract resolves skill prompts through defaults or blockers without asking", async () => {
  const text = await read(".opencode/skills/development-conventions/references/autonomous-work.md")
  assert.match(text, /do not interrupt[\s\S]*?agent-authored questions/i)
  assert.match(text, /Do not call the `question` tool[\s\S]*?end the turn with\s+a blocking question/)
  assert.match(text, /Do not ask the user to prove the auto setting/i)
  assert.match(text, /reasonable, reversible default/i)
  assert.match(text, /If essential data,[\s\S]*?mark\s+that task blocked[\s\S]*?continue independent tasks/i)
  assert.match(text, /Existing [“"]?ask[”"]?, [“"]?confirm[”"]? and [“"]?obtain approval[”"]? wording[\s\S]*?not an extra prompt layer/i)
  assert.match(text, /Git is included[\s\S]*?routine local\s+Git work without questions/i)
  assert.match(text, /Commit and push remain distinct actions/i)
  assert.match(text, /If such confirmation\/authority is missing[\s\S]*?record a blocker and continue other work; do not silently/i)
  assert.match(text, /Preserve\s+unrelated index, staged, unstaged and untracked work/i)
  assert.match(text, /no blanket staging or[\s\S]*?destructive cleanup/i)
})

test("shared contract preserves higher-priority permissions, scope and mode boundaries", async () => {
  const text = await read(".opencode/skills/development-conventions/references/autonomous-work.md")
  assert.match(text, /Native permission `deny`\/`ask`/)
  assert.match(text, /Do not change[\s\S]*?security\/MCP\/goal storage or resolve pending permissions/i)
  assert.match(text, /no one may manufacture or grant their own approval/i)
  assert.match(text, /Plan mode still limits execution\/writes/i)
  assert.match(text, /Do not change the operator's selected mode or enable global autoaccept/i)
  assert.match(text, /Do not spawn a model\/child[\s\S]*?claim that observation when delegation is off/i)
})

for (const skill of skillBundles) {
  test(`${skill} makes its own interactive guidance subordinate to the no-question contract`, async () => {
    const source = `.opencode/skills/${skill}/SKILL.md`
    const text = await read(source)
    const section = autoSection(text, source)
    assertAutoQuestionPolicy(section, source)
    const workflow = text.indexOf("## Workflow")
    assert.ok(workflow < 0 || text.indexOf("## Auto-approve and autonomous work") < workflow,
      `${source}: no-question guidance must precede its workflow`)

    const guidePath = `.opencode/skills/${skill}/README.md`
    const guide = await read(guidePath)
    assert.match(guide, /Auto-approve means no interactive questions/i, `${guidePath}: explains auto behavior`)
    assert.match(guide, /routine Git/i, `${guidePath}: includes Git`)
    assert.match(guide, /shared autonomy contract[\s\S]*?autonomous-work\.md/i, `${guidePath}: links to the shared contract`)
  })
}

test("delegation stays off or unknown without an opt-in question", async () => {
  const contract = await read(".opencode/skills/development-conventions/references/autonomous-work.md")
  assert.match(contract, /If delegation is off or unknown,[\s\S]*?keep it off[\s\S]*?without an opt-in question/i)

  const source = await read(".opencode/skills/agent-orchestration/SKILL.md")
  const section = autoSection(source, ".opencode/skills/agent-orchestration/SKILL.md")
  assertAutoQuestionPolicy(section, ".opencode/skills/agent-orchestration/SKILL.md")
  assert.match(source, /In auto\/no-question mode,[\s\S]*?skip the initial authorization question[\s\S]*?keep delegation off/i)
  assert.match(source, /Work directly in the parent/i)
})

test("contract documents limits of static checks and requires separate live evidence", async () => {
  const text = await read(".opencode/skills/development-conventions/references/autonomous-work.md")
  assert.match(text, /Source-contract tests establish instruction coverage only/i)
  assert.match(text, /live behavior[\s\S]*?requires a separately observed auto-mode run/i)
})
