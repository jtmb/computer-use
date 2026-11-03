import { fileURLToPath } from 'node:url'
import { Plugin } from '@opencode/plugin'
import { createPersonality, DEFAULT_ID, PASSIVE_PERMISSION } from './core.mjs'

export default Plugin.define({
  id: 'computer-use.personality',
  async setup(ctx) {
    const manager = createPersonality({
      sourceRoot: fileURLToPath(new URL('../../.opencode/skills', import.meta.url)),
      sourceProjectRoot: fileURLToPath(new URL('../..', import.meta.url)),
      defaultID: typeof ctx.options.defaultID === 'string' ? ctx.options.defaultID : DEFAULT_ID,
      session: ctx.session,
      storage: ctx.storage,
      permission: ctx.permission,
      skills: ctx.skill,
    })
    type Registration = Awaited<ReturnType<typeof ctx.tool.transform>>
    let registration: Registration | undefined
    let passivePermission: Registration | undefined
    let hook: Registration | undefined
    let cleaned = false
    const cleanup = async () => {
      if (cleaned) return
      cleaned = true
      manager.dispose()
      const results = await Promise.allSettled([hook, passivePermission, registration].flatMap(item => item ? [Promise.resolve().then(() => item.dispose())] : []))
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
      if (errors.length) throw new AggregateError(errors, 'Personality registrations did not all dispose cleanly.')
    }
    try {
      registration = await ctx.tool.transform(editor => {
        if (editor.get('personality')) throw new Error('personality tool already exists; refusing to override it')
        editor.add({
          name: 'personality',
          description: 'Check, list, read, select or reset this chat response style, or preview/save a new personality as a canonical skill. Saving does not select or deploy it. Native permissions and exact preview revision remain required.',
          options: { codemode: true },
          input: { oneOf: [
            ...['current', 'list', 'reset'].map(op => ({ type: 'object', properties: { op: { const: op } }, required: ['op'], additionalProperties: false })),
            ...['read', 'select'].map(op => ({ type: 'object', properties: { op: { const: op }, id: { type: 'string', pattern: '^personality-[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 } }, required: ['op', 'id'], additionalProperties: false })),
            { type: 'object', properties: {
              op: { const: 'save' }, id: { type: 'string', pattern: '^personality-[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 },
              description: { type: 'string', minLength: 1, maxLength: 500 }, instructions: { type: 'string', minLength: 1, maxLength: 6000 },
              apply: { type: 'boolean' }, expectRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            }, required: ['op', 'id', 'description', 'instructions'], additionalProperties: false },
          ] },
          execute: async (input, context) => ({ content: JSON.stringify(await manager.execute(input, context)) }),
        })
      })
      // Passive reminders must never open permission dialogs before each answer.
      // Interactive tool operations still use the native ask/deny/allow contract.
      passivePermission = await ctx.permission.hook('evaluate', event => {
        if (event.metadata?.[PASSIVE_PERMISSION] === true && event.effect === 'ask') {
          event.effect = 'deny'
          event.message = 'Automatic style reminder needs permission. Use personality.current explicitly to review access.'
        }
      })
      let warned = false
      const unavailableNotice = 'The configured personality reminder is unavailable or needs permission. Do not claim it was loaded or saved. Follow the user\'s requested explanation style; use personality.current explicitly when access is needed.'
      hook = await ctx.session.hook('context', async event => {
        try { await manager.context(event); warned = false } catch (error) {
          // A missing style must not block unrelated work or fabricate a fallback.
          if (!warned) console.warn('[personality] response-style reminder unavailable; check personality.current', error instanceof Error ? error.message : 'unknown error')
          warned = true
          if (!event.system.some(part => part.type === 'text' && part.text === unavailableNotice)) event.system.push({ type: 'text', text: unavailableNotice })
        }
      })
      return cleanup
    } catch (error) {
      try { await cleanup() } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Personality setup failed and cleanup was incomplete.') }
      throw error
    }
  },
})
