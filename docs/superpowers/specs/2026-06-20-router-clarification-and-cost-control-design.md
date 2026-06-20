# Router Clarification and Cost Control Design

**Date:** 2026-06-20
**Status:** Approved

## Problem

The query rewriter already emits `needsClarification`, but the demo router ignores that decision. An underspecified message therefore continues through semantic candidate retrieval, the GPT-5.5 selector, and GPT-5.5 File Search. This creates two failures at once: the bot may return `no_info` or a nearby answer for a resolvable question, and the most expensive stages run before the missing subject or facet is known.

The second-turn answer also needs special handling. If the bot asks which program the user means and the user replies only `Anestezi`, raw exact matching must not treat that reply as a new general Anestezi question. It must first be combined with the original requested facet.

## Approved Flow

1. Read recent conversation history and detect an active router clarification.
2. If there is no active clarification, try the existing exact Skill match.
3. Run the existing history-aware query rewriter.
4. If the rewriter returns `needsClarification: true`:
   - return its single short `clarification_question` immediately;
   - persist the question and missing slots as pending clarification metadata;
   - do not run embeddings, semantic candidate retrieval, the selector, or File Search.
5. On the user's next turn, skip raw exact matching while the pending clarification is active. Let the existing rewriter combine the short answer with the original question and requested facet.
6. Continue through semantic candidates, one selector, then either Skill or File Search.

The final routing shape remains:

`exact match -> query rewriter -> semantic candidates -> one selector -> Skill or File Search`

Clarification is an early return owned by the query rewriter, not a new router, verifier, threshold, or File Search status.

## Rewriter Contract

The rewriter JSON adds two optional fields:

- `clarification_question`: one short question in the user's language, only when clarification is required.
- `missing_slots`: the minimum missing semantic slots, such as `subject` or `facet`.

The server normalizes these fields. If the model marks clarification as required but omits a usable question, the server uses a neutral TR/EN fallback based only on whether subject or facet is missing. Static sector keywords are not used as the primary decision mechanism.

## Persistence

An early clarification response is stored as a normal demo chat assistant message with:

- `demo_chat_reply_source: "skill_query_clarification"`
- `rag_pending_clarification` containing the original question, clarification question, missing slots, requested facet, and normalized retrieval intent
- skill-routing diagnostics with outcome `clarification_requested`

This reuses the existing pending-clarification schema; no database migration or Edge Function change is required.

## Error Handling

- If the rewriter fails, times out, or returns invalid JSON, the router keeps its current fail-open behavior and continues to semantic routing/File Search.
- The server never fabricates factual content in the clarification response.
- A pending clarification suppresses raw exact matching only for the next relevant user answer; the existing history parser clears stale pending state when a later assistant answer resolves it.

## Cost Control

The clarification branch saves the selector and File Search calls on underspecified first turns. Evaluation runs must report estimated USD alongside token totals, stop after quota/pipeline errors, and use a small smoke set before a full 100-question run. Model changes remain a separate measured A/B decision.

## Verification

- Parser test for `clarification_question` and `missing_slots`.
- Route test proving clarification returns immediately and does not call semantic candidates, selector, or File Search.
- Route test proving a pending clarification skips raw exact matching and feeds history to the rewriter.
- Existing routing, follow-up, response-guard, and production build checks.

