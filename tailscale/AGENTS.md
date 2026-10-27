# Repository Agent Guidance

- Preserve unrelated and concurrent Docker/skill work. Inspect owned paths and reject symlinks before editing; change only files assigned to the current task.
- This repository owns Tailscale image/Compose work, Tailscale Kubernetes workload configuration, Tailscale-specific skills, and the private OpenCode V2 test. The bounded Kubernetes MCP implementation and MCP-specific skills belong to the separate Bortus MCP project; do not implement them here.
- Never read real secrets, private keys, or kubeconfig contents. Never commit secrets or print values. The local helper writes repository `.env` only after `--apply` and interactive prompts.
- Keep each project's secrets local to that project; do not automatically copy or share them. Do not add Bortus-only deployment token keys here.
- Default deployment exposure is tailnet-only Tailscale Serve; do not enable Funnel by default. Any host, cluster, GitHub, publishing, commit, or push mutation requires separate explicit approval.
- Run Python tests with bytecode disabled; secret-helper tests use synthetic data under `/tmp/opencode`. Do not stage or commit unless separately authorized.
