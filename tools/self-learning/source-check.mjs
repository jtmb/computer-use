import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { isAbsolute, join, normalize, parse, sep } from 'node:path'
import { waitFor } from './adapter.mjs'
import { checkReviewedProposal } from './review.mjs'

export async function checkCanonicalSource({ input, reviewedHash }, context, deps) {
  // Validate the proposal and hash before allowing them to determine a path.
  checkReviewedProposal({ input, reviewedHash, currentContent: input?.kind === 'create' ? null : input?.previousContent })
  const directory = deps.location?.directory
  const project = deps.location?.project?.id
  if (!context?.sessionID || !context?.messageID || !context?.id || !project || project === 'global' || typeof directory !== 'string' || !isAbsolute(directory) || normalize(directory) !== directory || directory.length > 4096) throw new Error('Valid project and calling session required')
  const signal = context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
  const read = operation => { signal.throwIfAborted(); return waitFor(operation(), signal) }
  const openBounded = async (path, flags) => {
    signal.throwIfAborted()
    const pending = open(path, flags)
    pending.then(handle => { if (signal.aborted) void handle.close().catch(() => {}) }, () => {})
    return waitFor(pending, signal)
  }
  const checkCaller = async () => {
    const caller = await read(() => deps.session.get({ sessionID: context.sessionID }, { signal }))
    if (!caller || caller.id !== context.sessionID || caller.projectID !== project || caller.location?.directory !== directory) throw new Error('Calling session identity changed')
  }
  const opencodeDir = join(directory, '.opencode')
  const skillsDir = join(opencodeDir, 'skills')
  const skillDir = join(skillsDir, input.skill)
  const target = join(skillDir, 'SKILL.md')
  const parts = target.slice(parse(target).root.length).split(sep).filter(Boolean)
  if (parts.length > 128) throw new Error('Source path exceeds component limit')
  // Creation may be the first skill in a project, so those directories may legitimately be absent.
  const creatableDirs = new Set([opencodeDir, skillsDir, skillDir])
  const opened = []
  const ancestors = []
  const verifyAncestors = async () => {
    for (const item of ancestors) {
      const current = await read(() => lstat(item.path))
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== item.dev || current.ino !== item.ino) throw new Error('Source directory changed during inspection')
    }
  }
  let path = parse(target).root
  try {
    await checkCaller()
    let parent = await openBounded(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    opened.push(parent)
    for (const [index, part] of parts.entries()) {
      path = join(path, part)
      await deps.permission.assert({ sessionID: context.sessionID, agent: context.agent, source: { type: 'tool', messageID: context.messageID, id: context.id }, action: 'read', resources: [path] }, { signal })
      signal.throwIfAborted()
      const isFile = index === parts.length - 1
      let handle
      try {
        handle = await openBounded(`/proc/self/fd/${parent.fd}/${part}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | (isFile ? 0 : constants.O_DIRECTORY))
      } catch (error) {
        if (input.kind === 'create' && creatableDirs.has(path) && error?.code === 'ENOENT') {
          await verifyAncestors()
          await checkCaller()
          const result = checkReviewedProposal({ input, reviewedHash, currentContent: null })
          return { ...result, status: 'source-checked', absentDirectories: [path], limitations: ['Target source directories were absent at inspection time, not locked against later creation.', 'This check does not establish user approval, native edit permission, semantic evidence, Git cleanliness or skill validation.'] }
        }
        throw error
      }
      opened.push(handle)
      const stat = await read(() => handle.stat())
      if (!isFile) {
        if (!stat.isDirectory() || (input.kind === 'create' && path === skillDir)) throw new Error('Target directory already exists or is unsafe')
        ancestors.push({ path, dev: stat.dev, ino: stat.ino })
        parent = handle
        continue
      }
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8192) throw new Error('Skill source is not a bounded single-link regular file')
      const buffer = Buffer.alloc(8193)
      let length = 0
      while (length < buffer.length) {
        const chunk = await read(() => handle.read(buffer, length, buffer.length - length, length))
        if (chunk.bytesRead === 0) break
        length += chunk.bytesRead
      }
      if (length > 8192) throw new Error('Skill source exceeded the byte limit')
      const after = await read(() => handle.stat())
      const currentFile = await read(() => lstat(path))
      if (!currentFile.isFile() || currentFile.isSymbolicLink() || currentFile.nlink !== 1 || currentFile.dev !== stat.dev || currentFile.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('Skill source changed during inspection')
      await verifyAncestors()
      await checkCaller()
      const currentContent = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))
      const result = checkReviewedProposal({ input, reviewedHash, currentContent })
      return { ...result, status: 'source-checked', limitations: ['Source matched at inspection time but is not locked against subsequent changes.', 'This check does not establish user approval, native edit permission, semantic evidence, Git cleanliness or skill validation.'] }
    }
    throw new Error('Invalid canonical source path')
  } finally {
    for (const handle of opened.reverse()) await handle.close()
  }
}
