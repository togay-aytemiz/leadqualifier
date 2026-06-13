# Intent-Aware Skill Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce incorrect Public Demo Skill replies by rewriting non-exact user turns into standalone intent queries and explicitly verifying semantic Skill candidates before execution.

**Architecture:** Keep exact trigger matches as the fast path. For non-exact turns, use recent history only to resolve references, retrieve the top three semantic Skill candidates, and let a compact LLM return one candidate id or `NO_SKILL`; pass the verified candidate into the shared inbound pipeline so it cannot be replaced by a second uncontrolled match.

**Tech Stack:** Next.js route handlers, TypeScript, OpenAI Chat Completions, Supabase Skill matching, Vitest.

---

### Task 1: Add Candidate Verification Contracts

**Files:**
- Create: `src/lib/demo-chat/skill-candidate-verifier.ts`
- Create: `src/lib/demo-chat/skill-candidate-verifier.test.ts`

- [x] **Step 1: Write failing parser and verifier tests**

Cover valid candidate selection, `NO_SKILL`, and rejection of a model-returned id outside the supplied candidate list.

- [x] **Step 2: Run the verifier test and confirm RED**

Run: `npm test -- --run src/lib/demo-chat/skill-candidate-verifier.test.ts`

- [x] **Step 3: Implement the minimal verifier**

Use a compact JSON-only prompt. Require subject and requested-facet agreement, permit `NO_SKILL`, and validate the returned id against the supplied candidates.

- [x] **Step 4: Run the verifier test and confirm GREEN**

Run: `npm test -- --run src/lib/demo-chat/skill-candidate-verifier.test.ts`

### Task 2: Produce Intent Metadata for Every Non-Exact Turn

**Files:**
- Modify: `src/lib/demo-chat/skill-query-rewriter.ts`
- Modify: `src/lib/demo-chat/skill-query-rewriter.test.ts`

- [x] **Step 1: Add a failing standalone-without-history test**

Assert that the rewriter runs without conversation history and returns a standalone query, subject, facet, and clarification flag.

- [x] **Step 2: Run the rewriter test and confirm RED**

Run: `npm test -- --run src/lib/demo-chat/skill-query-rewriter.test.ts`

- [x] **Step 3: Extend the rewrite contract and prompt**

Keep history restricted to reference resolution. Add normalized `subject`, `facet`, and `needs_clarification` fields while preserving existing follow-up decisions.

- [x] **Step 4: Run the rewriter test and confirm GREEN**

Run: `npm test -- --run src/lib/demo-chat/skill-query-rewriter.test.ts`

### Task 3: Carry a Verified Skill into the Shared Pipeline

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

- [x] **Step 1: Add a failing preferred-candidate test**

Assert that a supplied verified candidate bypasses semantic rematching and produces its Skill response.

- [x] **Step 2: Run the targeted pipeline test and confirm RED**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts -t "uses a verified preferred skill"`

- [x] **Step 3: Implement the optional preferred candidate input**

Use the candidate only for the demo path that supplies it; retain existing behavior for all WhatsApp, Instagram, and Telegram callers.

- [x] **Step 4: Run the targeted pipeline test and confirm GREEN**

Run the same targeted command and confirm the matcher was not called.

### Task 4: Wire Exact, Rewrite, Retrieve, Verify, and Fallback

**Files:**
- Modify: `src/app/api/demo/[slug]/chat/route.ts`
- Modify: `src/app/api/demo/[slug]/chat/route.test.ts`

- [x] **Step 1: Add failing route tests**

Cover a correct semantic candidate selection and a false-positive candidate rejected as `NO_SKILL` before RAG fallback.

- [x] **Step 2: Run route tests and confirm RED**

Run: `npm test -- --run src/app/api/demo/[slug]/chat/route.test.ts`

- [x] **Step 3: Implement the intent-aware route**

Run exact matching first. Otherwise rewrite the turn, retrieve three candidates, verify them, and pass only the selected candidate to the inbound pipeline. On rewrite/verifier failure or `NO_SKILL`, continue to the existing RAG path.

- [x] **Step 4: Run route tests and confirm GREEN**

Run the route test command again.

### Task 5: Document and Verify

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Document the routing decision**

Record the exact-first, intent-aware candidate verification behavior and the explicit `NO_SKILL` fallback.

- [x] **Step 2: Run mandatory regression tests**

Run:
- `npm test -- --run src/lib/ai/followup.test.ts`
- `npm test -- --run src/lib/ai/response-guards.test.ts`
- `npm test -- --run src/lib/demo-chat/skill-query-rewriter.test.ts src/lib/demo-chat/skill-candidate-verifier.test.ts src/app/api/demo/[slug]/chat/route.test.ts`

- [x] **Step 3: Run the production build**

Run: `npm run build`

- [x] **Step 4: Review the final diff**

Confirm changes are limited to the approved Public Demo Skill routing behavior, shared preferred-candidate input, tests, and required documentation.
