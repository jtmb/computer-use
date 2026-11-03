# Source-chat handoff simplification

The prior TUI exported goal state, created a destination, and parked a
`resume:false` seed behind an explicit continuation command. That is not the
requested conversational handoff. The named destination's later guidance was
admitted separately with steering; admission alone did not prove processing.

The revised `/handoff` instead steers the current chat with a request to compose
one continuation message, include the relevant existing `HANDOFF.md` link/path,
create one same-worktree chat, and send it with immediate processing requested.
No goal RPC, goal creation/migration, automatic focus, preview or resume ceremony
is part of this command. The exporter and legacy RPC remain separate and intact.

## Bounded test-quality audit

- Exercised the actual TUI module and request builder, mocking only host/UI/API
  boundaries. Successful dispatch must name the source session and use
  `delivery:steer,resume:true`; accidental RPC/target-creation calls throw.
- Preserved command-collision, unreadable inventory, non-session route, worktree
  mismatch, selected-session location and mid-sync movement coverage. Added send
  failure, absent admission identity, concurrent invocation and disposal cases.
  Old focus/preview/open-ack wiring tests were replaced because those operations
  are no longer performed; their legacy helper/RPC tests remain.
- Installed SDK typechecking exposed a fixture mistake: `context.client` returns
  an unwrapped inbox item, not HTTP `{data:...}`. Both code and fixture now check
  the actual item identity. Strict typechecking against installed
  `@opencode/plugin` 2.1.1 passed.
- `node --experimental-strip-types --test .opencode/plugins/goal-docs/*.test.ts`
  passed: 82 tests, zero failures. This includes adjacent exporter, state,
  permission, filesystem, locking and retained legacy-RPC contracts.

These checks establish source wiring, not live TUI loading or model compliance.
The next live acceptance must observe the source-authored continuation message,
correct document path, destination admission and actual receiver processing.
No test here created a real chat, reloaded a client, changed runtime settings,
resumed a goal, committed or pushed. Old client instances may retain old wiring.
