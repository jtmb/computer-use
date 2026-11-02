#!/usr/bin/env node
/**
 * Emits a dated preservation and verification receipt for the current checkout.
 *
 * The receipt records identities only: commit, frozen pins, staged/dirty state and
 * the last observed check results passed in by the caller. It deliberately does not
 * run tests or inspect running services, so a green receipt never implies runtime,
 * model or human acceptance.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function buildReceipt({ root, nativeRoot, voiceRoot, checks, date }) {
  const git = (args, cwd = root) =>
    execFileSync("git", ["--no-optional-locks", ...args], { cwd }).toString().trim()
  const staged = execFileSync("git", ["--no-optional-locks", "diff", "--cached", "--binary"], {
    cwd: root,
    maxBuffer: 8 * 1024 * 1024,
  })
  return {
    schemaVersion: 1,
    evidenceDate: date,
    purpose: "Dated preservation and verification receipt. Identities only; not runtime or human acceptance.",
    repository: {
      root,
      head: git(["rev-parse", "HEAD"]),
      headSubject: git(["log", "-1", "--pretty=%s"]),
      // A checkout without an upstream reports null rather than failing the receipt.
      unpushed: (() => {
        try {
          return git(["rev-list", "--count", "origin/main..HEAD"])
        } catch {
          return null
        }
      })(),
      dirtyEntries: git(["status", "--porcelain=v1"]).split("\n").filter(Boolean).length,
      stagedDiffBytes: staged.length,
      stagedDiffSha256: createHash("sha256").update(staged).digest("hex"),
    },
    frozenNative: { root: nativeRoot, head: git(["rev-parse", "HEAD"], nativeRoot) },
    voiceRepository: voiceRoot ? { root: voiceRoot, head: git(["rev-parse", "HEAD"], voiceRoot) } : null,
    checks,
    limits: [
      "A green offline matrix is not runtime, model, GUI/audio or human acceptance.",
      "The receipt records the tree at generation time; later commits invalidate its head.",
    ],
  }
}

function main() {
  const root = process.env.RECEIPT_ROOT ?? process.cwd()
  const nativeRoot = process.env.RECEIPT_NATIVE_ROOT ?? "/home/james/repos/opencode-native-row"
  const voiceRoot = process.env.RECEIPT_VOICE_ROOT ?? path.join(root, "voice-assistant")
  const output = process.env.RECEIPT_OUTPUT ?? path.join(root, "docs", "final-verification.json")
  const checks = {
    health: process.env.RECEIPT_HEALTH ?? "not supplied",
    offlineCI: process.env.RECEIPT_CI ?? "not supplied",
  }
  const receipt = buildReceipt({
    root,
    nativeRoot,
    voiceRoot,
    checks,
    date: process.env.RECEIPT_DATE ?? new Date().toISOString().slice(0, 10),
  })
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + "\n")
  writeFileSync(output, bytes)
  process.stdout.write(`${output} ${bytes.length} bytes\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
