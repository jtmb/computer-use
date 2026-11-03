---
name: desktop-vision
description: Inspect desktop appearance through a supported, authorized visual-capture integration. Use when the user asks what is on screen, requests a screenshot, or GUI work needs visual verification.
metadata:
  schema-version: "1"
  category: "desktop"
  tags: "desktop,screenshot,visual-verification"
---

# Desktop Vision

Use visual capture only when the current session exposes a supported,
authorized integration. Do not assume a screenshot tool, backend, shortcut,
input service, or platform bridge is installed. Announce each permitted capture
before triggering it.

## Auto-approve and autonomous work

In Build auto, project auto-approve, or explicit no-question work, do not ask
routine clarifying, preference, confirmation, Git, delegation-opt-in, or
"continue?" questions. Use existing authority and reversible defaults. If a
required approval or essential detail is missing, block that action, state the
reason, and continue independent work; never grant authority yourself.

## Capture workflow

1. Prefer accessibility data when it answers the question without a capture.
2. Discover the capture tool and read its current provider documentation.
   Verify permission, request-specific output ownership, bounded acquisition,
   complete image validation, privacy protections, and cleanup/retention behavior.
3. If any required safety property is unknown, or capture is explicitly
   deferred, do not invoke that backend or an equivalent shell command. Report
   visual verification as blocked and continue independent work.
4. Announce the capture, request only the smallest necessary region, and avoid
   locked screens, authentication, password, MFA, payment, or CAPTCHA surfaces.
5. Inspect only the image proven to belong to this request or a file the user
   explicitly selected to share. A before/after inventory or a single new file
   does not establish ownership.
6. Verify only the visible claim supported by the image. Report retention as
   unknown unless cleanup was independently verified. Delete only task-owned
   files when authorized; never remove a user's unrelated screenshot.

## Ownership and retention

Never infer ownership from recency, a before/after file inventory, or the fact
that only one candidate exists. Read only a request-owned capture or a file the
user explicitly selected to share. File selection is not deletion approval.
Report retention as unknown unless cleanup is independently verified.

## Provider-specific behavior

Capture tool names, modes, shortcuts, output locations, multi-monitor behavior,
and retention are provider-specific. Follow the documentation for the current
session's exposed backend only after verifying its safety properties. Do not
invoke a shell shortcut or another backend as a fallback around tool permissions.

Use only the exposed provider's documented capture and retention workflow.
Never substitute a shell shortcut or another backend to bypass tool permissions.

## Privacy rules

- Capture is allowed only when the user's request, effective permissions, and
  verified backend contract authorize it. Announce each permitted capture first.
- Do not claim the attachment is the only copy or that deletion succeeded
  without verified cleanup. Never store, commit, upload, or paste it elsewhere.
- Never try to observe a locked screen. Treat visible passwords, keys,
  tokens, and private messages as do-not-repeat: use them for the task
  at hand, never quote them back.
- Never capture while a trusted authentication dialog or sensitive entry field
  is open. Resume only after the sensitive surface is independently no longer
  shown.
- If the screen shows anything the user clearly didn't intend to share
  (e.g. banking, someone else's private messages), say so and stop.

## Limits

- Capture modes, still/video support, multi-monitor behavior, and image quality
  vary by provider. Request the narrowest adequate view and report limitations.
- General GUI input belongs to the separately loaded `desktop-control` skill;
  screenshot permission is not authority to control the desktop.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md) for request examples, prerequisites, verification,
and safety requirements.
