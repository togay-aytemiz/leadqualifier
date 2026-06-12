# LLM-First File Search Pipeline Design

**Date:** 2026-06-12
**Status:** Approved for implementation planning

## Context

Qualy's customer answer path has accumulated multiple semantic decision makers: contextual orchestration, deterministic question understanding, brochure routing, direct fact catalogs, table resolution, research planning, evaluator/repair logic, and an activated internal controller. These layers can disagree about the same turn. In the observed YIU demo failures, deterministic keyword logic reclassified a placement question as a fee question and lost conversational corrections such as `ucreti sormadim`.

The product does not need more intent rules. It needs one semantic owner and a small number of hard, non-semantic safeguards.

## Decision

Keep operator-authored Skills and Skill actions unchanged. When no Skill or capability matches, route every customer-facing knowledge answer through one new pipeline:

```text
Ordered history + latest message + tenant behavior policy
  -> LLM turn planner
       -> clarify/refuse, or
       -> one semantic File Search request
  -> OpenAI File Search over the tenant-approved corpus
  -> evidence verification
  -> constrained polish
  -> customer reply
```

The LLM planner is the only component allowed to infer intent, resolve references, interpret corrections or negation, decide whether information is missing, and formulate the retrieval request. Deterministic code must not replace or reinterpret those semantic decisions from keywords.

## Goals

- Make natural multi-turn understanding the responsibility of one LLM planner.
- Preserve ordered conversation context so short follow-ups and corrections retain their subject and requested fact.
- Ask one useful clarification only when a missing answer materially changes retrieval or the answer.
- Use OpenAI File Search as the single non-Skill institutional knowledge retrieval path.
- Verify that customer-visible facts are supported by returned evidence before polish.
- Ensure polish changes presentation only, never intent, facts, numbers, refusal status, or citations.
- Apply the same behavior to Public Demo Chat, Simulator, WhatsApp, Instagram, and Telegram.
- Remove legacy semantic owners from the active customer reply path instead of keeping them as hidden fallbacks.

## Non-Goals

- No change to operator-authored Skills, Skill images, Skill actions, or exact Skill response behavior.
- No live web search or arbitrary external tools.
- No organization-specific keyword routing in shared code.
- No broad autonomous agent loop, multi-tool planning, or repeated research rounds.
- No removal of tenant isolation, source allowlists, billing controls, safety boundaries, or channel delivery behavior.
- No requirement to delete legacy files in the first migration if they remain used by benchmarks or administrative tooling; they must not own customer-visible non-Skill replies.

## Universal Routing Boundary

Every inbound customer turn follows this order:

1. Run the existing Skill/capability matching path.
2. If a Skill matches, return the existing operator-authored response and actions unchanged.
3. If no Skill matches, call the new LLM-first File Search pipeline.
4. Do not run Supabase RAG, direct fact catalogs, brochure query routing, deterministic intent classification, or a second internal controller after the new planner.
5. Persist the resulting answer and diagnostics through the existing channel adapter.

The routing boundary is shared by Demo Chat, Simulator, WhatsApp, Instagram, and Telegram. Channel code may supply metadata and delivery constraints, but it may not introduce another semantic planner.

## Turn Planner Contract

The planner receives:

```ts
type LlmFirstTurnRequest = {
  organizationId: string
  channel: 'demo_chat' | 'whatsapp' | 'instagram' | 'telegram' | 'simulator'
  locale: string
  latestUserMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  behaviorPolicy: CompiledBehaviorPolicy
  sourcePolicy: {
    vectorStoreId: string
    allowedSourceGroups?: string[]
  }
}
```

It returns exactly one normalized decision:

```ts
type LlmFirstTurnPlan =
  | {
      decision: 'search'
      resolvedQuestion: string
      searchQuery: string
      answerGoal: string
      responseLanguage: string
      requiredFacts: string[]
      forbiddenAssumptions: string[]
      confidence: number
    }
  | {
      decision: 'clarify'
      clarificationQuestion: string
      missingInformation: string[]
      responseLanguage: string
      confidence: number
    }
  | {
      decision: 'refuse'
      refusalReason: string
      responseLanguage: string
      confidence: number
    }
```

`resolvedQuestion` is a faithful standalone interpretation of the user's current request. It may combine recent context with the latest message, but it may not change the requested metric. For example, `ucreti sormadim, siralamam 30 bin` must remain a placement/ranking request rather than becoming a fee request.

The planner produces one search plan, not a list of tools or iterative steps. OpenAI File Search is the only research capability available to this pipeline.

## Clarification Rules

Clarification is an LLM decision governed by a strict contract:

- Ask only when missing information is necessary to perform a meaningful search or distinguish materially different answers.
- Use recent ordered history before declaring a slot missing.
- Treat the latest user's correction as authoritative over earlier assistant assumptions.
- Do not ask for information already present in history.
- Do not ask for optional details merely to improve personalization.
- Ask one concise question at a time, phrased in the user's language.
- Name the missing choice directly. Avoid generic prompts such as `Hangi konuda bilgi almak istersiniz?`
- When several options can be usefully compared, search and compare them rather than forcing the user to choose first.
- Do not repeatedly ask the same clarification after refusal, uncertainty, or a valid short answer.

Examples:

- `Siralamam 30000 hangi programi tercih edebilirim?` can search the approved admissions evidence without asking which program first, because a comparison is useful.
- `Tip ama Turkce mi tutar Ingilizce mi?` uses the ranking and Tıp context from history and searches both variants.
- `Siralaman nedir?` with no subject in history asks which program or program group is meant.
- `Tip` after the assistant asked which program consumes that answer and continues the original metric.

## Planner Failure Handling

The planner output is schema-validated. If the first output is malformed or internally inconsistent, the system performs one repair attempt using the validation errors. It does not invoke a deterministic semantic fallback.

If repair also fails:

- For clearly unsafe requests, apply the hard safety boundary.
- Otherwise, return a short temporary service failure in the user's language.
- Record diagnostics and usage.
- Do not silently return to the legacy catalog/router/controller pipeline.

This makes failures visible and prevents old behavior from masking defects in the new pipeline.

## File Search Request

For a `search` decision, the system sends OpenAI File Search:

- The planner's standalone `resolvedQuestion`.
- The focused `searchQuery`.
- The `answerGoal`, `requiredFacts`, and `forbiddenAssumptions`.
- Tenant behavior policy relevant to answer scope and tone.
- Only the configured tenant vector store and allowed source metadata filters.
- A requirement to return evidence-bearing search results rather than unsupported institutional claims.

File Search receives conversation meaning through the resolved plan, not raw assistant prompts used as search queries. There is one normal retrieval request. A single technical retry is allowed only for transport failure or transient provider error; it must repeat the same semantic plan and cannot broaden intent.

## Evidence Verification

Verification is deterministic where determinism is appropriate. It validates mechanics, not user meaning.

The verifier checks:

- Every institutional fact in the draft is supported by returned evidence.
- Exact numbers, prices, dates, rankings, quotas, contacts, and policy conditions appear in evidence with the same meaning.
- The evidence subject and requested facet match the planner's resolved question.
- Citations point to files returned by the tenant's approved File Search corpus.
- Conflicting evidence is not silently collapsed into one definitive claim.
- The answer does not add facts from model memory.

The verifier may remove unsupported claims or produce a grounded no-information result. It may not reinterpret the user request, switch the requested metric, select a different program, or ask a new clarification. If evidence shows the planner's question is underspecified, the request returns to the same LLM planner once with a compact evidence-gap description; this is the only semantic reconsideration after search.

## Answer Composition and Polish

The grounded answer composer receives only:

- The resolved question and answer goal.
- Verified evidence excerpts and structured values.
- The verification verdict.
- Tenant behavior policy and response language.

The final polish layer receives the grounded draft plus immutable fact markers. Its contract is:

- Improve clarity, warmth, brevity, and formatting.
- Preserve all exact values and factual qualifiers.
- Preserve answer, clarification, refusal, and no-information semantics.
- Preserve citation selection.
- Do not introduce new facts, recommendations, questions, or retrieval/source mechanics.
- Add a follow-up question only when explicitly supplied by the planner as a supported next step.

After polish, a final invariant check compares protected values and decision type with the pre-polish draft. On mismatch, use the verified pre-polish answer.

## Hard Deterministic Boundaries

Deterministic code remains for:

- Organization and conversation ownership.
- Supabase RLS and tenant vector-store selection.
- Skill matching and Skill action execution.
- Safety rules that must not depend solely on model judgment, including credential extraction, payment-card handling, private data exposure, and prompt/tool exfiltration.
- Usage entitlement, rate, timeout, token, and credit limits.
- Planner schema validation.
- Source allowlists and citation identity.
- Evidence support for protected values and high-risk claims.
- Channel delivery, persistence, idempotency, and retry mechanics.
- Post-polish invariant validation.

Deterministic code must not infer customer intent from words such as `ucret`, `siralama`, `tip`, `burslu`, or their equivalents.

## Legacy Layer Retirement

The following components are removed from the active non-Skill customer answer path:

- `strict-question-understanding` as an intent authority.
- `brochure-query-plan` as a semantic router.
- `strict-fact-catalog` as a direct customer answer owner.
- `brochure-table` direct-answer routing.
- Contextual orchestrator plus pending-state repair as a separate semantic owner.
- LLM research planner and evaluator loops that can change route or intent after the turn planner.
- Activated internal controller wrapping an already generated answer.
- Legacy Supabase RAG fallback for organizations configured on the new File Search path.

Reusable mechanical validators may be extracted from these modules. Existing benchmark utilities can remain isolated until their tests and scripts are migrated.

## State and Follow-Ups

Raw ordered conversation history is the primary context. The system also persists a compact planner state for observability and continuation:

```ts
type LlmFirstConversationState = {
  resolvedQuestion?: string
  activeSubject?: string
  activeGoal?: string
  pendingClarification?: {
    question: string
    missingInformation: string[]
  }
  lastDecision: 'search' | 'clarify' | 'refuse' | 'no_info'
}
```

This state is advisory input to the next planner turn, not a deterministic rewrite engine. The LLM reconciles it with raw history and the latest message. A fresh question may supersede it, and a user correction always wins.

## Observability

Each non-Skill turn records:

- Skill miss and selected pipeline version.
- Planner decision, confidence, resolved question, search query, and missing information.
- Whether planner repair was required.
- File Search request id, filters, result count, latency, and usage.
- Evidence verification verdict and unsupported/protected claims.
- Grounded draft decision type.
- Polish usage and invariant-check outcome.
- Final response kind and citations.

Diagnostics must not expose private prompts, secrets, or full document contents to customers.

## Rollout

The migration is implemented behind one pipeline-version switch, but the target state is one production path rather than permanent dual routing.

1. Add the new pipeline and regression tests for the observed YIU conversation classes.
2. Route Public Demo Chat and Simulator non-Skill turns to it.
3. Route shared WhatsApp, Instagram, and Telegram non-Skill turns to the same service.
4. Remove activated controller wrapping and legacy semantic fallbacks from those paths.
5. Run focused conversation, safety, evidence, channel, and build verification.
6. Make the new pipeline the default and retain the switch only as a short operational rollback boundary.

The rollback switch selects the prior complete pipeline version. It must not mix old semantic layers into individual new-pipeline turns.

## Acceptance Criteria

- Skills and Skill actions behave exactly as before.
- All non-Skill customer knowledge replies use one LLM planner, one approved-corpus File Search stage, evidence verification, and constrained polish.
- No regex/catalog/table/controller layer can change the planner's resolved intent.
- Corrections and negation are preserved across turns.
- Missing required information produces one specific clarification question.
- Available history is not re-requested.
- Broad but answerable comparison questions search first instead of forcing unnecessary clarification.
- Exact facts and numbers cannot survive without matching evidence.
- Polish cannot alter protected values or decision type.
- Planner or provider failure does not silently fall back to legacy semantic routing.
- Demo Chat, Simulator, WhatsApp, Instagram, and Telegram share the same non-Skill pipeline service.

## Required Regression Classes

Tests must cover behavior classes rather than memorizing every customer sentence:

- Negated intent: `ucreti sormadim` must suppress the rejected fee interpretation.
- Referential follow-up: a short program or variant answer must preserve the earlier requested metric.
- Comparative follow-up: Turkish versus English Tıp must search both variants when ranking context is known.
- Broad comparison: a supplied rank plus `hangi program` must retrieve comparable program rows.
- Missing subject: a metric-only question with no usable history must ask one specific clarification.
- Correction priority: the latest user correction must override an assistant's mistaken assumption.
- Fresh-topic reset: a new complete question must not be consumed as an old clarification answer.
- Evidence mismatch: unsupported exact values must be removed or bounded.
- Polish mutation: changed numbers, decision type, or unsupported follow-up text must be rejected.
- Cross-channel parity: the same history and message produce the same planner and evidence behavior across all customer channels.
