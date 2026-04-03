# Top-up Embed Checkout Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make top-up checkout use the same in-app embedded Iyzico experience as subscription checkout and avoid auth/context loss after successful top-up purchase.

**Architecture:** Keep the existing Iyzico top-up initialization and callback logic, but stop redirecting users to the provider `paymentPageUrl`. Instead, persist the returned hosted checkout HTML on the pending top-up order, redirect to a local `Settings > Plans` embed route, and render the same checkout embed runtime used by subscription checkout. Add regression coverage for the new redirect target and the new route contract before changing production code.

**Tech Stack:** Next.js App Router, next-intl, Supabase, Vitest, Iyzico hosted checkout

---

### Task 1: Lock the new top-up embed contract with failing tests

**Files:**
- Modify: `src/lib/billing/mock-checkout.test.ts`
- Create: `src/app/[locale]/(dashboard)/settings/plans/topup-checkout.source.test.ts`

**Step 1: Write the failing redirect test**

- Add a test proving `simulateMockTopupCheckout()` returns a local `/settings/plans/topup-checkout/[recordId]` redirect when Iyzico returns a hosted checkout payload.
- Assert the service write persists `checkout_form_content` on the pending top-up order metadata.

**Step 2: Write the failing route source guard**

- Add a source test for the new top-up checkout page that requires:
  - reading `credit_purchase_orders`
  - reading `metadata.checkout_form_content`
  - rendering the shared checkout embed

**Step 3: Run the targeted tests and confirm RED**

Run:
`npm test -- --run src/lib/billing/mock-checkout.test.ts src/app/[locale]/(dashboard)/settings/plans/topup-checkout.source.test.ts`

Expected: FAIL because top-up still redirects to external `paymentPageUrl` and the local route does not exist yet.

### Task 2: Implement the in-app top-up embed flow

**Files:**
- Modify: `src/lib/billing/mock-checkout.ts`
- Create: `src/app/[locale]/(dashboard)/settings/plans/topup-checkout/[recordId]/page.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/HostedCheckoutEmbed.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout/[recordId]/page.tsx`

**Step 1: Share the checkout embed runtime**

- Extract the current subscription embed client logic into a shared `HostedCheckoutEmbed` component under the plans folder.
- Point the existing subscription checkout page at that shared component.

**Step 2: Persist top-up hosted checkout HTML**

- In `simulateMockTopupCheckout()`, read `checkoutFormContent` from Iyzico init response in addition to the token.
- Treat missing token or missing checkout HTML as an error.
- Persist `checkout_form_content` on the pending `credit_purchase_orders` metadata.

**Step 3: Redirect top-up to a local route**

- Replace the external `paymentPageUrl` redirect with a localized in-app route:
  `/settings/plans/topup-checkout/[recordId]`

**Step 4: Add the top-up checkout page**

- Read the pending order by `recordId` from `credit_purchase_orders`.
- Require `provider = iyzico`.
- Read `metadata.checkout_form_content`.
- If missing, redirect back to `Settings > Plans` with a top-up error query.
- Otherwise render the shared embed inside the same minimal wrapper used by subscription checkout.

### Task 3: Verify and document

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused tests**

Run:
`npm test -- --run src/lib/billing/mock-checkout.test.ts src/app/[locale]/(dashboard)/settings/plans/topup-checkout.source.test.ts src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.test.tsx src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.source.test.ts src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.source.test.ts`

Expected: PASS

**Step 2: Run build**

Run:
`npm run build`

Expected: PASS

**Step 3: Update docs**

- Record that top-up checkout now follows the same in-app hosted embed pattern as subscription checkout to avoid external full-page divergence and auth/context loss risk after success callback.
