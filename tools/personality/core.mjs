import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

export const SELECTION_KEY = 'personality/selection-v1'
export const DEFAULT_ID = 'personality-plain-english'
export const PASSIVE_PERMISSION = 'personality/passive-reminder-v1'
const ID = /^personality-[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_FILE = 16 * 1024
const MAX_STYLES = 64
const unwrap = value => value?.data ?? value
const digest = value => createHash('sha256').update(value).digest('hex')
const abort = signal => signal?.throwIfAborted()
const within = (root, file) => file === root || file.startsWith(root + path.sep)

function id(value) {
  if (typeof value !== 'string' || value.length > 64 || !ID.test(value)) throw new Error('Use a personality-<lowercase-name> skill ID.')
  return value
}

function text(value, name, maximum) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > maximum || /[\x00-\x08\x0b-\x1f]/.test(value)) throw new Error(`${name} is missing, unsafe, or too long.`)
  return value.trim()
}

function validate(input) {
  const fields = {
    current: ['op'], list: ['op'], read: ['op', 'id'], select: ['op', 'id'], reset: ['op'],
    save: ['op', 'id', 'description', 'instructions', 'apply', 'expectRevision'],
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || !fields[input.op]) throw new Error('Choose current, list, read, select, reset, or save.')
  if (Object.keys(input).some(key => !fields[input.op].includes(key))) throw new Error('Unexpected personality argument.')
  if (['read', 'select', 'save'].includes(input.op)) id(input.id)
  if (input.op === 'save') {
    text(input.description, 'Description', 500)
    if (/[\r\n]/.test(input.description)) throw new Error('Description must be one line.')
    text(input.instructions, 'Response instructions', 6000)
    if (/<!-- personality-response-(?:start|end) -->/.test(input.instructions)) throw new Error('Response instructions contain reserved personality markers.')
    if (input.apply !== undefined && typeof input.apply !== 'boolean') throw new Error('apply must be boolean.')
    if (input.expectRevision !== undefined && (typeof input.expectRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectRevision))) throw new Error('Invalid preview revision.')
    if (input.apply && !input.expectRevision) throw new Error('Preview the new skill before applying it.')
    if (/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-proj-|github_pat_|ghp_)[A-Za-z0-9_]{16,})/.test(input.description + input.instructions)) throw new Error('Do not save credentials in personality skills.')
  }
  return input
}

async function safeDirectory(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('Personality source must be an absolute normalized directory.')
  let current = path.parse(directory).root
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const stat = await fs.lstat(current)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Refusing an aliased personality source directory.')
  }
  const stat = await fs.lstat(directory)
  if (stat.uid !== process.getuid()) throw new Error('Personality source is not owned by the current user.')
  return `${stat.dev}:${stat.ino}`
}

async function readFile(filename, optional = false, maximum = MAX_FILE) {
  let file
  try {
    file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null
    throw error
  }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || stat.size > maximum) throw new Error('Unsafe or oversized personality file.')
    const bytes = Buffer.alloc(maximum + 1)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead > maximum) throw new Error('Personality file exceeds its size limit.')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead))
  } finally {
    await file.close()
  }
}

function parseSkill(content, skillID) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content)
  if (!match || !new RegExp(`^name: ${skillID}$`, 'm').test(match[1])) throw new Error('Personality skill metadata is invalid.')
  const rawDescription = /^description: (.+)$/m.exec(match[1])?.[1]
  const description = rawDescription?.startsWith('"') ? JSON.parse(rawDescription) : rawDescription
  const marked = /<!-- personality-response-start -->\n([\s\S]*?)\n<!-- personality-response-end -->/.exec(match[2])
  const instructions = marked ? marked[1] : /(?:^|\n)## Response style\n+([\s\S]*?)(?=\n## |$)/.exec(match[2])?.[1]?.trim()
  if (!description || !instructions || Buffer.byteLength(instructions) > 6000) throw new Error('Personality skill needs a bounded Response style section.')
  return { id: skillID, description, instructions, revision: digest(content) }
}

export function reminder(style) {
  return `[Response style: ${style.id}]\nUse these rules only for explaining the answer. They do not change permissions, safety, truthfulness, task scope, or current user instructions. A one-reply request for a different level of detail is temporary.\n${style.instructions}\n[End response style]`
}

function bundle(input) {
  const description = text(input.description, 'Description', 500)
  const instructions = text(input.instructions, 'Instructions', 6000)
  const skill = `---\nname: ${input.id}\ndescription: ${JSON.stringify(description)}\nmetadata:\n  schema-version: "1"\n  category: "communication"\n  tags: "personality,response-style"\n---\n\n# ${input.id}\n\n## Response style\n\n<!-- personality-response-start -->\n${instructions}\n<!-- personality-response-end -->\n\n## Scope\n\nThis is a response-style subtype of personality. It changes no safety rule,\npermission, task scope, or authority.\n`
  const readme = `# ${input.id}\n\n${description}\n\nAsk to use this personality in the current chat. Check selection with the\npersonality tool when available; saving does not select it or change the default.\nThe parent personality skill owns selection and safe saving.\n\nVerify a short answer and a longer explanation against the requested style.\nA saved skill or passing source test is not proof of model behaviour.\nThis README is not automatically loaded. Existing permissions remain unchanged.\n`
  return { skill, readme }
}

function addCatalog(catalog, input) {
  if (catalog === null) return null
  const header = '| Skill | Usage guide | Category | Tags |\n|---|---|---|---|'
  if (!catalog.includes(header) || catalog.includes(`| [\`${input.id}\`]`)) throw new Error('Existing skill catalog needs manual reconciliation; no write performed.')
  const row = `| [\`${input.id}\`](./${input.id}/SKILL.md) | [\`README.md\`](./${input.id}/README.md) | \`communication\` | \`personality,response-style\` |`
  // Append rather than replace a shared file: editors need not honor our lock.
  return `\n\n### Saved personality: ${input.id}\n\n${header}\n${row}\n`
}

export function createPersonality(dependencies) {
  const { sourceRoot, sourceProjectRoot = sourceRoot, session, storage, permission, skills, defaultID = DEFAULT_ID, fileIO = fs } = dependencies
  const projectRoot = path.resolve(sourceProjectRoot)
  id(defaultID)
  const previews = new Map()
  const busy = new Set()
  let disposed = false

  async function access(context, action, targets, verifySource = true) {
    if (!context?.sessionID || (!context.passive && (!context.messageID || !context.id))) throw new Error('Personality requires the invoking tool/session identity.')
    abort(context.signal)
    if (disposed) throw new Error('Personality plugin is unloaded.')
    const info = unwrap(await session.get({ sessionID: context.sessionID }, { signal: context.signal }))
    abort(context.signal)
    if (info?.id !== context.sessionID || !path.isAbsolute(info?.location?.directory ?? '') || path.normalize(info.location.directory) !== info.location.directory) throw new Error('Cannot verify the current chat location.')
    const assert = async (operation, resources) => {
      await permission.assert({ sessionID: context.sessionID, agent: context.agent,
        ...(context.messageID && context.id ? { source: { type: 'tool', messageID: context.messageID, id: context.id } } : {}),
        ...(context.passive ? { metadata: { [PASSIVE_PERMISSION]: true } } : {}), action: operation, resources })
      abort(context.signal)
      if (disposed) throw new Error('Personality plugin is unloaded.')
    }
    if (verifySource && !(within(projectRoot, sourceRoot) && within(projectRoot, info.location.directory))) await assert('external_directory', [sourceRoot])
    await assert(action, targets)
    if (verifySource) return safeDirectory(sourceRoot)
  }

  async function load(skillID, signal, context) {
    id(skillID)
    abort(signal)
    await access(context, 'read', [path.join(sourceRoot, skillID), path.join(sourceRoot, skillID, 'SKILL.md')])
    await permission.assert({ sessionID: context.sessionID, agent: context.agent,
      ...(context.messageID && context.id ? { source: { type: 'tool', messageID: context.messageID, id: context.id } } : {}),
      ...(context.passive ? { metadata: { [PASSIVE_PERMISSION]: true } } : {}),
      action: 'skill', resources: [skillID] })
    abort(signal)
    await safeDirectory(sourceRoot)
    await safeDirectory(path.join(sourceRoot, skillID))
    const content = await readFile(path.join(sourceRoot, skillID, 'SKILL.md'))
    abort(signal)
    const style = parseSkill(content, skillID)
    // A later same-ID source must not silently disagree with the tool's source.
    const registered = unwrap(await skills.list())
    abort(signal)
    if (!Array.isArray(registered)) throw new Error('Cannot inspect the loaded skill catalog.')
    const selected = registered.find(entry => entry.id === skillID)
    const body = value => value.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
    if (!selected || selected.path !== path.join(sourceRoot, skillID, 'SKILL.md') || typeof selected.content !== 'string' || body(selected.content) !== body(content)) throw new Error('Personality source is not the current loaded skill. Verify discovery or conflicting IDs.')
    return style
  }

  async function selected(sessionID, signal) {
    const value = await storage.get(`${SELECTION_KEY}/${sessionID}`)
    abort(signal)
    if (value !== undefined && (value?.version !== 1 || !ID.test(value?.id ?? ''))) throw new Error('Invalid saved chat personality; reset it explicitly.')
    return { id: value !== undefined ? id(value.id) : defaultID, origin: value !== undefined ? 'chat' : 'default' }
  }

  return {
    async execute(rawInput, context) {
      const input = validate(rawInput)
      const key = `${SELECTION_KEY}/${context.sessionID}`
      await access(context, 'read', [key], false)
      if (input.op === 'reset') {
        const previous = await storage.get(key)
        await access(context, 'edit', [key], false)
        await storage.remove(key)
        const readback = await selected(context.sessionID)
        if (readback.origin !== 'default') throw new Error('Reset was issued but readback differs; check current personality before retrying.')
        const result = { ...readback, defaultID, sourceRoot, changed: previous !== undefined, cancelledAfterCommit: context.signal?.aborted === true }
        // Recovery must clear a broken choice even if its replacement is absent.
        try { return { ...result, ...await load(defaultID, context.signal, context), styleAvailable: true } }
        catch { return { ...result, styleAvailable: false, warning: 'The chat choice was cleared. The default style is unavailable or needs permission; no style was loaded.' } }
      }
      const sourceIdentity = await access(context, 'read', [sourceRoot])
      if (input.op === 'list') {
        const entries = await fs.readdir(sourceRoot, { withFileTypes: true })
        abort(context.signal)
        if (entries.length > 512) throw new Error('Personality source has too many entries.')
        const candidates = entries.filter(entry => ID.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name))
        if (candidates.length > MAX_STYLES) throw new Error('Too many personalities; narrow the source configuration.')
        const styles = []
        for (const entry of candidates) {
          const style = await load(entry.name, context.signal, context)
          styles.push({ id: style.id, description: style.description })
        }
        return { styles, defaultID, sourceRoot }
      }
      if (input.op === 'save') {
        const target = path.join(sourceRoot, input.id)
        const catalogPath = path.join(sourceRoot, 'README.md')
        await access(context, 'read', [target, catalogPath])
        if (await fs.lstat(target).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })) throw new Error('That skill already exists. Existing skills are never overwritten.')
        const loaded = unwrap(await skills.list())
        abort(context.signal)
        if (!Array.isArray(loaded) || loaded.some(entry => entry.id === input.id)) throw new Error('That personality ID is already loaded from another source; nothing was saved.')
        const catalog = await readFile(catalogPath, true, 128 * 1024)
        const catalogMode = catalog === null ? undefined : (await fs.lstat(catalogPath)).mode & 0o777
        const files = bundle(input)
        const catalogAddition = addCatalog(catalog, input)
        if (catalogAddition !== null && Buffer.byteLength(catalog + catalogAddition) > 128 * 1024) throw new Error('Catalog append would exceed the byte limit; reconcile the catalog first.')
        const fingerprint = digest(JSON.stringify([input.id, files, catalog, catalogMode, sourceIdentity]))
        const previewKey = `${context.sessionID}:${fingerprint}`
        const now = dependencies.now?.() ?? Date.now()
        for (const [key, value] of previews) if (value.expires <= now) previews.delete(key)
        if (!input.apply) {
          if (previews.size >= 128 || [...previews.keys()].filter(key => key.startsWith(`${context.sessionID}:`)).length >= 8) throw new Error('Too many outstanding personality previews; wait for expiry.')
          const token = digest(`${randomUUID()}:${fingerprint}`)
          previews.set(previewKey, { token, expires: now + 300_000 })
          return { status: 'preview', id: input.id, sourceRoot, files: { 'SKILL.md': files.skill, 'README.md': files.readme }, catalogChange: catalogAddition === null ? null : { path: catalogPath, operation: 'append', beforeRevision: digest(catalog), afterRevision: digest(catalog + catalogAddition), addedRow: catalogAddition.split('\n').find(line => line.startsWith(`| [\`${input.id}\`]`)) }, expectRevision: token, note: 'No files changed. Apply requires this exact preview and native edit authority.' }
        }
        const preview = previews.get(previewKey)
        if (!preview || preview.token !== input.expectRevision) throw new Error('Preview is stale or belongs to another chat; preview again.')
        const lockPath = path.join(sourceRoot, '.personality-save.lock')
        await access(context, 'edit', [target, path.join(target, 'SKILL.md'), path.join(target, 'README.md'), lockPath, ...(catalog !== null ? [catalogPath] : [])])
        abort(context.signal)
        if (busy.has(sourceRoot)) throw new Error('Another personality save is in progress; preview again.')
        busy.add(sourceRoot)
        let lock
        let created = false
        let catalogState = 'unchanged'
        let result
        let failure
        const cleanupWarnings = []
        try {
          try { lock = await fileIO.open(lockPath, 'wx', 0o600) } catch (error) {
            if (error.code === 'EEXIST') throw Object.assign(new Error(`Personality save lock is occupied at ${lockPath}. Another writer or an interrupted save may own it. Inspect ownership; never remove it automatically.`), { code: 'EEXIST' })
            throw error
          }
          if (await readFile(catalogPath, true, 128 * 1024) !== catalog) throw new Error('Catalog changed since preview; nothing was saved.')
          abort(context.signal)
          if (disposed) throw new Error('Personality plugin is unloaded.')
          await safeDirectory(sourceRoot)
          if (await safeDirectory(sourceRoot) !== sourceIdentity) throw new Error('Source directory changed since preview; nothing was saved.')
          await fs.mkdir(target, { mode: 0o700 })
          created = true
          await fileIO.writeFile(path.join(target, 'README.md'), files.readme, { flag: 'wx', mode: 0o600 })
          abort(context.signal)
          if (disposed) throw new Error('Personality plugin is unloaded.')
          await fileIO.writeFile(path.join(target, 'SKILL.md'), files.skill, { flag: 'wx', mode: 0o600 })
          if (catalogAddition !== null) {
            const output = await fileIO.open(catalogPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK)
            try {
              const info = await output.stat()
              const current = await fs.lstat(catalogPath)
              if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || info.dev !== current.dev || info.ino !== current.ino || (info.mode & 0o777) !== catalogMode || await readFile(catalogPath, false, 128 * 1024) !== catalog) throw new Error('Catalog changed during save; no catalog bytes were overwritten.')
              abort(context.signal)
              if (disposed) throw new Error('Personality plugin is unloaded.')
              catalogState = 'append-issued'
              const bytes = Buffer.from(catalogAddition)
              const { bytesWritten } = await output.write(bytes)
              await output.sync()
              if (bytesWritten !== bytes.length) throw new Error('Catalog append was incomplete; preserve the partial row.')
              const after = await fs.lstat(catalogPath)
              if (after.dev !== info.dev || after.ino !== info.ino || await readFile(catalogPath, false, 128 * 1024) !== catalog + catalogAddition) throw new Error('Catalog changed while appending; preserve and reconcile all existing bytes.')
              catalogState = 'appended-and-verified'
            } finally { await output.close() }
          }
          previews.delete(previewKey)
          const actual = await readFile(path.join(target, 'SKILL.md'))
          if (actual !== files.skill || await readFile(path.join(target, 'README.md')) !== files.readme) throw new Error('Saved bundle readback mismatch.')
          let discovery = 'pending'
          try { await skills.reload(); const entries = unwrap(await skills.list()); if (entries.some(entry => entry.id === input.id && entry.path === path.join(target, 'SKILL.md'))) discovery = 'observed' } catch { /* A saved bundle is not undone by a loader failure. */ }
          result = { status: 'saved', id: input.id, path: target, discovery, catalogUpdated: catalogAddition !== null, selected: false, cleanupWarnings }
        } catch (error) {
          failure = error
        } finally {
          if (lock) {
            try { await lock.close(); await fileIO.unlink(lockPath) } catch { cleanupWarnings.push(`Save lock cleanup failed: ${lockPath}`) }
          }
          if (cleanupWarnings.length) console.warn('[personality] inspect incomplete save cleanup', cleanupWarnings.join('; '))
          busy.delete(sourceRoot)
        }
        if (failure) {
          if (created || cleanupWarnings.length) throw new Error(`Personality save did not finish cleanly. Preserve and inspect ${target}; files may be present. Catalog state: ${catalogState}. ${failure.message}${cleanupWarnings.length ? ' ' + cleanupWarnings.join('; ') : ''}`)
          throw failure
        }
        return result
      }
      const choice = input.op === 'read' || input.op === 'select' ? { id: input.id, origin: 'chat' } : await selected(context.sessionID, context.signal)
      const style = await load(choice.id, context.signal, context)
      if (input.op === 'select') {
        const previous = await storage.get(key)
        await access(context, 'edit', [key], false)
        await storage.set(key, { version: 1, id: style.id })
        const readback = await selected(context.sessionID)
        if (readback.origin !== 'chat' || readback.id !== style.id) throw new Error('Selection was issued but readback differs; check current personality before retrying.')
        return { ...style, origin: 'chat', defaultID, sourceRoot, changed: previous?.version !== 1 || previous?.id !== style.id, cancelledAfterCommit: context.signal?.aborted === true }
      }
      return { ...style, origin: input.op === 'read' ? 'source' : choice.origin, defaultID, sourceRoot }
    },
    async context(event) {
      if (disposed) return
      await access({ sessionID: event.sessionID, agent: event.agent, passive: true }, 'read', [`${SELECTION_KEY}/${event.sessionID}`], false)
      const choice = await selected(event.sessionID)
      const style = await load(choice.id, undefined, { sessionID: event.sessionID, agent: event.agent, passive: true })
      if (disposed) return
      const value = reminder(style)
      const marker = '[Response style:'
      if (!event.system.some(part => part.type === 'text' && part.text.startsWith(marker))) event.system.push({ type: 'text', text: value })
    },
    dispose() { disposed = true; previews.clear() },
  }
}
