import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")

function documentedScriptOptions(guide) {
  return [...guide.matchAll(/^\| \[`[^`]+`\]\((scripts\/[^)]+)\) \| (.+) \|$/gm)]
    .map(([, script, options]) => ({ script, flags: [...options.matchAll(/`(--[a-z][a-z-]*)\b/g)].map((match) => match[1]) }))
}

function checkOwnedFlags(rows, helpByScript) {
  for (const { script, flags } of rows) {
    const help = helpByScript.get(script)
    assert.equal(typeof help, "string", `no help output for ${script}`)
    assert.ok(flags.length > 0, `no documented options for ${script}`)
    for (const flag of flags) {
      if (flag === "--help") continue
      assert.ok(help.split(/\s+/).some((word) => word.replace(/^[\[(]|[\]),]$/g, "") === flag),
        `${script} does not advertise ${flag}`)
    }
  }
}

test("onboarding guide links resolve to existing local files", async () => {
  const guide = await read("onboarding.md")
  const links = [...guide.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(?:[a-z]+:)/i.test(target))
  const headings = new Set([...guide.matchAll(/^#{1,6}\s+(.+)$/gm)]
    .map((match) => match[1].trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")))

  assert.ok(links.length > 0, "the guide should include local source links")
  for (const target of links) {
    const [encodedPath, fragment] = target.split("#", 2)
    if (!encodedPath) {
      assert.ok(headings.has(fragment), `broken guide anchor: ${target}`)
      continue
    }
    const localPath = decodeURIComponent(encodedPath)
    const resolved = path.resolve(root, localPath)
    assert.ok(resolved.startsWith(`${root}${path.sep}`), `local link escapes repository: ${target}`)
    const contents = await readFile(resolved, "utf8")
    if (fragment) {
      const targetHeadings = new Set([...contents.matchAll(/^#{1,6}\s+(.+)$/gm)]
        .map((match) => match[1].trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")))
      assert.ok(targetHeadings.has(fragment), `broken local fragment: ${target}`)
    }
  }
})

test("documented CLI option tables match their own script's actual help", async () => {
  const guide = await read("onboarding.md")
  const rows = documentedScriptOptions(guide)
  assert.deepEqual(rows.map(({ script }) => script).sort(), [
    "scripts/deploy-global-config.sh", "scripts/onboard.sh", "scripts/setup-chatgpt.py", "scripts/setup-model.sh",
  ])
  const helps = new Map()
  for (const { script } of rows) {
    const result = spawnSync(script.endsWith(".py") ? "python3" : "bash", [path.join(root, script), "--help"], {
      cwd: root, encoding: "utf8", timeout: 5_000,
      env: { ...process.env, OPENCODE_GLOBAL_CONFIG_DIR: "/tmp/opencode/onboarding-help-unused" },
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, `${script}: ${result.stderr}`)
    assert.match(result.stdout, /Usage:/i)
    helps.set(script, result.stdout)
  }
  checkOwnedFlags(rows, helps)
})

test("a flag belonging only to a different script cannot validate an option row", () => {
  const guide = "| [`onboard.sh`](scripts/onboard.sh) | `--list`, `--help` |"
  const helps = new Map([
    ["scripts/onboard.sh", "Usage: onboard.sh [--apply]"],
    ["scripts/setup-model.sh", "Usage: setup-model.sh [--list]"],
  ])
  assert.throws(() => checkOwnedFlags(documentedScriptOptions(guide), helps), /onboard.sh does not advertise --list/)
})

test("default path is preview-only and optional browser installation is off", async () => {
  const guide = await read("onboarding.md")
  const onboard = await read("scripts/onboard.sh")

  assert.match(onboard, /APPLY=0/)
  assert.match(onboard, /WITH_BROWSER=0/)
  assert.match(guide, /dry run by default/i)
  assert.match(guide, /No install\./)
  assert.match(guide, /--with-browser/)
  assert.match(guide, /--no-search/)
})

test("interactive questionnaire and Build auto no-question behavior are distinct", async () => {
  const guide = await read("onboarding.md")

  assert.match(guide, /Interactive mode: one compact questionnaire/)
  assert.match(guide, /not mandatory prompts for every setup/i)
  assert.match(guide, /Build auto: continue without live questions/)
  assert.match(guide, /do not present the questionnaire/i)
  assert.match(guide, /state the concrete blocker, and continue independent verification/i)
})

test("credentials remain user-owned and runtime claims stay bounded", async () => {
  const guide = await read("onboarding.md")
  const onboard = await read("scripts/onboard.sh")
  const project = JSON.parse(await read("opencode.json"))

  assert.match(guide, /Never request[\s\S]{0,50}credential in chat/i)
  assert.match(guide, /only the user performs/i)
  assert.match(guide, /doesn’t authenticate GitHub/i)
  assert.match(guide, /do not infer success[\s\S]{0,100}source[\s\S]{0,50}unit test passing/i)
  assert.match(guide, /No live setup result is asserted here/i)
  assert.match(onboard, /gh auth status/)
  assert.doesNotMatch(onboard, /^\s*gh auth login(?:\s|$)/m)
  assert.deepEqual(Object.keys(project.mcp.servers).sort(), ["github", "playwright"])
})

test("ChatGPT has an explicit opt-in while default source configuration stays off", async () => {
  const guide = await read("onboarding.md")
  const onboard = await read("scripts/onboard.sh")

  assert.match(guide, /Remaining optional runtime work/)
  assert.match(guide, /ChatGPT MCP plus its directly accompanying skills/)
  assert.match(guide, /Provider-fallback status in the sidebar and CPU\/RAM information at the bottom/)
  assert.match(guide, /RAG memory tool with repository scope by default and explicit global scope/)
  assert.match(guide, /remain off/)
  assert.match(guide, /--with-chatgpt/)
  assert.match(onboard, /WITH_CHATGPT=0/)
  for (const filename of ["opencode.json", "global/opencode.jsonc"]) {
    const config = JSON.parse(await read(filename))
    assert.equal(config.mcp?.servers?.chatgpt, undefined, filename)
    assert.ok(!(config.plugins ?? []).some((entry) => JSON.stringify(entry).includes("chatgpt-connector")), filename)
  }
  const connector = JSON.parse(await read("tools/chatgpt-connector/package.json"))
  assert.equal(typeof connector.exports["./server"], "string")
  await readFile(path.resolve(root, "tools/chatgpt-connector", connector.exports["./server"]), "utf8")
})
