# RAG Query Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general, feature-flagged LLM retrieval planner that improves RAG search query understanding without generating answer facts.

**Architecture:** Create a focused `src/lib/knowledge-base/query-planner.ts` module that returns normalized retrieval variants and usage metadata. Wire it into `searchKnowledgeBase` so the original query is always searched and planner variants are merged through the existing ranking path. Let the inbound pipeline record planner token usage as router metadata.

**Tech Stack:** Next.js server TypeScript, OpenAI Chat Completions JSON mode, Vitest, Supabase-backed Knowledge Base search.

---

### Task 1: Query Planner Module

**Files:**
- Create: `src/lib/knowledge-base/query-planner.ts`
- Create: `src/lib/knowledge-base/query-planner.test.ts`

- [x] **Step 1: Write failing planner tests**

```ts
it('returns normalized retrieval variants from JSON without answer facts', async () => {
  createCompletionMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      intent: 'policy_lookup',
      subject: 'Tıbbi Laboratuvar Teknikleri',
      search_queries: [
        'Tıbbi Laboratuvar Teknikleri yaz stajı',
        'TLT zorunlu yaz stajı var mı?'
      ],
      must_have_terms: ['staj', 'Tıbbi Laboratuvar Teknikleri'],
      answer: 'Bu cevap kullanılmamalı'
    }) } }],
    usage: { prompt_tokens: 44, completion_tokens: 18, total_tokens: 62 }
  })

  const plan = await planKnowledgeSearchQuery('Bu programda yaz stajı var mı?', [])

  expect(plan.enabled).toBe(true)
  expect(plan.searchQueries).toEqual([
    'Bu programda yaz stajı var mı?',
    'Tıbbi Laboratuvar Teknikleri yaz stajı',
    'TLT zorunlu yaz stajı var mı?'
  ])
  expect(plan.mustHaveTerms).toEqual(['staj', 'Tıbbi Laboratuvar Teknikleri'])
  expect(plan.usage?.totalTokens).toBe(62)
})
```

- [x] **Step 2: Run planner test and verify RED**

Run: `npm test -- --run src/lib/knowledge-base/query-planner.test.ts`
Expected: FAIL because the module does not exist yet.

- [x] **Step 3: Implement planner module**

Export `planKnowledgeSearchQuery`, `shouldPlanKnowledgeSearchQuery`, and types. Use `gpt-4o-mini` by default, `OPENAI_QUERY_PLANNER_MODEL` override, JSON mode, strict normalization, and failure fallback.

- [x] **Step 4: Run planner tests and verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/query-planner.test.ts`
Expected: PASS.

### Task 2: Retrieval Integration

**Files:**
- Modify: `src/lib/knowledge-base/actions.ts`
- Modify: `src/lib/knowledge-base/actions.test.ts`

- [x] **Step 1: Write failing search integration tests**

Add tests that enable the planner, mock two variants, and assert `searchKnowledgeBase` searches the original query plus variants. Add a failure-path test proving invalid planner output still returns original-query results.

- [x] **Step 2: Run targeted test and verify RED**

Run: `npm test -- --run src/lib/knowledge-base/actions.test.ts -t "query planner"`
Expected: FAIL because search does not call the planner yet.

- [x] **Step 3: Integrate planner into search**

Call `planKnowledgeSearchQuery` at the start of `searchKnowledgeBase`, search each variant through the existing retrieval pipeline, merge through `mergeSearchResults`, and expose optional usage callback in search options.

- [x] **Step 4: Run targeted test and verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/actions.test.ts -t "query planner"`
Expected: PASS.

### Task 3: Pipeline Usage Accounting

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

- [x] **Step 1: Write failing usage test**

Assert the inbound pipeline passes a planner usage callback into `searchKnowledgeBase` and records planner usage with category `router`, model from planner metadata, and `stage: "rag_query_planner"`.

- [x] **Step 2: Run targeted test and verify RED**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts -t "query planner"`
Expected: FAIL because the callback is not wired.

- [x] **Step 3: Wire usage recording**

Pass `queryPlannerUsage` callback in the RAG search options. Use the existing fail-soft `recordInboundAiUsage` helper so usage logging problems do not block grounded answers.

- [x] **Step 4: Run targeted test and verify GREEN**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts -t "query planner"`
Expected: PASS.

### Task 4: Verification and Docs

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Run focused RAG tests**

Run: `npm test -- --run src/lib/knowledge-base/query-planner.test.ts src/lib/knowledge-base/actions.test.ts src/lib/channels/inbound-ai-pipeline.test.ts src/lib/knowledge-base/rag-answer-repair.test.ts src/lib/knowledge-base/rag-source-links.test.ts`
Expected: PASS.

- [x] **Step 2: Run mandatory guardrail tests**

Run: `npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts`
Expected: PASS.

- [x] **Step 3: Run build**

Run: `npm run build`
Expected: PASS.

- [x] **Step 4: Update docs**

Record the planner decision in PRD/Roadmap/Release with emphasis that it is general retrieval planning, not customer-specific hardcoding.
