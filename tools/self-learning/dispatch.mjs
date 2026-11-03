import { analyze, inspectEvidence } from './core.mjs'
import { makeProposal } from './proposal.mjs'
import { loadedCatalog } from './catalog.mjs'
import { checkReviewedProposal } from './review.mjs'
import { checkCanonicalSource } from './source-check.mjs'

export async function dispatch(input, context, deps) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid self-learning input')
  if ('catalog' in input) {
    if (Object.keys(input).length !== 1 || input.catalog !== true) throw new Error('Catalog discovery cannot be mixed with other operations')
    return loadedCatalog(context, deps)
  }
  if ('proposal' in input) {
    if (Object.keys(input).some(key => !['proposal', 'reviewedHash'].includes(key))) throw new Error('Proposal cannot be mixed with analysis or references')
    if ('reviewedHash' in input) {
      const proposalInput = input.proposal
      checkReviewedProposal({ input: proposalInput, reviewedHash: input.reviewedHash, currentContent: proposalInput?.kind === 'create' ? null : proposalInput?.previousContent })
      await dispatch({ proposal: proposalInput }, context, deps)
      return checkCanonicalSource({ input: proposalInput, reviewedHash: input.reviewedHash }, context, deps)
    }
    const proposal = makeProposal(input.proposal)
    if (proposal.status === 'no-change') return proposal
    const loaded = await loadedCatalog(context, deps)
    const declared = [...input.proposal.catalog].map(item => ({ name: item.name, description: item.description })).sort((a, b) => a.name.localeCompare(b.name))
    const observed = loaded.catalog.map(item => ({ name: item.name, description: item.description }))
    if (JSON.stringify(declared) !== JSON.stringify(observed)) throw new Error('Proposal catalog differs from current host loader snapshot')
    const references = input.proposal.evidence.map(({ sessionID, messageID }) => ({ sessionID, messageID }))
    const inspection = await inspectEvidence({ references }, context, deps)
    if (inspection.results.some(item => item.status !== 'checked')) throw new Error('One or more evidence references are ineligible')
    const result = { ...proposal, checks: { references: inspection.results, limitations: [...inspection.limitations, ...loaded.limitations, 'Checks are not semantic evidence review or approval and are not included in the proposal hash.'] } }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32 * 1024) throw new Error('Proposal output exceeds 32 KiB')
    return result
  }
  return 'references' in input ? inspectEvidence(input, context, deps) : analyze(input, context, deps)
}
