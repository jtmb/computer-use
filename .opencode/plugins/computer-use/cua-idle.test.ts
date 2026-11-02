import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"

test("CPU work left after normal completion is stopped without waiting for another cell", () => {
  const moduleURL = new URL("./cua.ts", import.meta.url).href
  const source = `
    import { CuaSession } from ${JSON.stringify(moduleURL)};
    const s = new CuaSession({call:async()=>({content:[]})});
    const context={sessionID:'idle-cpu',agent:'build',messageID:'m',id:'c'};
    const first=await s.execute('const dangling = Promise.resolve().then(() => { while(true){} }); 1', context, 1000);
    if (!first.text.endsWith('1')) throw new Error(first.text);
    await new Promise(resolve=>setTimeout(resolve,1500));
    const next=await s.execute('typeof dangling',context,1000);
    console.log(next.text);
    s.dispose();
  `
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], { timeout: 5000, encoding: "utf8", maxBuffer: 100_000, cwd: "/tmp/opencode" })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout.trim(), /undefined$/)
  assert.match(result.stdout, /stopped between cells/)
  assert.doesNotMatch(result.stdout, /timed out/)
})
