---
name: personality
description: Check, choose, or save the assistant's response style. Load at chat startup, after a long-chat summary when style context is missing, or when the user requests a different explanation style.
metadata:
  schema-version: "1"
  category: "communication"
  tags: "personality,communication,plain-english,response-style"
---

# Personality

A personality changes how an answer is explained, not what the assistant is
allowed to do. It never changes truthfulness, task scope, permissions, safety,
or the user's current request.

## Check the active style

1. Discover whether an authorized `personality` tool is available. If it is, use
   its `current` operation at the beginning of a chat, after a long-chat summary
   when the active style is missing, or after the user requests a style change.
   Load the exact returned skill ID. Do not check again on every turn.
2. If the tool is unavailable, follow an explicitly configured personality
   reminder or the user's current request. Do not claim a selection was saved.
   When this guide is explicitly selected without another style, load
   `personality-plain-english` if available.
3. A request such as "more detail this time" changes that answer only. Do not
   replace the saved personality unless the user asks to change it.
4. To change the current chat, use the tool's `select` operation. `reset`
   returns this chat to the configured default. Neither changes other chats.

## Save a personality

Only save when the user asks. Discover the tool's current schema and canonical
source root; never write a deployed copy or assume another project's paths.
Preview a new `personality-<name>` skill with its short description and response
instructions. Review the exact preview, then apply using its matching revision
and existing edit authority. A preview is not permission. Do not include private
conversation text, credentials, or an entire transcript. Saving does not select
the style, change a global default, deploy, commit, or push.

Each subtype is a separate, discoverable sibling skill. The relationship to
this parent is conceptual; do not hide subtype skills inside a folder already
containing `SKILL.md`. A subtype owns its response rules; this parent owns only
checking, selection, and saving.

If saving, checking, or selection fails, describe the limitation simply and
continue the user's task in the requested style where possible. In autonomous
work do not introduce routine questions or self-grant permissions.

For user-facing examples and setup limits, explicitly read
[README.md](README.md); it is not loaded automatically.
