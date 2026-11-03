# Catalog Reconciliation

Read this file explicitly after creating, renaming, materially changing, or
retiring a skill, or when catalog drift is reported.

First identify whether the consumer project maintains a catalog or index and
which source is authoritative. Do not create a parallel index or prohibit a
format by name unless project instructions require that.

## Procedure

1. Enumerate skills from the configured source roots and discovery rules.
2. Read each relevant entry point and extract the fields the active loader and
   consumer's schema actually use.
3. Compare the source set with the existing catalog and project routing.
4. Update only stale counts, entries, paths, boundaries, examples,
   requirements, guides, categories, or tags affected by the requested change.
5. Preserve the catalog's established organization and prose style.

The catalog may summarize descriptions for readability, but it must not change
the trigger boundary or contradict `SKILL.md`.

## Verification

- Cataloged skills resolve to the configured source and entry files.
- Active skills are cataloged when the consumer's policy requires it.
- Names, counts, trigger boundaries, and relevant requirements agree with the
  consumer's schema and source.
- Project routing remains consistent with applicable instructions.
- All relative links resolve.

If catalog or routing edits are needed outside the authorized task scope,
report exact proposed paths and changes rather than making them.
