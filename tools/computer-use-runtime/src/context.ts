import { RuntimeError } from "./errors.ts";

export interface CallerAttribution {
  readonly sessionID: string;
  readonly agent: string;
  readonly messageID: string;
  readonly callID: string;
}

export interface ToolPermissionSource {
  readonly type: "tool";
  readonly messageID: string;
  readonly id: string;
}

export interface PermissionRequest {
  readonly permission: string;
  readonly source: ToolPermissionSource;
}

const FIELD_LIMITS = Object.freeze({
  sessionID: 256,
  agent: 128,
  messageID: 256,
  callID: 256,
});

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const ATTRIBUTION_KEYS = new Set(["sessionID", "agent", "messageID", "callID"]);

/**
 * Convert caller context into a stable permission-attribution value. Own data
 * descriptors avoid invoking accessors, and the detached frozen result cannot
 * be changed later through the caller's original object.
 */
export function validateCallerAttribution(value: unknown): CallerAttribution {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeError("INVALID_CONTEXT");
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RuntimeError("INVALID_CONTEXT");
  }

  const record = value as Record<string, unknown>;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !ATTRIBUTION_KEYS.has(key))) {
    throw new RuntimeError("INVALID_CONTEXT");
  }

  const validated: Record<string, string> = {};
  for (const [field, maxLength] of Object.entries(FIELD_LIMITS)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    const fieldValue = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (
      typeof fieldValue !== "string" ||
      fieldValue.trim().length === 0 ||
      fieldValue.length > maxLength ||
      CONTROL_CHARACTERS.test(fieldValue)
    ) {
      throw new RuntimeError("INVALID_CONTEXT");
    }
    validated[field] = fieldValue;
  }

  return Object.freeze(validated) as unknown as CallerAttribution;
}

export function createPermissionRequest(
  permission: string,
  attribution: CallerAttribution,
): PermissionRequest {
  if (
    typeof permission !== "string" ||
    permission.trim().length === 0 ||
    permission.length > 128 ||
    CONTROL_CHARACTERS.test(permission)
  ) {
    throw new RuntimeError("INVALID_INPUT");
  }

  const caller = validateCallerAttribution(attribution);
  return Object.freeze({
    permission,
    source: Object.freeze({
      type: "tool" as const,
      messageID: caller.messageID,
      id: caller.callID,
    }),
  });
}
