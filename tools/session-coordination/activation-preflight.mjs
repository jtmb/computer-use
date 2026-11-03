import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CheckError, assertNoSymlinkPath, hashTree, readBoundedFile, resolveDependencyBundle } from "./strict-check.mjs"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DEPENDENCY_PACKAGE = "tools/session-coordination/package.json"
const EXPECTED_EXPORTS = { ".": "./index.ts", "./tui": "./tui.ts" }
const RETIREMENT = "the custom agent inbox/mailbox feature is retired; activation is refused and no plugins entry is proposed"
const MAX_CONFIG_BYTES = 2 * 1024 * 1024

function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function record(checks, name, passed, detail) {
  checks.push({ name, status: passed ? "pass" : "fail", detail })
  return passed
}

function readRegular(filePath, label, maxBytes = MAX_CONFIG_BYTES) {
  return readBoundedFile(filePath, label, maxBytes)
}

function removeJsonComments(text) {
  let output = ""
  let quote = false
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (lineComment) {
      if (character === "\n" || character === "\r") {
        lineComment = false
        output += character
      } else output += " "
      continue
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        output += "  "
        index += 1
        blockComment = false
      } else output += character === "\n" || character === "\r" ? character : " "
      continue
    }
    if (quote) {
      output += character
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quote = false
      continue
    }
    if (character === '"') {
      quote = true
      output += character
    } else if (character === "/" && next === "/") {
      output += "  "
      index += 1
      lineComment = true
    } else if (character === "/" && next === "*") {
      output += "  "
      index += 1
      blockComment = true
    } else output += character
  }
  if (blockComment) throw new CheckError("selected OpenCode config has an unterminated block comment")
  if (quote) throw new CheckError("selected OpenCode config has an unterminated string")
  return output
}

function removeTrailingCommas(text) {
  let output = ""
  let quote = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quote) {
      output += character
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quote = false
      continue
    }
    if (character === '"') {
      quote = true
      output += character
      continue
    }
    if (character === ",") {
      let following = index + 1
      while (/\s/.test(text[following] ?? "")) following += 1
      if (text[following] === "]" || text[following] === "}") continue
    }
    output += character
  }
  return output
}

export function parseOpenCodeConfig(text) {
  try {
    return JSON.parse(removeTrailingCommas(removeJsonComments(text)))
  } catch (error) {
    if (error instanceof CheckError) throw error
    throw new CheckError(`selected OpenCode config is malformed: ${error.message}`)
  }
}

function findConfigPath(root, selectedPath) {
  const absolute = path.resolve(root, selectedPath)
  const allowed = new Set([
    path.join(root, "opencode.json"),
    path.join(root, "opencode.jsonc"),
    path.join(root, ".opencode", "opencode.json"),
    path.join(root, ".opencode", "opencode.jsonc"),
  ])
  if (!allowed.has(absolute)) throw new CheckError("config must be an explicitly selected project opencode.json(c) at the worktree root or .opencode/")
  assertNoSymlinkPath(absolute, root, "selected OpenCode config")
  return absolute
}

function validateSource(root, checks) {
  const packageDirectory = path.join(root, "tools", "session-coordination")
  if (path.resolve(SCRIPT_DIRECTORY) !== packageDirectory || fs.realpathSync(SCRIPT_DIRECTORY) !== packageDirectory) {
    throw new CheckError("preflight source must be tools/session-coordination in the selected canonical worktree")
  }
  const packageJsonPath = path.join(packageDirectory, "package.json")
  assertNoSymlinkPath(packageJsonPath, root, "coordination package manifest")
  const packageJson = JSON.parse(readRegular(packageJsonPath, "coordination package manifest").toString("utf8"))
  let exportsValid = true
  const exportFiles = []
  for (const [key, expectedFile] of Object.entries(EXPECTED_EXPORTS)) {
    if (packageJson.exports?.[key] !== expectedFile) {
      exportsValid = false
      continue
    }
    const exportedPath = path.join(packageDirectory, expectedFile)
    assertNoSymlinkPath(exportedPath, root, `coordination ${key} export`)
    const info = fs.lstatSync(exportedPath)
    if (info.isSymbolicLink() || !info.isFile()) exportsValid = false
    else exportFiles.push(expectedFile)
  }
  if (packageJson.private !== true || packageJson.type !== "module") exportsValid = false
  const tree = hashTree(packageDirectory, { ignoredTopLevel: ["node_modules", "local-state"], maxFiles: 10000, maxBytes: 64 * 1024 * 1024 })
  record(checks, "source-identity", true, { packageDirectory, sha256: tree.sha256, files: tree.files, bytes: tree.bytes })
  record(checks, "server-tui-exports", exportsValid, exportsValid ? exportFiles : "package exports or source files do not match the required retired server/TUI entries")
  return { packageDirectory, packageJson, sourceSha256: tree.sha256, sourceFiles: tree.files, exportsValid }
}

function validateDependencyBundle(root, source, dependencyPackagePath, checks) {
  try {
    const bundle = resolveDependencyBundle({ repoRoot: root, packageDirectory: source.packageDirectory, dependencyPackage: dependencyPackagePath })
    record(checks, "pinned-native-sdk-and-compiler", true, {
      dependencyPackage: bundle.dependencyManifestPath,
      typescript: bundle.compiler.version,
      nodeTypes: bundle.nodeTypes.version,
      pluginSdk: bundle.sdk.version,
      lockIntegrity: "verified for exact in-worktree lock entries",
    })
    return bundle
  } catch (error) {
    record(checks, "pinned-native-sdk-and-compiler", false, error.message)
    return null
  }
}

function parseNodeVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value)
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null
}

function executableOnPath(name, searchPath = process.env.PATH ?? "") {
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) continue
    const candidate = path.resolve(directory, name)
    try {
      const info = fs.statSync(candidate)
      if (info.isFile() && (info.mode & 0o111) !== 0) return candidate
    } catch {}
  }
  return null
}

function validateNativeTools(checks, env = process.env, platform = process.platform, nodeVersion = process.version) {
  const version = parseNodeVersion(nodeVersion)
  const nodeOk = platform === "linux" && version !== null && (version.major > 22 || (version.major === 22 && version.minor >= 6))
  record(checks, "linux-node-runtime", nodeOk, nodeOk ? `Linux Node.js ${nodeVersion}` : `requires Linux and Node.js 22.6 or newer; found ${platform} ${nodeVersion}`)
  let flockPath = null
  try {
    const info = fs.lstatSync("/usr/bin/flock")
    if (info.isFile() && !info.isSymbolicLink() && (info.mode & 0o111) !== 0) flockPath = "/usr/bin/flock"
  } catch {}
  record(checks, "flock", flockPath !== null, flockPath ?? "required executable /usr/bin/flock is unavailable")
  const opencodePath = executableOnPath("opencode", env.PATH)
  record(checks, "opencode-cli-available", opencodePath !== null, opencodePath ?? "OpenCode CLI was not found on PATH; no version or service probe was run")
  return { nodeOk, flockPath, opencodePath }
}

function validateStateDirectory(root, source, selectedStatePath, checks) {
  const legacyPath = path.join(source.packageDirectory, "local-state")
  const rootPath = path.join(root, ".session-coordination")
  const expectedPath = path.resolve(selectedStatePath)
  if (!path.isAbsolute(selectedStatePath) || ![legacyPath, rootPath].includes(expectedPath)) {
    record(checks, "private-state-path", false, `must explicitly select ${rootPath} or ${legacyPath}`)
    return { valid: false, directory: expectedPath, exists: false }
  }
  try {
    assertNoSymlinkPath(expectedPath, root, "private state directory", true)
    // Mirror Store.inspect: a private leaf does not make writable ancestors safe.
    let current = root
    for (const part of path.relative(root, expectedPath).split(path.sep)) {
      current = path.join(current, part)
      let ancestor
      try { ancestor = fs.lstatSync(current) }
      catch (error) { if (error.code === "ENOENT") break; throw error }
      if (ancestor.isSymbolicLink() || !ancestor.isDirectory() || ancestor.uid !== process.getuid() || (ancestor.mode & 0o022))
        throw new CheckError(`unsafe coordination ancestor: ${current}; permissions were not changed`)
    }
    const ignorePath = path.join(expectedPath === rootPath ? root : source.packageDirectory, ".gitignore")
    const ignoreRule = expectedPath === rootPath ? "/.session-coordination/" : "/local-state/"
    assertNoSymlinkPath(ignorePath, root, "coordination package ignore rules")
    const ignoreText = readRegular(ignorePath, "coordination package ignore rules", 64 * 1024).toString("utf8")
    if (!ignoreText.split(/\r?\n/).includes(ignoreRule)) throw new CheckError(`selected .gitignore does not exclude ${ignoreRule}`)
    let info
    try {
      info = fs.lstatSync(expectedPath)
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    if (!info) {
      record(checks, "private-state-path", true, { path: expectedPath, exists: false, createdOrChanged: false })
      return { valid: true, directory: expectedPath, exists: false }
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new CheckError("existing local-state path must be a real directory")
    if (info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new CheckError("existing local-state directory must be current-user-owned and private")
    record(checks, "private-state-path", true, { path: expectedPath, exists: true, owner: info.uid, mode: (info.mode & 0o777).toString(8), createdOrChanged: false })
    return { valid: true, directory: expectedPath, exists: true }
  } catch (error) {
    record(checks, "private-state-path", false, error.message)
    return { valid: false, directory: expectedPath, exists: false }
  }
}

function pluginPackage(entry) {
  if (typeof entry === "string") return entry
  if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.package === "string") return entry.package
  return null
}

function isSelectedLocalPackage(value, configPath, packageDirectory) {
  if (typeof value !== "string") return false
  if (path.isAbsolute(value)) return path.resolve(value) === packageDirectory
  if (value.startsWith("file:")) {
    try {
      return path.resolve(fileURLToPath(value)) === packageDirectory
    } catch {
      return false
    }
  }
  return path.resolve(path.dirname(configPath), value) === packageDirectory
}

function configPreview(root, packageDirectory, configPath, stateDirectory, checks) {
  const bytes = readRegular(configPath, "selected OpenCode config")
  const raw = bytes.toString("utf8")
  const document = parseOpenCodeConfig(raw)
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new CheckError("selected OpenCode config must contain a top-level object")
  if (document.plugins !== undefined && !Array.isArray(document.plugins)) throw new CheckError("selected config plugins field must be an array")
  const plugins = document.plugins ?? []
  for (const entry of plugins) {
    if (pluginPackage(entry) === null) throw new CheckError("selected config contains a malformed plugin entry")
  }
  const matches = []
  for (let index = 0; index < plugins.length; index += 1) {
    const packageName = pluginPackage(plugins[index])
    if (isSelectedLocalPackage(packageName, configPath, packageDirectory)) matches.push({ index, entry: plugins[index] })
  }
  const beforeHash = sha256(JSON.stringify(plugins))
  const topLevelKeys = Object.keys(document).filter(key => key !== "plugins").sort()
  const common = {
    writesPerformed: false,
    selectedConfigSha256: sha256(bytes),
    format: configPath.endsWith(".jsonc") || /(^|\n)\s*\/[/ *]/.test(raw) ? "JSONC" : "JSON",
    selectedConfigEntry: matches.length ? "present" : "absent",
    selectedConfigEntryCount: matches.length,
    liveRegistration: "not checked",
    scope: "selected project config file only; other OpenCode config layers were not inspected",
    preservedTopLevelKeys: topLevelKeys,
    existingPluginCount: plugins.length,
    existingPluginsSha256: beforeHash,
  }
  if (matches.length) {
    record(checks, "selected-config-preview", false, `the retired coordination package is still referenced by ${matches.length} entries; remove only those exact entries and preserve unrelated config`)
    return { ...common, stateDirectory, proposal: null, rollback: null, retirement: RETIREMENT }
  }
  record(checks, "selected-config-preview", true, `read-only inspection; ${RETIREMENT}`)
  return { ...common, stateDirectory, proposal: null, rollback: null, retirement: RETIREMENT }
}

function parseArgs(argv) {
  const options = { root: null, config: null, stateDirectory: null, dependencyPackage: DEFAULT_DEPENDENCY_PACKAGE, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") options.help = true
    else if (["--root", "--config", "--state-directory", "--dependency-package"].includes(argument)) {
      const value = argv[++index]
      if (!value || value.startsWith("--")) throw new CheckError(`${argument} requires a path`)
      const key = { "--root": "root", "--config": "config", "--state-directory": "stateDirectory", "--dependency-package": "dependencyPackage" }[argument]
      options[key] = value
    } else throw new CheckError(`unknown option: ${argument}`)
  }
  if (!options.help && (!options.root || !options.config || !options.stateDirectory)) {
    throw new CheckError("--root, --config, and --state-directory must all be selected explicitly")
  }
  return options
}

export function helpText() {
  return [
    "Usage: node activation-preflight.mjs --root <canonical-worktree> --config <project-opencode.json(c)> --state-directory <absolute-local-state> [--dependency-package <in-worktree-package.json>]",
    "",
    "This command is read-only and always refuses activation: the inbox/mailbox feature is retired and no plugins entry is proposed. It reports source/prerequisite checks, whether the retired entry is still referenced, and whether historical state remains private.",
    "Dependency validation uses tools/session-coordination/package.json by default; --dependency-package selects an alternate in-worktree package.",
    "Live registration is not queried.",
  ].join("\n")
}

function selectedGitRoot(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch (error) {
    throw new CheckError(`cannot identify selected worktree root with git rev-parse: ${error.message}`)
  }
}

export function buildPreflight({ root: requestedRoot, config: requestedConfig, stateDirectory, dependencyPackage = DEFAULT_DEPENDENCY_PACKAGE, env = process.env, platform = process.platform, nodeVersion = process.version, gitTopLevel }) {
  const checks = []
  const requestedAbsolute = path.resolve(requestedRoot)
  const root = fs.realpathSync(requestedAbsolute)
  if (requestedAbsolute !== root) throw new CheckError("selected worktree root must be canonical and must not traverse a symbolic link")
  const selectedGit = path.resolve(gitTopLevel)
  if (selectedGit !== root) throw new CheckError(`selected root does not match git rev-parse --show-toplevel: ${selectedGit}`)
  if (path.resolve(SCRIPT_DIRECTORY) !== path.join(root, "tools", "session-coordination")) {
    throw new CheckError("preflight source must be tools/session-coordination in the selected canonical worktree")
  }
  record(checks, "canonical-worktree", true, { path: root, gitTopLevel: selectedGit })

  const source = validateSource(root, checks)
  const dependencyPath = path.resolve(root, dependencyPackage)
  validateDependencyBundle(root, source, dependencyPath, checks)
  const tools = validateNativeTools(checks, env, platform, nodeVersion)
  const state = validateStateDirectory(root, source, stateDirectory, checks)

  const configPath = findConfigPath(root, requestedConfig)
  assertNoSymlinkPath(configPath, root, "selected OpenCode config")
  let config = null
  if (state.valid) config = configPreview(root, source.packageDirectory, configPath, state.directory, checks)
  else record(checks, "selected-config-preview", false, "not generated because the explicitly selected state path is unsafe or incorrect")

  const sourceChecks = ["source-identity", "server-tui-exports", "pinned-native-sdk-and-compiler"]
  const sourceReady = sourceChecks.every(name => checks.some(check => check.name === name && check.status === "pass"))
  return {
    sourceReadiness: sourceReady ? "ready-source" : "blocked",
    activationPreflight: "blocked",
    retirement: { status: "retired", activation: "refused", detail: RETIREMENT },
    selectedConfigEntry: config?.selectedConfigEntry ?? "not inspected",
    liveRegistration: "not checked",
    strictTypecheck: "not run by this read-only activation preflight; run strict-check.mjs separately",
    actionTaken: "none",
    checks,
    source: {
      root,
      packageDirectory: source.packageDirectory,
      sha256: source.sourceSha256,
      exports: source.exportsValid ? EXPECTED_EXPORTS : null,
    },
    nativeTools: tools,
    stateDirectory: { path: state.directory, exists: state.exists, createdOrChanged: false },
    config: config ? { path: configPath, ...config } : { path: configPath, preview: "not generated" },
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      process.stdout.write(`${helpText()}\n`)
      return 0
    }
    if (!path.isAbsolute(options.root)) throw new CheckError("--root must be an absolute canonical worktree path")
    if (!path.isAbsolute(options.stateDirectory)) throw new CheckError("--state-directory must be an explicit absolute path")
    const root = path.resolve(options.root)
    const gitTopLevel = selectedGitRoot(root)
    const result = buildPreflight({
      root,
      config: options.config,
      stateDirectory: options.stateDirectory,
      dependencyPackage: options.dependencyPackage,
      gitTopLevel,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return result.activationPreflight === "preview-ready" ? 0 : 2
  } catch (error) {
    const result = {
      sourceReadiness: "blocked",
      activationPreflight: "blocked",
      liveRegistration: "not checked",
      actionTaken: "none",
      errors: [error instanceof Error ? error.message : String(error)],
    }
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`)
    return 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
