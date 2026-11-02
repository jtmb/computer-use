/**
 * Codex-style persistent Code Mode runtime for the desktop and browser surfaces.
 *
 * Codex exposes one `js` tool backed by a long-lived Node REPL: top-level await,
 * bindings that survive between cells, and a small `cua` object API whose first
 * call returns the documentation. This module reproduces that interaction model
 * without a new backend: every API method calls the already-registered
 * `desktop.*` / `web.*` tool execution, so validation, permission assertions,
 * serialization, preview tokens and redaction stay single-sourced.
 *
 * The cell transform is a small tokenizer-assisted rewriter, not a JavaScript
 * parser. It hoists simple top-level `const`/`let`/`var` declarations (including
 * nested destructuring) so they survive between cells, and it refuses the
 * constructs it cannot preserve (top-level `import`, `export` and `class`)
 * rather than implying unrestricted REPL support. `vm` remains the compiler of
 * record for everything else.
 *
 * This is not a security boundary. A worker thread and a vm context are not
 * sandboxes, and the tool session already has shell authority. The worker is a
 * CPU/lifecycle boundary only: the main thread terminates it when a cell exceeds
 * its time budget, even if model code never yields. Backend calls, permissions,
 * serialization and credential handling stay on the main thread.
 */

import vm from "node:vm"
import { AsyncLocalStorage } from "node:async_hooks"
import { Worker } from "node:worker_threads"

// ---------------------------------------------------------------------------
// Cell transform
// ---------------------------------------------------------------------------

const DECLARATION_KEYWORDS = ["const", "let", "var"] as const
// A newline only starts a new statement when the previous token cannot continue
// an expression. Without this, `1\nconst x = 2` kept `const` unhoisted and the
// async wrapper silently dropped `x` after the cell.
const CONTINUATION_CHARS = new Set([
  "=", ",", "+", "-", "*", "/", "%", "&", "|", "^", "!", "?", ":", "<", ">", "(", "[", "{", ".", "~",
])
// `/` begins a regex literal in expression position, not after a value.
const REGEX_PREFIX_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await", "default", "extends",
])
const UNSUPPORTED_TOP_LEVEL: Readonly<Record<string, string>> = {
  import: "Top-level import is not supported in a cua cell; the module loader is unavailable.",
  export: "Top-level export is not supported in a cua cell; assign the value to a binding instead.",
  class: "Top-level class declarations do not persist between cells; assign the class to a const binding instead.",
}

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_$]/.test(ch)
}

function isIdent(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n"
}

function readWord(src: string, index: number): string {
  let end = index + 1
  while (isIdent(src[end])) end++
  return src.slice(index, end)
}

function isRegexStart(previous: string, previousWord: string): boolean {
  if (previous === "") return true
  if (/[A-Za-z0-9_$]/.test(previous)) return REGEX_PREFIX_KEYWORDS.has(previousWord)
  if (previous === ")" || previous === "]" || previous === "'" || previous === '"' || previous === "`") return false
  return true
}

function skipRegex(src: string, index: number): number {
  let i = index + 1
  let inClass = false
  while (i < src.length) {
    const ch = src[i]
    if (ch === "\\") {
      i += 2
      continue
    }
    // An unterminated literal is a source error; stop at the line end so the
    // compiler can report it instead of the scanner swallowing later lines.
    if (ch === "\n") return i
    if (ch === "[") inClass = true
    else if (ch === "]") inClass = false
    else if (ch === "/" && !inClass) {
      i++
      while (i < src.length && /[a-z]/i.test(src[i]!)) i++
      return i
    }
    i++
  }
  return i
}

function skipString(src: string, index: number): number {
  const quote = src[index]
  index++
  while (index < src.length) {
    if (src[index] === "\\") {
      index += 2
      continue
    }
    if (src[index] === quote) return index + 1
    index++
  }
  return index
}

function skipTemplate(src: string, index: number): number {
  index++
  while (index < src.length) {
    if (src[index] === "\\") {
      index += 2
      continue
    }
    if (src[index] === "`") return index + 1
    if (src[index] === "$" && src[index + 1] === "{") {
      index += 2
      let depth = 1
      while (index < src.length && depth > 0) {
        if (src[index] === "\\") {
          index += 2
          continue
        }
        if (src[index] === '"' || src[index] === "'") {
          index = skipString(src, index)
          continue
        }
        if (src[index] === "`") {
          index = skipTemplate(src, index)
          continue
        }
        if (src[index] === "{") depth++
        else if (src[index] === "}") depth--
        index++
      }
      continue
    }
    index++
  }
  return index
}

function topLevelIndex(text: string, target: string): number {
  let depth = 0
  let previous = ""
  let previousWord = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === "/" && text[i + 1] === "/") {
      const newline = text.indexOf("\n", i)
      i = (newline === -1 ? text.length : newline) - 1
      continue
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (ch === "/" && isRegexStart(previous, previousWord)) {
      i = skipRegex(text, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if (ch === '"' || ch === "'") {
      i = skipString(text, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if (ch === "`") {
      i = skipTemplate(text, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if ("([{".includes(ch)) {
      depth++
      previous = ch
      previousWord = ""
      continue
    }
    if (")]}".includes(ch)) {
      depth--
      previous = ch
      previousWord = ""
      continue
    }
    if (ch === target && depth === 0) {
      const before = text[i - 1] ?? ""
      const after = text[i + 1] ?? ""
      if (target === "=" && (after === "=" || after === ">" || "!<>+-*/%&|^".includes(before))) continue
      return i
    }
    if (isIdentStart(ch)) {
      previousWord = readWord(text, i)
      i += previousWord.length - 1
      previous = "x"
      continue
    }
    if (!isSpace(ch)) {
      previous = ch
      previousWord = ""
    }
  }
  return -1
}

/** Collect bound identifiers from a declaration pattern, including nesting. */
function bindingNames(pattern: string): string[] {
  const text = pattern.trim()
  if (!text) return []
  if (text[0] === "{" || text[0] === "[") {
    const close = text[0] === "{" ? "}" : "]"
    if (!text.endsWith(close)) return []
    const names: string[] = []
    for (const part of splitTopLevel(text.slice(1, -1))) {
      let candidate = part.trim()
      if (!candidate) continue
      if (candidate.startsWith("...")) candidate = candidate.slice(3).trim()
      // `key: target` / `key: target = default`; the key is not a binding.
      const colon = topLevelIndex(candidate, ":")
      if (colon !== -1 && !candidate.startsWith("[") && !candidate.startsWith("{")) {
        candidate = candidate.slice(colon + 1).trim()
      }
      const equals = topLevelIndex(candidate, "=")
      if (equals !== -1) candidate = candidate.slice(0, equals).trim()
      names.push(...bindingNames(candidate))
    }
    return names.filter(Boolean)
  }
  const match = text.match(/^[A-Za-z_$][\w$]*/)
  return match ? [match[0]] : []
}

function declarationEnd(src: string, from: number): number {
  let depth = 0
  let last = ""
  let previousWord = ""
  for (let i = from; i < src.length; i++) {
    const ch = src[i]!
    if (ch === "/" && src[i + 1] === "/") {
      const newline = src.indexOf("\n", i)
      if (newline === -1) return src.length
      i = newline - 1
      continue
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2)
      if (end === -1) return src.length
      i = end + 1
      continue
    }
    if (ch === "/" && isRegexStart(last, previousWord)) {
      i = skipRegex(src, i) - 1
      last = "x"
      previousWord = ""
      continue
    }
    if (ch === '"' || ch === "'") {
      i = skipString(src, i) - 1
      last = "x"
      previousWord = ""
      continue
    }
    if (ch === "`") {
      i = skipTemplate(src, i) - 1
      last = "x"
      previousWord = ""
      continue
    }
    if ("([{".includes(ch)) {
      depth++
      last = ch
      previousWord = ""
      continue
    }
    if (")]}".includes(ch)) {
      depth--
      last = ch
      previousWord = ""
      continue
    }
    if (depth === 0 && ch === ";") return i
    if (depth === 0 && ch === "\n") {
      if (CONTINUATION_CHARS.has(last)) continue
      const rest = src.slice(i + 1).trimStart()
      // A comment on the next line ends the statement; it is not a continuation.
      if (rest.startsWith("//") || rest.startsWith("/*")) return i
      if (/^[.+?[(/]|^[=<>!&|*%^-]/.test(rest)) continue
      return i
    }
    if (isIdentStart(ch)) {
      previousWord = readWord(src, i)
      i += previousWord.length - 1
      last = "x"
      continue
    }
    if (!isSpace(ch)) {
      last = ch
      previousWord = ""
    }
  }
  return src.length
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let previous = ""
  let previousWord = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === "/" && text[i + 1] === "/") {
      const newline = text.indexOf("\n", i)
      i = (newline === -1 ? text.length : newline) - 1
      continue
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (ch === "/" && isRegexStart(previous, previousWord)) {
      i = skipRegex(text, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if (ch === '"' || ch === "'") {
      i = skipString(text, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if (ch === "`") {
      i = skipTemplate(text, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if ("([{".includes(ch)) {
      depth++
      previous = ch
      previousWord = ""
      continue
    }
    if (")]}".includes(ch)) {
      depth--
      previous = ch
      previousWord = ""
      continue
    }
    if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
      continue
    }
    if (isIdentStart(ch)) {
      previousWord = readWord(text, i)
      i += previousWord.length - 1
      previous = "x"
      continue
    }
    if (!isSpace(ch)) {
      previous = ch
      previousWord = ""
    }
  }
  parts.push(text.slice(start))
  return parts
}

const STATEMENT_KEYWORDS = [
  "const", "let", "var", "if", "for", "while", "do", "switch", "try", "throw",
  "return", "function", "class", "import", "export", "break", "continue",
] as const

/** Start of the last top-level statement, when it looks like an expression. */
function lastExpressionStart(source: string): number | undefined {
  let depth = 0
  let start = 0
  let previous = ""
  let previousWord = ""
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!
    if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i)
      i = (newline === -1 ? source.length : newline) - 1
      continue
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2)
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (ch === "/" && isRegexStart(previous, previousWord)) {
      i = skipRegex(source, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if (ch === '"' || ch === "'") {
      i = skipString(source, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if (ch === "`") {
      i = skipTemplate(source, i) - 1
      previous = "x"
      previousWord = ""
      continue
    }
    if ("([{".includes(ch)) {
      depth++
      previous = ch
      previousWord = ""
      continue
    }
    if (")]}".includes(ch)) {
      depth--
      previous = ch
      previousWord = ""
      continue
    }
    if (depth === 0 && (ch === ";" || ch === "\n")) {
      start = i + 1
      previous = ch
      previousWord = ""
      continue
    }
    if (isIdentStart(ch)) {
      previousWord = readWord(source, i)
      i += previousWord.length - 1
      previous = "x"
      continue
    }
    if (!isSpace(ch)) {
      previous = ch
      previousWord = ""
    }
  }
  const segment = source.slice(start).trim()
  if (!segment) return undefined
  const first = segment.match(/^[A-Za-z_$]+/)?.[0] ?? segment[0]
  // `}`, `)` and `]` end a statement; `{` starts a block, not an object literal.
  if (!/^[A-Za-z_$0-9([`"'+\-!~/]/.test(segment)) return undefined
  if (segment.startsWith("{")) return undefined
  if (STATEMENT_KEYWORDS.includes(first as (typeof STATEMENT_KEYWORDS)[number])) return undefined
  const offset = source.slice(start).indexOf(segment)
  return start + offset
}

export interface TransformedCell {
  readonly code: string
  readonly hoisted: readonly string[]
  /** A construct this runtime deliberately refuses instead of mis-rewriting. */
  readonly unsupported?: string
}

/**
 * Rewrite top-level declarations into assignments to script-scoped bindings.
 *
 * `const x = await f()` becomes `let x;` plus `void (x = await f())` inside an
 * async wrapper, so the binding survives the cell and a later cell may reassign
 * or redeclare it. Declarations inside functions, blocks and loops are left
 * alone, which keeps their normal scope. `declared` is only read here; the
 * caller commits `hoisted` after the cell compiles, so a compile error cannot
 * poison later cells.
 */
export function transformCell(source: string, declared: ReadonlySet<string>): TransformedCell {
  const edits: Array<{ start: number; end: number; text: string }> = []
  const hoisted: string[] = []
  let depth = 0
  let previous = ""
  let previousWord = ""
  let statementStart = true
  let sawAwait = false
  let unsupported: string | undefined
  let i = 0

  while (i < source.length) {
    const ch = source[i]!
    if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i)
      i = newline === -1 ? source.length : newline
      continue
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    if (ch === "/" && isRegexStart(previous, previousWord)) {
      i = skipRegex(source, i)
      previous = "x"
      previousWord = ""
      statementStart = false
      continue
    }
    if (ch === '"' || ch === "'") {
      i = skipString(source, i)
      previous = "x"
      previousWord = ""
      statementStart = false
      continue
    }
    if (ch === "`") {
      i = skipTemplate(source, i)
      previous = "x"
      previousWord = ""
      statementStart = false
      continue
    }
    if (ch === "\n") {
      if (depth === 0) statementStart = !CONTINUATION_CHARS.has(previous)
      i++
      continue
    }
    if (isSpace(ch)) {
      i++
      continue
    }
    if (isIdentStart(ch)) {
      const word = readWord(source, i)
      if (word === "await") sawAwait = true
      if (depth === 0 && statementStart) {
        if (unsupported === undefined && UNSUPPORTED_TOP_LEVEL[word]) unsupported = UNSUPPORTED_TOP_LEVEL[word]
        if ((DECLARATION_KEYWORDS as readonly string[]).includes(word)) {
          const end = declarationEnd(source, i + word.length)
          const declaration = source.slice(i + word.length, end)
          if (/\bawait\b/.test(declaration)) sawAwait = true
          const rewritten = splitTopLevel(declaration).map((part) => {
            const equals = topLevelIndex(part, "=")
            const id = (equals === -1 ? part : part.slice(0, equals)).trim()
            const init = equals === -1 ? "undefined" : part.slice(equals + 1).trim()
            for (const name of bindingNames(id)) {
              if (!declared.has(name) && !hoisted.includes(name)) hoisted.push(name)
            }
            if (equals !== -1 && init === "") return `(${id} = )`
            return `(${id} = ${init || "undefined"})`
          })
          edits.push({ start: i, end, text: `void ${rewritten.join(", ")}` })
          i = end
          previous = ";"
          previousWord = ""
          statementStart = true
          continue
        }
      }
      previous = "x"
      previousWord = word
      statementStart = false
      i += word.length
      continue
    }
    if ("([{".includes(ch)) {
      depth++
      previous = ch
      previousWord = ""
      statementStart = false
      i++
      continue
    }
    if (")]}".includes(ch)) {
      depth--
      previous = ch
      previousWord = ""
      statementStart = depth === 0 && ch === "}"
      i++
      continue
    }
    if (ch === ";") {
      previous = ch
      previousWord = ""
      if (depth === 0) statementStart = true
      i++
      continue
    }
    previous = ch
    previousWord = ""
    statementStart = false
    i++
  }

  let code = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end)
  }
  const prefix = hoisted.length > 0 ? `let ${hoisted.join(", ")};\n` : ""
  if (unsupported !== undefined) return { code, hoisted, unsupported }
  if (sawAwait) {
    const tail = lastExpressionStart(code)
    if (tail !== undefined) {
      const expression = code.slice(tail).replace(/;\s*$/, "")
      // The newline keeps a trailing `// comment` from swallowing the `)`.
      code = `${code.slice(0, tail)}return (${expression}\n)`
    }
    return { code: `${prefix}(async () => {\n${code}\n})()`, hoisted }
  }
  return { code: prefix + code, hoisted }
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CuaCallContext {
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  readonly signal?: AbortSignal
}

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "file"; uri: string; mime: string; name: string }

export type ToolResult = { content?: ToolContent[] } | string | null | undefined

export type CuaToolCall = (
  key: string,
  input: Record<string, unknown>,
  context: CuaCallContext,
) => Promise<ToolResult>

export interface CuaRuntimeOptions {
  readonly call: CuaToolCall
  readonly maxOutputChars?: number
}

type EmittedFile = { type: "file"; uri: string; mime: string; name: string }

interface ParsedResult {
  readonly text: string
  readonly files: EmittedFile[]
}

function parseResult(result: ToolResult): ParsedResult {
  if (typeof result === "string") return { text: result, files: [] }
  if (!result || typeof result !== "object" || !Array.isArray(result.content)) {
    return { text: "", files: [] }
  }
  const texts: string[] = []
  const files: EmittedFile[] = []
  for (const part of result.content) {
    if (part.type === "text") texts.push(part.text)
    else files.push(part)
  }
  return { text: texts.join("\n"), files }
}

/** Errors thrown inside a vm cell come from another realm, so `instanceof` fails. */
function isErrorLike(value: unknown): value is { name?: unknown; message?: unknown; stack?: unknown } {
  return value instanceof Error || Object.prototype.toString.call(value) === "[object Error]"
}

function formatValue(value: unknown, limit = 25_000): string {
  if (typeof value === "string") return value
  if (isErrorLike(value)) {
    if (typeof value.stack === "string") return value.stack
    return `${String(value.name ?? "Error")}: ${String(value.message ?? value)}`
  }
  if (value === undefined) return "undefined"
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`
  // Bound the renderer before building a huge string: long strings, oversized
  // arrays and cycles are replaced inside the replacer, not after stringify.
  let budget = Math.max(limit, 1_000)
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, function (_key, item: unknown) {
      if (typeof item === "string") {
        const stored = item.length > budget ? `${item.slice(0, budget)}…` : item
        budget = Math.max(0, budget - stored.length)
        return stored
      }
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[circular]"
        seen.add(item)
        if (Array.isArray(item) && item.length > 200) {
          return [...item.slice(0, 200), `…${item.length - 200} more`]
        }
      }
      return item
    }, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function formatError(error: unknown): string {
  if (isErrorLike(error)) {
    if (typeof error.stack === "string" && error.stack.length > 0) return error.stack
    return `${String(error.name ?? "Error")}: ${String(error.message ?? error)}`
  }
  return `Uncaught ${formatValue(error)}`
}

function truncate(text: string, maximum: number): string {
  if (text.length <= maximum) return text
  return `${text.slice(0, maximum)}\n...[output truncated at ${maximum} characters]`
}

/** `instanceof Uint8Array` is false for an array created inside the vm realm. */
function isUint8ArrayValue(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array ||
    (ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]")
}

function dataUriLike(value: unknown): EmittedFile | undefined {
  if (typeof value === "string" && value.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(value)
    if (!match) return undefined
    return { type: "file", uri: value, mime: match[1]!, name: `image-${Date.now()}.png` }
  }
  if (isUint8ArrayValue(value)) {
    return {
      type: "file",
      uri: `data:image/png;base64,${Buffer.from(value).toString("base64")}`,
      mime: "image/png",
      name: `image-${Date.now()}.png`,
    }
  }
  return undefined
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Refuse options the backend would silently ignore. Coordinates and other made-up
 * fields must not look like they were applied.
 */
function restrictOptions(
  options: Record<string, unknown> | undefined,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  if (options === undefined) return {}
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error(`${label} expects an options object.`)
  }
  const unknown = Object.keys(options).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new Error(
      `${label}: unsupported option(s) ${unknown.join(", ")}. Allowed: ${allowed.join(", ")}. ` +
      "Select elements by name/role/nth; coordinates are not supported.",
    )
  }
  return { ...options }
}

const MAX_FILES_PER_CELL = 8
// A browser screenshot is capped at 8 MiB; its base64 form is about 11 MiB.
const MAX_FILE_URI_CHARS = 12_000_000

// ---------------------------------------------------------------------------
// One session: main-thread worker client
// ---------------------------------------------------------------------------

export interface CellResult {
  readonly text: string
  readonly files: EmittedFile[]
}

interface WorkerCellResult {
  readonly text: string
  readonly files: EmittedFile[]
}

type JsonOutcome = { readonly ok: boolean; readonly value?: unknown; readonly error?: string }

interface CellState {
  readonly context: CuaCallContext
  readonly controller: AbortController
  readonly signal: AbortSignal
  readonly output: string[]
  readonly files: EmittedFile[]
  outputChars: number
  truncated: boolean
  droppedFiles: number
  stale: boolean
  /** Final cancellation/timeout note, kept even after dispose hides writes. */
  terminal?: string
  cleanupParent?: () => void
  cleanupAbort?: () => void
  cellId: number
  epoch: number
  settled: boolean
  outstanding: number
  resolve: (result: WorkerCellResult) => void
  watchdog?: ReturnType<typeof setTimeout>
}

/** Messages the main thread sends to one worker. */
export type CuaWorkerInbound =
  | { type: "cell"; cellId: number; epoch: number; code: string }
  | { type: "idle-check"; checkId: number }
  | { type: "backend-result"; requestId: number; ok: boolean; text?: string; files?: EmittedFile[]; error?: string }

/** Messages one worker sends to the main thread. */
export type CuaWorkerOutbound =
  | { type: "ready" }
  | { type: "idle-ready"; checkId: number }
  | { type: "backend-call"; requestId: number; cellId: number; epoch: number; key: string; input: Record<string, unknown> }
  | { type: "cell-result"; cellId: number; epoch: number; text: string; files: EmittedFile[] }

/** Only these registered tool keys are reachable from model code. */
const CUA_BACKEND_KEYS: ReadonlySet<string> = new Set([
  "desktop:apps",
  "desktop:windows",
  "desktop:tree",
  "desktop:find",
  "desktop:act",
  "desktop:capture",
  "desktop:window_act",
  "web:open",
  "web:tabs",
  "web:navigate",
  "web:snapshot",
  "web:act",
  "web:screenshot",
  "web:close",
])

// The worker is the CPU boundary, not a security boundary. These caps keep one
// session from flooding the main thread or the worker inbox; they are not an
// isolation claim.
const MAX_OUTSTANDING_BACKEND_CALLS = 4
const MAX_RPC_INPUT_CHARS = 100_000
const MAX_BACKEND_RESULT_CHARS = 2_000_000
const WORKER_START_TIMEOUT_MS = 5_000
const WORKER_IDLE_CHECK_MS = 1_000
const WORKER_HEAP_MB = 256
const WORKER_YOUNG_MB = 32
const WORKER_STACK_MB = 4
const MAX_CELL_CODE_CHARS = 1_000_000

function workerEntryURL(): URL {
  // Keep the worker beside whichever form the host loaded: source `.ts` and a
  // compiled `.js`/`.mjs` deployment both resolve to a sibling with that suffix.
  const extension = /(\.[^./]+)$/.exec(new URL(import.meta.url).pathname)?.[1] ?? ".ts"
  return new URL(`./cua-worker${extension}`, import.meta.url)
}

function workerExecArgv(): string[] {
  const args: string[] = []
  for (let index = 0; index < process.execArgv.length; index++) {
    const argument = process.execArgv[index]!
    if (argument === "--test" || argument.startsWith("--test-")) continue
    if (argument === "--input-type") {
      index++
      continue
    }
    if (argument.startsWith("--input-type=")) continue
    args.push(argument)
  }
  return args
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isEmittedFile(value: unknown): value is EmittedFile {
  return isRecord(value) &&
    value.type === "file" &&
    typeof value.uri === "string" &&
    typeof value.mime === "string" &&
    typeof value.name === "string"
}

function validFiles(value: unknown): EmittedFile[] {
  return Array.isArray(value) ? value.filter(isEmittedFile) : []
}

function serializedSize(value: unknown): number | undefined {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return undefined
  }
}

/**
 * Main-thread half of one persistent Code Mode session.
 *
 * It owns the registered backend callback, the real cell context, permissions,
 * serialization and attachments. Model code and its bindings live in a worker
 * thread; the worker can only ask this object to run allowlisted backend tools.
 * The watchdog terminates the worker even when user code never yields, so a
 * synchronous loop cannot occupy the main event loop.
 */
export class CuaSession {
  readonly #call: CuaToolCall
  readonly #maxOutput: number
  #cell: CellState | undefined
  #disposed = false
  // Bumped by reset/dispose/worker loss so queued cells cannot start afterwards.
  #epoch = 0
  #firstCell = true
  #tail: Promise<void> = Promise.resolve()
  #worker: Worker | undefined
  #starting: Promise<Worker> | undefined
  #ready: {
    readonly worker: Worker
    readonly resolve: (worker: Worker) => void
    readonly reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | undefined
  #cellSequence = 0
  #idleSequence = 0
  #idleCheck: { checkId: number; timer: ReturnType<typeof setTimeout> } | undefined
  #lossNotice: string | undefined

  constructor(options: CuaRuntimeOptions) {
    this.#call = options.call
    this.#maxOutput = options.maxOutputChars ?? 25_000
    this.reset()
  }

  reset(): void {
    if (this.#disposed) throw new Error("cua session was disposed and cannot be reset.")
    this.#epoch++
    this.#firstCell = true
    this.#lossNotice = undefined
    const cell = this.#cell
    if (cell) this.#settleCell(cell, "cua session was reset; this cell was stopped and bindings were cleared.")
    this.#stopWorker()
    this.#cell = undefined
  }

  /** Stop all queued and running work. The session cannot be reused afterwards. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#epoch++
    const cell = this.#cell
    if (cell) this.#settleCell(cell, "Cell cancelled; its later work was refused. Bindings were cleared.")
    this.#stopWorker()
    this.#cell = undefined
  }

  #settleCell(cell: CellState, terminal?: string): void {
    if (cell.settled) return
    cell.settled = true
    if (cell.watchdog !== undefined) {
      clearTimeout(cell.watchdog)
      cell.watchdog = undefined
    }
    if (terminal !== undefined) cell.terminal = terminal
    this.#invalidate(cell)
    cell.resolve({ text: "", files: [] })
  }

  #invalidate(cell: CellState): void {
    cell.stale = true
    cell.controller.abort()
  }

  #bumpAfterLoss(): void {
    this.#epoch++
    // Bindings died with the worker; do not replay the first-cell manual.
    this.#firstCell = false
  }

  #stopWorker(): void {
    this.#clearIdleCheck()
    const worker = this.#worker
    this.#worker = undefined
    const ready = this.#ready
    if (ready) {
      this.#ready = undefined
      clearTimeout(ready.timer)
      ready.reject(new Error("cua worker was stopped before it became ready."))
    }
    if (worker) void worker.terminate().catch(() => {})
  }

  #clearIdleCheck(): void {
    if (this.#idleCheck) clearTimeout(this.#idleCheck.timer)
    this.#idleCheck = undefined
  }

  #checkIdle(worker: Worker): void {
    this.#clearIdleCheck()
    const checkId = ++this.#idleSequence
    // Posting a result does not prove the worker yielded: a dangling promise can
    // start an infinite microtask immediately afterwards, outside a cell timer.
    const timer = setTimeout(() => {
      if (this.#worker !== worker || this.#idleCheck?.checkId !== checkId) return
      this.#onWorkerFailure(worker, new Error("worker did not yield after the completed cell"))
      void worker.terminate().catch(() => {})
    }, WORKER_IDLE_CHECK_MS)
    timer.unref()
    this.#idleCheck = { checkId, timer }
    worker.postMessage({ type: "idle-check", checkId } satisfies CuaWorkerInbound)
  }

  #spawnWorker(): Worker {
    const worker = new Worker(workerEntryURL(), {
      name: "cua-session",
      workerData: { maxOutputChars: this.#maxOutput },
      // A CPU/lifecycle boundary, not a security sandbox. The limit is a
      // guardrail against runaway allocation, not a capability restriction.
      resourceLimits: {
        maxOldGenerationSizeMb: WORKER_HEAP_MB,
        maxYoungGenerationSizeMb: WORKER_YOUNG_MB,
        stackSizeMb: WORKER_STACK_MB,
      },
      // `--test` belongs to the runner and `--input-type` to the eval entry,
      // not to a worker file. Other flags (type stripping, loaders) inherit.
      execArgv: workerExecArgv(),
    })
    // Idle workers must not keep the test runner or plugin host alive.
    worker.unref()
    worker.on("message", (message: unknown) => this.#onMessage(worker, message))
    worker.on("error", (error: Error) => this.#onWorkerFailure(worker, error))
    worker.on("exit", (code: number) => {
      if (this.#worker === worker) {
        this.#onWorkerFailure(worker, new Error(`cua worker exited with code ${code}`))
      }
    })
    return worker
  }

  async #ensureWorker(epoch: number): Promise<Worker> {
    this.#assertUsable(epoch)
    if (this.#worker) {
      this.#worker.ref()
      return this.#worker
    }
    if (this.#starting) {
      const worker = await this.#starting
      this.#assertUsable(epoch)
      return worker
    }
    let worker: Worker
    try {
      worker = this.#spawnWorker()
    } catch (error) {
      throw new Error(`cua worker could not be started: ${formatError(error)}`)
    }
    this.#worker = worker
    const ready = new Promise<Worker>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#failReady(new Error(`cua worker did not become ready within ${WORKER_START_TIMEOUT_MS} ms.`))
      }, WORKER_START_TIMEOUT_MS)
      this.#ready = { worker, resolve, reject, timer }
    })
    this.#starting = ready
    try {
      const started = await ready
      this.#assertUsable(epoch)
      return started
    } finally {
      if (this.#starting === ready) this.#starting = undefined
    }
  }

  #failReady(error: Error): void {
    const ready = this.#ready
    if (!ready) return
    this.#ready = undefined
    clearTimeout(ready.timer)
    if (this.#worker === ready.worker) this.#worker = undefined
    void ready.worker.terminate().catch(() => {})
    ready.reject(error)
  }

  #onWorkerFailure(worker: Worker, error: Error): void {
    if (this.#worker !== worker) return
    this.#clearIdleCheck()
    this.#worker = undefined
    const ready = this.#ready
    if (ready?.worker === worker) {
      this.#ready = undefined
      clearTimeout(ready.timer)
      ready.reject(error)
    }
    const cell = this.#cell
    if (cell && !cell.settled) {
      this.#settleCell(
        cell,
        `cua worker stopped unexpectedly (${truncate(error.message, 300)}). ` +
        "Bindings were cleared; bind apps/tabs again before retrying.",
      )
    } else {
      this.#lossNotice = `The previous worker stopped between cells (${truncate(error.message, 300)}). Bindings were cleared; bind apps/tabs again.`
    }
    this.#bumpAfterLoss()
  }

  #timeoutCell(cell: CellState, timeoutMs: number): void {
    if (cell.settled) return
    this.#settleCell(
      cell,
      `Cell timed out after ${timeoutMs} ms. The worker was stopped and bindings were cleared; ` +
      "observe fresh state before retrying.",
    )
    this.#stopWorker()
    this.#bumpAfterLoss()
  }

  #cancelCell(cell: CellState): void {
    if (cell.settled) return
    this.#settleCell(
      cell,
      "Cell cancelled; the worker was stopped, its later work was refused, and bindings were cleared.",
    )
    this.#stopWorker()
    this.#bumpAfterLoss()
  }

  #onMessage(worker: Worker, message: unknown): void {
    if (this.#worker !== worker || !isRecord(message) || typeof message.type !== "string") return
    if (message.type === "ready") {
      const ready = this.#ready
      if (!ready || ready.worker !== worker) return
      this.#ready = undefined
      clearTimeout(ready.timer)
      ready.resolve(worker)
      worker.unref()
      return
    }
    if (message.type === "backend-call") {
      this.#onBackendCall(worker, message)
      return
    }
    if (message.type === "idle-ready") {
      if (message.checkId === this.#idleCheck?.checkId) this.#clearIdleCheck()
      return
    }
    if (message.type === "cell-result") {
      const cell = this.#cell
      if (!cell || cell.settled || cell.cellId !== message.cellId || cell.epoch !== message.epoch) return
      cell.settled = true
      if (cell.watchdog !== undefined) {
        clearTimeout(cell.watchdog)
        cell.watchdog = undefined
      }
      const text = typeof message.text === "string" ? message.text.slice(0, this.#maxOutput) : ""
      cell.resolve({
        text,
        files: validFiles(message.files).slice(0, MAX_FILES_PER_CELL),
      })
      this.#checkIdle(worker)
    }
  }

  #onBackendCall(worker: Worker, message: Record<string, unknown>): void {
    const requestId = message.requestId
    if (!Number.isSafeInteger(requestId)) return
    const cell = this.#cell
    const current = cell !== undefined &&
      !cell.settled &&
      !cell.stale &&
      cell.cellId === message.cellId &&
      cell.epoch === message.epoch
    if (!current) {
      // A late call from an older cell is ignored; only a reply can reach the
      // worker's already-rejected promise, and the worker ignores unknown IDs.
      this.#reply(worker, { type: "backend-result", requestId: requestId as number, ok: false, error: "This cua cell is no longer active." })
      return
    }
    if (typeof message.key !== "string" || !CUA_BACKEND_KEYS.has(message.key) || !isRecord(message.input)) {
      this.#reply(worker, { type: "backend-result", requestId: requestId as number, ok: false, error: "cua runtime refused an unavailable backend call." })
      return
    }
    if (cell.outstanding >= MAX_OUTSTANDING_BACKEND_CALLS) {
      this.#reply(worker, { type: "backend-result", requestId: requestId as number, ok: false, error: "cua runtime refused too many outstanding backend calls." })
      return
    }
    const size = serializedSize(message.input)
    if (size === undefined || size > MAX_RPC_INPUT_CHARS) {
      this.#reply(worker, { type: "backend-result", requestId: requestId as number, ok: false, error: "cua runtime refused an oversized backend request." })
      return
    }
    cell.outstanding++
    let pending: Promise<ToolResult>
    try {
      pending = this.#call(message.key, message.input, cell.context)
    } catch (error) {
      cell.outstanding = Math.max(0, cell.outstanding - 1)
      this.#reply(worker, {
        type: "backend-result",
        requestId: requestId as number,
        ok: false,
        error: truncate(formatError(error), 4_000),
      })
      return
    }
    pending
      .then((result) => {
        if (this.#cell !== cell || cell.stale || cell.settled || this.#disposed) return
        const parsed = parseResult(result)
        if (parsed.text.length > MAX_BACKEND_RESULT_CHARS) {
          this.#reply(worker, { type: "backend-result", requestId: requestId as number, ok: false, error: "Backend result exceeded the cua message budget." })
          return
        }
        const files = parsed.files.slice(0, MAX_FILES_PER_CELL).filter((file) => file.uri.length <= MAX_FILE_URI_CHARS)
        this.#reply(worker, { type: "backend-result", requestId: requestId as number, ok: true, text: parsed.text, files })
      }, (error: unknown) => {
        if (this.#cell !== cell || cell.stale || cell.settled || this.#disposed) return
        this.#reply(worker, {
          type: "backend-result",
          requestId: requestId as number,
          ok: false,
          error: truncate(formatError(error), 4_000),
        })
      })
      .finally(() => {
        cell.outstanding = Math.max(0, cell.outstanding - 1)
      })
  }

  #reply(worker: Worker, message: CuaWorkerInbound & { type: "backend-result" }): void {
    if (this.#worker !== worker) return
    try {
      worker.postMessage(message)
    } catch {
      // The worker already exited; its pending call is gone with it.
    }
  }

  #assertUsable(epoch: number): void {
    if (this.#disposed) throw new Error("cua session was disposed; this cell did not run.")
    if (epoch !== this.#epoch) throw new Error("cua session was reset; this cell did not run.")
  }

  #write(cell: CellState, text: string): void {
    // Output is per cell, so a late writer from an older cell cannot reach a
    // newer result. The cap is applied before the string is appended.
    if (this.#cell !== cell || cell.stale || text.length === 0) return
    const remaining = this.#maxOutput - cell.outputChars
    if (remaining <= 0) {
      cell.truncated = true
      return
    }
    const stored = text.length > remaining ? text.slice(0, remaining) : text
    cell.output.push(stored)
    cell.outputChars += stored.length
    if (stored.length < text.length) cell.truncated = true
  }

  #addFile(cell: CellState, file: EmittedFile): void {
    if (this.#cell !== cell || cell.stale) return
    if (cell.files.length >= MAX_FILES_PER_CELL || file.uri.length > MAX_FILE_URI_CHARS) {
      cell.droppedFiles++
      return
    }
    cell.files.push(file)
  }

  execute(code: string, context: CuaCallContext, timeoutMs = 30_000): Promise<CellResult> {
    const epoch = this.#epoch
    // Cells in one session are serialized: a second cell waits for the first to
    // settle. The captured epoch makes reset/dispose cancel the queue.
    const run = this.#tail.then(
      () => this.#runCell(code, context, timeoutMs, epoch),
      () => this.#runCell(code, context, timeoutMs, epoch),
    )
    this.#tail = run.then(() => undefined, () => undefined)
    return run
  }

  async #runCell(
    code: string,
    context: CuaCallContext,
    timeoutMs: number,
    epoch: number,
  ): Promise<CellResult> {
    this.#assertUsable(epoch)
    this.#clearIdleCheck()
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_CELL_CODE_CHARS) {
      throw new Error("cua runtime refused an invalid or oversized cell.")
    }
    if (this.#cell) throw new Error("cua runtime refused an overlapping cell; cells are serialized.")
    const mainCell = this.#startCell(context)
    const boundedTimeout = Math.min(Math.max(timeoutMs, 1_000), 120_000)
    try {
      if (this.#firstCell) {
        this.#write(mainCell, CUA_MANUAL)
        this.#firstCell = false
      }
      if (this.#lossNotice) {
        this.#write(mainCell, this.#lossNotice)
        this.#lossNotice = undefined
      }
      if (mainCell.signal.aborted) throw new Error("Cell cancelled before it started.")
      const worker = await this.#ensureWorker(epoch)
      if (mainCell.signal.aborted || (this.#cell as CellState | undefined) !== mainCell) throw new Error("Cell cancelled before it started.")
      mainCell.cellId = ++this.#cellSequence
      mainCell.epoch = epoch
      worker.ref()
      const result = await new Promise<WorkerCellResult>((resolve) => {
        mainCell.resolve = resolve
        mainCell.watchdog = setTimeout(() => this.#timeoutCell(mainCell, boundedTimeout), boundedTimeout)
        const onAbort = () => this.#cancelCell(mainCell)
        mainCell.cleanupAbort = () => mainCell.signal.removeEventListener("abort", onAbort)
        mainCell.signal.addEventListener("abort", onAbort, { once: true })
        try {
          worker.postMessage({
            type: "cell",
            cellId: mainCell.cellId,
            epoch,
            code,
          } satisfies CuaWorkerInbound)
        } catch (error) {
          this.#settleCell(mainCell, `cua worker refused the mainCell: ${truncate(formatError(error), 500)}`)
        }
      })
      if (!mainCell.stale && (this.#cell as CellState | undefined) === mainCell) {
        this.#write(mainCell, result.text)
        for (const file of result.files) this.#addFile(mainCell, file)
      }
    } catch (error) {
      this.#reportError(mainCell, error)
    } finally {
      mainCell.cleanupAbort?.()
      mainCell.cleanupParent?.()
      if (mainCell.watchdog !== undefined) {
        clearTimeout(mainCell.watchdog)
        mainCell.watchdog = undefined
      }
      this.#invalidate(mainCell)
      if ((this.#cell as CellState | undefined) === mainCell) this.#cell = undefined
      this.#worker?.unref()
    }
    const joined = mainCell.output.join("\n")
    const complete = mainCell.terminal && !joined.endsWith(mainCell.terminal)
      ? (joined.length > 0 ? `${joined}\n${mainCell.terminal}` : mainCell.terminal)
      : joined
    const text = truncate(complete, this.#maxOutput)
    if (mainCell.droppedFiles > 0) {
      return { text: `${text}\n...[${mainCell.droppedFiles} image(s) dropped: attachment limit]`, files: mainCell.files.slice() }
    }
    return { text, files: mainCell.files.slice() }
  }

  #startCell(context: CuaCallContext): CellState {
    const controller = new AbortController()
    const parent = context.signal
    const onParentAbort = () => controller.abort()
    if (parent) {
      if (parent.aborted) controller.abort()
      else parent.addEventListener("abort", onParentAbort, { once: true })
    }
    const cell: CellState = {
      context: Object.freeze({ ...context, signal: controller.signal }),
      controller,
      signal: controller.signal,
      output: [],
      files: [],
      outputChars: 0,
      truncated: false,
      droppedFiles: 0,
      stale: false,
      cellId: 0,
      epoch: 0,
      settled: false,
      outstanding: 0,
      resolve: () => {},
      cleanupParent: parent ? () => parent.removeEventListener("abort", onParentAbort) : undefined,
    }
    this.#cell = cell
    return cell
  }

  #reportError(cell: CellState, error: unknown): void {
    if (cell.settled) return
    if (cell.signal.aborted) {
      cell.terminal = "Cell cancelled; its later work was refused."
      this.#settleCell(cell)
      return
    }
    cell.terminal = formatError(error)
    this.#settleCell(cell)
  }
}

// ---------------------------------------------------------------------------
// Worker-side runtime: owns the persistent vm context, bindings and API handles.
// ---------------------------------------------------------------------------

interface WorkerCellState {
  readonly id: number
  readonly epoch: number
  readonly output: string[]
  readonly files: EmittedFile[]
  outputChars: number
  truncated: boolean
  droppedFiles: number
  stale: boolean
}

interface PendingCall {
  readonly cell: WorkerCellState
  readonly resolve: (result: ParsedResult) => void
  readonly reject: (error: Error) => void
}

/**
 * Worker-thread half: model code, bindings and object handles. It has no access
 * to the backend callback; every tool request is posted to the main thread as an
 * allowlisted RPC and attributed there to the real immutable cell context.
 */
export class CuaWorkerRuntime {
  readonly #post: (message: CuaWorkerOutbound) => void
  readonly #maxOutput: number
  readonly #context: vm.Context
  readonly #execution = new AsyncLocalStorage<WorkerCellState>()
  #declared = new Set<string>()
  #cell: WorkerCellState | undefined
  #cells = 0
  #requestSequence = 0
  readonly #pending = new Map<number, PendingCall>()

  constructor(options: { post: (message: CuaWorkerOutbound) => void; maxOutputChars: number }) {
    this.#post = options.post
    this.#maxOutput = options.maxOutputChars
    const runtime = this
    const sandbox: Record<string, unknown> = {}
    sandbox.cua = this.#buildApi()
    sandbox.nodeRepl = {
      write(value: unknown) {
        runtime.#writeActive(formatValue(value, runtime.#maxOutput))
      },
      async emitImage(value: unknown) {
        const file = dataUriLike(value)
        if (file) runtime.#addActiveFile(file)
        else runtime.#writeActive("emitImage expects a data URI, Uint8Array, or Buffer")
      },
    }
    sandbox.console = {
      log: (...values: unknown[]) => runtime.#writeActive(values.map((item) => formatValue(item, runtime.#maxOutput)).join(" ")),
      info: (...values: unknown[]) => runtime.#writeActive(values.map((item) => formatValue(item, runtime.#maxOutput)).join(" ")),
      warn: (...values: unknown[]) => runtime.#writeActive(values.map((item) => formatValue(item, runtime.#maxOutput)).join(" ")),
      error: (...values: unknown[]) => runtime.#writeActive(values.map((item) => formatValue(item, runtime.#maxOutput)).join(" ")),
    }
    // No process, require, fetch or module loader is placed in this context.
    this.#context = vm.createContext(sandbox, {
      name: "cua-session",
      codeGeneration: { strings: false, wasm: false },
    })
  }

  async runCell(request: { cellId: number; epoch: number; code: string }): Promise<void> {
    if (this.#cell) {
      this.#post({
        type: "cell-result",
        cellId: request.cellId,
        epoch: request.epoch,
        text: "cua worker refused an overlapping cell.",
        files: [],
      })
      return
    }
    const cell: WorkerCellState = {
      id: request.cellId,
      epoch: request.epoch,
      output: [],
      files: [],
      outputChars: 0,
      truncated: false,
      droppedFiles: 0,
      stale: false,
    }
    this.#cell = cell
    try {
      const transformed = transformCell(request.code, this.#declared)
      if (transformed.unsupported) throw new Error(transformed.unsupported)
      this.#cells++
      const script = new vm.Script(transformed.code, {
        filename: `cua-cell-${this.#cells}.js`,
      })
      // Commit only after compilation: a failed cell must not mark a binding as
      // already declared for later cells.
      for (const name of transformed.hoisted) this.#declared.add(name)
      // Deliberately no native vm timeout and no microtask pump. The main-thread
      // watchdog owns the hard CPU boundary; a vm timeout under ALS crashed
      // Node 22.22.2 when the script resumed after await.
      let value: unknown = this.#execution.run(cell, () => script.runInContext(this.#context, {
        displayErrors: true,
      }))
      if (value && typeof (value as { then?: unknown }).then === "function") {
        value = await value
      }
      this.#writeValue(cell, value)
    } catch (error) {
      this.#write(cell, formatError(error))
    } finally {
      if (this.#cell === cell) this.#cell = undefined
      for (const [requestId, entry] of [...this.#pending]) {
        if (entry.cell !== cell) continue
        this.#pending.delete(requestId)
        entry.reject(new Error("This cua cell finished before the backend call returned."))
      }
    }
    this.#post({
      type: "cell-result",
      cellId: cell.id,
      epoch: cell.epoch,
      text: truncate(cell.output.join("\n"), this.#maxOutput),
      files: cell.files.slice(),
    })
  }

  handleBackendResult(message: { requestId: number; ok: boolean; text?: string; files?: EmittedFile[]; error?: string }): void {
    const entry = this.#pending.get(message.requestId)
    if (!entry) return
    this.#pending.delete(message.requestId)
    if (this.#cell !== entry.cell || entry.cell.stale) {
      entry.reject(new Error("This cua cell is no longer active."))
      return
    }
    if (!message.ok) {
      entry.reject(new Error(message.error ?? "Backend call failed."))
      return
    }
    const files = validFiles(message.files)
    for (const file of files) this.#addFile(entry.cell, file)
    entry.resolve({ text: typeof message.text === "string" ? message.text : "", files })
  }

  #activeCell(): WorkerCellState {
    const cell = this.#execution.getStore()
    if (!cell || this.#cell !== cell || cell.stale) {
      throw new Error(
        "cua API calls are only valid inside the cell that started them; " +
        "this handle came from a finished, reset or timed-out cell.",
      )
    }
    return cell
  }

  #assertCell(cell: WorkerCellState): void {
    if (this.#cell !== cell || cell.stale) {
      throw new Error("This cua handle belongs to a finished cell; start the work again in the current cell.")
    }
  }

  #write(cell: WorkerCellState, text: string): void {
    if (this.#cell !== cell || cell.stale || text.length === 0) return
    const remaining = this.#maxOutput - cell.outputChars
    if (remaining <= 0) {
      cell.truncated = true
      return
    }
    const stored = text.length > remaining ? text.slice(0, remaining) : text
    cell.output.push(stored)
    cell.outputChars += stored.length
    if (stored.length < text.length) cell.truncated = true
  }

  #writeActive(text: string): void {
    const cell = this.#execution.getStore()
    if (cell) this.#write(cell, text)
  }

  #addFile(cell: WorkerCellState, file: EmittedFile): void {
    if (this.#cell !== cell || cell.stale) return
    if (cell.files.length >= MAX_FILES_PER_CELL || file.uri.length > MAX_FILE_URI_CHARS) {
      cell.droppedFiles++
      return
    }
    cell.files.push(file)
  }

  #addActiveFile(file: EmittedFile): void {
    const cell = this.#execution.getStore()
    if (cell) this.#addFile(cell, file)
  }

  #show(cell: WorkerCellState, parsed: ParsedResult): string {
    this.#write(cell, parsed.text)
    return parsed.text
  }

  async #tool(cell: WorkerCellState, key: string, input: Record<string, unknown>): Promise<ParsedResult> {
    this.#assertCell(cell)
    const size = serializedSize(input)
    if (size === undefined || size > MAX_RPC_INPUT_CHARS) {
      throw new Error("cua runtime refused an oversized backend request.")
    }
    if (this.#pending.size >= MAX_OUTSTANDING_BACKEND_CALLS) {
      throw new Error("cua runtime refused too many outstanding backend calls.")
    }
    const requestId = ++this.#requestSequence
    const result = await new Promise<ParsedResult>((resolve, reject) => {
      this.#pending.set(requestId, { cell, resolve, reject })
      try {
        this.#post({ type: "backend-call", requestId, cellId: cell.id, epoch: cell.epoch, key, input })
      } catch (error) {
        this.#pending.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    this.#assertCell(cell)
    return result
  }

  async #json(cell: WorkerCellState, key: string, input: Record<string, unknown>): Promise<JsonOutcome> {
    const parsed = await this.#tool(cell, key, input)
    try {
      return { ok: true, value: JSON.parse(parsed.text) as unknown }
    } catch {
      return { ok: false, error: parsed.text }
    }
  }

  #writeValue(cell: WorkerCellState, value: unknown): void {
    if (value === undefined) return
    const file = dataUriLike(value)
    if (file) {
      this.#addFile(cell, file)
      return
    }
    const rendered = formatValue(value, this.#maxOutput)
    if (rendered !== cell.output[cell.output.length - 1]) this.#write(cell, rendered)
  }

  /** Build the object graph exposed to model-authored code. */
  #buildApi(): Record<string, unknown> {
    const runtime = this
    const api: Record<string, unknown> = {}

    const APP_TREE_OPTIONS = ["maxDepth", "maxNodes", "all", "includeText"] as const
    const APP_MATCH_OPTIONS = ["name", "exactName", "role", "showing", "nth", "maxDepth", "maxNodes", "includeText"] as const
    const APP_ACT_OPTIONS = ["verb", "action", "text", "waitSeconds", "apply", "expectToken", "name", "exactName", "role", "showing", "nth"] as const
    const APP_CLICK_OPTIONS = ["name", "exactName", "role", "showing", "nth", "action"] as const
    const APP_TYPE_OPTIONS = ["name", "exactName", "role", "showing", "nth", "waitSeconds"] as const
    const APP_FOCUS_OPTIONS = ["name", "exactName", "role", "showing", "nth", "waitSeconds"] as const

    const previewAndApply = async (
      cell: WorkerCellState,
      key: string,
      request: Record<string, unknown>,
    ): Promise<string> => {
      const preview = await runtime.#json(cell, key, request)
      if (!preview.ok) return preview.error ?? ""
      const value = preview.value
      const token = value && typeof value === "object" && !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).target_token === "string"
        ? (value as Record<string, unknown>).target_token as string
        : undefined
      if (!token) return JSON.stringify(value)
      const applied = await runtime.#tool(cell, key, { ...request, apply: true, expectToken: token })
      return runtime.#show(cell, applied)
    }

    const app = (selector: Record<string, unknown>, name: string) => ({
      name,
      selector,
      tree: async (options: Record<string, unknown> = {}) => {
        const cell = runtime.#activeCell()
        const chosen = restrictOptions(options, APP_TREE_OPTIONS, "app.tree")
        return runtime.#show(cell, await runtime.#tool(cell, "desktop:tree", { ...selector, ...chosen }))
      },
      find: async (options?: Record<string, unknown>) => {
        const cell = runtime.#activeCell()
        const chosen = restrictOptions(options, APP_MATCH_OPTIONS, "app.find")
        return runtime.#show(cell, await runtime.#tool(cell, "desktop:find", { ...selector, ...chosen }))
      },
      act: async (options: Record<string, unknown>) => {
        const cell = runtime.#activeCell()
        const chosen = restrictOptions(options, APP_ACT_OPTIONS, "app.act")
        return runtime.#show(cell, await runtime.#tool(cell, "desktop:act", { ...selector, ...chosen }))
      },
      click: async (options: Record<string, unknown> = {}) => {
        const cell = runtime.#activeCell()
        const chosen = restrictOptions(options, APP_CLICK_OPTIONS, "app.click")
        const request = { ...selector, ...chosen, verb: "action", action: chosen.action ?? "click" }
        return previewAndApply(cell, "desktop:act", request)
      },
      type: async (text: string, options: Record<string, unknown> = {}) => {
        const cell = runtime.#activeCell()
        const chosen = restrictOptions(options, APP_TYPE_OPTIONS, "app.type")
        const request = { ...selector, ...chosen, verb: "set-text", text }
        return previewAndApply(cell, "desktop:act", request)
      },
      focus: async (options: Record<string, unknown> = {}) => {
        const cell = runtime.#activeCell()
        const chosen = restrictOptions(options, APP_FOCUS_OPTIONS, "app.focus")
        const request = { ...selector, ...chosen, verb: "focus" }
        return previewAndApply(cell, "desktop:act", request)
      },
    })

    api.docs = async () => {
      const cell = runtime.#activeCell()
      runtime.#write(cell, CUA_MANUAL)
      return CUA_MANUAL
    }

    api.getState = async () => {
      const cell = runtime.#activeCell()
      const apps = await runtime.#tool(cell, "desktop:apps", {})
      const windows = await runtime.#tool(cell, "desktop:windows", {})
      const parse = (text: string): unknown => {
        try {
          return JSON.parse(text)
        } catch {
          return text
        }
      }
      return { apps: parse(apps.text), windows: parse(windows.text) }
    }

    api.getApp = async (nameOrIndex: string | number) => {
      const cell = runtime.#activeCell()
      const parsed = await runtime.#json(cell, "desktop:apps", {})
      if (!parsed.ok) {
        throw new Error(`Desktop application list was unavailable: ${truncate(parsed.error ?? "empty response", 500)}`)
      }
      if (!Array.isArray(parsed.value)) {
        throw new Error("Desktop application list had an unexpected shape; call cua.getState() to inspect it.")
      }
      const list = parsed.value as Array<Record<string, unknown>>
      const bind = (found: Record<string, unknown>) => {
        if (typeof found.appId !== "string" || !/^app:[a-f0-9]{64}$/.test(found.appId)) {
          throw new Error("This application has no verifiable persistent identity. Refresh the desktop helper and observe apps again; a list index is not safe to remember.")
        }
        return app(Object.freeze({ appId: found.appId }), String(found.name ?? ""))
      }
      if (typeof nameOrIndex === "number") {
        const found = list.find((entry) => entry.index === nameOrIndex)
        if (!found) throw new Error(`No application at index ${nameOrIndex}; call cua.getState() first.`)
        return bind(found)
      }
      if (typeof nameOrIndex !== "string" || !nameOrIndex.trim()) throw new Error("getApp expects an application name or its current numeric index.")
      const exact = list.filter((entry) => String(entry.name ?? "").toLowerCase() === nameOrIndex.toLowerCase())
      const matches = exact.length > 0
        ? exact
        : list.filter((entry) => String(entry.name ?? "").toLowerCase().includes(nameOrIndex.toLowerCase()))
      if (matches.length === 0) {
        throw new Error(`No accessible application matches ${JSON.stringify(nameOrIndex)}; call cua.getState() for the current list.`)
      }
      if (matches.length > 1) {
        const choices = matches.map((entry) => `${entry.index}: ${entry.name}`).join(", ")
        throw new Error(
          `Application name is ambiguous (${choices}). Use cua.getApp(<index>) to bind one instance.`,
        )
      }
      return bind(matches[0]!)
    }

    api.getWindow = async (selector: string | number) => {
      const cell = runtime.#activeCell()
      const parsed = await runtime.#json(cell, "desktop:windows", {})
      if (!parsed.ok) {
        throw new Error(`Window list was unavailable: ${truncate(parsed.error ?? "empty response", 500)}`)
      }
      const value = parsed.value
      const windows = value && typeof value === "object" && !Array.isArray(value) &&
        Array.isArray((value as Record<string, unknown>).windows)
        ? (value as { windows: Array<Record<string, unknown>> }).windows
        : undefined
      if (!windows) {
        throw new Error("Window list had an unexpected shape; call cua.getState() to inspect it.")
      }
      const wanted = String(selector)
      const byId = windows.filter((entry) => String(entry.id) === wanted)
      const exactTitle = windows.filter((entry) => String(entry.title ?? "").toLowerCase() === wanted.toLowerCase())
      const partialTitle = exactTitle.length > 0
        ? []
        : windows.filter((entry) => String(entry.title ?? "").toLowerCase().includes(wanted.toLowerCase()))
      const matches = byId.length > 0 ? byId : exactTitle.length > 0 ? exactTitle : partialTitle
      if (matches.length === 0) {
        throw new Error(`No current window matches ${JSON.stringify(selector)}; call cua.getState().`)
      }
      if (matches.length > 1) {
        const choices = matches.map((entry) => `${entry.id}: ${entry.title ?? ""}`).join(", ")
        throw new Error(
          `Window title is ambiguous (${choices}). Pass the exact window id from cua.getState().`,
        )
      }
      const found = matches[0]!
      const windowId = String(found.id)
      return {
        id: windowId,
        title: String(found.title ?? ""),
        capture: async (options: Record<string, unknown> = {}) => {
          const active = runtime.#activeCell()
          const chosen = restrictOptions(options, ["maxBytes"], "window.capture")
          return runtime.#show(active, await runtime.#tool(active, "desktop:capture", { windowId, ...chosen }))
        },
        focus: async (options: Record<string, unknown> = {}) => {
          const active = runtime.#activeCell()
          restrictOptions(options, [], "window.focus")
          const request = { action: "focus", windowId }
          return previewAndApply(active, "desktop:window_act", request)
        },
      }
    }

    api.browser = async () => {
      runtime.#activeCell()

      const tabHandle = (tabId: string) => {
        let generation: number | undefined
        const handle = {
          tabId,
          get generation() {
            return generation
          },
          snapshot: async (options: Record<string, unknown> = {}) => {
            const cell = runtime.#activeCell()
            const chosen = restrictOptions(options, ["depth"], "tab.snapshot")
            const result = await runtime.#tool(cell, "web:snapshot", { tabId, ...chosen })
            const parsed = parseJsonObject(result.text)
            if (parsed && parsed.tabId === tabId && Number.isSafeInteger(parsed.generation)) {
              generation = parsed.generation as number
            }
            return runtime.#show(cell, result)
          },
          act: async (options: Record<string, unknown> = {}) => {
            const cell = runtime.#activeCell()
            const { generation: explicit, ...chosen } = restrictOptions(
              options,
              ["generation", "ref", "action", "value", "key", "button", "clickCount", "modifiers"],
              "tab.act",
            )
            const used = explicit === undefined ? generation : explicit
            if (used === undefined) {
              throw new Error(
                "tab.act needs a snapshot generation: call tab.snapshot() first or pass generation explicitly.",
              )
            }
            if (!Number.isSafeInteger(used) || Number(used) < 1) {
              throw new Error("tab.act generation must be a positive integer from tab.snapshot().")
            }
            const result = await runtime.#tool(cell, "web:act", { ...chosen, tabId, generation: used })
            const text = runtime.#show(cell, result)
            const outcome = parseJsonObject(result.text)
            const succeeded = outcome !== undefined && outcome.tabId === tabId && outcome.generation === used
            if (!succeeded) return text
            generation = undefined
            const fresh = await runtime.#tool(cell, "web:snapshot", { tabId })
            const freshValue = parseJsonObject(fresh.text)
            if (freshValue && freshValue.tabId === tabId && Number.isSafeInteger(freshValue.generation)) {
              generation = freshValue.generation as number
            }
            return `${text}\n${runtime.#show(cell, fresh)}`
          },
          goto: async (url: string) => {
            const cell = runtime.#activeCell()
            if (typeof url !== "string" || url.length === 0) throw new Error("goto(url) expects a URL string.")
            const result = await runtime.#tool(cell, "web:navigate", { tabId, url })
            const text = runtime.#show(cell, result)
            const parsed = parseJsonObject(result.text)
            if (parsed && parsed.tabId === tabId && typeof parsed.url === "string") {
              generation = undefined
            }
            return text
          },
          screenshot: async (options: Record<string, unknown> = {}) => {
            const cell = runtime.#activeCell()
            const chosen = restrictOptions(options, ["fullPage"], "tab.screenshot")
            return runtime.#show(cell, await runtime.#tool(cell, "web:screenshot", { tabId, ...chosen }))
          },
          close: async () => {
            const cell = runtime.#activeCell()
            generation = undefined
            return runtime.#show(cell, await runtime.#tool(cell, "web:tabs", { action: "close", tabId }))
          },
        }
        return handle
      }

      const browser = {
        tabs: async () => {
          const cell = runtime.#activeCell()
          return runtime.#show(cell, await runtime.#tool(cell, "web:tabs", { action: "list" }))
        },
        open: async (url: string) => {
          const cell = runtime.#activeCell()
          const opened = await runtime.#json(cell, "web:open", { url })
          if (!opened.ok) throw new Error(`Browser did not open a tab: ${truncate(opened.error ?? "empty response", 500)}`)
          const value = opened.value
          const tabId = value && typeof value === "object" && !Array.isArray(value) &&
            typeof (value as Record<string, unknown>).tabId === "string"
            ? (value as Record<string, unknown>).tabId as string
            : undefined
          if (!tabId) throw new Error(`Browser did not return a tab: ${truncate(JSON.stringify(value), 500)}`)
          return tabHandle(tabId)
        },
        close: async () => {
          const cell = runtime.#activeCell()
          return runtime.#show(cell, await runtime.#tool(cell, "web:close", {}))
        },
      }
      return browser
    }

    return api
  }
}

// ---------------------------------------------------------------------------
// Session store and tool registration
// ---------------------------------------------------------------------------

export interface CuaSessions {
  get(sessionID: string): CuaSession
  clear(sessionID: string): void
  /** Stop and drop every session; the parent uses this on plugin unload. */
  dispose(): void
  size(): number
}

/** Bounded least-recently-used store; one persistent context per session. */
export function createCuaSessions(call: CuaToolCall, maximum = 8): CuaSessions {
  const sessions = new Map<string, CuaSession>()
  let disposed = false
  const evict = (sessionID: string): void => {
    const session = sessions.get(sessionID)
    sessions.delete(sessionID)
    session?.dispose()
  }
  return {
    get(sessionID: string) {
      if (disposed) throw new Error("cua session store was disposed on plugin unload.")
      const existing = sessions.get(sessionID)
      if (existing) {
        sessions.delete(sessionID)
        sessions.set(sessionID, existing)
        return existing
      }
      if (sessions.size >= maximum) {
        const oldest = sessions.keys().next().value
        if (oldest !== undefined) evict(oldest)
      }
      const created = new CuaSession({ call })
      sessions.set(sessionID, created)
      return created
    },
    clear(sessionID: string) {
      evict(sessionID)
    },
    dispose() {
      disposed = true
      for (const sessionID of [...sessions.keys()]) evict(sessionID)
    },
    size() {
      return sessions.size
    },
  }
}

export interface CuaEditor<TTool> {
  namespace(input: { name: string; description: string }): void
  add(tool: TTool): void
}

export interface CuaToolDependencies {
  readonly sessions: CuaSessions
}

interface CuaToolResult {
  content: Array<{ type: "text"; text: string } | EmittedFile>
}

type CuaToolDefinition = {
  name: string
  description: string
  input: Record<string, unknown>
  options: { namespace: "cua"; codemode: true }
  execute(input: Record<string, unknown>, context: CuaCallContext): Promise<CuaToolResult>
}

const CUA_MANUAL = [
  "cua — persistent desktop and browser control",
  "",
  "Entry points",
  "  await cua.getState()                 apps (with index) + compositor windows",
  "  await cua.getApp(name | index)       bind one AT-SPI process identity (not its list position)",
  "  await cua.getWindow(id | title)      bind one compositor window",
  "  await cua.browser()                  browser handle; open a tab before reading",
  "  await cua.docs()                     print this manual again",
  "",
  "App handle",
  "  tree({maxDepth, maxNodes, all, includeText})",
  "  find({name, role, nth, exactName, showing})",
  "  act({verb, ...})                    preview-only unless apply:true and expectToken",
  "  click({name, role?, nth?})          preview and apply in this cell; name is required",
  "  type(text, {name|role|nth})         preview and apply in this cell",
  "  focus({name|role|nth})              preview and apply in this cell",
  "  Select by name/role/nth. Coordinates and unknown fields are refused, not ignored.",
  "Window handle: capture(), focus().",
  "Browser handle: tabs(), open(url), close().",
  "Tab handle",
  "  snapshot({depth})                  remembers the generation and its refs",
  "  act({ref, action, value, key})     uses the remembered generation or an explicit",
  "                                     generation; on success it snapshots again",
  "  goto(url)                          URL navigation only",
  "  screenshot({fullPage}), close()",
  "",
  "Example",
  "  const app = await cua.getApp(\"Calculator\");",
  "  await app.tree({ maxDepth: 8 });",
  "  await app.click({ name: \"7\" });",
  "  const b = await cua.browser();",
  "  const tab = await b.open(\"https://example.com/\");",
  "  await tab.snapshot({ depth: 4 });",
  "",
  "Rules",
  "  - Bind once, reuse the handle in later cells; cua.reset discards bindings.",
  "  - Re-read after any mutation: refs, element bounds and preview tokens belong",
  "    to the state that produced them. A failed act does not refresh the snapshot.",
  "  - API calls display their result. nodeRepl.write(value) adds text;",
  "    await nodeRepl.emitImage(dataUri) attaches an image.",
  "  - Cells in one session run one at a time. A cell queued behind reset is refused.",
  "  - A cell times out at 30 s by default; pass timeout_ms (max 120000). Timeout or",
  "    cancellation stops the worker and clears its bindings; bind apps/tabs again.",
  "    A backend action dispatched before the stop may already have completed.",
  "  - Private sign-in is not exposed through cua; use the direct web.signin tool with",
  "    a fresh snapshot generation while a person is present.",
  "  - A worker thread and vm are CPU/lifecycle boundaries, not security sandboxes;",
  "    a cell has the tool session's authority.",
].join("\n")


export function registerCuaTools<TTool>(
  editor: CuaEditor<TTool>,
  dependencies: CuaToolDependencies,
): void {
  const add = (tool: CuaToolDefinition) => editor.add(tool as unknown as TTool)

  editor.namespace({
    name: "cua",
    description:
      "Codex-style persistent computer-use session: one JavaScript cell can batch desktop and browser actions while bindings persist between cells.",
  })

  add({
    name: "js",
    description:
      "Execute JavaScript in a persistent session with top-level await. Simple top-level const/let/var bindings (including nested destructuring) persist until cua_reset; redeclare them with const safely. Top-level import/export/class are refused. The cua object exposes getState/getApp/getWindow/browser. API calls display their results.",
    input: {
      type: "object",
      properties: {
        code: { type: "string", minLength: 1, maxLength: 20_000 },
        timeout_ms: { type: "integer", minimum: 1_000, maximum: 120_000 },
      },
      required: ["code"],
      additionalProperties: false,
    },
    options: { namespace: "cua", codemode: true },
    execute: async (input, context) => {
      const code = input.code
      if (typeof code !== "string" || code.length === 0 || code.length > 20_000) {
        return { content: [{ type: "text", text: "Invalid cua request: code must be a non-empty string of at most 20000 characters." }] }
      }
      const timeout = typeof input.timeout_ms === "number" ? input.timeout_ms : 30_000
      if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
        return { content: [{ type: "text", text: "Invalid cua request: timeout_ms must be an integer from 1000 to 120000." }] }
      }
      try {
        const result = await dependencies.sessions.get(context.sessionID).execute(code, context, timeout)
        return {
          content: [
            { type: "text", text: result.text.length > 0 ? result.text : "(no output)" },
            ...result.files,
          ],
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: "text", text: `cua cell failed: ${truncate(message, 2_000)}` }] }
      }
    },
  })

  add({
    name: "reset",
    description: "Discard the persistent cua session for this OpenCode session: all JavaScript bindings, app handles and tab handles. Call after a broken cell or when switching tasks.",
    input: { type: "object", properties: {}, additionalProperties: false },
    options: { namespace: "cua", codemode: true },
    execute: async (_input, context) => {
      dependencies.sessions.clear(context.sessionID)
      return { content: [{ type: "text", text: "cua session reset" }] }
    },
  })
}
