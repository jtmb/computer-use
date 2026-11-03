## Canonical checkout interpretation — 2026-10-29

This is a retained delivery preparation report from
`/home/james/repos/computer-use-delivery`. The canonical checkout is now
`/home/james/repos/computer-use` on `main`. The opening “no capture, app action,
model run” statement is scoped to that delivery assignment; it is not a claim
that no later, separately scoped canonical desktop observation exists.

The canonical feature inventory records private-Shell and operator-Shell capture
observations plus Calculator launch/confirmation. Those do **not** establish the
genuine simultaneous OpenCode-tool/browser task, action-preview acceptance, or
approval to replace README assets. This guide's separate preview and replacement
gates remain intact. The newer ChatGPT image and resource-monitor pilot evidence
in [`features.md`](../features.md) is also separate from this demo. Current
consolidation and acceptance boundaries are in
[`main-consolidation.md`](../codex-parity/main-consolidation.md) and
[`simultaneous-workflow.md`](simultaneous-workflow.md).

# Simultaneous delivery preview: preparation and acceptance

**Preparation only — no capture, app action, model run, or asset replacement was
performed for this delivery.** The assigned scope expressly forbids those actions.
The current recording blocker is exact: no current recording authority or fresh
runtime/desktop observations were established here. Historical session IDs,
screens, approval notes, and earlier idle clips are not current evidence.
The genuine simultaneous demo remains pending those exact recording gates and a
separate user preview approval before any asset replacement.
A successful preflight exit is not independent proof of geometry, privacy,
operator assertions, task completion, recording authority, or acceptance.

Parent follow-up (2026-10-28): inspected descriptor traversal/read/hash/snapshot
and ffprobe process handling; **12/12** tests pass independently with synthetic
media and fake probes. Removing both path-identity guards in memory makes the
replacement regression fail, leaving production source unchanged. Anonymous
video snapshots may consume memory up to the 1-GiB source limit. No real MP4,
ffprobe, live UI or recording acceptance was attempted in this verification.

This guide prepares one genuine action preview for the root README's existing
identity: real OpenCode tool activity beside a real app result, on one source
timeline. Keep `README.md`, `assets/`, all existing media, and original source
footage unchanged until a separately authorized user preview is approved.

## Story and single-timeline composition

Use the existing public actor brief's bounded task, without signing in or playing
a video:

> Find three Blender beginner tutorials on YouTube. Use the visible signed-out
> browser; do not sign in or play a video.

The real visible OpenCode session must issue genuine computer-use tool calls and
the selected signed-out browser must show the corresponding real search and
actual results. Name no titles until they are observed. The completed result is
three visible, real tutorial results; missing/inaccessible results, consent,
login, CAPTCHA, private state, or a failed action is a stop condition, not an edit
to conceal. Follow [`public-demo-brief.md`](public-demo-brief.md) for the named
AT-SPI target and fresh preview/apply interaction rules. Do not use headless
Playwright, CDP, page JavaScript, blind coordinates, or the flagged screenshot
backend.

At a later explicitly authorized run:

1. Have the user finish unlocking/sign-in first. Start a genuinely new public
   OpenCode session and a new signed-out browser profile; inspect the idle
   composition for restored private tab titles, notifications, or other personal
   state. Do not reuse IDs from a prior login, screenshot, or document. Do not use
   `--auto` or alter global configuration to hide content.
2. Arrange just those two windows side by side with the supported window-control
   preview/apply workflow. Refresh compositor IDs after unlock. Verify focus,
   stacking, visibility, and geometry from fresh read-only state; rectangles
   alone do not prove that both windows are visible.
3. Derive the exact logical capture rectangle from the fresh OpenCode and browser
   frames. It must be fully covered by those two non-overlapping frames, inside
   the observed screen, with no background, dock, tooltip, notification, or other
   window pixels. Enter the exact current IDs/rectangles and UTC observation time
   in the preflight plan. All signed-out/sample/privacy fields are explicit
   operator assertions, not facts the preflight can independently verify.
4. Run the non-capture static check before any recorder command:

   ```sh
   python3 scripts/demo-preflight.py prepare \
     --plan "$PLAN" --approved-root /tmp/opencode --run-dir "$RUN"
   ```

   `PLAN` must be an existing local JSON plan under the approved root. `RUN` is a
   new unused child whose parent already exists. Use an approved non-checkout
   output root also accepted by the native recorder; `/tmp/opencode` is the
   expected scratch root for a transient run. The preflight intentionally refuses
   the checkout as an artifact root to protect source, README, and assets. The
   plan schema is `computer-use.demo-preflight.v1` and
   requires `observed_at_utc`, `screen_rect`, `region`, exactly one `opencode` and
   one `browser` entry (`id`, `rect`, `visible`), `focused_window_id`, and six
   true `privacy_assertions`: `public_opencode_session`,
   `fresh_signed_out_browser_profile`, `public_or_sample_task_data`,
   `no_private_tabs_or_notifications`,
   `no_auth_payment_or_credential_surface`, and
   `both_windows_visible_and_unoccluded`. Use only fresh compositor observations.
5. Read the JSON result as a static-input check, not a readiness grant. It never
   creates the run directory, connects to the desktop/session bus, inspects pixels,
   checks whether a session is signed out, or proves recording authority. It only
   reports availability of the PyGObject module, GStreamer inspection executable,
   ffprobe, and Pillow. Missing tools remain blockers for the stages that need
   them; module/executable presence does not establish a live service or plugin.
6. Only after the user separately authorizes this exact native recording and the
   current isolation/runtime gates are met, follow
   [`simultaneous-workflow.md`](simultaneous-workflow.md). Review its read-only
   plan first, then invoke `native_capture.py record --apply` with the exact fresh
   IDs, region, bounded duration, and unused `RUN`. Wait for its actual
   `recording_started` response before submitting the prompt. Keep that recorder
   caller alive. After each real UI mutation, extract a fresh frame from the same
   owned recording and independently verify the actual result before proceeding.
   Stop only with that run's owned `stop.request`; preserve failures and originals.
7. Use the stopped run's genuine dense frame export and a `motion_edit.py` plan
   with `purpose: "action-preview"`, chronological source PTS, eased camera
   moves, and the real action-log/result-evidence paths. Use a new versioned
   preview directory. Do not create a transcript overlay, combine independently
   timed panes, invent clicks/results, or imply edited playback is execution
   latency. The motion editor's default is a no-write plan; inspect it before any
   separately approved `--apply`.

## Runnable media review

After a genuine action preview exists, run the independent read-only media check:

```sh
python3 scripts/demo-preflight.py review \
  --run-dir "$RUN" --preview-dir "$PREVIEW"
```

The preview must be the motion editor's unaccepted `action-preview`, not its
`tooling-preflight`. Review opens every input beneath the approved run root through
no-follow, nonblocking regular-file descriptors, rechecks descriptor/path identity,
and enforces the declared byte caps during reads and hashes. It probes a sealed,
anonymous video snapshot; ffprobe stdout/stderr are capped at 1 MiB/64 KiB and its
process group has a 30-second deadline. The relevant input limits are 1 MiB for
the prepare plan, 2 MiB for review evidence JSON, 1 GiB for the source MP4, 128
MiB each for the GIF and still, and 16 MiB per action-evidence file. Pillow fully
decodes the bounded GIF and still, checking dimensions, total decoded duration,
visible motion, `loop=0`, and matching first/last frames. Review also checks the
motion editor's output metadata and hashes the listed action-evidence files. It
writes no named files and never calls the recorder, desktop/browser tools, or
model.

The plan's geometry, privacy and signed-out fields remain operator declarations;
the checker does not inspect compositor state, pixels, account state, or session
content. Likewise, a zero exit validates only the supplied static declarations and
media structure. It does not make the genuine simultaneous demo ready, accepted,
or eligible for asset replacement.

Automated structure is not task, privacy, or visual acceptance. A human must still:

- Confirm the authentic OpenCode tool call and its actual browser result occurred
  during the same source recording, and that three real results are visible.
- Watch the complete loop at README display width. Check tool-to-app context,
  deliberate readable motion, the loop seam, captions, cursor/action alignment,
  and that no edit hides a failure or approval.
- Inspect every decoded frame, the retained original footage, and the still for
  credentials, private tabs/messages, notifications, auth/payment surfaces,
  clipping, and illegible text. Metadata checks cannot identify all embedded
  sensitive content. Stop on any unexpected private content.
- Confirm the still is a useful static alternative and the sample/signed-out
  disclosure is honest. Preserve original footage, action logs, hashes, rejected
  drafts, and the current shipped assets.

The offline guard tests use synthetic images/video metadata and never launch a UI
or recording backend:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/demo-preflight-test.py -v
```

The preview check reports `accepted_main_demo: false` by design. Only a user
approval of the real action/motion preview can open the separate main-asset
replacement gate. This assignment grants no such approval and changes no README,
asset, existing media, or original source.
