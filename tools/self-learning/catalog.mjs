import { join, isAbsolute } from 'node:path'
import { waitFor } from './adapter.mjs'

const CATALOG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

export async function loadedCatalog(context, deps) {
  if (!context?.sessionID || !context?.messageID || !context?.id) throw new Error('Current session and tool identity required')
  const directory = deps.location?.directory
  const project = deps.location?.project?.id
  if (typeof directory !== 'string' || !isAbsolute(directory) || !project || project === 'global') throw new Error('Project location required')
  const signal = context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
  const read = operation => { signal.throwIfAborted(); return waitFor(operation(), signal) }
  const checkCaller = async () => {
    const caller = await read(() => deps.session.get({ sessionID: context.sessionID }, { signal }))
    if (!caller || caller.id !== context.sessionID || caller.projectID !== project || caller.location?.directory !== directory) throw new Error('Calling session does not match plugin project and location')
  }
  await checkCaller()
  await deps.permission.assert({ sessionID: context.sessionID, agent: context.agent, source: { type: 'tool', messageID: context.messageID, id: context.id }, action: 'read', resources: [`project:${project}/skills`] }, { signal })
  signal.throwIfAborted()
  const response = await read(() => deps.skill.list({ location: { directory } }, { signal }))
  if (!response || response.location?.directory !== directory || !Array.isArray(response.data)) throw new Error('Invalid loaded skill catalog or location')
  if (response.data.length > 200) throw new Error('Loaded skill catalog exceeds 200 entries')
  const names = new Set()
  const catalog = response.data.map((item, index) => {
    // Native names are display labels; proposal keys use stable, path-safe IDs.
    const name = item?.id ?? item?.name
    if (!item || typeof name !== 'string' || name.length > 80 || !CATALOG_ID.test(name)) throw new Error(`Invalid or duplicate loaded skill metadata (identity at entry ${index})`)
    if (names.has(name)) throw new Error(`Invalid or duplicate loaded skill metadata (duplicate identity at entry ${index})`)
    if (typeof item.path !== 'string' || !isAbsolute(item.path)) throw new Error(`Invalid or duplicate loaded skill metadata (path at entry ${index})`)
    if (typeof (item.description ?? '') !== 'string' || Buffer.byteLength(item.description ?? '', 'utf8') > 2000 || /[\x00-\x1f\x7f]/.test(item.description ?? '')) throw new Error(`Invalid or duplicate loaded skill metadata (description at entry ${index})`)
    names.add(name)
    return { name, description: item.description ?? '', projectSource: item.path === join(directory, '.opencode', 'skills', name, 'SKILL.md') }
  }).sort((a, b) => a.name.localeCompare(b.name))
  await checkCaller()
  const result = { catalog, limitations: ['This is the host loader snapshot, not a complete or fresh filesystem inventory; other roots and unloaded source may differ.', 'The host skill list has no pagination or acquisition-byte limit; only returned entry count and output are capped, and the host may acquire skill content internally.', 'Project-source classification is lexical and does not verify symlinks or file freshness. Inspect canonical source and overlaps separately before proposing or applying changes.'] }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32 * 1024) throw new Error('Loaded catalog output exceeds 32 KiB')
  return result
}
