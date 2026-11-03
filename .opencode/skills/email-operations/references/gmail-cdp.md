# Gmail CDP notes

## Why CDP

The visible Chrome profile is the account boundary. CDP lets the helper fill a
draft and capture screenshots without asking the user to install an extension or
paste credentials. The MCP Playwright server may be configured for Firefox; do
not assume it can see the user's Gmail session. Launch a separate Chrome with a
copied profile instead.

## Profile copy

`start-gmail-cdp.sh` copies `Default` plus `Local State` into a temp profile,
excluding caches. Cookies are encrypted with the OS keyring; the same desktop
user must run Chrome so it can decrypt them. Never commit or upload the copied
profile.

Chrome refuses a second process on the same `--user-data-dir`. Do not try to
attach debugging flags to an already-running main profile.

## Compose selectors

| Element | Selector |
| --- | --- |
| Compose button | `.T-I-KE` |
| Compose dialog | `[role=dialog]` |
| To field | `[role=dialog] input[aria-label="To recipients"]` |
| Subject | `input[name="subjectbox"]` |
| Body | `[contenteditable="true"][aria-label="Message Body"]` |
| Attach input | `[role=dialog] input[type=file][name="Filedata"]` |
| Send | `[role=dialog] [aria-label^="Send"]` |
| Discard | `[role=dialog] [aria-label^="Discard draft"]` |
| Inline image | `[contenteditable="true"][aria-label="Message Body"] img` |

Gmail changes classes often; prefer aria labels and names.

## Trusted Types

Gmail sets a Trusted Types policy that blocks:

```js
body.innerHTML = '<img ...>'
```

It throws: "This document requires 'TrustedHTML' assignment." Use DOM APIs:

```js
const img = document.createElement('img');
img.src = url;
const div = document.createElement('div');
div.appendChild(img);
range.insertNode(div);
```

Or create a TrustedHTML policy if you must set markup. Do not disable Trusted
Types.

## Inline images

- Gmail accepts a remote HTTPS image in a DOM `<img>` and renders it inline.
- `blob:` and `data:` images can appear in the draft but are not reliable on
  send and may not survive a draft reload.
- The safest repeatable path is a stable public URL (for example a raw file in a
  public repository branch) or Gmail's own "Insert photo" upload.
- If an image must stay private, attach it instead of inlining it.

## Attachments

Set the compose file input directly:

```js
DOM.setFileInputFiles({ nodeId, files: ['/abs/path/file.zip'] })
```

Wait for Gmail to finish uploading; check the attachment chips. Do not attach the
same file twice by calling `setFileInputFiles` repeatedly on the same input.

## Draft hygiene

- One compose window at a time. If a draft is open, fill it; do not open a second
  compose and create duplicates.
- `--new` discards the current draft. Use it only for a draft this run created.
- Gmail autosaves drafts server-side. A copied-profile draft appears in the
  account's Drafts, but keep the window open until review.
- Do not click Send while capturing screenshots.

## Failure modes

| Symptom | Cause / action |
| --- | --- |
| `Browser "firefox" is not installed` | The MCP server is not using Chrome. Launch the CDP helper instead. |
| `Failed to set innerHTML ... TrustedHTML` | Use DOM nodes, not `innerHTML`. |
| Image is `blob:` in the body | It is local-only; replace with an HTTPS URL or Gmail upload. |
| Two "Hey" greetings | The draft was edited repeatedly. Discard and rebuild once. |
| Attachment appears twice | `setFileInputFiles` was called twice. Remove extras or rebuild. |
| Compose button not found | A modal/backdrop is open. Press Escape, then click `.T-I-KE`. |
| Gmail asks to sign in | Stop; the user must sign in. Never enter credentials. |

## Review checklist

- [ ] Recipient chip is the intended address.
- [ ] Subject matches the approved subject.
- [ ] Body reads naturally; no duplicate greeting or placeholder.
- [ ] Inline images are HTTPS, not `blob:`.
- [ ] Attachment names and count match the package.
- [ ] Screenshots show top, visuals and bottom.
- [ ] Draft is saved.
- [ ] No Send action without explicit approval.
