# Iyzico Subscription MVP Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Iyzico subscription management match the MVP policy: upgrades apply immediately, downgrades are scheduled and persisted for period end, and the UI stops promising unsupported self-serve resume behavior.

**Architecture:** Extend the Iyzico billing client so subscription plan changes can target either `NOW` or `NEXT_PERIOD`, then use that capability in the server checkout flow to persist pending downgrades onto the active subscription record. Keep the current plans UI, but align visible copy and tests with the real provider-backed lifecycle so the page reliably shows upcoming downgrades and does not advertise unavailable auto-renew resume.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase, Iyzico SDK, next-intl

---

### Task 1: Lock the expected Iyzico billing behavior with tests

**Files:**
- Modify: `src/lib/billing/mock-checkout.test.ts`
- Modify: `src/lib/billing/providers/iyzico/client.ts`
- Modify: `src/lib/billing/subscription-renewal.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`

**Step 1: Write the failing tests**

- Add a billing test that expects an Iyzico downgrade to call the provider with `NEXT_PERIOD`, persist `pending_plan_change`, and return a scheduled result with `effectiveAt`.
- Add a client-level assertion or mock expectation for configurable Iyzico upgrade period support.
- Add a UI test that proves the plans surface no longer promises in-app resume when auto-renew is off for provider-backed subscriptions.

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/billing/mock-checkout.test.ts src/lib/billing/subscription-renewal.test.ts src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx
```

Expected: FAIL on the new downgrade persistence / no-resume assertions.

### Task 2: Implement the minimal provider-backed downgrade persistence

**Files:**
- Modify: `src/lib/billing/providers/iyzico/client.ts`
- Modify: `src/lib/billing/mock-checkout.ts`

**Step 1: Add minimal implementation**

- Let the Iyzico client accept an explicit upgrade period parameter with `NOW` as the default.
- In the active-premium downgrade path, call the provider with `NEXT_PERIOD`, compute the effective date from the returned period or the current billing period end, and persist `pending_plan_change` metadata onto the active subscription record.
- Keep immediate upgrade behavior unchanged apart from routing through the new client signature.

**Step 2: Re-run the targeted tests**

Run:

```bash
npm test -- --run src/lib/billing/mock-checkout.test.ts
```

Expected: PASS.

### Task 3: Align plans UI and copy with real Iyzico lifecycle

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write minimal implementation**

- Update the plan-management copy so it does not promise unsupported in-app resume for Iyzico-backed cancellations.
- If needed, refine CTA visibility/text so the page only offers actions that actually exist.

**Step 2: Re-run the UI and renewal tests**

Run:

```bash
npm test -- --run src/lib/billing/subscription-renewal.test.ts src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx
```

Expected: PASS.

### Task 4: Update product docs and verify the branch

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the product decision**

- Record the Iyzico MVP billing policy and the completed persistence/copy fixes in PRD, roadmap, and release notes.
- Update the `Last Updated` date in roadmap and PRD.

**Step 2: Run final verification**

Run:

```bash
npm test -- --run src/lib/billing/mock-checkout.test.ts src/lib/billing/subscription-renewal.test.ts src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx
npm run build
```

Expected: PASS.
