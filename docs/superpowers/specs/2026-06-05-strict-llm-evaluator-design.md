# Strict LLM Evaluator Design

## Goal

Move the YİÜ strict File Search demo closer to the Codex-like architecture by adding an optional LLM global evaluator and bounded repair/retry loop after the deterministic strict critic.

## Decision

Do not migrate to LangChain/LangGraph. Keep the current typed provider pipeline and add one explicit evaluator stage:

1. Deterministic strict critic runs first for high-confidence safety/catalog failures.
2. If the answer survives and `enableStrictLlmEvaluator` is true, a separate evaluator model reviews the question, normalized question, answer, citations, and strict understanding.
3. The evaluator returns strict JSON with one action: `pass`, `repair`, `clarify`, `refuse`, or `retry`.
4. `repair`, `clarify`, and `refuse` replace the final answer with evaluator-provided safe text.
5. `retry` runs at most one additional File Search query using evaluator-provided `retry_query`, regenerates from the new evidence pack, and then applies the deterministic strict critic again. There is no recursive LLM loop.

## Scope

This slice focuses on final-answer quality and retrieval repair. Automated fact-catalog extraction from documents is intentionally left as the next slice so it can be designed around ingestion and tenant refresh behavior.

## Runtime Controls

- Provider option: `enableStrictLlmEvaluator?: boolean`
- Provider option: `strictEvaluatorModel?: string`
- Provider option: `strictEvaluatorCreateCompletion?: CreateCompletion`
- Demo bridge default: enabled unless `DEMO_CHAT_FILE_SEARCH_LLM_EVALUATOR=0`

## Safety

The evaluator is not allowed to invent facts. It may only pass, request a retry query, ask a clarification, refuse, or rewrite from supplied evidence/catalog-safe boundaries. Sensitive identity/payment/credential/fraud/abuse questions remain handled before retrieval by deterministic safety logic.

## Observability

Provider diagnostics should record `strictLlmVerdict`, `strictLlmReason`, and `strictLlmRetryQuery` when applicable. Usage should include evaluator tokens in the final usage total so customer/demo cost tracking reflects the extra quality pass.
