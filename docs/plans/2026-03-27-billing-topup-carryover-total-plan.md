# Billing Topup Carryover Total Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Settings > Plans` show carried-over trial credits inside the premium extra-credit total so remaining balance is rendered against the real starting pool.

**Architecture:** Keep the UI calculation simple and deterministic: derive the displayed extra-credit total from `current topup balance + topup usage already consumed`, instead of summing only paid purchase orders. Read topup consumption from `organization_credit_ledger` so trial carryover, purchases, and later mixed topup/package debits all resolve through one source of truth.

**Tech Stack:** Next.js App Router, Supabase, Vitest, TypeScript

---

### Task 1: Lock the carryover regression with tests

**Files:**
- Create: `src/lib/billing/topup-status.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/status-visibility.test.ts`

**Step 1: Write the failing test**

- Add a helper test proving topup usage rows (`topup_pool` and `mixed.topup_debit`) reconstruct a `200` total from `153.5` remaining + `46.5` consumed.
- Add a Plans status-visibility test asserting the extra-credit card renders `200` total and a partial progress value for carryover.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/billing/topup-status.test.ts src/app/[locale]/(dashboard)/settings/plans/status-visibility.test.ts`

Expected: FAIL because Plans status logic still uses paid purchase totals only.

### Task 2: Implement the minimal source-of-truth fix

**Files:**
- Create: `src/lib/billing/topup-status.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/status-visibility.ts`

**Step 1: Write minimal implementation**

- Add a billing helper that reads topup-related usage debits from `organization_credit_ledger`, including `mixed` rows via `metadata.topup_debit`.
- Replace the Plans page `credit_purchase_orders` total query with the new consumed-topup query.
- Update premium status visibility so extra-credit total becomes `currentBalance + consumedTopupCredits`.

**Step 2: Run targeted tests**

Run: `npm test -- --run src/lib/billing/topup-status.test.ts src/app/[locale]/(dashboard)/settings/plans/status-visibility.test.ts src/app/[locale]/(dashboard)/settings/plans/page.source.test.ts`

Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Full verification**

Run: `npm run build`

Expected: PASS

**Step 2: Update docs**

- Record the carryover total rule in roadmap/PRD update notes.
- Add an unreleased `Fixed` note explaining that carried-over trial credits now render against the correct extra-credit total in Plans.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-27-billing-topup-carryover-total-plan.md src/lib/billing/topup-status.ts src/lib/billing/topup-status.test.ts src/app/[locale]/(dashboard)/settings/plans/page.tsx src/app/[locale]/(dashboard)/settings/plans/status-visibility.ts src/app/[locale]/(dashboard)/settings/plans/status-visibility.test.ts docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "fix(phase-8.5): include carried-over trial credits in topup totals"
```
