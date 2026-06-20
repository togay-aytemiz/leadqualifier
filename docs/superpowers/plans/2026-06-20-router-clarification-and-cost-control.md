# Router Clarification and Cost Control Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the existing query rewriter's clarification decision an early, persisted router outcome and document the measured OpenAI cost change.

**Architecture:** Extend the existing rewriter contract, reuse the existing RAG pending-clarification metadata, and add one early-return branch before semantic candidates. Pending clarification history suppresses raw exact matching for the next short reply so the history-aware rewriter can reconstruct the full query.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Supabase, OpenAI Chat Completions/Responses.

---

### Task 1: Extend the rewriter contract

**Files:**
- Modify: `src/lib/demo-chat/skill-query-rewriter.ts`
- Test: `src/lib/demo-chat/skill-query-rewriter.test.ts`

1. Add a failing test for normalized clarification question and missing slots.
2. Run the targeted test and confirm the contract is missing.
3. Add optional result fields and prompt schema.
4. Re-run the targeted test.

### Task 2: Add the router early return

**Files:**
- Modify: `src/app/api/demo/[slug]/chat/route.ts`
- Modify: `src/lib/demo-chat/skill-routing-diagnostics.ts`
- Test: `src/app/api/demo/[slug]/chat/route.test.ts`

1. Add a failing route test proving `needsClarification` avoids semantic matching, selector, and File Search.
2. Add a failing route test proving active pending clarification skips raw exact matching.
3. Implement the early response, pending metadata, and diagnostics.
4. Re-run targeted route tests.

### Task 3: Document measured costs and operating policy

**Files:**
- Create: `docs/evaluations/yiu-openai-cost-comparison-2026-06-20.md`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

1. Calculate the prior and current 100-question run costs from recorded token usage and official OpenAI prices.
2. Explain the model-rate, output-token, and File Search call effects.
3. Record smoke-test and full-run budget gates.
4. Update required project documentation.

### Task 4: Verify and publish

1. Run targeted rewriter and route tests.
2. Run mandatory follow-up and response-guard tests.
3. Run `npm run build`.
4. Review the diff and repository status.
5. Commit, push `main`, verify the production deploy, and verify Supabase migration/Edge Function sync.
