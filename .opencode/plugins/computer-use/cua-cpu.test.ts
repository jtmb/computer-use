import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"

function runChild(code: string) {
  const moduleURL = new URL("./cua.ts", import.meta.url).href
  const source = `
    import { CuaSession } from ${JSON.stringify(moduleURL)};
    const s = new CuaSession({call:async()=>({content:[]})});
    const out=await s.execute(${JSON.stringify(code)},{sessionID:'cpu',agent:'build',messageID:'m',id:'c'},1000);
    console.log(out.text);
    s.dispose();
  `
  // The outer process deadline is essential: a broken implementation can block
  // its own event loop, so an in-process test timer cannot stop the regression.
  return spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], {
    timeout: 4000,
    encoding: "utf8",
    maxBuffer: 100_000,
    cwd: "/tmp/opencode",
  })
}

test("a synchronous loop after await is bounded by the worker watchdog", () => {
  const result = runChild("await Promise.resolve(); while(true){}")
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /timed out/)
})

test("a synchronous loop before await is bounded by the worker watchdog", () => {
  const result = runChild("while(true){}")
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /timed out/)
})

test("host cancellation stops a synchronous loop promptly", () => {
  const moduleURL = new URL("./cua.ts", import.meta.url).href
  const source = `
    import { CuaSession } from ${JSON.stringify(moduleURL)};
    const s = new CuaSession({call:async()=>({content:[]})});
    const c = new AbortController();
    setTimeout(() => c.abort(), 50);
    const out = await s.execute('while(true){}',{sessionID:'cpu',agent:'build',messageID:'m',id:'c',signal:c.signal},5000);
    console.log(out.text);
    s.dispose();
  `
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], {
    timeout: 4000,
    encoding: "utf8",
    maxBuffer: 100_000,
    cwd: "/tmp/opencode",
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /cancelled/i)
})

test("host cancellation stops a loop confirmed to have started after a real backend roundtrip", () => {
  const moduleURL = new URL("./cua.ts", import.meta.url).href
  const source = `
    import { CuaSession } from ${JSON.stringify(moduleURL)};
    const c = new AbortController();
    let began = false;
    const s = new CuaSession({call:async()=>{
      began=true;
      setTimeout(()=>c.abort(),100);
      return {content:[{type:'text',text:'[]'}]};
    }});
    const out=await s.execute('await cua.getState(); while(true){}',{sessionID:'cpu-running',agent:'build',messageID:'m',id:'c',signal:c.signal},5000);
    if (!began) throw new Error('worker never reached the backend');
    console.log(out.text);
    s.dispose();
  `
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], { timeout: 4000, encoding: "utf8", maxBuffer: 100_000, cwd: "/tmp/opencode" })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /cancelled/i)
})
