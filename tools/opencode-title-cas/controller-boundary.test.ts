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
import { createTaskTitles } from "./title-controller/task-titles.ts"
import { parseSessionGoalState } from "./title-controller/model.ts"
import { createHandoffAutomation } from "./title-controller/automation.ts"

const it = testEffect(PluginTestLayer)
const context = Effect.fn(function* () {
  return yield* PluginHost.make(yield* Plugin.Service, "cas-current-controller")
})
const goal = (id: string) => parseSessionGoalState({ version: 3, goals: { [id]: {
  id: "synthetic-title-goal", sessionID: id, objective: "Repair window layouts", status: "active",
  createdAt: 1, updatedAt: 2, planRevision: 1,
  plan: { summary: "Repair window layouts", revision: 1, updatedAt: 2, completionCriteria: ["Verified"],
    phases: [{ id: "source", objective: "Repair layouts", status: "in_progress", tasks: [
      { id: "input", description: "Repair bounded pointer input", status: "in_progress" },
    ] }] },
} } }, id)

for (const race of [false, true]) {
  it.live(race
    ? "current controller preserves a manual title at the final promise publication boundary"
    : "current controller publishes through the advertised real conditional promise API", () =>
    Effect.gen(function* () {
      const ctx = yield* context()
      const sessions = yield* Session.Service
      const created = yield* ctx.session.create({ title: "Fix desktop input" })
      const before = yield* sessions.get(created.id)
      const manual = `Human chosen · ${created.id}`
      let attempts = 0
      let generations = 0
      const errors: unknown[] = []
      const expectedTitles: (string | undefined)[] = []
      let status: Awaited<ReturnType<ReturnType<typeof createTaskTitles>["status"]>> | undefined
      const plugin = PromisePlugin.define({
        id: `cas.controller.${race ? "race" : "success"}`,
        async setup(promise) {
          const info = await promise.session.get({ sessionID: created.id })
          const records = new Map<string, unknown>()
          const titles = createTaskTitles({
            session: {
              ...promise.session,
              async generate() { generations++; throw Error("Generation is not needed for this initial semantic label") },
              async update(input, options) {
                attempts++
                expectedTitles.push(input.expectedTitle)
                if (race) {
                  // A second real adapter call wins after the controller's final
                  // read, before its conditional call reaches the real core.
                  await promise.session.update({ sessionID: created.id, title: manual, metadata: { source: "human" } })
                }
                return promise.session.update(input, options)
              },
            },
            location: { directory: info.location.directory, workspaceID: info.location.workspaceID,
              project: { id: info.projectID } },
            storage: { async get(key) { return records.get(key) }, async set(key, value) { records.set(key, value) } },
            readState: async () => goal(created.id), report: error => errors.push(error),
          })
          await titles.context(created.id)
          status = await titles.status(created.id)
          await titles.context(created.id)
        },
      })
      yield* Effect.scoped(fromPromise(plugin).effect({ ...ctx, options: {} }))
      const after = yield* sessions.get(created.id)
      expect(after.title).toBe(race ? manual : `Fix desktop input · ${created.id}`)
      expect(after.metadata).toEqual(race ? { source: "human" } : before.metadata)
      expect(errors).toEqual([])
      expect(attempts).toBe(1)
      expect(generations).toBe(0)
      expect(expectedTitles).toEqual(["Fix desktop input"])
      expect(status?.publicationCapability).toBe("conditional-title-v1")
      expect(status?.suspended).toBe(false)
      expect(status?.action).toBe(race ? "manual" : "preserved")
      expect(status?.currentTitle).toBe(after.title)
      expect(status?.recordedTitle).toBe(after.title)
    }),
  )
}

it.live("current controller refuses the pinned adapter without generation, storage writes or legacy publication", () =>
  Effect.gen(function* () {
    const native = process.env.OPENCODE_NATIVE
    if (!native) throw Error("OPENCODE_NATIVE is required")
    const pinned = yield* Effect.promise(() => import(pathToFileURL(`${native}/packages/plugin/src/promise/adapter.ts`).href))
    const ctx = yield* context()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Fix desktop input" })
    const before = yield* sessions.get(created.id)
    let writes = 0
    let attempts = 0
    let generations = 0
    const errors: unknown[] = []
    const plugin = PromisePlugin.define({
      id: "cas.controller.unsupported",
      async setup(promise) {
        const info = await promise.session.get({ sessionID: created.id })
        expect(typeof (promise.session as Record<string, unknown>).capabilities).toBe("undefined")
        const titles = createTaskTitles({
          session: { ...promise.session,
            async generate() { generations++; throw Error("No generation on unsupported hosts") },
            async update(input, options) { attempts++; return promise.session.update(input, options) },
          },
          location: { directory: info.location.directory, workspaceID: info.location.workspaceID,
            project: { id: info.projectID } },
          storage: { async get() { return undefined }, async set() { writes++ } },
          readState: async () => goal(created.id), report: error => errors.push(error),
        })
        await titles.context(created.id)
        await titles.context(created.id)
        const status = await titles.status(created.id)
        expect(status.publicationCapability).toBe("unavailable")
        expect(status.suspended).toBe(false)
      },
    })
    yield* Effect.scoped(pinned.fromPromise(plugin).effect({ ...ctx, options: {} }))
    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(before.title)
    expect(after.metadata).toEqual(before.metadata)
    expect(after.time).toEqual(before.time)
    expect(writes).toBe(0)
    expect(attempts).toBe(0)
    expect(generations).toBe(0)
    expect(errors).toEqual([])
  }),
)

for (const mode of ["success", "race", "unsupported"] as const) {
  const name = mode === "race" ? "handoff worker preserves a manual title at the final promise publication boundary"
    : mode === "unsupported" ? "handoff worker refuses legacy publication without disabling its policy"
    : "handoff worker publishes through the advertised real conditional promise API"
  it.live(name, () => Effect.gen(function* () {
    const ctx = yield* context()
    const sessions = yield* Session.Service
    const source = yield* ctx.session.create({ title: "Reviewer notes" })
    const created = yield* ctx.session.create({ title: "Fix handoff resume" })
    yield* ctx.session.update({ sessionID: created.id, metadata: {
      handoffOrigin: { role: "independent-worker", hash: "abcdef123456", sourceSessionID: source.id, task: "Repair handoff" },
    } })
    const before = yield* sessions.get(created.id)
    const manual = `Human chosen · ${created.id}`
    const errors: unknown[] = []
    const expectedTitles: (string | undefined)[] = []
    let attempts = 0
    let writes = 0
    let enabled: boolean | undefined
    let notice: string | undefined
    const plugin = PromisePlugin.define({
      id: `cas.worker.${mode}`,
      async setup(promise) {
        const info = await promise.session.get({ sessionID: created.id })
        const records = new Map<string, unknown>()
        const automation = createHandoffAutomation({
          session: { ...promise.session,
            async update(input, options) {
              attempts++
              expectedTitles.push(input.expectedTitle)
              if (mode === "race") await promise.session.update({ sessionID: created.id, title: manual })
              return promise.session.update(input, options)
            },
          },
          location: { directory: info.location.directory, workspaceID: info.location.workspaceID,
            project: { id: info.projectID } },
          storage: { async get(key) { return records.get(key) }, async set(key, value) { writes++; records.set(key, value) } },
          readState: async () => null, report: error => errors.push(error),
        })
        expect(await automation.context(created.id)).toBeUndefined()
        const view = await automation.read(created.id)
        enabled = view.enabled
        notice = view.notice
        expect(view.requested).toBeNull()
        expect(await automation.context(created.id)).toBeUndefined()
      },
    })
    const native = process.env.OPENCODE_NATIVE
    if (!native) throw Error("OPENCODE_NATIVE is required")
    const adapter = mode === "unsupported"
      ? yield* Effect.promise(() => import(pathToFileURL(`${native}/packages/plugin/src/promise/adapter.ts`).href))
      : { fromPromise }
    yield* Effect.scoped(adapter.fromPromise(plugin).effect({ ...ctx, options: {} }))
    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(mode === "race" ? manual : mode === "unsupported" ? before.title : `Fix handoff resume · ${created.id}`)
    expect(after.metadata).toEqual(before.metadata)
    expect(errors).toEqual([])
    expect(attempts).toBe(mode === "unsupported" ? 0 : 1)
    expect(expectedTitles).toEqual(mode === "unsupported" ? [] : ["Fix handoff resume"])
    expect(writes).toBe(0)
    expect(enabled).toBe(true)
    expect(notice).not.toContain("suspended")
  }))
}
