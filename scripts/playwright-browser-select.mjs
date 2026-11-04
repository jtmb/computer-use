#!/usr/bin/env node
// Pick a browser the Playwright MCP can actually launch.
//
// Preference order: the user's default browser when Playwright can drive it,
// then any other installed Chromium-family browser, then a bundled Playwright
// browser. System Firefox is deliberately never selected on its own: Playwright
// needs its own patched Firefox build, and asking for the system binary is the
// exact failure this script exists to prevent.
//
// Pure selection logic is exported for tests; the CLI gathers real facts.

import { accessSync, constants, readdirSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

export const OVERRIDE_VALUES = ["auto", "chrome", "msedge", "brave", "chromium", "firefox", "webkit"]
export const SUPPORTED_LABEL = "chrome, msedge, brave, chromium, firefox, webkit"

const DESKTOP_PATTERNS = [
  [/^google-chrome(-stable|-beta|-unstable|-dev)?\.desktop$/i, "chrome"],
  [/^chromium(-browser)?\.desktop$/i, "chromium"],
  [/^brave-browser(-beta|-nightly)?\.desktop$/i, "brave"],
  [/^microsoft-edge(-stable|-beta|-dev)?\.desktop$/i, "msedge"],
  [/^(firefox|firefox-esr|firefox_firefox)\.desktop$/i, "firefox"],
  [/^safari\.desktop$/i, "safari"],
  [/^(epiphany|org\.gnome\.Epiphany)\.desktop$/i, "epiphany"],
]

export function desktopKind(entry) {
  if (typeof entry !== "string") return null
  const name = basename(entry.trim())
  for (const [pattern, kind] of DESKTOP_PATTERNS) if (pattern.test(name)) return kind
  return null
}

export class BrowserSelectionError extends Error {}

function isExecutable(file) {
  try {
    return statSync(file).isFile() && (accessSync(file, constants.X_OK), true)
  } catch {
    return false
  }
}

export function findOnPath(names, pathValue = process.env.PATH ?? "") {
  const directories = pathValue.split(":").filter(Boolean)
  for (const name of names) {
    for (const directory of directories) {
      const candidate = join(directory, name)
      if (isExecutable(candidate)) return candidate
    }
  }
  return null
}

const PROBES = {
  chrome: {
    names: ["google-chrome", "google-chrome-stable", "google-chrome-beta"],
    absolute: ["/opt/google/chrome/chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  },
  msedge: {
    names: ["microsoft-edge", "microsoft-edge-stable", "microsoft-edge-beta"],
    absolute: ["/opt/microsoft/msedge/msedge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  },
  brave: {
    names: ["brave-browser", "brave"],
    absolute: ["/opt/brave.com/brave/brave-browser", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
  },
  chromium: {
    names: ["chromium", "chromium-browser"],
    absolute: ["/snap/bin/chromium", "/usr/lib/chromium/chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  },
  firefoxSystem: {
    names: ["firefox", "firefox-esr"],
    absolute: [],
  },
}

export function findInstalled({ pathValue = process.env.PATH ?? "" } = {}) {
  const installed = {}
  for (const [key, probe] of Object.entries(PROBES)) {
    let found = findOnPath(probe.names, pathValue)
    for (const absolute of probe.absolute) {
      if (found) break
      if (isExecutable(absolute)) found = absolute
    }
    if (found) installed[key] = found
  }
  return installed
}

export function findBundled(browsersPath) {
  const bundled = { chromium: null, firefox: null, webkit: null }
  if (typeof browsersPath !== "string" || browsersPath.length === 0) return bundled
  let entries
  try {
    entries = readdirSync(browsersPath)
  } catch {
    return bundled
  }
  const newest = (pattern) => entries.filter((name) => pattern.test(name)).sort().reverse()

  for (const directory of newest(/^chromium-\d+$/)) {
    for (const layout of ["chrome-linux64", "chrome-linux"]) {
      const candidate = join(browsersPath, directory, layout, "chrome")
      if (isExecutable(candidate)) {
        bundled.chromium = candidate
        break
      }
    }
    if (bundled.chromium) break
  }
  for (const directory of newest(/^firefox-\d+$/)) {
    const candidate = join(browsersPath, directory, "firefox", "firefox")
    if (isExecutable(candidate)) {
      bundled.firefox = candidate
      break
    }
  }
  for (const directory of newest(/^webkit-\d+$/)) {
    const candidate = join(browsersPath, directory, "pw_run.sh")
    if (isExecutable(candidate)) {
      bundled.webkit = candidate
      break
    }
  }
  return bundled
}

export function readDefaultDesktop({ run = defaultRun } = {}) {
  const probes = [
    ["xdg-settings", ["get", "default-web-browser"]],
    ["gio", ["mime", "x-scheme-handler/https"]],
    ["gio", ["mime", "x-scheme-handler/http"]],
  ]
  for (const [command, args] of probes) {
    try {
      const output = run(command, args)
      const match = /[A-Za-z0-9_.-]+\.desktop/.exec(output)
      if (match) return match[0]
    } catch {
      // Try the next probe; a missing tool is not an error here.
    }
  }
  return null
}

function defaultRun(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 })
}

function candidateFor(kind, installed, bundled, reasons) {
  switch (kind) {
    case "chrome":
      if (installed.chrome) {
        return { engine: "chrome", args: ["--browser", "chrome"], profileKey: "chrome", executablePath: null }
      }
      reasons.push("Google Chrome is not installed")
      return null
    case "msedge":
      if (installed.msedge) {
        return { engine: "msedge", args: ["--browser", "msedge"], profileKey: "msedge", executablePath: null }
      }
      reasons.push("Microsoft Edge is not installed")
      return null
    case "brave":
      if (installed.brave) {
        return {
          engine: "chromium",
          args: ["--executable-path", installed.brave],
          profileKey: "brave",
          executablePath: installed.brave,
        }
      }
      reasons.push("Brave is not installed")
      return null
    case "chromium":
      if (installed.chromium) {
        return {
          engine: "chromium",
          args: ["--executable-path", installed.chromium],
          profileKey: "chromium",
          executablePath: installed.chromium,
        }
      }
      if (bundled.chromium) {
        return { engine: "chromium", args: [], profileKey: "chromium", executablePath: bundled.chromium }
      }
      reasons.push("Chromium is not installed and Playwright has no bundled Chromium")
      return null
    case "firefox":
      if (bundled.firefox) {
        return { engine: "firefox", args: ["--browser", "firefox"], profileKey: "firefox", executablePath: bundled.firefox }
      }
      reasons.push(
        "Playwright's Firefox build is not installed; a system Firefox cannot be driven by Playwright",
      )
      return null
    case "webkit":
      if (bundled.webkit) {
        return { engine: "webkit", args: ["--browser", "webkit"], profileKey: "webkit", executablePath: bundled.webkit }
      }
      reasons.push("Playwright's WebKit build is not installed")
      return null
    case "safari":
      if (bundled.webkit) {
        reasons.push("Safari itself cannot be automated by Playwright; using its WebKit engine instead")
        return { engine: "webkit", args: ["--browser", "webkit"], profileKey: "webkit", executablePath: bundled.webkit }
      }
      reasons.push("Safari cannot be automated by Playwright and its WebKit engine is not installed")
      return null
    case "epiphany":
      reasons.push("GNOME Web (Epiphany) is not drivable by Playwright")
      return null
    default:
      return null
  }
}

export function chooseBrowser({ defaultEntry = null, installed = {}, bundled = {}, override = null } = {}) {
  const reasons = []
  const defaultKind = desktopKind(defaultEntry)

  if (override && override !== "auto") {
    if (!OVERRIDE_VALUES.includes(override)) {
      throw new BrowserSelectionError(
        `Unknown browser override "${override}". Choose one of: ${OVERRIDE_VALUES.join(", ")}.`,
      )
    }
    const candidate = candidateFor(override, installed, bundled, reasons)
    if (!candidate) {
      throw new BrowserSelectionError(
        `The requested browser "${override}" cannot be launched. ${reasons.join("; ")}.`,
      )
    }
    return { ...candidate, source: `explicit override (${override})`, reasons }
  }

  const order = []
  if (defaultKind) order.push(defaultKind)
  for (const kind of ["chrome", "msedge", "brave", "chromium", "firefox", "webkit"]) {
    if (!order.includes(kind)) order.push(kind)
  }

  for (const kind of order) {
    const candidate = candidateFor(kind, installed, bundled, reasons)
    if (!candidate) continue
    const source = kind === defaultKind ? `default browser (${defaultEntry})` : `installed (${kind})`
    return { ...candidate, source, reasons }
  }

  throw new BrowserSelectionError(
    `No Playwright-drivable browser found. Checked: ${SUPPORTED_LABEL}. ${reasons.join("; ")}. ` +
      "Install Google Chrome, or run: npx playwright install chromium",
  )
}

function gather({ override = null } = {}) {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? "", ".cache", "ms-playwright")
  return {
    defaultEntry: readDefaultDesktop(),
    installed: findInstalled(),
    bundled: findBundled(browsersPath),
    override,
  }
}

function main(argv) {
  const json = argv.includes("--json")
  const tokens = argv.includes("--tokens")
  const apply = argv.includes("--apply")
  const override = process.env.PLAYWRIGHT_MCP_BROWSER ?? null
  let selection
  try {
    selection = chooseBrowser(gather({ override }))
  } catch (error) {
    if (error instanceof BrowserSelectionError) {
      console.error(`playwright-browser-select: ${error.message}`)
      process.exit(1)
    }
    throw error
  }
  if (apply) {
    const restart = join(dirname(fileURLToPath(import.meta.url)), "restart-playwright-mcp.sh")
    const result = spawnSync(restart, ["--directory", process.cwd()], { stdio: "inherit" })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  if (tokens) {
    process.stdout.write(`profile=${selection.profileKey}\n`)
    for (const token of selection.args) process.stdout.write(`${token}\n`)
    return
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(selection, null, 2)}\n`)
    return
  }
  const lines = [
    `engine: ${selection.engine}`,
    `source: ${selection.source}`,
    `executable: ${selection.executablePath ?? "(Playwright default)"}`,
    `profile: ${selection.profileKey}`,
  ]
  if (selection.reasons.length) lines.push(`skipped: ${selection.reasons.join("; ")}`)
  process.stdout.write(`${lines.join("\n")}\n`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
}
