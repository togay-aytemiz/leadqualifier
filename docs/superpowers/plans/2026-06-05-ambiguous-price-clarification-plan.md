# Ambiguous Price Clarification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask one contextual clarification question when a customer asks an ambiguous price question instead of returning a no-information refusal.

**Architecture:** Add a small reusable clarification helper that detects price intent with no clear subject. Use it in the YIU brochure File Search planner/provider before retrieval, while preserving existing unsupported guardrails and source-grounded answer behavior.

**Tech Stack:** TypeScript, Vitest, Next.js, OpenAI File Search validated provider, Supabase-backed demo chat.

---

### Task 1: Clarification Detection And Provider Short-Circuit

**Files:**
- Create: `src/lib/knowledge-base/rag-clarification.ts`
- Test: `src/lib/knowledge-base/rag-clarification.test.ts`
- Modify: `src/lib/knowledge-base/rag-eval/brochure-query-plan.ts`
- Test: `src/lib/knowledge-base/rag-eval/brochure-query-plan.test.ts`
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`
- Test: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [x] Write failing tests for `okumak kaç para?`, `Ücretler ne kadar?`, and `Tıp kaç para?`.
- [x] Verify the targeted tests fail before production code changes.
- [x] Implement the minimal helper and provider short-circuit.
- [x] Verify targeted tests pass.

### Task 2: Documentation And Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] Record the clarification behavior in PRD/Roadmap/Release.
- [x] Run targeted RAG tests.
- [x] Run mandatory follow-up/guard tests if response guard behavior is affected.
- [x] Run `npm run build`.

### Self-Review

- Spec coverage: covers ambiguous pricing, avoids demo-only hardcoding in the detector, preserves unsupported/no-evidence refusals.
- Placeholder scan: no placeholders.
- Type consistency: plan uses existing provider and planner names.
