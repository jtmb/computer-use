# Viewing a selected local document

This is the operative procedure; [client acceptance](plan-mode-acceptance.md)
contains dated evidence, not proof that today's client behaves identically.

The local TUI was observed rejecting relative Markdown links with “Only http and
https links can be opened in the browser” on 2026-10-27. Do not promise an absolute
or `file://` path fixes that without verifying client support.

1. Verify the exact selected file and source identity. Prefer a supported native
   file viewer if exposed; otherwise use the existing [bounded viewer](../scripts/local-doc-viewer.py)
   only when the user requests a clickable/open local document.
2. Select only those documents (up to four), never a directory/repository server.
   The viewer preloads regular non-symlink single-link UTF-8 files, caps file size,
   binds `127.0.0.1` and exposes exact capability routes with GET/HEAD only.
3. Inspect actual `--help` and source before invoking; choose a bounded lifetime.
   Verify exact HTTP response/content and disclose that it is a preloaded snapshot,
   not live updates. A modified document needs a fresh verified snapshot.
4. Report HTTP/content verification separately from visible browser rendering and
   an observed user click. Never claim one establishes the others.

No publishing uncommitted files, weakening browser openers, patching deployed
binaries or serving unrelated data. Short-lived capability URLs belong in chat,
not committed documentation or goal exports. Viewing is not goal resumption.
