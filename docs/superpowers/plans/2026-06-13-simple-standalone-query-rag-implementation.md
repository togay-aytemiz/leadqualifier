# Simple Standalone-Query RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the YIU Demo Chat non-Skill path with one standalone-query rewrite, one direct OpenAI Vector Store Search request, one grounded answer-model call, and a small mechanical grounding guard.

**Architecture:** Keep Skills and the Demo Chat route unchanged before the RAG provider boundary. Add a focused `simple-rag` module whose pipeline accepts the latest message, explicit pending-clarification state, recent history, tenant settings, and an injected OpenAI client; it rewrites once, searches once, answers once, and validates selected chunks and protected values without polish, retry, table fast paths, or runtime judges.

**Tech Stack:** TypeScript, OpenAI Node SDK 6.x, Next.js App Router, Vitest.

---

## File Structure

- Create `src/lib/knowledge-base/simple-rag/contracts.ts`: small rewriter and answer payload types plus strict parsers.
- Create `src/lib/knowledge-base/simple-rag/query-rewriter.ts`: one LLM call that returns `search`, `clarify`, or `refuse` and never answers institutional facts.
- Create `src/lib/knowledge-base/simple-rag/vector-search.ts`: one direct `vectorStores.search` call and source-manifest mapping.
- Create `src/lib/knowledge-base/simple-rag/answer-generator.ts`: one grounded answer call plus mechanical chunk/value validation.
- Create `src/lib/knowledge-base/simple-rag/pipeline.ts`: orchestration and `RagProviderResult` diagnostics.
- Create focused sibling test files for each module.
- Modify `src/lib/demo-chat/openai-file-search.ts`: invoke only the new pipeline for enabled demo slugs and pass explicit clarification state separately from history.
- Modify `src/lib/demo-chat/openai-file-search.test.ts`: assert the simple pipeline contract and metadata.
- Modify `docs/ROADMAP.md`, `docs/PRD.md`, and `docs/RELEASE.md`: record the completed implementation.

### Task 1: Standalone Query Rewriter

**Files:**
- Create: `src/lib/knowledge-base/simple-rag/contracts.ts`
- Create: `src/lib/knowledge-base/simple-rag/query-rewriter.ts`
- Test: `src/lib/knowledge-base/simple-rag/query-rewriter.test.ts`

- [x] **Step 1: Write the failing tests**

Cover these behaviors with injected completions:

```ts
it('uses history only to resolve the latest referential question', async () => {
  const result = await rewriteSimpleRagQuery({
    latestUserMessage: 'Peki bunun fiyatı ne?',
    recentMessages: [
      { role: 'user', content: 'İngilizce Tıp programını soruyorum' },
      { role: 'assistant', content: 'İngilizce Tıp hakkında yardımcı olabilirim.' },
    ],
    responseLanguage: 'tr',
    createCompletion,
  })
  expect(result.plan).toEqual({
    status: 'search',
    standaloneQuery: 'İngilizce Tıp programının ücreti nedir?',
    responseLanguage: 'tr',
  })
})

it('returns one specific clarification when the subject cannot be resolved', async () => {
  expect(result.plan.status).toBe('clarify')
})
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/query-rewriter.test.ts`

Expected: FAIL because `rewriteSimpleRagQuery` and its contracts do not exist.

- [x] **Step 3: Implement the minimal rewriter**

Use a JSON-only prompt with these constraints:

```text
Rewrite the latest user question into one standalone search query.
Use explicit state and recent history only to resolve references.
Do not answer the question. Do not emit synonyms or query lists.
Return search, clarify, or refuse JSON only.
```

Limit history to the last six non-empty turns. Include pending clarification state as a separate labeled JSON object. Parse only these shapes:

```ts
type SimpleRagRewritePlan =
  | { status: 'search'; standaloneQuery: string; responseLanguage: MvpResponseLanguage }
  | { status: 'clarify'; clarificationQuestion: string; missingSlot: string; responseLanguage: MvpResponseLanguage }
  | { status: 'refuse'; refusalResponse: string; responseLanguage: MvpResponseLanguage }
```

- [x] **Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/query-rewriter.test.ts`

Expected: PASS.

### Task 2: Direct Vector Store Search

**Files:**
- Create: `src/lib/knowledge-base/simple-rag/vector-search.ts`
- Test: `src/lib/knowledge-base/simple-rag/vector-search.test.ts`

- [x] **Step 1: Write the failing test**

```ts
it('sends only the standalone query to direct vector store search', async () => {
  await searchSimpleRagVectorStore({
    client,
    vectorStoreId: 'vs_yiu',
    standaloneQuery: 'İngilizce Tıp programının ücreti nedir?',
    citationSourcesByFilename,
  })

  expect(search).toHaveBeenCalledWith('vs_yiu', {
    query: 'İngilizce Tıp programının ücreti nedir?',
    rewrite_query: false,
    max_num_results: 12,
    ranking_options: { ranker: 'auto', score_threshold: 0.1 },
  })
})
```

Also assert that result groups become stable `C1`, `C2` chunks, preserve score/title/URL, and never include raw history in the request.

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/vector-search.test.ts`

Expected: FAIL because direct search does not exist.

- [x] **Step 3: Implement the direct search adapter**

Call exactly:

```ts
client.vectorStores.search(vectorStoreId, {
  query: standaloneQuery,
  rewrite_query: false,
  max_num_results: maxResults,
  ranking_options: { ranker: 'auto', score_threshold },
})
```

Flatten each returned result group's text content into one chunk, deduplicate by file ID plus normalized text, and map canonical source title/URL from the existing manifest by filename.

- [x] **Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/vector-search.test.ts`

Expected: PASS.

### Task 3: One Grounded Answer Generator And Guard

**Files:**
- Create: `src/lib/knowledge-base/simple-rag/answer-generator.ts`
- Test: `src/lib/knowledge-base/simple-rag/answer-generator.test.ts`

- [x] **Step 1: Write failing tests**

Cover:

```ts
it('answers from selected chunks and receives history only as continuity context', async () => {
  expect(result.status).toBe('answer')
  expect(result.usedChunkIds).toEqual(['C1'])
})

it('rejects an answer that invents a protected numeric value', async () => {
  expect(result.status).toBe('no_info')
})

it('rejects unknown chunk ids', async () => {
  expect(result.status).toBe('no_info')
})
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/answer-generator.test.ts`

Expected: FAIL because the answer generator does not exist.

- [x] **Step 3: Implement the minimal answer generator**

The model receives latest question, standalone query, explicit state, six recent turns for continuity, and labeled chunks. Return JSON only:

```json
{"status":"answer","answer":"...","used_chunk_ids":["C1"]}
```

Allow `clarify`, `no_info`, and `refuse`. Validate that every selected ID exists and that numbers, dates, prices, phones, emails, and URLs in the answer appear in selected chunks or the user question. Reject internal mechanics such as chunk/evidence labels. Do not rewrite rejected prose and do not run a second model call.

- [x] **Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/answer-generator.test.ts`

Expected: PASS.

### Task 4: Simple Pipeline And Demo Chat Switch

**Files:**
- Create: `src/lib/knowledge-base/simple-rag/pipeline.ts`
- Test: `src/lib/knowledge-base/simple-rag/pipeline.test.ts`
- Modify: `src/lib/demo-chat/openai-file-search.ts`
- Modify: `src/lib/demo-chat/openai-file-search.test.ts`

- [x] **Step 1: Write failing pipeline tests**

Assert:

```ts
expect(rewriteCompletion).toHaveBeenCalledTimes(1)
expect(vectorSearch).toHaveBeenCalledTimes(1)
expect(answerCompletion).toHaveBeenCalledTimes(1)
expect(result.diagnostics).toMatchObject({
  queryIntent: 'simple_rag_search',
  contextualRetrievalIntent: 'İngilizce Tıp programının ücreti nedir?',
  retryCount: 0,
  strictVerdict: 'verified_evidence_answer',
})
```

Add clarification, no-results, no-info, and refusal cases. No-results must return `refusal:false` and the specific approved-source no-info message.

- [x] **Step 2: Run the pipeline test and verify RED**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/pipeline.test.ts`

Expected: FAIL because the orchestrator does not exist.

- [x] **Step 3: Implement orchestration**

Implement only:

```text
rewrite -> clarify/refuse or search -> answer -> return
```

Append canonical source URLs selected by the answer generator. Aggregate the two model-call usages. Diagnostics record standalone query, result count, top scores, selected chunk IDs/files, answer status, and timings. Do not import the legacy planner, File Search Responses tool adapter, table facts, polish, retry, or judge modules.

- [x] **Step 4: Run the pipeline test and verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/pipeline.test.ts`

Expected: PASS.

- [x] **Step 5: Switch the Demo Chat provider with a failing wrapper test first**

Change the wrapper test mock from `runLlmFirstFileSearchPipeline` to `runSimpleRagPipeline`. Assert that `pendingClarification`, full ordered history, `maxResults:12`, and `scoreThreshold:0.1` are forwarded, and that metadata says `pipeline_version:'simple_standalone_query_v1'` with no `final_polish` field.

Run: `npm test -- --run src/lib/demo-chat/openai-file-search.test.ts`

Expected before production edit: FAIL because the wrapper still imports the legacy pipeline.

- [x] **Step 6: Modify the wrapper and verify GREEN**

Replace the legacy pipeline import and arguments. Keep the public function name and provider boundary stable so the route does not need semantic changes.

Run: `npm test -- --run src/lib/demo-chat/openai-file-search.test.ts`

Expected: PASS.

### Task 5: Regression Verification, Documentation, And Commit

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Run focused simple-pipeline tests**

Run:

```bash
npm test -- --run \
  src/lib/knowledge-base/simple-rag/query-rewriter.test.ts \
  src/lib/knowledge-base/simple-rag/vector-search.test.ts \
  src/lib/knowledge-base/simple-rag/answer-generator.test.ts \
  src/lib/knowledge-base/simple-rag/pipeline.test.ts \
  src/lib/demo-chat/openai-file-search.test.ts
```

Expected: all pass.

- [x] **Step 2: Run mandatory intake/guard regressions**

Run:

```bash
npm test -- --run src/lib/ai/followup.test.ts
npm test -- --run src/lib/ai/response-guards.test.ts
```

Expected: all pass.

- [x] **Step 3: Update project documents**

Mark the simple pipeline roadmap items complete, update PRD and roadmap dates to `2026-06-13`, and add implementation details under `[Unreleased]` in release notes.

- [x] **Step 4: Run build verification**

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 5: Inspect and commit**

Run:

```bash
git diff --check
git status --short
git diff --stat
git add src/lib/knowledge-base/simple-rag src/lib/demo-chat/openai-file-search.ts src/lib/demo-chat/openai-file-search.test.ts docs/ROADMAP.md docs/PRD.md docs/RELEASE.md docs/superpowers/plans/2026-06-13-simple-standalone-query-rag-implementation.md
git commit -m "refactor: simplify demo rag pipeline"
```

Expected: one focused commit with the new active non-Skill path and required documentation.
