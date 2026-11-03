# Computer-use skill/tool coverage audit

Observed 2026-10-28 in this session. Catalog visibility is not proof of a working
backend, permission, suitable browser profile, or successful application outcome.
The audit inspected skill entry points, the current Code Mode tool catalog,
`opencode.json`, and the [computer-use plugin guide](../.opencode/plugins/computer-use/README.md).
It did not operate the desktop, capture a screen, open a browser, or install software.

| Skill / workflow | Needed capability | Observed route and limitation | Recommendation |
| --- | --- | --- | --- |
| desktop-control | Accessibility inspection, bounded actions, window placement | `desktop.apps/tree/find/act`, `windows/window_act/layout`, `input/release/launch` exposed; backend and permissions vary | Reuse; verify exact target, preview, bridge and readback. No wrapper per skill. |
| desktop-vision | Request-owned image and safe retention | `desktop.capture` exposed for an exact window; reviewed Shell bridge and safety contract required | Verify live prerequisites separately; do not revive the deferred legacy screenshot path. |
| browser-assistant | Visible browser and user takeover | `web.open/tabs/navigate/snapshot/act/screenshot/signin` exposed, but session-isolated worker is not proof of access to the user's existing browser/profile | Verify the requested browser and profile; report an unsupported existing-profile workflow rather than substitute. |
| browser-headless | Explicitly requested isolated browser | Playwright MCP tools exposed; `scripts/playwright-headless-mcp.sh` exists, but this catalog observation does not establish a headless connection | Check actual mode and isolation for each task; no additional wrapper justified. |
| game-playtest | Browser input, screenshots, console/network and resizing | Playwright catalog exposes snapshot, input, screenshot, console, network and resize; `web` exposes interaction and screenshot but not all diagnostics | Choose a permitted matching provider; missing diagnostics or canvas input means incomplete playtest. |
| fanduel-parlay-research | Web research and eligible visible betslip | Web search/fetch and browser interaction are exposed; eligible account, jurisdiction and current prices not verified | Reuse existing tools; no account or geolocation bypass. |
| files-and-documents | Bounded file search, reading and edits | Native glob, grep, read, patch and shell are exposed | Existing general-purpose tools suffice; preserve files and approval gates. |
| app-setup / system-troubleshooting | OS diagnostics, package commands, optional GUI | Shell and desktop tools exposed; executable availability and privilege approval are task-dependent | Reuse bounded shell/desktop; do not add an elevation-bypassing tool. |
| vscode-management | Editor CLI, optional GUI and integrated browser | Shell and desktop exposed; a VS Code integrated-browser connector is not established by this inventory | Verify the actual editor surface before use; propose a connector only for a demonstrated repeatable gap. |
| blender / web-3d-asset-pipeline | Blender executable, file I/O, optional browser validation | Shell, file and browser tools exposed; Blender installation and project-specific exporter not checked | Use installed supported CLI when available; a Blender MCP is not required merely to attach a tool. |
| readme-gif | Safe real recording and encoding | Browser screenshot and desktop capture are exposed; this does not establish a safe video recorder or encoder | Verify the requested recording workflow and isolation; do not invent video support. |
| routine-automation | Scripts, locks, schedules and status | Shell and source-edit tools exposed; scheduling is a separate consequential operation | Reuse existing tools, dry runs and approval gates. |

The portable skills intentionally discover the consumer's tools rather than hardcode
this checkout's tool names. The clearest execution gaps concern verified access to
an existing visible browser profile, an integrated VS Code browser, and a safe
real recording path—not an absent one-to-one skill/tool mapping. Assess demand,
permissions and supported APIs before implementing a new connector. The catalog's
`desktop.act` description still refers to retired `desktop_screenshot`; use the
actual current provider contract, not that stale description. No integration was
activated, and no live functionality is claimed by this audit.
