# Single Rewrite Skill-to-File-Search Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Public Demo produces one history-aware standalone query, uses it for Skill routing, and reuses that exact query for one File Search fallback.

**Architecture:** Persist the successful Skill rewrite as explicit inbound-message metadata, load that metadata during pending recovery, and pass the query through the demo File Search adapter into the simple RAG pipeline. The simple RAG pipeline skips its own LLM rewrite only when a prepared standalone query is supplied; existing direct calls without one keep their current rewrite behavior.

**Tech Stack:** Next.js, TypeScript, OpenAI, Supabase, Vitest.

---

### Task 1: Prove the broken query handoff

**Files:**
- Test: `src/app/api/demo/[slug]/chat/route.test.ts`
- Test: `src/lib/demo-chat/openai-file-search.test.ts`
- Test: `src/lib/knowledge-base/simple-rag/pipeline.test.ts`

- [x] **Step 1: Add a route regression test for inbound metadata persistence**

Assert that a successful Skill rewrite followed by `NO_SKILL` calls the inbound-only pipeline with:

```ts
inboundMessageMetadata: expect.objectContaining({
  demo_chat_standalone_query: 'Yüksek İhtisas Üniversitesi Anestezi kontenjanı nedir?',
})
```

- [x] **Step 2: Add a recovery regression test for metadata loading**

Return an inbound message containing `demo_chat_standalone_query` and assert `buildOpenAiFileSearchDemoReply` receives that exact query.

- [x] **Step 3: Add adapter and pipeline regression tests**

Assert the adapter forwards `standaloneQuery`, then assert `runSimpleRagPipeline` performs zero rewrite completions, one vector search with that exact query, and one answer completion.

- [x] **Step 4: Run the focused tests and confirm RED**

Run:

```bash
npm test -- --run 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/demo-chat/openai-file-search.test.ts src/lib/knowledge-base/simple-rag/pipeline.test.ts
```

Expected: failures show the standalone query is not persisted, loaded, forwarded, or reused.

### Task 2: Implement the single-query handoff

**Files:**
- Modify: `src/app/api/demo/[slug]/chat/route.ts`
- Modify: `src/lib/demo-chat/openai-file-search.ts`
- Modify: `src/lib/knowledge-base/simple-rag/pipeline.ts`

- [x] **Step 1: Raise the Skill rewrite timeout budget**

Set the default Skill rewrite timeout to `5000` ms and its environment-configurable cap to `8000` ms so normal production rewrites are not discarded at 1.8 seconds.

- [x] **Step 2: Persist and load the prepared query**

Write `demo_chat_standalone_query` beside `demo_chat_skill_routing`, select inbound `metadata` during recovery, and read the normalized query from that metadata.

- [x] **Step 3: Forward the query through File Search**

Add an optional `standaloneQuery` input to `buildOpenAiFileSearchDemoReply` and `runSimpleRagPipeline`.

- [x] **Step 4: Skip duplicate rewriting**

When `standaloneQuery` is present, construct the existing search rewrite result locally with zero additional rewrite usage; otherwise retain `rewriteSimpleRagQuery` unchanged.

- [x] **Step 5: Run focused tests and confirm GREEN**

Run the Task 1 command and expect all tests to pass.

### Task 3: Verify guardrails and document the fix

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Run mandatory AI intake guards**

```bash
npm test -- --run src/lib/ai/followup.test.ts
npm test -- --run src/lib/ai/response-guards.test.ts
```

- [x] **Step 2: Run the full production build**

```bash
npm run build
```

- [x] **Step 3: Update product documentation**

Record that the successful Skill rewrite is now reused by File Search, update each document's Last Updated date to `2026-06-19`, and list the production timeout/metadata bug under `[Unreleased]` → `Fixed`.

- [x] **Step 4: Review the final diff**

Run `git diff --check` and inspect `git diff --stat` plus the affected hunks.
