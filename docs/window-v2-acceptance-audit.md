# GNOME window bridge v2 acceptance audit

**Audit date:** 2026-10-27

**Scope:** Read-only source, installed-bundle, extension-state, typed-inventory, and scoped-test verification. No deployment, enablement, restart, window mutation, screenshot, or capture was performed.

## Result

The installed GNOME Shell extension is v2 and active, and its three managed runtime files exactly match `tools/gnome-window-control/`. The passive typed inventory was available, unlocked, and unblocked. Source tests pass, including mocked maximized-window restoration and stale-preview cases.

**Live v2 restore, placement/readback, stale-token, unrelated-window-preservation, and native-visual acceptance remain pending.** The only maximized window observed was an unrelated user terminal; it was not operated. No disposable test window was present in the fresh inventory, so neither it nor the other unrelated window should be used as the acceptance target.

## Installed/source identity and passive state

The read-only deployment dry-run targeted:
`~/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local`.
It reported `changes: []`; source and installed hashes were equal:

| Managed file | SHA-256 |
| --- | --- |
| `metadata.json` | `1e79d1af9d9f1d3524a11ba34540ae9feb8f7c7871eb6582d27268454f7f4862` |
| `extension.js` | `8f3e1b4ef7f845d84a8119916fcc75af36408f7a180440104c1c32a39ee8142c` |
| `policy.mjs` | `e405613b0b87f412a98bcd2aac5e524cb7074a0e3e5f361f9c5b7a8e07831eb1` |

`gnome-extensions info opencode-window-control@computer-use.local` reported **Version 2**, **Enabled: Yes**, **State: ACTIVE**. No deployment, enablement, or restart was attempted.

A fresh, read-only `desktop_windows` inventory reported `available: true`, `ok: true`, `locked: false`, and `blockedReason: null`. It contained two current-workspace windows, both unrelated to this acceptance. The maximized terminal reported `canResize: true`; it was left unchanged. The live state payload's `version: 1` is the bridge **wire-schema** version expected by `policy.mjs`; it is distinct from the installed extension metadata version 2, not a source/installed mismatch.

## Source review

- **Restore capability:** `extension.js`'s `canResizeAfterRestore` first accepts Mutter's normal `allows_resize()`. For a maximized window it checks the intrinsic `resizeable` flag, excludes fullscreen, and uses the client min/max size hints to reject fixed-size windows. `policy.mjs` rejects fullscreen, immovable, and non-resizable targets. The apply path unminimizes, unmaximizes, moves monitor/rectangle, and re-maximizes only for a maximize request. `verifyPlan` requires readback of monitor, geometry (within two logical pixels), minimized/fullscreen/protected/maximized state, and requested focus; the extension polls for at most two seconds.
- **Preview freshness:** previews are request-bound, opaque, single-use, and expire after 30 seconds. The fingerprint includes the extension epoch, workspace, focus, monitor state, and the selected target windows' metadata/geometry/capabilities. Consumption removes the token before validating the request and fingerprint, so stale or mismatched attempts cannot replay it.
- **Unrelated windows and partial failure:** the plan contains only exact selected IDs; placement iterates those IDs and optional focus is constrained to a placed target. The mocked extension test verifies a third window's rectangle is unchanged. Layout is explicitly non-atomic: failures return best-effort readback and instruct a fresh inspection, with no retry or automatic rollback.
- **Known boundary:** app/class heuristics protect known authentication windows but cannot identify every credential or payment form embedded in an ordinary app window. Do not use the bridge during sensitive entry.

No concrete source defect was found in the requested restore, token-freshness, or selected-window safeguards. The remaining issue is an **acceptance gap**, not a demonstrated implementation failure: mocked tests and matching hashes do not prove Mutter's live restore/geometry behavior or visible stacking.

## Verification performed

- Deployment dry-run: three source/installed hashes match; `changes: []`.
- GNOME extension registry: v2 active.
- Passive typed inventory: available, unlocked, unblocked; maximized unrelated terminal advertises `canResize: true`.
- `node --test .opencode/plugins/computer-use/window-policy.test.ts .opencode/plugins/computer-use/window-extension.test.ts .opencode/plugins/computer-use/windows.test.ts` — **21 passed**. The extension test executes canonical extension methods against mocked GJS/compositor boundaries; it is not a live placement test.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_desktop_windows.py' -v` — **4 passed**.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_deploy_window_control.py' -v` — **5 passed**. Deployment fixtures use isolated scratch targets; the installed extension was not changed.
- `node --check tools/gnome-window-control/extension.js` — passed (Node v22.22.2).

These results establish source/test coverage and installed-file identity only. No real preview/apply, stale-token rejection, post-apply compositor readback, unrelated-window comparison after mutation, or visual inspection occurred in this audit.

## Exact pending acceptance steps for the parent

1. **Use disposable windows only.** Create or identify two ordinary throwaway test windows (for example, a blank editor and a harmless demo window); do not use the current terminal, VS Code, or any other user window. If they are not already available, the parent must arrange disposable targets before testing. Do not test while locked, in a Shell modal, or during authentication/payment entry.
2. **Record a fresh baseline.** Inventory twice and select exact current IDs by app ID/PID/title. Confirm the target is on the active workspace, not protected/fullscreen, and reports `canMove: true` and `canResize: true`. Record monitor, logical work area, target geometry/maximized state, focus, and each non-target window's geometry/state for comparison.
3. **Exercise v2 restore and readback.** Maximize one disposable resizable window, refresh inventory, then preview a bounded tile/placement for that exact ID. Confirm preview leaves its geometry/maximized state unchanged. Apply only that exact preview with its fresh token and required mutation permissions. Require successful compositor readback plus a fresh inventory showing the expected monitor/rectangle and the target restored from maximized state. Confirm every non-target window's geometry/state is unchanged. If the result is partial or unverified, inspect fresh state; do not replay the token or auto-rollback.
4. **Exercise live stale-token rejection separately.** With two disposable windows, preview a placement for target A. Before applying it, use a separate fresh preview/apply to focus disposable target B, changing the observed focus. Attempt the original A request once with its original token; it must be refused as stale, without moving/resizing A. Reinventory and compare target and non-target geometry. A consumed token must not be retried.
5. **Exercise one-use replay separately.** After one successful disposable-window apply, replay that exact request/token once; require rejection and unchanged readback. This is distinct from stale-state rejection.
6. **Complete native-visual acceptance.** After each successful apply, verify the selected window is visibly where expected and not occluded, and that no unrelated window was disturbed. Use only the parent's already-authorized visual route. The deferred screenshot backend was not invoked here; if no authorized non-deferred visual route is available, leave visual acceptance pending rather than bypassing that hold.

The source guide's normal acceptance requirement is readback plus a fresh visual check; source tests, extension status, and geometry metadata alone do not satisfy it.
