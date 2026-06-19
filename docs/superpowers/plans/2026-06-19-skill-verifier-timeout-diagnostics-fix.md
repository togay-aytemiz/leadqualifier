# Skill Verifier Timeout Diagnostics Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent recalled Public Demo Skills from falling through to RAG because of short verifier timeouts, and keep the terminal Skill-routing reason visible when fallback happens.

**Architecture:** Keep the existing Skill-first flow. Increase the candidate verifier budget, preserve terminal Skill outcomes with a separate `ragFallback` flag, and expand compact diagnostics so generated program facets such as quota/rank remain inspectable.

**Tech Stack:** Next.js route handlers, Vitest, TypeScript, Supabase-backed Skill metadata, OpenAI-backed Skill rewrite/verifier mocks in tests.

---

### Task 1: Preserve terminal fallback diagnostics

**Files:**
- Modify: `src/lib/demo-chat/skill-routing-diagnostics.ts`
- Modify: `src/lib/demo-chat/skill-routing-diagnostics.test.ts`
- Modify: `src/app/api/demo/[slug]/chat/route.ts`
- Modify: `src/lib/demo-chat/openai-file-search.ts`

- [ ] **Step 1: Write failing diagnostics tests**

Add tests proving a `verification_timeout` diagnostic remains `verification_timeout` after RAG fallback, with `ragFallback: true`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/demo-chat/skill-routing-diagnostics.test.ts`

Expected before implementation: FAIL because `markSkillRoutingRagFallback` is missing or fallback overwrites the outcome.

- [ ] **Step 3: Implement fallback marker**

Add `ragFallback?: true` to diagnostics and export `markSkillRoutingRagFallback()`, preserving existing outcomes.

- [ ] **Step 4: Use marker in RAG fallback paths**

Replace `appendSkillRoutingOutcome(..., 'rag_fallback')` in demo route and File Search metadata with `markSkillRoutingRagFallback(...)`.

- [ ] **Step 5: Verify**

Run: `npm test -- --run src/lib/demo-chat/skill-routing-diagnostics.test.ts src/lib/demo-chat/openai-file-search.test.ts`

Expected: PASS.

### Task 2: Let normal verifier latency complete

**Files:**
- Modify: `src/app/api/demo/[slug]/chat/route.ts`
- Modify: `src/app/api/demo/[slug]/chat/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Add one test where candidate verification resolves at 2500ms and must choose the recalled Skill, plus one test where a 6000ms verifier timeout falls back while preserving `verification_timeout`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run 'src/app/api/demo/[slug]/chat/route.test.ts'`

Expected before implementation: FAIL because the old `1800ms` verifier timeout returns pending RAG fallback too early and diagnostics are overwritten.

- [ ] **Step 3: Increase verifier timeout**

Change `DEFAULT_SKILL_CANDIDATE_VERIFY_TIMEOUT_MS` to `5000` and `MAX_SKILL_CANDIDATE_VERIFY_TIMEOUT_MS` to `8000`.

- [ ] **Step 4: Verify**

Run: `npm test -- --run 'src/app/api/demo/[slug]/chat/route.test.ts'`

Expected: PASS.

### Task 3: Keep generated program facets inspectable

**Files:**
- Modify: `src/lib/demo-chat/skill-routing-diagnostics.ts`
- Modify: `src/lib/demo-chat/skill-routing-diagnostics.test.ts`
- Test: `scripts/skills/yiu-program-fact-skills.test.ts`

- [ ] **Step 1: Write failing diagnostics test**

Add a summarized candidate with more than eight facets and assert `fee`, `quota`, `base_score`, and `success_rank` are visible.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/demo-chat/skill-routing-diagnostics.test.ts`

Expected before implementation: FAIL because candidate diagnostics slice facets at eight.

- [ ] **Step 3: Expand diagnostics facet limit**

Increase compact coverage facet retention to `16`, while still omitting full Skill response text.

- [ ] **Step 4: Verify generated program facets**

Run: `npm test -- --run scripts/skills/yiu-program-fact-skills.test.ts`

Expected: PASS, confirming generated program Skills already include quota/rank facets.

### Task 4: Required regression and build verification

**Files:**
- Modify docs only if behavior changed: `docs/ROADMAP.md`, `docs/PRD.md`, `docs/RELEASE.md`

- [ ] **Step 1: Run targeted Public Demo tests**

Run:
`npm test -- --run src/lib/demo-chat/skill-routing-diagnostics.test.ts 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/demo-chat/openai-file-search.test.ts scripts/skills/yiu-program-fact-skills.test.ts src/lib/demo-chat/skill-candidate-verifier.test.ts`

Expected: PASS.

- [ ] **Step 2: Run mandatory AI intake guard tests**

Run:
`npm test -- --run src/lib/ai/followup.test.ts`
`npm test -- --run src/lib/ai/response-guards.test.ts`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Update documentation**

Record the timeout/diagnostics behavior in Roadmap, Release notes, and PRD Tech Decisions.
