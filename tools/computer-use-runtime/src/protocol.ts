import { RuntimeError } from "./errors.ts";

export const MAX_PROTOCOL_FRAME_BYTES = 65_536;
export const MAX_PROTOCOL_NESTING_LEVELS = 4;
export const MAX_PROTOCOL_STRING_LENGTH = 8_192;
export const MAX_PROTOCOL_ARRAY_LENGTH = 256;

const MAX_PROTOCOL_VALUES = 4_096;
const MAX_PROTOCOL_TOTAL_STRING_BYTES = 32_768;
const MAX_PROTOCOL_OBJECT_KEYS = 256;
const MAX_PROTOCOL_KEY_LENGTH = 128;
const FRAME_PREFIX_BYTES = 4;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export type ProtocolValue =
  | null
  | boolean
  | number
  | string
  | readonly ProtocolValue[]
  | { readonly [key: string]: ProtocolValue };

export interface ProtocolCodec {
  encode(value: unknown): Uint8Array;
  decode(frame: Uint8Array): ProtocolValue;
}

interface ValidationBudget {
  values: number;
  stringBytes: number;
}

function addStringBudget(value: string, maximumLength: number, budget: ValidationBudget): void {
  if (value.length > maximumLength) {
    throw new RuntimeError("PROTOCOL_OVERFLOW");
  }
  budget.stringBytes += encoder.encode(value).byteLength;
  if (budget.stringBytes > MAX_PROTOCOL_TOTAL_STRING_BYTES) {
    throw new RuntimeError("PROTOCOL_OVERFLOW");
  }
}

// For object records, copy own data descriptors rather than invoking accessors.
// Encoding and decoding both pass through this same bounded normalizer.
function normalizeValue(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  budget: ValidationBudget,
  containerDepth: number,
  ancestors: Set<object>,
): ProtocolValue {
  budget.values += 1;
  if (budget.values > MAX_PROTOCOL_VALUES) {
    throw new RuntimeError("PROTOCOL_OVERFLOW");
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    addStringBudget(value, MAX_PROTOCOL_STRING_LENGTH, budget);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RuntimeError("PROTOCOL_INVALID");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new RuntimeError("PROTOCOL_INVALID");
  }
  if (containerDepth > MAX_PROTOCOL_NESTING_LEVELS) {
    throw new RuntimeError("PROTOCOL_OVERFLOW");
  }
  if (ancestors.has(value)) {
    throw new RuntimeError("PROTOCOL_INVALID");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_PROTOCOL_ARRAY_LENGTH || Object.keys(value).length !== value.length) {
        throw new RuntimeError("PROTOCOL_OVERFLOW");
      }
      const items: ProtocolValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new RuntimeError("PROTOCOL_INVALID");
        }
        items.push(
          normalizeValue(value[index], allowedKeys, budget, containerDepth + 1, ancestors),
        );
      }
      return items;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RuntimeError("PROTOCOL_INVALID");
    }

    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_PROTOCOL_OBJECT_KEYS || keys.some((key) => typeof key !== "string")) {
      throw new RuntimeError("PROTOCOL_OVERFLOW");
    }
    const normalized: Record<string, ProtocolValue> = {};
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new RuntimeError("PROTOCOL_INVALID");
      }
      if (
        key.length === 0 ||
        key.length > MAX_PROTOCOL_KEY_LENGTH ||
        FORBIDDEN_KEYS.has(key) ||
        !allowedKeys.has(key)
      ) {
        throw new RuntimeError("PROTOCOL_INVALID");
      }
      addStringBudget(key, MAX_PROTOCOL_KEY_LENGTH, budget);
      normalized[key] = normalizeValue(
        descriptor.value,
        allowedKeys,
        budget,
        containerDepth + 1,
        ancestors,
      );
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function validateAllowedKeys(keys: readonly string[]): ReadonlySet<string> {
  if (!Array.isArray(keys)) {
    throw new RuntimeError("INVALID_INPUT");
  }
  const allowed = new Set<string>();
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      key.length === 0 ||
      key.length > MAX_PROTOCOL_KEY_LENGTH ||
      FORBIDDEN_KEYS.has(key) ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(key)
    ) {
      throw new RuntimeError("INVALID_INPUT");
    }
    allowed.add(key);
  }
  return allowed;
}

export function createProtocolCodec(allowedKeys: readonly string[]): ProtocolCodec {
  const allowed = validateAllowedKeys(allowedKeys);

  function encode(value: unknown): Uint8Array {
    const normalized = normalizeValue(value, allowed, { values: 0, stringBytes: 0 }, 0, new Set());
    const payload = encoder.encode(JSON.stringify(normalized));
    if (payload.byteLength + FRAME_PREFIX_BYTES > MAX_PROTOCOL_FRAME_BYTES) {
      throw new RuntimeError("PROTOCOL_OVERFLOW");
    }

    const frame = new Uint8Array(FRAME_PREFIX_BYTES + payload.byteLength);
    new DataView(frame.buffer, frame.byteOffset, FRAME_PREFIX_BYTES).setUint32(
      0,
      payload.byteLength,
      false,
    );
    frame.set(payload, FRAME_PREFIX_BYTES);
    return frame;
  }

  function decode(frame: Uint8Array): ProtocolValue {
    if (!(frame instanceof Uint8Array) || frame.byteLength < FRAME_PREFIX_BYTES) {
      throw new RuntimeError("PROTOCOL_INVALID");
    }

    const declaredLength = new DataView(
      frame.buffer,
      frame.byteOffset,
      FRAME_PREFIX_BYTES,
    ).getUint32(0, false);
    if (declaredLength + FRAME_PREFIX_BYTES > MAX_PROTOCOL_FRAME_BYTES) {
      throw new RuntimeError("PROTOCOL_OVERFLOW");
    }
    if (frame.byteLength - FRAME_PREFIX_BYTES !== declaredLength) {
      throw new RuntimeError("PROTOCOL_INVALID");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(frame.subarray(FRAME_PREFIX_BYTES)));
    } catch {
      throw new RuntimeError("PROTOCOL_INVALID");
    }
    return normalizeValue(parsed, allowed, { values: 0, stringBytes: 0 }, 0, new Set());
  }

  return Object.freeze({ encode, decode });
}
