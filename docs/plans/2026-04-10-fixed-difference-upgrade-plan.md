# Fixed-Difference Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Charge only the fixed package-price difference today, unlock the higher package immediately, and schedule the recurring subscription itself to switch at the next billing period.

**Architecture:** Active subscription upgrades stop using direct `NOW` subscription upgrade. Instead, the app creates a one-time hosted Iyzico checkout for the fixed difference, finalizes that payment in the callback, then applies local entitlement immediately and schedules the provider subscription with `upgradePeriod=NEXT_PERIOD` and `resetRecurrenceCount=false`.

**Tech Stack:** Next.js App Router server actions/routes, Supabase service-role writes, Iyzico checkout form + subscription upgrade APIs, Vitest.

---

### Task 1: Red tests for upgrade summary and CTA

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx`

**Step 1:** Write failing tests asserting active-plan upgrades use a fixed-difference charge summary and CTA instead of provider-calculated saved-card copy.

**Step 2:** Run:

```bash
npm test -- --run 'src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts' 'src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx'
```

Expected: failing assertions against the old provider-calculated upgrade copy.

### Task 2: Red tests for hosted fixed-difference upgrade checkout

**Files:**
- Modify: `src/lib/billing/mock-checkout.test.ts`

**Step 1:** Replace the current immediate-upgrade expectations with tests asserting:
- active upgrades create a hosted checkout redirect,
- the charged amount is the fixed price difference,
- `upgradeIyzicoSubscription(...NOW)` is not called during initiation.

**Step 2:** Run:

```bash
npm test -- --run src/lib/billing/mock-checkout.test.ts
```

Expected: failures because the current code still executes direct `NOW` upgrades.

### Task 3: Red tests for callback finalization

**Files:**
- Modify: `src/app/api/billing/iyzico/callback/route.test.ts`

**Step 1:** Add a failing test for a paid upgrade-difference order that must:
- call top-up payment retrieve,
- schedule provider upgrade with `NEXT_PERIOD`,
- apply local entitlement immediately,
- insert an upgrade ledger row with fixed-difference charge metadata,
- redirect back with success feedback.

**Step 2:** Run:

```bash
npm test -- --run src/app/api/billing/iyzico/callback/route.test.ts
```

Expected: failure because upgrade-difference orders are not finalized specially yet.

### Task 4: Implement server and UI changes

**Files:**
- Modify: `src/lib/billing/mock-checkout.ts`
- Modify: `src/app/api/billing/iyzico/callback/route.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/PlansSettingsPageContent.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.ts`
- Create: `src/app/[locale]/(dashboard)/settings/plans/upgrade-checkout/[recordId]/page.tsx`

**Step 1:** Initiate active upgrades as hosted fixed-difference checkout orders.

**Step 2:** Finalize successful payment callbacks by scheduling provider `NEXT_PERIOD` upgrade, then applying immediate local entitlement + ledger history.

**Step 3:** Update plan-change copy and CTA text to match the fixed-difference hosted checkout flow.

### Task 5: Verification and docs

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1:** Run focused tests for touched files.

**Step 2:** Run:

```bash
npm run i18n:check
npm run build
git diff --check
```

**Step 3:** Update product docs to lock the new upgrade policy.
