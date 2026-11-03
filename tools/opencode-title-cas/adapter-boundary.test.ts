import { expect } from "bun:test"
import { Effect } from "effect"
import { pathToFileURL } from "node:url"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { fromPromise } from "@opencode/core/plugin/promise"
import { Session } from "@opencode/core/session"
import { Plugin as PromisePlugin } from "@opencode/plugin"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

// Drives the public promise plugin boundary: a promise plugin's `setup` calls `session.update`,
// which the real adapter compiles from the resolved protocol payload schema before it reaches the
// real core host. Nothing here replaces the endpoint schema, the decoder or the host method.
const it = testEffect(PluginTestLayer)

const host = Effect.fn(function* () {
  const plugins = yield* Plugin.Service
  return yield* PluginHost.make(plugins, "cas-adapter")
})

type Observed = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }

// The adapter rejects a promise plugin's call with whatever the host failure becomes at the promise
// boundary. Record the observed shape instead of asserting one that has not been measured.
const describeError = (error: unknown) => {
  const value = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : undefined
  return {
    thrown: value !== undefined,
    constructor: value === undefined ? typeof error : (error as object).constructor.name,
    tag: value?._tag,
    name: value?.name,
    message: typeof value?.message === "string" ? value.message : undefined,
    keys: value ? Object.keys(value).sort() : [],
  }
}

const manualLabel = (sessionID: string) => `Human chosen · ${sessionID}`
const pluginLabel = (sessionID: string) => `Plugin chosen · ${sessionID}`

it.live("promise adapter rejects a stale conditional rename and returns a catchable conflict", () =>
  Effect.gen(function* () {
    const ctx = yield* host()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    const base = "Base label"
    const manual = manualLabel(created.id)
    yield* ctx.session.update({ sessionID: created.id, title: manual, metadata: { source: "human" } })

    const observed: Observed[] = []
    const plugin = PromisePlugin.define({
      id: "cas.adapter.conflict",
      async setup(promise) {
        try {
          await promise.session.update({
            sessionID: created.id,
            title: pluginLabel(created.id),
            expectedTitle: base,
            metadata: { source: "plugin" },
            permissions: [{ action: "edit", resource: "**", effect: "allow" }],
          })
          observed.push({ kind: "resolved" })
        } catch (error) {
          observed.push({ kind: "rejected", error })
        }
      },
    })
    yield* Effect.scoped(fromPromise(plugin).effect({ ...ctx, options: {} }))

    // Preservation is asserted before the error shape so a dropped conditional branch fails here.
    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(manual)
    expect(after.metadata).toEqual({ source: "human" })
    expect(after.permissions).toBeUndefined()
    expect(observed).toHaveLength(1)
    expect(observed[0]?.kind).toBe("rejected")
    const error = observed[0]?.kind === "rejected" ? observed[0].error : undefined
    const shape = describeError(error)
    console.log("promise conflict rejection:", JSON.stringify(shape))
    expect(shape.thrown).toBe(true)
    expect(shape.tag).toBe("Session.TitleConflictError")
    expect(shape.message).toContain(created.id)
  }),
)

it.live("promise adapter commits the conditional rename and its other fields when the title still matches", () =>
  Effect.gen(function* () {
    const ctx = yield* host()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    const next = `Next label · ${created.id}`
    const observed: Observed[] = []
    const plugin = PromisePlugin.define({
      id: "cas.adapter.success",
      async setup(promise) {
        try {
          await promise.session.update({
            sessionID: created.id,
            title: next,
            expectedTitle: "Base label",
            metadata: { source: "plugin" },
          })
          observed.push({ kind: "resolved" })
        } catch (error) {
          observed.push({ kind: "rejected", error })
        }
      },
    })
    yield* Effect.scoped(fromPromise(plugin).effect({ ...ctx, options: {} }))
    expect(observed).toEqual([{ kind: "resolved" }])
    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(next)
    expect(after.metadata).toEqual({ source: "plugin" })
  }),
)

// Control, not a preservation claim: the pinned adapter compiles the payload schema that the patch
// adds `expectedTitle` to, so the field is absent from the decoded input and the host takes its
// legacy branch. This test asserts the resulting overwrite; it fails if the drop stops happening.
it.live("control: pinned adapter drops expectedTitle and performs the unconditional rename", () =>
  Effect.gen(function* () {
    const native = process.env.OPENCODE_NATIVE
    if (!native) throw new Error("OPENCODE_NATIVE is required")
    const pinned = yield* Effect.promise(() => import(pathToFileURL(`${native}/packages/plugin/src/promise/adapter.ts`).href))

    const ctx = yield* host()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    const manual = manualLabel(created.id)
    yield* ctx.session.update({ sessionID: created.id, title: manual, metadata: { source: "human" } })

    const observed: Observed[] = []
    const plugin = PromisePlugin.define({
      id: "cas.adapter.pinned",
      async setup(promise) {
        try {
          await promise.session.update({
            sessionID: created.id,
            title: pluginLabel(created.id),
            expectedTitle: "Base label",
            metadata: { source: "plugin" },
          })
          observed.push({ kind: "resolved" })
        } catch (error) {
          observed.push({ kind: "rejected", error })
        }
      },
    })
    yield* Effect.scoped(pinned.fromPromise(plugin).effect({ ...ctx, options: {} }))

    const after = yield* sessions.get(created.id)
    console.log("pinned adapter fallthrough:", JSON.stringify({ observed: observed[0]?.kind, title: after.title }))
    expect(observed).toEqual([{ kind: "resolved" }])
    expect(after.title).toBe(pluginLabel(created.id))
    expect(after.title).not.toBe(manual)
  }),
)
