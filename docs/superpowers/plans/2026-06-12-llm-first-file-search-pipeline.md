# LLM-First File Search Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the configured YİÜ Public Demo non-Skill knowledge path with one LLM planner, one OpenAI File Search execution, evidence verification, and constrained polish.

**Architecture:** Add a reusable `llm-first` service whose planner owns semantic interpretation and clarification. The YİÜ Public Demo keeps exact Skill matching and routes remaining turns directly to the service without the legacy semantic routers or activated controller. Other channels stay unchanged until each organization has an explicit tenant-scoped File Search vector-store configuration.

**Tech Stack:** TypeScript, OpenAI Responses API File Search, OpenAI Chat Completions, Vitest, Next.js.

---

### Task 1: Planner Contract

**Files:**
- Create: `src/lib/knowledge-base/llm-first/contracts.ts`
- Create: `src/lib/knowledge-base/llm-first/planner.ts`
- Test: `src/lib/knowledge-base/llm-first/planner.test.ts`

- [x] Define the discriminated `search | clarify | refuse` plan contract and strict parser.
- [x] Add focused cases for negated fee intent, ranking follow-ups, campus location, broad comparisons, and missing-subject clarification.
- [x] Implement one planner call plus one schema-repair attempt with no regex intent fallback.
- [x] Run `npm test -- --run src/lib/knowledge-base/llm-first/planner.test.ts`.

### Task 2: File Search and Evidence Boundary

**Files:**
- Create: `src/lib/knowledge-base/llm-first/evidence.ts`
- Reuse: `src/lib/knowledge-base/rag-eval/openai-file-search.ts`
- Test: `src/lib/knowledge-base/llm-first/evidence.test.ts`

- [x] Execute exactly one semantic File Search request against the configured tenant vector store.
- [x] Convert returned results to approved citations and evidence excerpts.
- [x] Compose a grounded draft and reject unsupported protected values or citations.
- [x] Run `npm test -- --run src/lib/knowledge-base/llm-first/evidence.test.ts`.

### Task 3: Constrained Polish and Shared Service

**Files:**
- Create: `src/lib/knowledge-base/llm-first/pipeline.ts`
- Test: `src/lib/knowledge-base/llm-first/pipeline.test.ts`
- Reuse: `src/lib/knowledge-base/rag-answer-polish.ts`

- [x] Orchestrate planner, clarification/refusal, File Search, evidence draft, and polish.
- [x] Add post-polish invariants for protected values, citations, and response kind.
- [x] Fall back to the verified pre-polish draft on mutation.
- [x] Run `npm test -- --run src/lib/knowledge-base/llm-first/pipeline.test.ts`.

### Task 4: YİÜ Public Demo Entry Point

**Files:**
- Modify: `src/lib/demo-chat/openai-file-search.ts`
- Modify: `src/lib/demo-chat/openai-file-search.test.ts`

- [x] Keep exact Skill matches unchanged.
- [x] Route configured YİÜ Public Demo non-Skill turns to the shared pipeline.
- [x] Remove activated-controller wrapping from new-pipeline demo results.
- [x] Keep other channels unchanged until tenant-scoped vector-store configuration exists.
- [x] Run only the focused adapter tests changed by this task.

### Task 5: Documentation and Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] Document the LLM-first ownership decision and mark the roadmap item complete.
- [x] Run mandatory follow-up guard tests.
- [x] Run focused LLM-first and adapter tests.
- [x] Run `npm run build`.
- [ ] Commit with `feat(phase-3): add llm-first file search pipeline`.
