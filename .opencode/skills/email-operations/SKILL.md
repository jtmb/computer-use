---
name: email-operations
description: Draft, review and (only after explicit approval) send Gmail messages through the user's visible Chrome profile, including inline visuals and zip attachments. Use for composed emails, status updates, handoffs or deliverable packages. Never send without a fresh review gate.
metadata:
  schema-version: "1"
  category: "communication"
  tags: "email,gmail,chrome,draft,attachments,visuals,handoff"
---

# Email operations

Use this skill for Gmail work that must look like a deliberate human email, not a
raw dump of logs. The default output is a **saved draft in the user's Gmail**,
shown for review. Sending is a separate, explicit action.

## Non-negotiable gates

- **Do not send without explicit approval in the current conversation.** A saved
  draft, a previous approval for another email, or "looks good" on a different
  draft is not approval to send this one.
- **Do not claim to be the user.** If the user asks you to write on their behalf,
  identify yourself as an AI assistant working with them, unless they explicitly
  require a different disclosure.
- Never enter passwords, MFA codes, recovery codes or payment details. If Gmail
  asks for sign-in, stop and ask the user to complete it.
- Use the user's own browser/profile. Do not upload their cookie store, tokens or
  drafts anywhere.
- Keep the draft open and unchanged until the user reviews it. Do not "helpfully"
  press Send.

## Workflow

1. **Agree the brief.** Recipient, purpose, tone, what the recipient must do,
   deadline (if any), and whether the user wants to review before send.
2. **Write the copy first.** Use [email voice](references/email-voice.md). Keep it
   short, human and plain-English. If the recipient is non-technical, explain the
   outcome, not the implementation.
3. **Prepare assets.**
   - Report/PDF and supporting files in one zip.
   - Visuals as PNG/SVG. Prefer stable HTTPS URLs for inline images (for example
     raw files in the relevant repository branch). Gmail's Trusted Types blocks
     `innerHTML`; the helper uses DOM nodes instead.
   - Do not put secrets, tokens, private customer data or unredacted logs in an
     attachment or inline image.
4. **Open a draft in Gmail.** Use
   [start-gmail-cdp.sh](scripts/start-gmail-cdp.sh) to launch a separate Chrome
   instance with a **copy** of the user's profile and a CDP port, then
   [gmail-draft.mjs](scripts/gmail-draft.mjs) to fill the draft.
5. **Show the draft.** Capture the compose window (top, inline visuals, bottom)
   and present it. State the recipient, subject, attachment names and whether the
   draft is saved. Do not send.
6. **Send only after approval.** Re-run with `--send --approval "SEND <to> | <subject>"`.
   The helper refuses any other approval string.
7. **Record the outcome.** Report sent time, recipient, subject and attachment
   names. Never put the body or credentials in logs.

## Compose helper

```bash
SKILL_DIR=.opencode/skills/email-operations   # this bundle folder
# 1. Start a separate Chrome with a copied profile and CDP on :9222
$SKILL_DIR/scripts/start-gmail-cdp.sh --port 9222

# 2. Create/refresh the draft
node $SKILL_DIR/scripts/gmail-draft.mjs \
  --port 9222 \
  --to someone@example.com \
  --subject "Status update - ready for review" \
  --body-file /tmp/email-body.txt \
  --attach /tmp/deliverables.zip \
  --screenshot-dir /tmp/email-review

# 3. Inspect without changing anything
node $SKILL_DIR/scripts/gmail-draft.mjs --status --port 9222

# 3a. Discard a disposable draft
node $SKILL_DIR/scripts/gmail-draft.mjs --discard --port 9222

# 4. Send only after explicit approval
node $SKILL_DIR/scripts/gmail-draft.mjs \
  --port 9222 --send --approval "SEND someone@example.com | Status update - ready for review"
```

Useful flags: `--status` (read-only), `--new` (discard current and start
clean), `--discard` (remove a disposable draft), `--screenshot-dir` (review
captures), `--attach` (repeatable), `--image-url` (repeatable).

Inline images can be placed exactly where they belong in the body file:

```text
Here is the summary:

{{image https://example.com/summary.png}}

What changed:
...
```

The helper splits the body on `{{image URL}}` lines, inserts the text, pastes the
image as an inline element, and continues. A bare `--image-url` appends images at
the end.

## Gmail-specific quirks

- Use a **copy** of the Chrome profile. Chrome refuses a second instance on the
  same `--user-data-dir`; copying also leaves the user's main window untouched.
- Gmail uses **Trusted Types**: assigning `innerHTML` throws. Create DOM nodes and
  insert them with a `Range`, or use a TrustedHTML policy if unavoidable.
- Inline images must be reachable by Gmail. Local `file://` or `blob:` images may
  look right in the draft but disappear or fail on send. Use stable HTTPS URLs or
  Gmail's own upload control.
- Attach files by setting the compose `input[type=file][name="Filedata"]` with
  CDP `DOM.setFileInputFiles`; do not simulate clicks on the OS file picker.
- There can be more than one compose/draft. The helper fills the current compose
  if one is open; use `--new` to discard and start clean. Never discard a draft
  you did not create without asking.
- Drafts sync server-side. A draft created in the copied profile appears in the
  account's Drafts, but the copied Chrome window must stay open until the user
  has reviewed or sent it.

See [Gmail CDP notes](references/gmail-cdp.md) for selectors, failure modes and
the review checklist.

## Deliverable packaging

Use [package-deliverables.sh](scripts/package-deliverables.sh) to create one zip
plus SHA-256:

```bash
SKILL_DIR=.opencode/skills/email-operations   # this bundle folder
$SKILL_DIR/scripts/package-deliverables.sh \
  --output /tmp/Statusfactory_Deliverables.zip \
  report.pdf full-report.md handoff.md evidence.json sbom.json summary.png
```

Include a short `README.txt` in the zip that names each file and the source
commit/PR. Do not include secrets or local absolute paths.

## Safety boundaries

- Drafting is reversible; sending is not.
- Attachments and inline images are publication. Confirm the audience and that
  the content is safe for that audience.
- Do not send to a group, add CC/BCC recipients, or forward a thread unless the
  user named them.
- Do not alter the user's signature, labels, filters or account settings.
- If the browser profile is unavailable, the account is signed out, or CDP cannot
  attach, stop and report the exact blocker. Do not fall back to a different
  account or an invisible browser.

## Verification

Before reporting success:

1. `--status` shows the intended recipient chip, subject, body length, inline
   image count and attachment names.
2. Screenshots show the recipient, subject and at least the first and last part
   of the body.
3. No `blob:` image remains in the body.
4. The attachment list matches the zip exactly.
5. The draft is saved (Gmail shows "Draft saved" or the Drafts count changes).
6. Nothing was sent unless the approval string matched.

Read [README.md](README.md) for request examples and the full checklist.
