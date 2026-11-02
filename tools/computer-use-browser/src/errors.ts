export const BROWSER_ERROR_CODES = [
  "INVALID_INPUT",
  "PROFILE_INVALID",
  "PROFILE_LOCKED",
  "CAPACITY_EXCEEDED",
  "FOREIGN_TAB",
  "TAB_LIMIT",
  "TAB_PROTECTED",
  "STALE_REF",
  "SNAPSHOT_TOO_LARGE",
  "SCREENSHOT_TOO_LARGE",
  "UPLOAD_INVALID",
  "WORKER_CRASHED",
  "WORKER_START_FAILED",
  "CANCELLED",
  "OPERATION_FAILED",
  "PROTOCOL_INVALID",
  "SESSION_STATE",
  "AUTH_GUARD_BLOCKED",
  "CREDENTIAL_FILL_BLOCKED",
  "CREDENTIAL_TARGET_INVALID",
  "CREDENTIAL_FILL_UNCERTAIN",
] as const;

export type BrowserErrorCode = (typeof BROWSER_ERROR_CODES)[number];

/** Copy-safe crash facts recorded by the worker supervisor; never raw child output. */
type BrowserCrashReadiness = "not-observed" | "observed";
type BrowserChildEvent = "exit" | "spawn-error" | "unknown";
type BrowserExitSignal =
  | "SIGTERM" | "SIGKILL" | "SIGABRT" | "SIGSEGV" | "SIGPIPE" | "SIGINT" | "SIGHUP" | "other";

interface BrowserCrashMetadata {
  readonly readiness: BrowserCrashReadiness;
  readonly childEvent: BrowserChildEvent;
  readonly exitCode: number | null;
  readonly signal: BrowserExitSignal | null;
}

const CRASH_SIGNALS: ReadonlySet<string> = new Set([
  "SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGPIPE", "SIGINT", "SIGHUP", "other",
]);

function ownDataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/** Accept only the fixed crash vocabulary; anything else drops the whole field. */
function normalizeCrashMetadata(value: unknown): BrowserCrashMetadata | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as object;
    if (Object.getOwnPropertyNames(record).length !== 4) return undefined;
    const readiness = ownDataValue(record, "readiness");
    const childEvent = ownDataValue(record, "childEvent");
    const exitCode = ownDataValue(record, "exitCode");
    const signal = ownDataValue(record, "signal");
    if (readiness !== "not-observed" && readiness !== "observed") return undefined;
    if (childEvent !== "exit" && childEvent !== "spawn-error" && childEvent !== "unknown") return undefined;
    const validCode = exitCode === null ||
      (typeof exitCode === "number" && Number.isSafeInteger(exitCode) && exitCode >= 0 && exitCode <= 255);
    if (!validCode) return undefined;
    if (!(signal === null || (typeof signal === "string" && CRASH_SIGNALS.has(signal)))) return undefined;
    return Object.freeze({
      readiness,
      childEvent,
      exitCode: exitCode as number | null,
      signal: signal as BrowserExitSignal | null,
    });
  } catch {
    return undefined;
  }
}

export class BrowserBackendError extends Error {
  readonly code: BrowserErrorCode;
  declare readonly crashMetadata?: BrowserCrashMetadata;

  constructor(code: BrowserErrorCode, message: string, crashMetadata?: unknown) {
    super(message);
    this.name = "BrowserBackendError";
    this.code = code;
    const normalized = normalizeCrashMetadata(crashMetadata);
    if (normalized !== undefined) {
      Object.defineProperty(this, "crashMetadata", {
        value: normalized, enumerable: false, writable: false, configurable: false,
      });
    }
  }
}

/**
 * Chromium network failure names are a fixed vocabulary, so they can be reported without
 * leaking page content, URLs or query strings. Everything else stays generic.
 */
const NETWORK_FAILURE = /\b(net::)?(ERR_[A-Z0-9_]+)\b/;

function describeFailure(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = NETWORK_FAILURE.exec(text);
  return match ? match[2] : undefined;
}

export function asBrowserError(error: unknown, fallback: BrowserErrorCode): BrowserBackendError {
  if (error instanceof BrowserBackendError) return error;
  const reason = describeFailure(error);
  return new BrowserBackendError(
    fallback,
    reason ? `network failure: ${reason}` : "The browser operation failed.",
  );
}
