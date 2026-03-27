# Billing Top-Up Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reassert top-up-first premium credit debits and hide redundant Plans status cards once extra credits are exhausted.

**Architecture:** Keep the debit-order guarantee in Supabase SQL, and move Plans premium-card visibility into a tiny helper so the page can render one package card when `topupBalance` is zero and restore total/top-up cards only when extra credits exist.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase SQL migrations, next-intl

---

### Task 1: Lock the desired behavior in tests

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/plans/status-visibility.test.ts`
- Modify: `src/lib/billing/usage-debit-source-guard.test.ts`

**Step 1: Write the failing tests**

- Add a Plans visibility test that expects premium status to hide `total credits` and `extra credit balance` cards when `topupBalance` reaches `0`.
- Update the source guard to require a fresh migration that reasserts top-up-first debits.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/plans/status-visibility.test.ts src/lib/billing/usage-debit-source-guard.test.ts`

**Step 3: Write minimal implementation**

- Add a Plans status visibility helper.
- Add a new migration that recreates the debit trigger with top-up-first ordering.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/plans/status-visibility.test.ts src/lib/billing/usage-debit-source-guard.test.ts`

### Task 2: Update Plans UI and docs

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Render premium status conditionally**

- Show the combined `total remaining credits` card only while extra credits remain.
- Hide the `extra credit balance` card when `topupBalance` is `0`.
- Let the monthly package card render alone when top-up is exhausted.

**Step 2: Update docs**

- Record the top-up-first debit reassertion and the new Plans zero-topup visibility rule.

**Step 3: Verify**

Run: `npm run build`
