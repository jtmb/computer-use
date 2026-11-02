/** Regression tests for registered desktop-tool contracts and authorization. */

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildDesktopArgs,
  DESKTOP_CONTROL_MAX_OUTPUT_BYTES,
  describeDesktopFailure,
  registerDesktopTools,
  type DesktopCommandInput,
  type DesktopPermissionRequest,
  type DesktopToolContext,
  type DesktopToolDependencies,
} from "./desktop.ts"

type RegisteredTool = {
  name: string
  input: {
    properties: Record<string, unknown>
    additionalProperties?: boolean
    required?: string[]
  }
  options: { namespace: string; codemode: boolean }
  execute(
    input: Record<string, unknown>,
    context: DesktopToolContext,
  ): Promise<{ content: Array<{ type: string; text?: string }> }>
}

function register(overrides: Partial<DesktopToolDependencies> = {}) {
  const tools = new Map<string, RegisteredTool>()
  const permissionRequests: DesktopPermissionRequest[] = []
  const backendCalls: DesktopCommandInput[] = []
  let screenshotCalls = 0
  const dependencies: DesktopToolDependencies = {
    async assertPermission(request) {
      permissionRequests.push(request)
    },
    async executeDesktop(input) {
      backendCalls.push(input)
      return "stubbed backend result"
    },
    async screenshot() {
      screenshotCalls += 1
      return { content: [{ type: "text", text: "stubbed screenshot" }] }
    },
    ...overrides,
  }

  registerDesktopTools<RegisteredTool>(
    {
      namespace() {},
      add(tool) {
        tools.set(tool.name, tool)
      },
    },
    dependencies,
  )

  return {
    tools,
    permissionRequests,
    backendCalls,
    screenshotCalls: () => screenshotCalls,
  }
}

type PermissionEffect = "allow" | "deny" | "ask"

test("desktop registration needs no legacy screenshot dependency and never registers that held route", () => {
  const names: string[] = []
  registerDesktopTools<RegisteredTool>({ namespace() {}, add(tool) { names.push(tool.name) } }, {
    assertPermission: async () => {},
    executeDesktop: async () => "unused",
  })
  assert.deepEqual(names.toSorted(), ["act", "apps", "find", "tree"])
})

type PermissionRule = { action: string; resource: string; effect: PermissionEffect }

const BASE_ALLOW: PermissionRule = { action: "*", resource: "*", effect: "allow" }

function matchesRule(pattern: string, value: string): boolean {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(`^${expression}$`).test(value)
}

function effectivePermission(
  rules: readonly PermissionRule[],
  action: string,
  resource: string,
): PermissionEffect {
  let effect: PermissionEffect = "ask"
  for (const rule of rules) {
    if (matchesRule(rule.action, action) && matchesRule(rule.resource, resource)) {
      effect = rule.effect
    }
  }
  return effect
}

function policyAssert(
  rules: readonly PermissionRule[],
  settleAsk?: (request: DesktopPermissionRequest) => Promise<void>,
): DesktopToolDependencies["assertPermission"] {
  return async (request) => {
    const effects = request.resources.map((resource) =>
      effectivePermission(rules, request.action, resource),
    )
    if (effects.includes("deny")) {
      throw new Error(`Permission denied: ${request.action}`)
    }
    if (effects.includes("ask")) {
      if (!settleAsk) throw new Error(`Permission requires approval: ${request.action}`)
      await settleAsk(request)
    }
  }
}

const applyInput = {
  app: "Editor",
  verb: "action",
  name: "Save",
  action: "click",
  apply: true,
  expectToken: "fresh-looking-preview-token",
}

function applyContext(agent: string): DesktopToolContext {
  return { ...context, agent, id: "desktop_act" }
}

const context: DesktopToolContext = {
  sessionID: "session-1",
  agent: "explore",
  messageID: "message-1",
  id: "desktop_apps",
}

test("registered tools retain the four AT-SPI names and disable Code Mode", () => {
  const registered = register()

  assert.deepEqual([...registered.tools.keys()], ["apps", "tree", "find", "act"])
  for (const tool of registered.tools.values()) {
    assert.equal(tool.options.namespace, "desktop")
    assert.equal(tool.options.codemode, false)
  }
})

test("act rejects non-mutation verbs before permission checks or backend dispatch", async () => {
  const registered = register()
  const act = registered.tools.get("act")!
  for (const verb of ["apps", "tree", "find", "click", undefined]) {
    const result = await act.execute({ app: "Editor", verb }, context)
    assert.match(result.content[0].text ?? "", /Invalid desktop request: verb must be action, focus, or set-text/)
  }
  assert.deepEqual(registered.permissionRequests, [])
  assert.deepEqual(registered.backendCalls, [])
})

test("read-only registrations cannot be retargeted to a mutation by an extra verb field", async () => {
  const registered = register()
  for (const tool of ["tree", "find"]) {
    const result = await registered.tools.get(tool)!.execute({ app: "Editor", name: "Note", verb: "set-text", text: "not authorized", apply: true, expectToken: "fresh-looking-token" }, context)
    assert.match(result.content[0].text ?? "", /Invalid desktop request/)
  }
  assert.deepEqual(registered.permissionRequests, [])
  assert.deepEqual(registered.backendCalls, [])
})

test("a registration-time read denial propagates without calling the desktop backend", async () => {
  const denied = new Error("desktop read denied")
  const registered = register({
    async assertPermission(request) {
      assert.equal(request.action, "read")
      assert.deepEqual(request.resources, ["desktop/apps"])
      assert.deepEqual(request.save, ["desktop/apps"])
      assert.equal(request.agent, "explore")
      assert.deepEqual(request.source, {
        type: "tool",
        messageID: context.messageID,
        id: context.id,
      })
      throw denied
    },
  })

  await assert.rejects(
    registered.tools.get("apps")!.execute({}, context),
    (error) => error === denied,
  )
  assert.deepEqual(registered.backendCalls, [])
})

test("an apply request checks a separate mutation permission before backend access", async () => {
  const denied = new Error("read-only agent cannot mutate desktop")
  const permissionRequests: DesktopPermissionRequest[] = []
  const registered = register({
    async assertPermission(request) {
      permissionRequests.push(request)
      if (request.action === "desktop_mutate") throw denied
    },
  })

  await assert.rejects(
    registered.tools.get("act")!.execute(
      {
        app: "Editor",
        verb: "action",
        name: "Save",
        action: "click",
        apply: true,
        expectToken: "fresh-looking-preview-token",
      },
      { ...context, id: "desktop_act" },
    ),
    (error) => error === denied,
  )
  assert.deepEqual(permissionRequests.map(({ action }) => action), ["read", "desktop_mutate"])
  assert.equal(permissionRequests[1].agent, "explore")
  assert.match(permissionRequests[1].resources[0], /^desktop\/act\/Editor\/action\/name%3ASave/)
  assert.deepEqual(registered.backendCalls, [])
})

test("ordered Plan and architect edit-deny policies block apply despite wildcard allow", async () => {
  const planRules: PermissionRule[] = [
    BASE_ALLOW,
    { action: "edit", resource: "*", effect: "deny" },
    { action: "edit", resource: "~/.opencode/plan/**", effect: "allow" },
  ]
  const architectRules: PermissionRule[] = [
    BASE_ALLOW,
    { action: "edit", resource: "*", effect: "deny" },
  ]

  for (const [agent, rules] of [
    ["plan", planRules],
    ["architect", architectRules],
  ] as const) {
    const requests: DesktopPermissionRequest[] = []
    const registered = register({
      assertPermission: async (request) => {
        requests.push(request)
        return policyAssert(rules)(request)
      },
    })
    const resource = "desktop/act/Editor/action/name%3ASave/role%3A/nth%3A/action%3Aclick"

    assert.equal(effectivePermission(rules, "desktop_mutate", resource), "allow")
    assert.equal(effectivePermission(rules, "edit", resource), "deny")
    if (agent === "plan") {
      assert.equal(
        effectivePermission(rules, "edit", "~/.opencode/plan/notes.md"),
        "allow",
      )
    }

    await assert.rejects(
      registered.tools.get("act")!.execute(applyInput, applyContext(agent)),
      /Permission denied: edit/,
    )
    assert.deepEqual(requests.map(({ action }) => action), ["read", "desktop_mutate", "edit"])
    assert.equal(requests[2].resources[0], resource)
    assert.ok(!requests[2].resources[0].startsWith("~/.opencode/plan/"))
    assert.deepEqual(registered.backendCalls, [])
  }
})

test("build's ordered wildcard allow permits apply through both gates", async () => {
  const requests: DesktopPermissionRequest[] = []
  const buildRules = [
    BASE_ALLOW,
    { action: "question", resource: "*", effect: "allow" as const },
  ]
  const registered = register({
    assertPermission: async (request) => {
      requests.push(request)
      return policyAssert(buildRules)(request)
    },
  })

  await registered.tools.get("act")!.execute(applyInput, applyContext("build"))
  assert.deepEqual(requests.map(({ action }) => action), ["read", "desktop_mutate", "edit"])
  assert.deepEqual(registered.backendCalls, [
    { ...applyInput, verb: "action" },
  ])
})

test("configured permission asks hold backend access until resolved", async () => {
  for (const requestedAction of ["desktop_mutate", "edit"]) {
    let finishAsk!: (decision: "allow" | "deny") => void
    let observeAsk!: (request: DesktopPermissionRequest) => void
    const asked = new Promise<DesktopPermissionRequest>((resolve) => {
      observeAsk = resolve
    })
    const rules: PermissionRule[] = [
      BASE_ALLOW,
      { action: requestedAction, resource: "desktop/act/**", effect: "ask" },
    ]
    const registered = register({
      assertPermission: policyAssert(rules, (request) =>
        new Promise<void>((resolve, reject) => {
          finishAsk = (decision) =>
            decision === "allow" ? resolve() : reject(new Error("permission rejected"))
          observeAsk(request)
        }),
      ),
    })

    const execution = registered.tools.get("act")!.execute(
      applyInput,
      applyContext("build"),
    )
    const askRequest = await asked
    assert.equal(askRequest.action, requestedAction)
    assert.deepEqual(registered.backendCalls, [])
    finishAsk("allow")
    await execution
    assert.equal(registered.backendCalls.length, 1)
  }
})

test("configured mutation denials propagate without backend access", async () => {
  for (const deniedAction of ["desktop_mutate", "edit"]) {
    const rules: PermissionRule[] = [
      BASE_ALLOW,
      { action: deniedAction, resource: "desktop/act/**", effect: "deny" },
    ]
    const registered = register({ assertPermission: policyAssert(rules) })

    await assert.rejects(
      registered.tools.get("act")!.execute(applyInput, applyContext("build")),
      new RegExp(`Permission denied: ${deniedAction}`),
    )
    assert.deepEqual(registered.backendCalls, [])
  }
})

test("tree schema and argv accept only backend-supported fields", () => {
  const registered = register()
  const tree = registered.tools.get("tree")!

  assert.deepEqual(Object.keys(tree.input.properties), [
    "app",
    "appIndex",
    "appId",
    "maxDepth",
    "maxNodes",
    "all",
    "includeText",
  ])
  assert.equal(tree.input.additionalProperties, false)
  assert.deepEqual(
    buildDesktopArgs({
      verb: "tree",
      app: "Editor",
      maxDepth: 3,
      maxNodes: 9,
      all: true,
      includeText: true,
    }),
    {
      args: [
        "tree",
        "--app",
        "Editor",
        "--max-depth",
        "3",
        "--max-nodes",
        "9",
        "--all",
        "--include-text",
      ],
    },
  )

  for (const matcher of [
    { name: "Save" },
    { exactName: false },
    { role: "push button" },
    { showing: false },
    { nth: 1 },
  ]) {
    const result = buildDesktopArgs({ verb: "tree", app: "Editor", ...matcher })
    assert.ok("error" in result, `tree silently accepted ${JSON.stringify(matcher)}`)
    assert.match(result.error, /not supported with tree/)
  }
})

test("failed ambiguity results retain stdout candidates and stderr explanation within budget", () => {
  const result = describeDesktopFailure({
    code: 1,
    stdout: '[{"path":"2/1","name":"Save","role":"push button"}]',
    stderr: "desktop-control: 2 elements matched; rerun with --nth N",
  })

  assert.match(result, /stdout:/)
  assert.match(result, /\"path\":\"2\/1\"/)
  assert.match(result, /stderr:/)
  assert.match(result, /2 elements matched; rerun with --nth N/)

  const bounded = describeDesktopFailure({
    code: 1,
    stdout: `candidate ${"x".repeat(DESKTOP_CONTROL_MAX_OUTPUT_BYTES * 2)}`,
    stderr: "desktop-control: ambiguity explanation survives truncation",
  })
  assert.ok(Buffer.byteLength(bounded, "utf8") <= DESKTOP_CONTROL_MAX_OUTPUT_BYTES)
  assert.match(bounded, /desktop-control: ambiguity explanation survives truncation/)
})

test("truncation preserves UTF-8 boundaries for mixed 2-, 3-, and 4-byte characters", () => {
  const prefix = "desktop-control.py failed (exit 1)"
  const availableBytes =
    DESKTOP_CONTROL_MAX_OUTPUT_BYTES - Buffer.byteLength(prefix, "utf8") - 1
  const headings = Buffer.byteLength("stdout:\n", "utf8") +
    Buffer.byteLength("stderr:\n", "utf8") +
    Buffer.byteLength("\n\n", "utf8")
  const contentBudget = availableBytes - headings
  const stdoutLimit = Math.floor(contentBudget / 2)
  const marker = "\n...[truncated]"
  const bodyLimit = stdoutLimit - Buffer.byteLength(marker, "utf8")
  const mixedPrefix = "¢€😀"
  const mixedPrefixBytes = Buffer.byteLength(mixedPrefix, "utf8")

  for (const character of ["¢", "€", "😀"]) {
    const characterBytes = Buffer.byteLength(character, "utf8")
    for (let partialBytes = 1; partialBytes < characterBytes; partialBytes++) {
      const asciiPrefixBytes = bodyLimit - mixedPrefixBytes - partialBytes
      assert.ok(asciiPrefixBytes > 0)
      const beforeSuffixBytes = asciiPrefixBytes + mixedPrefixBytes + characterBytes
      const suffixBytes = stdoutLimit - beforeSuffixBytes + 1
      const stdout = `${"a".repeat(asciiPrefixBytes)}${mixedPrefix}${character}${"z".repeat(suffixBytes)}`
      assert.ok(Buffer.byteLength(stdout, "utf8") > stdoutLimit)

      const result = describeDesktopFailure({
        code: 1,
        stdout,
        stderr: "desktop-control: ambiguity details survive",
      })
      const stdoutSection = result.split("stdout:\n")[1].split("\n\nstderr:\n")[0]

      assert.ok(stdoutSection.endsWith(marker), `${character} cut after ${partialBytes} byte(s)`)
      assert.ok(!stdoutSection.includes("\uFFFD"), `${character} cut after ${partialBytes} byte(s)`)
      assert.match(result, /stderr:\ndesktop-control: ambiguity details survive/)
      assert.ok(Buffer.byteLength(result, "utf8") <= DESKTOP_CONTROL_MAX_OUTPUT_BYTES)
    }
  }
})

test("a JSON helper failure is condensed to its reason", () => {
  const result = describeDesktopFailure({
    code: 1,
    stdout: JSON.stringify({
      available: true,
      ok: false,
      error: "bridge-rejected",
      detail: "windowId is missing, ambiguous, or no longer current",
    }),
  })
  assert.match(result, /bridge-rejected/u)
  assert.match(result, /windowId is missing/u)
  assert.equal(result.includes('"available"'), false, "raw JSON framing must not reach the model")
})

test("a non-JSON helper failure still shows bounded output", () => {
  const result = describeDesktopFailure({ code: 2, stdout: "plain text diagnostics" })
  assert.match(result, /plain text diagnostics/u)
})

test("a condensed reason is truncated by bytes, not characters", () => {
  const long = "é".repeat(400)
  const result = describeDesktopFailure({
    code: 1,
    stdout: JSON.stringify({ error: "bridge-rejected", detail: long }),
  })
  assert.ok(Buffer.byteLength(result, "utf8") <= DESKTOP_CONTROL_MAX_OUTPUT_BYTES, "must respect the byte budget")
  assert.equal(result.includes("\uFFFD"), false, "must not split a multibyte character")
})
