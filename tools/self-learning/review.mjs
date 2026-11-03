import { createHash } from 'node:crypto'
import { makeProposal } from './proposal.mjs'

const hash = value => createHash('sha256').update(value, 'utf8').digest('hex')

// This check only compares supplied snapshots; it neither reads files nor grants authority.
export function checkReviewedProposal({ input, reviewedHash, currentContent }) {
  const proposal = makeProposal(input)
  if (proposal.status !== 'preview' || typeof reviewedHash !== 'string' || proposal.proposalHash !== reviewedHash) throw new Error('Reviewed proposal does not match the current proposal')
  if (proposal.kind === 'create') {
    if (currentContent !== null) throw new Error('Creation target already exists or its absence was not established')
  } else {
    if (typeof currentContent !== 'string' || hash(currentContent) !== proposal.baseHash || currentContent !== input.previousContent) throw new Error('Existing skill source changed since preview')
  }
  return { status: 'matched-snapshots', proposalHash: proposal.proposalHash, path: proposal.path, baseHash: proposal.baseHash, nextHash: proposal.nextHash, limitations: ['Caller-supplied snapshots and reviewed hash are not proof of user approval, filesystem freshness or native write permission.', 'Re-read the canonical target and obtain specific user approval and native edit permission immediately before applying.'] }
}
