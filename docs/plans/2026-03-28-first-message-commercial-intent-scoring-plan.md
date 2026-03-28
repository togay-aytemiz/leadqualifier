# First-Message Commercial Intent Scoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent first-message commercial inquiries such as pricing or detail requests from remaining `cold/0` when they clearly indicate business interest.

**Architecture:** Keep the existing async lead-extraction flow and realtime inbox updates unchanged. Adjust the lead-scoring calibration so commercial inquiry intent can establish a `warm` floor without incorrectly promoting low-signal greetings or non-business chats to hot leads.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Supabase, OpenAI GPT-4o-mini

---

### Task 1: Regression Test

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/leads/extraction.test.ts`
- Test: `/Users/togay/Desktop/leadqualifier/src/lib/leads/extraction.test.ts`

**Step 1: Write the failing test**

Add a regression test proving that a first-message pricing/detail inquiry with no confirmed service still calibrates to `warm`, not `cold`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/leads/extraction.test.ts`

Expected: the new regression test fails because current calibration caps the lead as `cold`.

### Task 2: Minimal Scoring Fix

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/leads/extraction.ts`
- Test: `/Users/togay/Desktop/leadqualifier/src/lib/leads/extraction.test.ts`

**Step 3: Write minimal implementation**

Update calibration to detect commercial inquiry intent from extracted summary/signals and apply a `warm` floor for business-context inquiries, while preserving current `hot` requirements and keeping greeting-only or opt-out cases `cold`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/leads/extraction.test.ts`

Expected: the new regression test passes with no unrelated failures in that file.

### Task 3: Verification And Docs

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

**Step 5: Verify broader safety**

Run:
- `npm test -- --run src/lib/leads/extraction.test.ts`
- `npm run build`

**Step 6: Update product docs**

Document the new first-message commercial-intent rule in roadmap, PRD, and release notes.
