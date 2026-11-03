import { createHash } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { execFileSync } from "node:child_process"

export const pin = "ba546ec1598a70db2570e9c6258028d955ba8f58"
export const patchHash = "2825d876035054ee46f71f7d9c6815918bad32569242832e31174325633f86fe"
const patch = resolve(dirname(fileURLToPath(import.meta.url)), "native-row.patch")
const files = [
  "packages/tui/src/routes/session/composer/subagent-row.ts",
  "packages/tui/src/routes/session/composer/subagents-tab.tsx",
  "packages/tui/test/subagent-row.test.ts",
  "packages/tui/test/subagent-row.view.test.tsx",
]

export function patchPaths(content) {
  const paths = [...content.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((match) => {
    if (match[1] !== match[2]) throw new Error("Renames are outside this preview's scope")
    return match[1]
  })
  if (JSON.stringify(paths.toSorted()) !== JSON.stringify(files)) throw new Error("Unexpected patch file scope")
  return paths
}

export function preview(checkout, patchFile = patch) {
  if (!checkout || !isAbsolute(checkout)) throw new Error("Select an absolute source checkout path explicitly")
  const root = realpathSync(checkout)
  const git = (...args) =>
    execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  if (realpathSync(git("rev-parse", "--show-toplevel")) !== root)
    throw new Error("Select the checkout root, not a subdirectory")
  if (git("rev-parse", "HEAD") !== pin) throw new Error(`Checkout must be pinned to ${pin}`)
  if (
    ![
      "https://github.com/anomalyco/opencode.git",
      "https://github.com/anomalyco/opencode",
      "git@github.com:anomalyco/opencode.git",
    ].includes(git("remote", "get-url", "origin"))
  )
    throw new Error("Checkout origin is not the selected official anomalyco/opencode repository")
  if (git("status", "--porcelain", "--untracked-files=normal"))
    throw new Error("Checkout must be clean; preserve and review existing work separately")
  const bytes = readFileSync(patchFile)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (sha256 !== patchHash) throw new Error("Patch SHA-256 does not match the reviewed artifact")
  const paths = patchPaths(bytes.toString("utf8"))
  git("apply", "--check", "--whitespace=error-all", "--", realpathSync(patchFile))
  return {
    checkout: root,
    pin,
    sha256,
    files: paths,
    readOnly: true,
    result: "git apply --check passed; nothing applied",
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--checkout")
      throw new Error("Usage: node preview.mjs --checkout /absolute/pinned/source/checkout")
    console.log(JSON.stringify(preview(process.argv[3]), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
