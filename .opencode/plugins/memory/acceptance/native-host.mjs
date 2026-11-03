import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LIMITS, readStableFile, superviseProcess } from '../../../../tools/opencode-native-row/full-graph-diagnostics.mjs'

const sourceRoot = fileURLToPath(new URL('../../../../', import.meta.url))
export const SOURCE_FILES = ['index.ts', 'core.ts', 'filesystem.ts', 'format.ts', 'paths.ts', 'retrieval.ts', 'tool.ts']
const sha = body => createHash('sha256').update(body).digest('hex')

export function privateEnvironment(root) {
  assert.ok(path.isAbsolute(root) && path.normalize(root) === root && root.startsWith('/tmp/opencode/memory-native-'))
  return {
    HOME: path.join(root, 'home'), PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
    TMPDIR: path.join(root, 'tmp'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'),
    XDG_STATE_HOME: path.join(root, 'state'), XDG_CACHE_HOME: path.join(root, 'cache'),
    OPENCODE_CONFIG_DIR: path.join(root, 'config'), OPENCODE_DATA_DIR: path.join(root, 'data', 'opencode'),
    OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_FREE_MODELS: '1',
  }
}

export function pumpBounded(stream, destination, onChunk, onRefusal, maxBytes = 65536, shared = { remaining: maxBytes }) {
  let bytes = 0
  let stopped = false
  stream.on('readable', () => {
    while (!stopped) {
      const remaining = Math.min(maxBytes - bytes, shared.remaining)
      if (remaining <= 0) { stopped = true; onRefusal(); break }
      const block = stream.read(Math.min(4096, remaining))
      if (block === null) break
      assert.ok(block.length <= remaining, 'stream exceeded the requested raw read size')
      bytes += block.length
      shared.remaining -= block.length
      destination.write(block)
      onChunk(block)
    }
  })
  stream.once('end', () => destination.end())
  stream.once('error', () => { stopped = true; onRefusal(); destination.end() })
  return () => bytes
}

export function startupEndpoint(text) {
  const url = /http:\/\/127\.0\.0\.1:[0-9]{1,5}(?=\s|$)/.exec(text)?.[0]
  const password = /server password ([^\r\n]+)\r?\n/.exec(text)?.[1]
  if (!url || !password) return
  return { url, password }
}

function activate(url, password, project, onInventory, onFailure) {
  const request = http.get(`${url}/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(project)}`, {
    headers: { authorization: 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64') },
    timeout: 5000,
  }, response => {
    const chunks = []
    pumpBounded(response, new PassThrough().resume(), chunk => chunks.push(chunk), () => {
      response.destroy(); onFailure('activation-body-bound')
    }, 32768)
    response.once('end', () => {
      try {
        assert.equal(response.statusCode, 200)
        onInventory(JSON.parse(Buffer.concat(chunks).toString()))
      } catch { onFailure('activation-response') }
    })
  })
  request.once('timeout', () => { request.destroy(); onFailure('activation-timeout') })
  request.once('error', () => onFailure('activation-request'))
  return request
}

export function acceptedRun(report, result, teardownRequested, error) {
  return !!report?.passed && report.modelRequests === 0 && report.permissionReplies?.length === 1 &&
    report.permissionReplies[0] === 'reject' && result.spawned === true && result.reason === null &&
    result.cleanup?.verified === true && teardownRequested && !error
}

export function expectedTeardownFailure(code, teardownRequested) {
  return teardownRequested && (code === 'activation-request' || code === 'activation-response')
}

export async function runNativeMemoryHost(binary) {
  assert.ok(path.isAbsolute(binary) && fs.realpathSync(binary) === binary)
  const info = fs.lstatSync(binary)
  assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o111) !== 0)
  // Refuse discovered ancestor configuration rather than inherit the operator's integrations.
  for (const ancestor of ['/', '/tmp', '/tmp/opencode']) for (const file of ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc']) {
    assert.equal(fs.existsSync(path.join(ancestor, file)), false, 'ancestor configuration would contaminate the private fixture')
  }
  const root = fs.mkdtempSync('/tmp/opencode/memory-native-')
  for (const name of ['home', 'tmp', 'config', 'data', 'state', 'cache', 'project', 'memory', 'probe']) fs.mkdirSync(path.join(root, name), { mode: 0o700 })
  const publicSample = Buffer.from('Disposable native memory permission sample.\n')
  fs.writeFileSync(path.join(root, 'project', 'public.txt'), publicSample, { flag: 'wx', mode: 0o600 })
  execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', 'init', '--quiet', path.join(root, 'project')], { timeout: 5000, stdio: 'ignore', env: privateEnvironment(root) })
  const sourceBindings = []
  let sourceBytes = 0, stagingReadBytes = 0
  const stagingDeadline = performance.now() + 10000
  const stageRead = (source, maxBytes = 262144) => {
    const remaining = 2097152 - stagingReadBytes
    assert.ok(remaining > 0, 'staging job byte budget exhausted')
    const bytes = readStableFile(source, { maxBytes: Math.min(maxBytes, remaining), deadline: stagingDeadline, label: 'memory native staged acquisition' })
    stagingReadBytes += bytes.length
    return bytes
  }
  for (const name of SOURCE_FILES) {
    const source = path.join(sourceRoot, '.opencode/plugins/memory', name)
    const bytes = stageRead(source)
    sourceBytes += bytes.length
    assert.ok(sourceBytes <= 2097152)
    const target = path.join(root, 'memory', name)
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 })
    assert.equal(sha(stageRead(target)), sha(bytes))
    sourceBindings.push({ path: source, bytes: bytes.length, sha256: sha(bytes) })
  }
  const probe = stageRead(fileURLToPath(new URL('./native-probe.mjs', import.meta.url)), 65536)
  fs.writeFileSync(path.join(root, 'probe', 'index.mjs'), probe, { flag: 'wx', mode: 0o600 })
  fs.writeFileSync(path.join(root, 'probe', 'package.json'), JSON.stringify({ name: 'memory-native-acceptance', type: 'module', exports: { '.': './index.mjs' } }), { flag: 'wx', mode: 0o600 })
  fs.writeFileSync(path.join(root, 'project', 'opencode.json'), JSON.stringify({
    plugins: [path.join(root, 'memory'), { package: path.join(root, 'probe'), options: { scratchRoot: root } }],
    skills: [], instructions: [], providers: {}, mcp: { servers: {} },
  }), { flag: 'wx', mode: 0o600 })
  let child, report, request, error, inventory
  let teardownRequested = false, activating = false, startup = '', capturedBytes = 0
  const pipeBudget = { remaining: 65536 }
  const stop = () => { if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM') }
  // Closing this owned host may interrupt the activation response after the probe has finished.
  const fail = code => { if (!expectedTeardownFailure(code, teardownRequested)) { error ??= code; stop() } }
  const reportPath = path.join(root, 'probe.json')
  const watcher = fs.watch(root, (_event, filename) => {
    if (filename !== 'probe.json' || report) return
    try {
      report = JSON.parse(readStableFile(reportPath, { maxBytes: 32768, label: 'owned native probe report' }))
      teardownRequested = true
      stop()
    } catch (failure) {
      if (failure.code !== 'ENOENT') fail('probe-report')
    }
  })
  const startupChunk = block => {
    capturedBytes += block.length
    if (capturedBytes > 65536) { fail('combined-startup-bound'); return }
    if (activating) return
    startup += block.toString()
    const endpoint = startupEndpoint(startup)
    if (!endpoint) return
    activating = true
    startup = ''
    request = activate(endpoint.url, endpoint.password, path.join(root, 'project'), value => { inventory = value }, fail)
  }
  const limits = { ...LIMITS, deadlineMs: 30000, stdoutBytes: 65536, stderrBytes: 65536 }
  let result
  try {
    result = await superviseProcess({
      command: binary, args: ['serve', '--hostname', '127.0.0.1', '--port', '0'], cwd: path.join(root, 'project'),
      env: privateEnvironment(root), limits,
      spawn(command, args, options) {
        child = spawn(command, args, options)
        for (const field of ['stdout', 'stderr']) {
          const pipe = child[field]
          const proxy = new PassThrough()
          pumpBounded(pipe, proxy, startupChunk, () => fail('startup-pipe-bound'), 65536, pipeBudget)
          child[field] = proxy
        }
        return child
      },
    })
  } finally {
    watcher.close()
    request?.destroy()
    startup = ''
    stop()
  }
  if (!report && fs.existsSync(reportPath)) report = JSON.parse(readStableFile(reportPath, { maxBytes: 32768, label: 'final native report' }))
  const sampleUnchanged = sha(readStableFile(path.join(root, 'project', 'public.txt'), { maxBytes: 4096, label: 'public fixture preservation' })) === sha(publicSample)
  const noNoteStore = !fs.existsSync(path.join(root, 'project', 'docs', 'memory'))
  const passed = acceptedRun(report, result, teardownRequested, error) && sampleUnchanged && noNoteStore
  const { stdout, stderr, ...safeResult } = result
  return {
    passed, root, binary, sourceBindings, probeSHA256: sha(probe), sourceBytes, stagingReadBytes,
    report, result: safeResult, error, teardownRequested, sampleUnchanged, noNoteStore,
    inventory: inventory?.data?.filter(entry => ['computer-use.memory', 'computer-use.memory-native-probe'].includes(entry.id)).map(entry => ({ id: entry.id, status: entry.state?.status })),
    limits, capturedBytes,
    qualification: 'Byte-copied production plugin in a fresh private HOME/config/data/state/cache and valid empty Git fixture. Native loopback activation only; fresh host credential stays in memory and no raw startup logs are returned or saved. The real child is instrumented only for bounded pipe parsing, with real default admission/sampler/observer/clock. Restrictive deny/ask fixtures and exact reject replies only, never an allow grant or operator-profile permission change. No model prompt/generation, inbox UX fixture, GUI, install, shared service action or native build/type pass.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--binary') throw new Error('Use --binary /exact/existing/opencode')
  const report = await runNativeMemoryHost(process.argv[3])
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.passed ? 0 : 1
}
