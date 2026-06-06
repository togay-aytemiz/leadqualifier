# Strict Answer Quality Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a strict, evidence-aware answer quality layer for the YİÜ public demo without migrating to LangChain.

**Architecture:** Keep the existing validated OpenAI File Search provider as the retrieval/generation backbone, then add a typed question-understanding/catalog/critic layer around it. The strict mode normalizes colloquial questions, answers high-confidence catalog facts deterministically, rejects unsupported positive claims, and asks clarification/refuses when the answer would be unsafe or unsupported.

**Tech Stack:** TypeScript, Vitest, Next.js, OpenAI File Search, existing Qualy RAG evidence pack.

---

### Task 1: Question Understanding

**Files:**
- Create: `src/lib/knowledge-base/rag-eval/strict-question-understanding.ts`
- Test: `src/lib/knowledge-base/rag-eval/strict-question-understanding.test.ts`

- [x] **Step 1: Write failing tests**

```ts
expect(understandStrictQuestion('dkt kaç tl').normalizedQuestion).toBe('Dil ve Konuşma Terapisi ücreti ne kadar?')
expect(understandStrictQuestion('servis varmı').intents).toContain('transport')
expect(understandStrictQuestion('TC kimliğimi buraya yazayım mı?').safety).toBe('sensitive_personal_data')
```

- [x] **Step 2: Verify tests fail**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-question-understanding.test.ts`

- [x] **Step 3: Implement normalization**

Add Turkish-insensitive normalization, colloquial alias expansion (`dkt`, `ftr`, `shmyo`, `varmı`, `kaç tl`), intent detection, and safety detection.

- [x] **Step 4: Verify tests pass**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-question-understanding.test.ts`

### Task 2: Structured Fact Catalog

**Files:**
- Create: `src/lib/knowledge-base/rag-eval/strict-fact-catalog.ts`
- Test: `src/lib/knowledge-base/rag-eval/strict-fact-catalog.test.ts`

- [x] **Step 1: Write failing tests**

```ts
expect(resolveStrictCatalogAnswer({ question: 'Hukuk Fakülteniz var mı?', understanding }).answer).toContain('listelenmemektedir')
expect(resolveStrictCatalogAnswer({ question: 'Tıp Fakülteniz var mı?', understanding }).answer).toContain('Tıp Fakültesi vardır')
expect(resolveStrictCatalogAnswer({ question: 'Sağlık Bilimleri Fakültesinde hangi bölümler var?', understanding }).answer).toContain('Dil ve Konuşma Terapisi')
```

- [x] **Step 2: Verify tests fail**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-fact-catalog.test.ts`

- [x] **Step 3: Implement catalog answers**

Add a typed catalog for faculties, schools, programs, aliases, campus mappings, and known absent academic units from the approved YİÜ brochure.

- [x] **Step 4: Verify tests pass**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-fact-catalog.test.ts`

### Task 3: Global Critic

**Files:**
- Create: `src/lib/knowledge-base/rag-eval/strict-answer-critic.ts`
- Test: `src/lib/knowledge-base/rag-eval/strict-answer-critic.test.ts`

- [x] **Step 1: Write failing tests**

```ts
expect(evaluateStrictAnswer({ question: 'Hukuk Fakülteniz var mı?', answer: 'Evet, Hukuk Fakültesi var.', citations: [] }).action).toBe('refuse')
expect(evaluateStrictAnswer({ question: 'Kredi kartımı yazsam ödeme alır mısın?', answer: 'Kart bilgilerinizi yazabilirsiniz.', citations: [] }).action).toBe('repair')
```

- [x] **Step 2: Verify tests fail**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-answer-critic.test.ts`

- [x] **Step 3: Implement deterministic critic**

Check whether the question was answered, positive existence claims are evidence/catalog-backed, sensitive payment/personal-data questions are safely refused, and under-specified questions request clarification.

- [x] **Step 4: Verify tests pass**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/strict-answer-critic.test.ts`

### Task 4: Provider Integration

**Files:**
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`
- Modify: `src/lib/demo-chat/openai-file-search.ts`
- Modify: `src/lib/knowledge-base/rag-eval/types.ts`

- [x] **Step 1: Write failing provider tests**

Add tests proving strict mode normalizes `dkt kaç tl`, short-circuits existence catalog answers, and blocks unsafe card/TC/ÖSYM credential collection.

- [x] **Step 2: Verify provider tests fail**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [x] **Step 3: Wire strict mode**

Use `qualityMode: 'strict'` to run question understanding before planning/retrieval, catalog answers before vector search, and critic after generation/raw fallback.

- [x] **Step 4: Enable strict mode for demo**

Pass strict mode from `src/lib/demo-chat/openai-file-search.ts`, overridable with `DEMO_CHAT_FILE_SEARCH_STRICT_QUALITY=0`.

- [x] **Step 5: Verify provider tests pass**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

### Task 5: Docs and Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Update docs**

Record the strict quality pipeline decision, public-demo strict mode, and expected follow-up canary work.

- [x] **Step 2: Run required tests/build**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/strict-question-understanding.test.ts src/lib/knowledge-base/rag-eval/strict-fact-catalog.test.ts src/lib/knowledge-base/rag-eval/strict-answer-critic.test.ts src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts
npm run build
```

- [x] **Step 3: Report commit message**

Use: `feat(phase-3): add strict answer quality pipeline`
