# Billing Credit Priority And Plans Total Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make premium workspaces consume carry-over extra credits before monthly package credits, and surface total remaining credits in `Settings > Plans`.

**Architecture:** Keep the premium credit-pool rule consistent across snapshot/UI and the database debit trigger. Reuse the existing billing snapshot as the source for a new total-credits status card in Plans so sidebar and Plans read from the same total.

**Tech Stack:** Next.js App Router, next-intl, Vitest, Supabase SQL migrations

---

### Task 1: Lock the intended credit-pool priority in tests

**Files:**
- Modify: `src/lib/billing/snapshot.test.ts`
- Create: `src/lib/billing/usage-debit-source-guard.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`

**Step 1: Write the failing tests**

- Add a snapshot test asserting `premium_active` with both package and top-up balance resolves `activeCreditPool === 'topup_pool'`.
- Add a source-guard test asserting the latest billing debit migration debits `topup` before `package`.
- Add a Plans UI test asserting the rendered status surface includes total remaining credits when premium is active.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/billing/snapshot.test.ts src/lib/billing/usage-debit-source-guard.test.ts src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`

**Step 3: Implement the minimal code**

- Update snapshot pool resolution to prefer top-up when premium has any extra-credit balance.
- Add/update the SQL trigger migration so premium usage debits consume top-up first.
- Update Plans status UI to show `snapshot.totalRemainingCredits` in a visible summary row/card.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/billing/snapshot.test.ts src/lib/billing/usage-debit-source-guard.test.ts src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`

**Step 5: Commit**

```bash
git add src/lib/billing/snapshot.test.ts src/lib/billing/usage-debit-source-guard.test.ts src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx
git commit -m "fix(phase-8.5): prioritize carryover credits and show plan totals"
```

### Task 2: Update docs and verify production build

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update roadmap and PRD**

- Record the new carry-over credit priority rule.
- Record that Plans now surfaces total remaining credits alongside pool breakdowns.

**Step 2: Update release notes**

- Add a `Fixed` entry for credit-pool priority.
- Add a `Changed` or `Fixed` note for Plans total visibility.

**Step 3: Run final verification**

Run: `npm run build`

**Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record billing credit priority and plans total visibility"
```
