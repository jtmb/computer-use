// Tests use the same existing SDK installation as typecheck:host, never a shim.
const core = new URL("../../opencode-plugins/resource-monitor/node_modules/@opentui/core/", import.meta.url)

export function resolve(specifier, context, nextResolve) {
  const entry = specifier === "@opentui/core" ? "index.node.js"
    : specifier === "@opentui/core/testing" ? "testing.js" : undefined
  return entry ? nextResolve(new URL(entry, core).href, context) : nextResolve(specifier, context)
}
