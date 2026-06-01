# RAG Evidence Pack and Hybrid RRF Design

Date: 2026-06-01
Status: Approved design, pending implementation plan

## Problem

The current Knowledge Base RAG flow has improved through many targeted repairs, but the answer writer still receives broad chunk context. The system validates generated answers with support quotes after the fact, which helps, but it still leaves too much room for adjacent evidence drift, weak source selection, and mechanical deterministic prose.

The next iteration should make the RAG pipeline more explicit:

1. Retrieval gathers candidates.
2. A separate evidence-pack layer chooses compact, source-backed facts.
3. The LLM answerer writes only from those evidence items.
4. Sources shown to the user come from the evidence items actually used in the answer.
5. Retrieval combines channels with a real hybrid RRF merge instead of a growing set of early returns and domain-specific scoring branches.

## Goals

- Improve answer correctness without making customer-specific keyword patches.
- Make source links traceable to the exact evidence used in the answer.
- Let organization AI voice settings affect wording while preserving strict grounding.
- Keep engagement/follow-up questions only when the Knowledge Base supports the suggested adjacent topic.
- Reduce retrieval brittleness by combining vector, lexical, title/source, and focused-evidence channels with Reciprocal Rank Fusion.
- Preserve existing safe deterministic repairs as fallbacks during rollout, not as the primary authoring contract.
- Run automated tests and local/test UI smoke before any production deploy.

## Non-Goals

- Do not change the Knowledge Base database schema in this iteration.
- Do not rebuild all ingestion/chunking logic as part of this P1.
- Do not add LangChain or another orchestration framework unless a later spike proves clear value.
- Do not remove current repair/source-link safeguards until the evidence-pack path has comparable regression coverage.

## Approach

### Phase 1: Evidence Pack + LLM Answerer Separation

Add a new evidence-pack module that turns retrieved chunks into typed evidence items before answer generation.

Suggested module:

- `src/lib/knowledge-base/evidence-pack.ts`
- `src/lib/knowledge-base/evidence-pack.test.ts`

Core shape:

```ts
type RagEvidenceKind =
  | 'contact'
  | 'address'
  | 'duration'
  | 'policy'
  | 'platform'
  | 'document_code'
  | 'link'
  | 'generic'

type RagEvidenceItem = {
  id: string
  kind: RagEvidenceKind
  fact: string
  quote: string
  sourceUrl: string | null
  documentId?: string
  documentTitle?: string | null
  chunkId?: string
  score: number
  criticalValues: string[]
}

type RagEvidencePack = {
  items: RagEvidenceItem[]
  chunks: RagChunk[]
  diagnostics: {
    itemCount: number
    selectedChunkCount: number
    droppedDuplicateCount: number
    droppedUnsupportedCount: number
  }
}
```

Evidence extraction should stay general. The first version can use reusable detectors for:

- e-mails and phone numbers
- URLs and platform names
- numeric values, percentages, durations, and Turkish word-number durations
- address-like lines
- document/form/regulation codes
- table-row and evidence-row style chunks
- document titles and source URLs for navigation/link questions

The LLM answerer should move from "raw context in, answer out" toward "evidence pack in, selected evidence ids out".

Expected answerer contract:

```json
{
  "answer": "short grounded answer without URLs",
  "used_evidence_ids": ["ev_1"],
  "engagement_question": "optional source-backed follow-up",
  "engagement_evidence_id": "ev_2"
}
```

Validation rules:

- `used_evidence_ids` must exist in the pack.
- Critical values in the answer must be present in the selected evidence quotes.
- Raw URLs must not appear in the answer body.
- Engagement is accepted only if `engagement_evidence_id` exists and the question overlaps with that evidence.
- Source links are appended only from selected evidence URLs. If no selected URL exists, the system should avoid inventing or appending unrelated sources.

Current deterministic repair and polish layers can stay as fallback/safety rails, but they should consume the same selected chunk/evidence subset where possible.

### Phase 2: Real Hybrid RRF Retrieval

Refactor retrieval so each search family returns a ranked channel instead of immediately taking over the whole result set.

Initial channels:

- `vector`: embedding similarity via `match_knowledge_chunks`
- `keyword`: normalized keyword/full-text style matching
- `title_source`: document title, exact phrase, document code, abbreviation, and source-path matches
- `focused_evidence`: reusable evidence probes for contact, address, duration, policy, platform, and similar high-signal evidence

Merge with Reciprocal Rank Fusion:

```ts
rrfScore = sum(channelWeight / (rankConstant + rank))
```

Then apply light post-merge boosts for:

- query/evidence intent match
- exact critical value match
- subject/title/source alignment
- freshness or direct-source preference where already supported

The important shift: focused/domain scoring should refine a hybrid candidate set, not replace hybrid retrieval with early returns except for genuinely exact safety cases.

Diagnostics should expose:

- channel result counts
- top channel contribution per result
- RRF score
- post-merge score
- whether a fallback/early exact path was used

## Integration Points

Public Demo Chat:

- Build evidence pack after retrieval and before answer generation.
- Append customer-visible sources from selected evidence URLs.
- Persist `metadata.sources` from displayed source URLs, preserving the recent metadata/source alignment fix.
- Include evidence-pack diagnostics under `rag_diagnostics`.

Shared inbound pipeline:

- Use the same evidence-pack answerer for normal WhatsApp/Instagram/Telegram style channel flow.
- Preserve channel-safe raw URL formatting for non-demo messengers.

Existing answer repair:

- Keep deterministic repair for high-confidence extractive recovery.
- Prefer evidence-selected chunks for repair and source-link selection when the pack is available.

## Testing Plan

Automated tests before implementation is considered complete:

- `src/lib/knowledge-base/evidence-pack.test.ts`
- `src/lib/knowledge-base/rag-answer-generate.test.ts`
- `src/lib/knowledge-base/actions.test.ts`
- `src/app/api/demo/[slug]/chat/route.test.ts`
- `src/lib/channels/inbound-ai-pipeline.test.ts`
- `src/lib/knowledge-base/rag-source-links.test.ts`
- `src/lib/knowledge-base/rag-answer-repair.test.ts`
- `src/lib/ai/followup.test.ts`
- `src/lib/ai/response-guards.test.ts`

Regression cases must include:

- TLT contact answer must not drift to adjacent program e-mail.
- Platform answers such as MEDU/UZEM/OBS must not cite sources that omit the named platform.
- Compound or multi-source answers should show multiple correct sources.
- Engagement question must be omitted when no supporting evidence item exists.
- Organization AI settings should influence wording without introducing unsupported facts.
- RRF merge should let lexical/title/focused evidence beat a semantically broad vector result when the query contains exact concrete signals.

Verification before deploy:

- `npm test -- --run <targeted test list>`
- `npm run lint`
- `npm run build`
- Local or test-environment UI smoke with at least 10 varied questions before any production deploy.
- Production UI smoke only after local/test smoke is clean and the user approves deployment.

## Rollout Plan

1. Implement evidence-pack builder behind the existing flow.
2. Add answerer support for evidence-pack input while preserving current fallback behavior.
3. Wire Demo Chat first, then shared inbound pipeline.
4. Run targeted automated tests and local/test UI smoke.
5. Refactor retrieval channels into explicit hybrid RRF.
6. Re-run automated tests and local/test UI smoke.
7. Deploy only after local/test smoke is clean.
8. Run production UI smoke and record findings.

## Open Decisions

- Evidence pack should start as runtime extraction from retrieved chunks. Ingestion-time persisted evidence metadata can be a later P2/P3 if runtime extraction proves insufficient.
- RRF should initially live in `src/lib/knowledge-base/actions.ts` or a nearby helper module to avoid a large disruptive retrieval rewrite.
- Existing deterministic repair should remain in the pipeline until evidence-pack answer generation has enough live QA confidence to become the dominant path.
