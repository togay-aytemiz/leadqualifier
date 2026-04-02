# Upgrade True-Up Popup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the subscription plan-change confirmation popup so immediate upgrades clearly show full delta charge, full delta credit grant, and preserved next renewal date.

**Architecture:** Move upgrade summary-detail composition into a pure helper next to `subscription-checkout-summary` so pricing/credit/renewal messaging is testable without UI interaction. Keep the modal reusable, wire the new detail set from `SubscriptionPlanManager`, and update TR/EN copy plus docs to match the chosen full true-up model.

**Tech Stack:** Next.js App Router, React client components, `next-intl`, Vitest.

---

### Task 1: Lock the new upgrade detail contract with tests

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts`

**Step 1: Write the failing test**

Add or update tests so immediate upgrades expect:
- `chargeMode` to represent full delta charge instead of provider-calculated
- `creditDelta` to equal the full plan-credit delta
- helper-produced details to include today's full delta charge, today's full delta credits, and next renewal date

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts"`

Expected: FAIL because the current summary still treats upgrades as provider-calculated and does not build the new detail rows.

### Task 2: Implement the true-up popup detail builder

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Write minimal implementation**

Change the upgrade summary model to full delta, expose credit delta, add a pure detail builder, and render the resulting rows in the plan-change modal. Upgrade rows must show full delta charge, immediate credit delta, and preserved renewal date.

**Step 2: Run targeted tests**

Run:
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts"`
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx"`
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx"`

Expected: PASS

### Task 3: Update docs and verify the repo

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

Document that immediate credit-based upgrades now surface a full true-up model in the popup: full delta price, full delta credits, and unchanged renewal anchor.

**Step 2: Run final verification**

Run:
- `npm run i18n:check`
- `npm run build`

Expected: PASS
