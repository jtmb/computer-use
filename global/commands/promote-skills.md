---
description: Validate the canonical skills and confirm the active v2 skill path.
agent: build
---

Validate the canonical skills in this repository; no copy deployment is needed
because the global config points at `.opencode/skills`.

1. Read `AGENTS.md` and the `skill-maintenance` skill. Preserve unrelated dirty
   work.
2. Run the read-only health check:

   ```bash
   /home/shak/repos/computer-use/scripts/health-check.sh
   ```

3. Confirm the global config `skills` path points at
   `~/repos/computer-use/.opencode/skills`.
4. Restart OpenCode only if the configuration or skill source changed.
5. Never edit deployed copies, delete preserved user files, or commit changes.
