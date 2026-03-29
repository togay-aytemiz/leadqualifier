# Subscription Popup Charge Messaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a safer, clearer pricing summary in the plan-change popup for Iyzico-backed subscriptions.

**Architecture:** Add a small pure helper that classifies the selected subscription change as a new subscription, immediate upgrade, or period-end downgrade. Use that helper in the checkout consent modal so the UI shows what is knowable now (current plan, target plan, timing) and avoids claiming an exact upgrade charge that the current Iyzico integration does not preview.

**Tech Stack:** Next.js App Router, next-intl, TypeScript, Vitest

---

### Task 1: Lock popup decision rules with tests

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts`

**Step 1: Write the failing test**

- Cover:
  - new subscription => immediate start + full plan price
  - upgrade => immediate start + provider-calculated charge
  - downgrade => next-period start + no charge today

**Step 2: Run test to verify it fails**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts'`

**Step 3: Write minimal implementation**

- Add a pure helper that derives change type, timing, and charge mode from current vs target plan.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts'`

### Task 2: Render the new popup summary

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.ts`

**Step 1: Pass summary details into the modal**

- Keep existing summary line.
- Add optional detail rows and overrideable provider notice.

**Step 2: Use the helper in premium plan management**

- Show current plan, target plan, effect timing, and the correct Iyzico notice for upgrade/downgrade.

**Step 3: Keep hosted checkout flows accurate**

- Keep first subscription + top-up flows on the hosted-checkout notice.

### Task 3: Update copy, docs, and verification

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add TR/EN popup copy**

- Add labels and notices for hosted checkout, direct provider action, immediate effect, period-end effect, today’s charge behavior, and monthly price comparison.

**Step 2: Update docs**

- Record that active premium upgrade popup now avoids quoting an exact charge when Iyzico has no preview in the current integration.

**Step 3: Verify**

Run:
- `npm test -- --run 'src/app/[locale]/(dashboard)/settings/plans/subscription-checkout-summary.test.ts' 'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx'`
- `npm run build`
