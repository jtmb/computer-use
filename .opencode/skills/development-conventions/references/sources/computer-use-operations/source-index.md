# OpenCode Integration Operations

Generic boundaries for OpenCode MCP/plugin configuration, skill discovery, and
deployment. This bundle originated in a consumer repository with its own
concrete paths and tools; use the consumer's instructions and configuration to
identify equivalents rather than copying those local assumptions.

## 🔴 HARD RULEs

- **Inspect the active loader and version** — do not assume the consumer's
  configuration or runtime uses the same layout as this source repository.
- **Identify the source of truth** — discover the configured skill, plugin,
  command, and wrapper locations from project instructions and configuration.
- **Verify before writing** — inspect the actual operation's target and effects;
  follow the consumer's approval and preview requirements.
- **Check complete bundles where applicable** — verify that required files are
  preserved and that generated targets are not mistaken for canonical source.

## Integration and tool consistency

- For a declared MCP server or plugin, verify that its configured entry resolves
  to the source/package the consumer actually maintains.
- Keep permissions, target selection, and write behavior consistent across the
  configuration, wrapper, and implementation.
- UI-facing tool claims need the appropriate accessible and visual checks; do
  not generalize one project's desktop or browser backend to another.

## Runtime layering

```
OpenCode runtime → configured integration (when used) → implementation → target/resource
```

Each layer validates its boundary and preserves the ownership of the next
layer. Verification helpers must not mutate live user state or skip the target's
safety checks.

## Idempotent setup

- Apply idempotence and preservation rules only when they match the consumer's
  actual implementation and ownership model.
- Inspect the configured source and target, the command or tool used, and its
  preview/write behavior before running any deployment workflow.
- Verify required files and resulting runtime discovery with project-provided
  checks; do not invent a health-check script or deployment flag.

## References

- See `references/mcp-tool-parity.md` for keeping v2 tool declarations and
  local wrappers aligned.
- See `references/layered-crud.md` for the OpenCode v2 ownership boundaries.
- See `references/dashboard-ui.md` for accessible interactive-surface patterns.
