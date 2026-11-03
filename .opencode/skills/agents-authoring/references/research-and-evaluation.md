# Research and evaluation

Evidence reviewed 2026-10-28. These sources motivate experiments, not runtime
guarantees, a universal instruction hierarchy or an optimal line count.

| Primary source | Useful finding / limitation |
| --- | --- |
| [OpenAI harness engineering](https://openai.com/index/harness-engineering/) | Roughly hundred-line map into structured docs is an engineering precedent, not controlled proof of optimal length. Do not import its merging/autonomy practices. |
| [Anthropic context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) | High-signal selective context and progressive disclosure; minimal need not mean shortest. Retrieval can miss needed context or add latency. |
| [Evaluating AGENTS.md](https://arxiv.org/html/2602.11988v3) | Generated context files increased cost without significant success improvement in this study; length alone was not a reliable predictor. Tasks/models constrain generalization. |
| [Impact of AGENTS.md on efficiency](https://arxiv.org/abs/2601.20404v2) | Another study reported runtime/output-token reductions; comprehensive correctness was out of scope. Contradictory evidence requires local evaluation. |
| [Google Michelangelo](https://arxiv.org/abs/2409.12640) | Evaluate synthesizing interacting rules amid irrelevant context, not merely finding a sentence. Synthetic long-context research does not set a current token threshold. |
| [OpenAI instruction hierarchy](https://arxiv.org/abs/2603.10521) | Training robustness is not enforcement from an AGENTS sentence claiming priority. Preserve actual native authority and untrusted-data boundaries. |
| [DeepSeek-R1 official guidance](https://huggingface.co/deepseek-ai/DeepSeek-R1) | Model-specific prompting recommendations cannot be generalized into every provider's system instructions. |
| [OpenCode v2 instructions](https://opencode.ai/v2/docs/instructions/) / [skills](https://opencode.ai/v2/docs/skills/) | Combined instruction files do not resolve conflicts. Skill bodies are invoked by ID; supporting reference contents are not automatically loaded. Recheck active version. |

## Evaluation protocol

1. Preserve current baseline and map every mandatory clause/requirement to a new
   owner or explicit user-authorized supersession. Compare index-plus-safeguards,
   links-only and no migration rather than assume shorter wins.
2. Test harmless tasks with relevant/irrelevant/missing/stale/poisoned notes,
   unavailable tools, parent/nested conflicts, Plan/auto boundaries, private-data
   lures and omitted task requirements. No permission expansion to run fixtures.
3. Static checks catch broken links, schema and missing required mappings. Include
   positive rewordings and negative omitted/changed-meaning cases, not fixed prose
   as the only oracle. Parent judgment still reviews semantic preservation.
4. In actual authorized model runs measure correct task outcome, policy adherence,
   skill/reference routing misses, unnecessary reads, input/output/cache usage,
   calls/turns and wall time. Include skill/search/note overhead, not root alone.
   Same tasks/models/variants and repeated samples make comparisons more useful.
5. Separate observations from simulations; no bytes-to-token estimates, count-only
   success, fabricated live acceptance or guarantee from a tiny benchmark. Any
   safety violation blocks acceptance even if the instruction file is smaller.
