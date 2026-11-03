import { Plugin } from '@opencode/plugin'
import { OpenCode } from '@opencode/client'
import { Service } from '@opencode/client/service'
import { messageReader, sessionAccess } from './adapter.mjs'
import { dispatch } from './dispatch.mjs'

export default Plugin.define({
  id: 'computer-use.self-learning',
  async setup(ctx) {
    if ((await ctx.tool.list()).some(tool => tool.id === 'self_learning')) throw new Error('self_learning tool already exists')
    const message = messageReader({ service: Service, clientFactory: OpenCode.make, hostSession: ctx.session, hostPid: process.pid, hostVersion: ctx.app.version })
    await ctx.tool.transform(editor => {
      if (editor.get('self_learning')) throw new Error('self_learning tool already exists')
      editor.add({
        name: 'self_learning',
        description: 'Analyze bounded project sessions, recheck references, inspect the loaded skill catalog, preview a reviewer-supplied proposal, or recheck its canonical source without writes. Checks and hashes are not approval.',
        input: { type: 'object', properties: {
          maxSessions: { type: 'integer', minimum: 2, maximum: 12 },
          messagesPerSession: { type: 'integer', minimum: 1, maximum: 40 },
          catalog: { type: 'boolean', const: true },
          reviewedHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          references: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', properties: { sessionID: { type: 'string' }, messageID: { type: 'string' } }, required: ['sessionID', 'messageID'], additionalProperties: false } },
          proposal: { type: 'object', properties: {
            kind: { type: 'string', enum: ['create', 'update'] }, skill: { type: 'string', maxLength: 80 },
            catalog: { type: 'array', maxItems: 200, items: { type: 'object', properties: { name: { type: 'string', maxLength: 80 }, description: { type: 'string', maxLength: 2000 } }, required: ['name', 'description'], additionalProperties: false } },
            previousContent: { type: 'string', maxLength: 8192 }, nextContent: { type: 'string', maxLength: 8192 }, readmeContent: { type: 'string', maxLength: 8192 },
            lesson: { type: 'string', maxLength: 1000 }, rationale: { type: 'string', maxLength: 1000 }, confidence: { type: 'string', enum: ['low', 'medium', 'high'] }, uncertainty: { type: 'string', maxLength: 1000 }, validation: { type: 'string', maxLength: 1000 }, overlapReason: { type: 'string', maxLength: 1000 },
            evidence: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'object', properties: { sessionID: { type: 'string', maxLength: 128 }, messageID: { type: 'string', maxLength: 128 }, kind: { type: 'string', enum: ['failure', 'correction', 'success'] }, assessment: { type: 'string', maxLength: 500 } }, required: ['sessionID', 'messageID', 'kind', 'assessment'], additionalProperties: false } },
          }, required: ['kind', 'skill', 'catalog', 'nextContent', 'lesson', 'rationale', 'confidence', 'uncertainty', 'validation', 'evidence'], additionalProperties: false },
        }, additionalProperties: false },
        execute: async (input, context) => ({ content: JSON.stringify(await dispatch(input, context, {
          ...ctx, message,
          session: sessionAccess(ctx.session, message, context.sessionID),
        })) }),
      })
    })
  },
})
