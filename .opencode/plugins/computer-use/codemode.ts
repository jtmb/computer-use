/**
 * Code Mode exposure policy for this plugin's tools.
 *
 * Code Mode is the default surface. The rollback configuration
 * `directTools: true` must be authoritative: it turns Code Mode **off for every
 * tool this plugin registers**, not just the ones that happen to declare
 * `codemode: false`. Two desktop tool modules (capture and input/launch) declare
 * `codemode: true` directly, so a transform that merely "skips flipping" would
 * leave four desktop tools in Code Mode and make the documented rollback partial.
 *
 * The logic lives here, separate from the plugin entry point, because the entry
 * imports the OpenCode plugin SDK and cannot be loaded in a plain test.
 */

export interface CodemodeTool {
  readonly id: string
  readonly options?: { readonly namespace?: string; readonly codemode?: boolean }
}

export interface CodemodeEditor {
  list(): ReadonlyArray<CodemodeTool>
  update(
    id: string,
    mutate: (entry: {
      options?: { readonly namespace?: string; readonly codemode?: boolean }
    }) => void,
  ): void
}

export interface CodemodeOptions {
  readonly directTools?: boolean
  /**
   * Exact ids this plugin registered. When provided, only those are touched, so a
   * different plugin's tool that happens to sit in the `desktop` or `web` namespace
   * is never rewritten by our transform.
   */
  readonly only?: ReadonlySet<string>
}

/** Prefix of the desktop surface's tool ids. */
export const DESKTOP_TOOL_PREFIX = "desktop_"

/** Prefix of the browser surface's tool ids. */
export const WEB_TOOL_PREFIX = "web_"

/** Surfaces this plugin owns; anything else is left untouched. */
export const OWNED_SURFACES = ["desktop", "web"] as const

function surfaceOf(tool: CodemodeTool): string | undefined {
  const declared = tool.options?.namespace
  if (typeof declared === "string") return declared
  if (tool.id.startsWith(DESKTOP_TOOL_PREFIX)) return "desktop"
  if (tool.id.startsWith(WEB_TOOL_PREFIX)) return "web"
  return undefined
}

/**
 * Apply the exposure policy and return the ids that changed.
 *
 * - default: every owned tool gets Code Mode, including a future tool that forgets
 *   to declare the option;
 * - `directTools: true`: every owned tool is switched back to direct exposure.
 */
export function applyCodemodeDefault(editor: CodemodeEditor, options: CodemodeOptions = {}): string[] {
  const direct = options.directTools === true
  const changed: string[] = []
  for (const tool of editor.list()) {
    if (options.only && !options.only.has(tool.id)) continue
    const surface = surfaceOf(tool)
    if (surface === undefined || !OWNED_SURFACES.includes(surface as (typeof OWNED_SURFACES)[number])) continue
    const current = tool.options?.codemode === true
    if (direct) {
      if (!current) continue
      editor.update(tool.id, (entry) => {
        entry.options = { ...entry.options, codemode: false }
      })
      changed.push(tool.id)
      continue
    }
    if (current) continue
    editor.update(tool.id, (entry) => {
      entry.options = { ...entry.options, codemode: true }
    })
    changed.push(tool.id)
  }
  return changed
}
