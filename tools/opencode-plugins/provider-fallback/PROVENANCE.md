# Source provenance

## Upstream source reviewed

- Repository: [`jtmb/opencode-rig`](https://github.com/jtmb/opencode-rig)
- Exact pin: [`b17182cd5bcd55c282a94ea18f87a16460813c35`](https://github.com/jtmb/opencode-rig/commit/b17182cd5bcd55c282a94ea18f87a16460813c35)
- Source directory: [`platforms/linux/ubuntu/computer-use/plugins-v2/codex-fallback`](https://github.com/jtmb/opencode-rig/tree/b17182cd5bcd55c282a94ea18f87a16460813c35/platforms/linux/ubuntu/computer-use/plugins-v2/codex-fallback)

The server implementation and helper modules (`src/index.ts`, `chain.ts`,
`config.ts`, `detect.ts`, `model.ts`, `state.ts`, and `usage.ts`), the complete
upstream `test/` directory, `README.md`, `package.json`, `server.ts`, and
`tsconfig.json` were reviewed from that exact commit before adaptation. The
fallback tests in this package are rewritten fixtures for the adapted
boundaries, not copied upstream integration tests.

The upstream `usage.ts` imported
`platforms/linux/ubuntu/computer-use/plugins-v2/codex-usage/src/usage.ts`.
That parser and the sibling package manifest were inspected. Neither is
imported here: this package intentionally has no OAuth credential reader or
quota transport. No Codex usage UI/plugin, sibling package dependency, or other
`opencode-rig` integration is included.

The upstream package pinned `@opencode/plugin` 2.0.7, TypeScript 5.9.3, and
`@types/node` 22.18.6. The delivery source follow-up aligns this package's SDK and
theme to **2.1.1**, retaining the compiler/Node type pins and adding genuine
`@types/json-schema` **7.0.15** for strict library checking. OpenTUI and Solid
remain runtime peers, with local development pins for typecheck. This is a local
dependency/verification adaptation, not an upstream provenance or license change.
The prior 2.0.7 load/27-test pass is historical; the aligned source passes 30 tests
and a direct strict/library check. It remains unactivated.

## OpenCode v2 API references

Reviewed on 2026-10-27:

- [Plugin overview and package parts](https://opencode.ai/v2/docs/build/plugins/)
- [Server plugin API](https://opencode.ai/v2/docs/build/plugins/server/)
- [TUI plugins and additive slots](https://opencode.ai/v2/docs/build/plugins/cli/)
- [Typed plugin RPC](https://opencode.ai/v2/docs/build/plugins/rpc/)
- [OpenCode v2 HTTP API and RPC routes](https://opencode.ai/v2/docs/api/)
- [OpenCode v2 CLI/TUI usage](https://opencode.ai/v2/docs/cli/)
- [JavaScript SDK and plugin RPC](https://opencode.ai/v2/docs/build/client/)

The server registers a typed, read-only status method and a typed change
notification used only to refresh its readout after a successful fallback. The
TUI uses the documented `append: "sidebar.content"` slot placement; it does
not replace or reimplement the built-in sidebar.

## License status

No license is asserted or inferred. At the pinned commit, the upstream root
listing and direct `LICENSE`/`COPYING` lookups exposed no license file, and the
reviewed fallback package manifest had no `license` field. The source license
is therefore unspecified in the inspected material; this package does not add
an invented license notice or package license declaration.
