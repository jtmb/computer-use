# Skill Lifecycle

Read this file explicitly before updating, renaming, deploying, or proposing
retirement of a skill.

## Update

1. Read the entire configured source bundle and all links it exposes.
2. Compare instructions with current consumer-project behavior and authoritative
   external documentation.
3. Search for references to names, paths, triggers, and changed claims.
4. Make the smallest change to the identified source of truth.
5. Update an existing catalog only when its content changed and that scope is
   authorized.
6. Validate the bundle and report unrelated opportunities without changing
   them.

Do not edit generated skill copies directly when the consumer's configuration
or instructions identify them as generated. Discover the actual destination;
never rely on a default path copied from another project.

## Rename

A rename affects the canonical directory, frontmatter name, catalog, links,
routing references, and deployed directory. Build an old-to-new manifest and
search the project before changing anything. Because removing the old name
deletes data, require explicit authority; in auto/no-question mode, block if it
is missing rather than asking.

## Deploy

Use the consumer's deployment tooling only after inspecting its behavior,
source, target, and authority. Confirm that it handles every required bundle
file and preserves unrelated target data before relying on it.

Verify at minimum:

- every source file exists at the same relative deployed path
- file contents match
- no required reference or runtime file was skipped
- unrelated deployed skills or files were not removed

After source or deployment changes, use a fresh session or restart only when the
active loader requires it. Verify discovery with the consumer's real workflow.

If deployment tooling omits required files, report the concrete mismatch. Do
not manually patch generated targets as a workaround.

## Retirement

Retirement is never automatic.

1. Verify the covered behavior is gone, replaced, or intentionally unsupported.
2. Search source, docs, catalog, routing policy, and deployed state for every
   reference.
3. Present or record the reason, replacement route, affected paths, and exact
   deletion manifest.
4. Require applicable explicit authority immediately before deletion. Under
   auto/no-question rules, block if authority is missing; do not ask.
5. Only after authority exists, delete the approved paths and update references.
6. Audit and verify that no stale links or routing entries remain.

## Version control

Do not make snapshot, maintenance, or follow-up commits automatically. Follow
the consumer's explicit commit/push authority rules and stage only intended
files after reviewing status and diff.
