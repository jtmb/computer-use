# Skill Documentation and Metadata

Read this file explicitly before adding or changing skill documentation,
frontmatter metadata, tags, usage guides, or catalog summaries. It describes how
to discover consumer requirements, not a universal repository schema.

The consumer project's instructions, active loader version, and any existing
validator define local requirements. Do not treat this bundle's source-repo
metadata conventions as mandatory elsewhere.

## Required frontmatter

For an OpenCode `SKILL.md`, follow the active loader's documented frontmatter
format. The current format requires `name` and `description`; optional fields
and their constraints must be checked against the version in use. A consumer
may impose additional metadata through its own validator; inspect that schema
before adding or editing fields.

```yaml
---
name: example-skill
description: Perform a specific reusable workflow. Use when the user names the workflow, relevant files, or its common failure mode.
metadata:
  schema-version: "1"
  category: "desktop"
  tags: "gnome,screenshot,visual-verification"
---
```

General checks:

- Confirm field names and types against the loader documentation; do not invent
  unsupported fields or assume a project-specific metadata map.
- Apply custom schema-version, category, tag, naming, and description-length
  rules only when the consumer's instructions or validator require them.
- Avoid parallel metadata files unless a real consumer needs them and the
  project explicitly maintains them.
- Match the skill name and source directory when the active loader requires it.

## Required usage guide

If the consumer project maintains user-facing usage guides, update the guide
that accompanies the skill without replacing the loader-facing `SKILL.md`.
Keep agent behavior and safety boundaries in the file the loader actually reads.
Do not require a `README.md` when the project does not use one.

When a usage guide is part of the project's conventions, a useful order is:

1. Purpose and when to use it.
2. Prerequisites and setup verification.
3. How to request it.
4. Worked workflow and expected result.
5. Tools or commands, including preview and write behavior.
6. Verification and known limitations.
7. Troubleshooting.
8. Safety, confirmation, and elevation requirements.
9. Related skills and documents.

Usage-guide rules:

- Show natural-language requests first. They are the normal interface.
- Distinguish loading the skill, agent MCP/tool calls, supporting terminal
  commands, and fixed MCP server wrappers.
- Verify examples against the consumer's actual scripts, configuration, file
  paths, flags, and safety behavior. Do not invent commands, tool names, or
  session-state behavior.
- State whether each example was actually executed or is a documented,
  representative invocation.
- Resolve links from the file that contains them. Use relative links only when
  the target is shipped with that document; otherwise use the consumer's
  established repository-link convention or identify the path clearly.
- State explicitly that README files and other references are not loaded
  automatically when the skill is loaded.

## Catalog synchronization

When documentation or metadata changes:

1. Update any usage guide the consumer maintains.
2. Reconcile any existing catalog or index according to its current schema and
   authority; do not create or regenerate a new index without a project need.
3. Preserve established routing boundaries, examples, and prose style.
4. Resolve local links and verify claims against source.
5. Run the project's actual metadata/documentation validator. Verify deployment
   and source/target parity only when deployment is explicitly in scope and the
   target/tooling are known.
