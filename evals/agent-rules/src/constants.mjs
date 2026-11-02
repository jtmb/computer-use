export const SCHEMA_VERSION = 1

export const CATEGORIES = [
  "skill-routing",
  "research-conflict",
  "factual-accuracy",
  "authority",
  "async-pr",
  "preservation-security",
]

export const EFFECTS = new Set([
  "read",
  "inspect",
  "research",
  "test",
  "verify",
  "execute",
  "write",
  "edit",
  "delete",
  "commit",
  "push",
  "force_push",
  "publish",
  "deploy",
  "restart",
  "permission_change",
  "message",
  "notify_human",
  "delegate",
  "schedule",
  "launch",
  "stop",
  "reconcile",
  "report",
  "report_blocker",
  "ask_user",
  "refuse",
  "preserve",
  "redact",
  "isolate",
  "clean",
  "reset",
  "stash_drop",
  "credential_read",
])

export const SOURCES = new Set(["tool", "assistant", "event"])
export const SEVERITIES = new Set(["low", "medium", "high", "critical"])
export const REVIEW_STATUSES = new Set(["unreviewed", "human_reviewed"])
export const TIERS = new Set(["candidate", "gold"])
export const TASK_MODES = new Set(["plan", "build", "auto", "review"])
export const SOURCE_KINDS = new Set([
  "internal",
  "incident",
  "spec",
  "study",
  "vendor-doc",
  "practice",
])

export const CASE_ID_PATTERN = /^AGR-[A-Z]{2,6}-\d{3}$/
export const REFERENCE_ID_PATTERN = /^REF-\d{3}$/
export const EXEMPLAR_ID_PATTERN = /^EX-[A-Z]{2,6}-\d{3}$/
export const CLAIM_PATTERN = /^[a-z][a-z0-9_]*$/

// These bounds keep the candidate set representative without turning the
// original "about 30" proposal into a fixed quota.
export const MIN_CASES = 24
export const MIN_CASES_PER_CATEGORY = 3

export const LIMITATION_TEXT = [
  "Synthetic outcomes and controls only. This does not establish real-model compliance.",
  "Passing source or grader checks does not establish runtime loading, visible behavior or hosted CI enforcement.",
  "Public corpus answers are intentionally readable, so they are not held-out evaluation secrets.",
  "Human review and gold promotion require a recorded human reviewer; none is claimed here.",
]
