import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises"
import { Refused, allocateWorkspace, assertAbsent, runBounded, writeExclusive } from "./runner"

const bun = process.env.OPENCODE_BUN ?? "/home/james/repos/computer-use/tools/opencode-orchestration/runtime/bun-1.4.2-linux-x64/bun"
const OUTPUT_LIMIT = 256 * 1024

const scratch = async () => {
  const root = await allocateWorkspace()
  const env = { PATH: "/usr/bin:/bin", HOME: join(root, "home"), TMPDIR: join(root, "tmp") }
  await mkdir(env.HOME)
  await mkdir(env.TMPDIR)
  return { root, env }
}

describe("bounded runner", () => {
  test("allocates distinct fresh workspaces under the approved scratch root", async () => {
    const first = await allocateWorkspace()
    const second = await allocateWorkspace()
    expect(first).not.toBe(second)
    expect(first.startsWith("/tmp/opencode/title-cas-")).toBe(true)
    expect(second.startsWith("/tmp/opencode/title-cas-")).toBe(true)
  })

  test("refuses a symlinked or missing scratch root", async () => {
    const { root } = await scratch()
    const link = join(root, "linked-root")
    await symlink("/tmp/opencode", link)
    await expect(allocateWorkspace(link)).rejects.toThrow(Refused)
    await expect(allocateWorkspace(join(root, "missing"))).rejects.toThrow(Refused)
  })

  test("refuses an existing output path and keeps the sentinel", async () => {
    const { root } = await scratch()
    const sentinel = join(root, "sentinel.txt")
    await writeFile(sentinel, "keep me")
    await expect(assertAbsent(sentinel)).rejects.toThrow(Refused)
    expect(() => writeExclusive(sentinel, "clobber")).toThrow()
    expect(await readFile(sentinel, "utf8")).toBe("keep me")
  })

  test("refuses to write an exclusive log through a symlink", async () => {
    const { root } = await scratch()
    const target = join(root, "target.txt")
    await writeFile(target, "original")
    const link = join(root, "log-link")
    await symlink(target, link)
    expect(() => writeExclusive(link, "clobber")).toThrow()
    expect(await readFile(target, "utf8")).toBe("original")
  })

  test("stops acquisition at the output limit instead of writing without bound", async () => {
    const { root, env } = await scratch()
    const run = await runBounded({
      file: bun,
      args: ["-e", 'process.stdout.write("x".repeat(400000))'],
      cwd: root,
      env,
      deadlineMs: 10_000,
    })
    expect(run.kind).toBe("output-limit")
    expect(run.bytes).toBe(OUTPUT_LIMIT)
    expect(run.output.length).toBe(OUTPUT_LIMIT)
    expect(run.exitCode).not.toBeNull()
  })

  test("stops its own child at the deadline", async () => {
    const { root, env } = await scratch()
    const started = Date.now()
    const run = await runBounded({
      file: bun,
      args: ["-e", "setTimeout(() => {}, 5000)"],
      cwd: root,
      env,
      deadlineMs: 400,
    })
    expect(run.kind).toBe("timeout")
    expect(run.exitCode).not.toBeNull()
    expect(Date.now() - started).toBeGreaterThanOrEqual(250)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  test("bounds capture even when an exited root leaves a descendant holding pipes", async () => {
    const { root, env } = await scratch()
    const marker = join(root, "descendant.ready")
    const descendant = `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ready');setTimeout(()=>process.exit(0),3000)`
    const source = `const fs=require('node:fs');Bun.spawn([process.execPath,'-e',${JSON.stringify(descendant)}],{stdin:'ignore',stdout:'inherit',stderr:'inherit'});const until=Date.now()+600;while(!fs.existsSync(${JSON.stringify(marker)})&&Date.now()<until)await Bun.sleep(5);process.exit(0)`
    const started = Date.now()
    const run = await runBounded({ file: bun, args: ["-e", source], cwd: root, env, deadlineMs: 1500 })
    expect(await readFile(marker, "utf8")).toBe("ready")
    expect(Date.now() - started).toBeLessThan(2300)
    expect(run.kind).toBe("timeout")
    expect(run.rootExitObserved).toBe(true)
  })

  test("invalid UTF-8 cannot expand an exclusive log beyond the captured byte cap", async () => {
    const { root, env } = await scratch()
    const run = await runBounded({ file: bun, args: ["-e", "process.stdout.write(Buffer.alloc(400000,255))"],
      cwd: root, env, deadlineMs: 10000 })
    const log = join(root, "binary.log")
    writeExclusive(log, run.output)
    expect((await readFile(log)).byteLength).toBe(run.bytes)
    expect(run.bytes).toBe(OUTPUT_LIMIT)
  })

  test("refuses limits outside the fixed envelope before spawning", async () => {
    const { root, env } = await scratch()
    const input = { file: "/must-not-spawn", args: [], cwd: root, env }
    for (const deadlineMs of [0, 45001, Number.NaN])
      await expect(runBounded({ ...input, deadlineMs })).rejects.toThrow(Refused)
    for (const outputLimit of [0, OUTPUT_LIMIT + 1, Number.NaN])
      await expect(runBounded({ ...input, outputLimit })).rejects.toThrow(Refused)
  })

  test("a capture read error is incomplete rather than a successful child result", async () => {
    const original = Bun.spawn
    try {
      Object.assign(Bun, { spawn: () => ({
        stdout: new ReadableStream({ start(controller) { controller.error(new Error("injected read failure")) } }),
        stderr: new ReadableStream({ start(controller) { controller.close() } }),
        exited: Promise.resolve(0), kill() {}, unref() {},
      }) })
      const run = await runBounded({ file: "injected-no-process", args: [], cwd: "/tmp/opencode", env: {} })
      expect(run.kind).toBe("capture-error")
    } finally {
      Object.assign(Bun, { spawn: original })
    }
  })

  test("retains the sentinel when a run is refused", async () => {
    const { root } = await scratch()
    const sentinel = join(root, "retained")
    await writeFile(sentinel, "unchanged")
    await expect(assertAbsent(sentinel)).rejects.toThrow(Refused)
    expect(await readFile(sentinel, "utf8")).toBe("unchanged")
  })
})
