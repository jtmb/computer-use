import assert from "node:assert/strict"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

// These are source-guidance checks. They do not render a document, execute a
// converter, call an image model, or prove that a model follows the guidance.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const references = path.join(root, ".opencode/skills/files-and-documents/references")
const files = {
  common: path.join(references, "local-artifacts.md"),
  docx: path.join(references, "local-docx.md"),
  pdf: path.join(references, "local-pdf.md"),
  sheets: path.join(references, "local-spreadsheets.md"),
  prompting: path.join(root, ".opencode/skills/chatgpt-images/references/prompting.md"),
}
const read = (name) => readFile(files[name], "utf8")
const text = Object.fromEntries(await Promise.all(Object.keys(files).map(async (name) => [name, await read(name)])))
const all = Object.values(text).join("\n")
const flat = (value) => value.replace(/\s+/g, " ")
const has = (body, phrase) => flat(body).includes(phrase)

function linkTargets(markdown) {
  const targets = []
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().split(/\s+/, 1)[0]
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1)
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue
    targets.push(decodeURIComponent(target.split(/[?#]/, 1)[0]))
  }
  return targets
}

async function brokenLinks(markdown, baseDirectory) {
  const broken = []
  for (const target of linkTargets(markdown)) {
    try {
      await stat(path.resolve(baseDirectory, target))
    } catch {
      broken.push(target)
    }
  }
  return broken
}

const directUnsafePatterns = [
  [/\bunzip\b[^\n]*\s-o\b/, "unzip overwrite flag"],
  [/\bextractall\s*\(/, "unbounded archive extraction"],
  [/\bresolve_entities\s*=\s*True\b/, "external entity resolution enabled"],
  [/\bload_dtd\s*=\s*True\b/, "DTD loading enabled"],
  [/\bno_network\s*=\s*False\b/, "parser network access enabled"],
  [/\b(?:pip3?|npm|apt(?:-get)?)\s+install\b/, "unapproved package installation"],
  [/(?:-upw|-opw|--password)\s+\S/, "password on a command line"],
]

function unsafeExamples(markdown) {
  return directUnsafePatterns.filter(([pattern]) => pattern.test(markdown)).map(([, label]) => label)
}

const semanticUnsafePatterns = [
  [/data_only\s*=\s*True(?![^\n]{0,100}(?:cached|cache|recalculat))/, "cached value treated as recalculation"],
  [/flatten\s*=\s*True(?![^\n]{0,100}explicit)/, "implicit form flattening"],
]

function semanticUnsafeExamples(markdown) {
  return semanticUnsafePatterns.filter(([pattern]) => pattern.test(markdown)).map(([, label]) => label)
}

test("local artifact references exist and stay source-guidance only", async () => {
  for (const [name, file] of Object.entries(files)) {
    const body = text[name]
    assert.ok(body.length > 500, `${file} has substantive guidance`)
    assert.match(body, /## (?:Sources and limits|Limits)/, `${file} records sources or limits`)
    assert.match(body, /not (?:executed|performed|proof)|does not prove/i, `${file} separates guidance from acceptance`)
    assert.match(body, /^[\x00-\x7F]*$/, `${file} is ASCII`)
  }
  assert.doesNotMatch(all, /(?:\/home\/|\/Users\/|~\/|\/tmp\/)/, "no machine-specific paths")
})

test("common contract preserves sources and bounds untrusted containers", () => {
  const body = text.common
  for (const phrase of [
    "independently authored",
    "SHA-256",
    "Never save over the source",
    "rename it into place",
    "Zip Slip",
    "external entity",
    "DOCTYPE",
    "entry count",
    "compression ratio",
    "Refuse unsupported formats",
  ]) assert.ok(has(body, phrase), phrase)

  assert.match(body, /read-only request must not create, rewrite, export, or normalize/i)
  assert.ok(has(body, "If the destination already exists and is a different file, stop"), "destination conflict stops")
  assert.deepEqual(unsafeExamples(body), [])
})

test("DOCX guidance distinguishes guidance from an absent authoring prerequisite", () => {
  const body = text.docx
  for (const phrase of [
    "python-docx",
    "absent",
    "prerequisite",
    "Tracked insertions/deletions",
    "Macros (`vbaProject.bin`)",
    "external relationships",
    "reopen",
    "render every page",
    "Refuse rather than letting the writer drop",
  ]) assert.ok(has(body, phrase), phrase)

  assert.match(body, /\.docm/, "macro-enabled format is named")
  assert.ok(has(body, "no authoring snippet because the library is not installed"), "authoring snippet honesty")
  assert.ok(has(body, "Do not show a create/edit command as though it had been executed"), "authoring command honesty")
  assert.deepEqual(unsafeExamples(body), [])
})

test("PDF guidance checks canonical field values, widgets, and signature limits", () => {
  const body = text.pdf
  for (const phrase of [
    "/AcroForm",
    "/V",
    "/AP",
    "auto_regenerate=False",
    "Flattening is a separate, explicit request",
    "Digitally signed file",
    "/XFA",
    "Encrypted file",
    "pypdf",
    "absent",
  ]) assert.ok(has(body, phrase), phrase)

  assert.ok(has(body, "canonical field value `/V`"), "canonical value check")
  assert.ok(has(body, "every widget's appearance `/AP`"), "widget appearance check")
  assert.ok(has(body, "Do not put a password in a command argument"), "password handling")
  assert.deepEqual(unsafeExamples(body), [])
})

test("spreadsheet guidance separates formulas, caches, and recalculation", () => {
  const body = text.sheets
  for (const phrase of [
    "Formula preservation",
    "Cached value",
    "Recalculation",
    "Independent oracle",
    "data_only=True",
    "does not prove that the cache is current",
    "openpyxl",
    "absent",
    ".xls",
    ".xlsm",
    "shapes can be lost",
    "A CSV file holds one table",
  ]) assert.ok(has(body, phrase), phrase)

  assert.ok(has(body, "formula text is still stored as a formula"), "formula preservation")
  assert.ok(has(body, "recalculate only on a copy"), "copy-based recalculation")
  assert.ok(has(body, "no universal sanitization"), "CSV sanitization limit")
  for (const character of ["`=`", "`+`", "`-`", "`@`", "tab", "carriage return", "line feed"]) {
    assert.ok(has(body, character), `CSV injection character ${character}`)
  }
  assert.deepEqual(unsafeExamples(body), [])
})

test("image prompting matches the one-argument route and forbids invented controls", () => {
  const body = text.prompting
  for (const phrase of [
    "4,000 characters",
    "one `prompt`",
    "no other properties are accepted",
    "Do not send `size`, `quality`, `model`, `mask`, `image`, `reference`, `seed`",
    "Do not label them a `negative_prompt` parameter",
    "Re-display does not justify",
    "not executed generations",
    "independently authored",
  ]) assert.ok(has(body, phrase), phrase)

  assert.doesNotMatch(body, /OPENAI_API_KEY|--api-key|api_key\s*=/i)
  assert.deepEqual(unsafeExamples(body), [])
})

test("the image reference agrees with the active connector schema", async () => {
  const connector = await readFile(path.join(root, "tools/chatgpt-connector/src/mcp.ts"), "utf8")
  assert.match(connector, /const MAX_IMAGE_PROMPT_LENGTH = 4000/)
  assert.match(connector, /name: "generate_image"/)
  assert.match(connector, /maxLength: MAX_IMAGE_PROMPT_LENGTH/)
  assert.match(connector, /additionalProperties: false/)
  assert.match(text.prompting, /maximum 4,000 characters, with no additional properties/)
})

test("local reference links resolve and a broken link is detected", async () => {
  for (const [name, body] of Object.entries(text)) {
    assert.deepEqual(await brokenLinks(body, path.dirname(files[name])), [], `${name} local links resolve`)
  }
  assert.deepEqual(await brokenLinks("[missing](definitely-missing-reference.md)", references), [
    "definitely-missing-reference.md",
  ])
})

test("unsafe examples are rejected by the negative control scanner", () => {
  const unsafe = [
    "unzip -o archive.docx -d /shared",
    "zip.extractall(destination)",
    "XMLParser(resolve_entities=True, load_dtd=True, no_network=False)",
    "pip install python-docx",
    "pdfinfo -upw secret form.pdf",
    "wb = load_workbook(path, data_only=True); print(wb.active['A1'].value)",
    "writer.update_page_form_field_values(page, fields, flatten=True)",
  ].join("\n")
  const labels = [...unsafeExamples(unsafe), ...semanticUnsafeExamples(unsafe)]
  for (const label of [
    "unzip overwrite flag",
    "unbounded archive extraction",
    "external entity resolution enabled",
    "DTD loading enabled",
    "parser network access enabled",
    "unapproved package installation",
    "password on a command line",
    "cached value treated as recalculation",
    "implicit form flattening",
  ]) assert.ok(labels.includes(label), label)
})

test("hosted-product emulation and unverified installers stay out of scope", () => {
  assert.doesNotMatch(all, /Google Docs|Google Sheets|Google Drive|ChatGPT Pages|ChatGPT Spaces|ChatGPT Pets|ChatGPT Sites|Excel add-in|Office\.js/i)
  assert.doesNotMatch(all, /\b(?:curl|wget)\b/, "no network fetch example")
  assert.doesNotMatch(all, /automatically loaded/i, "references are not described as automatically loaded")
})

test("document entrypoints selectively route the shared contract and format references", async () => {
  const skill = await readFile(path.join(root, ".opencode/skills/files-and-documents/SKILL.md"), "utf8")
  const guide = await readFile(path.join(root, ".opencode/skills/files-and-documents/README.md"), "utf8")
  assert.ok(has(skill, "explicitly read"))
  assert.ok(has(skill, "not loaded automatically"))
  for (const name of ["local-artifacts", "local-docx", "local-pdf", "local-spreadsheets"]) {
    assert.ok(skill.includes(`references/${name}.md`), name)
    assert.ok(guide.includes(`references/${name}.md`), name)
  }
})

test("image prompting is optional routed guidance, not a new runtime or blanket rights prohibition", async () => {
  const skill = await readFile(path.join(root, ".opencode/skills/chatgpt-images/SKILL.md"), "utf8")
  const guide = await readFile(path.join(root, ".opencode/skills/chatgpt-images/README.md"), "utf8")
  for (const body of [skill, guide]) assert.ok(body.includes("references/prompting.md"))
  assert.ok(has(text.prompting, "consumer's actual tool schema"))
  assert.ok(has(text.prompting, "not a blanket prohibition"))
})

test("converter and relationship guidance fails closed instead of trusting profiles or a truncated grep", () => {
  const verify = (common, docx) => {
    for (const phrase of ["profile is not a sandbox", "untrusted documents", "fail closed", "consumer's actual environment"])
      assert.ok(has(common, phrase), phrase)
    assert.ok(has(docx, "A truncated prefix or grep result cannot establish absence"))
    assert.equal(docx.includes("head -c 200000"), false)
  }
  verify(text.common, text.docx)
  assert.throws(() => verify(text.common.replace("profile is not a sandbox", "omitted"), text.docx))
  assert.throws(() => verify(text.common, flat(text.docx).replace("A truncated prefix or grep result cannot establish absence", "omitted")))
})

test("CSV rendering declares a presentation import policy rather than silently changing number text", () => {
  const body = flat(text.sheets)
  const clauses = ["CSV carries no number-format metadata", "text import", "trailing zeros", "not a recalculation pass"]
  const verify = value => { for (const clause of clauses) assert.ok(value.includes(clause), clause) }
  verify(body)
  for (const clause of clauses) assert.throws(() => verify(body.replace(clause, "omitted")))
})

// The XML clauses below are wording contracts over the shared reference. They
// fail when the guidance loses a clause; they do not prove parser behavior.
const xmlDefaultClauses = [
  "In the one statically reviewed 0.7.1 source, the DTD prohibition defaulted to off while the entity and external reference prohibitions defaulted to on.",
  "set every required prohibition explicitly: DTD declarations, entity declarations and expansion, and external entity or DTD resolution",
  "An option the selected version does not support is a configuration failure, not a silent downgrade.",
  "This is not a claim that the newest release is the required or safest choice.",
]

const xmlRouteClauses = [
  "passing `parser=` to `parse` or `iterparse` bypasses every prohibition set by the factory",
  "Do not expose an unverified caller-supplied parser on an untrusted-input route.",
  "derive from `ValueError`, not only from the standard library `ParseError`",
  "never echo it unrestricted into a log, user interface, report, or filename",
  "Keep XInclude processing and schema fetching forbidden for untrusted documents",
  "XInclude processing and schema fetching are separate operations",
  "makes no guarantee about input bytes, node count, tree depth, wall-clock time, or the bundled parser version",
  "test the actual interpreter, Expat build, and parser version in use",
  "labels the cElementTree and lxml facade modules deprecated",
  "`defuse_stdlib` monkeypatch experimental and untested",
  "not parser execution, a hostile-input result on this host, or proof that any installed parser enforces them",
  "That release is not installed here",
]

function verifyClauses(body, clauses) {
  const value = flat(body)
  for (const clause of clauses) assert.ok(value.includes(clause), clause)
  for (const clause of clauses) assert.throws(() => {
    const mutated = value.replace(clause, "omitted")
    for (const required of clauses) assert.ok(mutated.includes(required), required)
  }, undefined, clause)
}

function withoutXmlSection(body) {
  const start = body.indexOf("## Harden XML parsing against a verified version, not a default")
  const end = body.indexOf("## Refuse unsupported formats and features")
  assert.ok(start > -1 && end > start, "XML section is delimited by its neighbours")
  return body.slice(0, start) + body.slice(end)
}

test("XML guidance qualifies parser defaults by version and demands explicit prohibitions", () => {
  assert.ok(has(text.common, "Parser hardening defaults are version-specific."))
  assert.ok(has(text.common, "verified and supported version"))
  verifyClauses(text.common, xmlDefaultClauses)
  const before = withoutXmlSection(text.common)
  assert.equal(before.includes("Harden XML parsing"), false)
  assert.throws(() => verifyClauses(before, xmlDefaultClauses))
})

test("XML guidance refuses unverified parsers, bounds exceptions, and separates XInclude and resources", () => {
  verifyClauses(text.common, xmlRouteClauses)
  assert.ok(has(text.common, "Catch the verified exception base for the pinned version"), "exception base is pinned")
  assert.ok(has(text.common, "Truncate and label it as untrusted"), "exception text is bounded")
  assert.ok(has(text.common, "A hardened wrapper is not a resource sandbox."), "wrapper is not a sandbox")
  const before = withoutXmlSection(text.common)
  assert.equal(before.includes("Harden XML parsing"), false)
  assert.throws(() => verifyClauses(before, xmlRouteClauses))
})

test("XML parser policy stays in the shared contract instead of the format references", async () => {
  const heading = "## Harden XML parsing against a verified version, not a default"
  assert.ok(text.common.includes(heading), "shared contract owns the XML parser section")
  for (const name of ["docx", "pdf", "sheets"]) {
    assert.doesNotMatch(text[name], /forbid_dtd|defuse_stdlib|parser=/, `${name} defers parser policy to the shared contract`)
  }
  const skill = await readFile(path.join(root, ".opencode/skills/files-and-documents/SKILL.md"), "utf8")
  assert.ok(skill.includes("references/local-artifacts.md"), "entrypoint routes the shared XML contract")
})
