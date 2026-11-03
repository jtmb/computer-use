# Repo Onboarding Usage

**Auto-approve means no interactive questions** for authorized goal work, including
routine Git. Existing ask/confirm steps are interactive-mode guidance: under auto,
reuse authority/defaults or record blockers and continue, without asking.
See [the shared autonomy contract](../development-conventions/references/autonomous-work.md).

Use the [agent-facing workflow](./SKILL.md) to onboard a consumer repository to
OpenCode v2 using its own configuration and available integrations.

Category: `maintenance`

Tags: onboarding,downstream,opencode,mcp,memory,integration

## Purpose and when to use it

Use `repo-onboarding` to inspect a consumer repository, plan an OpenCode v2
migration, choose between available shared and project-local capabilities, or
verify an existing integration. The target project's instructions and runtime
configuration—not another repository's examples—are authoritative.

## Prerequisites and setup verification

- Identify the target repository and preserve its existing changes.
- Confirm the selected OpenCode executable and version.
- Discover active configuration paths, skill sources, plugins, agents,
  providers/models, permissions, and MCP or other tool servers when configured.
- Keep discovery read-only until the authorized write target and deployment
  behavior are understood.

## How to request it

- "Onboard this consumer repo to OpenCode v2; inspect first and preserve all
  existing changes."
- "Compare this repo's MCP and plugin setup with its configured shared tools;
  avoid duplicate integrations."
- "Set up only the consumer-specific agent and verify model IDs against the
  target provider catalog."

## Worked workflow and expected result

1. Inventory the consumer's actual configuration and available integrations.
2. Map the requested capability to an existing supported tool or a minimal
   project-local extension; do not assume a particular plugin, provider, or
   service.
3. Verify schema, version, provider/model IDs, recognized agent IDs, permissions,
   and existing tool declarations before making an authorized change.
4. If deployment is requested, identify the configured source, target, preview
   mode, preservation behavior, and any loader-specific reload requirement.
5. Keep secrets in the target's supported authentication store. Configure
   optional memory, browser, or desktop integrations only when the project
   exposes and requires them.
6. Run the target's relevant checks and verify runtime discovery when possible;
   report static checks separately from live acceptance.

Expected result: a minimal target-specific setup that reuses supported
capabilities, preserves existing configuration, and reports exact checks and any
unverified runtime behavior.

## Verification and known limitations

No deployment command, destination, restart requirement, provider, or memory
backend is assumed here. Verify those details from the target project's
instructions and active runtime. Configuration and package tests alone are not
live acceptance.

## Troubleshooting

- A copied example contains stale paths or IDs: inspect the active source and
  configuration, then replace only values verified for the consumer.
- A tool or provider appears configured but cannot be called: verify discovery,
  permissions, credentials, and service health independently.
- A runtime reload is needed: follow the active loader's documented procedure;
  do not assume every integration requires a restart.
- A required tool or integration is absent: report the concrete limitation
  rather than installing an unapproved substitute.

## Safety

- Follow the target project's approval and preview requirements before any
  configuration or deployment write.
- Keep provider and service secrets out of source, configuration, logs,
  transcripts, and evidence.
- Preserve unrelated files and dirty work. Never patch installed binaries or
  distribution files.
- Do not claim live behavior before any required reload and fresh verification.
  Commit and push require separate explicit approval for each action.

## Related skills

- [`agent-orchestration`](../agent-orchestration/README.md) covers bounded
  delegation when the runtime supports and authorizes it.
- [`skill-maintenance`](../skill-maintenance/README.md) covers source discovery,
  indexing, and validation for skill bundles.
- [`development-conventions`](../development-conventions/README.md) routes
  OpenCode configuration and documentation work.
