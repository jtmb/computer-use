# Resource monitor

This optional OpenCode v2 TUI package appends a compact CPU/RAM token to the
home and prompt footer status rows. Activating the token opens a namespaced
session panel, or a dialog on the home screen. It does not replace the default
sidebar or register itself for automatic discovery; a consumer may opt in by
loading this package's `./tui` export.

The monitor samples the current TUI process and discovered descendants through
each thread's Linux `/proc/<pid>/task/<tid>/children`; it does not scan unrelated
processes. Task enumeration stops at 4,096 threads per process, with an aggregate
child-text budget per process and deduplicated children. Stat records are bound
to the requested PID; queued children must still have the recorded PPID before
argv or thread reads, and PPID/start-time identity is rechecked after argv and
after thread traversal. Sampling is best-effort: Linux can omit children during
concurrent exits, so this is not an atomic or exhaustive tree snapshot.
At setup the source reads six ELF header bytes from `/proc/self/exe` and a
maximum of 4 KiB from `/proc/self/auxv` to discover `AT_PAGESZ` and `AT_CLKTCK`
without starting helper processes. It discards other auxiliary-vector entries,
which can include addresses. Unsupported or malformed layouts, unavailable
files, missing values, and oversized data leave sampling unavailable instead of
assuming platform defaults. Linux exposes kernel-word-sized auxiliary vectors;
32-bit executables on a 64-bit kernel may fail this layout check. Proc stat,
command-line, and children files are acquired with 4 KiB, 16 KiB, and 64 KiB
ceilings respectively; oversized files invalidate the scan instead of producing
truncated totals. Command-line bytes are reduced to a service-process boolean
and are never returned or logged.
CPU is calculated from user/system tick deltas and may exceed 100% when the
process tree uses multiple logical CPUs. RSS is summed across included
processes, so shared pages may be counted more than once. The first CPU sample
is unknown, and failed scans retain the last visible sample. The implementation
uses bounded process, depth, and child-list limits and reads no network data.

`intervalMs` accepts finite integers from 1,000 through 60,000; other values
use the 2,000 ms default. Linux `/proc` and a compatible ELF layout are required. The pinned
OpenTUI 0.6.6 runtime declares Node.js `>=26.4.0` or Bun `>=1.3.14` as engine
prerequisites. Static checks and fixture tests run under Node 22 here; they do
not prove live runtime compatibility or terminal rendering.

OpenCode 2.1.1's installed TUI loader skips the nested-only package entry point.
The root `tui.tsx` re-exports the implementation for that loader. On 2026-10-28,
an isolated OpenCode 2.1.1 instance loaded an equivalent shim and visibly rendered
CPU/RAM values. A separate isolated pseudo-terminal run loaded the then-current
package and emitted numeric CPU/RAM samples. Both observations predate the
no-subprocess unit-discovery change and neither establishes activation in the
user's regular session. On 2026-10-28, the updated source passed typechecking and
24 tests, including numeric CPU/RSS sampling of the running Linux test process.
An isolated leader-only mutation failed the non-leader-child regression as
expected. These checks do not establish activation or rendering in this chat.

## Verification

From this directory, run `npm ci --ignore-scripts --no-audit --no-fund` followed
by `npm run check`. The package pins its SDK, theme, compiler and authentic
`@types/json-schema` declarations locally; strict library checking remains
enabled. The dependency-readiness tests validate package-local public SHA-512
lock entries and a real compiler negative control. Three additional synthetic
proc regressions cover requested-PID binding, queued-parent changes, and PID
reuse/reparenting during argv acquisition. The canonical merged behavioral suite
passed **27/27** cases in this checkout. The two dependency-readiness cases and
full strict typecheck were not rerun; they inspect installed dependencies and run
a real compiler negative control. The package still requires a separate local
dependency provision and typecheck before package-wide readiness is claimed.

## Source provenance and license status

Adapted from `jtmb/opencode-rig`,
[`platforms/linux/ubuntu/computer-use/plugins-v2/resource-monitor`](https://github.com/jtmb/opencode-rig/tree/b17182cd5bcd55c282a94ea18f87a16460813c35/platforms/linux/ubuntu/computer-use/plugins-v2/resource-monitor),
at commit `b17182cd5bcd55c282a94ea18f87a16460813c35`. The source was reviewed
through the pinned GitHub revision. That revision's repository root has no
license file and the package has no license declaration; the upstream license
is therefore unspecified here. No license is inferred or added by this
adaptation.
