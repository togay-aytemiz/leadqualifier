# Iyzico Launch Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get Qualy to a launch-safe Iyzico billing state where a customer can subscribe, upgrade or downgrade predictably, update the saved card, and recover from failed renewals without manual operator intervention.

**Architecture:** Keep Iyzico as the source of truth for recurring billing. Use subscription checkout form for first purchase, provider-backed upgrade for plan changes, provider-backed card-update checkout form for payment-method changes, and provider retry for failed renewal recovery. Keep upgrade charge copy conservative until sandbox proves exact mid-cycle charge behavior; local state should drive UI and support workflows, but should not attempt to replace provider billing math.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase, Iyzico SDK, next-intl

---

### Task 1: Lock the launch policy with failing tests

**Files:**
- Create: `src/lib/billing/providers/iyzico/client.test.ts`
- Create: `src/lib/billing/subscription-payment-recovery.test.ts`
- Modify: `src/app/api/billing/iyzico/webhook/route.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/status-query.test.ts`

**Step 1: Write the failing client tests**

Add tests that expect the Iyzico client to expose:

```ts
await initializeIyzicoSubscriptionCardUpdateCheckout({
  locale: 'tr',
  callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback',
  customerReferenceCode: 'cus_ref',
  subscriptionReferenceCode: 'sub_ref'
})

await retryIyzicoSubscriptionPayment({
  referenceCode: 'failed_order_ref'
})
```

**Step 2: Write the failing recovery-service tests**

Add tests for a new recovery module that expects:

```ts
const state = await getSubscriptionPaymentRecoveryState({ organizationId: 'org_1' })
expect(state).toEqual({
  canRetry: true,
  canUpdateCard: true,
  failedOrderReferenceCode: 'order_fail_1'
})
```

and:

```ts
const result = await retryFailedSubscriptionPayment({ organizationId: 'org_1' })
expect(result).toEqual({ ok: true, status: 'success', error: null })
```

**Step 3: Write the failing webhook/UI tests**

- Extend the renewal-failure webhook test so it proves `last_failed_order_reference_code` stays persisted for later retry.
- Extend the plans UI tests so `past_due` state shows `Update card` and `Retry payment` actions, and a successful card-update callback can show a neutral “card updated, retry payment” banner.

**Step 4: Run the targeted tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/billing/providers/iyzico/client.test.ts src/lib/billing/subscription-payment-recovery.test.ts src/app/api/billing/iyzico/webhook/route.test.ts 'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx' 'src/app/[locale]/(dashboard)/settings/plans/status-query.test.ts'
```

Expected: FAIL because card-update init, retry action, recovery state, and new plans UI are not implemented yet.

### Task 2: Add provider wrappers for card update and failed-payment retry

**Files:**
- Modify: `src/lib/billing/providers/iyzico/client.ts`
- Create: `src/lib/billing/providers/iyzico/client.test.ts`

**Step 1: Add minimal Iyzico client wrappers**

Implement two new functions:

```ts
export async function initializeIyzicoSubscriptionCardUpdateCheckout(input: {
  locale: IyzicoLocale
  callbackUrl: string
  customerReferenceCode: string
  subscriptionReferenceCode?: string
  conversationId?: string
}) { /* iyzico subscription.card-update checkout form init */ }

export async function retryIyzicoSubscriptionPayment(input: {
  referenceCode: string
}) { /* POST /v2/subscription/operation/retry */ }
```

Keep the existing upgrade client untouched except for any small helper extraction needed for testability.

**Step 2: Run the provider test**

Run:

```bash
npm test -- --run src/lib/billing/providers/iyzico/client.test.ts
```

Expected: PASS.

### Task 3: Add a small recovery service for `past_due` subscriptions

**Files:**
- Create: `src/lib/billing/subscription-payment-recovery.ts`
- Create: `src/lib/billing/subscription-payment-recovery.test.ts`
- Modify: `src/app/api/billing/iyzico/webhook/route.ts`

**Step 1: Write the minimal recovery service**

Create a narrow server-side module that:

```ts
export interface SubscriptionPaymentRecoveryState {
  canRetry: boolean
  canUpdateCard: boolean
  failedOrderReferenceCode: string | null
  customerReferenceCode: string | null
  subscriptionReferenceCode: string | null
}
```

and exposes:

```ts
getSubscriptionPaymentRecoveryState()
beginSubscriptionCardUpdate()
retryFailedSubscriptionPayment()
```

Rules:
- Only active `iyzico` subscription rows in `active|past_due` are eligible.
- Retry requires `last_failed_order_reference_code`.
- Card update requires `customerReferenceCode` plus `provider_subscription_id`.
- The module should never change billing state optimistically; retry waits for webhook success.

**Step 2: Make webhook failure metadata explicit**

Keep the existing `last_failed_order_reference_code` persistence, but make sure the webhook failure path also preserves or stores any missing provider IDs required by the recovery service in subscription metadata if they are not already reachable from the row.

**Step 3: Run the targeted recovery tests**

Run:

```bash
npm test -- --run src/lib/billing/subscription-payment-recovery.test.ts src/app/api/billing/iyzico/webhook/route.test.ts
```

Expected: PASS.

### Task 4: Add the hosted card-update flow and callback

**Files:**
- Create: `src/app/api/billing/iyzico/card-update/callback/route.ts`
- Create: `src/app/api/billing/iyzico/card-update/callback/route.test.ts`
- Create: `src/app/[locale]/(dashboard)/settings/plans/payment-method-update/[recordId]/page.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/payment-method-update/[recordId]/PaymentMethodUpdateEmbed.tsx`
- Modify: `src/lib/billing/providers/iyzico/checkout-embed.ts`

**Step 1: Reuse the existing hosted-checkout embedding pattern**

Mirror the current subscription-checkout page structure, but read card-update HTML content from the active subscription record metadata:

```ts
const checkoutFormContent = metadata.card_update_checkout_form_content
```

and render it with a dedicated small client component that reuses `resetIyzicoCheckoutRuntime`.

**Step 2: Implement the callback route**

The callback should:
- read provider callback params
- mark metadata like `last_card_update_result`
- redirect back to plans with a status query

Use a conservative redirect model:

```ts
redirect('/settings/plans?payment_recovery_action=card_update&payment_recovery_status=success')
```

Do not unlock `past_due` locally inside this callback. Card update only updates the saved card. Payment retry remains a separate action.

**Step 3: Run the callback tests**

Run:

```bash
npm test -- --run src/app/api/billing/iyzico/card-update/callback/route.test.ts src/lib/billing/providers/iyzico/checkout-embed.test.ts
```

Expected: PASS.

### Task 5: Wire `Retry payment` and `Update card` into `Settings > Plans`

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/PlansSettingsPageContent.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/status-query.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/status-query.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add two server actions**

In `PlansSettingsPageContent.tsx`, add two actions that call the recovery service:

```ts
const handleUpdatePaymentMethod = async (formData: FormData) => { /* start card update */ }
const handleRetryFailedPayment = async (formData: FormData) => { /* fire provider retry */ }
```

Rules:
- `Update card` redirects into the hosted card-update page.
- `Retry payment` redirects back to Plans with a pending or success banner and waits for webhook reconciliation.

**Step 2: Add UI affordances**

In `SubscriptionPlanManager.tsx`, show the actions only when:

```ts
snapshot?.membershipState === 'past_due'
```

and recovery state says the action is available.

Add copy for:
- `Update card`
- `Retry payment`
- `Card updated. Retry payment to reactivate.`
- `Payment retry requested. We will unlock access after provider confirmation.`
- failure states for unavailable retry or card update

**Step 3: Keep upgrade charge messaging conservative**

Do not change the current upgrade popup to promise an exact delta charge yet. Keep the provider-calculated notice until sandbox confirms the exact `NOW` behavior.

**Step 4: Run the plans tests**

Run:

```bash
npm test -- --run 'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx' 'src/app/[locale]/(dashboard)/settings/plans/status-query.test.ts' 'src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx'
```

Expected: PASS.

### Task 6: Verify upgrade semantics in Iyzico sandbox before hardening copy

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run the sandbox matrix**

Execute this manual matrix in Iyzico sandbox:

1. Buy `starter`.
2. Mid-cycle upgrade `starter -> growth` with `upgradePeriod=NOW` and `resetRecurrenceCount=false`.
3. Capture:
   - card charge amount
   - merchant panel order/payment records
   - webhook payloads
   - next renewal amount/date
4. Run one failed renewal scenario.
5. Update card.
6. Retry failed payment.

Expected:
- upgrade either charges a clean delta or exposes a clearly explainable provider behavior
- next renewal uses the target-plan full price
- card update succeeds without unlocking locally
- retry emits a follow-up webhook and restores premium on success

**Step 2: Decide the final launch toggle**

Use this decision rule:
- If sandbox shows acceptable immediate-upgrade billing, keep `upgradePeriod=NOW`.
- If sandbox is ambiguous or customer-hostile, switch live upgrade to `NEXT_PERIOD` for launch and keep the popup copy honest.

**Step 3: Document the final policy**

Update PRD, roadmap, and release notes with the chosen launch policy and the new recovery flows. Update `Last Updated` in PRD and roadmap.

### Task 7: Final verification and release gate

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run the billing-focused test set**

Run:

```bash
npm test -- --run src/lib/billing/mock-checkout.test.ts src/lib/billing/providers/iyzico/client.test.ts src/lib/billing/subscription-payment-recovery.test.ts src/lib/billing/subscription-renewal.test.ts src/app/api/billing/iyzico/webhook/route.test.ts src/app/api/billing/iyzico/card-update/callback/route.test.ts 'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx' 'src/app/[locale]/(dashboard)/settings/plans/status-query.test.ts'
```

Expected: PASS.

**Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS.

**Step 3: Release only if all launch gates are true**

Release gates:
- first subscription purchase works
- downgrade remains period-end only
- upgrade behavior is verified and documented
- `past_due` user can update card
- `past_due` user can request retry
- successful retry unlocks access via webhook
- support can find provider reference codes on the active subscription row

**Step 4: Commit**

```bash
git add docs/plans/2026-04-02-iyzico-launch-readiness-plan.md
git commit -m "docs: add iyzico launch readiness implementation plan"
```
