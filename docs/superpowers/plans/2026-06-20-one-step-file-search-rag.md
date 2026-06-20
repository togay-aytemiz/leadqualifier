# One-Step GPT-5.5 File Search RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom multi-stage Public Demo RAG fallback with one GPT-5.5 Responses API File Search call while preserving diagnostics and safe fallback behavior.

**Architecture:** Add one focused adapter that owns the Responses request, strict output parsing, File Search result mapping, and usage diagnostics. The existing demo integration supplies tenant/query context and converts adapter statuses into customer replies; the Skill router remains unchanged.

**Tech Stack:** Next.js 16, TypeScript, OpenAI Node SDK 6, Responses API, hosted File Search, Vitest.

---

### Task 1: One-step adapter

**Files:**
- Create: `src/lib/knowledge-base/simple-rag/one-step-file-search.ts`
- Create: `src/lib/knowledge-base/simple-rag/one-step-file-search.test.ts`

- [ ] Write a failing test whose fake Responses client verifies `model: gpt-5.5`, forced `file_search`, `include: ['file_search_call.results']`, the configured vector store/max-results, and strict JSON schema output.
- [ ] Add failing cases for `answer`, localized `no_info`, `refuse`, result/citation mapping, usage, and invalid payload rejection.
- [ ] Run `npm test -- --run src/lib/knowledge-base/simple-rag/one-step-file-search.test.ts` and confirm failure because the adapter does not exist.
- [ ] Implement the smallest adapter that builds the request, parses the strict payload, maps returned search results, and returns typed status/diagnostics.
- [ ] Rerun the targeted test and require all cases to pass.

### Task 2: Public Demo integration

**Files:**
- Modify: `src/lib/demo-chat/openai-file-search.ts`
- Modify: `src/lib/demo-chat/openai-file-search.test.ts`

- [ ] Replace the mocked multi-stage pipeline expectation with a failing one-step adapter expectation.
- [ ] Verify the test fails because production still calls `runSimpleRagPipeline`.
- [ ] Route RAG fallback to the one-step adapter using the prepared standalone query, recent history, organization context, dictionary context, tenant style, and response language.
- [ ] Change metadata to `one_step_responses_file_search_v1`, retain search-result diagnostics and citations, and record only the one-step model's token usage.
- [ ] Rerun `npm test -- --run src/lib/demo-chat/openai-file-search.test.ts src/lib/knowledge-base/simple-rag/one-step-file-search.test.ts`.

### Task 3: Focused live gate

**Files:**
- Create: `scripts/knowledge/fixtures/yiu-one-step-file-search-focused-cases.json`
- Create: `scripts/knowledge/yiu-one-step-file-search-focused-eval.ts`
- Create: `scripts/knowledge/yiu-one-step-file-search-focused-eval.test.ts`
- Create: `docs/evaluations/yiu-one-step-file-search-focused-review-2026-06-20.md`

- [ ] Define ten supported-recall and ten unsupported/adjacent-evidence cases from the recorded YİÜ runs, each with an expected `answer` or `no_info` status.
- [ ] Write a failing harness test for deterministic scoring and release-gate calculation.
- [ ] Implement payload execution and scoring without question-specific production behavior.
- [ ] Run the focused live gate with the existing approved API key and record accuracy, false answers, false no-info, latency, and tokens.

### Task 4: Verification and documentation

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] Run all directly affected Vitest files.
- [ ] Run `npm run build` and require a successful production build.
- [ ] Run `git diff --check`.
- [ ] Update ROADMAP, PRD, RELEASE, and their Last Updated notes with the measured focused-gate outcome.
- [ ] Report any remaining blocker honestly; do not run a new random 100 unless the balanced focused gate passes.

