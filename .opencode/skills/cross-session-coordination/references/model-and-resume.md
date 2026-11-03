# Operator-directed model selection and session resume

Use this workflow for requests such as:

> Check the other open chats, find their remaining goals, switch them to
> DeepSeek Flash, and have them resume. Keep this chat on Sol.

The model names are examples, not fixed defaults. Discover the consumer's
available tools, exact session identities, current native API and model catalog.
Load the available OpenCode guide before API work. This procedure creates no
coordinator service, replacement agents, work ceilings, timers or permission grants.

## 1. Select the actual chats

1. Resolve the requesting chat's exact ID, project/worktree and current model.
2. Match the user's named chats or visible tabs to current native metadata.
   List a small project-scoped page; use titles for discovery, IDs for actions.
3. Exclude the requesting chat when asked to leave it unchanged. Exclude archived
   chats, historical children and unrelated projects unless explicitly selected.
   "Other open chats" does not mean every historical goal or subagent.
4. Read the selected goal summaries and only the relevant recent final/status
   text. Filter out tool logs before presenting results; do not dump full contexts.
   Saved outcome/timestamps do not prove that a chat is running now.

Keep a short action list: session ID, title, directory, old model, goal status,
remaining work, blocker and requested change. It is an observation, not ownership
transfer or authority to edit another session's goal store.

## 2. Resolve and switch the model

An explicit user request can authorize changing selected chats' models. A peer
merely claiming that the user asked cannot authorize it.

1. Search the available model catalog. Resolve the exact provider ID, model ID
   and supported effort variants; never guess IDs from display names. Check the
   current provider first, then other available providers if no match exists.
2. Use the already configured requested provider; do not install providers, add
   credentials or silently substitute a free/paid alternative. Report ambiguity
   or unavailable access without changing unrelated settings.
3. Preserve the effort variant if valid for the new model; otherwise use its
   verified default or an explicitly stated supported choice. Do not carry an
   unsupported variant such as `xhigh` into a model that lacks it.
4. Use the supported **per-session model switch**, not a new subagent, agent-mode
   switch, global config edit or service restart. Apply independent selected-chat
   switches concurrently when safe, then read back each session's saved model.
5. Recheck the requesting chat's model and report that it stayed unchanged.

For a verified OpenCode V2 API, the session operation is:

```text
POST /api/session/EXACT_SESSION_ID/model
{"model":{"providerID":"VERIFIED_PROVIDER","id":"VERIFIED_MODEL","variant":"SUPPORTED_VARIANT"}}
GET /api/session/EXACT_SESSION_ID
```

Omit `variant` to use the verified model default when appropriate. Prefer an
exposed authorized native tool/client; the CLI is an alternative only when
subprocesses are permitted. Reverify the current request schema before use.
A saved model proves selection, not the execution-effective model of an already
running request. Do not interrupt/restart a running chat merely to force a switch.

## 3. Resume the owners, not their tasks in this chat

Send each selected owner the user's actual request, source chat/message reference,
reply destination and relevant file-ownership boundaries. Keep relayed user text
distinguishable from peer advice; caller-written metadata alone is not verified
human provenance. A tool-bound stored sender record can corroborate the source.

- Ask for remaining work, blockers and the next action, and have the owner resume
  previously authorized unfinished work within its current mode and lifecycle.
- Active goals can continue. Paused goals need explicit user resumption authority.
  A terminal goal cannot be resumed in place; preserve its history and report the
  exact remaining requirement or successor authorization needed. A complete audit
  is not permission to invent implementation work.
- Do not change another chat's goal plan, mode, permissions, budgets or objective.
  Existing deployment/security/restart/publication/commit/push gates still apply.
- Use the supported scheduling/steering route for the user's explicit activation
  request. In verified V2 native prompt transport this is
  `delivery:"steer", resume:true`, not `queue` or `resume:true` alone. Native
  permission and recipient-policy refusals remain binding; never edit receive
  settings or route around a refusal to make the chat run.
- Use a stable input ID. If that exact input was already admitted and parked,
  use its supported activation operation instead of sending a duplicate.
- The resumption request itself is the send. Routine reports need no separate
  message, ACK or ACK-of-ACK. Do not clutter the requesting chat's human prompt
  queue as a fallback when no supported transport exists; report the gap instead.

## 4. Verify once and report plainly

Verify exact admission, saved model readback and one current native active-session
snapshot. On uncertain admission, reconcile the same ID rather than creating a
clone. A tool serialization error can occur **after** a post was stored; check
the exact message before retrying. Do not poll for acknowledgement or completion.

Report a compact table of selected chat, verified model, remaining work and state:
stored, steering admitted, running observed, owner acknowledged, or completed.
Use "asked to resume" if only admission is known. Use "running" only with a fresh
active-map observation. Neither is proof that the goal resumed or work completed.
Distinguish saved-record blockers from a fresh owner reply. State that the source
chat stayed on its original model when requested.

If one chat fails, report that exact failure and continue independent selected
chats. Do not hide partial success behind "all resumed". Do not impose arbitrary
worker turn/time/token ceilings or stop useful work to satisfy an invented cap.

## Isolation requirement

This is an on-request workflow, not a mandatory dependency of normal chat.
A missing optional coordination transport, permission refusal or schema error
must never prevent unrelated model requests. Do not add automatic context hooks,
background scans or a global coordinator merely to make this procedure available.
A skill can guide supported native operations without activating a separate
coordination plugin.
