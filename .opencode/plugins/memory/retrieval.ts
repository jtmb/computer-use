import type { MemoryScope, ParsedNote } from "./format.ts"

export interface SearchableNote extends ParsedNote {
  scope: MemoryScope
  file: string
}

export interface RankedNote {
  note: SearchableNote
  score: number
  snippets: Array<{ text: string; line: number }>
  citationLine: number
}

export function tokenize(value: string): string[] {
  return value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? []
}

function frequencies(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  return counts
}

function boundedSnippet(text: string, line: number, terms: string[]): { text: string; line: number } {
  if (Buffer.byteLength(text, "utf8") <= 700) return { text, line }

  const codePoints = Array.from(text)
  const byteOffsets = [0]
  const charOffsets = new Map([[0, 0]])
  let charOffset = 0
  for (const [index, codePoint] of codePoints.entries()) {
    charOffset += codePoint.length
    byteOffsets.push(byteOffsets[index] + Buffer.byteLength(codePoint, "utf8"))
    charOffsets.set(charOffset, index + 1)
  }

  const wantedTerms = new Set(terms)
  const tokenPattern = /[\p{L}\p{N}]+/gu
  let anchorStart = 0
  let anchorEnd = Math.min(1, codePoints.length)
  for (const match of text.matchAll(tokenPattern)) {
    if (!wantedTerms.has(match[0].toLocaleLowerCase("en-US"))) continue
    const start = charOffsets.get(match.index)
    const end = charOffsets.get(match.index + match[0].length)
    if (start !== undefined && end !== undefined) {
      anchorStart = start
      anchorEnd = end
      break
    }
  }

  let start = anchorStart
  let end = anchorEnd
  const encodedSize = (from: number, to: number): number =>
    byteOffsets[to] - byteOffsets[from] + (from > 0 ? 3 : 0) + (to < codePoints.length ? 3 : 0)

  if (encodedSize(start, end) > 700) {
    const middle = Math.floor((start + end) / 2)
    anchorStart = middle
    anchorEnd = Math.min(codePoints.length, middle + 1)
    start = anchorStart
    end = anchorEnd
  }

  while (true) {
    const left = start > 0
    const right = end < codePoints.length
    if (!left && !right) break

    const leftContextBytes = byteOffsets[anchorStart] - byteOffsets[start]
    const rightContextBytes = byteOffsets[end] - byteOffsets[anchorEnd]
    const choices = leftContextBytes <= rightContextBytes ? ["left", "right"] : ["right", "left"]
    let expanded = false
    for (const choice of choices) {
      const nextStart = choice === "left" && left ? start - 1 : start
      const nextEnd = choice === "right" && right ? end + 1 : end
      if (nextStart === start && nextEnd === end) continue
      if (encodedSize(nextStart, nextEnd) > 700) continue
      start = nextStart
      end = nextEnd
      expanded = true
      break
    }
    if (!expanded) break
  }

  while (start < end && /\s/u.test(codePoints[start])) start += 1
  while (end > start && /\s/u.test(codePoints[end - 1])) end -= 1
  const excerpt = codePoints.slice(start, end).join("")
  const excerptLine = line + codePoints.slice(0, start).filter((codePoint) => codePoint === "\n").length
  return {
    text: `${start > 0 ? "…" : ""}${excerpt}${end < codePoints.length ? "…" : ""}`,
    line: excerptLine,
  }
}

function paragraphs(note: SearchableNote, terms: string[]): Array<{ text: string; line: number; relevance: number }> {
  const output: Array<{ text: string; line: number; relevance: number }> = []
  const lines = note.body.split("\n")
  let index = 0
  while (index < lines.length) {
    while (index < lines.length && lines[index].trim() === "") index += 1
    if (index >= lines.length) break
    const start = index
    while (index < lines.length && lines[index].trim() !== "") index += 1
    const text = lines.slice(start, index).join("\n").trim()
    const counts = frequencies(tokenize(text))
    const relevance = terms.reduce((score, term) => score + (counts.get(term) ?? 0), 0)
    output.push({ text, line: note.bodyStartLine + start, relevance })
  }
  return output
}

export function rankNotes(
  notes: SearchableNote[],
  query: string,
  options: { limit: number; repoFirst: boolean },
): RankedNote[] {
  const terms = [...new Set(tokenize(query))]
  if (terms.length === 0) throw new Error("query must include at least one letter or number")
  const vectors = notes.map((note) => {
    const body = frequencies(tokenize(note.body))
    const title = frequencies(tokenize(note.metadata.title))
    const tags = frequencies(note.metadata.tags.flatMap(tokenize))
    return { note, body, title, tags, all: new Set([...body.keys(), ...title.keys(), ...tags.keys()]), length: [...body.values()].reduce((sum, value) => sum + value, 0) }
  })
  const documentFrequency = new Map(terms.map((term) => [term, vectors.reduce((count, vector) => count + Number(vector.all.has(term)), 0)]))
  return vectors.map((vector) => {
    let score = 0
    for (const term of terms) {
      const frequency = documentFrequency.get(term) ?? 0
      const inverse = Math.log(1 + (vectors.length - frequency + 0.5) / (frequency + 0.5))
      const bodyCount = vector.body.get(term) ?? 0
      const lengthAdjustment = vector.length ? 1.2 * (1 - 0.75 + 0.75 * vector.length / 320) : 1
      const bodyScore = bodyCount ? inverse * ((bodyCount * 2.2) / (bodyCount + lengthAdjustment)) : 0
      score += bodyScore + inverse * ((vector.title.get(term) ?? 0) * 3.2 + (vector.tags.get(term) ?? 0) * 2.2)
    }
    const note = vector.note
    const bodyParagraphs = paragraphs(note, terms)
    const bodyMatches = bodyParagraphs.filter((paragraph) => paragraph.relevance > 0)
    const snippetCandidates = bodyMatches
      .sort((left, right) => right.relevance - left.relevance || left.line - right.line)
      .slice(0, 2)
      .map(({ text, line }) => boundedSnippet(text, line, terms))
    const leading = bodyParagraphs[0]
    // Historical query terms must not hide an explicitly labelled current decision.
    if (score > 0 && note.metadata.kind === "decision" && leading && /^current decision(?:\s|[:—-])/iu.test(leading.text)) {
      const contextSnippet = boundedSnippet(leading.text, leading.line, [])
      const matchingSnippet = snippetCandidates.find((snippet) => snippet.line !== contextSnippet.line || snippet.text !== contextSnippet.text)
      snippetCandidates.splice(0, snippetCandidates.length, contextSnippet, ...(matchingSnippet ? [matchingSnippet] : []))
    }
    const titleMatched = terms.some((term) => vector.title.has(term))
    const matchingTags = note.metadata.tags.filter((tag) => tokenize(tag).some((term) => terms.includes(term)))
    if (snippetCandidates.length === 0 && titleMatched) {
      snippetCandidates.push({ text: `Title: ${note.metadata.title}`, line: note.metadataLines.title })
    } else if (snippetCandidates.length === 0 && matchingTags.length > 0) {
      snippetCandidates.push({ text: `Tags: ${matchingTags.join(", ")}`, line: note.metadataLines.tags })
    }
    const citationLine = snippetCandidates[0]?.line ?? note.metadataLines.title
    return { note, score, snippets: snippetCandidates, citationLine }
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score ||
      (options.repoFirst ? Number(right.note.scope === "repo") - Number(left.note.scope === "repo") : 0) ||
      left.note.metadata.id.localeCompare(right.note.metadata.id) || left.note.file.localeCompare(right.note.file))
    .slice(0, options.limit)
    .map((entry) => ({ ...entry, score: Math.round(entry.score * 1000) / 1000 }))
}
