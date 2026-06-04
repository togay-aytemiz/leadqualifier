# OpenAI File Search RAG Migration Strategy

> Status: Local benchmark completed; rollout decision pending.
> Owner: Product/engineering.
> Date: 2026-06-03.
> Production impact target: zero until explicit rollout approval.

## Goal

Qualy currently has a custom Supabase pgvector RAG stack with evidence packs, source validation, repair, polish, and usage metering. The customer demo still reports wrong or missing information in some cases, so we will test OpenAI File Search as an alternative retrieval provider before changing the customer-facing pipeline.

The first milestone is not an agent migration. The first milestone is a controlled benchmark:

- run the same curated question set against the current Qualy RAG provider;
- run the same question set against an OpenAI File Search provider;
- measure answer correctness, source correctness, refusal behavior, latency, and cost;
- decide whether File Search should become a fallback, a selectable provider, or the default provider.

## External References

- OpenAI File Search guide: https://platform.openai.com/docs/guides/tools-file-search/
- OpenAI Vector Stores API: https://platform.openai.com/docs/api-reference/vector-stores
- OpenAI pricing: https://platform.openai.com/docs/pricing/
- Netlify Deploy Previews: https://docs.netlify.com/site-deploys/deploy-previews/
- Netlify deploy contexts: https://docs.netlify.com/deploy/deploy-overview/#deploy-contexts
- Netlify environment variables: https://docs.netlify.com/build/environment-variables/overview/

## Migration Principles

- Keep the live customer demo on the current RAG path until a measured rollout decision is made.
- Work on a separate branch, preferably `codex/file-search-rag-spike`.
- Prefer local scripts and local reports before any deploy.
- Do not deploy Supabase Edge Functions from the spike branch unless the target is an isolated staging project or the user explicitly approves production-impacting deploy steps.
- Do not publish a Netlify production deploy from the spike branch.
- Use Netlify Deploy Previews or branch deploys only after local benchmark output is acceptable.
- Do not upload every PDF from the demo organization's TMP folder automatically.
- Upload only the user-approved PDF/story set for the specific test batch.
- Make the experiment agent-ready by designing a clean `knowledge_search` provider boundary, but do not introduce the full agent backbone in this phase.

## What File Search Changes

OpenAI File Search moves parsing, chunking, embedding, indexing, semantic search, keyword search, and search result ranking into OpenAI vector stores. It does not automatically solve lead extraction, handoff decisions, or conversation policy. Those remain Qualy responsibilities.

| Concern           | Current Qualy RAG                                         | OpenAI File Search Spike                                        |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Corpus storage    | Supabase `knowledge_documents` and `knowledge_chunks`     | OpenAI vector store                                             |
| Retrieval         | pgvector plus lexical/title/source/focused evidence merge | Hosted File Search retrieval                                    |
| Answer generation | Qualy prompts, evidence ids, repair, polish               | Responses API with `file_search`, then Qualy validation wrapper |
| Source metadata   | Document/chunk ids and source URLs controlled by Qualy    | File citations and optionally included search results           |
| Tenant isolation  | Supabase RLS and organization ids                         | Separate vector stores and metadata filters                     |
| Cost accounting   | Existing model/embedding usage ledger                     | Model tokens plus File Search storage/tool-call costs           |
| Agent readiness   | Current route-bound pipeline                              | Provider can become a future `knowledge_search` tool            |

## Non-Goals

- No production demo provider switch in the first milestone.
- No full Agents SDK or agent-router migration in the first milestone.
- No automatic bulk upload of every TMP PDF.
- No customer billing impact until File Search costs are captured in usage metadata and credit math.
- No removal of the current Supabase RAG path.

## Target Architecture

The experiment should introduce a provider boundary that can later be used by an agent tool:

```ts
type KnowledgeAnswerProvider = 'current_rag' | 'openai_file_search'

type KnowledgeAnswerRequest = {
  organizationId: string
  conversationId?: string
  question: string
  localeHint?: 'tr' | 'en'
  recentTurns?: Array<{ role: 'user' | 'assistant'; content: string }>
  corpusScope?: {
    vectorStoreId?: string
    documentIds?: string[]
    fileIds?: string[]
    tags?: string[]
  }
}

type KnowledgeAnswerResult = {
  provider: KnowledgeAnswerProvider
  answer: string
  answerLanguage: 'tr' | 'en' | 'unknown'
  citations: Array<{
    providerSourceId: string
    title?: string
    url?: string
    quote?: string
  }>
  refusal: boolean
  timingsMs: {
    total: number
    retrieval?: number
    generation?: number
    validation?: number
  }
  usage: {
    inputTokens?: number
    outputTokens?: number
    toolCalls?: number
    storageGbDayEstimate?: number
    estimatedCredits?: number
  }
  rawProviderTracePath?: string
}
```

The future agent backbone can expose this as a `knowledge_search` tool without caring whether the underlying provider is Supabase RAG, OpenAI File Search, or a hybrid provider.

## Environment Strategy

| Environment                 | Purpose                                                        | Allowed behavior                                                       |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Local branch                | Build uploader, runner, and reports                            | Reads Supabase/source files, creates/deletes test OpenAI vector stores |
| Local `.env`                | Holds OpenAI key and test vector store ids                     | Never committed                                                        |
| Netlify Deploy Preview      | Optional after local confidence                                | Test-only flags, no production provider switch                         |
| Production Netlify          | Out of scope until explicit approval                           | Current RAG remains default                                            |
| Supabase production project | Read-only for benchmark source data unless explicitly approved | No Edge Function deploy from spike branch                              |

Suggested flags:

```env
RAG_PROVIDER=current
RAG_FILE_SEARCH_EXPERIMENT=0
RAG_COMPARE_OUTPUT_DIR=tmp/rag-evals
OPENAI_FILE_SEARCH_VECTOR_STORE_ID=
OPENAI_FILE_SEARCH_MAX_RESULTS=8
OPENAI_FILE_SEARCH_MODEL=gpt-4.1-mini
```

Default behavior must remain `current`.

## PDF And Story Selection

The first approved test batch is limited to the PDFs linked from:

- https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat
- https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/mevzuatlar/yonergeler

Local outputs:

- PDF manifest: `tmp/rag-evals/yiu-link-pdfs/manifest.json`
- Downloaded PDFs: `tmp/rag-evals/yiu-link-pdfs/files/`
- OpenAI File Search ingest output: `tmp/rag-evals/yiu-link-pdfs/file-search-ingest-yiu-link-pdfs-2026-06-03T13-06-01-528Z.json`
- Temporary vector store: `vs_6a2026b9e1fc8191afc0e36062682bd4`

Expected mapping format:

```json
{
  "story": "yiu-health-report-and-exam-rules",
  "notes": "Only the documents approved for this test batch.",
  "files": [
    {
      "label": "Mazeret sınavı yönergesi",
      "localPath": "tmp/...",
      "expectedTopics": ["health report", "make-up exam", "deadline"]
    }
  ]
}
```

Checklist:

- [x] User provides the first story/source scope: YİÜ mevzuat link PDFs.
- [x] User provides the exact PDF source pages for that story.
- [x] Confirm that no extra TMP files are included.
- [x] Create a temporary OpenAI vector store for that story.
- [x] Upload only approved files.
- [x] Record OpenAI file ids and vector store id in local uncommitted output.
- [ ] Delete or archive the test vector store after the experiment decision.

## Evaluation Dataset

The first benchmark should use around 50 questions. It should include customer-reported failures first, then known regression categories.

Case shape:

```json
{
  "id": "rag-yiu-001",
  "question": "Sağlık raporu bütünlemeye girmeyi sağlar mı?",
  "language": "tr",
  "category": "policy_pdf",
  "expectedAnswerTerms": ["mazeret", "bütünleme", "sağlık raporu"],
  "expectedSources": ["approved PDF title or source URL"],
  "mustNotContain": ["unsupported claim"],
  "notes": "Real customer/demo complaint if available."
}
```

Required categories:

- [ ] Customer-reported wrong-answer examples.
- [ ] Exact PDF policy questions.
- [ ] Contact/e-mail/phone questions.
- [ ] Acronym/program questions.
- [ ] Campus/address/location questions.
- [ ] Lecture notes/platform/material questions.
- [ ] Multi-subject or compound questions.
- [ ] Contextual follow-ups, for example `bu program`.
- [ ] Unsupported questions that should refuse or hand off.
- [ ] Turkish ASCII/no-diacritic wording.

## Metrics

Each provider result must capture:

- `answer_correct`: whether the answer satisfies the expected fact.
- `source_correct`: whether the cited source actually supports the answer.
- `no_hallucination`: whether unsupported facts are absent.
- `refusal_correct`: whether unsupported questions refuse instead of guessing.
- `answer_language_correct`: Turkish stays Turkish, English stays English.
- `latency_total_ms`: end-to-end wall time.
- `latency_retrieval_ms`: search/tool-call portion when available.
- `latency_generation_ms`: model answer portion when available.
- `input_tokens` and `output_tokens`.
- `file_search_tool_calls`.
- `estimated_file_search_cost_usd`.
- `estimated_model_cost_usd`.
- `estimated_qualy_credits`.

Report summary must include:

- [x] pass/fail count by provider;
- [x] source correctness count by provider;
- [x] P50/P75/P95 latency by provider;
- [x] average and max latency by provider;
- [x] estimated cost per answer by provider;
- [ ] cases where current RAG wins;
- [ ] cases where File Search wins;
- [ ] cases where both fail;
- [ ] recommendation: keep current, fallback-only, compare-mode, or default switch.

## First Benchmark Result

Run date: 2026-06-03.

Question/answer report:
`tmp/rag-evals/yiu-link-pdfs/rag-eval-compare-2026-06-03T13-13-50-146Z-replay.md`

JSON report:
`tmp/rag-evals/yiu-link-pdfs/rag-eval-compare-2026-06-03T13-13-50-146Z-replay.json`

The report is a replay of the original API run after improving source-title matching for File Search slug filenames. No new model calls were made for the replay.

| Provider             | Passed | Avg latency |    P50 |    P75 |    P95 |    Max | Total credits | Avg credits |
| -------------------- | -----: | ----------: | -----: | -----: | -----: | -----: | ------------: | ----------: |
| Current Supabase RAG |  43/50 |     15.19 s | 13.71s | 16.58s | 27.63s | 29.62s |         176.7 |        3.53 |
| OpenAI File Search   |  41/50 |      6.56 s |  5.73s |  6.84s |  9.27s | 35.99s |         120.5 |        2.41 |

Additional notes:

- Current RAG had 3 answer-term failures and 4 source-term failures.
- File Search had 5 answer-term failures and 8 source-term failures after slug/source normalization.
- File Search was materially faster on average, but one outlier took 35.99s.
- The result is close enough to justify manual disagreement review, but not enough for an automatic default-provider switch.

### Scenario Benchmark Replay

Run date: 2026-06-03.

Question/answer report:
`tmp/rag-evals/yiu-link-pdfs/rag-eval-compare-2026-06-03T14-38-19-526Z-replay.md`

JSON report:
`tmp/rag-evals/yiu-link-pdfs/rag-eval-compare-2026-06-03T14-38-19-526Z-replay.json`

The second benchmark adds 25 realistic questions over the same approved PDF corpus: conversational policy questions, acronym/explanation prompts, an explicit source-link request, a Qualy-tone prompt, and unsupported contact/price/deadline/location questions. It uses the File Search `qualy` instruction profile and manifest-based citation URL mapping. The report is a replay of the original scenario API run after improving any-of source matching and Turkish refusal detection; no new model calls were made for the replay.

| Provider             | Passed | Supported | Unsupported | Avg latency |    P50 |    P75 |    P95 |    Max | Total credits | Avg credits |
| -------------------- | -----: | --------: | ----------: | ----------: | -----: | -----: | -----: | -----: | ------------: | ----------: |
| Current Supabase RAG |  12/25 |     12/18 |         0/7 |     15.41 s | 12.27s | 14.82s | 44.16s | 44.19s |          94.7 |        3.79 |
| OpenAI File Search   |  18/25 |     16/18 |         2/7 |      6.51 s |  6.35s |  6.90s |  9.09s | 10.86s |          59.8 |        2.39 |

Scenario findings:

- File Search clearly improves supported-document recall for natural questions like free leave duration, health-report exam validity, intern continuity, BAP, AKTS, and Qualy-tone wording.
- The original BİDB failure was an evaluator-definition issue: the answer was correct, but the expected source list was modeled as all-required instead of any acceptable BİDB source.
- File Search source URLs should be displayed by mapping cited filenames/file ids through the approved PDF manifest. The model answer itself still uses internal citation markers and should not be trusted to invent public URLs.
- Unsupported/contact questions remain the rollout blocker. File Search still invented or overextended adjacent evidence for MEDU, BİDB e-mail/phone, Diş Hekimliği staj duration, and mezuniyet location-adjacent information. Current RAG also failed all unsupported cases.
- Recommended next step: keep File Search as a candidate retrieval/answer provider, but wrap it in a Qualy answer validator/repair layer before any preview/provider flag. The validator must reject unsupported/contact inventions and trim adjacent-source filler after a no-clear-information sentence.

### Validated File Search Provider Benchmark

Run date: 2026-06-03.

Question/answer report:
`tmp/rag-evals/yiu-link-pdfs/rag-eval-file-search-validated-2026-06-03T20-16-23-927Z.md`

JSON report:
`tmp/rag-evals/yiu-link-pdfs/rag-eval-file-search-validated-2026-06-03T20-16-23-927Z.json`

This run adds `openai_file_search_validated`, a local-only provider that uses File Search for retrieval, converts `file_search_call.results` into `RagChunk` evidence inputs, runs Qualy's Evidence Pack grounded answerer, validates critical values, rejects generic institution footer contacts, canonicalizes no-clear answers, and appends source URLs only from selected/supporting citations.

| Provider                     | Passed | Supported | Unsupported | Avg latency |    P50 |    P75 |    P95 |    Max | Total credits | Avg credits |
| ---------------------------- | -----: | --------: | ----------: | ----------: | -----: | -----: | -----: | -----: | ------------: | ----------: |
| Current Supabase RAG         |  12/25 |     12/18 |         0/7 |     15.41 s | 12.27s | 14.82s | 44.16s | 44.19s |          94.7 |        3.79 |
| OpenAI File Search           |  18/25 |     16/18 |         2/7 |      6.51 s |  6.35s |  6.90s |  9.09s | 10.86s |          59.8 |        2.39 |
| OpenAI File Search Validated |  21/25 |     14/18 |         7/7 |      8.37 s |  7.73s |  9.48s | 10.88s | 20.42s |          69.4 |        2.78 |

Validated-provider findings:

- The validation pipeline fixes the biggest raw File Search rollout blocker: unsupported/contact safety improved from 2/7 to 7/7 on the scenario set.
- Supported quality remains useful but is lower than raw File Search in this run because exact-source misses and retrieval variance now fail closed instead of passing with adjacent evidence.
- Remaining failures are not hallucination failures. They are targeted-retry candidates: health-report source expectation, online-exam acceptance date, special-student source title alignment, and Erasmus source-link retrieval miss.
- Recommendation: next implement a narrow retry loop before preview rollout. Retry should use expected/derived document-title intent, citation-title filters, or a second File Search query when the first validated pass refuses a supported-looking question or cites the wrong source family.

## Acceptance Gates

File Search should not move into the customer-facing pipeline unless all of these are true:

- [ ] It wins or ties the current provider on answer correctness for the selected benchmark.
- [ ] It wins or ties the current provider on source correctness.
- [ ] It has zero critical hallucinations in the benchmark.
- [ ] It handles unsupported questions at least as safely as the current provider.
- [ ] Its P95 latency is acceptable for demo and webhook constraints, or the rollout is limited to async/pending paths.
- [ ] File Search tool-call, model-token, and storage costs are captured in usage metadata.
- [ ] Default provider remains `current` until a separate rollout PR changes it.

Decision matrix:

| Result                                                     | Action                                               |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| File Search clearly wins quality and latency is acceptable | Add as feature-flagged provider, then canary         |
| File Search wins quality but is slower                     | Use as fallback/async recovery only                  |
| File Search ties quality but costs more                    | Keep current RAG, maybe retain evaluator             |
| File Search loses source correctness                       | Do not roll out                                      |
| Both providers fail similar cases                          | Fix corpus/story ingestion or question routing first |

## Implementation Checklist

### Phase 0: Branch And Safety

- [x] Create branch `codex/file-search-rag-spike`.
- [x] Confirm current production demo uses `RAG_PROVIDER=current` or no equivalent File Search flag.
- [x] Confirm no Supabase Edge Function deploy is part of local benchmark work.
- [x] Confirm no Netlify production deploy is part of local benchmark work.
- [x] Document required local env values without committing secrets.

### Phase 1: Benchmark Fixtures

- [x] Create a local benchmark case file for the first 50 questions.
- [ ] Include customer-reported wrong-answer cases first.
- [x] Mark expected answer terms and source expectations.
- [x] Mark unsupported/refusal cases explicitly in the scenario benchmark.
- [x] Add a report output folder under `tmp/rag-evals/`.

### Phase 2: Current RAG Baseline Runner

- [x] Build a script that runs the 50 questions through the existing RAG provider.
- [x] Capture answer text, sources, usage, and timing.
- [x] Persist comparison traces to local `tmp/rag-evals/...`.
- [x] Produce a side-by-side baseline report against File Search.

### Phase 3: File Search Ingestion

- [x] Wait for user-provided story/PDF mapping.
- [x] Create one temporary vector store per story or test batch.
- [x] Upload only approved files.
- [x] Add metadata attributes for story and document label where supported by the upload path.
- [x] Save file ids/vector store ids locally only.
- [x] Verify uploaded files are searchable before benchmark execution.

### Phase 4: File Search Provider Runner

- [x] Build a File Search runner using the Responses API with `file_search`.
- [x] Include `file_search_call.results` when needed for source analysis.
- [x] Capture annotations/citations and map them into the common result shape.
- [x] Capture total latency and provider/tool timings where available.
- [x] Capture model usage, File Search tool-call count, and token-weighted Qualy credit estimates.
- [x] Add a validated File Search provider that routes retrieved results through Evidence Pack, grounded answer validation, and selected-citation source append.

### Phase 5: Side-By-Side Comparison

- [x] Run the same 50 cases against both providers.
- [x] Generate a Markdown report.
- [x] Generate a JSON report for future regression tracking.
- [x] Highlight disagreement cases in the scenario replay summary.
- [x] Highlight latency outliers through provider summary and per-question latency rows.
- [x] Highlight high-cost cases through per-question usage rows.

### Phase 6: Review And Decision

- [x] Review the raw and validated scenario reports manually.
- [ ] Mark each case as current wins, File Search wins, tie, or both fail.
- [x] Decide whether the next step is fallback-only, feature-flagged provider, or no rollout.
- [x] Update this checklist with the decision.

Decision: no customer-facing rollout yet. Build targeted retry for the validated provider, then re-run the scenario benchmark. If validated File Search reaches supported parity with raw File Search while preserving unsupported safety, move to a preview-only provider flag.

### Phase 7: Optional Preview Integration

- [ ] Add a test-only admin route or internal script endpoint if local reports are not enough.
- [ ] Keep the public demo route on current RAG by default.
- [ ] Gate provider choice behind env flags.
- [ ] Use Netlify Deploy Preview or branch deploy only.
- [ ] Verify preview env values are scoped to preview/branch context.

### Phase 8: Usage And Billing Integration

- [ ] Add File Search model token usage to `organization_ai_usage` metadata.
- [ ] Add File Search tool-call count to metadata.
- [ ] Add storage estimate or vector-store lifecycle metadata.
- [ ] Convert estimated costs into Qualy credits with the same customer-visible accounting principles.
- [ ] Verify admin usage totals and customer usage history can explain File Search usage.

### Phase 9: Controlled Rollout

- [ ] Keep default provider as current RAG.
- [ ] Enable File Search for one internal/demo organization only.
- [ ] Run a live canary with the approved question set.
- [ ] Compare live latency against local benchmark.
- [ ] Roll back by setting provider flag back to current.
- [ ] Do not merge default-provider changes until a separate rollout review passes.

### Phase 10: Future Agent Backbone

- [ ] Convert the provider boundary into a future `knowledge_search` tool.
- [ ] Keep lead extraction as a separate tool, not part of File Search.
- [ ] Keep handoff/escalation as a separate tool.
- [ ] Add tracing so the agent path shows retrieval, answer, extraction, and handoff decisions separately.
- [ ] Re-run the same benchmark after agent orchestration is introduced to isolate agent impact from retrieval impact.

## Rollback Plan

- If the spike is local-only, delete local output and test vector stores.
- If a preview exists, remove preview-only env flags or stop using the preview URL.
- If a feature flag reaches a deployed branch, set `RAG_PROVIDER=current`.
- If File Search vector stores contain outdated or wrongly scoped PDFs, delete the vector store and recreate it from the approved manifest.
- If production behavior changes unexpectedly, revert the provider selection change first; the current Supabase RAG path must remain intact.

## Open Questions

- [x] Which first story should be tested? YİÜ mevzuat link PDFs.
- [x] Which exact PDFs belong to that story? PDFs linked from the two approved YİÜ pages above.
- [x] Should the first 50 questions include only YİÜ/demo questions, or also cross-sector SMB examples? This first run is YİÜ/demo PDF-only.
- [x] Should File Search be judged as answer generator, retrieval-only provider, or both? This first run judges File Search as retrieval plus answer generator via Responses API.
- [ ] What P95 latency is acceptable for the public demo before pending/polling must be used?
- [ ] How should File Search storage cost be charged if a customer uploads files but receives few messages?

## Working Notes

- The Query Agent prototype should not be the foundation for this work unless it already provides useful fixtures. Build the provider benchmark independently.
- File Search quality should be judged against customer-reported failures first, not synthetic happy-path questions.
- If File Search returns better evidence but weaker final wording, the next design can use File Search retrieval plus Qualy answer validation/repair instead of accepting the raw response.
- If current RAG returns better source fidelity but File Search returns better recall, a hybrid strategy may be better than full replacement.
