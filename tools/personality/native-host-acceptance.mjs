import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FIXTURE_MODEL, startModelFixture, verifyModelRequests } from './native-model-fixture.mjs'

export function privateEnvironment(root, source = process.env) {
  if (!path.isAbsolute(root) || path.normalize(root) !== root || !root.startsWith('/tmp/opencode/personality-native-')) throw new Error('Use a dedicated approved scratch fixture root.')
  return { HOME: path.join(root, 'home'), PATH: source.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC', TMPDIR: path.join(root, 'tmp'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'), XDG_CACHE_HOME: path.join(root, 'cache'), OPENCODE_CONFIG_DIR: path.join(root, 'config'), OPENCODE_DATA_DIR: path.join(root, 'data', 'opencode'), OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_FREE_MODELS: '1' }
}

export function redactStartupLog(value) {
  return value.replace(/server password [^\r\n]+/g, 'server password [redacted]')
}

async function stageSource(root) {
  const source = fileURLToPath(new URL('../..', import.meta.url))
  const staged = path.join(root, 'source')
  const names = [
    ...['index.ts', 'core.mjs', 'package.json', 'README.md'].map(name => `tools/personality/${name}`),
    ...['personality', 'personality-plain-english'].flatMap(skill => ['SKILL.md', 'README.md'].map(name => `.opencode/skills/${skill}/${name}`)),
  ]
  const hashes = {}
  for (const name of names) {
    const bytes = await readFile(path.join(source, name))
    if (bytes.length > 128 * 1024) throw new Error('Native fixture source exceeds its bounded staging limit.')
    const target = path.join(staged, name)
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
    const hash = value => createHash('sha256').update(value).digest('hex')
    hashes[name] = hash(bytes)
    if (hash(await readFile(target)) !== hashes[name]) throw new Error('Native fixture source copy differs.')
  }
  const skills = path.join(staged, '.opencode', 'skills')
  const plainEnglish = await readFile(path.join(skills, 'personality-plain-english', 'SKILL.md'), 'utf8')
  const sections = plainEnglish.split('\n## Response style\n')
  const plainEnglishInstructions = sections.length === 2 ? sections[1].split('\n## ')[0].trim() : ''
  if (!plainEnglishInstructions || Buffer.byteLength(plainEnglishInstructions) > 6000) throw new Error('Canonical Plain English needs one bounded Response style section.')
  await writeFile(path.join(skills, 'README.md'), '# Fixture skills\n\n2 OpenCode skills.\n\n| Skill | Usage guide | Category | Tags |\n|---|---|---|---|\n', { flag: 'wx', mode: 0o600 })
  await writeFile(path.join(root, 'source-manifest.json'), JSON.stringify({ source, algorithm: 'sha256', hashes }, null, 2), { flag: 'wx', mode: 0o600 })
  return { plugin: path.join(staged, 'tools', 'personality'), skills, verifiedSourceFiles: names.length, plainEnglishInstructions }
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise(resolve => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000)
    child.once('exit', () => { clearTimeout(timeout); resolve() })
    child.kill('SIGTERM')
  })
}

export async function runNativeHost(binary) {
  if (!path.isAbsolute(binary)) throw new Error('Pass the exact installed OpenCode binary path.')
  const root = await mkdtemp('/tmp/opencode/personality-native-')
  for (const name of ['home', 'tmp', 'config', 'data', 'state', 'cache', 'project-a', 'project-b', 'probe-plugin']) await mkdir(path.join(root, name), { mode: 0o700 })
  await writeFile(path.join(root, 'probe-plugin', 'package.json'), JSON.stringify({ name: 'personality-native-fixture', type: 'module', exports: { '.': './index.mjs' } }), { mode: 0o600 })
  await writeFile(path.join(root, 'probe-plugin', 'index.mjs'), `export {default} from ${JSON.stringify(new URL('./native-host-probe.mjs', import.meta.url).href)};\n`, { mode: 0o600 })
  const staged = await stageSource(root)
  const reports = []
  const modelFixture = await startModelFixture()
  try {
  for (const stage of ['create', 'reopen', 'moved']) {
    const project = path.join(root, stage === 'moved' ? 'project-b' : 'project-a')
    const config = {
      model: `${FIXTURE_MODEL.providerID}/${FIXTURE_MODEL.id}`,
      providers: { [FIXTURE_MODEL.providerID]: {
        name: 'Deterministic local personality fixture', package: '@opencode/ai/providers/openai-compatible',
        settings: { baseURL: modelFixture.baseURL },
        models: { [FIXTURE_MODEL.id]: { capabilities: { tools: false, input: ['text'], output: ['text'] }, limit: { context: 128000, output: 4096 } } },
      } },
      plugins: [staged.plugin, { package: path.join(root, 'probe-plugin'), options: { scratchRoot: root, stage, modelBaseURL: modelFixture.baseURL } }],
      skills: [staged.skills], instructions: [], mcp: { servers: {} },
    }
    await writeFile(path.join(project, 'opencode.json'), JSON.stringify(config), { mode: 0o600 })
    let logs = ''
    let launchError
    const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: project, env: privateEnvironment(root), stdio: ['ignore', 'pipe', 'pipe'] })
    child.once('error', error => { launchError = error })
    child.stdout.on('data', value => { logs = (logs + value).slice(-16000) })
    child.stderr.on('data', value => { logs = (logs + value).slice(-16000) })
    try {
      const started = Date.now()
      let url
      let password
      while ((!url || !password) && Date.now() - started < 15000) {
        if (launchError) throw launchError
        url = /http:\/\/127\.0\.0\.1:[0-9]+/.exec(logs)?.[0]
        password = /server password ([^\r\n]+)/.exec(logs)?.[1]
        if (child.exitCode !== null || child.signalCode !== null) throw new Error('Private server exited before readiness: ' + logs)
        if (!url || !password) await new Promise(resolve => setTimeout(resolve, 30))
      }
      if (!url || !password) throw new Error('Private server did not report its authenticated loopback endpoint: ' + logs)
      const route = `${url}/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(project)}`
      // The pinned client uses Basic auth with the fixed username "opencode".
      // This password belongs only to this fresh host and is never persisted.
      let inventory
      const activationDeadline = Date.now() + 15000
      while (Date.now() < activationDeadline) {
        const response = await fetch(route, { signal: AbortSignal.timeout(15000), headers: { authorization: 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64') } })
        if (!response.ok) throw new Error(`Private plugin activation HTTP ${response.status}: ${(await response.text()).slice(0, 2000)}`)
        inventory = await response.json()
        const personality = inventory.data?.find(plugin => plugin.id === 'computer-use.personality')
        const probe = inventory.data?.find(plugin => plugin.id === 'computer-use.personality-native-probe')
        if (personality?.state?.status === 'active' && probe?.state?.status === 'active') break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (!inventory?.data?.some(plugin => plugin.id === 'computer-use.personality' && plugin.state?.status === 'active')) throw new Error('Native personality plugin did not activate: ' + JSON.stringify(inventory))
      const deadline = Date.now() + 60000
      let report
      while (!report && Date.now() < deadline) {
        try { report = JSON.parse(await readFile(path.join(root, `${stage}.json`), 'utf8')) }
        catch (error) { if (error.code !== 'ENOENT') throw error; await new Promise(resolve => setTimeout(resolve, 30)) }
      }
      if (!report) throw new Error('Native probe did not settle: ' + logs)
      reports.push(report)
      if (!report.passed) break
    } catch (error) {
      reports.push({ stage, passed: false, error: redactStartupLog(String(error)), logs: redactStartupLog(logs) })
      break
    } finally {
      await stop(child)
      await writeFile(path.join(root, `${stage}.log`), redactStartupLog(logs), { mode: 0o600 })
    }
  }
  } finally { await modelFixture.close() }
  await writeFile(path.join(root, 'model-requests.json'), JSON.stringify(modelFixture.requests, null, 2), { mode: 0o600 })
  let modelChecks = []
  let modelError
  try { modelChecks = verifyModelRequests(modelFixture.requests, staged.plainEnglishInstructions) } catch (error) { modelError = String(error) }
  const report = { root, passed: reports.length === 3 && reports.every(report => report.passed) && !modelError && modelFixture.errors.length === 0, verifiedSourceFiles: staged.verifiedSourceFiles, reports, modelChecks, modelError, endpointErrors: modelFixture.errors, outgoingModelRequests: modelFixture.requests.length, isolation: 'Byte-verified source copy for safe native save/apply; fresh scratch HOME/config/data/state/cache; private loopback OpenCode and deterministic model endpoints only; no operator shared service/profile, copied operator credentials, external model or GUI.' }
  await writeFile(path.join(root, 'acceptance.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--binary') throw new Error('Use --binary /exact/installed/opencode for the explicit native-host test.')
  const report = await runNativeHost(process.argv[3])
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.passed ? 0 : 1
}
