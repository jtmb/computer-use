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

// Capability handshake at the public promise boundary. The plugin body calls only
// `session.capabilities()`: it never generates, stores, or updates anything, so a side effect here
// would have to come from the bridge itself. Absence or a malformed answer means "unsupported";
// callers must not infer support from a version or probe with a conditional write.
const it = testEffect(PluginTestLayer)

const host = Effect.fn(function* () {
  const plugins = yield* Plugin.Service
  return yield* PluginHost.make(plugins, "cas-capability")
})

type Observed =
  | { readonly kind: "capabilities"; readonly value: unknown }
  | { readonly kind: "error"; readonly error: unknown }

it.live("capability handshake reports conditional title support without writing", () =>
  Effect.gen(function* () {
    const ctx = yield* host()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    yield* ctx.session.update({
      sessionID: created.id,
      title: `Human chosen · ${created.id}`,
      metadata: { source: "human" },
    })
    const before = yield* sessions.get(created.id)

    const observed: Observed[] = []
    const plugin = PromisePlugin.define({
      id: "cas.capability.handshake",
      async setup(promise) {
        try {
          observed.push({ kind: "capabilities", value: await promise.session.capabilities() })
        } catch (error) {
          observed.push({ kind: "error", error })
        }
      },
    })
    yield* Effect.scoped(fromPromise(plugin).effect({ ...ctx, options: {} }))

    expect(observed).toHaveLength(1)
    expect(observed[0]?.kind).toBe("capabilities")
    expect(observed[0]?.kind === "capabilities" ? observed[0].value : undefined).toEqual({
      conditionalTitleUpdate: 1,
    })

    // No write: the plugin body only read the handshake.
    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(before.title)
    expect(after.metadata).toEqual(before.metadata)
    expect(after.permissions).toBe(before.permissions)
    expect(after.time).toEqual(before.time)
  }),
)

// Control: the pinned adapter compiles the pinned protocol and has no capability bridge. It is not
// probed with a conditional update, and no version is inferred; only absence is observed.
it.live("control: pinned adapter exposes no capability and is not probed with a write", () =>
  Effect.gen(function* () {
    const native = process.env.OPENCODE_NATIVE
    if (!native) throw new Error("OPENCODE_NATIVE is required")
    const pinned = yield* Effect.promise(() =>
      import(pathToFileURL(`${native}/packages/plugin/src/promise/adapter.ts`).href),
    )

    const ctx = yield* host()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    const before = yield* sessions.get(created.id)

    const observed: string[] = []
    const plugin = PromisePlugin.define({
      id: "cas.capability.pinned",
      async setup(promise) {
        observed.push(typeof (promise.session as Record<string, unknown>).capabilities)
      },
    })
    yield* Effect.scoped(pinned.fromPromise(plugin).effect({ ...ctx, options: {} }))

    expect(observed).toEqual(["undefined"])
    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(before.title)
    expect(after.metadata).toEqual(before.metadata)
  }),
)
