import { expect, test } from "bun:test"
import { join } from "node:path"
import { OpenCode } from "../src/promise/generated/index"

const staged = process.env.CAS_STAGED
const pin = process.env.OPENCODE_NATIVE
if (!staged || !pin) throw new Error("CAS_STAGED and OPENCODE_NATIVE are required")

const read = (path: string) => Bun.file(join(staged, path)).text()
const generated = {
  promiseClient: "packages/client/src/promise/generated/client.ts",
  promiseTypes: "packages/client/src/promise/generated/types.ts",
  effectClient: "packages/client/src/effect/generated/client.ts",
  effectApi: "packages/client/src/effect/api/api.ts",
}

test("the staged client resolves the modified staged protocol, not the pin", () => {
  const resolved = Bun.resolveSync("@opencode/protocol/client", join(staged, "packages/client"))
  expect(resolved.startsWith(join(staged, "packages/protocol"))).toBe(true)
  expect(resolved.startsWith(pin)).toBe(false)
})

test("the generated promise client sends expectedTitle and declares the 409", async () => {
  const source = await read(generated.promiseClient)
  expect(source).toContain('expectedTitle: input["expectedTitle"],')
  expect(source).toContain("declaredStatuses: [400, 401, 404, 409],")
})

test("the generated promise types expose expectedTitle as an optional string", async () => {
  const source = await read(generated.promiseTypes)
  expect(source).toContain("readonly expectedTitle?: string | undefined")
})

test("the generated Effect client and API expose expectedTitle", async () => {
  const client = await read(generated.effectClient)
  expect(client).toContain('expectedTitle: input["expectedTitle"],')
  const api = await read(generated.effectApi)
  expect(api).toContain("readonly expectedTitle?: string | undefined")
  expect(api).toContain("SessionUpdateInput")
})

test("the actual generated session.update sends the conditional PATCH body", async () => {
  const calls: { method: string; path: string; body: unknown }[] = []
  const client = OpenCode.make({
    baseUrl: "http://cas.invalid",
    fetch: async (input, init) => {
      const request = new Request(input, init)
      calls.push({ method: request.method, path: new URL(request.url).pathname, body: await request.json() })
      return new Response(null, { status: 204 })
    },
  })
  const output = await client.session.update({ sessionID: "ses_generated_cas", title: "Next", expectedTitle: "Base" })
  expect(output).toBeUndefined()
  expect(calls).toEqual([{ method: "PATCH", path: "/api/session/ses_generated_cas",
    body: { title: "Next", expectedTitle: "Base" } }])
})

test("session.update recognizes a 409 as its declared ConflictError", async () => {
  const body = { _tag: "ConflictError", message: "Session title changed before the conditional rename.", resource: "ses_generated_cas" }
  const client = OpenCode.make({ baseUrl: "http://cas.invalid",
    fetch: async () => Response.json(body, { status: 409 }) })
  try {
    await client.session.update({ sessionID: "ses_generated_cas", title: "Next", expectedTitle: "Base" })
    throw new Error("conditional conflict unexpectedly succeeded")
  } catch (error) {
    expect(error).toMatchObject(body)
    expect(error).toBeInstanceOf(Error)
  }
})
