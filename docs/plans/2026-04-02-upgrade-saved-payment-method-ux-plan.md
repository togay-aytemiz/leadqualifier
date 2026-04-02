# Upgrade Saved Payment Method UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clarify in the plan-change confirmation modal that immediate upgrades charge the saved subscription payment method instead of showing a new card-entry screen.

**Architecture:** Extend the existing checkout-summary detail builder with an optional saved-payment-method row that can render either a generic saved-card message or a masked-card suffix when reliable metadata exists. Feed that detail from the plans page/modal only for direct subscription plan changes, not first-purchase hosted checkout.

**Tech Stack:** Next.js App Router, React, next-intl, Vitest.

---

### Task 1: Add failing checkout-summary tests

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts`

**Step 1: Write failing tests**
- Add one test proving direct upgrades include a saved-payment-method detail line.
- Add one test proving the helper prefers masked last4 copy when `savedPaymentMethod.last4` exists.

**Step 2: Run test to verify it fails**
Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts"`
Expected: FAIL because the helper does not yet render any saved-payment-method detail.

### Task 2: Implement the summary detail row

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`

**Step 1: Add minimal helper support**
- Extend the detail-label contract with saved-payment-method labels.
- Allow the builder to accept optional saved-payment-method metadata.
- Render the row only for direct subscription plan changes where we are not going to a hosted checkout form.

**Step 2: Wire modal input**
- Pass a generic saved payment method state from `SubscriptionPlanManager` for active subscription changes.
- If reliable masked-card metadata exists later, keep the API ready for `last4`.

**Step 3: Run targeted tests**
Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts"`
Expected: PASS.

### Task 3: Add localized copy and source guard

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Create or modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.source.test.ts`

**Step 1: Add TR/EN copy**
- Generic copy: charged from saved payment method.
- Optional copy: charged from saved card ending in `1234`.

**Step 2: Add source guard if useful**
- Assert the manager wires the saved-payment-method labels into the helper.

### Task 4: Update docs and verify

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the UX decision**
- Note that direct upgrades now explicitly warn about charging the saved subscription payment method instead of sending the user to a fresh card form.

**Step 2: Run verification**
Run:
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts"`
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.source.test.ts"`
- `npm run i18n:check`
- `npm run build`

**Step 3: Commit**
- Suggested: `fix(phase-8.5): clarify saved-card charging in upgrade confirmation`
