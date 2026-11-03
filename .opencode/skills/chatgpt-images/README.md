# ChatGPT Images

Generate a ChatGPT image, return it in the conversation, inspect it, and use the
resulting asset without confusing a saved filename with a delivered image.

## Prerequisites

- An available ChatGPT image-generation tool and an authorized existing account
  connection. Text chat working does not establish image-generation access.
- A mode that permits the operation, the required service/output permissions,
  and a project-approved destination when the tool saves files.
- A client/tool route that preserves native image attachments.

This skill is guidance, not an installation, credential store, or image service.
Discover the consuming project's integration and setup guide rather than copying
another machine's paths or configuration. Missing support is a reported blocker.

## How to ask

- "Generate a watercolor lighthouse at sunset and show the image here."
- "Create a clean blue-and-orange rocket illustration for this project."
- "Show the lighthouse image again without generating another one."
- "Inspect the image you generated, then use it in the approved hero section."

These are representative requests, not claims that a generation has been run.
One explicit generation request can consume the provider's allowance; extra
variations or retries are not automatic.

## Expected workflow

The optional [prompting reference](references/prompting.md) covers composition,
literal text and revisions without invented tool parameters. It is not loaded
automatically and does not add an image-generation/editing runtime.

The assistant discovers the actual image tool, prepares a prompt, and lets native
permission checks run. A successful tool returns an image attachment and, when
supported, a saved asset location. The assistant inspects the pixels and reports
whether they match the request. It does not substitute a path, external viewer,
or text-only response for the image requested in the conversation.

An instruction to use the result in a project is checked against the actual
target files. Existing assets are preserved; publication remains separate.

## Limits and troubleshooting

- No image tool: report unavailable capability; loading this skill cannot add it.
- Denied permission: respect the denial without broadening rules.
- Account/model/endpoint/quota failure: report the bounded error. Do not switch
  accounts, add API-key billing, or keep trying guessed routes.
- Image saved but not visible: report the delivery failure, inspect the saved
  image if authorized, and do not spend another generation just to retry display.
  Prefer the connector's read-only display tool when exposed. In OpenCode's TUI,
  press Ctrl+P, choose **Open settings**, then turn **Session -> Transcript
  images** on. This is the native renderer, not an image feature installed by the
  skill. Click a transcript thumbnail for its larger native preview. Model access
  to an attachment and observed human-visible rendering are separate evidence.
- Timeout/cancellation: completion may be uncertain. Do not automatically repeat.
- Editing an existing image, masks, reference inputs, output sizes, and batches
  depend on the discovered tool schema; this skill does not create those features.

## Related guidance

- [Skill instructions](SKILL.md) contain the operating workflow.
- [Files and documents](../files-and-documents/README.md) covers existing images
  and approved file organization.
- [Desktop vision](../desktop-vision/README.md) covers screen inspection, not
  ChatGPT image generation.
