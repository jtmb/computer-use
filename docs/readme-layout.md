# Computer-use README Layout Rules

These are local editorial and product requirements for this repository's root
`README.md`. They are not universal rules for the globally shared
`readme-maintenance` skill. Shared skills must follow the consumer project's
own instructions and identity.

## Reference inspected

The user requested the layout of the official OpenCode repository, not the
unrelated local Open Rig checkout:

- https://github.com/anomalyco/opencode/blob/2a0639a11f840c232a28cc1544434dc56affe2a0/README.md
- Reference branch: `dev`; inspected 2026-10-27.

OpenCode leads with centered branding, a one-line purpose, compact link/badge
rows, and a large linked product image. A separator leads into installation,
followed by short capability and documentation sections. Detailed instructions
live in linked guides rather than the opening overview.

This is a structural reference, not copied prose, a universal template, or proof
that OpenCode's platform and installation claims apply to computer-use.

## Apply the pattern here

1. Keep Splice, the existing computer-use name, approved palette, and useful alt
   text. Use a centered header and a single clear purpose sentence.
2. Keep navigation to a few real destinations: installation, skills, and docs.
   Do not invent badges, CI status, release numbers, community links, or licenses.
3. Put the demo directly below the header, before installation. Link to a still
   alternative and a focused recording guide; use one honest caption.
   For this repository, show actual OpenCode-driven computer use in real apps:
   browser tasks, shopping research, video discovery, and sample-email management.
   A setup dry run or animated CLI transcript does not meet that requirement.
4. Use short installation, usage/capability, documentation, and safety sections.
   Favor compact lists over exhaustive tables and nested explanations.
5. Retain the copyable single-line LLM setup prompt. Label it as a prompt, not a
   shell command. Keep preview-before-apply and the replacement/backup warning.
6. Link to `setup.md`, the existing skill catalog, and maintainer policy for detail.
   Do not put machine-specific audit paths, tool schemas, or every config flag
   into the human-facing introduction.
7. Keep the complete root file under 170 physical lines (169 maximum). Count
   blanks, HTML, fences, and captions; don't game the limit with giant lines.
8. Check local links, image sizing, and desktop/narrow plus light/dark previews.
   Do not equate a local GitHub-compatible preview with a published GitHub render.

The user's requested outcome is a short, welcoming landing page, not merely a
smaller line count. Preserve essential safety and accurate prerequisites while
moving the reader quickly from purpose to demo to setup.
