# Skill System Audit

Read this file explicitly when auditing one skill or the complete catalog.
Keep the audit read-only until findings and authorized scope are clear.

## Checks

### Source structure

- Canonical skill directories are direct children of `skills/`.
- Each has an uppercase `SKILL.md`.
- Frontmatter name matches the directory and satisfies the official pattern.
- Description is present, specific, and no longer than 1024 characters.
- Only recognized OpenCode skill frontmatter fields are used.
- Repository-required metadata, category, tags, and the skill-specific usage
  guide are present and consistent with the catalog.

### Content and references

- Instructions agree with the consumer's applicable project policy and current
  implementation.
- Commands, paths, versions, permissions, and safety gates remain accurate.
- Every linked reference is explicitly described and exists.
- Internal relative links resolve from the file containing each link.
- Historical files are clearly inactive and cannot be mistaken for policy.

### Routing and catalog

- Applicable project instructions route relevant user intents without
  ambiguous overlap.
- Any existing catalog entries and counts agree with configured skill source.
- No index, agent grant, database registration, or learning log is assumed
  unless the consumer's configuration establishes it.

### Deployment

- When deployment applies, its source and target are identified from actual
  consumer configuration and tooling.
- Generated files are distinguished from canonical source according to project
  policy.
- Required bundle files and preservation behavior are checked against the real
  deployment mechanism.
- Source/target parity and idempotence are verified only when deployment is in
  scope and can be checked safely.

### Runtime

- Runtime discovery is verified through the active loader workflow when
  available; a restart is not assumed or treated as proof by itself.
- The displayed name and description are correct.
- Loading the skill succeeds.
- A representative workflow explicitly reads its required reference and
  follows repository policy.

## Handling findings

Fix only findings inside the user's requested and permitted scope. Report all
others with evidence and affected paths. Never auto-commit. Never auto-delete;
preview a deletion manifest and ask immediately before the destructive action.
