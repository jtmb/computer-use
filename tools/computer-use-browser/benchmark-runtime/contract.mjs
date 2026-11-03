export const EXPECTED_BROWSER_TOOLS = Object.freeze([
  "act", "close", "navigate", "open", "screenshot", "signin", "snapshot", "tabs",
])

export const BENCHMARK_LIMITS = Object.freeze({
  maxPairs: 8,
  maxConcurrentServers: 1,
  maxMessagePages: 8,
  maxMessagePageSize: 50,
  maxResponseBytes: 16 * 1024 * 1024,
  maxDispatches: 64,
})

export function makeConditionSchedule(pairs) {
  if (!Number.isSafeInteger(pairs) || pairs < 2 || pairs > BENCHMARK_LIMITS.maxPairs) {
    throw new TypeError(`pairs must be an integer from 2 to ${BENCHMARK_LIMITS.maxPairs}`)
  }
  return Array.from({ length: pairs }, (_, index) => ({
    pair: index + 1,
    order: index % 2 === 0 ? ["codemode", "directTools"] : ["directTools", "codemode"],
  }))
}

export function connectedCredentialIntegrationIDs(integrations) {
  if (!Array.isArray(integrations)) throw new TypeError("native integration inventory must be an array")
  return new Set(integrations
    .filter((integration) => typeof integration?.id === "string" && Array.isArray(integration.connections) &&
      integration.connections.some((connection) => connection?.type === "credential" && connection.status === undefined))
    .map((integration) => integration.id))
}

export function verifyDispatchExposure({ directTools, registeredTools, visibleTools }) {
  if (typeof directTools !== "boolean" || !Array.isArray(registeredTools) || !Array.isArray(visibleTools)) {
    return { complete: false, reason: "dispatch exposure evidence is missing or malformed" }
  }
  const registered = registeredTools
    .filter((tool) => tool?.namespace === "web")
    .map((tool) => tool.name)
    .sort()
  const expected = [...EXPECTED_BROWSER_TOOLS].sort()
  if (JSON.stringify(registered) !== JSON.stringify(expected)) {
    return { complete: false, reason: "the loaded production browser registration set is incomplete or unexpected" }
  }
  const direct = [...new Set(visibleTools.filter((name) => typeof name === "string" && name.startsWith("web_")))].sort()
  const expectedDirect = directTools ? expected.map((name) => `web_${name}`).sort() : []
  if (JSON.stringify(direct) !== JSON.stringify(expectedDirect)) {
    return { complete: false, reason: "the actual model-call tool snapshot does not match the requested directTools exposure" }
  }
  const codeModeExecutorVisible = visibleTools.includes("execute")
  if (codeModeExecutorVisible !== !directTools) {
    return {
      complete: false,
      reason: directTools
        ? "the directTools model-call snapshot exposed OpenCode's Code Mode executor"
        : "the Code Mode model-call snapshot did not contain OpenCode's Code Mode executor",
    }
  }
  const expectedVisible = (directTools ? expectedDirect : ["execute"]).sort()
  if (JSON.stringify([...new Set(visibleTools)].sort()) !== JSON.stringify(expectedVisible)) {
    return { complete: false, reason: "the actual model-call tool snapshot contains tools outside the benchmark allowlist" }
  }
  return {
    complete: true,
    directTools,
    registeredBrowserTools: registered,
    modelVisibleBrowserTools: direct,
    codeModeExecutorVisible,
  }
}

export function attestModelDispatch({
  directTools, registeredTools, event, expectedSessionID, expectedModel, variantPolicy = "exact", dispatches,
}) {
  if (!event || event.sessionID !== expectedSessionID) throw new Error("model dispatch session did not match the exact benchmark session")
  if (!Array.isArray(dispatches) || dispatches.length >= BENCHMARK_LIMITS.maxDispatches) {
    throw new Error("model dispatch exceeded the benchmark hard limit")
  }
  if (!event.model || event.model.providerID !== expectedModel?.providerID || event.model.id !== expectedModel?.id ||
      (variantPolicy !== "native-default" && (event.model.variant ?? null) !== (expectedModel?.variant ?? null)) ||
      (variantPolicy !== "native-default" && variantPolicy !== "exact")) {
    throw new Error("model dispatch did not use the exact selected model and variant")
  }
  const visibleTools = Object.keys(event.tools ?? {}).sort()
  const exposure = verifyDispatchExposure({ directTools, registeredTools, visibleTools })
  if (!exposure.complete) throw new Error(exposure.reason ?? "model-visible tool exposure was not verified")
  const result = {
    sessionID: expectedSessionID,
    model: event.model,
    visibleTools,
    exposure,
  }
  dispatches.push(result)
  return result
}
