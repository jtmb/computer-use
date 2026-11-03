import { waitFor } from './adapter.mjs'

const RULES = [
  { id: 'desktop-verification', skill: 'desktop-control', re: /\b(desktop|window|gui|accessibility|at-spi)\b/i, lesson: 'Review desktop targeting and observable verification.' },
  { id: 'browser-workflow', skill: 'browser-assistant', re: /\b(browser|playwright|webpage|web page)\b/i, lesson: 'Review browser isolation, interaction and verification.' },
  { id: 'skill-maintenance', skill: 'skill-maintenance', re: /\b(skill|skills|skill\.md)\b/i, lesson: 'Review skill discovery, overlap and validation.' },
  { id: 'session-context', skill: 'session-context', re: /\b(session|sessions|transcript)\b/i, lesson: 'Review session scope, provenance and retrieval limits.' },
  { id: 'files-and-documents', skill: 'files-and-documents', re: /\b(file|files|document|pdf)\b/i, lesson: 'Review file preservation and verification.' },
  { id: 'system-troubleshooting', skill: 'system-troubleshooting', re: /\b(service|crash|network|permission|install)\b/i, lesson: 'Review diagnosis and permission boundaries.' },
]

const SIGNALS = [
  { id: 'correction', re: /\b(instead|actually|correction|do not|don't|wrong|must not)\b/i },
  { id: 'failure', re: /\b(failed|failure|error|blocked|broken|unable)\b/i },
  { id: 'success', re: /\b(verified|passed|succeeded|working|confirmed)\b/i },
  { id: 'preference', re: /\b(prefer|preference|always|never)\b/i },
]

const SENSITIVE = /\b(password|passphrase|secret|api[_ -]?key|access[_ -]?token|private[_ -]?key|credit[_ -]?card|social security|medical|therapy|bank account)\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/i
const MAX_OUTPUT_BYTES = 32 * 1024

function unwrap(value) {
  return value && typeof value === 'object' && 'data' in value && !Array.isArray(value.data) ? value.data : value
}

function page(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.data) || !value.cursor || typeof value.cursor !== 'object') throw new Error('Invalid paginated session response')
  return value
}

function checkAbort(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('Analysis cancelled')
}

function safeID(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
}

function identity(value) {
  const session = unwrap(value)
  if (!session || !safeID(session.id) || !safeID(session.projectID) || typeof session.location?.directory !== 'string' || session.location.directory.length > 4096) throw new Error('Missing or invalid session identity or project location')
  return session
}

function validContext(ctx) {
  if (!ctx?.sessionID || !ctx?.messageID || !ctx?.id) throw new Error('Current session and tool identity required')
}

function messageText(message) {
  if (!message || !safeID(message.id) || !Number.isFinite(message.time?.created)) return null
  if (message.type === 'user') {
    if (message.metadata && Object.keys(message.metadata).length) return null
    return typeof message.text === 'string' ? message.text : null
  }
  if (message.type === 'assistant' && message.finish === 'stop' && !message.error && Array.isArray(message.content)) {
    return message.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n')
  }
  return null
}

export async function inspectEvidence(input, context, deps) {
  validContext(context)
  if (!input || Object.keys(input).some(key => key !== 'references') || !Array.isArray(input.references) || input.references.length < 1 || input.references.length > 6) throw new Error('One to six evidence references are required')
  const keys = new Set()
  for (const ref of input.references) {
    if (!ref || Object.keys(ref).some(key => !['sessionID', 'messageID'].includes(key)) || !safeID(ref.sessionID) || !safeID(ref.messageID) || ref.sessionID === context.sessionID) throw new Error('Invalid evidence reference')
    const key = `${ref.sessionID}:${ref.messageID}`
    if (keys.has(key)) throw new Error('Duplicate evidence reference')
    keys.add(key)
  }
  const timeout = deps.scanTimeoutMs ?? 30000
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new Error('Invalid scan deadline')
  const signal = context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
  const read = operation => { checkAbort(signal); return waitFor(operation(), signal) }
  const caller = identity(await read(() => deps.session.get({ sessionID: context.sessionID }, { signal })))
  if (caller.id !== context.sessionID || caller.projectID === 'global' || caller.projectID !== deps.location.project.id || caller.location.directory !== deps.location.directory) throw new Error('Calling session does not match plugin location and project')
  const source = { type: 'tool', messageID: context.messageID, id: context.id }
  const assert = resources => deps.permission.assert({ sessionID: context.sessionID, agent: context.agent, source, action: 'read', resources }, { signal })
  const checkCaller = async () => {
    const current = identity(await read(() => deps.session.get({ sessionID: caller.id }, { signal })))
    if (current.id !== caller.id || current.projectID !== caller.projectID || current.location.directory !== caller.location.directory) throw new Error('Calling session identity changed during inspection')
  }
  const results = []
  for (const ref of input.references) {
    checkAbort(signal)
    await assert([`session:${ref.sessionID}`])
    checkAbort(signal)
    const before = identity(await read(() => deps.session.get({ sessionID: ref.sessionID }, { signal })))
    if (before.id !== ref.sessionID || before.projectID !== caller.projectID || before.parentID || before.fork) throw new Error('Evidence session is outside the project or is related')
    await checkCaller()
    const message = unwrap(await read(() => deps.message.get(ref, { signal })))
    const after = identity(await read(() => deps.session.get({ sessionID: ref.sessionID }, { signal })))
    if (after.id !== before.id || after.projectID !== before.projectID || after.location.directory !== before.location.directory || after.parentID || after.fork) throw new Error('Evidence session identity changed while reading')
    if (!message || message.id !== ref.messageID) throw new Error('Evidence message identity changed')
    const text = messageText(message)
    if (text === null || text.length > 16000 || SENSITIVE.test(text)) {
      results.push({ ...ref, status: 'ineligible' })
      continue
    }
    results.push({ ...ref, status: 'checked', role: message.type, time: message.time.created, topics: RULES.filter(rule => rule.re.test(text)).map(rule => rule.id), signals: SIGNALS.filter(item => item.re.test(text)).map(item => item.id) })
  }
  await checkCaller()
  return { projectID: caller.projectID, results, limitations: ['These are lexical checks, not semantic verification, independent evidence, user preferences or instructions.', 'No message text is returned. Sensitive-content screening is incomplete; inaccessible, changed or ineligible evidence cannot support a verified lesson.', 'Review the underlying evidence through an authorized bounded reader before making any proposal.'] }
}

export async function analyze(input, context, deps) {
  validContext(context)
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['maxSessions', 'messagesPerSession'].includes(key))) throw new Error('Invalid analysis input')
  const maxSessions = input.maxSessions ?? 8
  const messagesPerSession = input.messagesPerSession ?? 30
  if (!Number.isInteger(maxSessions) || maxSessions < 2 || maxSessions > 12 || !Number.isInteger(messagesPerSession) || messagesPerSession < 1 || messagesPerSession > 40) throw new Error('Analysis limits out of range')
  const timeout = deps.scanTimeoutMs ?? 30000
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new Error('Invalid scan deadline')
  const signal = context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
  const read = operation => { checkAbort(signal); return waitFor(operation(), signal) }
  checkAbort(signal)
  const caller = identity(await read(() => deps.session.get({ sessionID: context.sessionID }, { signal })))
  checkAbort(signal)
  if (caller.id !== context.sessionID || caller.projectID !== deps.location.project.id || caller.location.directory !== deps.location.directory) throw new Error('Calling session does not match plugin location and project')
  if (caller.projectID === 'global') throw new Error('Self-learning requires a project, not the global session scope')
  const checkCaller = async () => {
    const current = identity(await read(() => deps.session.get({ sessionID: caller.id }, { signal })))
    if (current.id !== caller.id || current.projectID !== caller.projectID || current.location.directory !== caller.location.directory) throw new Error('Calling session identity changed during analysis')
  }
  const source = { type: 'tool', messageID: context.messageID, id: context.id }
  const assert = (resources) => deps.permission.assert({ sessionID: context.sessionID, agent: context.agent, source, action: 'read', resources }, { signal })
  await assert([`project:${caller.projectID}/sessions`])
  checkAbort(signal)
  const list = page(await read(() => deps.session.list({ project: caller.projectID, limit: maxSessions + 1, order: 'desc' }, { signal })))
  checkAbort(signal)
  if (list.data.length > maxSessions + 1) throw new Error('Session list exceeded requested limit')
  const seen = new Set([caller.id])
  const candidates = []
  let skippedRelated = 0
  for (const item of list.data) {
    if (!item || !safeID(item.id)) throw new Error('Session list returned invalid identity')
    if (seen.has(item.id)) continue
    seen.add(item.id)
    if (item.parentID || item.fork) { skippedRelated++; continue }
    if (candidates.length < maxSessions) candidates.push(item)
  }
  const found = new Map()
  const coverage = { listed: list.data.length, selected: candidates.length, skippedRelated, analyzed: 0, messages: 0, skippedMessages: 0, sensitiveMessages: 0, oversizedMessages: 0, sessionsTruncated: Boolean(list.cursor.next) || seen.size > maxSessions + 1, messagesTruncated: 0 }
  for (const entry of candidates) {
    checkAbort(signal)
    const candidate = identity(entry)
    if (candidate.projectID !== caller.projectID) throw new Error('Session list returned another project')
    await assert([`session:${candidate.id}`])
    checkAbort(signal)
    const before = identity(await read(() => deps.session.get({ sessionID: candidate.id }, { signal })))
    checkAbort(signal)
    if (before.id !== candidate.id || before.projectID !== caller.projectID || before.location.directory !== candidate.location.directory || before.parentID || before.fork) throw new Error('Session identity changed before reading')
    await checkCaller()
    const messages = page(await read(() => deps.message.list({ sessionID: candidate.id, limit: messagesPerSession, order: 'desc' }, { signal })))
    checkAbort(signal)
    if (messages.data.length > messagesPerSession) throw new Error('Message list exceeded requested limit')
    const after = identity(await read(() => deps.session.get({ sessionID: candidate.id }, { signal })))
    checkAbort(signal)
    if (after.id !== candidate.id || after.projectID !== caller.projectID || after.location.directory !== before.location.directory || after.parentID || after.fork) throw new Error('Session identity changed while reading')
    coverage.analyzed++
    if (messages.cursor.next) coverage.messagesTruncated++
    for (const message of messages.data) {
      const text = messageText(message)
      if (text === null) { coverage.skippedMessages++; continue }
      if (text.length > 16000) { coverage.oversizedMessages++; continue }
      if (SENSITIVE.test(text)) { coverage.sensitiveMessages++; continue }
      coverage.messages++
      for (const rule of RULES) {
        if (!rule.re.test(text)) continue
        for (const signal of SIGNALS) {
          if (!signal.re.test(text)) continue
          const key = `${rule.id}:${signal.id}`
          const group = found.get(key) ?? { id: key, topic: rule.id, signal: signal.id, relatedSkill: rule.skill, hypothesis: rule.lesson, evidence: [] }
          if (!group.evidence.some(e => e.sessionID === candidate.id)) group.evidence.push({ sessionID: candidate.id, messageID: message.id, time: message.time.created, role: message.type })
          found.set(key, group)
        }
      }
    }
  }
  await checkCaller()
  const eligible = [...found.values()].filter(group => group.evidence.length >= 2).sort((a, b) => b.evidence.length - a.evidence.length || a.id.localeCompare(b.id))
  const patterns = eligible.slice(0, 20)
  coverage.patternsTruncated = eligible.length - patterns.length
  const result = { projectID: caller.projectID, coverage, patterns, limitations: ['Lexical co-occurrence is a hypothesis, not a verified lesson or proof of causation.', 'Sensitive-message filtering is heuristic and cannot identify all private content; evidence contains identifiers only, never session text, attachments, tool outputs or reasoning.', 'Review relevant source evidence and current skill coverage under applicable permissions before drafting a change.', 'No files, skills, sessions or configuration were changed.'] }
  const size = () => new TextEncoder().encode(JSON.stringify(result)).byteLength
  while (patterns.length && size() > MAX_OUTPUT_BYTES) { patterns.pop(); coverage.patternsTruncated++ }
  if (size() > MAX_OUTPUT_BYTES) throw new Error('Analysis result exceeds output limit')
  return result
}
