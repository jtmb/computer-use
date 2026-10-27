# MCP and Plugin Parity

Every OpenCode v2 MCP/plugin declaration should have one canonical local source
and one bounded verification path. Do not register an entry that cannot be
resolved to a regular file or package below the repository's canonical
computer-use tree.

## Mapping

| v2 surface | Canonical source | Verification |
|--------------|----------|--------|
| Skills | `.opencode/skills/` | complete recursive copy |
| v2 plugins | `plugins/` | catalog + package check |
| Local MCP wrappers | `scripts/` | exact command path |
| Commands | `global/commands/` | source/target parity |

## Rule

When adding a v2 plugin or local MCP wrapper, update its canonical package,
configuration example/catalog, and focused verification together. Keep the
change v2-only and do not claim deployment success from a source-only check.
