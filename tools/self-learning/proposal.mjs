import { createHash } from 'node:crypto'

const ID = /^[A-Za-z0-9_-]{1,128}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CATALOG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i
const SENSITIVE = /\b(?:password|passphrase|api[_ -]?key|access[_ -]?token|private[_ -]?key)\s*[:=]\s*\S{4,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i
// Terminal controls, carriage returns, line separators and bidi overrides can make a reviewed
// diff or the resulting skill source read differently from its actual bytes.
const UNSAFE_TEXT = /[\x00-\x08\x0b-\x1f\x7f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/
const MAX_TEXT_BYTES = 8192

function text(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > max || UNSAFE_TEXT.test(value) || SENSITIVE.test(value)) throw new Error(`Invalid or sensitive ${name}`)
  return value
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function words(value) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])
}

function overlap(query, catalog) {
  const wanted = words(query)
  return catalog.map(skill => ({ skill: skill.name, matches: [...words(`${skill.name} ${skill.description}`)].filter(word => wanted.has(word)).length }))
    .filter(item => item.matches > 0).sort((a, b) => b.matches - a.matches || a.skill.localeCompare(b.skill)).slice(0, 8)
}

function lines(value, marker) {
  if (!value) return []
  return value.replace(/\n$/, '').split('\n').map(line => `${marker}${line}`)
}

export function makeProposal(input) {
  if (!input || typeof input !== 'object' || !['create', 'update'].includes(input.kind) || typeof input.skill !== 'string' || !SLUG.test(input.skill) || input.skill.length > 80) throw new Error('Invalid proposal target')
  if (!Array.isArray(input.catalog) || input.catalog.length > 200 || !input.catalog.every(item => item && typeof item.name === 'string' && CATALOG_ID.test(item.name) && item.name.length <= 80 && typeof item.description === 'string' && Buffer.byteLength(item.description) <= 2000)) throw new Error('Invalid skill catalog')
  const names = input.catalog.map(item => item.name)
  if (new Set(names).size !== names.length) throw new Error('Duplicate catalog entries')
  if (input.kind === 'create' && names.includes(input.skill)) throw new Error('Skill already exists')
  if (input.kind === 'update' && !names.includes(input.skill)) throw new Error('Existing skill absent from catalog')
  const lesson = text(input.lesson, 'generalized lesson', 1000)
  const uncertainty = text(input.uncertainty, 'uncertainty', 1000)
  if (!['low', 'medium', 'high'].includes(input.confidence)) throw new Error('Reviewer confidence must be low, medium or high')
  const validation = text(input.validation, 'validation', 1000)
  const rationale = text(input.rationale, 'rationale', 1000)
  const next = text(input.nextContent, 'proposed skill content', MAX_TEXT_BYTES)
  const previous = input.kind === 'create' ? '' : text(input.previousContent, 'existing skill content', MAX_TEXT_BYTES)
  const readme = input.kind === 'create' ? text(input.readmeContent, 'proposed usage guide', MAX_TEXT_BYTES) : undefined
  if (input.kind === 'update' && input.readmeContent !== undefined) throw new Error('Usage guide updates require a separate reviewed proposal')
  if (!next.endsWith('\n') || (previous && !previous.endsWith('\n'))) throw new Error('Skill content must end with a newline for an exact diff')
  if (readme && !readme.endsWith('\n')) throw new Error('Usage guide must end with a newline for an exact diff')
  if (input.kind === 'create' && input.previousContent !== undefined && input.previousContent !== '') throw new Error('New skill cannot replace existing content')
  if (previous === next) return { status: 'no-change', reason: 'Proposed content matches the existing source.' }
  if (!Array.isArray(input.evidence) || input.evidence.length < 2 || input.evidence.length > 6) throw new Error('Two to six reviewed evidence references are required')
  const sessions = new Set()
  const evidence = input.evidence.map(item => {
    if (!item || typeof item.sessionID !== 'string' || typeof item.messageID !== 'string' || !ID.test(item.sessionID) || !ID.test(item.messageID) || !['failure', 'correction', 'success'].includes(item.kind)) throw new Error('Invalid evidence reference or assessment')
    if (sessions.has(item.sessionID)) throw new Error('Evidence must come from distinct sessions')
    sessions.add(item.sessionID)
    return { sessionID: item.sessionID, messageID: item.messageID, kind: item.kind, assessment: text(item.assessment, 'generalized evidence assessment', 500) }
  })
  const candidates = overlap(`${input.skill} ${lesson}`, input.catalog)
  if (input.kind === 'create' && candidates.length && !input.overlapReason) throw new Error('Explain why overlapping existing skills are insufficient')
  const overlapReason = input.overlapReason ? text(input.overlapReason, 'overlap rationale', 1000) : undefined
  const path = `.opencode/skills/${input.skill}/SKILL.md`
  const oldLines = lines(previous, '-')
  const newLines = lines(next, '+')
  let diff = [`--- ${input.kind === 'create' ? '/dev/null' : `a/${path}`}`, `+++ b/${path}`, `@@ -${oldLines.length ? 1 : 0},${oldLines.length} +1,${newLines.length} @@`, ...oldLines, ...newLines].join('\n') + '\n'
  const readmePath = readme ? `.opencode/skills/${input.skill}/README.md` : undefined
  if (readme) {
    const readmeLines = lines(readme, '+')
    diff += [`--- /dev/null`, `+++ b/${readmePath}`, `@@ -0,0 +1,${readmeLines.length} @@`, ...readmeLines].join('\n') + '\n'
  }
  const catalogHash = digest(JSON.stringify([...input.catalog].map(item => ({ name: item.name, description: item.description })).sort((a, b) => a.name.localeCompare(b.name))))
  const proposal = { status: 'preview', kind: input.kind, skill: input.skill, path, baseHash: input.kind === 'create' ? null : digest(previous), nextHash: digest(next), readmePath, readmeHash: readme ? digest(readme) : undefined, catalogHash, lesson, rationale, confidence: input.confidence, uncertainty, validation, evidence, overlap: candidates, overlapReason, diff, limitations: ['Evidence assessments, confidence and independence are reviewer assertions, not verified facts or user authority.', 'Catalog and content snapshots are caller supplied; overlap is lexical, potentially incomplete and not verified against the filesystem.', 'Catalog changes and any other bundle updates require separately reviewed diffs and applicable approval.', 'Recheck source references and skill overlap through authorized tools; heuristic sensitive-content screening is incomplete.', 'This preview does not approve or apply any change.'] }
  const result = { ...proposal, proposalHash: digest(JSON.stringify(proposal)) }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32 * 1024) throw new Error('Proposal output exceeds 32 KiB')
  return result
}
