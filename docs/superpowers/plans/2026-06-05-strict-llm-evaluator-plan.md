# Strict LLM Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional LLM global evaluator and one bounded retry/repair loop to the strict validated File Search provider.

**Architecture:** A new focused evaluator module parses strict JSON verdicts from an injected or default chat completion call. The validated provider runs deterministic critic first, then the optional LLM evaluator, then applies repair/clarify/refuse or one retry query before finalizing.

**Tech Stack:** TypeScript, Vitest, existing OpenAI chat-completion wrapper shape, Next.js build.

---

### Task 1: LLM Evaluator Module

**Files:**
- Create: `src/lib/knowledge-base/rag-eval/strict-llm-evaluator.ts`
- Test: `src/lib/knowledge-base/rag-eval/strict-llm-evaluator.test.ts`

- [ ] **Step 1: Write failing tests**

Test JSON parsing for `pass`, `repair`, `clarify`, `refuse`, and `retry`, usage normalization, invalid JSON fallback, and evidence prompt inclusion.

- [ ] **Step 2: Run red test**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-llm-evaluator.test.ts`

- [ ] **Step 3: Implement evaluator**

Add strict typed verdicts, robust JSON extraction, model parameter selection, default OpenAI fallback, and usage normalization.

- [ ] **Step 4: Run green test**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-llm-evaluator.test.ts`

### Task 2: Provider Repair/Retry Integration

**Files:**
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`
- Modify: `src/lib/knowledge-base/rag-eval/types.ts`

- [ ] **Step 1: Write failing provider tests**

Add tests for evaluator repair replacing a weak answer, evaluator retry running a second File Search query and regenerated answer, and evaluator usage merging.

- [ ] **Step 2: Run red provider test**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [ ] **Step 3: Implement provider wiring**

Make `finalizeWithCritic` async, run deterministic critic first, call LLM evaluator when enabled, apply repair/clarify/refuse, and run at most one evaluator retry.

- [ ] **Step 4: Run green provider test**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

### Task 3: Demo Enablement and Docs

**Files:**
- Modify: `src/lib/demo-chat/openai-file-search.ts`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

- [ ] **Step 1: Enable for YİÜ demo**

Pass `enableStrictLlmEvaluator` by default unless `DEMO_CHAT_FILE_SEARCH_LLM_EVALUATOR=0`.

- [ ] **Step 2: Update docs**

Record the evaluator architecture and env fallback.

- [ ] **Step 3: Verify**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/strict-llm-evaluator.test.ts src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts src/lib/knowledge-base/rag-eval/strict-answer-critic.test.ts src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts
npm run build
```
