# GitHub Operations Usage

**Auto-approve means no interactive questions** for authorized goal work, including
routine Git. Existing ask/confirm steps are interactive-mode guidance: under auto,
reuse authority/defaults or record blockers and continue, without asking.
See [the shared autonomy contract](../development-conventions/references/autonomous-work.md).

This guide explains the `github-operations` skill. Agent-facing rules remain in
[SKILL.md](./SKILL.md); OpenCode does not automatically load this guide.

Category: `applications`

Tags: `github`, `repositories`, `issues`, `pull-requests`, `automation`

## Purpose and when to use it

Use `github-operations` to inspect GitHub repositories, code, issues, pull
requests, checks, or releases, and to prepare or perform specifically authorized
remote changes.

## Prerequisites and setup verification

- Discover the GitHub integration exposed and configured for the current
  project; read its scope, permissions, and authentication documentation.
- Do not assume an MCP server, CLI, wrapper, toolset, token source, or connected
  status command is installed.
- Never ask the user to paste credentials into chat, configuration, logs, or
  evidence. Use only the target's supported authentication flow.

## How to request it

Name the exact repository, owner, branch, issue, pull request, or URL whenever
possible.

- "Summarize the open issues in this GitHub repository."
- "Review pull request 42 and report blocking concerns."
- "Check why the latest GitHub Actions run failed."
- "Prepare an issue comment, but do not publish it."

## Worked workflow and expected result

For a pull-request inspection:

1. Confirm the host, owner, repository, and pull request identity.
2. Read metadata, changed files, commits, and relevant checks through the
   supported integration.
3. Inspect only the repository content needed to assess the change.
4. Report findings with canonical GitHub links.
5. Leave reviews, comments, labels, merge state, and branches unchanged.

For a remote mutation, inspect the exact target and content, verify the required
authority, perform one bounded action, and re-read the result. Interactive
confirmation is required when policy says so; in auto/no-question mode use
existing exact authority or block without asking.

Expected result: verified GitHub state or one specifically authorized remote
change with its canonical URL.

## Verification and limitations

Available toolsets, read/write behavior, authentication refresh, and content
filtering depend on the configured integration. Read-only mode does not reduce
the credential's underlying account permissions. Treat content filters as
best-effort, not as a security boundary.

## Troubleshooting

- Authentication unavailable: follow the supported credential flow outside
  agent prompts and verify connection without displaying a token.
- `401` or `403`: check token expiration, repository scope, permissions,
  organization policy, and SSO authorization without printing credentials.
- Tools missing: inspect the configured toolset and permissions; do not widen
  them without authority.
- Mutation result unclear: re-read remote state before retrying.

## Safety

Credential changes, SSO authorization, permission changes, publishing, merging,
pushing, deployments, destructive remote operations, and account/security
settings require the authority applicable to that exact action. Never disclose
private repository content outside the requested destination.

## Related skills

- [`browser-assistant`](../browser-assistant/README.md) supports visible web
  workflows when user takeover is required and the integration is available.
- [`task-memory`](../task-memory/README.md) may retain approved workflow choices
  but never credentials or private repository content.
- [`skill-maintenance`](../skill-maintenance/README.md) maintains skill bundles.
