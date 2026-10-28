# Roadmap

## Phase 0 — complete

- Build the reusable Kubernetes/Rancher skill.
- Remove hardcoded home and shell paths.
- Add shared config-directory resolution.
- Add global skill deployment with backup, symlink refusal, stale-skill
  reporting, and optional pruning.
- Replace Basic Memory with local task memory.
- Harden the health check and add discovery verification.
- Publish PR #4.

## Phase 1 — merge

1. Confirm PR #4 is still mergeable against `main`.
2. If `main` advanced, merge it into `feat/kubernetes-rancher-operations`.
3. Resolve conflicts using [`decisions.md`](./decisions.md).
4. Run the verification suite in [`README.md`](./README.md).
5. Merge with a merge commit unless the maintainer requests squash.

Expected catalog result: 24 skills on the current `main` baseline. If another
skill PR merges first, keep both entries and update the count.

## Phase 2 — deploy and verify

```bash
./scripts/deploy-global-config.sh --apply
./scripts/health-check.sh
```

Restart the OpenCode service if `/api/skill` does not reflect the deployed
bundles. Verify a fresh session can discover the Kubernetes skill.

## Phase 3 — follow-ups

- Validate the scripts on a Fedora host; Debian/Fedora paths are audited but
  only exercised locally.
- Add CI for `bash -n`, `py_compile`, skill validation, and deployment dry-run.
- Decide whether to remove the remaining dormant Basic Memory code in
  `scripts/mcp_runtime.py` and `scripts/assistant-memory.py`.
- If PR #3 (README/splice/readme-maintenance) merges first, reconcile the catalog
  count and keep both new skill entries.
- Keep closed PR #2 out of this branch.
- Re-run health checks after any OpenCode upgrade.

## Exit criteria

- PR merged.
- Health check passes from the merged checkout.
- Global skills deploy successfully and are discoverable.
- No hardcoded user paths or credentials in repository files.
- Follow-ups are recorded as issues or a new roadmap item, not silently dropped.
