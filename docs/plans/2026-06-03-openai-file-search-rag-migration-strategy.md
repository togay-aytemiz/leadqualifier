# OpenAI File Search RAG Migration Strategy

> Status: Draft strategy for isolated local experimentation.
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

| Concern | Current Qualy RAG | OpenAI File Search Spike |
| --- | --- | --- |
| Corpus storage | Supabase `knowledge_documents` and `knowledge_chunks` | OpenAI vector store |
| Retrieval | pgvector plus lexical/title/source/focused evidence merge | Hosted File Search retrieval |
| Answer generation | Qualy prompts, evidence ids, repair, polish | Responses API with `file_search`, then Qualy validation wrapper |
| Source metadata | Document/chunk ids and source URLs controlled by Qualy | File citations and optionally included search results |
| Tenant isolation | Supabase RLS and organization ids | Separate vector stores and metadata filters |
| Cost accounting | Existing model/embedding usage ledger | Model tokens plus File Search storage/tool-call costs |
| Agent readiness | Current route-bound pipeline | Provider can become a future `knowledge_search` tool |

## Non-Goals

- No production demo provider switch in the first milestone.
- No full Agents SDK or agent-router migration in the first milestone.
- No automatic bulk upload of every TMP PDF.
- No customer billing impact until File Search costs are captured in usage metadata and credit math.
- No removal of the current Supabase RAG path.

## Target Architecture

The experiment should introduce a provider boundary that can later be used by an agent tool:

```ts
type KnowledgeAnswerProvider = "current_rag" | "openai_file_search";

type KnowledgeAnswerRequest = {
  organizationId: string;
  conversationId?: string;
  question: string;
  localeHint?: "tr" | "en";
  recentTurns?: Array<{ role: "user" | "assistant"; content: string }>;
  corpusScope?: {
    vectorStoreId?: string;
    documentIds?: string[];
    fileIds?: string[];
    tags?: string[];
  };
};

type KnowledgeAnswerResult = {
  provider: KnowledgeAnswerProvider;
  answer: string;
  answerLanguage: "tr" | "en" | "unknown";
  citations: Array<{
    providerSourceId: string;
    title?: string;
    url?: string;
    quote?: string;
  }>;
  refusal: boolean;
  timingsMs: {
    total: number;
    retrieval?: number;
    generation?: number;
    validation?: number;
  };
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    toolCalls?: number;
    storageGbDayEstimate?: number;
    estimatedCredits?: number;
  };
  rawProviderTracePath?: string;
};
```

The future agent backbone can expose this as a `knowledge_search` tool without caring whether the underlying provider is Supabase RAG, OpenAI File Search, or a hybrid provider.

## Environment Strategy

| Environment | Purpose | Allowed behavior |
| --- | --- | --- |
| Local branch | Build uploader, runner, and reports | Reads Supabase/source files, creates/deletes test OpenAI vector stores |
| Local `.env` | Holds OpenAI key and test vector store ids | Never committed |
| Netlify Deploy Preview | Optional after local confidence | Test-only flags, no production provider switch |
| Production Netlify | Out of scope until explicit approval | Current RAG remains default |
| Supabase production project | Read-only for benchmark source data unless explicitly approved | No Edge Function deploy from spike branch |

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

We will wait for the user to define which PDF files belong to which story/test batch.

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

- [ ] User provides the first story name.
- [ ] User provides the exact PDF list for that story.
- [ ] Confirm that no extra TMP files are included.
- [ ] Create a temporary OpenAI vector store for that story.
- [ ] Upload only approved files.
- [ ] Record OpenAI file ids and vector store id in local uncommitted output.
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

- [ ] pass/fail count by provider;
- [ ] source correctness count by provider;
- [ ] P50/P75/P95 latency by provider;
- [ ] average and max latency by provider;
- [ ] estimated cost per answer by provider;
- [ ] cases where current RAG wins;
- [ ] cases where File Search wins;
- [ ] cases where both fail;
- [ ] recommendation: keep current, fallback-only, compare-mode, or default switch.

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

| Result | Action |
| --- | --- |
| File Search clearly wins quality and latency is acceptable | Add as feature-flagged provider, then canary |
| File Search wins quality but is slower | Use as fallback/async recovery only |
| File Search ties quality but costs more | Keep current RAG, maybe retain evaluator |
| File Search loses source correctness | Do not roll out |
| Both providers fail similar cases | Fix corpus/story ingestion or question routing first |

## Implementation Checklist

### Phase 0: Branch And Safety

- [ ] Create branch `codex/file-search-rag-spike`.
- [ ] Confirm current production demo uses `RAG_PROVIDER=current` or no equivalent File Search flag.
- [ ] Confirm no Supabase Edge Function deploy is part of local benchmark work.
- [ ] Confirm no Netlify production deploy is part of local benchmark work.
- [ ] Document required local env values without committing secrets.

### Phase 1: Benchmark Fixtures

- [ ] Create a local benchmark case file for the first 50 questions.
- [ ] Include customer-reported wrong-answer cases first.
- [ ] Mark expected answer terms and source expectations.
- [ ] Mark unsupported/refusal cases explicitly.
- [ ] Add a report output folder under `tmp/rag-evals/`.

### Phase 2: Current RAG Baseline Runner

- [ ] Build a script that runs the 50 questions through the existing RAG provider.
- [ ] Capture answer text, sources, usage, and timing.
- [ ] Persist raw traces to local `tmp/rag-evals/...`.
- [ ] Produce a baseline report before File Search is connected.

### Phase 3: File Search Ingestion

- [ ] Wait for user-provided story/PDF mapping.
- [ ] Create one temporary vector store per story or test batch.
- [ ] Upload only approved files.
- [ ] Add metadata attributes for story, organization, document label, and source if supported by the upload path.
- [ ] Save file ids/vector store ids locally only.
- [ ] Verify uploaded files are searchable before benchmark execution.

### Phase 4: File Search Provider Runner

- [ ] Build a File Search runner using the Responses API with `file_search`.
- [ ] Include `file_search_call.results` when needed for source analysis.
- [ ] Capture annotations/citations and map them into the common result shape.
- [ ] Capture total latency and provider/tool timings where available.
- [ ] Capture model usage and File Search tool-call count.

### Phase 5: Side-By-Side Comparison

- [ ] Run the same 50 cases against both providers.
- [ ] Generate a Markdown report.
- [ ] Generate a JSON report for future regression tracking.
- [ ] Highlight disagreement cases.
- [ ] Highlight latency outliers.
- [ ] Highlight high-cost cases.

### Phase 6: Review And Decision

- [ ] Review the report manually.
- [ ] Mark each case as current wins, File Search wins, tie, or both fail.
- [ ] Decide whether the next step is fallback-only, feature-flagged provider, or no rollout.
- [ ] Update this checklist with the decision.

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

- [ ] Which first story should be tested?
- [ ] Which exact PDFs belong to that story?
- [ ] Should the first 50 questions include only YİÜ/demo questions, or also cross-sector SMB examples?
- [ ] Should File Search be judged as answer generator, retrieval-only provider, or both?
- [ ] What P95 latency is acceptable for the public demo before pending/polling must be used?
- [ ] How should File Search storage cost be charged if a customer uploads files but receives few messages?

## Working Notes

- The Query Agent prototype should not be the foundation for this work unless it already provides useful fixtures. Build the provider benchmark independently.
- File Search quality should be judged against customer-reported failures first, not synthetic happy-path questions.
- If File Search returns better evidence but weaker final wording, the next design can use File Search retrieval plus Qualy answer validation/repair instead of accepting the raw response.
- If current RAG returns better source fidelity but File Search returns better recall, a hybrid strategy may be better than full replacement.
