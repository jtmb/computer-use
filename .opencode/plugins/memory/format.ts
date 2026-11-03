import { createHash } from "node:crypto"
import path from "node:path"

// Frontmatter is a versioned contract rather than free-form Markdown: a note whose
// version or owner differs is treated as unmanaged and rejected, so unrelated files
// in the same directory are never adopted or overwritten by the memory plugin.
export const NOTE_VERSION = 1
export const NOTE_OWNER = "opencode-memory"
// Bounded so a single note can always be read and returned without pagination.
export const MAX_NOTE_BYTES = 8 * 1024

export type MemoryScope = "repo" | "global"
export type MemoryKind = "fact" | "preference" | "decision" | "workflow"

export interface NoteMetadata {
  version: 1
  owner: typeof NOTE_OWNER
  id: string
  scope: MemoryScope
  title: string
  tags: string[]
  kind: MemoryKind
  updated: string
  verified: string | null
  sources: string[]
}

export interface ParsedNote {
  metadata: NoteMetadata
  metadataLines: { title: number; tags: number; kind: number; sources: number }
  body: string
  bodyStartLine: number
  bytes: number
  revision: string
}

export interface NoteSpec {
  id: string
  title: string
  tags: string[]
  kind: MemoryKind
  body: string
  sources: string[]
  verified?: string | null
}

export class NoteFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NoteFormatError"
  }
}

export class UnsafeNoteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeNoteError"
  }
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

// The id doubles as the filename stem, so the slug alphabet excludes path
// separators and dot-only segments. "readme" is reserved for the directory index.
export function validId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value) && value.toLowerCase() !== "readme"
}

export function validTag(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

// Round-tripping through Date rejects syntactically valid but impossible dates
// such as 2026-02-31, which a bare regex would accept.
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Unknown keys are rejected rather than ignored: a note must not be able to
// smuggle extra fields past readers that only understand the current schema.
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index])
}

function validMetadata(value: unknown, expected: { id: string; scope: MemoryScope }): value is NoteMetadata {
  if (!object(value) || !exactKeys(value, ["version", "owner", "id", "scope", "title", "tags", "kind", "updated", "verified", "sources"])) return false
  return value.version === NOTE_VERSION && value.owner === NOTE_OWNER && value.id === expected.id && value.scope === expected.scope &&
    validId(value.id) && typeof value.title === "string" && value.title.trim().length > 0 && value.title.length <= 160 && !/[\r\n\0]/.test(value.title) &&
    Array.isArray(value.tags) && value.tags.length >= 1 && value.tags.length <= 16 && value.tags.every(validTag) &&
    typeof value.kind === "string" && ["fact", "preference", "decision", "workflow"].includes(value.kind) && validDate(value.updated) &&
    (value.verified === null || validDate(value.verified)) && Array.isArray(value.sources) && value.sources.length >= 1 &&
    value.sources.length <= 8 && value.sources.every((source) => typeof source === "string" && source.trim().length > 0 && source.length <= 240 && !/[\r\n\0]/.test(source))
}

/**
 * Parse a managed note and bind it to the path it was read from.
 *
 * `expected` is not a hint: a note whose embedded id or scope disagrees with its
 * location is rejected, which prevents a copied or renamed file from being
 * treated as authoritative for another topic or the wrong scope.
 */
export function parseNote(text: string, expected: { id: string; scope: MemoryScope }): ParsedNote {
  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes > MAX_NOTE_BYTES) throw new NoteFormatError(`note exceeds ${MAX_NOTE_BYTES} bytes`)
  const lines = text.split("\n")
  if (lines[0] !== "---") throw new NoteFormatError("note has no JSON frontmatter opener")
  const closing = lines.indexOf("---", 1)
  if (closing < 2) throw new NoteFormatError("note has no JSON frontmatter closer")
  const frontmatter = lines.slice(1, closing).join("\n")
  let decoded: unknown
  try {
    decoded = JSON.parse(frontmatter)
  } catch {
    throw new NoteFormatError("frontmatter is not valid JSON")
  }
  if (!validMetadata(decoded, expected)) throw new NoteFormatError("frontmatter is unsupported, unmanaged, or disagrees with its path")
  let bodyStartIndex = closing + 1
  while (lines[bodyStartIndex] === "") bodyStartIndex += 1
  const body = lines.slice(bodyStartIndex).join("\n").replace(/\n+$/, "")
  if (!body.trim() || body.includes("\0")) throw new NoteFormatError("note body is empty or contains NUL bytes")
  // Frontmatter is pretty-printed JSON, so keys normally start their own line.
  // Fall back to line 2 (the first frontmatter line) when the key was serialized
  // differently, keeping diagnostics line-anchored instead of returning -1.
  const metadataLine = (key: string): number => {
    const index = lines.findIndex((line, lineIndex) => lineIndex > 0 && lineIndex < closing && line.trimStart().startsWith(`"${key}"`))
    return index === -1 ? 2 : index + 1
  }
  return {
    metadata: decoded,
    metadataLines: {
      title: metadataLine("title"),
      tags: metadataLine("tags"),
      kind: metadataLine("kind"),
      sources: metadataLine("sources"),
    },
    body,
    bodyStartLine: bodyStartIndex + 1,
    bytes,
    revision: sha256(text),
  }
}

// Tags are deduplicated and sorted, and the body trimmed, so rewriting an
// unchanged note produces identical bytes and therefore an unchanged revision.
export function serializeNote(spec: NoteSpec, scope: MemoryScope, updated: string): string {
  const metadata: NoteMetadata = {
    version: NOTE_VERSION,
    owner: NOTE_OWNER,
    id: spec.id,
    scope,
    title: spec.title.trim(),
    tags: [...new Set(spec.tags)].sort(),
    kind: spec.kind,
    updated,
    verified: spec.verified ?? null,
    sources: spec.sources.map((source) => source.trim()),
  }
  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${spec.body.trim()}\n`
}

export function validateSpec(value: unknown): NoteSpec {
  if (!object(value)) throw new Error("remember requires a note object")
  if (!validId(value.id)) throw new Error("id must be a safe lowercase topic id")
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 160 || /[\r\n\0]/.test(value.title)) throw new Error("title must contain 1–160 single-line characters")
  if (!Array.isArray(value.tags) || value.tags.length < 1 || value.tags.length > 16 || !value.tags.every(validTag)) {
    throw new Error("tags must contain 1–16 lowercase tag slugs")
  }
  if (typeof value.kind !== "string" || !["fact", "preference", "decision", "workflow"].includes(value.kind)) throw new Error("kind must be fact, preference, decision, or workflow")
  if (typeof value.body !== "string" || !value.body.trim() || value.body.includes("\0")) throw new Error("body must not be empty or contain NUL bytes")
  if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 8 ||
    !value.sources.every((source) => typeof source === "string" && source.trim().length > 0 && source.length <= 240 && !/[\r\n\0]/.test(source))) {
    throw new Error("sources must contain 1–8 nonempty references of at most 240 characters")
  }
  if (value.verified !== undefined && value.verified !== null && !validDate(value.verified)) throw new Error("verified must be an ISO date or null")
  const spec: NoteSpec = {
    id: value.id,
    title: value.title,
    tags: [...new Set(value.tags)],
    kind: value.kind as MemoryKind,
    body: value.body,
    sources: value.sources,
    ...(value.verified !== undefined ? { verified: value.verified as string | null } : {}),
  }
  if (containsObviousSecret([
    spec.id,
    spec.title,
    ...spec.tags,
    spec.kind,
    spec.body,
    ...spec.sources,
    ...(spec.verified ? [spec.verified] : []),
  ].join("\n"))) {
    throw new Error("memory content appears to contain a credential; refusing to store it")
  }
  return spec
}

/**
 * Heuristic credential guard, not a secret scanner.
 *
 * It only needs to catch the common shapes that a model might paste into a note;
 * a false positive costs one rejected write, while a false negative would persist
 * a live credential into a Git-tracked file. Deliberately biased to refuse.
 */
export function containsObviousSecret(value: string): boolean {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|secret|authorization)\s*[:=]\s*\S{6,}/i,
    /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/i,
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  ]
  return patterns.some((pattern) => pattern.test(value))
}

export function noteContainsObviousSecret(note: Pick<ParsedNote, "metadata" | "body">): boolean {
  const metadataStrings = Object.values(note.metadata).flatMap((value) => {
    if (typeof value === "string") return [value]
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
    return []
  })
  return containsObviousSecret([...metadataStrings, note.body].join("\n"))
}

// Resolve then re-check the parent directory so a crafted id cannot escape the
// notes directory even if the id alphabet ever loosens.
export function notePath(notesDirectory: string, id: string): string {
  if (!validId(id)) throw new Error("id must be a safe lowercase topic id")
  const target = path.resolve(notesDirectory, `${id}.md`)
  if (path.dirname(target) !== path.resolve(notesDirectory)) throw new Error("topic id escapes the notes directory")
  return target
}
