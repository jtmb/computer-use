---
name: blender
description: Operate the installed Blender version for safe scene inspection, scripted edits, versioned saves, rendering, and import or export verification. Use when the user asks to inspect or modify a .blend file, run Blender Python, render a scene, automate Blender from the shell, or verify a 3D export.
metadata:
  schema-version: "1"
  category: "applications"
  tags: "blender,3d,bpy,rendering,export"
---

# Blender

Use Blender's own executable for `bpy`; never assume the system Python can
import it. Inspect the installed Blender version and use documentation and
operators matching that version. Do not assume a Blender-specific MCP or other
integration is installed; use one only if it is exposed and configured.

## Auto-approve and autonomous work

In Build auto, project auto-approve, or explicit no-question work, do not ask
routine clarifying, preference, confirmation, Git, delegation-opt-in, or
"continue?" questions. Use existing authority and reversible defaults. If a
required approval or essential detail is missing, block that action, state the
reason, and continue independent work; never grant authority yourself.

## Execution surfaces

- Prefer bounded shell commands and Blender background mode for deterministic
  inspection, scripted edits, rendering, and export.
- Use `desktop-control` plus `desktop-vision` for an interactive Blender UI
  task only when those skills and their tools are available. The 3D viewport may
  expose little accessibility information, so observe, perform one bounded
  action, and verify visually rather than clicking blind.
- If a required desktop or browser integration is unavailable, report that
  validation as blocked or incomplete rather than assuming another tool exists.
- For visible authenticated browser work, use the `browser-assistant` skill
  through an approved visible-browser integration when one is available. Follow
  that provider's window-selection, preview, and verification contract. If the
  required connector or evidence is unavailable, report a blocker rather than
  using desktop input or an unsupported browser fallback.
- Use an approved isolated headless-browser integration only when the user
  explicitly requests invisible browser work. Read its provider guidance and
  follow a companion skill when one is configured.

## Core workflow

1. Establish the requested result, source file, output directory, Blender
   version, render frame or range, export format, and acceptance checks.
2. Resolve the installed Blender executable and inspect its version, paths, and
   available disk space before changing anything. Do not reinstall or reconfigure
   Blender merely because a command or file is not where expected.
   For glTF work, verify that modules required by the installed exporter are
   importable from Blender's own Python environment. Follow the consumer
   project's approved package workflow; do not install modules ad hoc.
3. Preserve every source `.blend`. Use a new, versioned output such as
   `scene-v002.blend`, `scene-v002.glb`, or `scene-v002-frame-0001.png`; fail if
   that exact output already exists rather than silently overwriting it.
4. For any background-mode task, first read
   [references/background-workflows.md](./references/background-workflows.md)
    in full and follow its command ordering, process-deadline, auto-execution,
    and script rules supported by the current runner.
5. Probe an existing scene before editing with
   [the bundled scene probe](scripts/scene_probe.py). It is a read-only Blender
   Python script that writes a new JSON inventory and must be run by Blender,
   not by `python3`.
6. Review every task-specific Python script before execution. Bound its inputs
   and outputs, avoid network access and unrelated paths, and propagate failures
   using the installed version's supported mechanism (including
   `--python-exit-code 1` when available).
7. Make the smallest requested change in memory, then save only to the
   versioned output path. Do not mutate Blender preferences or install add-ons
   unless the user requested setup and approved any consequential change.
8. Before saving, rendering, or exporting, read
   [references/verification-and-export.md](./references/verification-and-export.md)
   in full. Verify a saved `.blend` by reopening it in a separate Blender
   process and comparing a fresh structural probe. Verify a render by reading
   the actual image, not merely checking that Blender exited successfully.
9. Report the Blender version, source and output paths, process deadline,
   structural differences, visual result, warnings, and anything not tested.

## Non-negotiable command rules

- Put global options before an input file. Every automated Blender invocation
  uses background mode, a clean startup, disabled automatic execution, and
  explicit script-error propagation when those options are supported by the
  installed version. Bound the process with the current runner's deadline
  mechanism; verify command-line options against version-matched documentation.
- Blender processes command-line arguments in order. Put the input `.blend`
  before a task `--python` script that operates on it, and put render settings
  before the final `--render-frame` or `--render-anim` action.
- Use absolute, quoted paths. Put script arguments after `--` so Blender does
  not parse them as its own options.
- `--disable-autoexec` reduces risk from embedded scripts and drivers; it does
  not make an untrusted file harmless. Keep unknown files isolated from private
  data and do not enable auto-run to silence warnings.
- Do not run Blender or another graphical application with elevated privileges
  unless a separately authorized task specifically requires it. Never weaken
  operating-system desktop security, filesystem permissions, or sandboxing to
  make automation work.

## Verification standard

- Process success is necessary but insufficient. Check that each expected file
  is new, non-empty, readable, and at the intended path.
- A saved scene passes only after a clean-process reopen and structural probe
  confirm expected scenes, objects, hierarchy, materials, images, cameras,
  animation, and external dependencies.
- A render passes only after actual image inspection for framing, lighting,
  materials, transparency, missing textures, and obvious corruption.
- An export passes only after clean reimport structural checks and, when meant
  for a browser, a runtime load check through an approved visible or explicitly
  requested isolated browser integration. If required screenshots or diagnostics
  are unavailable, report validation as incomplete rather than claiming success.
- Treat screenshots according to the verified capture backend's ownership and
  retention contract; do not read or delete an unowned candidate. A render
  requested by the user is an output artifact and must be retained at the
  approved destination. Delete only task-created temporary verification renders.

## Safety boundaries

- Treat `.blend` files and Python scripts from unknown sources as untrusted.
- Do not overwrite source files, pack or unpack resources, remap paths, apply
  transforms, purge data, delete objects, or alter linked libraries without the
  task requiring it and the effect being understood.
- Ask immediately before deleting local data, changing permissions or package
  sources, installing add-ons, or replacing an existing output.
- Use only the consumer project's approved elevation mechanism for an already-
  reviewed bounded system operation. Never request, capture, or type a password,
  and never observe a privileged-authentication dialog.
- Do not upload a `.blend`, texture, render, or export unless the user named
  both the exact file and destination.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md) for request examples, prerequisites, verification,
and safety requirements. README and reference files are not loaded
automatically with this `SKILL.md`.
