# Image prompt composition

Read this only for a nontrivial image prompt or a requested revision. The main
skill owns authorization, generation, save, attachment, and inspection rules.
This reference does not add a second image runtime.

## Verified route limits

Discover the consumer's actual tool schema first. The following is the source
host's dated connector example, not a universal image API or required provider.
Apply its limits only when the discovered route matches. That connector declares
one image-generation argument:

- `prompt`: a string from 1 to 4,000 characters;
- no other properties are accepted;
- the result is a validated PNG saved under the project's approved generated-image
  location and returned as image content.

Do not send `size`, `quality`, `model`, `mask`, `image`, `reference`, `seed`, or a
batch count. Those are not supported arguments. Do not claim exact dimensions,
transparency, multiple outputs, or input-image editing unless the discovered tool
schema actually exposes them. Describe a desired framing in prose, but treat the
final dimensions as the service's choice.

The optional display tool takes a saved filename only. Re-display does not justify
another generation. A generation can consume allowance; one request does not
authorize automatic variations or retries.

## Prompt shape

A useful prompt usually states, in this order:

1. **Subject:** the main object, action, or scene.
2. **Composition:** framing, viewpoint, placement, and negative space.
3. **Style or medium:** illustration, photograph, watercolor, diagram, and so on.
4. **Palette and light:** named colors, contrast, time of day, direction of light.
5. **Context:** background, setting, and scale.
6. **Constraints:** what must be absent, what must stay readable, and any literal
   text.

Keep the user's exact constraints. Do not add unrequested people, logos,
landmarks, slogans, borders, or decorative objects. When a detail is genuinely
ambiguous, choose a minimal reversible default and state it only if material.

### Specific beats vague

Weak: "a nice picture of a lighthouse."

Stronger: "A tall red-and-white striped lighthouse on a rocky island at sunset,
viewed from the sea at a slight low angle. Calm blue water, warm orange sky,
realistic watercolor texture, no text, no border, no people."

The stronger prompt names the subject, viewpoint, palette, medium, and the
constraints that prevent common extras. It does not invent a brand or a person.

### Text in images

Put literal text in quotes and preserve capitalization, punctuation, and line
breaks exactly. Keep requested text short; long or dense text is a frequent
failure mode even on capable services. Say "the words ... exactly" rather than
paraphrasing. After generation, inspect the actual pixels and report misspellings
or missing characters instead of assuming the text was rendered.

Follow the applicable provider rules, user scope and rights requirements; do not
claim rights clearance merely because a generation succeeded. This is not a blanket
prohibition on trademarks, public figures or identifiable people. When a specific
request is restricted, explain the actual restriction and offer an allowed
alternative instead of silently changing the subject or inventing provider policy.

### Constraints without invented parameters

Write exclusions as ordinary prose: "no text, no watermark, no border." Do not
label them a `negative_prompt` parameter, because the route does not expose one.
The same applies to aspect ratio and quality: describe the intent, but do not
present an unsupported setting as a guarantee.

## Revision prompts

When the user asks for a change:

- name the one aspect to change;
- repeat the constraints that must survive;
- do not rewrite the whole prompt from scratch or add unrelated improvements;
- inspect the new image against both the change and the preserved constraints;
- do not generate extra candidates to choose from unless the user asked for them.

A revision request is a new generation and may consume allowance. It is not a
free edit of the previous file.

## Examples

These are composition examples, not executed generations and not a claim about a
particular model's output.

**Product-style object, no text:**

"A single matte ceramic mug on a pale oak table, three-quarter view, soft morning
window light from the left, muted sage-green glaze, shallow depth of field, clean
neutral background, no text, no logo, no hands, no border."

**Editorial scene with exact words:**

"Wide editorial illustration of a small research boat at dawn, cool blue water and
a peach horizon, simple flat shapes with subtle grain, the words \"North Reef\" in
clean dark sans-serif letters on the boat's side, no other text, no border, no
people."

If the exact wording is shorter than the scene description, keep it that way. A
prompt that spends its budget on typography often loses the scene.

## Rights and provenance

This guidance is independently authored from the user's requirements and the
active tool schema. It does not copy text from an imported image skill. No
API-key command-line fallback, network helper, mask editor, or image-edit runtime
is added here. Generated assets remain subject to the provider's terms and the
consumer project's asset policy; the skill does not grant reuse rights.

## Limits

- The route accepts one prompt string only; unsupported controls are refused, not
  emulated.
- A prompt is not proof of visual fidelity, text accuracy, or rights clearance.
- The service chooses the output dimensions and may decline or alter a request.
- Inspection is required; a saved path or text description is not image delivery.
- If the image tool is unavailable, report that blocker. Do not substitute an API
  key, another account, or a browser upload.

Checked 2026-10-29 against the active connector's declared image tool schema:
one `prompt` string, maximum 4,000 characters, with no additional properties.
