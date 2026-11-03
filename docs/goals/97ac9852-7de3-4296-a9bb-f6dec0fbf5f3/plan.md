# Plan — `97ac9852-7de3-4296-a9bb-f6dec0fbf5f3`

- Goal ID: `97ac9852-7de3-4296-a9bb-f6dec0fbf5f3`
- Source session ID: `ses_e7d3c547dffeCv5RIH5zPCmbN0`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-28T17:30:49.837Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `12`
- Record: `archive`

## Goal objective

> Continue the consolidated Codex\-parity computer/browser\-use work in /home/james/repos/computer\-use as a successor to closed goal 50e7f33e\-103e\-4385\-855e\-ebb56845b277, without resuming, replacing or mutating any old goal\. Preserve all 68 requirements and findings F01\-F07 in docs/request\-coverage\.md and the existing uncommitted, undeployed source changes\. Close the remaining unblocked gaps: characterize the F02 archive plan\.md ownership\-hash mismatch and propose a reversible recovery contract; prepare F04 substantive authority\-policy replacement options for the user's decision; measure observed model token/turn/latency/recovery efficiency including Code Mode versus direct tools from real runtime counters; and inventory the exact prerequisite that unblocks each separately gated item\. Keep deployment, extension activation, restart/logout, real\-seat input, human private entry, coordination activation, security/permission changes, commit, push, publication and demo/window/PR work behind their separate explicit approvals\. Parent verifies every child result independently; unrelated dirty work and the staged rename are preserved\.

## Persisted plan

Plan revision: `12` · updated 2026-10-28T14:27:34.000Z

> Parent\-only coordination of five disjoint background workstreams against the verified live baseline: F02 archive forensics, F04 authority\-policy options, observed model\-efficiency measurement, gate inventory, and preservation/source verification\. All gated consequential actions remain untouched; parent independently verifies every child result\.

### Completion criteria

- All 68 requirements and F01\-F07 in docs/request\-coverage\.md remain present and structurally intact, with an independently checked coverage audit result\.
- The F02 archive plan\.md mismatch is characterized with reproducible evidence, and a reversible recovery contract plus disambiguating evidence requirements are documented without rewriting any generated archive bytes or rehashing the manifest\.
- F04 substantive authority\-policy replacement is presented as reviewable options grounded in current exact wording, with nothing applied to AGENTS\.md or any skill\.
- Model efficiency is reported from observed runtime counters \(tokens, turns/steps, tool calls, latency, recovery\), including a Code Mode versus direct\-tools comparison, with explicit attribution limits and no modeled or inferred numbers\.
- Every separately gated item has an explicit statement of the exact approval or human action that unblocks it, and none of those gates is crossed\.
- Existing uncommitted and undeployed source changes, the staged resume\.md to handoff\_resume\.md rename, and unrelated dirty paths are preserved unchanged\.
- No commit, push, publication, deployment, extension activation, restart/logout, live input send, human private entry, coordination activation, or security/permission change occurs\.

### Phase `p0` — completed

> Reconcile exact worktree, live goal status, archive mismatch and worker ownership read\-only before any overlapping edit\.

**Verification:**

> Exact mainworktree/HEAD/remote and ownership/hash findings verified; missing source\-goalstatus now resolved by source's actual native get\_goal result independently retrieved via exact source\-session/message API\. Full sourceworker traversal and currentactive/shell/PTY checks reconciled before final documentation edits\. Historical predecessor status not promoted to fresh unqueried proof\.

- **`p0-worktree` · completed:**
  > Verify repository, worktree, branch, HEAD and remote for the selected source\.
  - Evidence:
    > realpath \-e resolved /home/james/repos/computer\-use \(no symlink escape\); rev\-parse toplevel is the same path; branch main; HEAD c71b8cc57004a65ed4198cf0e5ae8f256e56f532; origin https://github\.com/jtmb/computer\-use\.git; worktree list shows main plus a separate detached computer\-use\-pr\-integration worktree that this goal does not touch\.
- **`p0-goal-status` · completed:**
  > Establish authoritative current goal status without resuming or replacing any goal\.
  - Evidence:
    > Read\-only exact source session/message lookup independently parsed actual completed native get\_goal result in msg\_182dbea42001vMzadqXFdhZcn7 \(view summary, metadata truncated:false\):50e7f33e\-103e\-4385\-855e\-ebb56845b277 unmet planRevision14\. This was invoked in source session ses\_goal\_docs\_e51bdf9cf361797e5ad2593e5b530dc9, whose API identity/exact directory were independently checked\. Parent's own97acgoal not substituted\. Source normalresponse reports predecessor cancelled/archived historically, not separately freshqueried; no provenance/selective\-recovery/export/repair\. Oldgoals not resumed/replaced\.
- **`p0-ownership` · completed:**
  > Verify the source session and every relevant worker are inactive with complete coverage\.
  - Evidence:
    > Fresh result\-boundary scoped BFS reverified source\+two named relevant roots and descendant32records across34pages, alltraversals terminated\. Unpaginated active map contains none of32or5ownedchildren;0PTYs\. Shell listing's single running row was independently identified as this parent's exact diagnostic command with native metadata\.sessionID=ses\_e7d3c547dffeCv5RIH5zPCmbN0, not a sourceworker\. Source's guidance execution ended; oldsource/nativearchive ownership untouched\. Point\-in\-time snapshot only\.
- **`p0-archive` · completed:**
  > Verify generated goal\-export integrity against the manifest without rewriting anything\.
  - Evidence:
    > sha256sum versus docs/goals/\.goal\-docs\-manifest\.json: HANDOFF\.md c61c4e51, work\-history\.md 7fef4c84 and snapshot\.json c0f1d41b all match; plan\.md records 96ef0de6 but the file hashes ee9de7a6\. snapshot\.json generatedFiles agrees with the manifest, so only the plan\.md bytes disagree\. Provenance remains unknown; nothing was rewritten, rehashed or deleted\.

### Phase `p1` — completed

> Characterize the F02 archive plan\.md mismatch and propose a reversible recovery contract, without touching generated bytes\.

**Verification:**

> Canonical renderer/hash reproduction and writer/lock source inspection independently verify timestamp\-only mismatch and README false\-positive correction\. The report characterizes evidence and proposes recovery without claiming provenance or performing repair; exact source\-goal lookup and supported recovery remain blockers to actual repair, not omissions from the characterization\.

- **`p1-forensics` · completed:**
  > Determine, per goal bundle, exactly which generated files fail their recorded hash, whether each plan\.md difference is header\-timestamp\-only or substantive, and what evidence would separate manual edit from interrupted publication\.
  - Evidence:
    > Parent read corrected archive\-integrity\-finding\.md and canonical writer\.ts303\-327,594\-773 plus process\-lock\.ts\. Independently reproduced53ownershipentries/52match/1mismatch using README managedblock; renderedplan96ef0de6 matches snapshot/manifest; only exported\-time substitution makes actualplan byte\-identical\. Atomic perfile rename plus perfile manifest persist permits interruptedpublication but no author provenance established\. Report retains unknown cause, ordered supported\-source/recovery/precondition/preserve/apply/verify/rollback contract; no archive write, manifest rehash or lock deletion\.

### Phase `p2` — completed

> Present reviewable F04 substantive authority\-policy replacement options grounded in the current exact wording\.

**Verification:**

> Parent exact\-quote/config verification confirms reviewable draft options grounded in current wording\. No AGENTS, skill or permission configuration was changed\. Substantive replacement remains the user's unmade decision; options are not authority\.

- **`p2-policy-options` · completed:**
  > Map every current commit, push, deployment and authority gate statement, identify where replacement is genuinely unspecified, and draft candidate wordings as a preview only\.
  - Evidence:
    > Parent reviewed all444lines of authority\-policy\-options\.md, matched12repository blockquotes exactly, inspected source config Ask/deny blocks and33line projectconfig\. Three alternatives remain clearly unapplied;12reusable/4ambiguous/5decision categories documented\. This completes the policy preview, not F04 replacement selection or runtime policy changes\.

### Phase `p3` — blocked

> Measure real model efficiency from observed runtime counters instead of entry\-level proxies\.

**Blocker:**

> Collector source implementation and bounded metadata\-only runtime check are independently verified; actual matched model comparison/latency/recovery remains unmeasured and cannot be inferred from counters or source tests\.

- **`p3-efficiency` · blocked:**
  > Build a read\-only observed\-usage collector over the supported session API and report tokens, turns/steps, tool calls, latency and recovery cost with an explicit Code Mode versus direct\-tools comparison and stated attribution limits\.
  - Evidence:
    > Collector/source guide verified53tests\+5adjacent exposuretests, bothsyntaxpasses and1exact\-ID/scopedmetadata\-only liveGET with no transcripts/global scan\. Parent updated only docs/features\.md and test\-quality\-audit\.md to reflect counters, strict scope, explicit pagination bounds and missing matchedcomparison\. Controlled scratch control53pass; onlyidentityguard disabled yields44pass/9fail, productionunchanged\. Post\-doc23features/architecture/coveragechecks pass;10owned added/untracked files explicitwhitespace clean\. Actualmatched CodeMode/directtools/model recovery/latency still absent\.
  - Blocker:
    > No approved concrete same\-task/model/variant browser fixture protocol with separately verified runtime Code Mode vs direct\-tools exposure, nor an existing pair of authorized session IDs with that provenance and recovery deltas, is available\. Achieving the immutable model\-comparison criterion requires that external input/authority; source fixtures, aggregate counters and one coding session cannot substitute\. No profile/exposure change, browser action or new model benchmark was inferred\.

### Phase `p4` — completed

> State the exact unblocking prerequisite for every separately gated item\.

**Verification:**

> All18retained blocked items have concrete next prerequisites, actors, admissible evidence and limits, with dated/source distinction\. Current source package test/typecheck commands independently checked\. Review corrected all identified policy/delivery/count/capability overclaims; inventory accepted as preparation, not live acceptance\.

- **`p4-gates` · completed:**
  > For each blocked task in the retained plan, name the precise operator approval or human action required, plus the destination\-rule and preflight blockers for coordination activation\.
  - Evidence:
    > Corrected63line open\-gates\.md reread independently\. Parser confirms18unique expected identifiers with no missing/duplicates\. Intent\-specific callback flags match source skill; F04 choice remains unspecified; supported automationUI/OFF separated from absent guaranteed precompactionhook; historical compiler/access observations labeled\. Counts15operator/1human/2whole\-item capability categories preserved\. No proposals exercised\.

### Phase `p5` — completed

> Verify preservation and source health after the parallel work lands\.

**Verification:**

> Independent source/collector/syntax/health/coverage and staged/index checks verified\. Bytebaseline confirms no changes outside reserved output paths and newly observed native exporter artifacts since capture\. New97ac9852bundle header binds this exact current session, main worktree and activeplanrev9 exported2026\-10\-28T14:15:01\.448Z; it is not substituted for oldsource state\. Known483f mismatch remains; no human/live acceptance is inferred\.

- **`p5-preservation` · completed:**
  > Re\-run the repository coverage audit and relevant source suites, and confirm 68 requirements plus F01\-F07, the staged rename and unrelated dirty paths are unchanged\.
  - Evidence:
    > Parent previously reran89source tests\(allpass\), then58collector/exposure tests\(allpass\), both syntaxchecks and healthcheck\(exit0\)\. Final coverageCLI68requirements/7findings/0coverageerrors;14bundles with ONLYknown483fplan mismatch\(exit1\), freshness explicitly unverified\. Both gitdiffchecks clean; stagedrename remains100%\. Parent SHA256/mode baseline627paths\(626files\+1preexistingmissing\) vs632now: no deletions, indexhash identical3300841671; changed paths only5assigned outputs plus native goalmanifest/index;5additions archive\-report\+4currentgoal exports\. Baseline is mid\-session; earlier132\-vs124/pathcount uncertainty remains historical, not erased\.

### Decisions

- Live goal state is authoritative over the stale docs/goals/README\.md row and the 483f rev5 export; the predecessor archive is retained as history and is not refreshed, repaired or reopened\.
- Delegation is explicitly authorized by the user, and docs/memory/coordination\-workflow\.md sets GPT\-6 Luna xhigh as the implementation default, up to 10 disjoint workers, with Sol high for judgment\-heavy analysis; confirmed via the models tool that openai/gpt\-6\-luna\#xhigh and openai/gpt\-6\.1\-sol\#high exist\.
- Five disjoint workstreams are launched, each with a single new or exclusively owned output path, so no child can modify the 124 pre\-existing dirty paths or the staged rename\.
- All consequential gates stay closed: no commit, push, publication, deployment, activation, restart, logout, live input, human sign\-in, coordination activation or security change\.
- Admitted five background children: archive forensics ses\_e7d341d1fffejFLR4OqjTmx3pb \(Sol high\), efficiency ses\_e7d341cfaffePD0UnAuRIsOyFK \(Sol high\), policy options ses\_e7d341cd5ffefCVUoHG7xZaNDL \(Luna xhigh\), gate inventory ses\_e7d341c7dffeopIs3RAXEWbS24 \(Luna xhigh\), preservation ses\_e7d341ca2ffeJyGRWaDO7IXdHw \(Luna xhigh\)\. Each owns exactly one new output path\. The goal plan cursor stays single by native constraint, so it advances p1 to p5 in order while the five children execute concurrently; each phase closes only after independent parent verification of that child's evidence\.
- User explicitly requests implementation to continue and asks to remember DeepSeek availability\. Parent updated and read back docs/memory/coordination\-workflow\.md, adding deepseek/deepseek\-flash and deepseek/deepseek\-v4\-pro with runtime\-verified none/low/high/max variants; Luna xhigh remains the default, with no invented DeepSeek effort preference\. Target resolves inside the selected worktree; git diff \-\-check passes\. No memory tool is exposed, so the explicitly authorized repository file workflow was used\.
- Ownership registry correction: the actual archive\-forensics launch used openai/gpt\-6\-luna\#xhigh \(ses\_e7d341d1fffejFLR4OqjTmx3pb\), not Sol high as mistakenly stated in the prior registry/chat\. Efficiency used Sol high; policy, gates and preservation used Luna xhigh\. Efficiency owns three explicitly named existing files, not one new path\. No reassignment or duplicate child is authorized by this correction\.
- Do not turn preparatory evidence into acceptance: existing counters do not establish a matched Code Mode/direct\-tools comparison, and the new goal does not close inherited blocked requirements\. The 68 requirements/F01\-F07 and all separate deployment/activation/security/commit/push/publication gates remain retained\. The 12 auto\-turn cap was agent\-supplied rather than user\-requested; do not add further limits or edit raw goal state to correct it\.
- Preservation child ses\_e7d341ca2ffeJyGRWaDO7IXdHw returned terminal report, independently reviewed by parent\. Child owns only docs/codex\-parity/preservation\-check\.md; scope released after return, but p5 is not marked complete because aggregate status counts cannot establish byte preservation or attribute concurrent additions\. Worker skipped health check; parent has not represented source suites as full health/runtime verification\.
- Gate inventory child ses\_e7d341c7dffeopIs3RAXEWbS24 is running a bounded correction on docs/codex\-parity/open\-gates\.md, launched as openai/gpt\-6\-luna\#xhigh\. No overlapping parent edits; receipt is not accepted completion\. Preserve historical preflight failures as dated evidence, not new current observations\.
- Archive child ses\_e7d341d1fffejFLR4OqjTmx3pb resumed bounded correction on its sole report path, Luna xhigh; parent does not edit that path meanwhile\. Policy child ses\_e7d341cd5ffefCVUoHG7xZaNDL returned report, independent parent review complete, report\-only scope released\. Do not require or select an option merely to continue independent implementation; unspecified substantive policy remains blocked\.
- Gate child ses\_e7d341c7dffeopIs3RAXEWbS24 correction completed and parent acceptance recorded; sole file docs/codex\-parity/open\-gates\.md ownership released\. Parallel task remains under serial cursor until p1\-p3 verification; document proposals never grant the consequential authority they describe\.
- Archive child correction independently accepted; sole report ownership released\. Collector child ses\_e7d341cfaffePD0UnAuRIsOyFK retains3file ownership while correcting scope/pagination bounds\. Oldsourcegoal state remains read\-only and unresolved through supported tools\. Currentgoal97ac9852 remains active and tracks this bounded independent work; no oldgoal is resumed or replaced\.
- Parent independently ran \./scripts/health\-check\.sh after reading its140line read\-only source: exit0 HealthcheckPASSED, OpenCode2\.1\.1, service responsive, required location\-scoped plugins active, GitHub/Playwright connected,29skills, computer\-use/plugin and goal\-docs companion source tests pass\. It proves bounded runtime inventory/source health, NOT deployment/real\-seat input/modelcomparison/humanentry/UI outcomes\. Final byte\-preservation review waits for collector's terminal correction\.
- Fulfilled user's earlier explicit request to ask exact source session for guidance via documented native prompt API\. Stable msg\_guidance\_97ac9852\_20261028 admitted to ses\_goal\_docs\_e51bdf9cf361797e5ad2593e5b530dc9 with delivery steer/resume true; text restricts reply to read\-only supported own\-goal status/provenance guidance, forbids edits/workers/oldgoal lifecycle changes\. One post\-admission snapshot: input no longer pending and source running; no ACK/completion inferred\. Source is now active for that bounded reply, so no new overlapping source edits until inactive; pending collector has exclusive3file ownership and parent does not touch them\. No duplicate request or polling\.
- Collector child ses\_e7d341cfaffePD0UnAuRIsOyFK correction independently accepted;3file ownership released\. All5child implementations/reports are terminal and reviewed\. Actual matched comparison and exact source\-goal tool status remain blockers; no concurrent successor queue/new model benchmark launched\.
- Parent owns final scoped source\-documentation reconciliation in docs/features\.md and docs/test\-quality\-audit\.md under existing p3 deliverable: inventory currently falsely says actual token/turn counters remain absent, while corrected collector and scoped metadata\-only run are verified\. Update only that capability boundary and record53\+5/89tests, health, positive\+negative coverage and no matched comparison\. No generated archives, request\-coverage rows, AGENTS/skills/config or deployed files edited\. p3 matched\-comparison blocker remains intact\.
- Final criterion audit C1: docs/request\-coverage\.md unchanged; read\-only CLI independently68requirements\+7findings/0coverageerrors, exit1 only483fplan mismatch,14bundles\. C2: archive\-integrity\-finding\.md plus canonical renderer/writer proof verifies timestamp\-only1/53historical ownership mismatch and reversible proposal, no repair\. C3: authority\-policy\-options\.md3unapplied previews/sourcequotes verified; no rule selected\. C4: collector implementation/53\+5tests/liveexactmetadata evidence verified, but matchedexposure/actuallatency/recovery remains unachieved andblocked\. No criterion demoted\.
- Final criterion audit C5: open\-gates\.md18unique exact IDs and intent\-specific prerequisites independently checked\. C6: final627\-&gt;632path SHA256/mode comparison shows only explicitly reserved10source/docpaths and native currentgoalexport artifacts changed/added;0deletions/0unexpectedchanges; stageentries hash unchanged3300841671 and100%resume\-&gt;handoff\_resume rename; HEADc71b8cc\. Baseline is mid\-session, not retroactive proof of earlier unknown path increase\. C7: no commit/push/publication/deployment/extensionactivation/restart/logout/liveinput/humanentry/coordinationactivation/securitychange performed; sole native send was user's exact requested read\-only sourceguidance\.
- Final meaningful progress exhausted within approved scope: all5children terminal/reviewed; parent source docs and cadence audit completed;89contract\+58collector/exposure focusedtests pass,23postdoc rechecks pass \(overlapping, not summed into inflated total\), healthpass, syntaxandwhitespacepass\. Source\-nativeget\_goal verification closes p0 and confirms oldgoalunmet14 without lifecycle mutation\. No safe additional routine source action can produce the missing controlled model comparison without a scoped exposure/protocol decision; preserve all68/F01\-F07 and downstream gates rather than loop or fabricate acceptance\.

