import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { spawnSync } from "node:child_process"

import { verifyDependencies } from "../verify-dependencies.mjs"

const REQUIRED = {
  "@modelcontextprotocol/sdk": "1.30.0",
  "@opencode/client": "2.0.7",
  "@opencode/plugin": "2.0.7",
}

async function packageFixture() {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-connector-dependencies-"))
  const packages: Record<string, unknown> = { "": { dependencies: REQUIRED } }

  for (const [name, version] of Object.entries(REQUIRED)) {
    packages[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`,
      integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
    }
    const directory = join(root, "node_modules", ...name.split("/"))
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, "package.json"), JSON.stringify({ version }))
  }

  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: REQUIRED }))
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages }))
  return root
}

test("accepts only the exact installed runtime pins recorded in the local lockfile", async () => {
  const root = await packageFixture()
  try {
    await assert.doesNotReject(verifyDependencies(root))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("fails closed when an installed runtime package does not match its exact pin", async () => {
  const root = await packageFixture()
  try {
    const packagePath = join(root, "node_modules", "@opencode", "plugin", "package.json")
    const installed = JSON.parse(await readFile(packagePath, "utf8")) as { version: string }
    installed.version = "2.0.8"
    await writeFile(packagePath, JSON.stringify(installed))
    await assert.rejects(verifyDependencies(root), /installed @opencode\/plugin version does not match its pin/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

for (const [label, relative, budget] of [
  ["manifest", "package.json", 1024 * 1024],
  ["lock", "package-lock.json", 8 * 1024 * 1024],
  ["installed manifest", "node_modules/@opencode/plugin/package.json", 1024 * 1024],
] as const) {
  test(`refuses an oversized ${label} before treating version metadata as verified`, async t => {
    const root = await packageFixture()
    t.after(() => rm(root, { recursive: true, force: true }))
    const target = join(root, relative)
    const value = JSON.parse(await readFile(target, "utf8"))
    await writeFile(target, JSON.stringify({ ...value, padding: "x".repeat(budget) }))
    await assert.rejects(verifyDependencies(root), /byte budget/)
  })
}

function raceProgram(root: string, mode: "growth" | "fifo" | "replacement") {
  const target = join(root, "package-lock.json")
  const module = new URL("../verify-dependencies.mjs", import.meta.url).href
  const shim = `import * as fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
const target=${JSON.stringify(target)},mode=${JSON.stringify(mode)};
const state=globalThis.connectorReadRace={injected:false,bytesRead:0,largestBuffer:0};
async function grow(){if(!state.injected){state.injected=true;await fs.appendFile(target," ".repeat(8*1024*1024+4096));}}
export const lstat=fs.lstat;
export async function realpath(path,...args){const result=await fs.realpath(path,...args);
if(path===target&&!state.injected&&(mode==="fifo"||mode==="replacement")){
state.injected=true;await fs.rename(target,target+".preserved");
if(mode==="fifo")execFileSync("mkfifo",["--mode=600",target]);else await fs.copyFile(target+".preserved",target);
}return result;}
export async function readFile(path,...args){if(path===target&&mode==="growth")await grow();
const result=await fs.readFile(path,...args);if(path===target)state.bytesRead+=Buffer.byteLength(result);return result;}
export async function open(path,...args){const handle=await fs.open(path,...args);if(path!==target)return handle;
return new Proxy(handle,{get(object,key){
if(key==="stat")return async(...args)=>{const result=await handle.stat(...args);if(mode==="growth")await grow();return result;};
if(key==="read")return async(buffer,...args)=>{state.largestBuffer=Math.max(state.largestBuffer,buffer.length);const result=await handle.read(buffer,...args);state.bytesRead+=result.bytesRead;return result;};
const value=Reflect.get(object,key);return typeof value==="function"?value.bind(object):value;}});}
`
  const loader = `import{registerHooks}from"node:module";registerHooks({resolve(specifier,context,next){
if(specifier==="node:fs/promises"&&context.parentURL===${JSON.stringify(module)})return{url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(shim)}`)},shortCircuit:true};return next(specifier,context);}});`
  const program = `const {verifyDependencies}=await import(${JSON.stringify(module)});
let rejected=false,error="";try{await verifyDependencies(${JSON.stringify(root)});}catch(value){rejected=true;error=value.message;}
console.log(JSON.stringify({...globalThis.connectorReadRace,rejected,error}));`
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(loader)}`, "--input-type=module", "--eval", program],
    { encoding: "utf8", timeout: 4000, maxBuffer: 1024 * 1024 })
}

test("a lock growing after descriptor inspection cannot overrun acquisition before refusal", async t => {
  const root = await packageFixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const result = raceProgram(root, "growth")
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const state = JSON.parse(result.stdout.trim())
  assert.equal(state.injected, true)
  assert.ok(state.rejected && state.bytesRead <= 8 * 1024 * 1024 + 1, JSON.stringify(state))
})

test("a FIFO swap after canonical-path inspection refuses without blocking on open", async t => {
  const root = await packageFixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const result = raceProgram(root, "fifo")
  assert.equal(result.error, undefined, "the production reader must refuse before the owned subprocess deadline")
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const state = JSON.parse(result.stdout.trim())
  assert.equal(state.injected, true)
  assert.equal(state.rejected, true)
})

test("same-byte lock replacement during inspection cannot be accepted as the original inode", async t => {
  const root = await packageFixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const result = raceProgram(root, "replacement")
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const state = JSON.parse(result.stdout.trim())
  assert.equal(state.injected, true)
  assert.equal(state.rejected, true)
})

for (const [label, field, value] of [
  ["non-registry URL", "resolved", "https://registry.npmjs.org.attacker.invalid/package.tgz"],
  ["truncated integrity", "integrity", "sha512-YQ=="],
] as const) {
  test(`rejects a ${label} instead of accepting a pin-shaped string`, async t => {
    const root = await packageFixture()
    t.after(() => rm(root, { recursive: true, force: true }))
    const file = join(root, "package-lock.json")
    const lock = JSON.parse(await readFile(file, "utf8"))
    lock.packages["node_modules/@opencode/plugin"][field] = value
    await writeFile(file, JSON.stringify(lock))
    await assert.rejects(verifyDependencies(root), /package lock does not verify/)
  })
}
