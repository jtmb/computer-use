import {
  PNG_MAX_BYTES,
  errorMessage,
  failureText,
  executeBridge as runBridge,
  parseBridgeResponse,
  permissionRequest,
  permissionResource,
  type BridgePermissionDependencies,
} from "./bridge.ts"
import type { DesktopToolContext, DesktopToolEditor } from "./desktop.ts"
import { createCredentialSafety, type CredentialSafety } from "./credential-safety.ts"

const WINDOW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]+$/i
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

type CaptureOutput = {
  windowId: string
  observationId: string
  width: number
  height: number
  sha256: string
  bytes: number
}

type CaptureToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "file"; uri: string; mime: string; name: string }
  >
}

type CaptureToolDefinition = {
  name: string
  description: string
  input: Record<string, unknown>
  options: { namespace: "desktop"; codemode: true }
  execute(input: Record<string, unknown>, context: DesktopToolContext): Promise<CaptureToolResult>
}

function textResult(text: string): CaptureToolResult {
  return { content: [{ type: "text", text }] }
}

function invalidRequest(message: string): CaptureToolResult {
  return textResult(`Invalid desktop capture request: ${message}`)
}

export interface CaptureToolDependencies extends BridgePermissionDependencies {
  /** Shared with the browser surface so a filled tab also blocks compositor capture. */
  credentialSafety?: CredentialSafety
}

export function registerCaptureTools<TTool>(
  editor: DesktopToolEditor<TTool>,
  dependencies: CaptureToolDependencies,
): void {
  const add = (tool: CaptureToolDefinition) => editor.add(tool as unknown as TTool)
  const execute = dependencies.executeBridge ?? runBridge
  const credentialSafety: CredentialSafety = dependencies.credentialSafety ?? createCredentialSafety()

  add({
    name: "capture",
    description:
      "Capture one exact compositor window through the GNOME bridge without activating it. Returns validated PNG bytes as an image attachment and a structured observation ID for subsequent desktop_input. Refuses captures over 6 MiB.",
    input: {
      type: "object",
      properties: {
        windowId: { type: "string", pattern: WINDOW_ID.source, description: "Exact current compositor ID from desktop_windows" },
        maxBytes: { type: "integer", minimum: 1, maximum: PNG_MAX_BYTES, description: `Maximum accepted PNG size in bytes (default ${PNG_MAX_BYTES})` },
      },
      required: ["windowId"],
      additionalProperties: false,
    },
    options: { namespace: "desktop", codemode: true },
    execute: async (input, context) => {
      if (!input || typeof input !== "object" || Array.isArray(input))
        return invalidRequest("expected an object")
      if (Object.keys(input).some((key) => key !== "windowId" && key !== "maxBytes"))
        return invalidRequest("only windowId and maxBytes are supported")
      if (typeof input.windowId !== "string" || !WINDOW_ID.test(input.windowId))
        return invalidRequest("windowId must be an exact current compositor ID")
      const maxBytes = input.maxBytes ?? PNG_MAX_BYTES
      if (!Number.isSafeInteger(maxBytes) || Number(maxBytes) < 1 || Number(maxBytes) > PNG_MAX_BYTES)
        return invalidRequest(`maxBytes must be an integer from 1 to ${PNG_MAX_BYTES}`)

      const resource = permissionResource("capture", input.windowId)
      await dependencies.assertPermission(permissionRequest(context, "read", resource))

      // The compositor window cannot be reliably bound to one browser session, so a
      // protected page in any session must block this shared-screen capture.
      if (credentialSafety.hasAnyFilled()) {
        return textResult(
          "Refused: a browser tab still has a credential filled and has not navigated since. Navigate that tab or close its browser session before capture.",
        )
      }

      let raw: string
      try {
        raw = await execute("capture", { windowId: input.windowId, maxBytes }, context.signal)
      } catch (error) {
        const message = failureText("Desktop capture executor failed", error)
        return textResult(message)
      }

      try {
        const response = parseBridgeResponse(raw, "Desktop capture")
        if (response.windowId !== input.windowId)
          throw new Error("capture target does not match the requested window")
        if (typeof response.observationId !== "string" || response.observationId.length < 1 || response.observationId.length > 128)
          throw new Error("capture returned an invalid observation ID")
        if (!Number.isSafeInteger(response.width) || Number(response.width) < 1 ||
            !Number.isSafeInteger(response.height) || Number(response.height) < 1)
          throw new Error("capture returned invalid image dimensions")
        if (typeof response.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(response.sha256))
          throw new Error("capture returned an invalid SHA-256 digest")
        if (typeof response.pngBase64 !== "string" || response.pngBase64.length === 0)
          throw new Error("capture returned no PNG bytes")
        const byteLimit = Math.min(PNG_MAX_BYTES, Number(maxBytes))
        if (response.pngBase64.length > Math.ceil(byteLimit / 3) * 4)
          throw new Error(`capture payload exceeds the ${byteLimit}-byte limit`)
        const bytes = Buffer.from(response.pngBase64, "base64")
        if (bytes.toString("base64") !== response.pngBase64)
          throw new Error("capture returned malformed base64")
        if (bytes.byteLength > PNG_MAX_BYTES || bytes.byteLength > Number(maxBytes))
          throw new Error(`capture payload exceeds the ${byteLimit}-byte limit`)
        if (bytes.byteLength < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
          throw new Error("capture payload does not have a PNG signature")

        const metadata: CaptureOutput = {
          windowId: input.windowId,
          observationId: response.observationId,
          width: Number(response.width),
          height: Number(response.height),
          sha256: response.sha256.toLowerCase(),
          bytes: bytes.byteLength,
        }
        const kib = Math.round(bytes.byteLength / 1024)
        // No `output` field on purpose: when a tool returns structured output the
        // harness surfaces that object instead of the content parts, which would
        // drop the image. The metadata rides in the text beside the PNG attachment.
        return {
          content: [
            {
              type: "text",
              text: `Captured ${metadata.width}x${metadata.height} PNG (${kib} KiB). ${JSON.stringify(metadata)}`,
            },
            { type: "file", uri: `data:image/png;base64,${response.pngBase64}`, mime: "image/png", name: "desktop-window.png" },
          ],
        }
      } catch (error) {
        // The bridge already says "Desktop capture failed: <detail>"; failureText keeps one prefix.
        const message = failureText("Desktop capture failed", error)
        return textResult(message)
      }
    },
  })
}
