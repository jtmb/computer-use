---
description: Refresh the tracked OpenCode v2 global configuration.
agent: build
---

Refresh the global OpenCode v2 configuration from this repository.

1. Read `AGENTS.md`, `README.md`, and `setup.md` first. Preserve unrelated dirty
   work.
2. Work from `~/repos/computer-use`.
3. Preview the deployment:

   ```bash
    ./scripts/deploy-global-config.sh
   ```

4. Review the preview and the active-config diff before any write. If a template
   copy would discard live settings, use the narrow additive deployer instead.
   Apply only the reviewed, approved scope:

   ```bash
    ./scripts/deploy-global-config.sh --apply
   ```

5. Preserve live model, permission, voice and extra-plugin settings that differ
   from the template. Use a narrow additive deployer when a full template copy
   would discard them. A shared service restart requires separate approval;
   prefer a supported configuration reload only within the approved deployment.
6. Do not commit, push, or edit deployed copies. Commit approval and push
   approval are separate.
