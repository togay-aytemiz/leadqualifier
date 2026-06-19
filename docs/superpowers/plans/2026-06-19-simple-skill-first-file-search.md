# Simple Skill-First File Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the strict multi-stage demo RAG fallback with one history-aware Skill-first and File Search flow.

**Architecture:** Keep the existing standalone query rewriter and Skill candidate selector. Widen Skill candidate recall, then perform one OpenAI vector-store search and one grounded answer generation when no Skill matches.

**Tech Stack:** Next.js, TypeScript, OpenAI, Supabase, Vitest.

---

### Task 1: Simplify retrieval and generation

**Files:**
- Modify: `src/lib/knowledge-base/simple-rag/pipeline.ts`
- Modify: `src/lib/knowledge-base/simple-rag/answer-generator.ts`

- [x] Remove retrieval chunk filtering, broadened retry, organization answer rejection, and answer verifier execution.
- [x] Retain history-aware rewrite, one vector search, one answer generation, valid chunk IDs, and protected-value grounding.

### Task 2: Improve Skill candidate recall

**Files:**
- Modify: `src/app/api/demo/[slug]/chat/route.ts`
- Modify: `src/lib/demo-chat/skill-candidate-verifier.ts`

- [x] Increase the semantic candidate pool passed to the single LLM Skill selector.
- [x] Keep exact trigger matching and standalone-query matching order.

### Task 3: Verify and document

**Files:**
- Modify: focused tests under `src/lib/knowledge-base/simple-rag` and `src/app/api/demo/[slug]/chat`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] Run focused tests.
- [x] Run `npm run build`.
- [x] Update product documentation and commit the completed change.
