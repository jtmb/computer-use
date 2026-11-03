---
name: files-and-documents
description: Find, inspect, organize, rename, summarize, and export local files and documents while preserving originals. Use for file organization, notes, or local DOCX, PDF, XLSX and CSV workflows; verify authoring prerequisites before promising edits.
metadata:
  schema-version: "1"
  category: "files"
  tags: "files,documents,organization,pdf"
---

# Files and Documents

Inspect first, preserve originals, and save only in approved locations.

## Auto-approve and autonomous work

In Build auto, project auto-approve, or explicit no-question work, do not ask
routine clarifying, preference, confirmation, Git, delegation-opt-in, or
"continue?" questions. Use existing authority and reversible defaults. If a
required approval or essential detail is missing, block that action, state the
reason, and continue independent work; never grant authority yourself.

## Locations

- Follow the current project's `AGENTS.md` or equivalent for permitted
  locations. Do not assume another project's home-directory policy.
- Keep code and utilities in the selected project or its established utility
  location; use the project's approved destination for final documents.
- Use the operating system or project-designated temporary directory for
  scratch and transient downloads.

Do not create output in private configuration/media locations or outside the
approved project/user destinations.

## Workflow

1. Use Glob/Grep and targeted Read calls before proposing organization.
2. For PDFs and images, use the Read tool directly. Extract only information
needed for the request.
3. Preview batch renames/moves/deletions as an old-to-new manifest.
4. Copy or move only after the user approves destructive/bulk changes.
5. Verify counts, names, sizes, and readability at the destination.

## Rules

- Never overwrite a distinct file silently. Use atomic writes and backups
for irreplaceable documents.
- Do not upload documents or quote unrelated private content.
- Preserve metadata when it matters and explain format conversion losses.
- Deletion, deduplication, and cleanup default to dry-run.
- Emptying trash is a separate, explicit action.

## Local document workflows

For DOCX, PDF, XLSX or CSV work, explicitly read the
[shared artifact contract](references/local-artifacts.md), then only the matching
format reference: [DOCX](references/local-docx.md), [PDF](references/local-pdf.md),
or [XLSX/CSV](references/local-spreadsheets.md). They are not loaded automatically;
ordinary file finding or renaming does not require these procedures. Discover the
consumer's actual tools, safe converter isolation and dependencies. Dated source-host
observations are not proof of authoring support on this machine. Missing libraries
or isolation remain prerequisites, not permission to install or bypass them.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md) for request examples, prerequisites, verification,
and safety requirements.
