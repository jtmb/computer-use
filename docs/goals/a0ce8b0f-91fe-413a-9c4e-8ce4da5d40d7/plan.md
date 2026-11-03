# Plan — `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7`

- Goal ID: `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7`
- Source session ID: `ses_e85293a02ffe7Hlk5CfyoIgStT`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-27T12:59:38.407Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `cancelled`
- Plan revision: `59`
- Record: `current`

## Goal objective

> After the user switches to Build mode, fix all nine confirmed review findings in /home/james/repos/computer\-use: \(1\) prevent reading/deleting a user's screenshot through false capture ownership, including staggered and concurrent captures; \(2\) enforce OpenCode permissions before GUI mutations and other protected desktop operations; \(3\) report screenshot cleanup failures truthfully; \(4\) reject incomplete/corrupt PNGs before attaching them; \(5\) enforce the screenshot byte limit during reading, not after unbounded allocation; \(6\) account for screenshots that may be produced despite trigger failure, timeout, or cancellation; \(7\) make desktop\_tree's schema match its implemented arguments; \(8\) preserve ambiguity candidates alongside backend errors; and \(9\) make handoff/resume goal recovery source\-session\-aware so it cannot substitute an unrelated goal\. Preserve normal OpenCode behavior, existing desktop capabilities and safety boundaries, /handoff\_resume naming, mandatory handoff plan/history, unrelated dirty and staged work, the goal plugin, MCP settings, and the current Code Mode configuration\. Add regression coverage, reconcile documentation, and independently verify the real outcomes\. Do not commit, push, publish a PR, deploy runtime copies, change security settings, or adopt a screenshot approach that changes user interaction without separate explicit approval\.

## Persisted plan

Plan revision: `59` · updated 2026-10-27T09:30:17.000Z

> Fix the nine confirmed review defects; safely reconcile the current open PRs with preserved local work; add automatic repo\-local goal exports under docs/goals/&lt;goal\-id&gt;/, a detailed plain\-English planning skill, and /handoff creation/seeding/opening of a fresh same\-worktree session\. Leave upstream goal\-plugin storage/behavior, MCPs and Code Mode unchanged\. Integration uses isolated, reviewed, pinned revisions and preserves staged, unstaged and untracked work\. Plan only until Build mode and explicit goal resumption\.

### Completion criteria

- Finding 1: successful captures have demonstrable request\-specific ownership; staggered user screenshots and concurrent requests cannot cause unrelated images to be read, attached, or deleted\. A timing delay or filename difference alone is not accepted as ownership proof; successful native capture must still work\.
- Finding 2: desktop permission checks precede protected side effects and respect allow/ask/deny, with denials reaching the caller rather than being swallowed; tokens remain target\-freshness guards, not authorization\. Verify denied operations never reach the backend\.
- Finding 3: cleanup success is verified and cleanup failures return accurate retained\-file/error information; no outcome or documentation falsely claims deletion or that an attachment is the only copy\.
- Finding 4: complete genuine PNG fixtures succeed, while truncated headers, incomplete image data, malformed chunks, and corrupt images are rejected before attachment; deletion still requires proven capture ownership\.
- Finding 5: file reads enforce a fixed byte budget before unbounded allocation, including files that grow while being read; oversize captures are refused and handled according to verified ownership and cleanup status\.
- Finding 6: trigger errors, timeouts, cancellation, and post\-trigger failures have bounded lifecycle handling; possible or confirmed retained captures are reported accurately, and no unowned file is removed\. Cancellation reaches trigger, wait/poll, and read operations as applicable\.
- Finding 7: every desktop\_tree schema argument is implemented or removed; unsupported filters cannot silently become an unfiltered tree dump\. Adapter and schema regression tests agree\.
- Finding 8: backend failure results retain useful stdout candidate summaries alongside stderr explanations, within the existing output budget; ambiguity continues to refuse mutation and supports a subsequent explicit nth selection\.
- Finding 9: handoffs preserve source project/directory, session and goal identity where available, goal status, plan and historical documentation\. Resume never replaces that source with an unrelated current\-session goal; missing or inaccessible source data has an explicit safe fallback\. /handoff\_resume remains the command name\.
- All nine findings have independently checked regression evidence; focused tests, health checks, whitespace/syntax checks, permission integration checks and an approved fresh\-session screenshot interpretation test pass\. The goal plugin, MCP configuration, codemode:false setting, security boundaries, unrelated dirty/staged work and standard coding tools remain unchanged; no unapproved commit, push, PR publication or runtime deployment occurs\.

### Phase `contracts` — in_progress

> Preserve existing work and establish supported capture, permission, goal\-export and session\-transfer contracts before implementation\.

- **`baseline` · completed:**
  > Record staged, unstaged and untracked scope, relevant tool/API versions, current tests and a nine\-finding\-to\-regression checklist without altering unrelated work\.
  - Evidence:
    > Preserved staged/unstaged binary patches, tar and hash/mode manifest under /tmp/opencode/computer\-use\-preservation\-1793071308158934629\. Isolated reconstruction from b47765e passed all 17 hashes and retained the staged command rename; reconstructed baseline tests 15 passed\. Checklist/evidence saved in docs/goals/a0ce8b0f\-91fe\-413a\-9c4e\-8ce4da5d40d7/implementation\-audit\.md\.
- **`ownership_contract` · blocked:**
  > Investigate supported native GNOME capture mechanisms for request\-specific output ownership; specify concurrency, cancellation and retention guarantees\. Do not substitute settling delays for proof, bypass GNOME restrictions, change user settings, or silently add interaction prompts\. Ask the user if the required UX/safety contract cannot be achieved with current approval\.
  - Blocker:
    > User explicitly selected 'Defer screenshot changes' after being told the request\-correlated portal2 route requires visible selection and truthful possible file retention\. Leave screenshot backend unchanged, do not invoke unsafe inventory/delete capture, and do not grant permissions\. Findings1/3/4/5/6 remain unresolved; capture implementation requires later user direction\. Continue independent non\-capture work\.
- **`permission_contract` · completed:**
  > Verify the running OpenCode v2 permission API, define scoped desktop actions/resources and read\-only\-agent behavior, and confirm authorization remains separate from preview freshness without modifying the goal plugin or MCP/Code Mode configuration\.
  - Evidence:
    > Official V2 permission contract reviewed; parent independently read corrected registration/tests and ran 25 passing Node tests\. Reproduced with exact live /api/agent/\{plan,architect,build\} ordered policies using fake backend: checks read\+desktop\_mutate\+edit, Plan/architect backend0 with deny:edit, build backend1\. Permission rejections propagate; no GUI action/capture or config change\.
- **`export_transfer_contract` · completed:**
  > Verify the service's actual goal\-state location and installed plugin read contract; select a version\-checked read\-only integration without moving shared raw state into a repo\. Verify installed session\.create and session\.prompt\(resume:false\), TUI router/tab navigation and client loading\. session\.view is a read\-receipt endpoint, not UI navigation\. Define one authoritative /handoff registration with no Markdown/TUI/server command collision\.
  - Evidence:
    > Version\-checked read\-only goal source/shared\-state contract, installed create/custom\-ID/prompt\(resume:false\), actual client loading/navigation verified\. Approved pilot CLI target path proven; sole producer observed with collision guards\. Approved live retry exported revision58, created exactly1 independent same\-worktree target, admitted156899\-byte actualseed and focused it with openack\. Pending\-cache/readonly\-preview correction verified in same target without another producer\. SDK21files/139tests/health pass\. Source storage unchanged; continuation/capture acceptance separate\.

### Phase `pr_integration` — pending

> Safely integrate the current open PRs into an isolated combined result without overwriting this session's changes, unrelated work or required safety behavior\.

- **`pr_inventory` · pending:**
  > Re\-read the open PR inventory for jtmb/computer\-use and pin base/head SHAs, changed paths, commits, draft status, dependencies, reviews and checks before integration\. Initially identified: PR \#2 Browser guardrail fix \+ email\-management skill, head 5ad1343820add607fd3c5381f4c1923b3c05ed69; draft PR \#3 docs: refresh README with Splice mascot and maintenance skill, head 11cbb763328f27ae97c03b8e57f832f0fe9fb78b; both base main at b47765e4a9f5c124c4716deb52962e17d7fb4a2a\. New PRs or changed heads require fresh review, not automatic scope expansion\.
  - Evidence:
    > Fresh permitted all\-state inventorypage1perPage5 returned3total: updatedopenPR2 head96fa9e747809245958dcb8fd24b0e9b4300f0e1e/title Browser fixes, Playwright re\-enable, and email\-management skill; unchangeddraftopenPR3 head11cbb763328f27ae97c03b8e57f832f0fe9fb78b; closedunmergedPR1 headd2146dcc\. BothopenPRs basemainb47765e\. User clarified review\+localintegration desired; changedhead requires newdiffreview\. PR2get\_files stilldeniedlockdown, no unreadintegration\. Existing PR3carryback unaffected\.
- **`preserve_local_work` · completed:**
  > Before any Build\-mode fetch/application, inventory and create a verified recoverable preservation bundle for staged and unstaged binary/text diffs, staged rename, untracked plugin files and relevant file metadata/hashes in an approved location\. Verify reconstruction in isolation without touching the active checkout\. No automatic stash, reset, restore, checkout\-overwrite, clean or deletion; no checkpoint commit without explicit approval\.
  - Evidence:
    > Verified initial staged\+unstaged binary patches/archive/manifest; reconstructed17exact hashes and rename independently\. Isolated PR3 candidate15non\-overlap files also verified against bundle; original checkout/index preserved\. Later deltas require fresh preservation before carry\-back\.
- **`pr2_review` · blocked:**
  > Inspect PR \#2's full pinned diff, surrounding files, reviews and checks through an allowed read path; map browser guardrail and email\-management changes against local desktop/privacy behavior and planned work\. Do not integrate an unread PR or bypass MCP lockdown\. Acceptance: record exact reviewed SHA, overlap/conflict assessment and required regressions\.
  - Blocker:
    > User explicitly requested review/integration of newly updated PR2\. Fresh inventory: title Browser fixes, Playwright re\-enable, and email\-management skill; currenthead96fa9e747809245958dcb8fd24b0e9b4300f0e1e supersedes initial5ad1343, baseb47765e\. Allowed GitHub pull\_request\_read\(get\_files,page1perPage10\) again returned access to pull request is restricted by lockdown mode\. No diff read/fetch/gh/web bypass/security change/integration performed\. Need accessible permitted source or user\-supplied patch before reviewing/integrating relevant changes; current MCP settings remain protected\.
- **`pr3_review` · completed:**
  > Review draft PR \#3 at its pinned SHA, including new readme\-maintenance skill and assets/splice\.png\. Explicitly reconcile overlapping README\.md and \.opencode/skills/README\.md with our existing desktop\-tool docs and future planning/handoff catalog additions\. Preserve both valid intents instead of selecting an entire ours/theirs version\. Draft status is not approval to mark ready, publish or merge\.
  - Evidence:
    > Parent read full pinned PR3 diff/metadata/reviews/checks; no submitted reviews, GitGuardian success\. Reviewed baseline integration README/skill/asset against preserved local intent, immutable11cbb763328f27ae97c03b8e57f832f0fe9fb78b bytes and original b47765e base\. PNG CRC/dimensions and15baseline tests independently verified\. Re\-read current inventory: same head/base/draft, exactly2open PRs; draft remains draft\. Later combined local carry\-back acceptance separate\.
- **`integration_worktree` · completed:**
  > After preservation and permitted PR review, construct a dedicated integration branch/worktree under an approved repository path, leaving the original dirty checkout and index intact\. Reconcile local changes and each reviewed PR incrementally using pinned revisions and a file\-by\-file conflict ledger\. Serialize overlapping file ownership; ask about incompatible product/security decisions rather than discard either side\. No merge commits or other commits without separate explicit approval\.
  - Evidence:
    > Dedicated /home/james/repos/computer\-use\-pr\-integration detached at pinned11cbb763; parent verified base/merge\-baseb47765e, clean candidate index, preservation hashes for15non\-overlap files and conflict ledger retaining README/catalog desktop intent\. No commit/merge or changes to original index; final later\-delta reconciliation delegated separately\.
- **`integration_verification` · pending:**
  > Run per\-PR checks and all local/new regression suites on the combined tree, including browser/privacy rules, desktop gates, README/skill metadata and links, planning skill and handoff/export behavior as those phases land\. Verify every protected local change is present or has an explicitly approved semantic replacement and every accepted PR change has evidence; a conflict\-free Git operation alone does not pass\. Obtain independent review and record the final combined diff\.
  - Evidence:
    > Parent follow\-up PR3carryback child ses\_e8496ea44ffeV8ecLa1B5tYDSf: ACCEPTED local carryback only\. Read complete new README/catalog and verified23protectedsource hashes, originalHEAD/indexbytes/stagedbinarypatch,25skills/catalog,3incomingfiles byteexact pin11cbb763, healthcheck and staged/unstaged whitespace\. Scoped preservation /tmp/opencode/computer\-use\-pr3\-carryback\-preservation\-20261027T035307Z\-326034\. No commits/push/deploy/remote merge; broader companion/combined/live checks remain pending\.
- **`integration_release_gate` · pending:**
  > Before carrying any combined result back to the working branch or publishing/merging, re\-read original checkout/index and PR/base heads to detect drift, present exact SHAs, conflict decisions, preserved changes and checks\. Do not overwrite later work\. Obtain separate approvals for commit, push, PR publication and each remote merge; re\-review changed PR heads\. Acceptance: reviewed PR intent is integrated with our changes intact, no hidden omissions, and remote verification follows any explicitly approved release action\.

### Phase `planning_skill` — completed

> Create a reusable planning skill that defaults to the requested detailed, natural language style and repository\-aware visuals without bloating simple requests\.

**Verification:**

> Parent independently validated bundle/frontmatter/local links/examples/metadata and catalog24before incoming PR3skill\. Two corrected fresh acceptance trials cover proportionate small\-doc and architecture plans: readonly inspection, accurate links/proposedtree/dependencies/tradeoffs/tests and explicit Build\+implementation approval\. PR3catalog25combined\-count recheck remains integration\_verification\.

- **`planning_bundle` · completed:**
  > Create canonical \.opencode/skills/planning/SKILL\.md and README\.md, with focused linked examples if needed, valid frontmatter and a clear trigger for making/revising plans\. Keep this distinct from the built\-in Plan agent; update \.opencode/skills/README\.md routing and metadata consistently\. Acceptance: fresh discovery finds the skill without replacing existing agent behavior\.
  - Evidence:
    > New planning SKILL\.md, README\.md and examples\-and\-review\.md read independently; valid metadata and local links, catalog24 matches actual directory count, prior catalog work retained; fresh acceptance session loaded planning through skill tool\.
- **`planning_style` · completed:**
  > Specify conversational plain English, concrete outcomes and sequencing, assumptions and tradeoffs, relevant file/repository trees, links to existing affected files, clearly labelled proposed new paths, verification/acceptance tests, blockers and approval boundaries\. Show before/after layouts or flow diagrams when useful; never invent line numbers, existing files, verified results or implemented changes\. Scale detail to the user's request rather than mandate an oversized template\.
  - Evidence:
    > Reviewed concise/architecture examples, evidence\-backed links/trees, proposed\-file labels, phased dependencies/tradeoffs/tests and explicit Build\-is\-not\-consent plus dirty\-baseline rules\. Corrected source independently validated; behavioral recheck remains planning\_acceptance\.
- **`planning_acceptance` · completed:**
  > Validate the bundle/frontmatter/links and compare representative plans for this goal, a small fix and an architectural change against a user\-facing rubric: human\-readable explanation, accurate file links/trees, clear dependencies, bounded scope and concrete verification\. No automatic goal creation, edits, execution or Plan\-mode writes outside allowed paths merely because the skill loaded\.
  - Evidence:
    > Validated bundle/catalog/frontmatter/links independently\. Source discovery plus small\-doc trial ses\_e848a1fe5ffeSZa5LDb16sSLQz kept work readonly and required Build\+explicit go\. Architecture trial ses\_e84870540ffeekVT055WRjpY4S loaded planning, inspected only allowed3files, supplied clickable file links, proposed tree, phased dependencies/tradeoffs/tests and explicit approval boundaries, and labelled unverified exporter/storage assumptions\. No goal mutations or capture/test/implementation calls in trial output\.

### Phase `capture` — blocked

> Fix screenshot ownership, cleanup, validation, bounded reads and lifecycle failures together without losing working capture/image delivery\.

**Blocker:**

> All capture implementation tasks deferred explicitly by user\. Findings1/3/4/5/6 and approved livecapture acceptance remain required, not removed or claimed complete\. Continue independent noncapture work\.

- **`owned_capture` · blocked:**
  > Implement the approved capture\-ownership contract and coordinated concurrent requests; add staggered user\-file, concurrent\-capture and ambiguous\-ownership regressions proving unrelated files are neither inspected nor deleted \(finding 1\)\.
  - Blocker:
    > User explicitly deferred screenshot changes\. Backend unchanged and unsafe inventory/read/delete path must not be invoked\. Request\-specific ownership needs later approved capture contract; retain full finding1 scope\.
- **`bounded_png` · blocked:**
  > Replace header\-only acceptance and unbounded reads with bounded acquisition and complete PNG validation using genuine image fixtures; test truncation, corruption, oversize and growth during reads \(findings 4 and 5\)\.
  - Blocker:
    > User explicitly deferred screenshot changes\. Genuine fullPNG validation and bounded/growing\-file acquisition remain required but unimplemented; no screenshot backend changes without later direction\.
- **`capture_lifecycle` · blocked:**
  > Track cleanup outcomes and possible files after trigger errors/timeouts/aborts, propagate cancellation through the lifecycle, and update caller messages; test failed unlink, partial trigger completion, post\-trigger errors and retained\-file reporting \(findings 3 and 6\)\.
  - Blocker:
    > User explicitly deferred screenshot changes\. Cleanuptruthfulness and trigger/timeout/cancellation lifecycle remain unresolved; no capture invocation or backendmutation now\.

### Phase `desktop_contract` — completed

> Restore authorization and accurate desktop schemas and error results\.

**Verification:**

> Parent26Node tests passed, exact live Plan/architect/Build policies evaluated through registered executor with fake backend, denied calls0\. Independent readonly review found only UTF8boundary bug, corrected and parentreproduced across8alignments\. Tree unsupportedfilters rejected and bounded stdout/stderr preserved\. Screenshot backend intentionally unchanged, deferred work remains separate\.

- **`desktop_permissions` · completed:**
  > Assert appropriate permissions before protected desktop work, preserve rejection semantics, and test allow/ask/deny plus blocked read\-only\-agent mutations with no backend side effect \(finding 2\)\.
  - Evidence:
    > Registered executors now assert read; apply additionally desktop\_mutate\+edit\. Parent25tests passed and exact live Plan/architect/build policy simulation blocked readonly backend calls0, allowed build1; asks tested pending approval; no GUI mutation or config changes\.
- **`tree_schema` · completed:**
  > Align desktop\_tree's registration and argv builder with its actual backend capabilities; remove or implement unsupported arguments and add schema\-to\-adapter coverage preventing silent filter loss \(finding 7\)\.
  - Evidence:
    > Tree schema exposes only app/bounds/all/includeText; adapter rejects name/exactName/role/showing/nth instead of dropping filters; independently inspected and regression suite25passed\.
- **`candidate_errors` · completed:**
  > Return bounded candidate stdout together with stderr on backend errors; add ambiguity fixtures and prove explicit nth follow\-up remains possible without weakening refusal \(finding 8\)\.
  - Evidence:
    > Corrected UTF8 truncation source and non\-ASCII regressions independently read; full Node suite26passed\. Parent repeated original emoji repro across8alignments: no unintended U\+FFFD, output&lt;=262144bytes and stderr details preserved\. Stdout/stderr ambiguity coverage remains intact\.

### Phase `repo_exports` — completed

> Make automatic, permission\-aware goal documentation exports the default for this repository without changing upstream goal storage or execution semantics\.

**Verification:**

> Parent reviewed source and behavior, reproduced/corrected timestamp, pagination and stale\-recovery defects, ran91 passing combined regressions and final health\. Actual automatic exact\-source export revision42 verified against manifest/snapshot hashes; persistent kernel guard observed, transient locks absent\. Source goal state remains read\-only, upstream plugin/config/MCPs/codemode unchanged; no model generation or per\-prompt injection\. Type\-check and live TUI transfer remain explicit separate verification gates, not exporter completion evidence\.

- **`export_adapter` · completed:**
  > Build a separate project\-local goal\-docs companion integration with a bounded, version\-checked, read\-only source adapter and exact session/project/worktree filtering\. Observe semantic plan/lifecycle/checkpoint changes from both tool and UI actions; do not wrap/replace goal tool executors or mutate upstream state\. Report unsupported source versions or gaps rather than guessing\.
  - Evidence:
    > Pagination correction parentdirectverified: sharedsessionListPage preserves data\+cursor \(includingwrappedresponses\) forstartupscan andtargetlookup\. Two actualflowregressions failedbeforefix thenpassed;4newchecks cover latergoal/destination,raw/wrappedpages,lookupbound/refusedduplicate\. Live2pageAPIread accepted directory\+limit\+cursor\. Full75combinedtests\+postrestartrealhealthpass\. Earlierboundedversion/read\-only/exactroot/meaningfulwatcher proofretained;actualsourceexports remainverified\. No sourcegoalplugin/storage/config mutation\.
- **`export_documents` · completed:**
  > Generate docs/goals/README\.md and docs/goals/&lt;goal\-id&gt;/\{plan\.md,HANDOFF\.md,work\-history\.md,snapshot\.json\}\. Include source IDs, scope, status, revision, export timestamp, objective, tasks, criteria, decisions, recorded evidence and history coverage; HANDOFF\.md always contains Plan and Historical documentation sections\. Snapshot contains selected fields, not raw shared goal state or full transcripts\.
  - Evidence:
    > Parent inspected actualdocs/goals index plus2ownsession goalpackages after auto\-discovery\. snapshot\.source includes exactsession/directory,github\.com/jtmb/computer\-use identity,mainworktree,scope\.,UTCexportedAt; goalid/status/rev33 matchsource\. HANDOFF substantive separatePlan/Historicaldocumentation renderedwithphases/tasks/criteria/decisions/history/checkpoints\+coverage\. Independently SHA256checked everygeneratedfile againstsnapshot and timestamps in all3Markdownfiles; manualaudit/checklist preserved\. Stableunchanged\-export timestamp/seedcontent remains unresolvedhandoff\_idempotency\.
- **`export_writer` · completed:**
  > Implement permission checks, Plan/read\-only deferral, owned\-file protection, safe path/symlink checks, per\-goal concurrency coordination, atomic bounded writes, revision consistency and semantic\-change deduplication\. Preserve exports when goals clear/replace, report stale/deferred/failed exports accurately, do not overwrite manual edits or leak cross\-project data\. No extra model calls or automatic document injection on every prompt\.
  - Evidence:
    > Parent reproduced stale\-recovery deletion race, corrected with persistent kernel\-held guard and verified red\-to\-green regression\. Real /usr/bin/flock tests prove inherited\-FD lock retention, cross\-process exclusion, post\-crash actual writer recovery, stable inode, link/nonregular/nonempty refusal, cancellation and failure release\. Existing bounds/manual\-edit/revision/atomic\-failure/root\-isolation tests pass\. Actual automatic repo export at revision42 has all4 file hashes matching manifest,3 Markdown hashes matching snapshot, exact source session/worktree, empty singly\-linked600 guard, no transient locks\. No reload/deployment or security change invoked\.
- **`export_regressions` · completed:**
  > Test create/update/checkpoint/pause/resume/complete/cancel/replace/clear, restart recovery, simultaneous goals/worktrees, unsupported state schemas, denied writes, disk failure, manually edited files, stale revisions and missing history\. Acceptance: only the correct repo goal is exported, no token\-counter\-only churn, and exporter failure never corrupts or blocks goal task state\.
  - Evidence:
    > 91 combined tests pass:59 goal\-docs,26 desktop,6 health\. Lifecycle\-to\-real\-writer fixture covers create/checkpoint/pause/resume/complete/replace/cancel/clear and usage\-only dedup; denial/disk failure preserve source bytes and retry same snapshot without prompts/session creation\. Bounded paginated startup/lookup, unsupported schema, state/write bounds, stale revision, manual edits, missing history, multiworktree isolation and concurrency/cancellation are covered\. Real FS\+separate idle Node process verifies exclusion/crash recovery; actual automatic current/archive exports verified separately\. This does not claim live handoff/TUI or deferred screenshots\.

### Phase `handoff_identity` — pending

> Keep the renamed resume command and mandatory plan/history while fixing source\-session goal recovery\.

- **`source_aware_handoff` · completed:**
  > Update canonical handoff commands and skill guidance to export a self\-contained plan/history with source session/goal identity, scope, status and provenance; only use current\-session goal recovery when it matches the source, and define missing/inaccessible\-source fallback without mutating the goal plugin \(finding 9\)\.
  - Evidence:
    > Parent follow\-up child ses\_e8495d3a1ffeDR1Y2I6a24UAR2: ACCEPTED narrow correction\. Independently read all3corrected branches and ran YAML/unchangedfullskillfrontmatter\+description/local\-link/keygate assertions, cleanwhitespace and stagedR100rename check\. Explicit contradictions stop\+ask; only consistentmissingfields are gaps\. Overlap requires sourceANDworkers explicitlyinactive/complete/untruncated; active/unknown/unavailable/incomplete asks\. Global skillID lookup retained\. Child46scratch assertions not independently rerun because removed; producer/runtime acceptance remains separate\.
- **`handoff_cases` · blocked:**
  > Verify original\-session and fresh\-session handoffs against matching, absent, unrelated, inaccessible and paused/closed goal fixtures; preserve command rename, valid frontmatter, mandatory sections and confirmation gates\.
  - Blocker:
    > Fresh behavioral guidance acceptance inconclusive: first configuredPlan run timed out240s with onlystep\_start/noassistanttext/notoolcalls; cases2/3notrun\. Parent read actualrun\.jsonl\+summary/report at /tmp/opencode/handoff\-recovery\-acceptance\-jc9iwc3o\. Follow\-up child ses\_e84702b6bffe25GiCzzRSB5Nl2: FAILED/INCONCLUSIVE, no behaviorpass\. Parent verified exacttestlocation\+Planagent, interrupted only fixture ses\_e846d6b86ffeaN0sEugl3AxOz6 with resume:false and independently confirmed absentfromactivemap\. Source/main/companion sessions untouched\. Userdelegationaskedonce/off: no worker/CLI\-modelretries until explicitsubagentson\. Staticguidanceacceptance remains valid\. Concurrentchanges preserved: requestedorchestrationskillupdate and companionownedwriter; no restore/discard\.

### Phase `session_handoff` — blocked

> Make /handoff actually transfer the verified handoff to a fresh visible session, not just write a document or print copy/paste instructions\.

**Blocker:**

> Command, actualclient focus/visiblecontext and idempotency implementation/tests verified\. Remaining execution\-safety/full\-live requirements need explicit /handoff\_resume/model approval; none granted\.

- **`handoff_command` · completed:**
  > Implement one authoritative /handoff workflow: flush and validate the selected docs export, create a fresh standalone session at the source's exact repository/worktree location, preserve intended agent/model and applicable restrictions, attach source provenance, and seed the actual self\-contained handoff text as initial input\. Do not fork the entire transcript, use a subagent as the replacement, or transfer secrets/blanket approvals\.
  - Evidence:
    > Approved real retry via normalhomeTUI exported revision58, created1 independenttarget ses\_goal\_docs\_e947f92f5e4b276263707296dc80e591 in exactworktree/project, preserved agent/model/variant and overridepresence/value, seeded156899bytes resume:false\. Message msg\_goal\_docs\_e947f92f5e4b276263707296dc80e591\. FullHANDOFF/plan/history agree on source/status/rev/time and actualseedSHA db6fc4ab\.\.\.2d2503b binds recordedfingerprint/transfer/stabletarget\. Complete2pageAPI/inbox proof; durable docs/handoff\-live\-acceptance\.json\. Initialfailedattempt retained separately\.
- **`handoff_client` · completed:**
  > Add the minimal supported TUI component to open/focus the destination session via router/tabs in the initiating client\. Prefer a verified unsent composer prefill if supported; otherwise seed a durable initial message with resume:false and clearly show that state\. Verify the handoff content is present and the UI actually selected the destination\. API\-only or unsupported clients get an explicit partial\-result/session\-ID report, never a false claim that a window opened\.
  - Evidence:
    > Real ownedhome\-client retry selected newtargettab and recordedcorrectsource\-boundopenack\. Native pendingseed wasblank; correctedpending\.sync beforefocus/reopen plusmatchingstable\-seed readonlypreview\. Threependingtests redbefore/greenafter; preview/truncation/wrong\-input tests pass\. In sameexistingtarget completeexact\-frame AT\-SPI shows Saved handoff context—no execution, actualresume:false text/continuationgate/sourceIDs\. No thirdproducer invocation; ownclient42677closed,targetretained\. Fullseed pending, not executedtranscript\.139tests\+strict21fileSDKgreen\.
- **`handoff_execution_safety` · blocked:**
  > Keep creation/seeding/opening separate from autonomous work: default transfer must not launch code execution or silently rebind/clone a goal\. /handoff\_resume performs explicit safe continuation after checking source goal provenance/status and active\-worker conflicts\. Preserve the source session, permissions and goal; obtain any required explicit goal pause/resume/new\-goal approval through the existing tools, never by editing state files\.
  - Evidence:
    > Actualtarget has1pendingfullseed,0messages/tokens/cost, absentactive\-map and readonlygoaladapter confirmsnobinding\. Sourceagent/model/restrictions/location unchanged; goalnotpaused/rebound/reactivated\. Actualpreview readonly/capped8000chars/truncationdisclosed/matchingseed; noextra transfer/model\. Source/workerinactivity and currentgoalidentity gates remain inseed/guidance/tests\.
  - Blocker:
    > Explicit /handoff\_resume/model behavior is not approved or invoked\. Need separately authorized bounded continuation acceptance; producer success is not authority for destination work or overlapping active source\.
- **`handoff_idempotency` · completed:**
  > Record a stable transfer identity and destination acknowledgement so retries after create/seed/open failures reuse the correct session instead of creating duplicates or pasting twice\. Retain source docs/session on every failure and report exact stages completed\. Tests must cover mismatched projects, parallel invocations, failed seed, failed UI focus, cancellation, missing client and duplicate retry\.
  - Evidence:
    > Regressions verify deterministic target/message IDs, unchangedexactseed retries, parallel/expiredleases/staleclaims/latefailures, cancellation afterpossiblecreation/admission, substitutedsourceack, mismatchedlocation/provenance, missingclient/failedfocus andmanualdocs/stalebundles\. InstalledAPI custom\-ID replay retainedsame session/inbox IDs without execution\. Actualretry has1sourcequalifiedtarget/input withstableIDs matchingfingerprint; firstfailedattemptcreated0targets\. Repeatedunchangedproducer not live\-tested, explicitlyrecorded\.139combinedtests pass\.
- **`handoff_live_acceptance` · blocked:**
  > After approved activation, run /handoff in the real supported client and verify: current docs were saved; exactly one new same\-worktree session exists; actual handoff text and source IDs are visible there; the client focused it; no autonomous execution started; and /handoff\_resume can explicitly continue without choosing an unrelated current\-session goal\. Check both API records and the rendered client, not just API success codes\.
  - Evidence:
    > Producer accepted: actual TUI export/create/seed/localfocus/openack plusactualcontextpreview\. Complete2pageAPIs prove1 independenttarget/1pending156899byte input\. Fullseed/fingerprint andembedded source/status/rev58/timecoherent\. Sourcehistorylateradvanced; oldseednotrewritten\. Original/retryapproval evidencearchived; current21sourcehashes/139tests/health green\. docs/handoff\-live\-acceptance\.json records previewfix afterinvocation on same retainedtarget, no thirdinvocation\.
  - Blocker:
    > Full task also requires explicit continuation without unrelated\-goal substitution; /handoff\_resume/model invocation separately unapproved/unverified\. Producer acceptance does not complete that requirement\. Futureproducerinvocations also needapproval\.

### Phase `verification` — pending

> Independently audit all nine fixes, preserved local/PR intent, documentation exports, planning skill quality and real session transfer before release approval\.

- **`docs_checks` · pending:**
  > Reconcile affected desktop, handoff and planning docs/catalog entries with implemented behavior and the reviewed PR contributions, including new docs/ paths and command effects; run all focused tests, health checks, syntax/frontmatter/link checks and staged/unstaged diff checks without unapproved deployment or configuration churn\.
  - Evidence:
    > README/cutover/checklist/audit and durableCLI/live receipts distinguish initialfailedattempt, separatelyapprovedretry, fullpendingseed/localfocus andlaterreadonlyvisibilityfix\.139tests incl86companion; strict21fileSDK09:20:54\.355Z0diagnostics; actualhealth/staged\+unstagedwhitespace pass\. OriginalHEAD/staging/config/capture/continuation andapprovedCLI/backup/previoussettings/separateprofile preserved\. Ownedprobeclosed,targetretained\. Remainingblockedcriteria/combinedaudit stayexplicit\.
- **`independent_review` · pending:**
  > Use bounded read\-only child review after Build\-mode implementation, then independently reproduce each finding's repaired behavior, review preservation of both local and integrated PR changes, and verify all export/planning/session\-transfer acceptance cases; resolve concrete defects before completion\.
  - Evidence:
    > Parent\-only review \(delegation remains off\) found and corrected actual strict\-type errors using published SDK declarations, plus untrusted JSON\-schema output narrowing at TUI boundary\. Output validation tests use actual handler results and malformed variants;8 actual\-TUI wiring checks pass\. Parent independently re\-read unchanged screenshot backend and corrected unsupported source documentation claims while preserving implementation hash\. Completed desktop/export runtime evidence remains valid\. Overall review still awaits remaining handoff identity/real\-client gates and deferred capture/PR2 scope; do not mark goal complete\.
- **`live_smoke` · pending:**
  > With screenshot privacy preconditions and required approvals satisfied, verify fresh\-session discovery of desktop tools and the planning skill, permission refusal and preview behavior; prove image delivery from pixels plus cleanup; verify export isolation and actual /handoff opening/seeding\. Recheck accepted PR behavior, standard coding tools, MCPs, goal\-plugin behavior and unchanged Code Mode configuration\.
  - Evidence:
    > Parent liveREADONLY native smoke now passed via actualregisteredtools: desktop\_apps returned7apps; boundeddesktop\_tree\(update\-notifier\) completevisited1; desktop\_find\(code,frame\) completevisited2 found currentVSCodeframe; desktop\_act focus preview apply:false returned dry\_run:true and freshtoken\(noapply\)\. Ambiguousapp read refused with usefulcandidateappnames stderr\. No screenshot, realfocusmutation,passwordinspection or schema/permissionconfigchanges\. This verifiesobservations/preview, not deferredimagecleanup or realpermissiondeny/allowmutations\.
- **`completion_audit` · pending:**
  > Audit every original criterion and added PR\-integration, repo\-export, planning\-skill and automatic\-handoff acceptance requirement against real files, preservation records, regression evidence and rendered/live results\. No added phase is optional or complete from intent\. Report exact paths, reviewed SHAs and unresolved limitations; keep commit, push, publication, deployment, remote merges and global rollout behind separate approval gates\.

### Decisions

- Scope includes all nine confirmed review findings, explicitly requested safe integration of the currently open PRs, automatic docs/ goal exports, the detailed human\-readable planning skill and actual /handoff session transfer\. Preserve every original completion criterion; added phases have explicit acceptance requirements in their tasks\.
- Do not optimize, remove or modify the upstream goal plugin, relocate shared internal state into a repo, change MCP servers, change codemode:false registration, or alter standard coding tools\. Use a companion integration for exports and handoff behavior\. Raise any incompatible incoming PR requirement for a user decision rather than silently overriding this boundary\.
- No implementation, modifying subagents, configuration reload experiments, fetch/integration experiments or runtime deployment while in Plan mode\. Switch to Build mode and resume the paused goal before execution\.
- Screenshot attribution remains a design gate: directory differences, settling delays or unchanged screenshot counts do not prove ownership\. Do not resolve finding 1 by disabling working screenshot functionality\.
- In Build mode delegate bounded disjoint work and retain parent verification; serialize shared command, catalog, README, index\.ts and existing test\-file edits\. Review PR overlap before related implementation to avoid unnecessary rework\.
- Portable records live under the selected repository/worktree's docs/goals/&lt;goal\-id&gt;/, with an index for multiple goals\. Legacy root handoffs are readable without automatic moves or deletion\.
- Planning skill prose should sound like a clear human explanation, with useful file trees, accurate links, phased reasoning, tradeoffs and tests, not a rigid verbose template\. Existing and proposed paths must be distinguishable\.
- The installed API has session\.create and session\.prompt\(resume:false\); documented TUI router/tabs provide navigation\. session\.view only marks an idle transition as viewed\. Test the installed client before claiming opening or composer prefill works\.
- A /handoff invocation is a bounded transfer request, not authority for autonomous execution, paused/closed\-goal resumption, changing an unrelated goal or moving raw goal state\. The destination initially receives context without execution\.
- Prevent duplicate command registration and duplicate transfer effects; preserve old sessions/docs on failure and distinguish exported, created, seeded and opened states\.
- Existing goal completion criteria remain immutable\. Objective text remains unchanged because the goal plugin requires explicit /goal edit for planned\-goal headline changes; update the requested scope through the plan without bypassing that objective guard\.
- Open PR inventory read from GitHub MCP: jtmb/computer\-use \#2 \(non\-draft, external fork shakiata/computer\-use, head 5ad1343820add607fd3c5381f4c1923b3c05ed69\) and \#3 \(draft, head 11cbb763328f27ae97c03b8e57f832f0fe9fb78b\), both targeting main at b47765e4a9f5c124c4716deb52962e17d7fb4a2a\. These are planning\-time snapshots, not integration approval or a guarantee that heads remain unchanged\.
- PR \#3 changes README\.md and \.opencode/skills/README\.md, both already dirty locally, and adds the readme\-maintenance skill and assets/splice\.png\. Reconcile additions semantically and preserve existing desktop/handoff/planning documentation intent; do not overwrite whole files or automatically mark a draft ready\.
- PR \#2 changed\-file retrieval was refused by MCP lockdown\. Do not evade the restriction via another API/client, fetch blindly, or integrate unread code\. An allowed inspection path is a recorded prerequisite, while other disjoint planned work may proceed after Build/resume\.
- Protect staged and unstaged content, the staged resume\.md \-&gt; handoff\_resume\.md rename and the four untracked computer\-use plugin files before integration\. Never use whole\-tree ours/theirs resolutions or destructive Git cleanup to make conflicts disappear\.
- User requested planning only\. No PR contents were applied, files edited, branches/worktrees created, commits/pushes/merges performed or runtime settings changed\. Final commit, push, PR publication, deployment and each remote merge require their own explicit approvals\.
- Build mode execution explicitly authorized and goal resumed\. Initial preservation bundle /tmp/opencode/computer\-use\-preservation\-1793071308158934629 contains staged/unstaged binary patches, status, head and a tar of 17 modified/untracked files; archive hashes verified\. This is scratch protection, not yet the complete reconstruction test or permanent backup\. Objective headline edit again refused by plugin's explicit /goal edit requirement; do not bypass it\. Saved plan revision 3 remains the full authorized scope\.
- Restart recovery: goal remains active\. One bounded inspection of /api/session/active shows planning skill, desktop\-contract and screenshot\-design children still running; do not relaunch or duplicate them\. Goal\-docs child ses\_e849dd3d5ffeQw4DM5WC6AHwFO was explicitly cancelled; parent follow\-up: failed/interrupted, no implementation files exist under goal\-docs and no completed work claimed\. Existing git status/staged rename and four desktop files remain present\. Resume only the cancelled child; preservation baseline must be verified before integration\.
- Independent batches running: planning bundle/catalog; desktop authorization/tree\-schema/error handling; read\-only screenshot ownership contract; resumed goal\-docs companion\. Track these here while plan lifecycle permits only one current phase/task\. Do not duplicate assigned files\. PR \#3 metadata/full diff/reviews/checks read at 11cbb763328f27ae97c03b8e57f832f0fe9fb78b; no reviews, GitGuardian passed, asset/render and combined behavior remain unverified\. No PR applied\. Preservation reconstruction also supplies evidence for preserve\_local\_work when that phase is reached\. Manual implementation\-audit\.md records source IDs, preservation, nine\-finding checklist and restart recovery\.
- Parent follow\-up for planning child ses\_e849dd761ffeXa07VJd2AuG1Ew: accepted implementation after reading all three new files and full catalog diff, independently validating YAML/metadata/local links/24\-directory count and git diff \-\-check\. Bundle accurately distinguishes facts/proposals, covers human\-readable scaled planning, trees/links/phases/tradeoffs/tests and approval/mode rules; prior desktop catalog changes retained\. Harness advertised planning skill after source update\. Runtime behavioral examples/fresh\-session acceptance remain to be checked; do not mark the entire planning phase verified yet\.
- Parent follow\-up screenshot\-design child ses\_e849dd461ffeYfKQSWk0CD1aG5: accepted read\-only investigation after inspecting current capture code, installed Shell XML and public portal docs and querying live interface version2\. Request identity is needed; settling/inventory cannot prove ownership\. No implementation or live capture accepted\. Screenshot UX decision is a task\-level blocker; continue disjoint work\.
- Parent follow\-up PR3 child ses\_e8496ea44ffeV8ecLa1B5tYDSf: changes\_required, safety stop respected\. Independent git ref and current GitHub PR3 metadata both resolve to 40\-character SHA 11cbb763328f27ae97c03b8e57f832f0fe9fb78b, exactly matching recorded pin\. Target integration worktree does not exist; no candidate files created\. Resume with explicit separated full pin; do not refetch or redo completed fetch\. Original working checkout changes remain present\.
- User decision: defer screenshot changes, not approve portal picker/retention changes or unattended permission grants\. Preserve original capture requirements and unresolved findings; do not mark capture complete or close the goal as achieved while they remain\. Do not use the unsafe capture path during verification\. Goal remains active for independent desktop authorization/schema/error fixes, docs exports, planning/handoff and permitted PR3 integration\. PR3 child resumed after parent\-confirmed exact 40\-character pin; already completed fetch must not be repeated\.
- Parent follow\-up desktop child ses\_e849dd42cffetacy9UFJJ0R7z0: changes\_required\. Read all edited source/tests and independently reran 21 passing Node tests\. Tree schema/rejection and bounded stdout\+stderr fixes verified\. However actual installed Plan\-agent permissions have base \* allow and edit deny; permission evaluation simulation with those exact live rules allows read\+desktop\_mutate and reaches backend stub for apply\. Must honor existing read\-only edit gate in addition to scoped mutation policy and add real\-policy regressions; no live GUI mutation occurred\.
- Parent follow\-up handoff child ses\_e8495d3a1ffeDR1Y2I6a24UAR2: changes\_required for portability refinement\. Full scoped diff, frontmatter/unchanged skill description/local links and staged rename independently checked\. Source\-ID and historical\-data safeguards accepted by inspection, but global handoff\_resume must not assume consumer worktrees contain \.opencode/skills/session\-context/SKILL\.md; load the available skill by ID or report missing capability\. Runtime companion/session behavior remains separate and unverified\.
- Fresh planning\-skill acceptance session ses\_e84917a15ffe3mqWuKH5hfD087 completed: loaded planning via skill tool, read source and returned a scoped plan with accurate file links, named desktop tools and checks labelled future\. Tools were read/inspect only, no captures/tests/goal mutations\. Quality caveat: final sentence implied switching to Build alone authorizes edits; revise skill examples/rubric to explicitly reject that claim and retain separate implementation authorization\. Do not mark behavioral acceptance complete yet\.
- Parent follow\-up handoff child ses\_e8495d3a1ffeDR1Y2I6a24UAR2 after portability correction: accepted source\-guidance implementation\. Independently read corrected step5, validated YAML/skill\-by\-ID/missing\-capability\-before\-overlap gate, clean whitespace and preserved staged R100 rename\. Initial literal assertion expected word 'unverified' while actual correct wording is 'could not be verified'; corrected the test, not source\. No runtime handoff/session transfer claimed; source contract and legacy/provenance safeguards verified by prior full diff inspection\.
- Parent follow\-up corrected planning child ses\_e849dd761ffeXa07VJd2AuG1Ew: accepted after source inspection and independent YAML/local\-link/ASCII/length/approval\-and\-baseline validation\. Explicit Build\-is\-capability\-not\-consent rule and negative wording example are present\. Source acceptance complete; fresh\-session behavioral recheck still required, previous single trial was not fully accepted\. Parent also updated health\-check\.sh to run all computer\-use \*\.test\.ts \(not just legacy logic suite\), require contract\.test\.ts, and documented TypeScript\-capable Node in setup\.md; bash syntax, actual health check and whitespace passed\. These checks do not resolve deferred capture issues or unverified companion behavior\.
- Parent follow\-up corrected desktop child ses\_e849dd42cffetacy9UFJJ0R7z0: accepted findings2/7/8 source implementation after independent 25\-test run and live\-policy/fake\-backend reproduction for Plan/architect/build\. Schema rejects unsupported tree fields, stdout/stderr retained within cap, edit gate honors pre\-existing readonly policies without new agent\-name rules or config edits\. Actual provider/client smoke and independent final review remain separate\. Deferred screenshot backend untouched\.
- Parent follow\-up PR3 integration child ses\_e8496ea44ffeV8ecLa1B5tYDSf: accepted isolated BASELINE candidate only\. Independently verified detached HEAD11cbb763328f27ae97c03b8e57f832f0fe9fb78b, merge\-base b47765e, clean candidate index/whitespace, all15 non\-overlap preservation hashes, incoming skill/asset bytes equal pinned commit, PNG1024x1024 chunk CRCs and15baseline tests\. Read full reconciled README; desktop table, setup gates/branding and maintainer paths retained\. Original source HEAD unchanged\. Candidate lacks later planning/desktop/handoff/docs changes by design; final delta reconciliation, updated skill counts/Node prerequisite, render checks and carry\-back remain pending\. No commit/push/merge/deploy or PR2 access occurred\.
- Parent follow\-up independent reviewer ses\_e848b5b26ffepSy5fbmQgzxA6U: accepted concrete UTF8 truncation finding after reproduction with describeDesktopFailure\(\{code:1,stdout:'xxx'\+'😀'\.repeat\(100000\),stderr:'ambiguity details'\}\)\. Result contains one unintended U\+FFFD within cap\. No other introduced defect reported by inspection\. Reopen only candidate\_errors for complete\-codepoint truncation and non\-ASCII tests; keep verified permission/tree changes complete\. Reviewer ran no tests; parent's reproduction is the evidence\.
- Parent follow\-up UTF8 correction child ses\_e849dd42cffetacy9UFJJ0R7z0: accepted after26tests and independent8alignment regression; no screenshot changes\. Re\-read GitHub PR3 metadata before local carry\-back: head11cbb763328f27ae97c03b8e57f832f0fe9fb78b, baseb47765e, still draft\. Original README still matches preserved hash; incoming asset/readme\-maintenance paths absent, so controlled local reconciliation can proceed without overwriting live desktop/goal\-docs work\. No remote merge/commit approval inferred\.

