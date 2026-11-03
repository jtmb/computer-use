# Delivery ownership history — preserved, not a live queue

The original parent-owned delivery registry is retained verbatim in the verified
local backup, rather than importing its old reservations as current ownership:

- Archive: `/home/james/Documents/computer-use-delivery-preservation-20261029/computer-use-delivery.tar`
- Member: `computer-use-delivery/docs/codex-parity/delivery-agent-registry.md`
- Original size: 49,450 bytes; SHA-256:
  `eb66a76195809b9c46c9839052ef04a5401e12c4789498c6c0b9a6aebca00acc`.
- The archive passed a complete restore/hash/mode/link check; its adjacent
  `preservation-receipt.json` identifies the full archive and Git metadata.

That report records source lanes 1–23, their exact sessions, failures, corrections,
ownership releases, historical approval limits and independent checks. No history
was deleted, a reserved path reassigned from age, or a historical goal relabeled.
Its delivery-root write instructions and "current" batch headings are historical,
not authority to write there, resume a child or run a new queue.

Canonical execution is now on existing `main` in `computer-use`. See
[main consolidation](main-consolidation.md) for the actual lanes 24–28 and current
acceptance/ownership; [parallel coordination](../parallel-run-coordination.md)
retains earlier canonical evidence. Supported goal tools alone hold goal state.
This locator creates no goal, worker assignment, activation or release authority.
