# Post-login acceptance history

**Source follow-up, 2026-10-28:** the later login already cleared the old capture
and launch blocker; the last actual typing attempt below failed with INPUT_FAILED.
Installed GI verification found virtual-input microseconds/guint64 and no required
device destroy method. Corrected input source retains failed releases for retry;
launch activation remains separately uint32 milliseconds.30input/launch tests,
8source GJS checks and14fake-boundary workflow tests pass. No successful real-seat
input or visible change is inferred. A fresh read-only deployer preview finds
input.mjs/extension.js drift; no deployment, activation, input or logout ran here.
See [source/installed hashes and gates](acceptance.md#current-sourcedeployment-boundary--2026-10-28).
The original chronological observations below remain unchanged.

## Post-login acceptance — 2026-10-27 22:29:36 EDT

Session: wayland | Shell pid 3992 started Tue Oct 27 18:04:16 2026

### live-capture-check.py (exit 3)

```
STALE MODULE: the running Shell still holds the pre-fix extension.
  A logout/login is required: GNOME caches extension modules by URL, so
  disabling/enabling the extension cannot load the fixed code.
  detail: g-io-error-quark: GDBus.Error:org.gnome.Shell.Extensions.OpenCodeWindowControl.Error.CAPTURE_FAILED: bytes.get_data is not a function (36)
```

### desktop-workflow-acceptance.py

Skipped: capture did not pass, so a visible-outcome run would only repeat that failure.

**capture=3 workflow=skipped — not accepted yet**

## Logout issued 2026-10-27 22:34:14 EDT

The reviewed bridge is armed for the next login via ~/.config/autostart/opencode-post-login-acceptance.desktop. After logging in, this file will receive the automatic run.

## Post-login acceptance — 2026-10-27 22:38:38 EDT

Session: wayland | Shell pid 183229 started Tue Oct 27 22:35:52 2026

### live-capture-check.py (exit 2)

```
FAIL no NORMAL window is open, so there is nothing to capture
```

### desktop-workflow-acceptance.py

Skipped: capture did not pass, so a visible-outcome run would only repeat that failure.

**capture=2 workflow=skipped — not accepted yet**

## Manual post-login recheck — 2026-10-27 ~23:40 EDT

Shell PID 184812 started at 22:38:35 EDT. `gnome-extensions info` reported
`Enabled: Yes`, `State: ACTIVE`; the bridge D-Bus name had an owner. A read-only
deployer preview reported 0/7 drift. No deployment, enablement, restart, or
logout was performed for this check. The one-shot autostart entry was absent.

### `live-capture-check.py` (exit 0)

```text
PASS live capture: 470910 bytes, 2466x1664, PNG signature, observationId present
window: 421446c5-370d-4189-b7d2-77284c6d41dd:2
sha256 prefix: e4955ec332eab7a
```

### `desktop-workflow-acceptance.py --yes` (exit 1)

```text
PASS inventory before launch: 1 window(s)
PASS launch accepted for org.gnome.Calculator.desktop
PASS confirmation: a matching window appeared
PASS new window: 421446c5-370d-4189-b7d2-77284c6d41dd:4 | org.gnome.Calculator.desktop | Calculator
PASS captured before typing: 820x1332, sha256 5183d69aee0cc911
FAIL typing was refused: bridge-rejected ... Error.INPUT_FAILED: The operation failed.
closed the launched window's process 199781
```

The launched process was absent afterwards, and the next compositor inventory
showed only the existing Ptyxis/OpenCode window. No post-input capture or visible
change was obtained; this is not a passing interaction test. The capture and
launch/confirmation paths now pass in the operator's logged-in Shell, while real
seat input remains blocked by the exact refusal above. This manual check did not
rerun the one-shot post-login script.
