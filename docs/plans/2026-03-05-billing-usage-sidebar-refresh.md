# Billing Usage And Sidebar Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix usage breakdown/category inconsistencies for knowledge-processing credits and ensure sidebar/mobile billing balances refresh during SPA navigation after async billing-affecting work.

**Architecture:** Keep the fix narrow. Extend billing usage breakdown source mapping so embedding costs are attributed to the correct visible bucket, then broaden the billing refresh signal to include route changes so mounted navigation shells re-fetch billing snapshots without requiring a full page reload.

**Tech Stack:** Next.js App Router, React client components, Supabase, Vitest

---

### Task 1: Lock the broken billing usage breakdown

**Files:**
- Modify: `src/lib/billing/usage.test.ts`
- Modify: `src/lib/billing/usage.ts`

**Step 1: Write the failing test**

Add a case that mixes:
- `embedding` + `knowledge_chunk_index_embedding`
- `embedding` + `knowledge_search_query_embedding`
- `embedding` + `skill_query_embedding`
- `lead_extraction` + `required_intake_followup`

Assert that:
- query embeddings count under AI replies
- chunk/index embeddings count under document processing
- follow-up usage counts under lead extraction

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/billing/usage.test.ts`

Expected: FAIL because embedding usage is currently omitted from the visible breakdown and `required_intake_followup` is grouped incorrectly.

**Step 3: Write minimal implementation**

Update the breakdown mapping in `src/lib/billing/usage.ts` so category+source combinations are routed into the existing UI buckets.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/billing/usage.test.ts`

Expected: PASS

### Task 2: Lock the stale sidebar refresh behavior

**Files:**
- Modify: `src/lib/billing/refresh-signal.test.ts`
- Modify: `src/lib/billing/refresh-signal.ts`
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/MobileBottomNav.tsx`

**Step 1: Write the failing test**

Add a case showing that the billing refresh signal changes when the pathname changes, even if checkout query params do not.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/billing/refresh-signal.test.ts`

Expected: FAIL because the signal currently ignores route transitions.

**Step 3: Write minimal implementation**

Extend the refresh-signal helper to include pathname and pass it from the sidebar/mobile nav components.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/billing/refresh-signal.test.ts`

Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run:
- `npm test -- --run src/lib/billing/usage.test.ts`
- `npm test -- --run src/lib/billing/refresh-signal.test.ts`

**Step 2: Run regression build**

Run: `npm run build`

Expected: PASS

**Step 3: Update docs**

Document the billing usage/source-mapping fix and sidebar refresh fallback in roadmap, PRD, and release notes.
