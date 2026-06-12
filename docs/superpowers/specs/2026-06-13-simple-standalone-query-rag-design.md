# Simple Standalone-Query RAG Design

Date: 2026-06-13
Status: Ready for user review

## Goal

Replace the current non-Skill YIU demo path with the smallest useful RAG pipeline:

```text
Latest user question + explicit state + recent history
                    |
                    v
             Query rewriter
                    |
                    v
        One standalone search query
                    |
                    v
       OpenAI Vector Store Search
                    |
                    v
              Top chunks
                    |
                    v
        One grounded answer generator
                    |
                    v
              User response
```

Skills remain unchanged and continue to run before this path.

## Why Change

The current LLM-first path already creates a standalone query, but it also asks the same planner to route, clarify, refuse, generate multiple query variants, define answer goals, define required facts, and define forbidden assumptions. The pipeline may then run expanded multi-query retrieval, table-specific composition, a separate grounded composer, and final polish.

The latest production UI evaluation showed that this complexity has not improved broad reliability. It still produced generic no-info answers, unsupported positive claims, and contradictory answers for the same critical question. The new design removes optional intelligence until the basic retrieval and grounded-answer contract is reliable.

## Scope

### Keep

- Existing exact Skill matching and Skill responses.
- Existing approved OpenAI vector store and visitor-safe source manifest.
- Existing organization identity and response-language resolution.
- Existing Demo Chat persistence, polling, billing metadata, and source display.
- Minimal mechanical grounding checks for citation IDs and protected numeric/contact values.

### Remove From The Active Non-Skill Path

- Multi-decision planner output such as search goals, required facts, and forbidden assumptions.
- Multiple planned retrieval queries.
- Expanded/recall retry.
- Table-fact fast path and table-specific answer renderer.
- Separate composer and polish stages.
- Runtime LLM judge, critic, or evaluator.
- Customer-facing generic no-info fallback that is also marked as a refusal.

The removed code may remain temporarily for rollback or tests, but production Demo Chat must not invoke it.

## Inputs And State

The pipeline receives three distinct inputs:

1. `latestUserMessage`: the current user turn.
2. `conversationState`: only explicit, confirmed facts already known about the user request. The initial implementation uses the existing pending-clarification state; it does not add a new profile-extraction subsystem.
3. `recentHistory`: ordered recent user/assistant turns used only to resolve references and preserve conversational continuity.

History is never concatenated into the retrieval query. Assistant messages are never treated as factual evidence.

## Query Rewriter

The rewriter has one responsibility: convert the latest message into a clear standalone search query.

It receives the latest user message, explicit state, and at most the last six conversation turns. Its output is a small structured object:

```json
{
  "status": "search",
  "standalone_query": "Pro uyelik paketinin iptal sartlari nelerdir?",
  "response_language": "tr"
}
```

When a reference cannot be resolved or a missing value materially changes retrieval, it may instead return exactly one clarification:

```json
{
  "status": "clarify",
  "clarification_question": "Hangi programin staj ucretini soruyorsunuz?",
  "missing_slot": "program",
  "response_language": "tr"
}
```

Rewriter rules:

- Use history only to resolve references such as `bu`, `bunun`, `o program`, or a short correction.
- Prefer the latest user correction over earlier assistant assumptions.
- Preserve the requested facet, negation, year, program variant, and constraints.
- Do not answer the question.
- Do not create synonyms, query lists, source labels, or speculative facts.
- If the latest question is already standalone, keep it semantically unchanged.
- Do not clarify merely because optional details are absent; clarify only when search meaning is genuinely ambiguous.

## Retrieval

Use the OpenAI Vector Store Search API directly. This separates retrieval from answer generation and returns scored chunks without asking a retrieval model to author an unused response.

Only `standalone_query` is sent as the search query. History, assistant text, tenant prompts, and answer instructions are not sent to retrieval.

Initial retrieval settings:

```ts
{
  query: standaloneQuery,
  rewrite_query: false,
  max_num_results: 12,
  ranking_options: {
    ranker: 'auto',
    score_threshold: 0.1,
  },
}
```

`score_threshold` is configurable through environment settings and starts at `0.1`. It must not be raised without a measured evaluation because higher values can increase false no-info results. The search returns at most 12 result groups; duplicate chunks are removed before answer generation.

Metadata filters are allowed only when they come from explicit structured state or stable tenant configuration. No organization-specific keyword router is added.

## Answer Generator

One answer-model call receives:

- latest user question;
- standalone query;
- explicit conversation state;
- recent history for continuity only;
- retrieved chunks with stable IDs, filenames, titles, and source URLs;
- concise organization identity and tone.

The model returns:

```json
{
  "status": "answer",
  "answer": "...",
  "used_chunk_ids": ["C1", "C3"]
}
```

It may return `clarify`, `no_info`, or `refuse` when appropriate.

Answer rules:

- Retrieved chunks are the only factual authority.
- History and state provide continuity, not factual support.
- Answer the latest user question directly and concisely.
- A positive claim such as availability, ownership, permission, requirement, or eligibility needs direct supporting text, not merely a related document.
- Preserve exact qualifiers and values from the selected chunks.
- Do not expose retrieval, chunk, table, brochure, or evidence mechanics.
- Do not add generic follow-up or sales copy.
- Do not invent facts when context is weak.

There is no second polish call.

## Grounding Guard

The answer generator is the only semantic answer layer. A small non-LLM guard runs afterward:

- every `used_chunk_id` must exist in the supplied context;
- every protected numeric, price, date, phone, email, and URL value in the answer must appear in the used chunks or the user question;
- an answer with no valid used chunk is rejected;
- raw internal evidence labels are rejected.

The guard does not judge prose quality or rewrite the answer. Rejected answers become the no-info behavior below.

## Clarification And No-Info

Clarification is used only when a missing slot prevents a meaningful search or when retrieved chunks reveal multiple incompatible interpretations.

No-info is separate from refusal. It should be concise and specific:

- Turkish: `Bu bilgiye onayli kaynaklarda ulasamadim.`
- English: `I could not find this information in the approved sources.`

If one missing detail could enable retrieval, ask one specific clarification instead of returning no-info. Do not append `Baska nasil yardimci olabilirim?` or a generic topic menu.

Refusal is reserved for unsafe or prohibited requests and is not used for ordinary retrieval misses.

## Diagnostics

Record only the information needed to debug this simple pipeline:

- rewriter status;
- standalone query;
- whether explicit state was used;
- result count and top scores;
- selected chunk IDs and filenames;
- answer status;
- latency and token usage.

Do not add a runtime judge. Quality scoring stays in offline/live evaluation tooling.

## Rollout

1. Add the new simple pipeline behind the existing YIU Demo Chat provider boundary.
2. Keep Skills unchanged.
3. Switch the YIU demo non-Skill path to the new pipeline.
4. Run a focused live UI set covering standalone questions, referential follow-ups, corrections, no-info, prices, quotas, campus, and clinical claims.
5. Run the same critical facts three times in clean sessions to measure consistency.
6. Keep the old pipeline available only as a short rollback path until the new live gate is reviewed.

## Acceptance Criteria

- Vector Store Search receives one standalone query and no raw history transcript.
- A follow-up such as `Peki bunun fiyati ne?` resolves the subject from state/history and searches only the rewritten query.
- A standalone question is not expanded into multiple speculative searches.
- Production answer generation uses one model call after retrieval and no polish/judge call.
- No-info and refusal are distinguishable in diagnostics.
- Unsupported positive institutional, campus, clinical, fee, quota, and policy claims are rejected.
- Critical factual repeats reach at least 95% agreement across three clean sessions.
- Focused tests and `npm run build` pass before deployment.

## Deferred Work

The following may be reintroduced only after evaluation shows a specific measured need:

- bounded retry;
- table-specific deterministic extraction;
- query expansion;
- reranking customization beyond `auto`;
- answer polish;
- semantic critic or judge;
- broader structured user-profile state.

Each deferred layer requires an eval demonstrating that it improves accuracy without increasing contradictions or no-info failures.

## Official API Basis

- OpenAI Retrieval supports direct vector store search, query rewriting controls, result limits, ranking options, and score thresholds.
- Higher score thresholds can exclude useful chunks; the initial `0.1` value intentionally favors recall and will be tuned through evaluation.
- OpenAI recommends synthesizing responses from retrieved results in a separate model call, which matches this design.

References:

- https://developers.openai.com/api/docs/guides/retrieval
- https://developers.openai.com/api/docs/guides/tools-file-search
