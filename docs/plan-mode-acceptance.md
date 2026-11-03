# Fresh Plan-mode response acceptance

**Outcome: partial behavioral acceptance.** One fresh, dedicated OpenCode Plan
session read the existing exported plan and returned a substantive ordered
summary inline, followed by Markdown link syntax targeting that actual file.
The response was captured as CLI JSON output; no rendered-client link or link
opening was tested, so this does **not** satisfy rendered/clickable-link
acceptance.

## Scope and source checked

- Repository: `/home/james/repos/computer-use`; OpenCode `v2.1.1`.
- The local [Plan-mode response rule](../AGENTS.md#plan-mode-responses) requires
  a substantive in-chat plan and a link to the verified actual plan file. The
  [planning skill](../.opencode/skills/planning/SKILL.md#deliver-the-plan-in-chat)
  states the same behavior.
- The existing [goal plan export](goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/plan.md)
  existed and was read by the fixture. Its content reported plan revision `25`
  and export time `2026-10-27T14:39:37.070Z`; the fixture's response reflects
  that read, not the earlier preflight read of revision `23`.
- The effective configuration exposes `plan` as a primary agent. Its configured
  default model is `openai/gpt-6-sol#max`, so the fixture explicitly overrode
  it with the requested `openai/gpt-6-luna#xhigh`. The local model catalog
  confirmed that model is enabled and that `xhigh` is an available variant.

## Fixture identity and invocation

| Field | Observed value |
| --- | --- |
| Session title | `ACCEPTANCE FIXTURE — Plan mode — 2026-10-27` |
| Session ID | `ses_e82327141ffe8XfIT91agQixW5` |
| Agent | `plan` (Plan, primary) |
| Model | `openai/gpt-6-luna#xhigh` |
| Location | `/home/james/repos/computer-use` |
| Outcome | `succeeded` |

The single prompt was run synchronously with the documented CLI automation
interface, which returned model output directly. Exact invocation:

```sh
opencode run --agent plan --model 'openai/gpt-6-luna#xhigh' --title 'ACCEPTANCE FIXTURE — Plan mode — 2026-10-27' --format json 'Read only the existing export at docs/goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/plan.md; do not resume/adopt the goal, invoke goal tools, or edit anything. Return a substantive ordered inline summary of the objective, phase/current-task priorities, remaining blocked work, and verification/release gates, then include a clickable Markdown link to that actual file.'
```

The recorded session metadata was checked read-only with:

```sh
opencode api get /api/session/ses_e82327141ffe8XfIT91agQixW5
opencode api get '/api/session/ses_e82327141ffe8XfIT91agQixW5/message?order=asc'
```

The API record confirms the exact agent, model, variant, title, location, and
successful outcome. The message trace contains one completed `read` tool call
for the plan and no goal, edit, shell, or other tool call. No goal operation,
goal resumption, source/destination session interaction, GUI/browser activity,
or fixture-side file edit was performed.

## Raw returned final text

This is the assistant's final text as captured from the JSON event stream (not
a client-rendered transcript):

```text
According to the **read-only export**:

1. **Objective:** Finish consolidating the outstanding work: preserve and independently verify the review findings and completion criteria; safely reconcile PRs #2/#3 with local work; complete source-qualified goal documentation and handoff acceptance; verify loaded GNOME window-control v2; produce an approved, genuine simultaneous OpenCode/app demo; and reduce redundant routine approval prompts without weakening consequential gates. Screenshot deferrals and restricted PR #2 remain blockers, not completed work.

2. **Current priorities:** The active phase is `approval_friction`. Its current task, `instruction_cleanup`, is still in progress: resolve residual wording in shared skills while preserving handoff, identity, worker-overlap, and safety boundaries. The next listed priorities are the `docs/features.md` inventory and portable documentation guidance. `goal_workflow` is marked complete. The earlier delivery, imported-foundations, and baseline phases are complete.

3. **Remaining work:** Independent review and PR reconciliation are unfinished; PR #2’s full diff is blocked by restricted access. Window v2 still needs live readback and privacy-safe visual acceptance. The recorder fix has offline test evidence, but real native freshness/visual acceptance remains outstanding. Handoff source fixtures passed, but retained-destination continuation is unverified. The demo still needs genuine public-task footage and a user-approved motion preview before replacing the main demo; final media checks come afterward.

4. **Explicit blockers and gates:** Screenshot capture findings and the fresh-session screenshot test remain deferred pending a new capture contract. The motion-preview approval is missing. Live Plan-mode/client behavior and runtime policy acceptance remain unverified; source-only changes are not proof of runtime behavior. Final regression and criteria audits remain pending. No commit, push, publication, merge, or runtime rollout is authorized by this plan; those actions require their applicable separate approvals. Do not close the goal while required criteria remain blocked.

[Open the actual plan export](docs/goals/53eacb15-7fd9-4c20-b4d4-038111b68e6f/plan.md)
```

**Content result:** The response supplied an ordered inline summary of the
objective, active phase/task, subsequent priorities, remaining work, blockers,
and verification/release gates. Its Markdown link target matches the existing
repository export linked above. This passes the fresh-session inline-content
check and confirms link syntax/target presence only.

## API and permission limits

The actual local OpenAPI document and official V2 documentation were inspected.
The HTTP `POST /api/session/{sessionID}/prompt` contract durably admits a message
and schedules the agent loop; it does not return the completed model response.
The experimental `POST /api/experimental/session/{sessionID}/wait` has no
timeout parameter. That asynchronous route was not used, avoiding an unbounded
wait or an orphaned prompt. The documented `opencode run` CLI path was used for
one synchronous run instead.

Official references: [Agents](https://opencode.ai/v2/docs/agents/),
[Models](https://opencode.ai/v2/docs/models/), [CLI](https://opencode.ai/v2/docs/cli/),
[API](https://opencode.ai/v2/docs/api), and
[OpenAPI specification](https://opencode.ai/v2/openapi.json).

This was not a hard security sandbox: the effective Plan policy denies edits to
ordinary project files, but inherits broad permission rules that can allow
shell operations. The prompt prohibited edits and goal operations, and the
observed trace contains only the read call. Do not generalize that observed
behavior into a guarantee that every Plan session is technically unable to
write.

## Acceptance boundary

- **Passed:** fresh titled session in the same repository; exact Plan agent and
  requested model/variant verified in session metadata; successful response;
  substantive ordered inline plan; actual existing file target present in
  Markdown link syntax; fixture trace shows only a read.
- **Not tested:** how a TUI, desktop, or web client renders the response; whether
  the link becomes an interactive control; or whether activating it opens the
  local file. CLI JSON/raw Markdown is not evidence of client rendering or link
  opening. No screenshot or GUI inspection was performed.
- **Overall:** keep rendered-client link acceptance explicitly pending. This
  report does not claim full native/client acceptance or a change to OpenCode's
   global Plan behavior.

## User-observed client failure — 2026-10-27

The user supplied a screenshot of this repository's current TUI with the
`request checklist` Markdown link rendered and activated. Its target was
`docs/request-coverage.md`; the toast reads:

> Only http and https links can be opened in the browser: docs/request-coverage.md

This establishes a real failure for that relative local-document target, not a
failure to find the file and not acceptance of the historical Plan link above.
Neither valid Markdown nor a matching file path proves a usable click. No new
capture or GUI action was performed to obtain this evidence; the screenshot
was supplied by the user, so the screenshot-backend hold remains unchanged.

The bounded correction uses supported HTTP opening with a read-only loopback
viewer restricted to explicitly selected documents. It does not modify the
installed TUI, add a generic repository server, publish files, or establish a
native file-link handler. HTTP/content/security tests and an actual user/client
click remain different acceptance layers. Short-lived capability URLs belong
in the response, not source documents or goal exports.

Parent independently read the viewer and tests and reran all ten tests. A
detached eight-hour viewer was then started with exactly the checklist and
current successor plan. Both actual URLs returned HTTP 200 with expected
document text, escaped/rendered tables, no-store/referrer/CSP protections; a
second request after the launcher exited confirmed the reader stayed reachable.
The goal-docs export sanitizer also has a regression removing these short-lived
capability URLs from exported checkpoint text; all 100 companion tests passed.
No native TUI handler or deployed installation was patched, and the subsequent
user/browser click remains unobserved.

To create a fresh local view after expiry, run from the verified checkout:

```sh
python3 scripts/local-doc-viewer.py --file docs/request-coverage.md
```

Use the HTTP `url` printed in its readiness JSON. Optionally pass a second
explicit `--file` for a verified plan. Only selected documents appear in the
reader's navigation; references to unserved files remain literal text. The
reader preloads snapshots at startup, defaults to an ephemeral port and an
eight-hour lifetime, and can be stopped with Ctrl+C when run in a terminal.
It creates no recurring job or account/network configuration. Restart it to
show changed document content; do not promise old capability links persist.
