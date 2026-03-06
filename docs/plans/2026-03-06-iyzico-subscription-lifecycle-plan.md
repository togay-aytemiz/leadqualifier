# Iyzico Subscription Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make iyzico subscription renewal and cancellation provider-backed, so recurring renewals really refresh package credits, failed renewals really block access, and user-triggered cancellation really cancels the provider subscription.

**Architecture:** Keep checkout callback for first activation, then add a separate iyzico webhook route for recurring lifecycle events. Use provider-specific renewal actions for iyzico, persist webhook/payment failure metadata for idempotency and support follow-up retry/card-update work, and keep billing-state mutations server-side only.

**Tech Stack:** Next.js App Router, Supabase service-role updates, iyzipay SDK, Vitest, next-intl.

---

### Task 1: Lock the lifecycle policy with failing tests

**Files:**
- Create: `src/lib/billing/providers/iyzico/webhook.test.ts`
- Modify: `src/lib/billing/subscription-renewal.test.ts`

**Step 1: Write failing tests**
- Add signature-validation tests for subscription webhook payloads.
- Add cancel-renewal tests proving `BILLING_PROVIDER=iyzico` must call provider cancel instead of mock RPCs.
- Add unsupported-resume test for iyzico.

**Step 2: Run tests to verify failure**
Run: `npm test -- --run src/lib/billing/providers/iyzico/webhook.test.ts src/lib/billing/subscription-renewal.test.ts`
Expected: FAIL because webhook helpers and provider-backed renewal actions are missing.

**Step 3: Write minimal implementation**
- Add webhook signature helper.
- Add iyzico provider action branching in renewal controls.

**Step 4: Re-run tests**
Run the same command until green.

**Step 5: Commit**
`git commit -m "test(phase-8.5): cover iyzico webhook signature and renewal actions"`

### Task 2: Implement provider-backed iyzico lifecycle helpers

**Files:**
- Create: `src/lib/billing/providers/iyzico/webhook.ts`
- Modify: `src/lib/billing/providers/iyzico/client.ts`
- Modify: `src/types/iyzipay.d.ts`

**Step 1: Add failing test coverage for cancel/retrieve helpers if needed**
- Extend existing tests or create focused helper tests if an uncovered branch appears.

**Step 2: Implement minimal helpers**
- Add `cancelIyzicoSubscription`.
- Add `retrieveIyzicoSubscription`.
- Add pure webhook helpers for signature validation and payload normalization.

**Step 3: Re-run focused tests**
Run: `npm test -- --run src/lib/billing/providers/iyzico/webhook.test.ts src/lib/billing/subscription-renewal.test.ts`
Expected: PASS.

**Step 4: Commit**
`git commit -m "feat(phase-8.5): add iyzico subscription lifecycle helpers"`

### Task 3: Add iyzico webhook route for renewal success/failure

**Files:**
- Create: `src/app/api/billing/iyzico/webhook/route.ts`
- Create: `src/app/api/billing/iyzico/webhook/route.test.ts`
- Modify: `src/app/api/billing/iyzico/callback/route.ts` (share lifecycle helpers if useful)

**Step 1: Write failing route tests**
- `subscription.order.success` resets monthly package credits and refreshes period dates without touching persistent top-up carryover.
- Duplicate success event is idempotent.
- `subscription.order.failure` marks billing/account as `past_due` and stores retry metadata.
- Invalid signature returns 401.

**Step 2: Run tests to verify failure**
Run: `npm test -- --run src/app/api/billing/iyzico/webhook/route.test.ts`
Expected: FAIL because route does not exist.

**Step 3: Implement minimal route**
- Validate `X-IYZ-SIGNATURE-V3` using `IYZICO_SECRET_KEY`.
- Resolve subscription by `provider_subscription_id`.
- On success: retrieve subscription details from iyzico, update local period + package state, preserve top-up balance.
- On failure: mark subscription/account `past_due`, store failed `orderReferenceCode` for future retry flow.
- Acknowledge duplicate/already-applied events with 200.

**Step 4: Re-run tests**
Run: `npm test -- --run src/app/api/billing/iyzico/webhook/route.test.ts`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(phase-8.5): sync iyzico recurring renewal lifecycle from webhook events"`

### Task 4: Replace mock renewal controls with provider-aware cancel UX

**Files:**
- Modify: `src/lib/billing/subscription-renewal.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Write failing expectations first**
- Extend `subscription-renewal.test.ts` for cancel success path and unsupported resume.
- Add UI test only if existing component-test setup makes it cheap; otherwise keep coverage in server-action layer.

**Step 2: Implement minimal behavior**
- For iyzico: cancel action calls provider cancel immediately and updates local billing state to `canceled`.
- For iyzico: do not expose resume CTA after cancel.
- Update success/error copy so cancel feedback matches real provider behavior.

**Step 3: Re-run focused tests**
Run: `npm test -- --run src/lib/billing/subscription-renewal.test.ts src/app/api/billing/iyzico/webhook/route.test.ts`
Expected: PASS.

**Step 4: Commit**
`git commit -m "fix(phase-8.5): align plans subscription controls with iyzico cancel semantics"`

### Task 5: Verify and document the renewal-failure policy

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**
Run:
- `npm test -- --run src/lib/billing/providers/iyzico/webhook.test.ts src/lib/billing/subscription-renewal.test.ts src/app/api/billing/iyzico/webhook/route.test.ts src/lib/billing/premium-activation.test.ts`
- `npm run build`

**Step 2: Update docs**
- Record that renewal success/failure is now webhook-driven.
- Record that iyzico cancel is immediate.
- Record the current failed-renewal policy: mark `past_due`, store retry metadata, and block usage until a successful provider-side retry/new purchase.

**Step 3: Commit**
`git commit -m "docs(phase-8.5): document iyzico lifecycle sync and failed-renewal policy"`
