import assert from "node:assert/strict"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const skillRoot = ".opencode/skills"
const excludedBundles = new Set([
  "planning",
  "development-conventions",
  "skill-maintenance",
  "readme-maintenance",
])
const read = (name) => readFile(path.join(root, name), "utf8")

async function collectMarkdown(directory) {
  const files = []

  async function visit(relative) {
    const absolute = path.join(root, directory, relative)
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name)
      if (entry.isDirectory()) {
        await visit(child)
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "PROVENANCE.md") {
        files.push(path.posix.join(directory, child.split(path.sep).join("/")))
      }
    }
  }

  await visit("")
  return files.sort()
}

const skillEntries = await readdir(path.join(root, skillRoot), { withFileTypes: true })
const bundleDirectories = skillEntries
  .filter((entry) => entry.isDirectory() && !excludedBundles.has(entry.name))
  .map((entry) => entry.name)
  .sort()
const files = (await Promise.all(bundleDirectories.map((name) => collectMarkdown(`${skillRoot}/${name}`))))
  .flat()
  .sort()
const corpus = (await Promise.all(files.map(read))).join("\n")

test("portability audit stays within the requested shared-skill scope", () => {
  assert.ok(files.length > 0, "in-scope skill documentation is discovered")
  for (const excluded of excludedBundles)
    assert.ok(!files.some((file) => file.startsWith(`${skillRoot}/${excluded}/`)), excluded)
  assert.ok(!files.includes(`${skillRoot}/README.md`), "the local skill catalog is not audited as shared guidance")
})

test("in-scope instructions do not embed this checkout's paths or custom runtime tools", () => {
  for (const [pattern, label] of [
    [/(?:~\/(?:repos\/computer-use|Documents\/computer-assistant|Downloads|Documents|Desktop)|\/home\/[^/\s`]+\/repos\/computer-use|\/tmp\/opencode)/i, "machine-specific paths"],
    [/\.opencode\/skills\/[\w-]+\/scripts\//i, "checkout-specific skill script paths"],
    [/\bskills\/README\.md\b/i, "a fixed catalog path"],
    [/\bydotool\b|desktop-control\.py|\bwsl_browser_\w*|Windows default browser|computer-use\.desktop/i, "local desktop/browser integration details"],
    [/setup-opencode\.sh|health-check\.sh|check-skill-docs\.sh/i, "local deployment or health-check commands"],
  ]) assert.doesNotMatch(corpus, pattern, label)
})

test("platform, browser, version, and provider guidance is discovered rather than fixed", async () => {
  const desktop = `${await read(`${skillRoot}/desktop-control/SKILL.md`)}\n${await read(`${skillRoot}/desktop-vision/SKILL.md`)}`
  assert.doesNotMatch(desktop, /\bGNOME\b|\bAT-SPI\b|\bydotool\b|fractionally scaled desktop/i)

  const blenderFiles = files.filter((file) => file.startsWith(`${skillRoot}/blender/`))
  const blender = (await Promise.all(blenderFiles.map(read))).join("\n")
  assert.doesNotMatch(blender, /Blender\s+5\.0|docs\.blender\.org\/(?:manual|api)\/(?:en\/)?5\.0|\/tmp\/opencode|headless Firefox|wsl_browser|\bUIA\b|\bAT-SPI\b|through `--python-exit-code 1`/i)

  const browserAsset = await read(`${skillRoot}/web-3d-asset-pipeline/SKILL.md`)
  assert.doesNotMatch(browserAsset, /wsl_browser|Windows default browser|headless Firefox|isolated Firefox/i)

  const browserHeadless = `${await read(`${skillRoot}/browser-headless/SKILL.md`)}\n${await read(`${skillRoot}/browser-headless/README.md`)}`
  assert.doesNotMatch(browserHeadless, /\bPlaywright\b|\bFirefox\b/i)

  const playtest = await read(`${skillRoot}/game-playtest/SKILL.md`)
  assert.doesNotMatch(playtest, /Windows default visible|headless Firefox|\bUIA\b|delete every playtest screenshot immediately/i)

  const websearch = await read(`${skillRoot}/websearch/SKILL.md`)
  const description = websearch.match(/^description:\s*(.*)$/m)?.[1] ?? ""
  assert.doesNotMatch(description, /\b(?:Exa|Firecrawl|Parallel|Tavily|TinyFish)\b/i)

  const fanduel = `${await read(`${skillRoot}/fanduel-parlay-research/SKILL.md`)}\n${await read(`${skillRoot}/fanduel-parlay-research/README.md`)}\n${await read(`${skillRoot}/fanduel-parlay-research/references/fanduel-workflow.md`)}`.replace(/\s+/g, " ")
  assert.doesNotMatch(fanduel, /geolocation check fails on Linux|Ubuntu and OpenCode|native Ubuntu browser|\.opencode\/skills\/fanduel-parlay-research\/scripts|\bPlaywright\b/i)
  assert.match(fanduel, /do not assume a particular automation tool or page-evaluation feature/i)
  assert.match(fanduel, /approved browser integration exposes\s+read-only page evaluation/i)
})

test("document examples do not impose home-directory storage paths", async () => {
  const filesAndDocuments = await read(`${skillRoot}/files-and-documents/README.md`)
  assert.doesNotMatch(filesAndDocuments, /~\/(?:Downloads|Documents|Desktop)\//i)
  assert.match(filesAndDocuments, /user-selected or project-approved directory/i)
})

test("local portability note preserves this repository's requirements and boundaries", async () => {
  const note = (await read("docs/shared-skill-portability.md")).replace(/\s+/g, " ")
  for (const phrase of [
    "Splice",
    "170 physical lines",
    "copyable",
    "preview-before-apply",
    "simultaneous timeline",
    "old recordings",
    "goal tools",
    "parent-only",
    "native OpenCode mechanisms",
    "custom plugins",
    "external MCP",
    "desktop_screenshot",
  ]) assert.ok(note.includes(phrase), phrase)
  assert.match(note, /source file.*not proof that a tool is installed/s)
  assert.match(note, /do not authorize invoking it/)
})

test("local Markdown links in in-scope bundles and the portability note resolve", async () => {
  const markdown = [...files, "docs/shared-skill-portability.md"]
  for (const file of markdown) {
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

test("local catalog category/tag rows agree with every canonical skill frontmatter", async () => {
  const catalog = await read(`${skillRoot}/README.md`)
  const rows = catalog.split("\n").filter((line) => line.startsWith("| [`") && line.includes("/SKILL.md)"))
  const canonical = []
  for (const entry of skillEntries.filter((entry) => entry.isDirectory())) {
    const skill = await read(`${skillRoot}/${entry.name}/SKILL.md`)
    const frontmatter = skill.match(/^---\n([\s\S]+?)\n---/)
    assert.ok(frontmatter, `${entry.name}: missing frontmatter`)
    const name = frontmatter[1].match(/^name: (.+)$/m)?.[1]
    const category = frontmatter[1].match(/^  category: "([^"\n]+)"$/m)?.[1]
    const tags = frontmatter[1].match(/^  tags: "([^"\n]+)"$/m)?.[1]
    assert.equal(name, entry.name)
    assert.ok(category && tags, `${name}: expected this repo's category/tag format`)
    canonical.push(name)
    const matches = rows.filter((row) => row.startsWith(`| [\`${name}\`]`))
    assert.equal(matches.length, 1, `${name}: missing or duplicate catalog row`)
    assert.equal(matches[0], `| [\`${name}\`](./${name}/SKILL.md) | [\`README.md\`](./${name}/README.md) | \`${category}\` | \`${tags}\` |`)
    await stat(path.join(root, skillRoot, name, "README.md"))
  }
  assert.equal(rows.length, canonical.length, "catalog has stale extra rows")
})
