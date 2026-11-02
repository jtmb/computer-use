# Email operations

Draft and review Gmail messages in the user's own Chrome session, with inline
visuals and zip attachments. Sending is a separate, explicitly approved action.

## What it is for

- "Draft an email to <person> about <topic>."
- "Send the release notes with the PDF and screenshots."
- "Put the summary image in the body and attach the deliverables zip."
- "Write it in my voice, but say you're my AI assistant."
- "Show me the draft in Gmail before sending."

## Prerequisites

- Linux desktop with Google Chrome (or Chromium) and a signed-in profile at
  `~/.config/google-chrome`.
- Node.js 22+ (global `fetch`/`WebSocket`).
- A stable HTTPS URL for each inline image, or use Gmail's own upload control.
- The recipient, subject, body and attachment paths.

The helper copies the Chrome profile to a temp directory and launches a separate
Chrome instance with CDP. It never modifies the main profile and never asks for a
password.

## Quick start

```bash
SKILL_DIR=.opencode/skills/email-operations   # this bundle folder
# 1. Launch the separate Chrome with CDP
$SKILL_DIR/scripts/start-gmail-cdp.sh --port 9222

# 2. Write the body (images can be placed exactly where they belong)
cat > /tmp/email-body.txt <<'TEXT'
Hi Shak,

I'm an AI assistant working with James on this. Here's the short version.

{{image https://example.com/summary.png}}

What changed:
- ...
- ...

I've attached the zip with the full report.

Cheers,
James's AI assistant
TEXT

# 3. Create the draft
node $SKILL_DIR/scripts/gmail-draft.mjs \
  --port 9222 \
  --to iserve4u@gmail.com \
  --subject "Status update - ready for review" \
  --body-file /tmp/email-body.txt \
  --attach /tmp/Statusfactory_Deliverables.zip \
  --screenshot-dir /tmp/email-review

# 4. Review without changing anything
node $SKILL_DIR/scripts/gmail-draft.mjs --status --port 9222

# 4a. Discard a disposable draft
node $SKILL_DIR/scripts/gmail-draft.mjs --discard --port 9222

# 5. Send only after explicit approval
node $SKILL_DIR/scripts/gmail-draft.mjs \
  --port 9222 --send \
  --approval "SEND iserve4u@gmail.com | Status update - ready for review"
```

## What the draft helper does

1. Finds or opens a Gmail compose window.
2. Fills the recipient chip, subject and body.
3. Replaces `{{image URL}}` lines with inline images (DOM insertion, not
   `innerHTML`; Gmail blocks TrustedHTML).
4. Appends any bare `--image-url` images at the end.
5. Attaches files through Gmail's compose file input.
6. Captures `gmail-draft-top.png`, `gmail-draft-images.png` and
   `gmail-draft-bottom.png` when `--screenshot-dir` is set.
7. Refuses to send unless `--approval` exactly matches
   `SEND <to> | <subject>`.

## Packaging deliverables

```bash
SKILL_DIR=.opencode/skills/email-operations   # this bundle folder
$SKILL_DIR/scripts/package-deliverables.sh \
  --output /tmp/Statusfactory_Deliverables.zip \
  report.pdf full-report.md handoff.md evidence.json sbom.json summary.png
```

The script adds a `README.txt` index and writes `<zip>.sha256`.

## Cleanup

When finished, close the separate Chrome window and remove the copied profile:

```bash
SKILL_DIR=.opencode/skills/email-operations   # this bundle folder
rm -rf -- "${TMPDIR:-/tmp}/opencode/gmail-cdp-profile"
```

The copy contains cookies. Do not commit it, upload it or leave it on a shared machine.

## Validation

Run these against a disposable draft to `test@example.com`, then discard it:

- `--help` prints usage.
- `--status` reports compose state, recipient chip, subject, inline image dimensions and attachment names.
- `--new` + body + `{{image URL}}` creates an inline image with `width > 0` and no `blob:` URL.
- `--attach` uploads the zip and `--status` lists it.
- `--send --approval "wrong"` exits 2 and sends nothing.
- `--discard` removes the disposable draft.

## Review checklist

- [ ] Recipient chip is the intended address, not a similarly named contact.
- [ ] Subject is correct.
- [ ] Body has no duplicate greeting, placeholder or stray email address.
- [ ] Inline images render and are `https:` (no `blob:`).
- [ ] Attachment count/names match the package.
- [ ] Screenshots show the top, visuals and bottom.
- [ ] Draft is saved.
- [ ] Send is not pressed until the user explicitly approves this draft.

## Request examples

- "Draft this in my voice but say you're my AI assistant. Keep it non-technical
  and include one joke."
- "Put both PNGs inline and attach the zip. Show me the draft before sending."
- "Use the existing draft and only fix the greeting."
- "Send the approved draft now." (Provide the exact subject if it changed.)

## Limitations

- Requires the user's desktop session and signed-in Chrome profile. If Gmail is
  signed out, stop and ask the user to sign in.
- Gmail's DOM changes; selectors are aria/name based but can still drift.
- Inline images must be publicly reachable HTTPS URLs or uploaded through Gmail.
  Local `blob:`/`data:` images are draft-only and unreliable.
- The copied profile is temporary. Drafts sync to the account, but keep the
  Chrome window open until review/send.
- No group/CC/BCC, signature, label or account-setting changes are automated.

## Safety

- Drafting is reversible; sending is not.
- Never enter passwords, MFA codes or payment details.
- Never claim to be the user; identify as an AI assistant when writing on their
  behalf.
- Do not attach secrets, tokens, private customer data or raw logs.
- Do not send to a group or add recipients the user did not name.
