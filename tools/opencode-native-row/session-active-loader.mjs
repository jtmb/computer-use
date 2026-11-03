import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve as resolvePath } from "node:path"
import { fileURLToPath } from "node:url"

const root = process.env.NATIVE_ROW_SOURCE_CHECKOUT
const overlay = process.env.NATIVE_ACTIVE_OVERLAY
const ts = createRequire(resolvePath(root, "packages/plugin/package.json"))("typescript")
const files = ["packages/core/src/plugin/host.ts", "packages/plugin/src/effect/session.ts",
  "packages/plugin/src/promise/adapter.ts", "packages/plugin/src/promise/session.ts"]
const replacements = new Map(files.map(file => [resolvePath(root, file), resolvePath(overlay, file)]))

export async function resolve(specifier, context, next) {
  try { return await next(specifier, context) }
  catch (error) {
    if (!specifier.endsWith(".js") || !context.parentURL?.startsWith("file:")) throw error
    const candidate = new URL(specifier.slice(0, -3) + ".ts", context.parentURL)
    if (!existsSync(fileURLToPath(candidate))) throw error
    return next(candidate.href, context)
  }
}
export async function load(url, context, next) {
  if (!url.startsWith("file:")) return next(url, context)
  const selected = replacements.get(resolvePath(fileURLToPath(url)))
  if (!selected) return next(url, context)
  const source = ts.transpileModule(readFileSync(selected, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return { format: "module", source, shortCircuit: true }
}
