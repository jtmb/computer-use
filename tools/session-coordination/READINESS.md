# Source readiness and activation preflight

> **Retired 2026-10-31.** The inbox/mailbox feature is removed. Both loader
> entrypoints refuse activation, and `activation-preflight.mjs` always reports
> `activationPreflight: "blocked"` with no config proposal. Everything below is a
> dated source-readiness record, not current registration or activation evidence.

## Bounded lock-contention source fix — 2026-10-30

The parent reproduced immediate refusal when two ordinary watch registrations
contended, then independently reviewed the child's `store.ts` change and four new
real cross-process tests. The helper now waits at most2s on the same permanent
inherited lock fd with util-linux `flock --timeout 2 --conflict-exit-code 75`.
Conflict75 remains distinct from helper failure; abort kills/reaps only that
owned helper before any mutation. No lock inode is deleted/replaced.

Parent verification: focused store5/5, full package138/138 (zero skips), and
strict/noEmit with `skipLibCheck=false` pass. Tests cover simultaneous committed
updates, long-held timeout with unchanged state/inode, waiting abort with no
later mutation/helper leak, helper failure and subsequent recovery. The2s budget
is lock acquisition only, not a new whole-mutation deadline; existing I/O/cancel
checkpoints are unchanged. Existing outer bounded operations remain effective.
This is source acceptance, not a new runtime registration/reload or observed
concurrent native-tool claim. Parent refreshed only the reviewed store digest
after full-file review; no config/security/shared restart was performed.

## Later deployment/incident closure — 2026-10-29

The project now explicitly selects this package with private root
`.session-coordination/` state. See the [deployment/incident record](../../docs/deployments/2026-10-29-goal-plugin.md).
Current package suite passes **132/132**, zero skips, and strict/library
typechecking passes. Native tool/RPC and peer mailbox read/seen-only acceptance
are observed separately from source checks; optional visible dialogs remain
unverified. No automatic prompt/model hook remains after the escaped chat lockup.

Activation preflight now rejects unsafe **existing ancestors** even when its
state leaf is absent, and accepts only an explicitly selected supported private
path with its exact ignore rule. The root-private path avoids the ACL-shared
tools tree without changing its permissions. Actual read-only preflight reports
`preview-ready`, exact entry `present`, state mode700, no proposal/write.
New regressions reproduce writable ancestors, ignored root-private success,
missing ignore rules and public leaf refusal. These supersede the older fixed
`tools/session-coordination/local-state` selection requirement, not the security
checks or historical failures below.

## Current canonical package-local closure — 2026-10-29

Parent verified canonical `node_modules` was absent, checked all 386 locked
registry entries, and provisioned that new development tree with `npm ci`,
lifecycle scripts disabled, empty explicit user/global npm configs, a secret-free
environment and a private scratch cache. No existing dependency tree was replaced.
Manifest SHA-256 remains `638900bf23c8e339a64ed23324e9bb0ac4c274eb44f08190d47419cd0b9cfdce`;
lock remains `6964238a12721f822d2c01bb21e1ddd68d24ea2b8339617c7d7a6bc314674bca`.

The actual package commands now pass independently with no dependency-root or
type-root override: **`npm test`: 109/109**, zero skips, including real AJV and
all four installed-dependency/readiness cases; **`npm run typecheck`: exit 0**,
TypeScript 5.9.3 strict/noEmit with library checking enabled. The compiler was
run serially under a 1,536 MiB heap and the existing package deadline. The exact
JSON Schema declaration hash is `f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1`.

This supersedes the missing-local-AJV result below as current source readiness,
not as a denial that the earlier failure occurred. OpenTUI 0.6.6 still requires
Node >=26.4.0 or Bun >=1.3.14; npm warned on the observed Node 22.22.2. No FFI/UI
load, native active-session bridge, participant, runtime registration or model
outcome was exercised. Project config bytes and absent `local-state/` remain
separate from dependency installation; no activation/config apply occurred.

The older dated checkpoints and external-root commands below remain history.
For the current local source closure use the package commands without the old
`COORDINATION_TEST_DEPENDENCY_PACKAGE`, `--dependency-package`, or `--types-root`
overrides. The four readiness tests check dependency metadata/authenticity; the
actual package-wide strict compiler run is a separate verification layer.

Observed in `/home/james/repos/computer-use` on 2026-10-28. This record covers
the strict source check and read-only activation preflight only; it does not
replace the broader [acceptance checklist](ACCEPTANCE.md).

## Canonical lane-25 consolidation — 2026-10-29

The delivery liveness/status/RPC integration and package-local strict-dependency
readiness were merged while retaining canonical protocol-document tests. The
bounded offline source run passed **105/105** selected cases, including explicit
status refresh, current owner/worker permission checks, native observer fallback,
TUI settings-host routing, and protocol docs. The test-only AJV root was the
existing `tools/chatgpt-connector/package.json`; no dependency tree was changed.

The four `test/dependency-readiness.test.ts` cases were intentionally excluded:
they inspect installed package dependencies and lock/integrity metadata. The
actual compiler is a separate check. `npm ci`, package-wide `npm test`, `npm run typecheck`, and any
real compiler check were not run. The merged package now defaults to its own
authentic manifest/lock bundle; installed local dependency readiness remains a
separate prerequisite. No config apply, state creation, plugin activation,
participant interaction, upstream edit, commit, or push occurred.

## Parent follow-up

The parent independently read the returned checker/preflight and reproduced
three missed failures: a self-rehashed receipt accepted fabricated declarations,
a manifest could grow after stat and be read without a bound, and a FIFO swap
could block open. The shared descriptor reader now uses fixed allocations,
nonblocking/no-follow opens and file-identity rechecks for config/JSON/tree reads.
The authentic package's registry integrity and `index.d.ts` SHA-256
`f3d8c757e148ad968f0d98697987db363070abada5f503da3c06aefd9d4248c1`
are anchored in source; a self-asserted acquisition receipt is not authenticity.

All **83/83** package tests passed independently after those corrections,
including the three red/green cases. The existing private declaration package
at the path below passes the new fixed-byte check (four files, 31,748 bytes;
tree SHA-256 `d775095dfb72ae572c820b61942c8afaf6c6dccae289e8e41288be04614b826f`).
A fresh direct strict library check has now **passed**: TypeScript 5.9.3,
19 configured TypeScript roots, strict/no-emit with `skipLibCheck:false`, exit 0.
The earlier worker pass and timeout below remain distinct historical results.
No package installation or new download was needed for this follow-up.

The parent also reproduced the explicit project-config preview: entry absent,
`ready-source` / `preview-ready`, `actionTaken:none`, state directory absent and
selected config hash unchanged. This still does not inspect other configuration
layers, register a plugin or establish participant/model/UI behavior.

## Verified

- Package tests: **80/80 passed**, with the package's existing AJV test-root
  override. This selects a test dependency-resolution root only; it is not a
  runtime configuration or credential option.
- Strict TypeScript 5.9.3 check: one direct run **passed** with `strict:true`,
  `noEmit:true`, and `skipLibCheck:false`. It used the pinned in-worktree
  compiler, Node types, and plugin SDK plus authentic
  `@types/json-schema@7.0.15` in private `/tmp/opencode` scratch. The declaration
  acquisition was checked against npm registry SHA-512 integrity
  `sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA==`.
  A later package-command rerun with the same declaration root exceeded the
  checker's 180-second bound (exit 124, without a TypeScript diagnostic). Treat
  strict-check duration as variable; the timeout is inconclusive, not a pass.
- Read-only preflight: `ready-source` and `preview-ready` for the selected
  worktree and project config. The selected config had no package entry; the
  preview proposed appending one entry while preserving the existing plugin.
  `liveRegistration` was **not checked**.
- The preflight reported `writesPerformed:false` and `actionTaken:"none"`.
  The selected `opencode.json` SHA-256 remained
  `9fcd0b084a3f30995408963e52a9bd0d3f31b98c5ee1f65b6b699b028fbc47c4`, and the
  package's `local-state/` directory remained absent.

## Reproduction commands

Run these from `tools/session-coordination`:

```sh
COORDINATION_TEST_DEPENDENCY_PACKAGE=/home/james/repos/computer-use/tools/chatgpt-connector/package.json npm test
```

The optional AJV root override is documented in the package
[README](README.md#verification-and-honest-limits). The strict check used the
explicitly selected acquired declarations:

```sh
node strict-check.mjs --dependency-package ../opencode-plugins/resource-monitor/package.json --types-root /tmp/opencode/coordination-json-schema-QdKA4F/node_modules/@types --timeout-ms 180000
```

The checker is offline by default. If the private scratch declarations are no
longer available, acquisition requires the separate explicit
`--acquire-json-schema-types` option; no dependency install or project
`node_modules` change is implied. The package script's outer typecheck deadline
is 90 seconds; the direct command above allows the runner's 180-second limit.
One later package-command retry, with the outer bound temporarily raised to 185
seconds, still reached the runner's 180-second timeout. Treat timeouts as
inconclusive, not as compiler diagnostics or passing checks.

The preflight command inspected only the explicitly selected project config;
other config layers and live registration were not queried:

```sh
node activation-preflight.mjs --root /home/james/repos/computer-use --config opencode.json --state-directory /home/james/repos/computer-use/tools/session-coordination/local-state --dependency-package tools/opencode-plugins/resource-monitor/package.json
```

## Limits

`preview-ready` is a read-only source/prerequisite and config-preview result, not
authorization, plugin activation, or proof of live registration or client
behavior. No config apply, runtime activation, message, or state-directory
creation was performed. See the [acceptance checklist](ACCEPTANCE.md) for the
separate activation and live-acceptance gates.
