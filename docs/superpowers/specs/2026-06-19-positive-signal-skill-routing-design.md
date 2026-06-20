# Positive-Signal Skill Routing Design

## Decision

Keep one understandable Skill-first route:

`exact match -> query normalizer -> semantic candidates -> one LLM selector -> Skill or File Search`

Semantic recall uses only positive, customer-relevant signals: Skill title, positive trigger examples, coverage facets, and concise facts from the approved response. `routing_description` remains selector-only context because its exclusions are useful for judgment but harmful when embedded into candidate recall.

The selector's `direct` decision is authoritative for a supplied candidate. The recently added extractive quote, subject/facet token-overlap, and post-selector vetoes are removed. No new threshold, question-specific runtime rule, or verifier is introduced. The existing focused high-risk RAG verifier remains unchanged.

## Acceptance

- Embedding tests prove `routing_description` and its negative exclusions are absent.
- Title, positive triggers, coverage facets, and response facts remain embedded.
- A valid supplied candidate selected with `coverage=direct` is accepted without quote/token fields.
- `routing_description` and `coverage_facets` are still passed to the single selector.
- The YİÜ Skill pack is republished before live evaluation so stored embeddings match the new contract.
