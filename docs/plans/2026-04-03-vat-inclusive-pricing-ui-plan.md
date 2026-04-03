# VAT-Inclusive Pricing UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show that subscription and top-up prices are VAT-inclusive across the in-app plans surfaces for both subscribed and unsubscribed organizations.

**Architecture:** Add translatable VAT-inclusive helper copy to the shared `billingPlans` message namespace, then render that copy on the two subscription package surfaces (`SubscriptionPlanCatalog` and `SubscriptionPlanManager`) plus the top-up surface (`TopupCheckoutCard`). Lock the behavior with focused source/component regression tests and finish with docs/build verification.

**Tech Stack:** Next.js App Router, React, next-intl, Vitest

---

### Task 1: Add failing regression tests for VAT-inclusive pricing copy

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.source.test.ts`
- Create: `src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.source.test.ts`

**Step 1: Write the failing tests**

- Expect unsubscribed package cards to render a VAT-inclusive helper line.
- Expect subscribed manage-plan modal cards to render a VAT-inclusive helper line.
- Expect top-up UI to render a VAT-inclusive helper line in both the card/modal source.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.test.tsx src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.source.test.ts src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.source.test.ts`

Expected: FAIL because the VAT-inclusive copy is not rendered yet.

### Task 2: Add translatable VAT-inclusive copy

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add new keys**

- Add one reusable helper line for monthly package prices.
- Add one reusable helper line for top-up / extra-credit prices.

**Step 2: Keep TR/EN mirrored**

- Ensure both locales contain the same new keys and wording intent.

### Task 3: Render VAT-inclusive copy on all pricing surfaces

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx`

**Step 1: Update unsubscribed package cards**

- Render the monthly VAT-inclusive note below the visible package pricing details.

**Step 2: Update subscribed manage-plan modal**

- Render the same monthly VAT-inclusive note below each selectable package card.

**Step 3: Update top-up surfaces**

- Render a VAT-inclusive note on the main top-up card and inside the modal summary area.

### Task 4: Verify and document

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted tests**

Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.test.tsx src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.source.test.ts src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.source.test.ts`

Expected: PASS

**Step 2: Run build**

Run: `npm run build`

Expected: PASS

**Step 3: Update docs**

- Record the VAT-inclusive pricing-copy rule in PRD and ROADMAP.
- Add the UI copy change to RELEASE notes.
