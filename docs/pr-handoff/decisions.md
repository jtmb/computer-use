# Implementation Decisions

These decisions explain why the PR looks the way it does. Treat them as
constraints when resolving conflicts; do not silently restore the replaced
patterns.

## D1. Use native global skill discovery

- Decision: remove the custom `skills` path from global and project config.
  Deploy bundles to the active global skills directory instead.
- Why: one source of truth, no checkout-path dependency, and native OpenCode
  discovery.
- Conflict rule: do not reintroduce a `skills` array pointing at a checkout.
  Keep the global deployment path and the catalog count correct.

## D2. Resolve the global config directory once

- Decision: `scripts/opencode-paths.sh` resolves the config directory from
  `OPENCODE_GLOBAL_CONFIG_DIR`, `OPENCODE_V2_CONFIG_DIR`,
  `OPENCODE_V2_PILOT_DIR`, or `opencode debug paths`, in that order.
- Why: deployment and health checks previously disagreed when XDG or overrides
  were used.
- Conflict rule: all three consumers must use the resolver; do not duplicate a
  `$HOME/.config` default.

## D3. A full config deployment also deploys skills

- Decision: `deploy-global-config.sh` deploys skills to
  `<config-dir>/skills` when `opencode.jsonc` is included. `--only` selections
  that exclude `opencode.jsonc` do not.
- Why: removing the config `skills` path without deploying would leave a fresh
  machine with no skills.
- Conflict rule: keep the coupling. Do not make a full deployment config-only.

## D4. Stale skills require explicit pruning

- Decision: `deploy-skills.sh` warns about global skills absent from the source;
  only `--prune` removes them, after a backup.
- Why: the global directory may contain user-managed skills that are not in this
  repository.
- Conflict rule: do not prune by default; do not delete unknown directories
  silently.

## D5. Task memory is local Markdown; Basic Memory is retired

- Decision: `task-memory` stores notes under
  `${XDG_DATA_HOME:-$HOME/.local/share}/opencode/task-memory/` with 700/600
  permissions.
- Why: removes the retired Basic Memory MCP and its unavailable wrapper.
- Conflict rule: do not merge the Basic Memory implementation or its health-check
  requirement back in.

## D6. PR #4 excludes email and browser work

- Decision: this PR contains only the Kubernetes skill and the portable
  deployment/review changes.
- Why: the email-management and browser commits belong to closed PR #2 and
  should not be resurrected under this title.
- Conflict rule: do not merge or cherry-pick PR #2 into this branch. If a change
  is required for the skill, make it explicitly in this PR.

## D7. Merge with a merge commit

- Decision: prefer a merge commit so the logical commits remain visible.
- Why: the deployment and review fixes are easier to audit separately.
- Conflict rule: a squash merge is acceptable only when the PR title/body carries
  the full context; do not force-push the branch.

## D8. Catalog conflicts are additive

- Decision: if another PR adds a skill first, keep both entries and set the
  catalog count to the actual number of skill directories.
- Why: the count and index are generated from the repository contents.
- Conflict rule: do not remove the Kubernetes entry to satisfy an older count.
