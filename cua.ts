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
 * This is not a security boundary. A vm context is not a sandbox, and the tool
 * session already has shell authority; the permission prompts still run because
 * backend calls go through the registered tools. A synchronous loop cannot be
 * interrupted by host cancellation; it stops only at the cell's vm time limit.
 */

import vm from "node:vm"

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

function formatValue(value: unknown): string {
  if (typeof value === "string") return value
  if (isErrorLike(value)) {
    if (typeof value.stack === "string") return value.stack
    return `${String(value.name ?? "Error")}: ${String(value.message ?? value)}`
  }
  if (value === undefined) return "undefined"
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
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

class CellLimitError extends Error {
  readonly reason: "timeout" | "cancelled"

  constructor(message: string, reason: "timeout" | "cancelled") {
    super(message)
    this.name = "CellLimitError"
    this.reason = reason
  }
}

function isExecutionTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  return (error as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ||
    /Script execution timed out/.test(String((error as { message?: unknown }).message ?? ""))
}

// ---------------------------------------------------------------------------
// One session: persistent context + API
// ---------------------------------------------------------------------------

export interface CellResult {
  readonly text: string
  readonly files: EmittedFile[]
}

type JsonOutcome = { ok: true; value: unknown } | { ok: false; error: string }

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
}

export class CuaSession {
  readonly #call: CuaToolCall
  readonly #maxOutput: number
  #context!: vm.Context
  #declared = new Set<string>()
  #cell: CellState | undefined
  #disposed = false
  // Bumped by reset/dispose so a queued cell cannot start afterwards.
  #epoch = 0
  #firstCell = true
  #cells = 0
  #tail: Promise<void> = Promise.resolve()

  constructor(options: CuaRuntimeOptions) {
    this.#call = options.call
    this.#maxOutput = options.maxOutputChars ?? 25_000
    this.reset()
  }

  reset(): void {
    this.#epoch++
    this.#disposed = false
    this.#declared = new Set()
    this.#firstCell = true
    if (this.#cell) this.#invalidate(this.#cell)
    this.#cell = undefined
    const session = this
    const sandbox: Record<string, unknown> = {}
    sandbox.cua = this.#buildApi()
    sandbox.nodeRepl = {
      write(value: unknown) {
        session.#writeActive(formatValue(value))
      },
      async emitImage(value: unknown) {
        const file = dataUriLike(value)
        if (file) session.#addActiveFile(file)
        else session.#writeActive("emitImage expects a data URI, Uint8Array, or Buffer")
      },
    }
    sandbox.console = {
      log: (...values: unknown[]) => session.#writeActive(values.map(formatValue).join(" ")),
      info: (...values: unknown[]) => session.#writeActive(values.map(formatValue).join(" ")),
      warn: (...values: unknown[]) => session.#writeActive(values.map(formatValue).join(" ")),
      error: (...values: unknown[]) => session.#writeActive(values.map(formatValue).join(" ")),
    }
    this.#context = vm.createContext(sandbox, {
      name: "cua-session",
      codeGeneration: { strings: false, wasm: false },
    })
  }

  /** Stop all queued and running work. The session cannot be reused afterwards. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#epoch++
    if (this.#cell) this.#invalidate(this.#cell)
    this.#cell = undefined
    this.#declared.clear()
  }

  #invalidate(cell: CellState): void {
    cell.stale = true
    cell.controller.abort()
  }

  #assertUsable(epoch: number): void {
    if (this.#disposed) throw new Error("cua session was disposed; this cell did not run.")
    if (epoch !== this.#epoch) throw new Error("cua session was reset; this cell did not run.")
  }

  #activeCell(): CellState {
    const cell = this.#cell
    if (!cell || cell.stale) {
      throw new Error(
        "cua API calls are only valid inside the cell that started them; " +
        "this handle came from a finished, reset or timed-out cell.",
      )
    }
    return cell
  }

  #assertCell(cell: CellState): void {
    if (this.#cell !== cell) {
      throw new Error("This cua handle belongs to a finished cell; start the work again in the current cell.")
    }
    if (cell.stale || cell.signal.aborted) {
      throw new Error("This cua cell was cancelled or timed out; its later work was refused.")
    }
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

  #writeActive(text: string): void {
    const cell = this.#cell
    if (cell) this.#write(cell, text)
  }

  #addFile(cell: CellState, file: EmittedFile): void {
    if (this.#cell !== cell || cell.stale) return
    if (cell.files.length >= MAX_FILES_PER_CELL || file.uri.length > MAX_FILE_URI_CHARS) {
      cell.droppedFiles++
      return
    }
    cell.files.push(file)
  }

  #addActiveFile(file: EmittedFile): void {
    const cell = this.#cell
    if (cell) this.#addFile(cell, file)
  }

  /** API calls display their own result, matching Codex's `cua` entry points. */
  #show(cell: CellState, parsed: ParsedResult): string {
    this.#write(cell, parsed.text)
    return parsed.text
  }

  async #tool(cell: CellState, key: string, input: Record<string, unknown>): Promise<ParsedResult> {
    this.#assertCell(cell)
    // The check before dispatch is the important one: a cell that timed out or
    // was reset must not start new backend work while a later cell is active.
    const result = await this.#call(key, input, cell.context)
    this.#assertCell(cell)
    const parsed = parseResult(result)
    for (const file of parsed.files) this.#addFile(cell, file)
    return parsed
  }

  async #json(cell: CellState, key: string, input: Record<string, unknown>): Promise<JsonOutcome> {
    const parsed = await this.#tool(cell, key, input)
    try {
      return { ok: true, value: JSON.parse(parsed.text) as unknown }
    } catch {
      return { ok: false, error: parsed.text }
    }
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
    if (this.#cell) throw new Error("cua runtime refused an overlapping cell; cells are serialized.")
    const cell = this.#startCell(context)
    const boundedTimeout = Math.min(Math.max(timeoutMs, 1_000), 120_000)
    try {
      if (this.#firstCell) {
        this.#write(cell, CUA_MANUAL)
        this.#firstCell = false
      }
      if (cell.signal.aborted) throw new CellLimitError("Cell cancelled before it started.", "cancelled")
      const transformed = transformCell(code, this.#declared)
      if (transformed.unsupported) throw new Error(transformed.unsupported)
      this.#cells++
      const script = new vm.Script(transformed.code, {
        filename: `cua-cell-${this.#cells}.js`,
        displayErrors: true,
      })
      // Commit only after compilation: a failed cell must not mark a binding as
      // already declared for later cells.
      for (const name of transformed.hoisted) this.#declared.add(name)
      let value: unknown = script.runInContext(this.#context, {
        timeout: Math.min(boundedTimeout, 30_000),
        displayErrors: true,
      })
      if (value && typeof (value as { then?: unknown }).then === "function") {
        value = await this.#withTimeout(Promise.resolve(value), boundedTimeout, cell)
      }
      this.#writeValue(cell, value)
    } catch (error) {
      this.#reportError(cell, error)
    } finally {
      if (this.#cell === cell) this.#cell = undefined
    }
    const text = truncate(cell.output.join("\n"), this.#maxOutput)
    if (cell.droppedFiles > 0) {
      return { text: `${text}\n...[${cell.droppedFiles} image(s) dropped: attachment limit]`, files: cell.files.slice() }
    }
    return { text, files: cell.files.slice() }
  }

  #startCell(context: CuaCallContext): CellState {
    const controller = new AbortController()
    const parent = context.signal
    if (parent) {
      if (parent.aborted) controller.abort()
      else parent.addEventListener("abort", () => controller.abort(), { once: true })
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
    }
    this.#cell = cell
    return cell
  }

  #writeValue(cell: CellState, value: unknown): void {
    if (value === undefined) return
    const file = dataUriLike(value)
    if (file) {
      this.#addFile(cell, file)
      return
    }
    // An API method already displayed its result; do not repeat it as the
    // cell's completion value.
    const rendered = formatValue(value)
    if (rendered !== cell.output[cell.output.length - 1]) this.#write(cell, rendered)
  }

  #reportError(cell: CellState, error: unknown): void {
    if (error instanceof CellLimitError) {
      this.#write(cell, error.message)
      this.#invalidate(cell)
      return
    }
    if (isExecutionTimeout(error)) {
      this.#write(
        cell,
        "Cell timed out during synchronous execution. The vm stopped it, but host cancellation " +
        "cannot interrupt a synchronous loop; the session needs a fresh cell before retrying.",
      )
      this.#invalidate(cell)
      return
    }
    if (cell.signal.aborted) {
      this.#write(cell, "Cell cancelled; its later work was refused.")
      this.#invalidate(cell)
      return
    }
    this.#write(cell, formatError(error))
  }

  async #withTimeout<T>(promise: Promise<T>, timeoutMs: number, cell: CellState): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    // The race can settle before the underlying promise; keep a handler attached
    // so a later rejection is not reported as unhandled.
    void promise.catch(() => {})
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new CellLimitError(
              `Cell timed out after ${timeoutMs} ms. The operation may still be running; observe fresh state before retrying.`,
              "timeout",
            )),
            timeoutMs,
          )
          if (cell.signal.aborted) {
            reject(new CellLimitError("Cell cancelled; its later work was refused.", "cancelled"))
            return
          }
          onAbort = () => reject(new CellLimitError("Cell cancelled; its later work was refused.", "cancelled"))
          cell.signal.addEventListener("abort", onAbort, { once: true })
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (onAbort) cell.signal.removeEventListener("abort", onAbort)
    }
  }

  /** Build the object graph exposed to model-authored code. */
  #buildApi(): Record<string, unknown> {
    const session = this
    const api: Record<string, unknown> = {}

    const APP_TREE_OPTIONS = ["maxDepth", "maxNodes", "all", "includeText"] as const
    const APP_MATCH_OPTIONS = ["name", "exactName", "role", "showing", "nth", "maxDepth", "maxNodes", "includeText"] as const
    const APP_ACT_OPTIONS = ["verb", "action", "text", "waitSeconds", "apply", "expectToken", "name", "exactName", "role", "showing", "nth"] as const
    const APP_CLICK_OPTIONS = ["name", "exactName", "role", "showing", "nth", "action"] as const
    const APP_TYPE_OPTIONS = ["name", "exactName", "role", "showing", "nth", "waitSeconds"] as const
    const APP_FOCUS_OPTIONS = ["name", "exactName", "role", "showing", "nth", "waitSeconds"] as const

    const previewAndApply = async (
      cell: CellState,
      key: string,
      request: Record<string, unknown>,
    ): Promise<string> => {
      const preview = await session.#json(cell, key, request)
      if (!preview.ok) return preview.error
      const value = preview.value
      const token = value && typeof value === "object" && !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).target_token === "string"
        ? (value as Record<string, unknown>).target_token as string
        : undefined
      // No token means the backend previewed nothing to apply (for example no
      // matching element); return its explanation instead of claiming success.
      if (!token) return JSON.stringify(value)
      const applied = await session.#tool(cell, key, { ...request, apply: true, expectToken: token })
      return session.#show(cell, applied)
    }

    const app = (selector: Record<string, unknown>, name: string) => ({
      name,
      selector,
      tree: async (options: Record<string, unknown> = {}) => {
        const cell = session.#activeCell()
        const chosen = restrictOptions(options, APP_TREE_OPTIONS, "app.tree")
        return session.#show(cell, await session.#tool(cell, "desktop:tree", { ...selector, ...chosen }))
      },
      find: async (options: Record<string, unknown>) => {
        const cell = session.#activeCell()
        const chosen = restrictOptions(options, APP_MATCH_OPTIONS, "app.find")
        return session.#show(cell, await session.#tool(cell, "desktop:find", { ...selector, ...chosen }))
      },
      // Preview-only unless the caller supplies apply:true and the matching
      // single-use expectToken. click/type/focus are the apply helpers.
      act: async (options: Record<string, unknown>) => {
        const cell = session.#activeCell()
        const chosen = restrictOptions(options, APP_ACT_OPTIONS, "app.act")
        return session.#show(cell, await session.#tool(cell, "desktop:act", { ...selector, ...chosen }))
      },
      click: async (options: Record<string, unknown> = {}) => {
        const cell = session.#activeCell()
        const chosen = restrictOptions(options, APP_CLICK_OPTIONS, "app.click")
        const request = { ...selector, ...chosen, verb: "action", action: chosen.action ?? "click" }
        return previewAndApply(cell, "desktop:act", request)
      },
      type: async (text: string, options: Record<string, unknown> = {}) => {
        const cell = session.#activeCell()
        const chosen = restrictOptions(options, APP_TYPE_OPTIONS, "app.type")
        const request = { ...selector, ...chosen, verb: "set-text", text }
        return previewAndApply(cell, "desktop:act", request)
      },
      focus: async (options: Record<string, unknown> = {}) => {
        const cell = session.#activeCell()
        const chosen = restrictOptions(options, APP_FOCUS_OPTIONS, "app.focus")
        const request = { ...selector, ...chosen, verb: "focus" }
        return previewAndApply(cell, "desktop:act", request)
      },
    })

    api.docs = async () => {
      const cell = session.#activeCell()
      session.#write(cell, CUA_MANUAL)
      return CUA_MANUAL
    }

    api.getState = async () => {
      const cell = session.#activeCell()
      const apps = await session.#tool(cell, "desktop:apps", {})
      const windows = await session.#tool(cell, "desktop:windows", {})
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
      const cell = session.#activeCell()
      const parsed = await session.#json(cell, "desktop:apps", {})
      // A backend failure is not "no match"; keep the two distinguishable.
      if (!parsed.ok) {
        throw new Error(`Desktop application list was unavailable: ${truncate(parsed.error || "empty response", 500)}`)
      }
      if (!Array.isArray(parsed.value)) {
        throw new Error("Desktop application list had an unexpected shape; call cua.getState() to inspect it.")
      }
      const list = parsed.value as Array<Record<string, unknown>>
      if (typeof nameOrIndex === "number") {
        const found = list.find((entry) => entry.index === nameOrIndex)
        if (!found) throw new Error(`No application at index ${nameOrIndex}; call cua.getState() first.`)
        return app({ appIndex: nameOrIndex }, String(found.name ?? ""))
      }
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
      return app({ app: nameOrIndex }, String(matches[0]!.name ?? nameOrIndex))
    }

    api.getWindow = async (selector: string | number) => {
      const cell = session.#activeCell()
      const parsed = await session.#json(cell, "desktop:windows", {})
      if (!parsed.ok) {
        throw new Error(`Window list was unavailable: ${truncate(parsed.error || "empty response", 500)}`)
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
          const active = session.#activeCell()
          return session.#show(active, await session.#tool(active, "desktop:capture", { windowId, ...options }))
        },
        focus: async (options: Record<string, unknown> = {}) => {
          const active = session.#activeCell()
          const request = { action: "focus", windowId, ...options }
          return previewAndApply(active, "desktop:window_act", request)
        },
      }
    }

    api.browser = async () => {
      // Resolve the caller's cell only when a method runs; binding the browser in
      // one cell and using it in a later one must attribute the later call.
      session.#activeCell()

      const tabHandle = (tabId: string) => {
        let generation: number | undefined
        const handle = {
          tabId,
          get generation() {
            return generation
          },
          snapshot: async (options: Record<string, unknown> = {}) => {
            const cell = session.#activeCell()
            const chosen = restrictOptions(options, ["depth"], "tab.snapshot")
            const result = await session.#tool(cell, "web:snapshot", { tabId, ...chosen })
            const parsed = parseJsonObject(result.text)
            if (parsed && parsed.tabId === tabId && Number.isSafeInteger(parsed.generation)) {
              generation = parsed.generation as number
            }
            return session.#show(cell, result)
          },
          act: async (options: Record<string, unknown> = {}) => {
            const cell = session.#activeCell()
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
            const result = await session.#tool(cell, "web:act", { ...chosen, tabId, generation: used })
            const text = session.#show(cell, result)
            // Only a real success invalidates the ref. A stale-ref, invalid or
            // backend-failure response must not trigger a "fresh" snapshot that
            // hides the failure behind new output.
            const outcome = parseJsonObject(result.text)
            const succeeded = outcome !== undefined && outcome.tabId === tabId && outcome.generation === used
            if (!succeeded) return text
            generation = undefined
            const fresh = await session.#tool(cell, "web:snapshot", { tabId })
            const freshValue = parseJsonObject(fresh.text)
            if (freshValue && freshValue.tabId === tabId && Number.isSafeInteger(freshValue.generation)) {
              generation = freshValue.generation as number
            }
            return `${text}\n${session.#show(cell, fresh)}`
          },
          goto: async (url: string) => {
            const cell = session.#activeCell()
            if (typeof url !== "string" || url.length === 0) throw new Error("goto(url) expects a URL string.")
            // web:navigate accepts exactly one of url or action; sending both was
            // an invalid request. Goto is URL navigation only.
            const result = await session.#tool(cell, "web:navigate", { tabId, url })
            const text = session.#show(cell, result)
            const parsed = parseJsonObject(result.text)
            if (parsed && parsed.tabId === tabId && typeof parsed.url === "string") {
              generation = undefined
            }
            return text
          },
          screenshot: async (options: Record<string, unknown> = {}) => {
            const cell = session.#activeCell()
            const chosen = restrictOptions(options, ["fullPage"], "tab.screenshot")
            return session.#show(cell, await session.#tool(cell, "web:screenshot", { tabId, ...chosen }))
          },
          close: async () => {
            const cell = session.#activeCell()
            generation = undefined
            return session.#show(cell, await session.#tool(cell, "web:tabs", { action: "close", tabId }))
          },
        }
        return handle
      }

      const browser = {
        tabs: async () => {
          const cell = session.#activeCell()
          return session.#show(cell, await session.#tool(cell, "web:tabs", { action: "list" }))
        },
        open: async (url: string) => {
          const cell = session.#activeCell()
          const opened = await session.#json(cell, "web:open", { url })
          if (!opened.ok) throw new Error(`Browser did not open a tab: ${truncate(opened.error || "empty response", 500)}`)
          const value = opened.value
          const tabId = value && typeof value === "object" && !Array.isArray(value) &&
            typeof (value as Record<string, unknown>).tabId === "string"
            ? (value as Record<string, unknown>).tabId as string
            : undefined
          if (!tabId) throw new Error(`Browser did not return a tab: ${truncate(JSON.stringify(value), 500)}`)
          return tabHandle(tabId)
        },
        close: async () => {
          const cell = session.#activeCell()
          return session.#show(cell, await session.#tool(cell, "web:close", {}))
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
  const evict = (sessionID: string): void => {
    const session = sessions.get(sessionID)
    sessions.delete(sessionID)
    session?.dispose()
  }
  return {
    get(sessionID: string) {
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
  "  await cua.getApp(name | index)       bind one AT-SPI application",
  "  await cua.getWindow(id | title)      bind one compositor window",
  "  await cua.browser()                  browser handle; open a tab before reading",
  "  await cua.docs()                     print this manual again",
  "",
  "App handle",
  "  tree({maxDepth, maxNodes, all, includeText})",
  "  find({name, role, nth, exactName, showing})",
  "  act({verb, ...})                    preview-only unless apply:true and expectToken",
  "  click({name|role|nth})              preview and apply in this cell",
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
  "  - A cell times out at 30 s by default; pass timeout_ms (max 120000). A sync loop",
  "    stops only at that time limit; host cancellation cannot interrupt it.",
  "  - Private sign-in is not exposed through cua; use the direct web.signin tool with",
  "    a fresh snapshot generation while a person is present.",
  "  - vm is not a security boundary; a cell has the tool session's authority.",
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

