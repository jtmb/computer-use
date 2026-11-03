// SDK 2.1.1's RPC compiler rejects JSON Schema patterns. Service validators still
// enforce exact IDs; retain lengths/enums/shapes without enabling regex compilation.
export function rpcCompatible<T>(contract: T): T {
  return JSON.parse(JSON.stringify(contract, (key, value: unknown) => key === "pattern" ? undefined : value)) as T
}

// Native RPC validates before HTTP serialization; present optional fields must
// not contain undefined (including nested sender workspace and page cursor).
export function rpcValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
