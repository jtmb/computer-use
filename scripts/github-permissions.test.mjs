import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
// Reviewed against all 46 live MCP schemas on 2026-10-27, not inferred by prefix.
const readTools = [
  "actions_get", "actions_list", "get_commit", "get_file_contents", "get_job_logs",
  "get_label", "get_latest_release", "get_me", "get_release_by_tag", "get_tag",
  "get_team_members", "get_teams", "issue_read", "list_branches", "list_commits",
  "list_issue_fields", "list_issue_types", "list_issues", "list_pull_requests",
  "list_releases", "list_repository_collaborators", "list_tags", "pull_request_read",
  "search_code", "search_commits", "search_issues", "search_pull_requests",
  "search_repositories", "search_users",
]
const writeTools = [
  "actions_run_trigger", "add_comment_to_pending_review", "add_issue_comment",
  "add_reply_to_pull_request_comment", "create_branch", "create_or_update_file",
  "create_pull_request", "create_repository", "delete_file", "fork_repository",
  "issue_write", "merge_pull_request", "pull_request_review_write", "push_files",
  "sub_issue_write", "update_pull_request", "update_pull_request_branch",
]

const source = JSON.parse(await readFile(path.join(root, "global/opencode.jsonc"), "utf8"))
const rules = source.agents.build.permissions

// A pure source-policy probe of the published V2 whole-value/last-match contract.
// It does not call permission APIs, invoke a tool, deploy config, or grant approval.
function matches(pattern, value) {
  let expression = "^"
  for (const character of pattern) {
    if (character === "*") expression += ".*"
    else if (character === "?") expression += "."
    else expression += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(expression + "$", "s").test(value)
}

function effect(policy, action, resource = "*") {
  return policy.filter((rule) => matches(rule.action, action) && matches(rule.resource, resource))
    .at(-1)?.effect ?? "ask"
}

test("all 29 reviewed read tools resolve to allow", () => {
  assert.equal(readTools.length, 29)
  assert.equal(new Set([...readTools, ...writeTools]).size, 46)
  for (const tool of readTools) assert.equal(effect(rules, `github_${tool}`), "allow", tool)
})

test("all 17 mutating tools and future unknown tools still ask", () => {
  for (const tool of [...writeTools, "get_future_mutator", "list_future_mutator", "new_operation"]) {
    assert.equal(effect(rules, `github_${tool}`), "ask", tool)
  }
  assert.equal(effect(rules, "repo_commit"), "ask")
  assert.equal(effect(rules, "repo_push"), "ask")
})

test("allow exceptions are exact, unique and follow the unchanged broad ask", () => {
  const exceptions = rules.filter((rule) => rule.effect === "allow" && rule.action.startsWith("github_"))
  assert.deepEqual(exceptions.map((rule) => rule.action).sort(), readTools.map((name) => `github_${name}`).sort())
  assert.ok(exceptions.every((rule) => !/[?*]/.test(rule.action) && rule.resource === "*"))
  const gate = rules.findIndex((rule) => rule.action === "github_*" && rule.resource === "*" && rule.effect === "ask")
  assert.ok(gate >= 0)
  assert.ok(exceptions.every((rule) => rules.indexOf(rule) > gate))
  assert.deepEqual(rules.filter((rule) => !exceptions.includes(rule)), [
    { action: "*", resource: "*", effect: "allow" },
    { action: "github_*", resource: "*", effect: "ask" },
    { action: "repo_commit", resource: "*", effect: "ask" },
    { action: "repo_push", resource: "*", effect: "ask" },
  ])
})

test("ordering regressions fail closed and read exceptions do not grant other actions", () => {
  assert.equal(effect([...rules, { action: "github_*", resource: "*", effect: "ask" }], "github_get_me"), "ask")
  assert.equal(effect([{ action: "github_get_me", resource: "*", effect: "allow" }], "github_issue_write"), "ask")
  assert.equal(effect([{ action: "github_get_me", resource: "*", effect: "allow" }], "repo_push"), "ask")
})

test("source change does not enable autoaccept or weaken the MCP lockdown wrapper", async () => {
  assert.ok(!("autonomy" in source) && !("autoaccept" in source))
  assert.deepEqual(source.plugins, [
    { package: path.resolve(root, "../opencode-goal-plugin"), options: { goal_engine: "enhanced" } },
    {
      package: path.resolve(root, "tools/personality"),
      options: { defaultID: "personality-plain-english" },
    },
    "-opencode.goal",
  ])
  const wrapper = await readFile(path.join(root, "scripts/github-mcp.sh"), "utf8")
  assert.match(wrapper, /--lockdown-mode/)
})

test("one explicit continuation command authorizes routine progress without weakening source or lifecycle gates", async () => {
  const agents = await readFile(path.join(root, "AGENTS.md"), "utf8")
  const resume = await readFile(path.join(root, "global/commands/handoff_resume.md"), "utf8")
  assert.match(agents, /explicit request authorizes (?:its routine in-scope operations|routine in-scope work)/)
  assert.match(agents, /(?:Do not repeatedly ask to continue|do not re-ask unchanged scope)/)
  assert.match(resume, /Only an explicit invocation of `\/handoff_resume` requests continuation/)
  assert.match(resume, /The explicit continuation request authorizes routine in-scope reads and already\s+authorized bounded work/)
  assert.match(resume, /then continue from the verified documents in this invocation/)
  assert.match(resume, /Do not ask again merely to continue/)
  assert.match(resume, /Do not wait for nonexistent stop receipts/)
  assert.match(resume, /Preserve paused,\s+closed, completed, unmet, cancelled, `budgetLimited`, and `usageLimited`\s+statuses/)
  assert.match(resume, /never create, rebind, activate, or resume a goal/)
  assert.match(resume, /source session and\s+every relevant worker inactive/)
  assert.match(resume, /unknown worker\s+set is a conflict\/unknown/)
  assert.match(resume, /Do not\s+infer inactivity from a saved outcome or timestamp/)
})
