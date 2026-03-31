# Media-Backed Commercial Inquiry Warm Classification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure media-backed first-contact inquiries asking for commercial information do not persist as `cold` when the customer is clearly asking about the shared offering.

**Architecture:** Keep the change inside lead extraction so Inbox and Leads continue to consume the existing lead snapshot shape. Add a narrow media-aware commercial-intent promotion step before score calibration, backed by regression tests, then update product docs to reflect the new rule.

**Tech Stack:** Next.js, TypeScript, Vitest

---

### Task 1: Add the failing regression test

**Files:**
- Modify: `src/lib/leads/extraction.test.ts`

**Step 1: Write the failing test**

Add a test covering an inbound Instagram media-backed message like `Merhaba, bunun hakkında daha fazla bilgi alabilir miyim?` and assert that the extracted lead is promoted to at least `informational_commercial` / `warm`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/leads/extraction.test.ts`

Expected: FAIL on the new media-backed commercial inquiry expectation.

### Task 2: Implement the minimal media-aware intent promotion

**Files:**
- Modify: `src/lib/leads/extraction.ts`

**Step 1: Add a narrow commercial-intent detector**

Use recent customer media-backed turns plus generic commercial request phrasing to detect when `this/about this` style questions refer to a shared attachment.

**Step 2: Promote extraction before calibration**

Raise `intent_stage` to `informational_commercial` for that narrow case so score recalibration yields `warm` without requiring a detected service name.

**Step 3: Run focused tests**

Run: `npm test -- --run src/lib/leads/extraction.test.ts`

Expected: PASS.

### Task 3: Verify and document the change

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run: `npm run build`

Expected: successful production build.

**Step 2: Update docs**

Record the new media-backed commercial-inquiry behavior in roadmap, PRD update notes/decisions, and release notes.
