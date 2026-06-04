# Brochure-First RAG Accuracy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the YIU approved-corpus File Search provider reliable for brochure prices, quotas, scores, sources, refusals, and conversion-focused follow-ups without changing the current public demo.

**Architecture:** Keep OpenAI File Search as the primary retrieval provider. Add deterministic intent/source routing, typed brochure table-row validation, one narrowed targeted retry, and a separate evidence-validated follow-up stage. Keep general approved-corpus and document-router questions on File Search with intent-specific validation.

**Tech Stack:** TypeScript, Vitest, OpenAI Responses API File Search, OpenAI vector-store file attributes, existing Qualy RAG eval harness.

---

## File Structure

- Create `src/lib/knowledge-base/rag-eval/brochure-query-plan.ts`
  - Classify benchmark/runtime questions into supported intents, source-group filters, requested table fields, and retry queries.
- Create `src/lib/knowledge-base/rag-eval/brochure-query-plan.test.ts`
  - Cover table, scholarship, campus/contact, document-router, and general scope routing.
- Create `src/lib/knowledge-base/rag-eval/brochure-table.ts`
  - Parse verified brochure markdown table rows from File Search citations and produce same-row validated facts/answers.
- Create `src/lib/knowledge-base/rag-eval/brochure-table.test.ts`
  - Cover price/quota/rank/score column separation, variants, missing values, and the known inconsistent row.
- Create `src/lib/knowledge-base/rag-eval/validated-followup.ts`
  - Produce one short evidence-supported follow-up after a validated answer.
- Create `src/lib/knowledge-base/rag-eval/validated-followup.test.ts`
  - Cover useful brochure follow-ups and suppression rules.
- Create `src/lib/knowledge-base/rag-eval/approved-source-facts.ts`
  - Extract stable evidence-gated contacts, admissions lists, brochure overview, and scholarship facts with approved citations.
- Create `src/lib/knowledge-base/rag-eval/approved-source-facts.test.ts`
  - Cover evidence-specific parsing and prevent uncited structured facts.
- Modify `src/lib/knowledge-base/rag-eval/openai-file-search.ts`
  - Accept and send File Search metadata filters.
- Modify `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`
  - Orchestrate routing, typed table answers, intent-specific validation, targeted retry, and follow-up append.
- Modify `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`
  - Add end-to-end provider regressions.
- Modify `src/lib/knowledge-base/rag-eval/types.ts`
  - Record retry/follow-up diagnostics and evaluator dimensions.
- Modify `src/lib/knowledge-base/rag-eval/evaluator.ts`
  - Separate required source correctness from preferred source and follow-up quality.
- Modify `src/lib/knowledge-base/rag-eval/evaluator.test.ts`
  - Cover the new independent scoring dimensions.
- Modify `src/lib/knowledge-base/rag-eval/manifest.ts`
  - Parse preferred source and follow-up expectations.
- Modify `scripts/knowledge/rag-eval-runner.ts`
  - Report retry, model, follow-up, answer, required-source, and preferred-source metrics.
- Modify `docs/superpowers/specs/2026-06-04-yiu-admissions-brochure-file-search-design.md`
  - Keep the live tracker current after each slice.
- Modify `docs/ROADMAP.md`, `docs/PRD.md`, and `docs/RELEASE.md`
  - Record completed behavior and decisions.

## Task 1: Query Intent and Source-Group Routing

- [x] Write failing tests proving fee/quota/rank/score questions route to brochure program-fee groups; scholarship, campus/contact, document-router, and general questions route to their own scopes.
- [x] Run `npm test -- --run src/lib/knowledge-base/rag-eval/brochure-query-plan.test.ts` and verify RED.
- [x] Implement `planBrochureQuery(question)` with deterministic intent, requested fields, source-group filters, and targeted retry query.
- [x] Add `filters` support to `runOpenAiFileSearchQuestion`.
- [x] Run query-plan and File Search provider tests and verify GREEN.
- [x] Update the spec tracker.

## Task 2: Typed Brochure Table Rows

- [x] Write failing tests that parse brochure markdown rows and prove `Optisyenlik (Burslu)` success rank is `444.708`, not quota `7`.
- [x] Add tests for Tıp hazırlık price `410.000`, paid/discounted variants, missing `-` values, and the known inconsistent Tıbbi Tanıtım row.
- [x] Run `npm test -- --run src/lib/knowledge-base/rag-eval/brochure-table.test.ts` and verify RED.
- [x] Implement typed row parsing, row matching, requested-field extraction, and deterministic Turkish answer rendering.
- [x] Run brochure table tests and verify GREEN.
- [x] Update the spec tracker.

## Task 3: Validated Provider Routing and Targeted Retry

- [x] Write failing provider tests proving the first call uses a brochure filter and a failed/missing table lookup triggers one narrowed retry.
- [x] Add a regression proving a matching typed row returns the correct answer and supporting citation without calling the generic answer generator.
- [x] Add a regression proving document-router questions can use an exact title citation without being rejected by the generic evidence pack.
- [x] Run `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts` and verify RED.
- [x] Implement routing, typed table answer preference, one targeted retry, and document-router validation.
- [x] Run validated provider tests and verify GREEN.
- [x] Update the spec tracker.

## Task 4: Separate Validated Follow-Up Stage

- [x] Write failing tests for a fee comparison follow-up, a scholarship follow-up, and suppression on refusal/source-only/stop-signal turns.
- [x] Run `npm test -- --run src/lib/knowledge-base/rag-eval/validated-followup.test.ts` and verify RED.
- [x] Implement deterministic evidence-supported follow-up selection independent from factual answer generation.
- [x] Append at most one validated follow-up after a successful validated answer.
- [x] Run follow-up and validated provider tests and verify GREEN.
- [x] Run mandatory intake guards: `npm test -- --run src/lib/ai/followup.test.ts` and `npm test -- --run src/lib/ai/response-guards.test.ts`.
- [x] Update the spec tracker.

## Task 5: Evaluator and Report Semantics

- [x] Write failing tests showing a correct answer with a valid non-preferred approved source remains answer-correct while preferred-source correctness is reported separately.
- [x] Add follow-up presence/quality expectations without making unsupported/refusal cases require follow-ups.
- [x] Run evaluator and manifest tests and verify RED.
- [x] Implement independent required-source, preferred-source, and follow-up scoring/reporting.
- [x] Run evaluator, manifest, and runner type/build verification and verify GREEN.
- [x] Update the spec tracker.

## Task 6: Verification and Model A/B

- [x] Run all focused RAG eval tests.
- [x] Run mandatory follow-up/guardrail regression tests.
- [x] Run `npm run build` and `git diff --check`.
- [x] Run the same validated 50-question benchmark with the current model pair.
- [x] Run the same validated 50-question benchmark with `gpt-5.4-mini`, changing one model stage at a time.
- [x] Compare correctness, brochure-critical correctness, follow-up coverage, latency, tokens, and estimated credits.
- [x] Do not run GPT-5.5.
- [x] Update the spec, ROADMAP, PRD, and RELEASE with measured results and remaining preview blockers.
