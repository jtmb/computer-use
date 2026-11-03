import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  FrameDecoder,
  decodeProtocolMessage,
  encodeProtocolMessage,
  isRecord,
  parseCredentialAbortRequest,
  parseCredentialFillRequest,
  parseRequest,
  parseRequestAbort,
  SCREENSHOT_CHUNK_BYTES,
  type CredentialFillRequest,
} from "./protocol.ts";
import { BrowserBackendError, asBrowserError } from "./errors.ts";
import { createBrowserWorker, type BrowserContextLike, type BrowserLauncher, type BrowserWorker } from "./ops.ts";
import { validateBrowserProfile } from "./profile.ts";
import {
  chooseChannel,
  INSTALLED_CHROME_SANDBOX,
  sandboxHelperPath,
  type SandboxHelperIdentity,
} from "./channel.ts";

// A headed browser needs a display connection, so the display variables are part
// of the allowlist. They identify a socket, not a credential.
const ENV_NAMES = [
  "HOME", "PATH", "LANG", "PLAYWRIGHT_BROWSERS_PATH", "TMPDIR", "TZ",
  "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XAUTHORITY",
] as const;

export function buildChildEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const home = source.HOME || process.env.HOME || "/";
  const browserPath = source.PLAYWRIGHT_BROWSERS_PATH || `${home}/.cache/ms-playwright`;
  const result: NodeJS.ProcessEnv = {
    HOME: home,
    PATH: source.PATH || "/usr/local/bin:/usr/bin:/bin",
    LANG: source.LANG || "C.UTF-8",
    PLAYWRIGHT_BROWSERS_PATH: browserPath,
    TMPDIR: source.TMPDIR || tmpdir(),
    TZ: source.TZ || "UTC",
  };
  // Only present when the parent actually has a display; an undefined value
  // would otherwise be forwarded as an empty string.
  for (const name of ["DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XAUTHORITY"] as const) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) result[name] = value;
  }
  for (const name of Object.keys(result)) {
    if (!(ENV_NAMES as readonly string[]).includes(name)) delete result[name];
  }
  return result;
}

function send(message: unknown): void {
  const frame = encodeProtocolMessage(message);
  process.stdout.write(frame);
}

function responseMessage(id: string, value: unknown): void {
  if (value instanceof Uint8Array) {
    const chunkCount = Math.ceil(value.byteLength / SCREENSHOT_CHUNK_BYTES);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const start = chunkIndex * SCREENSHOT_CHUNK_BYTES;
      const chunk = value.subarray(start, start + SCREENSHOT_CHUNK_BYTES);
      send({ type: "chunk", id, chunkIndex, chunkCount, data: Buffer.from(chunk).toString("base64") });
    }
    send({ type: "response", id, result: { binary: true, byteLength: value.byteLength, chunkCount } });
    return;
  }
  send({ type: "response", id, result: value });
}

function errorMessage(id: string, error: unknown): void {
  const typed = asBrowserError(error, "OPERATION_FAILED");
  send({ type: "error", id, code: typed.code, message: typed.message });
}

/**
 * Recover a request id from a frame that failed validation.
 *
 * A request the parser rejects must still be answered: otherwise the caller waits
 * for a response that will never come and the tool call hangs until its deadline.
 * Only the id is read here, and only when it is a plausible bounded string.
 */
export function recoverRequestId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as Record<string, unknown>)["id"];
  if (typeof id !== "string" || id.length === 0 || id.length > 128) return undefined;
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(id)) return undefined;
  return id;
}

export function dispatchCredentialFill(worker: BrowserWorker, request: CredentialFillRequest, signal?: AbortSignal) {
  return worker.fillCredential(request.target, request.value, signal, { requirePasswordField: request.requirePasswordField });
}

async function run(): Promise<void> {
  const profileDir = process.argv[2];
  const authFlow = process.argv[3] === "auth";
  if (!profileDir || !profileDir.startsWith("/")) {
    throw new BrowserBackendError("PROFILE_INVALID", "The worker profile path must be absolute.");
  }
  await validateBrowserProfile(profileDir);

  const childEnvironment = buildChildEnvironment({ ...process.env });
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, childEnvironment);

  const playwright = await import("playwright-core");
  const chromium = playwright.chromium;
  const launch = (directory: string, launchOptions: Record<string, unknown>) =>
    chromium.launchPersistentContext(directory, launchOptions as never) as unknown as Promise<BrowserContextLike>;

  // Decide the browser *before* launching: a failed first attempt leaves a
  // SingletonLock and produces a misleading "browser has been closed" retry.
  // The bundled Playwright Chromium can only sandbox when unprivileged user
  // namespaces are allowed or its own chrome_sandbox is setuid root. When that
  // is unavailable we use the installed Google Chrome, whose sandbox helper is
  // setuid root — still sandboxed, TLS validated, dedicated profile. The
  // sandbox is never disabled. `channel.ts` owns the decision and documents why
  // no environment variable may override it.
  const helperIdentity = (helperPath: string): SandboxHelperIdentity | null => {
    try {
      const info = statSync(helperPath);
      return { uid: info.uid, mode: info.mode };
    } catch {
      return null;
    }
  };
  const unprivilegedNamespacesAllowed = (): boolean => {
    try {
      return readFileSync("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "utf8").trim() === "0";
    } catch {
      return true;
    }
  };

  const channel = chooseChannel({
    unprivilegedNamespacesAllowed: unprivilegedNamespacesAllowed(),
    bundledSandbox: helperIdentity(sandboxHelperPath(chromium.executablePath())),
    installedSandbox: helperIdentity(INSTALLED_CHROME_SANDBOX),
  });
  const launcher: BrowserLauncher = (directory, launchOptions) =>
    chromium.launchPersistentContext(directory, {
      ...(launchOptions as unknown as Record<string, unknown>),
      ...(channel === "bundled" ? {} : { channel }),
    } as never) as unknown as Promise<BrowserContextLike>;
  const worker: BrowserWorker = await createBrowserWorker({ profileDir, launcher, authFlow });
  process.stderr.write(`browser-worker-ready: channel=${channel}\n`);
  send({ type: "ready" });

  const decoder = new FrameDecoder();
  let serial = Promise.resolve();
  const activeCredentialFills = new Map<string, AbortController>();
  const activeRequests = new Map<string, AbortController>();
  process.stdin.on("data", (data: Buffer) => {
    let frames: readonly Uint8Array[];
    try {
      frames = decoder.push(data);
    } catch (error) {
      errorMessage("protocol", error);
      process.exitCode = 1;
      return;
    }
    for (const frame of frames) {
      let decoded: ReturnType<typeof decodeProtocolMessage>;
      try {
        decoded = decodeProtocolMessage(frame);
      } catch (error) {
        errorMessage("protocol", error);
        continue;
      }
      if (isRecord(decoded) && decoded.type === "credential-abort") {
        try {
          activeCredentialFills.get(parseCredentialAbortRequest(decoded))?.abort();
        } catch (error) {
          errorMessage("protocol", error);
        }
        continue;
      }
      if (isRecord(decoded) && decoded.type === "request-abort") {
        try {
          activeRequests.get(parseRequestAbort(decoded))?.abort();
        } catch (error) {
          errorMessage("protocol", error);
        }
        continue;
      }
      if (isRecord(decoded) && decoded.type === "credential-fill") {
        let request: ReturnType<typeof parseCredentialFillRequest>;
        try {
          request = parseCredentialFillRequest(decoded);
        } catch (error) {
          const id = recoverRequestId(decoded);
          if (id) errorMessage(id, error);
          else errorMessage("protocol", error);
          continue;
        }
        const controller = new AbortController();
        activeCredentialFills.set(request.id, controller);
        serial = serial.then(async () => {
          try {
            const result = await dispatchCredentialFill(worker, request, controller.signal);
            send({ type: "credential-response", id: request.id, result });
          } catch (error) {
            errorMessage(request.id, error);
          } finally {
            activeCredentialFills.delete(request.id);
          }
        });
        continue;
      }
      let request: ReturnType<typeof parseRequest>;
      try {
        request = parseRequest(decoded);
      } catch (error) {
        // Answer the caller even though the request was invalid, so a malformed or
        // drifted operation fails fast instead of hanging until a deadline.
        const id = recoverRequestId(decoded);
        if (id) errorMessage(id, error);
        else errorMessage("protocol", error);
        continue;
      }
      const controller = new AbortController();
      activeRequests.set(request.id, controller);
      serial = serial.then(async () => {
        try {
          const result = await worker.execute(request.operation, controller.signal);
          responseMessage(request.id, result);
        } catch (error) {
          errorMessage(request.id, error);
        } finally {
          activeRequests.delete(request.id);
        }
      });
    }
  });
  process.stdin.on("end", () => {
    void serial.finally(() => worker.close()).catch(() => {
      process.exitCode = 1;
    });
  });
  process.stdin.resume();
}

if (process.argv[1]?.endsWith("worker-child.ts")) {
  void run().catch((error: unknown) => {
    const typed = asBrowserError(error, "WORKER_START_FAILED");
    // Startup failures are otherwise indistinguishable (for example a sandbox
    // that cannot initialise). Keep one bounded, single-line cause for diagnosis;
    // it may contain a path but never a credential.
    const cause = error instanceof Error ? error.message.split("\n")[0].slice(0, 300) : "";
    // stderr is inherited by the manager's parent for diagnosis; the bounded
    // cause is the only thing written, never browser content or credentials.
    if (cause) process.stderr.write(`browser-worker-startup: ${cause}\n`);
    try {
      send({ type: "startup-error", code: typed.code, message: typed.message, detail: cause });
    } catch {
      process.stderr.write(`${typed.code}: ${typed.message}\n`);
    }
    process.exitCode = 1;
  });
}
