# File Search Validated RAG Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local benchmark provider that runs OpenAI File Search retrieval through Qualy's Evidence Pack grounded answer and validation pipeline before source links are appended.

**Architecture:** Keep production/demo routing unchanged. Reuse the existing File Search Responses API adapter for retrieval, convert `file_search_call.results` into `RagChunk` objects, build an Evidence Pack, generate a grounded answer from evidence ids, validate critical facts through the existing answerer, and append citations only from selected evidence source chunks. Expose this as `openai_file_search_validated` in the local `rag:eval` runner so it can be compared against current RAG and raw File Search.

**Tech Stack:** TypeScript, Vitest, OpenAI Node SDK `openai@6.17.0`, Responses API `file_search`, existing `evidence-pack.ts`, existing `rag-answer-generate.ts`.

---

### Task 1: Provider Type And Tests

**Files:**

- Modify: `src/lib/knowledge-base/rag-eval/types.ts`
- Test: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts` with tests that assert:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runOpenAiFileSearchValidatedQuestion } from './openai-file-search-validated'

describe('runOpenAiFileSearchValidatedQuestion', () => {
  it('retrieves File Search results, generates from evidence, and cites selected sources', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          results: [
            {
              file_id: 'file_1',
              filename: 'izin.pdf',
              score: 0.9,
              text: 'Ücretsiz izin en fazla 1 yıl olabilir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Ücretsiz izin en fazla 1 yıl olabilir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: ['Ücretsiz izin en fazla 1 yıl olabilir.'],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Ücretsiz izin sınırı ne?',
      createCompletion,
      citationSourcesByFilename: {
        'izin.pdf': {
          title: 'İzin Kullanımı Yönergesi',
          url: 'https://example.edu.tr/izin.pdf',
        },
      },
    })

    expect(result.provider).toBe('openai_file_search_validated')
    expect(result.answer).toBe(
      'Ücretsiz izin en fazla 1 yıl olabilir.\nhttps://example.edu.tr/izin.pdf'
    )
    expect(result.citations).toMatchObject([
      {
        providerSourceId: 'file_1',
        title: 'İzin Kullanımı Yönergesi',
        url: 'https://example.edu.tr/izin.pdf',
      },
    ])
    expect(result.usage.toolCalls).toBe(1)
  })

  it('refuses when retrieval has no usable evidence', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', results: [] }],
      usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'BİDB e-postası nedir?',
    })

    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('net bir bilgi bulunmamaktadır')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts
```

Expected: fail because `openai-file-search-validated.ts` and `openai_file_search_validated` provider type do not exist yet.

- [ ] **Step 3: Add provider type**

Change `RagAnswerProvider` to:

```ts
export type RagAnswerProvider =
  | 'current_rag'
  | 'openai_file_search'
  | 'openai_file_search_validated'
```

### Task 2: Validated Provider

**Files:**

- Create: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search.ts`
- Test: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [ ] **Step 1: Export retrieval helpers from raw File Search adapter**

Export the response item/result types that are needed to turn File Search results into chunks, plus the citation mapper/tool-call counter/refusal helper where useful.

- [ ] **Step 2: Implement the validated provider**

Create `openai-file-search-validated.ts` with:

- a retrieval-only Responses API call that includes `file_search_call.results`;
- conversion from File Search results to `RagChunk`;
- `buildRagEvidencePack`;
- `generateGroundedRagAnswer`;
- source append from selected grounded citations only;
- refusal fallback when no evidence or validation fails.

- [ ] **Step 3: Run tests**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts src/lib/knowledge-base/rag-eval/openai-file-search.test.ts src/lib/knowledge-base/rag-eval/evaluator.test.ts
```

Expected: all tests pass.

### Task 3: Eval Runner Integration

**Files:**

- Modify: `scripts/knowledge/rag-eval-runner.ts`
- Test: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [ ] **Step 1: Add provider mode**

Support `--provider file-search-validated`, and include it in comparison summaries when present.

- [ ] **Step 2: Wire runner inputs**

Pass model, vector store id, max results, File Search profile, source manifest mapping, and an optional answer model env `OPENAI_FILE_SEARCH_VALIDATED_ANSWER_MODEL` to the validated provider.

- [ ] **Step 3: Run scenario benchmark**

Run:

```bash
npm run rag:eval -- --provider file-search-validated --cases tmp/rag-evals/yiu-link-pdfs/scenario-cases.json --vector-store vs_6a2026b9e1fc8191afc0e36062682bd4 --out tmp/rag-evals/yiu-link-pdfs --max-results 8 --file-search-profile qualy --source-manifest tmp/rag-evals/yiu-link-pdfs/manifest.json
```

Expected: a Markdown and JSON report for the validated provider.

### Task 4: Documentation And Verification

**Files:**

- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`
- Modify: `docs/plans/2026-06-03-openai-file-search-rag-migration-strategy.md`

- [ ] **Step 1: Document the result**

Record the validated provider report path, score, latency, and rollout interpretation.

- [ ] **Step 2: Verify**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts src/lib/knowledge-base/rag-eval/openai-file-search.test.ts src/lib/knowledge-base/rag-eval/evaluator.test.ts src/lib/knowledge-base/rag-eval/manifest.test.ts
npm run build
git diff --check
```

Expected: all commands exit `0`.

## Execution Addendum — 2026-06-03

- Implemented `openai_file_search_validated` as a local-only eval provider.
- Added `rag:eval --provider file-search-validated` and `--provider compare-all` support.
- Verified TDD coverage for:
  - File Search result to Evidence Pack answer flow;
  - empty retrieval refusal;
  - supported raw answer fallback;
  - generic institution footer contact rejection;
  - no-clear raw answer canonicalization;
  - critical-answer-value citation selection.
- Ran the YİÜ 25-question scenario benchmark:
  - Report: `tmp/rag-evals/yiu-link-pdfs/rag-eval-file-search-validated-2026-06-03T20-16-23-927Z.md`
  - Result: 21/25 overall, 14/18 supported, 7/7 unsupported/contact.
- Decision: keep this benchmark-only. Next quality step is targeted retry for supported exact-source misses before any preview or production provider flag.
