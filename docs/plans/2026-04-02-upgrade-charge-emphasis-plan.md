# Upgrade Charge Emphasis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make direct upgrade confirmations emphasize the actual amount charged today by moving that row to the bottom, rendering it strongly, and reflecting the amount in the primary CTA label.

**Architecture:** Extend the checkout-summary helper so detail rows can carry emphasis metadata and the charged-today row can be appended last only when a real amount is taken. Add a small CTA-label helper so `SubscriptionPlanManager` can render `₺300 ödeme yap` style labels for direct-charge upgrades while keeping the existing default label for no-charge changes.

**Tech Stack:** Next.js App Router, React, next-intl, Vitest.

---

### Task 1: Add failing tests

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx`

**Step 1: Write failing tests**
- Assert that immediate-upgrade summary details put `Bugünkü tahsilat` last with strong emphasis metadata.
- Assert that the direct-upgrade CTA label can render the charged amount.
- Assert the modal renders emphasized detail rows with stronger typography.

**Step 2: Run tests to verify they fail**
Run:
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts"`
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx"`

### Task 2: Implement summary and CTA helpers

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`

**Step 1: Add minimal helper support**
- Allow summary detail rows to carry emphasis metadata.
- Move charged-today rows to the bottom only when a real amount is charged.
- Add a helper that resolves CTA copy like `{price} ödeme yap`.

**Step 2: Wire the modal**
- Feed the helper-based CTA label into `CheckoutLegalConsentModal`.

### Task 3: Render emphasis in the modal and update copy

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Render strong rows**
- Apply stronger text styles to emphasized rows.

**Step 2: Add CTA translations**
- Add `{price} ödeme yap / Pay {price}` style strings for charged actions.

### Task 4: Update docs and verify

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the UX**
- Note that direct-charge upgrades now visually emphasize the amount and mirror it in the CTA.

**Step 2: Run verification**
Run:
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts"`
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx"`
- `npm run i18n:check`
- `npm run build`

**Step 3: Commit**
- Suggested: `fix(phase-8.5): emphasize direct-upgrade charge in confirmation modal`
