import assert from "node:assert/strict"
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import plugin, { RETIRED_FEATURE } from "../index.ts"
import tui from "../tui.ts"

function sealedContext(accessed: string[]) {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, property) {
      accessed.push(String(property))
      throw new Error(`retired setup accessed context.${String(property)}`)
    },
  })
}

function retired(error: unknown) {
  return error instanceof Error && error.message === RETIRED_FEATURE
}

test("retired server entrypoint registers no tool, RPC, event, hook or state even with unsafe state options", async t => {
  const directory = await mkdtemp("/tmp/opencode/coordination-retired-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const shared = path.join(directory, "shared")
  await mkdir(shared)
  await chmod(shared, 0o775)
  const stateDirectory = path.join(shared, "state")
  const accessed: string[] = []
  let fetches = 0
  const network = globalThis as unknown as { fetch: typeof fetch }
  const realFetch = network.fetch
  network.fetch = (async () => { fetches++; throw new Error("unexpected network access") }) as typeof fetch
  t.after(() => { network.fetch = realFetch })

  await assert.rejects(async () => plugin.setup(sealedContext(accessed) as never), retired)
  assert.deepEqual(accessed, [], "setup must not read context, session, tool, RPC, event, permission or state options")
  assert.equal(fetches, 0, "setup makes no network request")
  await assert.rejects(async () => readFile(stateDirectory), /ENOENT/, "no state directory is created or read")
})

test("retired TUI entrypoint registers no palette command, keymap, dialog or inbox view", async t => {
  const accessed: string[] = []
  await assert.rejects(async () => tui.setup(sealedContext(accessed) as never), retired)
  assert.deepEqual(accessed, [], "TUI setup must not read ui, keymap, data, router or client")
})

test("package manifest exposes only the two refusing loader entrypoints", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
  assert.deepEqual(manifest.exports, { ".": "./index.ts", "./tui": "./tui.ts" })
})
