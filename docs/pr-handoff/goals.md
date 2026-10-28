# Goal Record

This is the sanitized goal context for PR #4. It intentionally excludes
cluster-specific goals, credentials, host names, addresses, and private
infrastructure details. The local goal store remains the raw source.

## Included goals

### 1. Reusable Kubernetes and Rancher skill

- Goal ID: `897361b6-5ff0-4dc8-81cd-7bb31e9e2ab2`
- Status: complete
- Objective: review recent migration sessions; extract reusable Kubernetes,
  Rancher, cluster-administration, migration, infrastructure, and
  troubleshooting knowledge; consolidate it into a modular, environment-agnostic
  skill with a lightweight index and focused references; separate reusable
  knowledge from migration-specific details, credentials, paths, and
  infrastructure assumptions; validate accuracy and discovery.
- Completion criteria:
  - A discoverable skill exists with a lightweight index and focused references.
  - Content is generalized and contains no credentials, host paths, IPs,
    repository names, or infrastructure identifiers.
  - Every link resolves; frontmatter, metadata, catalog, and routing are valid.
  - The health check passes and OpenCode exposes the skill.
- Outcome: added `.opencode/skills/kubernetes-rancher-operations/` with a
  156-line index and nine references; catalog and `AGENTS.md` routing updated.
- Decisions: see [`decisions.md`](./decisions.md).

### 2. Portable repository and deployment fixes

- Goal ID: `88bc586c-8e2e-4fdd-bcbe-efc7458e2b15`
- Status: complete
- Objective: audit and fix the uncommitted computer-use changes and affected
  tracked files so the repository is portable across users and operating
  systems; remove hardcoded home-directory and shell-specific paths; preserve
  unrelated work; verify with the health check, syntax checks, skill validation,
  and a focused diff review.
- Outcome: removed hardcoded home paths, added portable PATH/Node/TMPDIR
  handling, kept Debian and Fedora node checks, and documented the deployment
  model.

### 3. Portable deployment and review fixes

- Goal ID: `c0f276a9-7a78-4df9-b432-722e5a4078cc`
- Status: complete
- Objective: resolve the code-review findings: unify global skills path
  resolution, ensure config deployment cannot leave the machine without skills,
  harden the source symlink guard, handle stale global skills explicitly,
  enforce task-memory permissions, remove the retired Basic Memory health
  dependency, and strengthen skill-discovery verification.
- Completion criteria:
  - One resolver is used by deployment and health checks.
  - A full config deployment deploys skills.
  - Symlink handling cannot be bypassed.
  - Stale skills are handled explicitly.
  - Task memory documents 700/600 permissions.
  - Health checks validate discovery and no longer require the legacy helper.
  - All validation passes; no commit or push without approval.
- Outcome: added `scripts/opencode-paths.sh` and `scripts/deploy-skills.sh`;
  updated config deployment, health checks, task memory, docs, and scripts.

## Other goal records

The local goal store also contains cluster CVE/remediation goals that predate
this PR. They are not part of this PR and are deliberately omitted to avoid
publishing infrastructure identifiers, credentials, or operational details.
Their statuses are recorded locally and must be reviewed in the source session
when working on cluster operations, not in this PR.

## Goal-state limitations

- This file is a sanitized extract, not the raw goal JSON.
- Raw goal history and checkpoints remain in the local OpenCode goal store.
- No plan-level `decisions` array was recorded for the three included goals; the
  implementation decisions are documented separately in `decisions.md`.
