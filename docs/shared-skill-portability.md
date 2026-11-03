# Shared skill portability and local requirements

This note separates reusable skill guidance from requirements that belong only
to this repository. It is not a shared skill or a deployment manifest.

## Consumer-project boundary

Shared skills must follow the consuming project's instructions, source,
configuration, and available tools. Discover the configured skill roots,
integrations, platform, permissions, verification commands, and any deployment
workflow before relying on them. A skill name, source file, example command, or
configured integration is not proof that a tool is installed, reachable, or
accepted at runtime. Do not copy this checkout's paths, catalog, model/provider
choices, platform wiring, or deployment targets into another project. When a
required tool or authority is missing, report the concrete blocker and continue
independent authorized work.

The local skill catalog is useful for this checkout, but it is not a universal
catalog contract. Consumers should use their own configured catalog, if any.
The same boundary applies to cross-skill links: follow a companion bundle only
when it is included and configured for the consumer.

## Requirements local to this repository

- **Identity and root README:** Preserve Splice branding and the copyable
  single-line setup prompt. Keep the root `README.md` below 170 physical lines,
  and preserve preview-before-apply and replacement/backup warnings. Follow
  [`AGENTS.md`](../AGENTS.md) and the [README layout guide](readme-layout.md).
- **Main demo:** The replacement demo must show real OpenCode/tool activity
  beside actual application actions on one simultaneous timeline. An app-only
  clip, idle preflight, or fake/animated transcript does not qualify. Keep old
  recordings, create and review a short real-action preview, and obtain approval
  before replacing the main asset. The
  [simultaneous workflow](demo/simultaneous-workflow.md) is a bounded procedure,
  not blanket permission to capture. The deferred `desktop_screenshot` backend
  remains separately held; these demo instructions do not authorize invoking it.
- **Goal records:** Use supported goal tools for goal lifecycle and plan updates;
  do not edit raw goal storage or generated goal documents. Preserve the overall
  objective, ordered backlog, evidence, blockers, and phase boundaries. Goal
  planning, backlog sequencing, and lifecycle decisions are parent-only; a
  delegated worker may implement or verify only bounded authorized tasks, and
  the parent independently evaluates the evidence. See
  [goal-mode usage](goal-mode-usage.md) and [`AGENTS.md`](../AGENTS.md).
- **Integration claims:** Distinguish native OpenCode mechanisms from this
  checkout's custom plugins, local wrappers, and external MCP dependencies.
  Source presence is not deployment, runtime discovery, or acceptance evidence.
  The [feature inventory](features.md) records the observed local boundaries and
  outstanding limitations.

These local requirements must not be exported as universal rules in shared
skills. Conversely, making the shared skills portable does not relax this
repository's local requirements.

## Static audit limits

[`shared-skill-portability.test.mjs`](../scripts/shared-skill-portability.test.mjs)
checks selected source-text boundaries and local Markdown links in the in-scope
skill bundles. It does not validate a consumer's configuration, deployment,
tool availability, GUI behavior, or runtime acceptance. Those require separate
evidence from the actual consumer environment.
