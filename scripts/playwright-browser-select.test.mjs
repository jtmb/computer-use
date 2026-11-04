import { test } from "node:test"
import assert from "node:assert/strict"

import {
  BrowserSelectionError,
  desktopKind,
  readDefaultDesktop,
  chooseBrowser,
  SUPPORTED_LABEL,
} from "./playwright-browser-select.mjs"

const chrome = "/usr/bin/google-chrome"
const brave = "/usr/bin/brave-browser"
const chromium = "/usr/bin/chromium"
const edge = "/usr/bin/microsoft-edge"
const bundledChromium = "/home/u/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome"
const bundledFirefox = "/home/u/.cache/ms-playwright/firefox-1542/firefox/firefox"
const bundledWebkit = "/home/u/.cache/ms-playwright/webkit-2203/pw_run.sh"

test("desktopKind maps the common desktop entries", () => {
  assert.equal(desktopKind("google-chrome.desktop"), "chrome")
  assert.equal(desktopKind("google-chrome-stable.desktop"), "chrome")
  assert.equal(desktopKind("chromium.desktop"), "chromium")
  assert.equal(desktopKind("chromium-browser.desktop"), "chromium")
  assert.equal(desktopKind("brave-browser.desktop"), "brave")
  assert.equal(desktopKind("microsoft-edge.desktop"), "msedge")
  assert.equal(desktopKind("firefox.desktop"), "firefox")
  assert.equal(desktopKind("firefox_firefox.desktop"), "firefox")
  assert.equal(desktopKind("safari.desktop"), "safari")
  assert.equal(desktopKind("org.gnome.Epiphany.desktop"), "epiphany")
  assert.equal(desktopKind("some-editor.desktop"), null)
  assert.equal(desktopKind(null), null)
})

test("readDefaultDesktop parses xdg-settings and falls back to gio", () => {
  const xdg = readDefaultDesktop({ run: () => "google-chrome.desktop\n" })
  assert.equal(xdg, "google-chrome.desktop")

  const gioLine = 'Default application for “x-scheme-handler/https”: brave-browser.desktop\nRegistered applications:'
  const gio = readDefaultDesktop({
    run: (command) => {
      if (command === "xdg-settings") throw new Error("missing")
      return gioLine
    },
  })
  assert.equal(gio, "brave-browser.desktop")

  const none = readDefaultDesktop({
    run: () => {
      throw new Error("no tool")
    },
  })
  assert.equal(none, null)
})

test("the default browser wins when Playwright can drive it", () => {
  const selection = chooseBrowser({
    defaultEntry: "google-chrome.desktop",
    installed: { chrome, firefoxSystem: "/usr/bin/firefox" },
  })
  assert.equal(selection.engine, "chrome")
  assert.deepEqual(selection.args, ["--browser", "chrome"])
  assert.equal(selection.profileKey, "chrome")
  assert.match(selection.source, /default browser/)
})

test("default Firefox without Playwright's build falls back instead of failing", () => {
  const selection = chooseBrowser({
    defaultEntry: "firefox.desktop",
    installed: { chrome, firefoxSystem: "/usr/bin/firefox" },
    bundled: {},
  })
  assert.equal(selection.engine, "chrome")
  assert.ok(selection.reasons.some((reason) => /Firefox build is not installed/.test(reason)))
  assert.ok(!selection.args.includes("firefox"))
})

test("default Firefox uses the bundled build when it exists", () => {
  const selection = chooseBrowser({
    defaultEntry: "firefox.desktop",
    installed: { firefoxSystem: "/usr/bin/firefox" },
    bundled: { firefox: bundledFirefox },
  })
  assert.equal(selection.engine, "firefox")
  assert.deepEqual(selection.args, ["--browser", "firefox"])
  assert.equal(selection.executablePath, bundledFirefox)
})

test("Brave and system Chromium launch through an explicit executable path", () => {
  const braveSelection = chooseBrowser({ defaultEntry: "brave-browser.desktop", installed: { brave } })
  assert.equal(braveSelection.engine, "chromium")
  assert.deepEqual(braveSelection.args, ["--executable-path", brave])
  assert.equal(braveSelection.profileKey, "brave")

  const chromiumSelection = chooseBrowser({ defaultEntry: "chromium.desktop", installed: { chromium } })
  assert.equal(chromiumSelection.engine, "chromium")
  assert.deepEqual(chromiumSelection.args, ["--executable-path", chromium])
})

test("Microsoft Edge uses its supported channel", () => {
  const selection = chooseBrowser({ defaultEntry: "microsoft-edge.desktop", installed: { msedge: edge } })
  assert.equal(selection.engine, "msedge")
  assert.deepEqual(selection.args, ["--browser", "msedge"])
})

test("with no default, bundled Chromium is used without extra flags", () => {
  const selection = chooseBrowser({ defaultEntry: null, installed: {}, bundled: { chromium: bundledChromium } })
  assert.equal(selection.engine, "chromium")
  assert.deepEqual(selection.args, [])
  assert.equal(selection.executablePath, bundledChromium)
})

test("Safari cannot be automated and maps to bundled WebKit with a reason", () => {
  const selection = chooseBrowser({
    defaultEntry: "safari.desktop",
    installed: {},
    bundled: { webkit: bundledWebkit },
  })
  assert.equal(selection.engine, "webkit")
  assert.ok(selection.reasons.some((reason) => /Safari itself cannot be automated/.test(reason)))
})

test("an explicit override is honoured when usable", () => {
  const selection = chooseBrowser({
    override: "firefox",
    installed: { chrome },
    bundled: { firefox: bundledFirefox },
  })
  assert.equal(selection.engine, "firefox")
  assert.match(selection.source, /explicit override/)
})

test("an unusable override fails loudly with guidance", () => {
  assert.throws(
    () => chooseBrowser({ override: "firefox", installed: { chrome }, bundled: {} }),
    (error) => error instanceof BrowserSelectionError && /Firefox build is not installed/.test(error.message),
  )
  assert.throws(() => chooseBrowser({ override: "netscape" }), /Unknown browser override/)
})

test("no usable browser reports what was checked", () => {
  assert.throws(
    () => chooseBrowser({ defaultEntry: null, installed: {}, bundled: {} }),
    (error) =>
      error instanceof BrowserSelectionError &&
      error.message.includes(SUPPORTED_LABEL) &&
      /npx playwright install chromium/.test(error.message),
  )
})
