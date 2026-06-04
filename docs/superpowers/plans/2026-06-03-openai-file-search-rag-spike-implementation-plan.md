# OpenAI File Search RAG Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, non-production benchmark harness that compares the current Qualy RAG path with OpenAI File Search on the same curated questions, while recording correctness, source, latency, and cost metadata.

**Architecture:** Add a small `rag-eval` module under `src/lib/knowledge-base` for provider-neutral cases/results/scoring, plus scripts under `scripts/knowledge` for local ingestion and benchmark execution. OpenAI File Search is wrapped behind the same provider result shape that a future agent `knowledge_search` tool can consume. Public demo routes, Supabase Edge Functions, and production provider defaults remain unchanged.

**Tech Stack:** TypeScript, Vitest, OpenAI Node SDK `openai@6.17.0`, Responses API `file_search`, OpenAI vector stores, existing Supabase/current RAG utilities.

---

## File Structure

- Create `src/lib/knowledge-base/rag-eval/types.ts`
  - Shared case/result/provider/report types.
- Create `src/lib/knowledge-base/rag-eval/evaluator.ts`
  - Term normalization, answer/source/refusal scoring, latency percentiles, provider comparison summary.
- Create `src/lib/knowledge-base/rag-eval/evaluator.test.ts`
  - TDD coverage for Turkish normalization, expected source checks, unsupported/refusal checks, and latency aggregation.
- Create `src/lib/knowledge-base/rag-eval/manifest.ts`
  - Safe JSON parsing and validation for benchmark case files and story/PDF manifests.
- Create `src/lib/knowledge-base/rag-eval/manifest.test.ts`
  - TDD coverage for rejecting empty case sets, missing PDF files, and accidental bulk TMP manifests.
- Create `src/lib/knowledge-base/rag-eval/openai-file-search.ts`
  - OpenAI Responses API adapter with injectable client for unit tests.
- Create `src/lib/knowledge-base/rag-eval/openai-file-search.test.ts`
  - TDD coverage for request shape, `file_search_call.results` mapping, usage/tool timing fields, and citation extraction.
- Create `scripts/knowledge/rag-eval-runner.ts`
  - Local CLI for running one provider or compare mode from a benchmark case file.
- Create `scripts/knowledge/rag-file-search-ingest.ts`
  - Local CLI for creating a vector store and uploading only user-approved manifest files.
- Create `docs/plans/2026-06-03-openai-file-search-rag-migration-strategy.md`
  - Update checklist as implementation milestones complete.
- Modify `docs/ROADMAP.md`, `docs/PRD.md`, and `docs/RELEASE.md`
  - Record implemented local harness pieces after code lands.

## Task 1: Provider-Neutral Evaluation Types And Scoring

**Files:**

- Create: `src/lib/knowledge-base/rag-eval/types.ts`
- Create: `src/lib/knowledge-base/rag-eval/evaluator.ts`
- Test: `src/lib/knowledge-base/rag-eval/evaluator.test.ts`

- [x] **Step 1: Write failing scoring tests**

```ts
import { describe, expect, it } from 'vitest'
import { evaluateProviderResult, summarizeProviderResults } from './evaluator'
import type { RagEvalCase, RagProviderResult } from './types'

const baseCase: RagEvalCase = {
  id: 'case-1',
  question: 'Tıbbi Laboratuvar Teknikleri yaz stajı kaç iş günü?',
  language: 'tr',
  category: 'policy_pdf',
  expectedAnswerTerms: ['Tıbbi Laboratuvar Teknikleri', '20 iş günü'],
  expectedSourceTerms: ['tlt.pdf'],
  mustNotContain: ['30 iş günü'],
}

const result: RagProviderResult = {
  provider: 'openai_file_search',
  answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
  citations: [
    { providerSourceId: 'file-1', title: 'TLT PDF', url: 'https://example.edu.tr/tlt.pdf' },
  ],
  refusal: false,
  timingsMs: { total: 1234 },
  usage: { inputTokens: 100, outputTokens: 40, toolCalls: 1, estimatedCredits: 0.12 },
}

describe('rag eval scoring', () => {
  it('scores Turkish facts and source terms with normalized matching', () => {
    expect(evaluateProviderResult(baseCase, result)).toMatchObject({
      passed: true,
      answerCorrect: true,
      sourceCorrect: true,
      noHallucination: true,
      refusalCorrect: true,
      missingAnswerTerms: [],
      missingSourceTerms: [],
    })
  })

  it('fails when unsupported cases are answered instead of refused', () => {
    const unsupportedCase = { ...baseCase, unsupported: true, expectedAnswerTerms: [] }
    expect(evaluateProviderResult(unsupportedCase, result)).toMatchObject({
      passed: false,
      refusalCorrect: false,
    })
  })

  it('summarizes provider latency percentiles and cost', () => {
    const summary = summarizeProviderResults([
      { ...result, timingsMs: { total: 100 }, usage: { estimatedCredits: 0.1 } },
      { ...result, timingsMs: { total: 300 }, usage: { estimatedCredits: 0.3 } },
      { ...result, timingsMs: { total: 900 }, usage: { estimatedCredits: 0.9 } },
    ])

    expect(summary).toMatchObject({
      count: 3,
      latencyMs: { p50: 300, p75: 900, p95: 900, max: 900 },
      estimatedCredits: { total: 1.3, average: 0.43333333333333335 },
    })
  })
})
```

- [x] **Step 2: Verify RED**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/evaluator.test.ts`

Expected: fail because `rag-eval/evaluator` and types do not exist.

- [x] **Step 3: Implement minimal types and evaluator**

Implement:

- `RagEvalCase`
- `RagProviderResult`
- `RagEvaluationResult`
- `normalizeForEval`
- `evaluateProviderResult`
- `summarizeProviderResults`

Rules:

- Turkish diacritics normalize safely.
- `expectedAnswerTerms` must all match answer text.
- `expectedSourceTerms` can match citation title, URL, quote, or provider source id.
- `mustNotContain` terms must be absent.
- `unsupported: true` requires `refusal: true`.

- [x] **Step 4: Verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/evaluator.test.ts`

Expected: all tests pass.

## Task 2: Benchmark Case And Story Manifest Validation

**Files:**

- Create: `src/lib/knowledge-base/rag-eval/manifest.ts`
- Test: `src/lib/knowledge-base/rag-eval/manifest.test.ts`

- [x] **Step 1: Write failing manifest tests**

```ts
import { describe, expect, it } from 'vitest'
import { parseBenchmarkCases, parseStoryFileManifest } from './manifest'

describe('rag eval manifests', () => {
  it('parses benchmark cases and rejects empty case lists', () => {
    expect(() => parseBenchmarkCases('[]')).toThrow('at least one benchmark case')
    expect(
      parseBenchmarkCases(
        JSON.stringify([
          {
            id: 'case-1',
            question: 'Soru?',
            language: 'tr',
            category: 'policy_pdf',
            expectedAnswerTerms: ['cevap'],
          },
        ])
      )
    ).toHaveLength(1)
  })

  it('rejects story manifests that try to include a whole TMP folder', () => {
    expect(() =>
      parseStoryFileManifest(
        JSON.stringify({
          story: 'bulk',
          files: [{ label: 'all', localPath: 'tmp/' }],
        }),
        '/repo'
      )
    ).toThrow('exact file path')
  })

  it('parses only explicit approved file paths', () => {
    const parsed = parseStoryFileManifest(
      JSON.stringify({
        story: 'health-report',
        files: [{ label: 'Mazeret sınavı yönergesi', localPath: 'tmp/approved/mazeret.pdf' }],
      }),
      '/repo'
    )

    expect(parsed.files[0]).toMatchObject({
      label: 'Mazeret sınavı yönergesi',
      localPath: '/repo/tmp/approved/mazeret.pdf',
    })
  })
})
```

- [x] **Step 2: Verify RED**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/manifest.test.ts`

Expected: fail because manifest parser does not exist.

- [x] **Step 3: Implement parser and guards**

Implement JSON parsing with explicit errors:

- benchmark case array must be non-empty;
- each case needs `id`, `question`, `language`, `category`;
- story manifest needs `story` and non-empty `files`;
- each file needs `label` and an explicit non-directory `localPath`;
- reject `tmp`, `tmp/`, `tmp/**`, `.`, and directory-looking paths ending in `/`;
- resolve relative paths from the provided workspace root.

- [x] **Step 4: Verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/manifest.test.ts`

Expected: all tests pass.

## Task 3: OpenAI File Search Provider Adapter

**Files:**

- Create: `src/lib/knowledge-base/rag-eval/openai-file-search.ts`
- Test: `src/lib/knowledge-base/rag-eval/openai-file-search.test.ts`

- [x] **Step 1: Write failing adapter tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { runOpenAiFileSearchQuestion } from './openai-file-search'

describe('runOpenAiFileSearchQuestion', () => {
  it('calls Responses API with file_search and maps results into provider shape', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'Cevap metni',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_1',
              filename: 'mazeret.pdf',
              score: 0.91,
              text: 'Mazeret sınavı sağlık raporu ile ilişkilidir.',
              attributes: { story: 'health-report' },
            },
          ],
        },
      ],
      usage: { input_tokens: 120, output_tokens: 45, total_tokens: 165 },
    }))

    const result = await runOpenAiFileSearchQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Sağlık raporu geçerli mi?',
      maxResults: 6,
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        input: 'Sağlık raporu geçerli mi?',
        include: ['file_search_call.results'],
        tools: [
          expect.objectContaining({
            type: 'file_search',
            vector_store_ids: ['vs_123'],
            max_num_results: 6,
          }),
        ],
      })
    )
    expect(result).toMatchObject({
      provider: 'openai_file_search',
      answer: 'Cevap metni',
      citations: [
        {
          providerSourceId: 'file_1',
          title: 'mazeret.pdf',
          quote: 'Mazeret sınavı sağlık raporu ile ilişkilidir.',
        },
      ],
      refusal: false,
      usage: { inputTokens: 120, outputTokens: 45, totalTokens: 165, toolCalls: 1 },
    })
    expect(result.timingsMs.total).toBeGreaterThanOrEqual(0)
  })
})
```

- [x] **Step 2: Verify RED**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search.test.ts`

Expected: fail because adapter does not exist.

- [x] **Step 3: Implement adapter**

Use OpenAI SDK-compatible shape:

```ts
await client.responses.create({
  model,
  input: question,
  instructions:
    'Answer only from File Search results. If the files do not support the answer, say there is no clear information.',
  include: ['file_search_call.results'],
  max_output_tokens: 700,
  tools: [
    {
      type: 'file_search',
      vector_store_ids: [vectorStoreId],
      max_num_results: maxResults,
    },
  ],
})
```

Map `file_search_call.results` into citations. Count one tool call per `file_search_call` output item. Use `output_text` as the answer. Mark `refusal` by simple no-clear-information sentinel matching; deeper refusal scoring remains evaluator-owned.

- [x] **Step 4: Verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search.test.ts`

Expected: all tests pass.

## Task 4: Local CLI Skeletons

**Files:**

- Create: `scripts/knowledge/rag-eval-runner.ts`
- Create: `scripts/knowledge/rag-file-search-ingest.ts`
- Optionally modify: `package.json`

- [x] **Step 1: Add CLIs without production wiring**

`rag-eval-runner.ts` must:

- load `.env`, `.env.local`, `.env.development.local` without printing secrets;
- accept `--cases`, `--provider`, `--vector-store`, `--out`;
- require `OPENAI_API_KEY` only when provider includes File Search;
- write JSON and Markdown reports under `tmp/rag-evals/`;
- refuse `compare` mode until the current provider adapter is implemented.

`rag-file-search-ingest.ts` must:

- accept `--manifest`;
- parse story manifest;
- create a vector store with `expires_after: { anchor: 'last_active_at', days: 7 }`;
- upload only listed files;
- attach file attributes with story and label;
- write local output with vector store id and file ids under `tmp/rag-evals/`;
- never scan TMP folders automatically.

- [x] **Step 2: Typecheck through build**

Run: `npm run build`

Expected: build passes.

## Task 5: Documentation And Checklist Updates

**Files:**

- Modify: `docs/plans/2026-06-03-openai-file-search-rag-migration-strategy.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Mark completed local-harness items**

Update the migration strategy checklist for:

- branch created;
- implementation plan created;
- evaluation types/scoring created;
- manifest validation created;
- File Search adapter skeleton created;
- local CLIs created.

- [x] **Step 2: Run verification**

Run:

```bash
npm test -- --run \
  src/lib/knowledge-base/rag-eval/evaluator.test.ts \
  src/lib/knowledge-base/rag-eval/manifest.test.ts \
  src/lib/knowledge-base/rag-eval/openai-file-search.test.ts
npm run build
```

Expected: targeted tests and build pass.

## Self-Review

- Spec coverage: The plan covers branch safety, local-only benchmark, user-approved PDF manifest, latency/cost metrics, File Search provider boundary, and future agent compatibility.
- Placeholder scan: No TBD/TODO placeholders are present; every task has exact files, commands, and expected behavior.
- Type consistency: The shared `RagProviderResult` shape is used by evaluator and File Search adapter; scripts consume the same manifest and case parsers.

## Execution Addendum — 2026-06-03

- Downloaded 113 PDFs from the two user-approved YİÜ mevzuat pages into `tmp/rag-evals/yiu-link-pdfs/files/`.
- Generated the PDF-limited 50-question benchmark at `tmp/rag-evals/yiu-link-pdfs/cases.json`.
- Indexed the approved PDF set into temporary OpenAI vector store `vs_6a2026b9e1fc8191afc0e36062682bd4`.
- Used individual `vectorStores.files.create/retrieve` polling for indexing because larger `file_batches` requests remained stuck at `0/N` indexed during local testing.
- Ran the side-by-side current RAG vs OpenAI File Search comparison and wrote the full question/answer report to `tmp/rag-evals/yiu-link-pdfs/rag-eval-compare-2026-06-03T13-13-50-146Z-replay.md`.
- First normalized result: current Supabase RAG passed 43/50; OpenAI File Search passed 41/50; File Search averaged 6.56s and 2.41 estimated credits per answer versus current RAG at 15.19s and 3.53 estimated credits.
- Added a second 25-question realistic scenario set at `tmp/rag-evals/yiu-link-pdfs/scenario-cases.json` with supported natural-language questions, source-link/tone prompts, and unsupported contact/price/deadline/location probes.
- Added the File Search `qualy` instruction profile, manifest-based citation URL mapping, any-of source expectations, Turkish no-clear-information replay detection, and punctuation-safe forbidden-term matching.
- Replayed the scenario run to `tmp/rag-evals/yiu-link-pdfs/rag-eval-compare-2026-06-03T14-38-19-526Z-replay.md`: current Supabase RAG passed 12/25 and OpenAI File Search passed 18/25. File Search was stronger and faster on supported PDF questions, but unsafe unsupported/contact completions still require a Qualy validation/repair layer before any provider switch.
