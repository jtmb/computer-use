# Native App Recording

Read this before using a platform-specific native recording workflow. It is a
preflight guide, not a recorder, permission grant, or guarantee that a capture
integration is available.

## Choose a real, bounded task

- Select a useful workflow with clear visible actions and completed results.
- Use a disposable demo instance, public content, and isolated sample data.
- Do not fabricate chat/tool activity, UI, input, or results.
- If multiple views are composed, retain their source timeline and do not imply
  synchronization without evidence.

## Isolate first

Inspect the actual application/profile and current desktop or session before
recording. A new process or session identifier alone may not isolate restored
tabs, notifications, profiles, credentials, or private content. Use only
project-approved isolation settings; do not modify global preferences to hide
sensitive state. If isolation cannot be demonstrated, stop before capture.

Keep the capture region as small as practical and verify it contains only the
intended public or sample content. Do not record authentication, secrets,
payments, private conversations, or unrelated notifications.

## Capture and verify

1. Discover the approved capture integration and read its current provider
   documentation. Confirm authorization, output ownership, bounds, complete
   media validation, and retention/cleanup behavior.
2. Use a unique approved output path and a bounded recording duration. Do not
   target existing or unrelated recordings.
3. Keep the recording caller/session alive for the duration if the provider
   requires it. Finalize only the recording started by this task.
4. Verify the actual returned path, media format, and decode result. A successful
   request or non-empty file is not enough.
5. Preserve source footage and evidence through acceptance. Delete only files
   proven task-owned and only when deletion is authorized.

If ownership, safety, or finalization is uncertain, stop and report the
limitation. Do not retry an uncertain capture or substitute shell input,
shortcuts, unsafe APIs, or a different backend to bypass a restriction.

## Operate and report

Use fresh accessible targets and the interaction provider's preview/apply rules.
After each meaningful action, verify the real result before proceeding. Do not
use arbitrary coordinates or claim an inaccessible internal state. A screenshot
used for private verification is not automatically suitable as a public asset.

Decode with an already available approved tool. Bound frame extraction and
scratch storage to avoid expanding a short clip into excessive data. Keep hashes,
timestamps, action summaries, and output metadata so the delivered edit remains
traceable. Preserve rejected prototypes unless deletion is separately authorized.
