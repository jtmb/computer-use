# MCP and Plugin Parity

When a consumer project declares an OpenCode MCP server or plugin, identify its
actual source of truth and a bounded verification path. Do not assume the entry
is local, or that another project's repository paths apply.

## Mapping

| Surface | Consumer's source of truth | Verification |
|---|---|---|
| Skills | Configured skill source and loader | Entry files, references, and loader discovery |
| Plugins | Configured package or source entry | Resolved package, declared permissions, and runtime discovery |
| MCP servers | Configured server command or remote endpoint | Actual command/endpoint and exposed tool contract |
| Commands | Configured command source | Loader discovery and documented behavior |

## Rule

When changing an integration, update the owning source and configuration
documentation within scope, then run the consumer's focused verification. Do
not claim deployment or runtime success from source presence alone.
