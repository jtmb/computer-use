# Creating Skills

Read this file explicitly before creating a skill.

## Define scope

Start from concrete user intents and reusable behavior. Give one skill one
coherent responsibility. Prefer extending an existing skill when its trigger
and workflow already own the problem.

Before writing, inspect:

- applicable consumer project instructions for routing and repository rules
- the configured skill source, any catalog, and current discovery configuration
- adjacent bundles for established style
- implementation and authoritative external documentation for factual claims

## Choose a name

Use a name accepted by the active skill loader and consumer validator. Check
the configured source for collisions and match the directory and frontmatter
name where the loader requires it.

## Choose a structure

Use a single `SKILL.md` when the instructions remain focused. Use a split
bundle when detailed workflows would obscure routing and core rules:

```text
skills/<name>/
  SKILL.md
  README.md
  references/
    workflow-one.md
    workflow-two.md
```

Keep `SKILL.md` focused; follow any bundle-size or line limits that the consumer
actually documents. Keep supporting files focused, link references from the
entry point, and explicitly instruct the agent when to read them.

Do not add parallel metadata files unless a real consumer needs them and the
project maintains them. OpenCode reads skill instructions from `SKILL.md`.

## Write frontmatter

```yaml
---
name: example-skill
description: Perform a specific reusable workflow. Use when the user names the workflow, relevant files, or its common failure mode.
metadata:
  schema-version: "1"
  category: "desktop"
  tags: "example,skill,workflow"
---
```

Follow the active OpenCode version's documented frontmatter fields and the
consumer project's additional schema, if any. The base format requires `name`
and `description`; do not assume custom metadata keys or limits. Do not claim a
license that has not been granted. Read
[documentation-and-metadata.md](documentation-and-metadata.md) before creating
or changing usage documentation or metadata.

## Write useful instructions

Put routing, authority, paths, safety boundaries, and the normal workflow near
the start. Include commands only when they are current and safer than plain
prose. Define verification in terms of the user's outcome, not merely a zero
exit code.

Do not assume MCP servers, databases, agents, companion skills, or learning
logs. Mention integrations only when they exist in the consumer project and are
necessary to the workflow.

## Register and validate

Update an existing catalog or routing guide when the consumer maintains one; do
not create a new index or impose category/tag fields without a project
requirement. Run the checks in [validation-checklist.md](validation-checklist.md).
Verify runtime discovery through the real configured workflow before claiming
the skill is usable; source presence alone is not acceptance.
