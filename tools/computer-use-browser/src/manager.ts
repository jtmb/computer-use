import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  LIMITS,
  type AuthGuardRuntime,
  type AuthGuardSignInPath,
} from "../../computer-use-runtime/src/index.ts";
import { BrowserBackendError, asBrowserError } from "./errors.ts";
import { createProfileGeneration, resolveBrowserProfile, type ProfileOptions } from "./profile.ts";
import type {
  BrowserOperation,
  BrowserOperationResult,
  BrowserWorker,
  CredentialFillResult,
  ElementTarget,
} from "./ops.ts";
import { buildChildEnvironment } from "./worker-child.ts";
import {
  decodeProtocolMessage,
  encodeProtocolMessage,
  FrameDecoder,
  isRecord,
  SCREENSHOT_CHUNK_BYTES,
  validateErrorCode,
} from "./protocol.ts";

export type BrowserSessionStatus = "starting" | "running" | "crashed" | "cancelling";

export interface BrowserWorkerHandle {
  execute<Operation extends BrowserOperation>(operation: Operation, signal?: AbortSignal): Promise<BrowserOperationResult<Operation>>;
  fillCredential?(
    target: ElementTarget,
    value: string,
    signal?: AbortSignal,
    options?: { readonly requirePasswordField?: boolean },
  ): Promise<CredentialFillResult>;
  terminate(): Promise<void>;
  isAlive(): boolean;
}

export type BrowserWorkerFactory = (
  profileDir: string,
  options: { readonly authFlow?: boolean },
) => Promise<BrowserWorkerHandle>;

export interface StartBrowserSession {
  readonly sessionId: string;
  readonly projectKey: string;
  readonly opencodeDataDir: string;
  readonly authFlow?: boolean;
  readonly envRoot?: string;
}

export interface BrowserManagerOptions {
  readonly workerFactory?: BrowserWorkerFactory;
  readonly authGuard?: AuthGuardRuntime;
}

export interface BrowserCredentialFillRequest {
  readonly sessionId: string;
  readonly target: ElementTarget;
  readonly value: Buffer;
  readonly signal?: AbortSignal;
  /** Require the target to be a password input; a private sign-in always does. */
  readonly requirePasswordField?: boolean;
}

export interface BrowserSessionSummary {
  readonly sessionId: string;
  readonly status: BrowserSessionStatus;
  readonly profileDir?: string;
}

export interface BrowserManager {
  start(input: StartBrowserSession, signal?: AbortSignal): Promise<BrowserSessionSummary>;
  restart(sessionId: string, signal?: AbortSignal): Promise<BrowserSessionSummary>;
  /** Aborting rejects the caller; a page action already dispatched may still complete. */
  execute<Operation extends BrowserOperation>(sessionId: string, operation: Operation, signal?: AbortSignal): Promise<BrowserOperationResult<Operation>>;
  fillCredential(signInPath: AuthGuardSignInPath, request: BrowserCredentialFillRequest): Promise<CredentialFillResult>;
  cancel(sessionId: string, signal?: AbortSignal): Promise<boolean>;
  listSessions(): readonly BrowserSessionSummary[];
}

interface SessionSlot {
  readonly input: StartBrowserSession;
  status: BrowserSessionStatus;
  profileDir?: string;
  worker?: BrowserWorkerHandle;
}

interface PendingResponse {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly chunks: Map<number, Uint8Array>;
  readonly signal?: AbortSignal;
  onAbort?: () => void;
  chunkCount?: number;
  totalBytes: number;
}

type BrowserChildProcess = ChildProcessByStdio<Writable, Readable, Readable>;

/**
 * How much worker/Chrome stderr is kept for diagnosis, and how much of it is
 * surfaced in an error message. The worker's stderr is a pipe the parent drains,
 * never an inherited descriptor: an inherited descriptor can be a socket whose
 * reader has gone away, and a write to it then raises SIGPIPE and kills Chrome or
 * the worker for no product reason.
 */
const STDERR_TAIL_BYTES = 2_048;
const ERROR_DETAIL_CHARS = 300;

function cancelledError(): BrowserBackendError {
  return new BrowserBackendError("CANCELLED", "The browser operation was cancelled; an already-dispatched page action may still have completed.");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError();
}

/** Signals safe to echo; any other child signal is folded to "other". */
const CRASH_SIGNAL_NAMES: ReadonlySet<string> = new Set([
  "SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGPIPE", "SIGINT", "SIGHUP",
]);

export class NodeWorkerHandle implements BrowserWorkerHandle {
  readonly #child: BrowserChildProcess;
  readonly #pending = new Map<string, PendingResponse>();
  readonly #abandoned = new Set<string>();
  readonly #decoder = new FrameDecoder();
  readonly #ready: Promise<void>;
  #readyResolve!: () => void;
  #readyReject!: (error: unknown) => void;
  #alive = true;
  #startupFailure: BrowserBackendError | undefined;
  #intentionalExit = false;
  #stderrTail = Buffer.alloc(0);
  #readiness: "not-observed" | "observed" = "not-observed";
  #childEvent: "exit" | "spawn-error" | "unknown" = "unknown";
  #exitCode: number | null = null;
  #signal: string | null = null;

  constructor(child: BrowserChildProcess) {
    this.#child = child;
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#readyResolve = resolve;
      this.#readyReject = reject;
    });
    child.stdout.on("data", (chunk: Buffer) => this.#onData(chunk));
    // Optional so test doubles and older callers without a stderr stream still work.
    child.stderr?.on("data", (chunk: Buffer) => this.#onStderr(chunk));
    child.once("error", () => {
      if (this.#childEvent === "unknown") this.#childEvent = "spawn-error";
      this.#markCrashed();
    });
    child.once("exit", (code, signal) => {
      if (this.#childEvent === "unknown") this.#childEvent = "exit";
      this.#exitCode = typeof code === "number" && Number.isSafeInteger(code) && code >= 0 && code <= 255 ? code : null;
      this.#signal = typeof signal === "string" ? (CRASH_SIGNAL_NAMES.has(signal) ? signal : "other") : null;
      this.#markCrashed();
    });
  }

  async waitUntilReady(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.#ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new BrowserBackendError("WORKER_START_FAILED", "The browser worker did not become ready.")), 30_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #onStderr(chunk: Buffer | string): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    const combined = Buffer.concat([this.#stderrTail, bytes]);
    this.#stderrTail = combined.length > STDERR_TAIL_BYTES ? combined.subarray(combined.length - STDERR_TAIL_BYTES) : combined;
  }

  #stderrDetail(): string {
    const text = this.#stderrTail.toString("utf8").replace(/\s+/gu, " ").trim();
    return text.slice(-ERROR_DETAIL_CHARS);
  }

  #markCrashed(): void {
    if (!this.#alive) return;
    this.#alive = false;
    if (!this.#intentionalExit) {
      // A worker that reports a startup failure then exits immediately can be
      // observed as a crash before its frame is processed; prefer the specific
      // startup cause when one was recorded.
      const base = this.#startupFailure
        ?? new BrowserBackendError("WORKER_CRASHED", "The browser worker exited unexpectedly.", {
          readiness: this.#readiness,
          childEvent: this.#childEvent,
          exitCode: this.#exitCode,
          signal: this.#signal,
        });
      // Surface a bounded tail of what the worker or Chrome actually said. Without
      // this, a startup kill is reported as an unexplained crash.
      const detail = this.#stderrDetail();
      const error = detail && !base.message.includes(detail)
        ? new BrowserBackendError(base.code, `${base.message} (${detail})`, base.crashMetadata)
        : base;
      this.#readyReject(error);
      for (const [id, pending] of this.#pending) {
        this.#clearPending(id, pending);
        pending.reject(error);
      }
      this.#pending.clear();
      this.#abandoned.clear();
    }
  }

  #clearPending(id: string, pending: PendingResponse): void {
    if (pending.onAbort) pending.signal?.removeEventListener("abort", pending.onAbort);
    this.#pending.delete(id);
  }

  #onData(chunk: Buffer): void {
    let frames: readonly Uint8Array[];
    try {
      frames = this.#decoder.push(chunk);
    } catch (error) {
      this.#failProtocol(error);
      return;
    }
    for (const frame of frames) {
      try {
        const message = decodeProtocolMessage(frame);
        if (!isRecord(message) || typeof message.type !== "string") throw new Error("Invalid response");
        if (message.type === "ready") {
          this.#readiness = "observed";
          this.#readyResolve();
          continue;
        }
        if (message.type === "startup-error") {
          const code = validateErrorCode(message.code);
          const base = typeof message.message === "string" ? message.message : "The browser worker failed to start.";
          const detail = typeof message.detail === "string" ? message.detail.trim().slice(0, 300) : "";
          const error = new BrowserBackendError(code, detail ? `${base} (${detail})` : base);
          this.#startupFailure = error;
          this.#readyReject(error);
          continue;
        }
        if (typeof message.id !== "string") throw new Error("Response id is missing");
        const pending = this.#pending.get(message.id);
        if (!pending) {
          if (message.type !== "chunk") this.#abandoned.delete(message.id);
          continue;
        }
        if (message.type === "chunk") {
          this.#receiveChunk(pending, message);
        } else if (message.type === "error") {
          const code = validateErrorCode(message.code);
          this.#clearPending(message.id, pending);
          pending.reject(new BrowserBackendError(code, typeof message.message === "string" ? message.message : "The browser request failed."));
        } else if (message.type === "response") {
          this.#clearPending(message.id, pending);
          pending.resolve(this.#decodeResult(pending, message.result));
        } else if (message.type === "credential-response") {
          this.#clearPending(message.id, pending);
          pending.resolve(message.result);
        } else {
          throw new Error("Unknown response type");
        }
      } catch (error) {
        this.#failProtocol(error);
        return;
      }
    }
  }

  #receiveChunk(pending: PendingResponse, message: Record<string, unknown>): void {
    const index = message.chunkIndex;
    const count = message.chunkCount;
    const data = message.data;
    const maximumChunks = Math.ceil(LIMITS.PNG_MAX_BYTES / SCREENSHOT_CHUNK_BYTES);
    if (
      !Number.isSafeInteger(index) || !Number.isSafeInteger(count) ||
      (index as number) < 0 || (count as number) < 1 || (count as number) > maximumChunks || (index as number) >= (count as number) ||
      typeof data !== "string" || data.length > Math.ceil(SCREENSHOT_CHUNK_BYTES / 3) * 4
    ) throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot chunk is invalid.");
    if (pending.chunkCount !== undefined && pending.chunkCount !== count) {
      throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot chunk count changed.");
    }
    pending.chunkCount = count as number;
    const bytes = Buffer.from(data, "base64");
    if (bytes.toString("base64") !== data || bytes.byteLength > SCREENSHOT_CHUNK_BYTES) {
      throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot chunk encoding is invalid.");
    }
    if (pending.chunks.has(index as number)) {
      throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot transfer contains a duplicate chunk.");
    }
    pending.totalBytes += bytes.byteLength;
    if (pending.totalBytes > LIMITS.PNG_MAX_BYTES) {
      throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot transfer exceeds its byte cap.");
    }
    pending.chunks.set(index as number, bytes);
  }

  #decodeResult(pending: PendingResponse, result: unknown): unknown {
    if (!isRecord(result) || result.binary !== true) return result;
    const byteLength = result.byteLength;
    const chunkCount = result.chunkCount;
    if (
      !Number.isSafeInteger(byteLength) || (byteLength as number) < 0 ||
      (byteLength as number) > LIMITS.PNG_MAX_BYTES ||
      !Number.isSafeInteger(chunkCount) || (chunkCount as number) < 1 ||
      pending.chunkCount !== chunkCount || pending.chunks.size !== chunkCount
    ) throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot transfer is incomplete.");
    const ordered: Buffer[] = [];
    for (let index = 0; index < (chunkCount as number); index += 1) {
      const part = pending.chunks.get(index);
      if (!part) throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot transfer has a missing chunk.");
      ordered.push(Buffer.from(part));
    }
    const bytes = Buffer.concat(ordered);
    if (bytes.byteLength !== byteLength) throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot size does not match its transfer metadata.");
    return new Uint8Array(bytes);
  }

  #failProtocol(reason: unknown): void {
    const error = asBrowserError(reason, "PROTOCOL_INVALID");
    this.#readyReject(error);
    for (const [id, pending] of this.#pending) {
      this.#clearPending(id, pending);
      pending.reject(error);
    }
    this.#pending.clear();
    this.#abandoned.clear();
    this.#child.kill("SIGTERM");
  }

  async execute<Operation extends BrowserOperation>(operation: Operation, signal?: AbortSignal): Promise<BrowserOperationResult<Operation>> {
    if (signal?.aborted) {
      throw new BrowserBackendError("CANCELLED", "The browser operation was cancelled; an already-dispatched page action may still have completed.");
    }
    if (!this.#alive) throw new BrowserBackendError("WORKER_CRASHED", "The browser worker is not running.");
    const id = `req-${randomUUID()}`;
    const frame = encodeProtocolMessage({ type: "request", id, operation });
    let sent = false;
    const result = new Promise<unknown>((resolve, reject) => {
      const pending: PendingResponse = { resolve, reject, chunks: new Map(), totalBytes: 0, ...(signal ? { signal } : {}) };
      pending.onAbort = () => {
        if (this.#pending.get(id) !== pending) return;
        this.#clearPending(id, pending);
        reject(new BrowserBackendError("CANCELLED", "The browser operation was cancelled; an already-dispatched page action may still have completed."));
        if (!sent) return;
        this.#abandoned.add(id);
        try {
          this.#child.stdin.write(encodeProtocolMessage({ type: "request-abort", id }), () => undefined);
        } catch {
          // Cancellation still rejects the caller if the worker has already stopped accepting input.
        }
      };
      this.#pending.set(id, pending);
      signal?.addEventListener("abort", pending.onAbort, { once: true });
      if (signal?.aborted) {
        pending.onAbort();
        return;
      }
      sent = true;
      try {
        this.#child.stdin.write(frame, (error) => {
          if (error) {
            this.#clearPending(id, pending);
            reject(new BrowserBackendError("WORKER_CRASHED", "The browser worker request could not be sent."));
          }
        });
      } catch {
        this.#clearPending(id, pending);
        reject(new BrowserBackendError("WORKER_CRASHED", "The browser worker request could not be sent."));
      }
    });
    return result as Promise<BrowserOperationResult<Operation>>;
  }

  async fillCredential(
    target: ElementTarget,
    value: string,
    signal?: AbortSignal,
    options?: { readonly requirePasswordField?: boolean },
  ): Promise<CredentialFillResult> {
    if (!this.#alive) throw new BrowserBackendError("WORKER_CRASHED", "The browser worker is not running.");
    if (signal?.aborted) throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "Credential fill was cancelled.");
    const id = `cred-${randomUUID()}`;
    const frame = encodeProtocolMessage({ type: "credential-fill", id, target, value,
      ...(options?.requirePasswordField === undefined ? {} : { requirePasswordField: options.requirePasswordField }) });
    const result = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, chunks: new Map(), totalBytes: 0 });
      this.#child.stdin.write(frame, (error) => {
        if (error) {
          this.#pending.delete(id);
          reject(new BrowserBackendError("WORKER_CRASHED", "The credential request could not be sent."));
        }
      });
    });
    const abortFrame = encodeProtocolMessage({ type: "credential-abort", id });
    const onAbort = (): void => {
      this.#child.stdin.write(abortFrame, () => undefined);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    try {
      const response = await result;
      if (!isRecord(response) || response.status !== "filled" || Object.keys(response).length !== 1) {
        throw new BrowserBackendError("PROTOCOL_INVALID", "The credential response is invalid.");
      }
      return Object.freeze({ status: "filled" });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  isAlive(): boolean {
    return this.#alive;
  }

  async terminate(): Promise<void> {
    if (!this.#alive) return;
    this.#intentionalExit = true;
    this.#alive = false;
      await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.#child.kill("SIGKILL");
        resolve();
      }, 1_500);
      this.#child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      this.#child.kill("SIGTERM");
      });
    for (const [id, pending] of this.#pending) {
      this.#clearPending(id, pending);
      pending.reject(new BrowserBackendError("WORKER_CRASHED", "The browser worker was cancelled."));
    }
    this.#pending.clear();
    this.#abandoned.clear();
  }
}

/**
 * The OpenCode server may run from a bundled binary rather than a Node
 * interpreter, so spawning `process.execPath` with Node flags can start the
 * wrong program and produce an unusable worker. Resolve a real Node binary.
 */
function resolveNodeBinary(): string {
  const explicit = process.env.OPENCODE_BROWSER_NODE ?? process.env.OPENCODE_NODE_BIN;
  if (explicit && existsSync(explicit)) return explicit;
  if (basename(process.execPath).replace(/\.exe$/u, "") === "node") return process.execPath;
  for (const candidate of [
    join(homedir(), ".opencode", "bin", "node"),
    "/usr/local/bin/node",
    "/usr/bin/node",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "node";
}

async function spawnWorker(profileDir: string, options: { readonly authFlow?: boolean }): Promise<BrowserWorkerHandle> {
  const entry = fileURLToPath(new URL("./worker-child.ts", import.meta.url));
  const env = buildChildEnvironment({ ...process.env });
  const child = spawn(
    resolveNodeBinary(),
    ["--experimental-strip-types", entry, profileDir, options.authFlow ? "auth" : "normal"],
    { cwd: profileDir, env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const worker = new NodeWorkerHandle(child);
  try {
    await worker.waitUntilReady();
  } catch (error) {
    await worker.terminate();
    throw asBrowserError(error, "WORKER_START_FAILED");
  }
  return worker;
}

function makeLocalWorkerFactory(worker: BrowserWorker): BrowserWorkerHandle {
  let alive = true;
  return {
    execute: async <Operation extends BrowserOperation>(operation: Operation, signal?: AbortSignal) => {
      throwIfAborted(signal);
      if (!alive) throw new BrowserBackendError("WORKER_CRASHED", "The browser worker is not running.");
      return worker.execute(operation, signal);
    },
    fillCredential: async (target: ElementTarget, value: string, signal?: AbortSignal, options?: { readonly requirePasswordField?: boolean }) => {
      if (!alive) throw new BrowserBackendError("WORKER_CRASHED", "The browser worker is not running.");
      return worker.fillCredential(target, value, signal, options);
    },
    terminate: async () => {
      if (!alive) return;
      alive = false;
      await worker.close();
    },
    isAlive: () => alive,
  };
}

export function createBrowserManager(options: BrowserManagerOptions = {}): BrowserManager {
  const sessions = new Map<string, SessionSlot>();
  const workerFactory = options.workerFactory ?? spawnWorker;

  function profileOptions(input: StartBrowserSession, generation?: string): ProfileOptions {
    return {
      opencodeDataDir: input.opencodeDataDir,
      ...(input.envRoot === undefined ? {} : { envRoot: input.envRoot }),
      ...(generation === undefined ? {} : { generation }),
    };
  }

  function summary(sessionId: string, slot: SessionSlot): BrowserSessionSummary {
    return Object.freeze({
      sessionId,
      status: slot.status,
      ...(slot.profileDir ? { profileDir: slot.profileDir } : {}),
    });
  }

  async function start(input: StartBrowserSession, signal?: AbortSignal): Promise<BrowserSessionSummary> {
    throwIfAborted(signal);
    if (!input || typeof input.sessionId !== "string" || typeof input.projectKey !== "string" || typeof input.opencodeDataDir !== "string") {
      throw new BrowserBackendError("INVALID_INPUT", "The session configuration is invalid.");
    }
    if (sessions.has(input.sessionId)) throw new BrowserBackendError("SESSION_STATE", "The session already has a worker.");
    if (input.authFlow && !options.authGuard) {
      throw new BrowserBackendError("AUTH_GUARD_BLOCKED", "An auth-flow session requires a runtime auth guard.");
    }
    if (sessions.size >= LIMITS.MAX_BROWSER_WORKERS) {
      throw new BrowserBackendError("CAPACITY_EXCEEDED", `At most ${LIMITS.MAX_BROWSER_WORKERS} browser workers may run concurrently.`);
    }
    const slot: SessionSlot = { input, status: "starting" };
    sessions.set(input.sessionId, slot);
    try {
      const profileDir = await resolveBrowserProfile(input.projectKey, input.sessionId, profileOptions(input));
      throwIfAborted(signal);
      slot.profileDir = profileDir;
      if (sessions.get(input.sessionId) !== slot || slot.status === "cancelling") {
        throw new BrowserBackendError("SESSION_STATE", "The session was cancelled while preparing its profile.");
      }
      const worker = await workerFactory(profileDir, { ...(input.authFlow ? { authFlow: true } : {}) });
      if (signal?.aborted) {
        await worker.terminate();
        throw cancelledError();
      }
      if (sessions.get(input.sessionId) !== slot) {
        await worker.terminate();
        throw new BrowserBackendError("SESSION_STATE", "The session was cancelled while starting.");
      }
      slot.worker = worker;
      slot.status = "running";
      return summary(input.sessionId, slot);
    } catch (error) {
      if (sessions.get(input.sessionId) === slot && slot.status !== "cancelling") sessions.delete(input.sessionId);
      if (signal?.aborted) throw cancelledError();
      throw asBrowserError(error, "WORKER_START_FAILED");
    }
  }

  async function restart(sessionId: string, signal?: AbortSignal): Promise<BrowserSessionSummary> {
    throwIfAborted(signal);
    const slot = sessions.get(sessionId);
    if (!slot || slot.status === "starting" || slot.status === "cancelling") {
      throw new BrowserBackendError("SESSION_STATE", "Only a crashed browser session can be restarted.");
    }
    if (slot.input.authFlow && !options.authGuard) {
      throw new BrowserBackendError("AUTH_GUARD_BLOCKED", "An auth-flow session requires a runtime auth guard.");
    }
    if (slot.worker?.isAlive()) throw new BrowserBackendError("SESSION_STATE", "The browser worker is still running.");
    slot.status = "starting";
    const generation = createProfileGeneration();
    try {
      const profileDir = await resolveBrowserProfile(slot.input.projectKey, slot.input.sessionId, profileOptions(slot.input, generation));
      throwIfAborted(signal);
      if (sessions.get(sessionId) !== slot) throw new BrowserBackendError("SESSION_STATE", "The session was cancelled while preparing its new profile.");
      const worker = await workerFactory(profileDir, { ...(slot.input.authFlow ? { authFlow: true } : {}) });
      if (signal?.aborted) {
        await worker.terminate();
        throw cancelledError();
      }
      if (sessions.get(sessionId) !== slot) {
        await worker.terminate();
        throw new BrowserBackendError("SESSION_STATE", "The session was cancelled while restarting.");
      }
      slot.profileDir = profileDir;
      slot.worker = worker;
      slot.status = "running";
      return summary(sessionId, slot);
    } catch (error) {
      if (sessions.get(sessionId) === slot) slot.status = "crashed";
      if (signal?.aborted) throw cancelledError();
      throw asBrowserError(error, "WORKER_START_FAILED");
    }
  }

  async function execute<Operation extends BrowserOperation>(
    sessionId: string,
    operation: Operation,
    signal?: AbortSignal,
  ): Promise<BrowserOperationResult<Operation>> {
    throwIfAborted(signal);
    if (options.authGuard && options.authGuard.guard.getState() !== "idle") {
      throw new BrowserBackendError("AUTH_GUARD_BLOCKED", "Browser operations are blocked during private sign-in.");
    }
    const guardOperation = operation.method === "snapshot"
      ? "observation"
      : operation.method === "screenshot"
        ? "screenshot"
        : operation.method === "info" || operation.method === "tabs.list"
          ? "status"
          : "control";
    try {
      options.authGuard?.guard.assertOperationAllowed(guardOperation);
    } catch {
      throw new BrowserBackendError("AUTH_GUARD_BLOCKED", "The browser operation is blocked during private sign-in.");
    }
    throwIfAborted(signal);
    const slot = sessions.get(sessionId);
    if (!slot || slot.status !== "running" || !slot.worker) {
      throw new BrowserBackendError(slot?.status === "crashed" ? "WORKER_CRASHED" : "SESSION_STATE", "The browser session is not available.");
    }
    try {
      return await slot.worker.execute(operation, signal);
    } catch (error) {
      const typed = asBrowserError(error, "WORKER_CRASHED");
      if (typed.code === "WORKER_CRASHED" || !slot.worker.isAlive()) slot.status = "crashed";
      throw typed;
    }
  }

  async function fillCredential(
    signInPath: AuthGuardSignInPath,
    request: BrowserCredentialFillRequest,
  ): Promise<CredentialFillResult> {
    const authGuard = options.authGuard;
    if (!authGuard || signInPath !== authGuard.signInPath) {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "Credential fill requires the private sign-in capability.");
    }
    if (authGuard.guard.getState() !== "filling") {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "The auth guard does not permit credential fill.");
    }
    if (
      !request || !Buffer.isBuffer(request.value) || request.value.byteLength < 1 ||
      request.value.byteLength > 4_096 || request.signal?.aborted ||
      (request.requirePasswordField !== undefined && typeof request.requirePasswordField !== "boolean")
    ) {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "The credential request is invalid or cancelled.");
    }
    let value: string;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(request.value);
    } catch {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "The credential request is invalid.");
    }
    const slot = sessions.get(request.sessionId);
    if (!slot || slot.status !== "running" || !slot.worker) {
      throw new BrowserBackendError("SESSION_STATE", "The browser session is not available.");
    }
    if (!slot.input.authFlow || !slot.worker.fillCredential) {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "Credential fill requires a protected auth-flow context.");
    }
    try {
      await slot.worker.fillCredential(request.target, value, request.signal, {
        requirePasswordField: request.requirePasswordField === true,
      });
    } catch (error) {
      const typed = asBrowserError(error, "OPERATION_FAILED");
      if (typed.code === "WORKER_CRASHED" || !slot.worker.isAlive()) slot.status = "crashed";
      throw typed;
    }
    return Object.freeze({ status: "filled" });
  }

  async function cancel(sessionId: string, signal?: AbortSignal): Promise<boolean> {
    throwIfAborted(signal);
    const slot = sessions.get(sessionId);
    if (!slot) return false;
    slot.status = "cancelling";
    sessions.delete(sessionId);
    await slot.worker?.terminate();
    return true;
  }

  function listSessions(): readonly BrowserSessionSummary[] {
    return Object.freeze([...sessions].map(([sessionId, slot]) => summary(sessionId, slot)));
  }

  return Object.freeze({ start, restart, execute, fillCredential, cancel, listSessions });
}

export function createLocalWorkerHandle(worker: BrowserWorker): BrowserWorkerHandle {
  return makeLocalWorkerFactory(worker);
}
