# General Clarification Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the price-only clarification helper into a reusable gate that asks one contextual clarification question for under-specified customer turns before no-information fallback.

**Architecture:** Keep a deterministic, low-risk gate in `rag-clarification.ts` that recognizes known intent families with missing subjects: price, contact, location, and generic low-information help/detail requests. Wire fallback and the validated File Search provider to the gate so unsupported guardrails and concrete RAG questions still behave as before.

**Tech Stack:** TypeScript, Vitest, Next.js, OpenAI File Search validated provider.

---

### Task 1: Gate API And Tests

**Files:**
- Modify: `src/lib/knowledge-base/rag-clarification.ts`
- Modify: `src/lib/knowledge-base/rag-clarification.test.ts`
- Modify: `src/lib/ai/fallback.ts`
- Modify: `src/lib/ai/fallback.test.ts`
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`
- Modify: `src/lib/knowledge-base/rag-eval/types.ts`

- [x] Write failing tests for contact, location, generic low-information, and concrete-question pass-through.
- [x] Run the targeted tests and verify they fail for the new generalized cases.
- [x] Implement `buildClarificationGateResult` while keeping existing price helper compatibility.
- [x] Wire fallback and validated File Search to the generic gate.
- [x] Run the targeted tests and verify they pass.

### Task 2: Documentation And Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] Record the generalized clarification-gate behavior in PRD/Roadmap/Release.
- [x] Run targeted RAG/fallback tests.
- [x] Run mandatory follow-up/guard tests.
- [x] Run `npm run build`.

### Self-Review

- Spec coverage: the gate handles broader under-specified turns without replacing evidence-backed RAG or guardrail refusals.
- Placeholder scan: no placeholders.
- Type consistency: the gate returns `reason`, `kind`, and `question`; provider diagnostics record `clarification`.
