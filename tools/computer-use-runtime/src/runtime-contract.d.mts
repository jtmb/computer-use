export const PNG_MAX_BYTES: number;
export const CAPTURE_MAX_PIXELS: number;
export const CAPTURE_CHUNK_BYTES: number;
export const CAPTURE_DEADLINE_MS: number;
export const TIMED_INPUT_MAX_MS: number;
export const MAX_BROWSER_WORKERS: number;
export const MAX_TABS_PER_WORKER: number;

export const LIMITS: Readonly<{
  PNG_MAX_BYTES: number;
  CAPTURE_MAX_PIXELS: number;
  CAPTURE_CHUNK_BYTES: number;
  CAPTURE_DEADLINE_MS: number;
  TIMED_INPUT_MAX_MS: number;
  MAX_BROWSER_WORKERS: number;
  MAX_TABS_PER_WORKER: number;
}>;

export const RUNTIME_ERROR_CODES: readonly [
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
];

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  constructor(code: RuntimeErrorCode, detail?: unknown);
}

export function formatRuntimeError(error: unknown): string;
