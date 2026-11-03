export const PNG_MAX_BYTES = 6_291_456;
export const CAPTURE_MAX_PIXELS = 8_388_608;
export const CAPTURE_CHUNK_BYTES = 49_152;
export const CAPTURE_DEADLINE_MS = 15_000;
export const TIMED_INPUT_MAX_MS = 2_000;
export const MAX_BROWSER_WORKERS = 2;
export const MAX_TABS_PER_WORKER = 8;

export const LIMITS = Object.freeze({
  PNG_MAX_BYTES,
  CAPTURE_MAX_PIXELS,
  CAPTURE_CHUNK_BYTES,
  CAPTURE_DEADLINE_MS,
  TIMED_INPUT_MAX_MS,
  MAX_BROWSER_WORKERS,
  MAX_TABS_PER_WORKER,
});

export const RUNTIME_ERROR_CODES = Object.freeze([
  "FOREIGN_ID",
  "INVALID_ID",
  "STALE_TARGET",
  "PROTOCOL_OVERFLOW",
  "PROTOCOL_INVALID",
  "QUEUE_FULL",
  "CANCELLED",
  "AUTH_GUARD_BLOCKED",
  "INVALID_CONTEXT",
  "INVALID_INPUT",
  "INVALID_AUTH_TRANSITION",
  "INTERNAL",
]);

const SAFE_MESSAGES = Object.freeze({
  FOREIGN_ID: "The identifier was not issued by this runtime.",
  INVALID_ID: "The supplied identifier is invalid.",
  STALE_TARGET: "The target is no longer current.",
  PROTOCOL_OVERFLOW: "The protocol frame exceeds the allowed size.",
  PROTOCOL_INVALID: "The protocol message is invalid.",
  QUEUE_FULL: "The owner operation queue is full.",
  CANCELLED: "The operation was cancelled.",
  AUTH_GUARD_BLOCKED: "The operation is blocked while private sign-in is active.",
  INVALID_CONTEXT: "The caller context is invalid.",
  INVALID_INPUT: "The supplied input is invalid.",
  INVALID_AUTH_TRANSITION: "The private sign-in state transition is invalid.",
  INTERNAL: "The operation failed.",
});

export class RuntimeError extends Error {
  constructor(code, _detail) {
    super(SAFE_MESSAGES[code]);
    this.name = "RuntimeError";
    this.code = code;
  }
}

export function formatRuntimeError(error) {
  if (error instanceof RuntimeError)
    return `${error.code}: ${SAFE_MESSAGES[error.code]}`;
  return `INTERNAL: ${SAFE_MESSAGES.INTERNAL}`;
}
