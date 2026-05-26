# RAG Query Planner Design

## Goal

Improve Knowledge Base retrieval for natural, noisy, abbreviated, or follow-up user questions without adding customer-specific keyword rules or letting an LLM invent answer facts.

## Design

Add a feature-flagged LLM query planner before Knowledge Base search. The planner may rewrite the user's question into a few retrieval-only query variants and optional must-have evidence terms. It must return JSON only and must not answer the question. The downstream answer generator still receives only retrieved chunks, so grounding remains unchanged.

The planner runs in `auto` mode by default for queries where semantic planning is likely useful: long conversational wording, abbreviation-heavy questions, policy/contact/source requests, or follow-ups that already passed the KB router. Operators can disable it with `KNOWLEDGE_QUERY_PLANNER_ENABLED=false` or force it with `KNOWLEDGE_QUERY_PLANNER_ENABLED=always`. The planner model defaults to `gpt-4o-mini` and can be overridden with `OPENAI_QUERY_PLANNER_MODEL`.

Search remains hybrid and deterministic after planning. The original query is always searched first. Planner variants are searched with the same existing vector, lexical, title, source, and focused evidence paths, then merged through the current scorer. Must-have terms are normalized and recorded for observability/future reranking, but they are not treated as answer facts and are not used to bypass grounded chunk retrieval.

## Safety

- Planner output is normalized, length-limited, deduplicated, and ignored on invalid JSON.
- Planner failures fall back to the current deterministic retrieval path.
- Token usage is recorded as router-category metadata from the inbound pipeline when available.
- No tenant/customer-specific phrases are encoded in production logic.

## Testing

- Unit-test planner JSON normalization, invalid-output fallback, disabled mode, and auto trigger behavior.
- Integration-test that `searchKnowledgeBase` searches planner variants plus the original query and still falls back cleanly.
- Pipeline-test that planner usage is recorded without changing the configured RAG answer model.
- Run existing RAG, followup, guardrail, and build checks.
