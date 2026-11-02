/**
 * Guard against relative imports that point at nothing.
 *
 * `index.ts` previously imported the runtime package two levels up instead of
 * three. Unit tests never loaded `index.ts`, so nothing failed until the plugin
 * was loaded for real. This test resolves every relative specifier in the plugin
 * directory so a wrong depth is a test failure instead of a load-time surprise.
 */

import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const SPECIFIER = /(?:^|[\s;}])(?:import|export)[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gms

function sources(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => resolve(directory, name))
}

function relativeSpecifiers(file: string): string[] {
  const text = readFileSync(file, "utf8")
  const found: string[] = []
  for (const match of text.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2]
    if (specifier?.startsWith(".")) found.push(specifier)
  }
  return found
}

test("every relative import in the plugin resolves to a file", () => {
  const problems: string[] = []
  for (const file of sources(PLUGIN_DIR)) {
    for (const specifier of relativeSpecifiers(file)) {
      const target = resolve(dirname(file), specifier)
      let ok = false
      try {
        ok = statSync(target).isFile()
      } catch {
        ok = false
      }
      if (!ok) problems.push(`${file.split("/").at(-1)}: ${specifier}`)
    }
  }
  assert.deepEqual(problems, [])
})

test("the plugin entry point resolves the runtime package at the repository root", () => {
  const entry = resolve(PLUGIN_DIR, "index.ts")
  const specifiers = relativeSpecifiers(entry)
  assert.ok(
    specifiers.includes("../../../tools/computer-use-runtime/src/index.ts"),
    `expected the repository-root runtime import, got ${JSON.stringify(specifiers)}`,
  )
  for (const specifier of specifiers) {
    assert.notEqual(
      resolve(dirname(entry), specifier).includes("/.opencode/tools/"),
      true,
      `${specifier} resolves inside .opencode/tools, which does not exist`,
    )
  }
})
