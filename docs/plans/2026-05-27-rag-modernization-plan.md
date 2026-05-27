# RAG Modernization Plan

Date: 2026-05-27
Status: Proposed
Owner: Product/Engineering

## Why This Exists

The Yüksek İhtisas demo exposed the right failure mode to fix before broader customer rollout: the source corpus often contains the answer, but retrieval/generation can still miss it, over-defer, cite a weak link, or fall into a slow full-pipeline recovery path. Recent targeted repairs made the demo reliable, but the long-term system should not grow by adding customer-question-specific patches.

The goal is a general RAG architecture that improves answer quality across tenants, sectors, languages, and document types.

## Research Summary

- OpenAI's retrieval guidance treats semantic search as valuable because it can surface chunks with few or no shared keywords, while also supporting metadata filtering, ranking controls, and hybrid semantic/text weighting through reciprocal rank fusion.
- Supabase recommends hybrid Postgres search by combining `tsvector` keyword search with `pgvector` semantic search, then merging the result lists with RRF; their examples also index both full-text and vector columns.
- pgvector indexes trade recall for speed. HNSW generally gives stronger speed/recall behavior than IVFFlat at higher memory/build cost, and search parameters such as `hnsw.ef_search` affect recall vs latency.
- OpenAI's latency guidance is directly relevant to public Demo Chat: generate fewer tokens, use fewer requests, parallelize independent work, and do not default to an LLM when a faster bounded method is enough.
- Evaluation guidance from OpenAI and LangSmith both point to separate measurement of retrieval quality, groundedness, and final answer correctness. This matters more than manually eyeballing one customer transcript.

Sources:

- OpenAI Retrieval API: https://developers.openai.com/api/docs/guides/retrieval
- OpenAI Latency Optimization: https://developers.openai.com/api/docs/guides/latency-optimization
- OpenAI Evaluation Best Practices: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- Supabase Hybrid Search: https://supabase.com/docs/guides/ai/hybrid-search
- Supabase Full Text Search: https://supabase.com/docs/guides/database/full-text-search
- pgvector 0.8.0 docs: https://access.crunchydata.com/documentation/pgvector/0.8.0/pdf/pgvector.pdf
- OpenAI Cookbook, search reranking with cross-encoders: https://developers.openai.com/cookbook/examples/search_reranking_with_cross-encoders
- LangSmith RAG evaluation: https://docs.langchain.com/langsmith/evaluate-rag-tutorial

## Current Diagnosis

The current system is already much better than naive vector-only RAG: it has focused evidence, lexical fallback, source-link ranking, answer repair, query planning, and public-demo canaries.

The risk is that answer repair has become the pressure valve for too many upstream misses. Deterministic repair is useful for output hygiene, contradiction cleanup, and bounded extractive recovery, but it should not be the primary semantic understanding layer.

## Target Architecture

1. Ingestion should produce richer chunks, not only longer or shorter chunks.
   - Preserve `document_type`, source URL, page/section, heading path, academic unit/program, effective/currentness hints, and table/list structure.
   - Generate an optional LLM-authored chunk summary/context header during indexing. This summary must describe what the chunk is about, not invent answers.
   - Normalize tables into row-level evidence where each row keeps its parent heading and key columns.

2. Query understanding should be structured and retrieval-only.
   - Use a small/cheap model or deterministic parser to output: normalized query, entities, answer type, must-have evidence terms, negative constraints, and metadata filters.
   - Keep this stage from answering the user. It only improves search.
   - Cache query plans for repeated demo and production questions.

3. Retrieval should be hybrid and multi-stage.
   - Run semantic vector search and indexed full-text search in parallel.
   - Merge with RRF, then apply metadata boosts/filters from the query plan.
   - Over-fetch a small candidate set, then rerank with a lightweight cross-encoder/LLM judge only when top candidates conflict or confidence is low.
   - Keep exact phrase logic generic: "evidence contains subject + answer value + policy/action relation", not "this customer asked this sentence".

4. Evidence validation should become a first-class step.
   - Before generation, label each selected chunk as `supports`, `contradicts`, or `irrelevant`.
   - Require at least one support chunk for factual answers.
   - If sources conflict, surface the conflict or prefer current/effective policy metadata.
   - Store answer spans and source ids for QA reports.

5. Generation should be evidence-pack based.
   - Feed the model a compact evidence pack, not raw noisy chunks.
   - Require concise answers, exact values, and source-aware wording.
   - Allow one role-neutral engagement question only if it is tied to retrieved adjacent evidence.
   - Keep deterministic post-processing for formatting, citations, no-answer suppression, and contradiction guardrails.

6. Evaluation should drive every change.
   - Maintain tenant-independent golden sets: screenshot regressions, paraphrases, negative/no-answer questions, table questions, policy exceptions, contact facts, and stale-source traps.
   - Score retrieval separately from final answer: context recall, context precision, source correctness, answer correctness, no-answer correctness, latency, and token cost.
   - Run canaries on every RAG change and keep production questions as new eval seeds.

7. Latency should be budgeted by path.
   - Fast path: clear factual evidence -> extractive/evidence-pack answer.
   - Standard path: hybrid retrieval -> generation.
   - Slow path: query planning/reranking/judge only when retrieval confidence is low.
   - Continue to return public Demo Chat pending states instead of blocking platform timeouts.

## Priority Plan

### P0: Before Next Customer Retest

- Keep the public-demo canary mandatory and verify the recent final/bütünleme slow case stays below the timeout budget.
- Log retrieval trace fields for every demo answer: query plan, top candidates, support decision, source id/title/url, latency by stage, and final answer tokens.
- Add a "support span present" assertion to the canary report so correctness is not only answer text matching.

### P1: General Retrieval Upgrade

- Add a reusable evidence-support scorer that checks whether the top chunks actually contain the subject, action, and answer value needed by the query.
- Convert the current repair-heavy logic into generic evidence patterns where possible: duration/limit, contact, location, acronym, eligibility, exception/remedy, document metadata, and table-row answer.
- Extend chunk metadata extraction for section path, table row labels, document type, page, and currentness.
- Add a rerank stage behind a feature flag for ambiguous/low-confidence retrieval only.

### P2: Ingestion Enrichment

- Generate chunk summaries/context headers offline during indexing for complex PDFs and crawled pages.
- Add row-level table chunking for dense curriculum/contact/policy tables.
- Build a reindex command that can enrich existing chunks without losing source metadata.

### P3: Evaluation and Tooling

- Promote the 33+ YİÜ challenge into a tenant-agnostic RAG eval harness with fixture packs.
- Add automatic paraphrase generation for every golden question, then have humans review the final fixture set.
- Track model/cost experiments by retrieval stage, not only by final answer model.

## LangChain / LangSmith Position

LangChain will not automatically improve answer quality. The current failure modes are retrieval quality, evidence validation, chunk metadata, and evaluation discipline. Adding LangChain before those are fixed would mostly add orchestration abstraction.

LangSmith-style evaluation and tracing is useful, especially for intermediate RAG steps. We can either adopt LangSmith later or build the same minimal trace/eval objects in our own scripts first. The immediate recommendation is:

- Do not migrate the runtime to LangChain now.
- Borrow the eval model: retrieval relevance, groundedness, correctness, and source trace checks.
- Revisit LangSmith after we have stable trace schemas and want hosted comparison dashboards.

## Model Strategy

Keep `gpt-4o-mini` as the default generation model while retrieval is being improved. Better retrieval and evidence validation should give a larger quality lift than moving every answer to a stronger model.

Use stronger/reasoning models selectively for:

- offline chunk enrichment,
- query-plan/rerank experiments,
- eval graders,
- hard ambiguity cases where the latency/cost budget allows it.

Do not use a stronger model as a substitute for missing retrieval evidence.
