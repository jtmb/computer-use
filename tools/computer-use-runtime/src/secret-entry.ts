import { spawn } from "node:child_process";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Labels and optional length bounds for one local secret-entry prompt. */
export interface SecretEntrySpec {
  readonly title: string;
  readonly label: string;
  readonly description?: string;
  /** Minimum Unicode code points; the transported value also has a byte cap. */
  readonly minLength?: number;
  /** Maximum Unicode code points; payloads are separately capped at 4,096 UTF-8 bytes. */
  readonly maxLength?: number;
}

/**
 * `cancelled` carries no value; `failed.code` is a status-only category. On
 * success, `value` is a separate Buffer that remains live after resolution.
 */
export type SecretEntryResult =
  | { readonly status: "ok"; readonly value: Buffer }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly code: string };

/** Cancellation and deadline controls for the helper process. */
export interface SecretEntryOptions {
  /** Abort before or during collection; an active helper is terminated. */
  readonly signal?: AbortSignal;
  /** Deadline in milliseconds (1–3,600,000); defaults to five minutes. */
  readonly timeoutMs?: number;
}

const MAX_SECRET_BYTES = 4_096;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_TIMEOUT_MS = 3_600_000;
const HELPER_PATH = fileURLToPath(
  new URL("../../../scripts/browser-auth-dialog.py", import.meta.url),
);

function validSpec(spec: SecretEntrySpec): boolean {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return false;
  const record = spec as unknown as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["title", "label", "description", "minLength", "maxLength"].includes(key))) return false;
  if (
    typeof record.title !== "string" || record.title.length < 1 || record.title.length > 200 ||
    typeof record.label !== "string" || record.label.length < 1 || record.label.length > 200 ||
    (record.description !== undefined && (typeof record.description !== "string" || record.description.length > 1_000))
  ) return false;
  const minimum = record.minLength ?? 0;
  const maximum = record.maxLength ?? MAX_SECRET_BYTES;
  return Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum) &&
    (minimum as number) >= 0 && (maximum as number) >= 1 &&
    (minimum as number) <= (maximum as number) && (maximum as number) <= MAX_SECRET_BYTES;
}

function dialogEnvironment(): NodeJS.ProcessEnv {
  const source = process.env;
  const environment: NodeJS.ProcessEnv = {
    GTK_A11Y: "none",
    HOME: source.HOME || "/",
    PATH: source.PATH || "/usr/local/bin:/usr/bin:/bin",
    LANG: source.LANG || "C.UTF-8",
  };
  for (const name of ["XDG_RUNTIME_DIR", "DISPLAY", "WAYLAND_DISPLAY"] as const) {
    if (source[name]) environment[name] = source[name];
  }
  if (source.XAUTHORITY) {
    const authority = resolve(source.XAUTHORITY);
    if (authority.startsWith("/run/user/")) environment.XAUTHORITY = source.XAUTHORITY;
  }
  return environment;
}

function decodePayload(payload: Buffer, spec: SecretEntrySpec): Buffer | undefined {
  if (payload.byteLength < 4) return undefined;
  const length = payload.readUInt32BE(0);
  if (length > MAX_SECRET_BYTES || payload.byteLength !== length + 4) return undefined;
  const value = Buffer.from(payload.subarray(4));
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    value.fill(0);
    return undefined;
  }
  const characterCount = [...text].length;
  const minimum = spec.minLength ?? 0;
  const maximum = spec.maxLength ?? MAX_SECRET_BYTES;
  if (characterCount < minimum || characterCount > maximum) {
    value.fill(0);
    return undefined;
  }
  return value;
}

/**
 * Collect one value through the local dialog helper using a bounded fd-3 frame.
 * The non-secret prompt spec is written to a temporary file and cleanup is
 * attempted before resolution; aborts and timeouts terminate the helper. On
 * ordinary success, `value` is a separate Buffer left live for its caller while
 * the internal frame is cleared. If cleanup fails, the value is cleared and the
 * result is changed to a cleanup failure.
 */
export async function spawnSecretEntry(
  spec: SecretEntrySpec,
  options: SecretEntryOptions = {},
): Promise<SecretEntryResult> {
  if (!validSpec(spec)) return { status: "failed", code: "invalid-spec" };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    return { status: "failed", code: "invalid-timeout" };
  }
  if (options.signal?.aborted) return { status: "failed", code: "aborted" };

  let temporaryDirectory: string | undefined;
  let child: ReturnType<typeof spawn> | undefined;
  let forceKillTimer: NodeJS.Timeout | undefined;
  let transportPayload = Buffer.alloc(0);
  let cleanupFailed = false;
  let result: SecretEntryResult = { status: "failed", code: "setup" };
  function signalHelper(signal: NodeJS.Signals): void {
    if (!child?.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, signal);
      else if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") cleanupFailed = true;
    }
  }
  try {
    result = await (async (): Promise<SecretEntryResult> => {
      temporaryDirectory = await mkdtemp(join(tmpdir(), "computer-use-secret-"));
      const specPath = join(temporaryDirectory, "dialog-spec.json");
      const specFile = await open(specPath, "wx", 0o600);
      try {
        await specFile.chmod(0o600);
        await specFile.writeFile(JSON.stringify(spec), "utf8");
        await specFile.sync();
      } finally {
        await specFile.close();
      }

      if (options.signal?.aborted) return { status: "failed", code: "aborted" };
      child = spawn("python3", [HELPER_PATH, specPath], {
        stdio: ["ignore", "ignore", "ignore", "pipe"],
        env: dialogEnvironment(),
        detached: process.platform !== "win32",
      });

      const spawned = child;
      let payloadOverflow = false;
      let timedOut = false;
      let aborted = false;
      let closed = false;

      function stop(reason: "timeout" | "abort" | "overflow"): void {
        if (closed) return;
        if (reason === "timeout") timedOut = true;
        if (reason === "abort") aborted = true;
        signalHelper("SIGTERM");
        forceKillTimer ??= setTimeout(() => signalHelper("SIGKILL"), 500);
      }

      spawned.stdio[3]?.on("data", (chunk: Buffer) => {
        if (transportPayload.byteLength + chunk.byteLength > MAX_SECRET_BYTES + 4) {
          payloadOverflow = true;
          stop("overflow");
          return;
        }
        const nextPayload = Buffer.concat([transportPayload, chunk]);
        transportPayload.fill(0);
        transportPayload = nextPayload;
      });

      let deadlineTimer: NodeJS.Timeout | undefined;
      const onAbort = (): void => stop("abort");
      options.signal?.addEventListener("abort", onAbort, { once: true });
      deadlineTimer = setTimeout(() => stop("timeout"), timeoutMs);
      if (options.signal?.aborted) stop("abort");

      const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        spawned.once("close", (code, signal) => {
          closed = true;
          resolve({ code, signal });
        });
        spawned.once("error", () => {
          closed = true;
          resolve({ code: null, signal: null });
        });
      }).finally(() => {
        clearTimeout(deadlineTimer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        options.signal?.removeEventListener("abort", onAbort);
      });

      if (aborted) return { status: "failed", code: "aborted" };
      if (timedOut) return { status: "failed", code: "timeout" };
      if (payloadOverflow) return { status: "failed", code: "protocol" };
      if (outcome.code === 2 && transportPayload.byteLength === 0) {
        return { status: "cancelled" };
      }
      if (outcome.code !== 0) {
        return { status: "failed", code: outcome.signal ? "child-signal" : "child-exit" };
      }
      const value = decodePayload(transportPayload, spec);
      if (!value) return { status: "failed", code: "protocol" };
      return { status: "ok", value };
    })();
  } catch {
    signalHelper("SIGKILL");
    result = { status: "failed", code: "setup" };
  } finally {
    // Descendants may retain fd 3 or survive after the direct helper has exited.
    signalHelper("SIGKILL");
    transportPayload.fill(0);
    if (temporaryDirectory) {
      try {
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) {
    if (result.status === "ok") result.value.fill(0);
    return { status: "failed", code: "cleanup" };
  }
  return result;
}
