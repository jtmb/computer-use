import assert from "node:assert/strict"
import { test } from "node:test"

import { BrowserBackendError } from "../../../tools/computer-use-browser/src/errors.ts"
import { createAuthGuard } from "../../../tools/computer-use-runtime/src/index.ts"
import { registerBrowserTools, type BrowserToolContext } from "./browser-tools.ts"
import { registerCaptureTools } from "./capture-tool.ts"
import { createCredentialSafety } from "./credential-safety.ts"

type ToolResult = {
  content: Array<{ type: string; text?: string; uri?: string; mime?: string; name?: string }>
}

type Tool = {
  name: string
  execute(input: Record<string, unknown>, context: never): Promise<ToolResult>
}

type FillRequest = { sessionId: string; value: Buffer; target: unknown }

const context: BrowserToolContext = {
  sessionID: "ses-review-a",
  agent: "build",
  messageID: "review-message",
  id: "browser-tool",
}

const marker = "synthetic-review-secret-marker"
const windowId = "12345678-1234-1234-1234-123456789abc:42"
const pngBase64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64")

function browserFixture(options: {
  sessionID?: string
  credentialSafety?: ReturnType<typeof createCredentialSafety>
  fillCredential?: (request: FillRequest) => Promise<unknown>
  cancel?: (sessionID: string) => Promise<boolean>
} = {}) {
  const sessionID = options.sessionID ?? context.sessionID
  const toolContext = { ...context, sessionID }
  const tools = new Map<string, Tool>()
  const executed: string[] = []
  const cancellations: string[] = []
  const guard = createAuthGuard()
  const credentialSafety = options.credentialSafety ?? createCredentialSafety()
  const manager = {
    listSessions: () => [{ sessionId: sessionID, status: "running" as const }],
    async execute(_session: string, operation: { method: string }) {
      executed.push(operation.method)
      if (operation.method === "snapshot") {
        return { tabId: "tab-review", generation: 1, snapshot: '- textbox "Password" [ref=e1]' }
      }
      if (operation.method === "screenshot") return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      if (operation.method === "tabs.close") return { closed: true }
      return { id: "tab-review", ownership: "ephemeral", url: "https://login.example.test/", title: "Login" }
    },
    async fillCredential(_path: unknown, request: FillRequest) {
      if (options.fillCredential) return options.fillCredential(request)
      return { status: "filled" as const }
    },
    async cancel(session: string) {
      cancellations.push(session)
      return options.cancel ? options.cancel(session) : true
    },
  }

  registerBrowserTools<Tool>(
    {
      namespace() {},
      add(tool) { tools.set(tool.name, tool) },
    },
    {
      assertPermission: async () => {},
      manager: manager as never,
      dataDirectory: "/offline/test-data",
      authGuard: guard,
      credentialSafety,
      signInDialog: async () => ({ status: "ok", value: Buffer.from(marker) }) as never,
    },
  )

  return { tools, guard, credentialSafety, executed, cancellations, context: toolContext }
}

function captureFixture(credentialSafety: ReturnType<typeof createCredentialSafety>) {
  const tools = new Map<string, Tool>()
  const calls: string[] = []
  const result = {
    available: true,
    ok: true,
    windowId,
    observationId: "offline-observation",
    width: 1,
    height: 1,
    sha256: "ab".repeat(32),
    pngBase64,
  }
  registerCaptureTools<Tool>(
    {
      namespace() {},
      add(tool) { tools.set(tool.name, tool) },
    } as never,
    {
      assertPermission: async () => {},
      credentialSafety,
      executeBridge: async (command: string) => {
        calls.push(command)
        return JSON.stringify(result)
      },
    } as never,
  )
  return { tool: tools.get("capture")!, calls }
}

async function startSignIn(fixture: ReturnType<typeof browserFixture>): Promise<{ pending: Promise<ToolResult> }> {
  await fixture.tools.get("snapshot")!.execute({ tabId: "tab-review" }, fixture.context as never)
  return {
    pending: fixture.tools.get("signin")!.execute(
      { tabId: "tab-review", ref: "e1", generation: 1 },
      fixture.context as never,
    ),
  }
}

function outputText(result: ToolResult): string {
  return result.content.map((part) => part.text ?? "").join("")
}

test("compositor capture refuses a different session while any credential tab is protected", async () => {
  const safety = createCredentialSafety()
  safety.mark("ses-review-a", "tab-review")
  const capture = captureFixture(safety)

  const result = await capture.tool.execute(
    { windowId },
    { ...context, sessionID: "ses-review-b" } as never,
  )

  assert.match(outputText(result), /Refused/u)
  assert.deepEqual(capture.calls, [], "a shared compositor capture must not run for another session")
})

test("elapsed time and a reload without leaving the form do not clear protection", async () => {
  let now = 1_000
  const safety = createCredentialSafety({ now: () => now })
  safety.mark(context.sessionID, "tab-review")
  now += 31 * 60_000
  const browser = browserFixture({ credentialSafety: safety })

  await browser.tools.get("navigate")!.execute(
    { tabId: "tab-review", action: "reload" },
    browser.context as never,
  )

  assert.equal(safety.isTabFilled(context.sessionID, "tab-review"), true)
  assert.equal(safety.hasAnyFilled(), true)
})

test("a proven pre-dispatch credential rejection still reports that nothing was typed", async () => {
  const safety = createCredentialSafety()
  const browser = browserFixture({
    credentialSafety: safety,
    async fillCredential() {
      throw new BrowserBackendError("CREDENTIAL_TARGET_INVALID", "The credential target is stale.")
    },
  })
  const { pending } = await startSignIn(browser)
  const result = await pending

  assert.match(outputText(result), /nothing was typed/u)
  assert.equal(browser.guard.guard.getState(), "idle")
  assert.equal(safety.hasAnyFilled(context.sessionID), false)
})

test("a mutate-then-throw fill is protected before dispatch and leaves the guard uncertain", async () => {
  const safety = createCredentialSafety()
  let started!: () => void
  const fillStarted = new Promise<void>((resolve) => { started = resolve })
  let rejectFill!: (error: Error) => void
  const fillPending = new Promise<never>((_resolve, reject) => { rejectFill = reject })
  let visibleValue = ""
  const browser = browserFixture({
    credentialSafety: safety,
    async fillCredential(request) {
      visibleValue = request.value.toString()
      started()
      return fillPending
    },
  })
  const { pending } = await startSignIn(browser)
  await fillStarted

  const protectedDuringMutation = safety.isTabFilled(context.sessionID, "tab-review")
  const capture = captureFixture(safety)
  const captureResult = await capture.tool.execute(
    { windowId },
    { ...context, sessionID: "ses-review-b" } as never,
  )
  rejectFill(new Error(`Synthetic fill acknowledgement failed: ${visibleValue}`))
  const signInResult = await pending

  assert.equal(protectedDuringMutation, true, "the shared capture guard must precede the first possible mutation")
  assert.match(outputText(captureResult), /Refused/u)
  assert.deepEqual(capture.calls, [])
  assert.equal(outputText(signInResult).includes(marker), false)
  assert.doesNotMatch(outputText(signInResult), /nothing was typed/u)
  assert.equal(browser.guard.guard.getState(), "submitted-uncertain")
  assert.equal(safety.isTabFilled(context.sessionID, "tab-review"), true)
})

test("a confirmed close clears only its session's protected tabs", async () => {
  const safety = createCredentialSafety()
  safety.mark("ses-review-a", "tab-review")
  safety.mark("ses-review-b", "tab-other")
  const browser = browserFixture({
    credentialSafety: safety,
    async fillCredential() { throw new Error("synthetic post-dispatch failure") },
  })
  const { pending: signIn } = await startSignIn(browser)
  await signIn
  assert.equal(browser.guard.guard.getState(), "submitted-uncertain")

  const result = await browser.tools.get("close")!.execute({}, browser.context as never)

  assert.match(outputText(result), /"cancelled":true/u)
  assert.equal(browser.guard.guard.getState(), "idle")
  assert.equal(safety.hasAnyFilled("ses-review-a"), false)
  assert.equal(safety.hasAnyFilled("ses-review-b"), true)
})

test("an unconfirmed or failed close retains the guard and sensitive-tab protection", async () => {
  const createUncertainBrowser = async (cancel: (sessionID: string) => Promise<boolean>) => {
    const safety = createCredentialSafety()
    const browser = browserFixture({
      credentialSafety: safety,
      async fillCredential() { throw new Error("synthetic post-dispatch failure") },
      cancel,
    })
    const { pending: signIn } = await startSignIn(browser)
    await signIn
    return browser
  }

  const unconfirmed = await createUncertainBrowser(async () => false)
  await unconfirmed.tools.get("close")!.execute({}, unconfirmed.context as never)
  assert.equal(unconfirmed.guard.guard.getState(), "submitted-uncertain")
  assert.equal(unconfirmed.credentialSafety.hasAnyFilled(context.sessionID), true)

  const failed = await createUncertainBrowser(async () => { throw new Error("synthetic close failure") })
  await failed.tools.get("close")!.execute({}, failed.context as never)
  assert.equal(failed.guard.guard.getState(), "submitted-uncertain")
  assert.equal(failed.credentialSafety.hasAnyFilled(context.sessionID), true)
})
