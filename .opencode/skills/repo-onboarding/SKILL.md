---
name: repo-onboarding
description: Onboard a consumer repository to OpenCode v2 by inspecting its actual configuration, available integrations, permissions, and supported deployment workflow. Use for consumer-repository migration, agent/model setup, or integration verification.
metadata:
  schema-version: "1"
  category: "maintenance"
  tags: "onboarding,downstream,opencode,mcp,memory,integration"
---

# Repo Onboarding

## Auto-approve and autonomous work

In Build auto, project auto-approve, or explicit no-question work, do not ask
routine clarifying, preference, confirmation, Git, delegation-opt-in, or
"continue?" questions. Use existing authority and reversible defaults. If a
required approval or essential detail is missing, block that action, state the
reason, and continue independent work; never grant authority yourself.

Onboard a consumer repository to OpenCode v2 using its own instructions,
configuration, installed runtime, and available integrations. Do not assume a
particular source checkout, plugin, MCP server, database, command, deployment
target, or provider.

## Preflight (read-only)

1. Identify the target repository/worktree and read its applicable instructions.
   Inspect `git status --short` and preserve all existing changes.
2. Verify the OpenCode executable and version actually selected by that project.
   Read the matching schema and integration documentation before proposing a
   migration; do not apply v2 settings to a different runtime by assumption.
3. Inventory the existing project and user configuration at paths identified by
   the project's instructions or active runtime. Discover skill sources,
   generated destinations, plugins, agents, models, permissions, and configured
   MCP or other tool servers only when they exist.
4. Keep discovery read-only. Do not replace, format, normalize, deploy, restart,
   or alter credentials while inspecting the setup.

## Choose the integration

- Map the requested capability to tools and services actually available to the
  target project. Prefer supported existing functionality when it meets the
  need; avoid duplicate integrations.
- Use project-local extensions only for behavior the consumer needs and the
  existing runtime does not provide.
- Treat examples from another repository as illustrative. Verify paths, package
  names, provider/model IDs, permissions, and runtime support in the target.

## Configure safely

- Follow the active OpenCode version's documented schema and preserve the
  consumer's current settings as the migration baseline.
- Configure only the providers, agents, models, tools, and permissions needed.
  Discover recognized agent IDs, launch options, and admission limits instead
  of guessing their names, values, or ranges.
- Keep credentials out of source, configuration examples, logs, transcripts,
  and evidence. Use the target's supported authentication flow.
- Treat memory, browser, desktop, and repository services as optional. Read the
  relevant skill and provider documentation only when the project exposes that
  capability and the task needs it.

## Deploy only when authorized and understood

- Deployment is a separate scope from inspection or configuration advice. If it
  is requested, identify the actual source of truth, exact target, preview or
  verification mode, and preservation behavior before writing.
- Apply only through the consumer's documented mechanism and preserve unrelated
  files. Never patch installed binaries or generated/runtime copies directly.
- Restart or open a fresh session only when the active loader requires it; a
  restart by itself is not evidence that the integration works.

## Verify and report honestly

- Run the consumer's relevant checks and record exact commands and outcomes.
  Update an existing change log only when the project maintains one.
- Verify runtime discovery through an available supported workflow. Source
  inspection and package tests are not live acceptance.
- Report unavailable dependencies, denied tools, failed checks, and live
  verification not performed. Never promote a claim based only on configuration
  or deployment output.

## Common portability failures

- Copying absolute paths, model IDs, permissions, or provider configuration from
  another repository without checking the target.
- Assuming an MCP server, agent, plugin, tracking surface, or deployment script
  exists because a related skill describes one.
- Creating a duplicate integration when the runtime already provides the needed
  capability.
- Treating a successful write or restart as proof of discovery or behavior.
- Leaving stale environment-specific paths in consumer documentation.

## Usage guide

For request examples, prerequisites, verification, and safety guidance, read
[`README.md`](./README.md).
