/**
 * Typed computer-use tools for the native GNOME desktop.
 *
 * Exposes the repository's screenshot and AT-SPI capabilities as OpenCode v2
 * tool definitions so the model sees a schema instead of recalling CLI flags.
 * `scripts/desktop-control.py` stays the single implementation of traversal,
 * preview tokens, and protected-field handling.
 */

import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { registerWindowTools } from "./windows.ts"
import { registerCaptureTools } from "./capture-tool.ts"
import { registerInputTools } from "./input-tool.ts"
import { registerBrowserTools, type BrowserToolDefinition } from "./browser-tools.ts"
import { stopBridgeDaemon } from "./bridge.ts"
import { withSerializedTools } from "./serialization.ts"
import { applyCodemodeDefault } from "./codemode.ts"
import { createCuaSessions, registerCuaTools, type ToolResult as CuaToolResult } from "./cua.ts"
import { createCredentialSafety } from "./credential-safety.ts"
import {
  createAuthGuard,
  createOwnerOperationQueue,
} from "../../../tools/computer-use-runtime/src/index.ts"

import { Plugin } from "@opencode/plugin"

import {
  executeDesktop,
  registerDesktopTools,
  DESKTOP_CONTROL_SCRIPT,
} from "./desktop.ts"

/** Desktop tools that must keep working while private sign-in is active. */
const DESKTOP_SIGN_IN_ALLOWED: ReadonlySet<string> = new Set(["release"])

export default Plugin.define({
  id: "computer-use.desktop",
  async setup(ctx) {
    // One guard instance per plugin load, created before tool registration so the
    // surfaces consult the same object. Passing it explicitly means "no guard" can
    // never be mistaken for "idle".
    const authGuard = createAuthGuard()
    // One bounded owner queue for the whole plugin load: the desktop and browser
    // surfaces each serialize per `surface:sessionID`, so concurrent calls in one
    // session cannot interleave compositor input or page mutations, while two
    // sessions stay independent.
    const operationQueue = createOwnerOperationQueue()
    // Ids this plugin registers, so the Code Mode transform can scope to them instead
    // of rewriting another plugin's tool that shares the `desktop`/`web` namespace.
    const registeredIds = new Set<string>()
    // Shared by both surfaces: a tab that had a credential filled must block
    // compositor capture as well as browser screenshots.
    const credentialSafety = createCredentialSafety()
    const assertPermission = (request: unknown) =>
      ctx.permission.assert(request as Parameters<typeof ctx.permission.assert>[0])
    const dataDirectory =
      process.env.OPENCODE_DATA_DIR ??
      (process.env.XDG_DATA_HOME
        ? join(process.env.XDG_DATA_HOME, "opencode")
        : join(homedir(), ".local", "share", "opencode"))
    // A registry replay must not recreate managers, ref generations or sign-in
    // ownership. Build definitions once, then replay only their registration.
    const browserDefinitions: BrowserToolDefinition[] = []
    const browserNamespaces: Array<{ name: string; description: string }> = []
    const browserLifecycle = registerBrowserTools<BrowserToolDefinition>({
      namespace: namespace => browserNamespaces.push(namespace),
      add: tool => browserDefinitions.push(tool),
    }, { assertPermission, dataDirectory, authGuard, credentialSafety })
    // Codex-parity persistent runtime: capture each surface's *wrapped* execute
    // so cua cells reuse the same validation, permissions and per-session queue.
    // Capturing after `withSerializedTools` matters; capturing before would
    // bypass serialization.
    const capturedToolExecutions = new Map<
      string,
      (input: never, context: never) => unknown
    >()
    // Registry transforms can replay on refresh. Keep the session store outside
    // the transform so refreshing tools does not silently erase live bindings.
    const cuaSessions = createCuaSessions(async (key, input, context) => {
      const execute = capturedToolExecutions.get(key)
      if (!execute) throw new Error(`cua runtime: ${key} is unavailable`)
      return await execute(input as never, context as never) as CuaToolResult
    })
    const capture = <T,>(base: T, surface: string): T => {
      const target = base as unknown as {
        namespace(input: unknown): void
        add(tool: unknown): void
      }
      return {
        namespace: (input: unknown) => target.namespace(input),
        add: (tool: unknown) => {
          const candidate = tool as { name?: unknown; execute?: unknown }
          if (typeof candidate.name === "string" && typeof candidate.execute === "function") {
            capturedToolExecutions.set(
              `${surface}:${candidate.name}`,
              candidate.execute as (input: never, context: never) => unknown,
            )
          }
          target.add(tool)
        },
      } as T
    }
    await ctx.tool.transform((editor) => {
      // The same guard as the browser surface: while private sign-in is active the
      // desktop surface is refused too, so a capture or a keystroke cannot observe or
      // type into the page the guard protects. `release` stays available because
      // blocking it during sign-in could leave a key or button held down.
      const desktopEditor = withSerializedTools(capture(editor, "desktop"), "desktop", {
        queue: operationQueue,
        authGuard,
        allowDuringSignIn: DESKTOP_SIGN_IN_ALLOWED,
        registeredIds,
      })
      registerDesktopTools(desktopEditor, { assertPermission, executeDesktop })
      registerWindowTools(desktopEditor, { assertPermission })
      registerCaptureTools(desktopEditor, { assertPermission, credentialSafety })
      registerInputTools(desktopEditor, { assertPermission })
      // One guard instance per plugin load. The private-entry path drives its
      // sign-in capability; the browser tools only observe it. Passing it here
      // means "no guard" can never be mistaken for "idle".
      const webEditor = withSerializedTools(capture(editor, "web"), "web", {
        queue: operationQueue,
        authGuard,
        // A private sign-in waits on a person typing; the dialog has its own 300 s
        // boundary, so the queue deadline must not cut it short.
        deadlines: { signin: 330_000 },
        // `close` discards the pages, so it stays available while sign-in is blocked: it is
        // the only way out of an uncertain fill without reloading the plugin.
        allowDuringSignIn: new Set(["close"]),
        registeredIds,
      })
      for (const namespace of browserNamespaces) webEditor.namespace(namespace)
      for (const tool of browserDefinitions) webEditor.add(tool as unknown as Parameters<typeof webEditor.add>[0])

      registerCuaTools(editor, { sessions: cuaSessions })
    })

    // Code Mode is the default surface. `directTools: true` in the plugin
    // options restores the pre-existing per-tool exposure without editing each
    // definition, so the rollback is one configuration change. The decision lives
    // in `codemode.ts`, where it is covered by tests.
    await ctx.tool.transform((editor) => {
      applyCodemodeDefault(editor, {
        directTools: ctx.options?.directTools === true,
        only: registeredIds,
      })
    })

    // Fail loudly in the log when the canonical Python utility is missing, so a
    // broken checkout is not mistaken for a tool-schema problem.
    if (!existsSync(DESKTOP_CONTROL_SCRIPT)) {
      console.error(
        `computer-use plugin: missing desktop-control script at ${DESKTOP_CONTROL_SCRIPT}`,
      )
    }

    return async () => {
      cuaSessions.dispose()
      const results = await Promise.allSettled([browserLifecycle.dispose(), stopBridgeDaemon()])
      const failures = results.filter(result => result.status === "rejected").map(result => result.reason)
      if (failures.length) throw new AggregateError(failures, "Computer-use cleanup was incomplete.")
    }
  },
})
