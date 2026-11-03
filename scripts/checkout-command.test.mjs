import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const command = await readFile(new URL("../global/commands/checkout.md", import.meta.url), "utf8")

// These check the prompt's safety contract, not a model following it or a live
// worktree operation. Remove a clause and the corresponding assertion must fail.
function audit(text) {
  const problems = []
  const requires = (fragment, label) => { if (!text.includes(fragment)) problems.push(label) }
  requires("subagent: false", "current-session execution")
  requires("Respect the active\nPlan/read-only mode", "mode boundary")
  requires("untrusted checkout-name data", "untrusted arguments")
  requires("Reject flags, whitespace, dots, slashes", "name boundary")
  requires("staged binary diff and index entries", "index preservation")
  requires("Project.Commands.start", "startup metadata")
  requires("`worktree.create` loads the canonical", "native create side effects")
  requires("A plugin list alone does not prove which strategy is selected.", "strategy evidence boundary")
  requires("Before status/diff collection", "baseline execution guard")
  requires("diff.autoRefreshIndex=false", "porcelain diff index-write suppression")
  requires("Separately review Git execution effects in the native service environment", "native Git execution review")
  requires("guard does not attest the native service environment", "local versus native evidence")
  requires("`$GIT_DIR/info/attributes`", "repository-private attributes")
  requires("default global/system attribute files", "default attributes")
  requires("index attributes at the captured commit", "checkout attribute epoch")
  requires("scripts/checkout-preflight.mjs", "read-only preflight")
  requires("sanitized runtime-audit JSON", "runtime audit data boundary")
  requires("bundled Git strategy", "strategy boundary")
  requires("approved repository-save root", "save-location boundary")
  requires("`directory` (the approved parent, not the final leaf)", "API directory semantics")
  requires("`branch` (the captured commit SHA)", "commit pin")
  requires("If admission or completion is uncertain", "uncertain admission")
  requires("Re-read the original source", "preservation readback")
  requires("Do not\n   call `session_move`", "no session relocation")
  requires("Cleanup/removal is a separate request", "no destructive cleanup")
  if (text.includes("!`")) problems.push("shell expansion")
  return problems
}

test("checkout is a current-session Markdown prompt with no model/agent switch or pre-permission shell expansion", () => {
  const lines = command.split("\n")
  assert.equal(lines[0], "---")
  const end = lines.indexOf("---", 1)
  assert.ok(end > 1)
  const fields = lines.slice(1, end).map(line => line.split(":", 1)[0]).sort()
  assert.deepEqual(fields, ["description", "subagent"])
  assert.deepEqual(audit(command), [])
  assert.equal(command.split("$ARGUMENTS").length - 1, 1)
})

test("each distinct unsafe contract mutation is detected independently", () => {
  for (const [fragment, diagnostic] of [
    ["Project.Commands.start", "startup metadata"],
    ["`worktree.create` loads the canonical", "native create side effects"],
    ["scripts/checkout-preflight.mjs", "read-only preflight"],
    ["approved repository-save root", "save-location boundary"],
    ["staged binary diff and index entries", "index preservation"],
    ["`branch` (the captured commit SHA)", "commit pin"],
    ["If admission or completion is uncertain", "uncertain admission"],
    ["Cleanup/removal is a separate request", "no destructive cleanup"],
    ["Before status/diff collection", "baseline execution guard"],
    ["diff.autoRefreshIndex=false", "porcelain diff index-write suppression"],
    ["Separately review Git execution effects in the native service environment", "native Git execution review"],
    ["guard does not attest the native service environment", "local versus native evidence"],
    ["`$GIT_DIR/info/attributes`", "repository-private attributes"],
    ["default global/system attribute files", "default attributes"],
    ["index attributes at the captured commit", "checkout attribute epoch"],
  ]) assert.ok(audit(command.replace(fragment, "REMOVED")).includes(diagnostic), diagnostic)
  assert.ok(audit(command + "\n!`unsafe-command $ARGUMENTS`\n").includes("shell expansion"))
})

test("command names are checkout labels, not branch switches or implicit moves", () => {
  assert.ok(command.includes("the name is\n   not a branch name"))
  assert.ok(command.includes("creates a detached worktree"))
  assert.ok(command.includes("Leave this session in its current directory"))
  assert.ok(command.includes("do not stash, stage, copy, commit, reset, clean, switch or overwrite"))
  assert.ok(command.includes("Do not claim dirty files were copied"))
})

test("native inspection stays read-only and creation remains an explicit later step", () => {
  assert.ok(command.includes("`worktree.list` API is only saved inventory"))
  assert.ok(command.includes("it does not load configuration or"))
  assert.ok(command.includes("never calls the native worktree API"))
  assert.ok(command.includes("Invoke creation once"))
  assert.ok(command.includes("A plugin list alone does not prove which strategy is selected."))
})
