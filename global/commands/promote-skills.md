---
description: Validate and deploy the canonical skills to the global directory.
agent: build
---

Deploy the canonical skills to the native global skills directory and verify
the result.

1. Read `AGENTS.md` and the `skill-maintenance` skill. Preserve unrelated dirty
   work.
2. Treat `.opencode/skills/` as the source of truth.
3. Preview, then deploy with the tracked script:

   ```bash
   ./scripts/deploy-skills.sh
   ./scripts/deploy-skills.sh --apply
   ```

   Add `--prune` to remove global skill directories that are no longer in the
   source. Without it, the script reports them but leaves them in place.

4. Verify the deployed tree matches the source and run the read-only health
   check from the repository root:

   ```bash
   ./scripts/health-check.sh
   ```

5. Confirm OpenCode discovers the global skills; restart the service with
   `Ctrl+P` > `service.restart` only if discovery does not refresh.
6. Never edit deployed copies by hand, delete preserved user files, commit, or
   push.
