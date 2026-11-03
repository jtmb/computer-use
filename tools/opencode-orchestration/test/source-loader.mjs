import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const source = process.env.OPENCODE_NATIVE_SOURCE
if (!source || !path.isAbsolute(source)) throw new Error("OPENCODE_NATIVE_SOURCE must select the exact native checkout")
const require = createRequire(new URL("../../session-coordination/package.json", import.meta.url))
const typescript = require("typescript")
const babel = require("@babel/core")
const preset = require.resolve("babel-preset-solid")
const root = pathToFileURL(source + "/").href
const host = new URL("./host.jsx", import.meta.url).href
const injected = new Set([
  "packages/tui/src/context/theme.tsx", "packages/tui/src/context/client.tsx",
  "packages/tui/src/context/keymap.tsx", "packages/tui/src/ui/dialog.tsx",
  "packages/tui/src/ui/dialog-select.tsx", "packages/tui/src/ui/toast.tsx",
  "packages/tui/src/config/index.tsx",
])
// Real-menu mode keeps the production DialogSelect module and substitutes only its
// layout/config/theme collaborators, so its own option, selection and submit logic runs.
const realDialog = () => process.env.OPENCODE_REAL_DIALOG === "1"

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@opentui/core/testing") return { url: pathToFileURL(path.join(path.dirname(require.resolve("@opentui/core")), "testing.js")).href, shortCircuit: true }
  if (specifier === "@opentui/core-linux-x64") return { url: pathToFileURL(path.join(path.dirname(require.resolve("@opentui/core")), "../core-linux-x64/index.js")).href, shortCircuit: true }
  if (specifier === "solid-js") return { url: pathToFileURL(require.resolve("solid-js/dist/solid.js")).href, shortCircuit: true }
  if (specifier === "solid-js/store") return { url: pathToFileURL(require.resolve("solid-js/store/dist/store.js")).href, shortCircuit: true }
  if (specifier === "#string-width") return { url: pathToFileURL(path.join(source, "packages/tui/src/util/string-width.node.ts")).href, shortCircuit: true }
  if (specifier.startsWith(".") && context.parentURL?.startsWith(root)) {
    const base = new URL(specifier, context.parentURL)
    for (const extension of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const url = base.href + extension
      try {
        await readFile(new URL(url))
        const relative = path.relative(source, fileURLToPath(url)).split(path.sep).join("/")
        // Config is only replaced while the real dialog is loaded; every other mode
        // leaves the module graph exactly as it was.
        const config = relative === "packages/tui/src/config/index.tsx"
        const useHost = injected.has(relative) &&
          !(realDialog() && relative === "packages/tui/src/ui/dialog-select.tsx") &&
          (!config || realDialog())
        return { url: useHost ? host : url, shortCircuit: true }
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error
      }
    }
  }
  if (specifier.startsWith("@opentui/") || ["string-width", "strip-ansi", "get-east-asian-width"].includes(specifier)) {
    return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

const tests = new URL("./", import.meta.url).href
export async function load(url, context, nextLoad) {
  if (url.startsWith(tests) && url.endsWith(".jsx")) {
    const code = babel.transformSync(await readFile(new URL(url), "utf8"), {
      filename: fileURLToPath(url), babelrc: false, configFile: false,
      presets: [[preset, { generate: "universal", moduleName: "@opentui/solid", hydratable: false }]],
    }).code
    return { format: "module", source: code, shortCircuit: true }
  }
  if (!url.startsWith(root) || !/\.tsx?$/.test(url)) return nextLoad(url, context)
  const input = await readFile(new URL(url), "utf8")
  const output = typescript.transpileModule(input, {
    fileName: fileURLToPath(url),
    reportDiagnostics: true,
    compilerOptions: { target: typescript.ScriptTarget.ESNext, module: typescript.ModuleKind.ESNext, jsx: typescript.JsxEmit.Preserve },
  })
  const errors = (output.diagnostics ?? []).filter(item => item.category === typescript.DiagnosticCategory.Error)
  if (errors.length) throw new Error(typescript.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: value => value, getCurrentDirectory: () => source, getNewLine: () => "\n",
  }))
  const code = url.endsWith(".tsx") ? babel.transformSync(output.outputText, {
    filename: fileURLToPath(url), babelrc: false, configFile: false,
    presets: [[preset, { generate: "universal", moduleName: "@opentui/solid", hydratable: false }]],
  }).code : output.outputText
  return { format: "module", source: code, shortCircuit: true }
}
