/**
 * Tests for the Code Mode default and the `directTools` rollback.
 *
 * The rollback is a documented configuration, so its behaviour is checked here
 * rather than inferred from the plugin entry point, which imports the OpenCode
 * plugin SDK and cannot be loaded in a plain test.
 */

import assert from "node:assert/strict"
import { test } from "node:test"

import { applyCodemodeDefault, DESKTOP_TOOL_PREFIX, type CodemodeTool } from "./codemode.ts"

type Entry = { id: string; options?: { codemode?: boolean; [key: string]: unknown } }

function fakeEditor(entries: Entry[]) {
  const state = entries.map((entry) => ({ ...entry, options: { ...entry.options } }))
  const editor = {
    state,
    list() {
      return state.map((entry) => ({ ...entry }))
    },
    update(id: string, mutate: (entry: { options?: { codemode?: boolean } }) => void) {
      const entry = state.find((candidate) => candidate.id === id)
      assert.ok(entry, `unknown tool ${id}`)
      mutate(entry as { options?: { codemode?: boolean } })
    },
  }
  return editor
}

const sample = (): Entry[] => [
  { id: "desktop_capture", options: { namespace: "desktop", codemode: false } },
  { id: "desktop_input", options: { namespace: "desktop", codemode: false } },
  { id: "desktop_windows", options: { namespace: "desktop", codemode: false } },
  { id: "web_open", options: { namespace: "web", codemode: true } },
]

test("Code Mode is the default for every desktop tool", () => {
  const editor = fakeEditor(sample())
  const changed = applyCodemodeDefault(editor)
  assert.deepEqual(changed, ["desktop_capture", "desktop_input", "desktop_windows"])
  for (const entry of editor.state) {
    if (entry.id.startsWith(DESKTOP_TOOL_PREFIX)) assert.equal(entry.options?.codemode, true, entry.id)
  }
  // The browser surface already declares Code Mode and must not be rewritten.
  assert.equal(editor.state.find((entry) => entry.id === "web_open")?.options?.codemode, true)
})

test("the directTools rollback switches every owned tool back to direct", () => {
  const editor = fakeEditor([
    ...sample(),
    // A desktop tool that declares Code Mode itself, like capture and input do.
    { id: "desktop_capture_direct", options: { namespace: "desktop", codemode: true } },
  ])
  const changed = applyCodemodeDefault(editor, { directTools: true })
  assert.deepEqual(changed.sort(), ["desktop_capture_direct", "web_open"])
  for (const entry of editor.state) {
    assert.equal(entry.options?.codemode, false, entry.id)
  }
})

test("a desktop tool that omits the option still gets Code Mode", () => {
  const editor = fakeEditor([
    { id: "desktop_capture", options: { codemode: true } },
    { id: "desktop_act" },
  ])
  const changed = applyCodemodeDefault(editor)
  assert.deepEqual(changed, ["desktop_act"])
  assert.equal(editor.state[0].options?.codemode, true)
})

test("other namespaces are never touched, in either direction", () => {
  const editor = fakeEditor([
    { id: "memory_list", options: { codemode: false } },
    { id: "github_get_me", options: { codemode: true } },
  ])
  assert.deepEqual(applyCodemodeDefault(editor), [])
  assert.deepEqual(applyCodemodeDefault(editor, { directTools: true }), [])
  assert.equal(editor.state[0].options?.codemode, false)
  assert.equal(editor.state[1].options?.codemode, true)
})

test("the desktop prefix matches the registered namespace", () => {
  assert.equal(DESKTOP_TOOL_PREFIX, "desktop_")
  const tools: CodemodeTool[] = [{ id: "desktop_capture", options: { codemode: false } }]
  assert.equal(tools[0].id.startsWith(DESKTOP_TOOL_PREFIX), true)
})

test("native-shaped options without an index signature retain unrelated metadata", () => {
  type Options = { namespace?: string; codemode?: boolean; pinned?: boolean; concurrent?: boolean }
  const entries: Array<{ id: string; options?: Options }> = [
    { id: "web_open", options: { namespace: "web", codemode: true, pinned: true, concurrent: false } },
  ]
  const editor = {
    list: () => entries,
    update(id: string, mutate: (entry: { options?: Options }) => void) {
      const entry = entries.find(value => value.id === id)
      assert.ok(entry)
      mutate(entry)
    },
  }
  assert.deepEqual(applyCodemodeDefault(editor, { directTools: true }), ["web_open"])
  assert.deepEqual(entries[0].options, { namespace: "web", codemode: false, pinned: true, concurrent: false })
})
