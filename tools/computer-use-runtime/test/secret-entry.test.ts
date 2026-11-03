import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { spawnSecretEntry, type SecretEntrySpec } from "../src/secret-entry.ts";

const marker = "marker-secret";
const spec: SecretEntrySpec = { title: "Test", label: "Enter test value", maxLength: 100 };
const temporaryRoots: string[] = [];
const environmentBefore = new Map<string, string | undefined>();

async function createHarness(source: string): Promise<{ readonly root: string; readonly tempRoot: string }> {
  const root = await mkdtemp(join("/tmp/opencode", "secret-entry-test-"));
  const bin = join(root, "bin");
  const tempRoot = join(root, "tmp");
  const envFile = join(root, "fake-python3");
  await Promise.all([mkdir(bin), mkdir(tempRoot)]);
  await writeFile(envFile, `#!/usr/bin/python3\n${source}`, { mode: 0o700 });
  await chmod(envFile, 0o700);
  await rename(envFile, join(bin, "python3"));
  temporaryRoots.push(root);
  for (const [name, value] of Object.entries({
    PATH: `${bin}:/usr/bin:/bin`,
    TMPDIR: tempRoot,
    HOME: root,
    LANG: "C.UTF-8",
    GTK_A11Y: "unset-for-test",
  })) {
    if (!environmentBefore.has(name)) environmentBefore.set(name, process.env[name]);
    process.env[name] = value;
  }
  return { root, tempRoot };
}

async function assertRuntimeSpecClean(tempRoot: string): Promise<void> {
  assert.deepEqual(await readdir(tempRoot), []);
}

function assertChildStopped(pid: number): void {
  let running = false;
  try {
    process.kill(pid, 0);
    running = true;
  } catch (error) {
    assert.equal((error as NodeJS.ErrnoException).code, "ESRCH");
  }
  assert.equal(running, false, `synthetic helper process ${pid} survived cancellation`);
}

async function waitForFile(path: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`synthetic helper did not create ${path}`);
}

afterEach(async () => {
  for (const [name, value] of environmentBefore) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  environmentBefore.clear();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("spawnSecretEntry returns a bounded value and removes its non-secret spec file", async () => {
  const { tempRoot } = await createHarness(
    "import os, stat, struct, sys\n"
    + "spec_info = os.stat(sys.argv[2], follow_symlinks=False)\n"
    + "spec_parent = os.stat(os.path.dirname(sys.argv[2]))\n"
    + "fd3 = os.fstat(3)\n"
    + "unexpected = []\n"
    + "for descriptor in range(4, 128):\n"
    + "    try: os.fstat(descriptor)\n"
    + "    except OSError: continue\n"
    + "    unexpected.append(descriptor)\n"
    + "assert stat.S_ISREG(spec_info.st_mode) and stat.S_IMODE(spec_info.st_mode) == 0o600\n"
    + "assert stat.S_IMODE(spec_parent.st_mode) == 0o700\n"
    + "assert (stat.S_ISFIFO(fd3.st_mode) or stat.S_ISSOCK(fd3.st_mode)) and os.get_inheritable(3)\n"
    + "assert not unexpected, f'unexpected inherited descriptors: {unexpected}'\n"
    + "assert os.environ['GTK_A11Y'] == 'none'\n"
    + "assert 'marker-secret' not in ' '.join(sys.argv)\n"
    + `value = ${JSON.stringify(marker)}.encode()\n`
    + "os.write(3, struct.pack('>I', len(value)) + value)\n"
    + "os.write(1, b'ok\\n')\n",
  );
  const result = await spawnSecretEntry(spec, { timeoutMs: 2_000 });
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.value.toString("utf8"), marker);
    result.value.fill(0);
  }
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry accepts an exact 4096-byte UTF-8 frame", async () => {
  const { tempRoot } = await createHarness(
    "import os, struct\n"
    + "value = b'x' * 4096\n"
    + "os.write(3, struct.pack('>I', len(value)) + value)\n",
  );
  const result = await spawnSecretEntry({ ...spec, maxLength: 4096 }, { timeoutMs: 2_000 });
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.value.byteLength, 4096);
    result.value.fill(0);
  }
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry returns cancellation without payload", async () => {
  const { tempRoot } = await createHarness("import os\nos.write(1, b'cancelled\\n')\nraise SystemExit(2)\n");
  assert.deepEqual(await spawnSecretEntry(spec, { timeoutMs: 2_000 }), { status: "cancelled" });
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry kills the child when its deadline expires", async () => {
  const { root, tempRoot } = await createHarness(
    "import os, signal, time\n"
    + "from pathlib import Path\n"
    + "Path(os.path.join(os.environ['HOME'], 'child.pid')).write_text(str(os.getpid()))\n"
    + "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
    + "time.sleep(5)\n",
  );
  assert.deepEqual(
    await (async () => {
      const pending = spawnSecretEntry(spec, { timeoutMs: 1_000 });
      const pid = Number(await waitForFile(join(root, "child.pid"), 2_000));
      const outcome = await pending;
      assertChildStopped(pid);
      return outcome;
    })(),
    { status: "failed", code: "timeout" },
  );
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry kills the child when aborted", async () => {
  const { root, tempRoot } = await createHarness(
    "import os, time\n"
    + "from pathlib import Path\n"
    + "Path(os.path.join(os.environ['HOME'], 'child.pid')).write_text(str(os.getpid()))\n"
    + "time.sleep(5)\n",
  );
  const controller = new AbortController();
  const pending = spawnSecretEntry(spec, { signal: controller.signal, timeoutMs: 2_000 });
  const pid = Number(await waitForFile(join(root, "child.pid"), 2_000));
  controller.abort();
  assert.deepEqual(await pending, { status: "failed", code: "aborted" });
  assertChildStopped(pid);
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry rejects an already-aborted request before creating a spec", async () => {
  const { tempRoot } = await createHarness("raise SystemExit('must not launch')\n");
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(
    await spawnSecretEntry(spec, { signal: controller.signal }),
    { status: "failed", code: "aborted" },
  );
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry refuses an overlong fd-3 payload", async () => {
  const { tempRoot } = await createHarness(
    "import os, struct\n"
    + "chunk = struct.pack('>I', 1_000_000) + b'x' * 8192\n"
    + "for _ in range(128): os.write(3, chunk)\n"
    + "os.write(1, b'ok\\n')\n",
  );
  assert.deepEqual(
    await spawnSecretEntry(spec, { timeoutMs: 2_000 }),
    { status: "failed", code: "protocol" },
  );
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry never includes helper output in failures", async () => {
  const { tempRoot } = await createHarness(
    `import os\nos.write(1, ${JSON.stringify(marker)}.encode())\n`
    + `os.write(2, ${JSON.stringify(marker)}.encode())\n`
    + "raise SystemExit(9)\n",
  );
  const result = await spawnSecretEntry(spec, { timeoutMs: 2_000 });
  assert.deepEqual(result, { status: "failed", code: "child-exit" });
  assert.equal(JSON.stringify(result).includes(marker), false);
  await assertRuntimeSpecClean(tempRoot);
});

test("spawnSecretEntry rejects truncated, trailing, and invalid UTF-8 frames", async () => {
  const malformedFrames = [
    Buffer.from([0, 0]),
    Buffer.from([0, 0, 0, 3, 0x61, 0x62]),
    Buffer.from([0, 0, 0, 1, 0x61, 0x21]),
    Buffer.from([0, 0, 0, 1, 0xff]),
  ];
  for (const frame of malformedFrames) {
    const { tempRoot } = await createHarness(
      "import os\n"
      + `os.write(3, bytes.fromhex(${JSON.stringify(frame.toString("hex"))}))\n`,
    );
    assert.deepEqual(
      await spawnSecretEntry(spec, { timeoutMs: 2_000 }),
      { status: "failed", code: "protocol" },
    );
    await assertRuntimeSpecClean(tempRoot);
  }
});

async function inheritedHelperProbe(mode: "timeout" | "abort" | "overflow" | "success"): Promise<void> {
  const { root, tempRoot } = await createHarness(
    "import json, os, signal, struct, time\n"
    + "from pathlib import Path\n"
    + "owner = os.getpid()\n"
    + "child = os.fork()\n"
    + "if child:\n"
    + (mode === "success" ? "    os.write(3, struct.pack('>I', 1) + b'x')\n" : "")
    + "    os._exit(0)\n"
    + "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
    + (mode === "success" ? "os.close(3)\n" : "")
    + "Path(os.path.join(os.environ['HOME'], 'descendant.json')).write_text(json.dumps({'owner': owner, 'pid': os.getpid(), 'group': os.getpgrp()}))\n"
    + (mode === "overflow" ? "os.write(3, b'x' * 8192)\n" : "")
    + "time.sleep(30)\n",
  );
  const runner = `import {readFile} from "node:fs/promises";
import {setTimeout as sleep} from "node:timers/promises";
import {spawnSecretEntry} from ${JSON.stringify(new URL("../src/secret-entry.ts", import.meta.url).href)};
const controller = new AbortController();
const pending = spawnSecretEntry({title:"Synthetic",label:"Synthetic"},{signal:controller.signal,timeoutMs:${mode === "timeout" ? 600 : 2000}});
${mode === "abort" ? `let child; const deadline = performance.now() + 1500;
while (!child) { try { child=JSON.parse(await readFile(${JSON.stringify(join(root, "descendant.json"))},"utf8")); } catch { if (performance.now()>deadline) throw Error("fake child did not start"); await sleep(10); } }
while (true) { try { process.kill(child.owner,0); } catch(error) { if(error.code!=="ESRCH") throw error; break; } if(performance.now()>deadline) throw Error("fake owner did not exit"); await sleep(10); }
controller.abort();` : ""}
const result=await pending;
if(result.status==="ok") { const bytes=result.value.length; result.value.fill(0); console.log(JSON.stringify({status:"ok",bytes})); }
else console.log(JSON.stringify(result));`;
  const supervisor = `import ctypes, json, os, signal, subprocess, sys, time
from pathlib import Path
assert ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) == 0
node = subprocess.Popen([sys.argv[1], '--experimental-strip-types', '--input-type=module', '--eval', sys.argv[2]], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
record = Path(sys.argv[3])
watchdog = False
leaked = False
def cleanup():
    groups = {node.pid}
    if record.exists(): groups.add(json.loads(record.read_text())['group'])
    for group in groups:
        assert group > 1 and group != os.getpgrp()
        try: os.killpg(group, signal.SIGKILL)
        except ProcessLookupError: pass
try:
    try: stdout, stderr = node.communicate(timeout=4)
    except subprocess.TimeoutExpired:
        watchdog = True
        cleanup()
        stdout, stderr = node.communicate(timeout=1)
    until = time.monotonic() + 1
    while True:
        try: pid, _status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError: break
        if pid: continue
        if time.monotonic() > until:
            leaked = True
            break
        time.sleep(0.01)
finally:
    cleanup()
    until = time.monotonic() + 1
    while True:
        try: pid, _status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError: break
        if pid: continue
        if time.monotonic() > until: raise RuntimeError('fake helper cleanup failed')
        time.sleep(0.01)
print(json.dumps({'watchdog':watchdog,'leaked':leaked,'code':node.returncode,'stdout':stdout.decode(),'stderr':stderr.decode()}))
`;
  const observed = spawnSync("/usr/bin/python3", ["-B", "-c", supervisor, process.execPath, runner, join(root, "descendant.json")], {
    encoding: "utf8", timeout: 8000, maxBuffer: 64 * 1024,
    env: { PATH: process.env.PATH, HOME: root, TMPDIR: tempRoot, LANG: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.equal(observed.error, undefined);
  assert.equal(observed.status, 0, observed.stdout + observed.stderr);
  const report = JSON.parse(observed.stdout);
  assert.equal(report.watchdog, false, "production transport exceeded the independent four-second watchdog");
  assert.equal(report.leaked, false, "a fake descendant survived the transport result");
  assert.equal(report.code, 0, report.stderr);
  assert.deepEqual(JSON.parse(report.stdout), mode === "success" ? { status: "ok", bytes: 1 } : {
    status: "failed", code: mode === "abort" ? "aborted" : mode === "overflow" ? "protocol" : "timeout",
  });
  await assertRuntimeSpecClean(tempRoot);
}

for (const mode of ["timeout", "abort", "overflow", "success"] as const) {
  test(`spawnSecretEntry cleans an exited helper's descendant on ${mode}`, { timeout: 10000 }, async () => {
    await inheritedHelperProbe(mode);
  });
}
