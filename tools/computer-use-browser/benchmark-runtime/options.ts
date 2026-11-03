export type MeasureOptions = {
  mode: "measure"
  expectedSessionID: string
  expectedModel: { providerID: string; id: string; variant: string | null }
  variantPolicy: "exact" | "native-default"
  scenario: "normal" | "recoverable"
  directTools: boolean
  fixtureUrl: string
}

export function parseMeasureOptions(value: unknown): MeasureOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("measurement options are required")
  const options = value as Record<string, unknown>
  if (options.mode !== "measure") throw new TypeError("invalid benchmark measurement mode")
  if (options.scenario !== "normal" && options.scenario !== "recoverable") throw new TypeError("invalid benchmark scenario")
  if (typeof options.directTools !== "boolean") throw new TypeError("directTools must be boolean")
  if (typeof options.expectedSessionID !== "string" || !/^ses_[A-Za-z0-9][A-Za-z0-9_-]{0,123}$/u.test(options.expectedSessionID)) {
    throw new TypeError("invalid expected session ID")
  }
  if (!options.expectedModel || typeof options.expectedModel !== "object" || Array.isArray(options.expectedModel)) {
    throw new TypeError("expectedModel must identify the selected native model")
  }
  const model = options.expectedModel as Record<string, unknown>
  const providerID = model.providerID
  const id = model.id
  const variant = model.variant
  if (typeof providerID !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(providerID) ||
    typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/u.test(id) || id.includes("//") ||
    id.split("/").some((part) => part === "." || part === "..") ||
    !(variant === null || typeof variant === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(variant))) {
    throw new TypeError("expectedModel must preserve an exact model and explicit variant or null")
  }
  if (options.variantPolicy !== "exact" && options.variantPolicy !== "native-default") {
    throw new TypeError("variantPolicy must preserve an exact explicit variant or the native default variant")
  }
  if (options.variantPolicy === "native-default" && variant !== null) {
    throw new TypeError("native-default variant policy must not guess an expected variant")
  }
  if (typeof options.fixtureUrl !== "string" || !/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/(?:normal|recoverable)$/u.test(options.fixtureUrl) ||
    Number(new URL(options.fixtureUrl).port) < 1 || Number(new URL(options.fixtureUrl).port) > 65_535 ||
    new URL(options.fixtureUrl).pathname !== `/${options.scenario}`) {
    throw new TypeError("fixtureUrl must select the synthetic loopback page for the chosen scenario")
  }
  return { mode: "measure", scenario: options.scenario, directTools: options.directTools,
    expectedSessionID: options.expectedSessionID, expectedModel: { providerID, id, variant },
    variantPolicy: options.variantPolicy, fixtureUrl: options.fixtureUrl }
}
