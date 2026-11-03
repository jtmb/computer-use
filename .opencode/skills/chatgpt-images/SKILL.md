---
name: chatgpt-images
description: Generate images through an available ChatGPT connector, return the actual image in the conversation, inspect the result, and use the generated asset. Use when the user asks to generate, create, show, or use a ChatGPT image; do not confuse text-only chat with image generation.
metadata:
  schema-version: "1"
  category: "files"
  tags: "images,chatgpt,generation,visual-verification"
---

# ChatGPT Images

Generate through the consumer's authorized ChatGPT image tool and bring the
actual image back into the same conversation. A saved path is not image delivery.

## Authority and prerequisites

- Discover the current image-generation tool, its exact schema, connection,
  permitted mode, output location, and client attachment support. Do not infer
  availability from this skill or another session's successful text chat.
- Reuse the user's existing approved connection. Never read credentials into
  chat, install another connector, change accounts/permissions, add API billing,
  or switch to browser automation to hide a missing capability.
- A generation request sends the prompt to the provider and can consume an
  allowance. Use existing exact authority; do not silently run extra generations.
- In Plan mode, describe the workflow without generating or writing images.
- In Build auto or no-question work, do not ask routine preferences or duplicate
  confirmations. Choose reversible prompt defaults within scope; record missing
  essential authority or capability as a blocker and continue independent work.

## Workflow

For nontrivial prompt composition, explicitly read the optional
[prompting reference](references/prompting.md). It is not loaded automatically
and adds no generation controls; follow the consumer's actual tool schema.

1. Distinguish creating a new image from reading an existing one. For ordinary
   image inspection, use the consumer's image-capable Read tool; load
   `files-and-documents` when available. Screen capture is a separate workflow.
2. Form one prompt preserving the requested subject, composition, style, colors,
   text, and constraints. Do not claim reference-image editing, masks, arbitrary
   sizes, or multiple outputs unless the discovered tool supports them.
3. Invoke the actual image-generation tool, not the connector's text-chat tool.
   Let native service and output permissions run; never bypass denial. The tool
   must bind output to the invoking session's approved destination.
4. Preserve native image content. With Code Mode, await the tool and return its
   result directly; do not replace it with JSON metadata, a sliced string, a
   filename, or echoed base64. Do not publish or serve the image to create a link.
5. Inspect the actual returned image against the prompt. To show a saved image
   again, prefer an available read-only `show_image` tool; discover its schema
   and pass only its supported filename/path. Never regenerate just to display.
   Distinguish model access from human UI rendering: on OpenCode's TUI, **Open
   settings -> Session -> Transcript images** controls transcript thumbnails.
   Verify that setting when relevant; do not claim human-visible pixels from a
   model attachment alone. Use the image-capable Read tool when no display tool
   is available and report any remaining client-display limitation.
6. Report the result concisely and retain the approved asset location. Before
   incorporating it into a project, inspect the target and preserve existing
   assets; generation does not authorize unrelated edits or publication.

## Failure and completion

- Report generation, safe-save, and attachment/rendering failures separately.
  HTTP authentication, entitlement, quota, model, and endpoint errors are not
  proof that reconnecting or changing billing will fix the problem.
- Cancellation or a timeout can leave the provider's completion uncertain.
  Do not automatically repeat a potentially successful generation or loop over
  guessed models/endpoints. Follow the tool's cancellation/cleanup behavior.
- A mock, unit test, text description, path, external link, or raw base64 does
  not prove that a real ChatGPT image was generated and brought into chat.
- Claim success only after real tool success and inspection of the image. If
  the client drops the attachment, keep the delivery requirement unmet.

## Usage guide

Read [README.md](README.md) when explaining setup, examples, or troubleshooting;
it is not loaded automatically with this skill.
