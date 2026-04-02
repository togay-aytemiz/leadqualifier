# Plan Change Consent Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the subscription plan-change confirmation modal so existing subscribers confirm the change once without re-accepting the full legal bundle on every upgrade or downgrade.

**Architecture:** Keep `CheckoutLegalConsentModal` reusable by introducing a plan-change-specific consent variant instead of forking a second modal. Wire that lighter variant only from `SubscriptionPlanManager`, leave new subscription and top-up flows on the existing legal acceptance path, and update translations so the copy matches the reduced-friction UX.

**Tech Stack:** Next.js App Router, React client components, `next-intl`, Vitest, static markup tests.

---

### Task 1: Lock the new modal behavior with tests

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx`

**Step 1: Write the failing test**

Add a test that renders `CheckoutLegalConsentModal` in a plan-change variant and expects:
- a dedicated plan-change title
- a single confirmation checkbox label
- no repeated "okudum ve kabul ediyorum" legal acceptance copy
- no duplicated provider notice inside the summary box

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx"`

Expected: FAIL because the modal does not yet support a simplified plan-change variant.

### Task 2: Implement the lighter plan-change modal

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Write minimal implementation**

Add a `consentVariant` prop with a default full-legal path. For `plan_change`:
- allow a custom title
- hide the repeated provider notice block
- replace the two-checkbox flow with a single confirmation checkbox
- keep document links as low-emphasis footer references instead of required acceptance text

Wire `SubscriptionPlanManager` to use the plan-change variant with plan-specific title and description.

**Step 2: Run the targeted test**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx"`

Expected: PASS

### Task 3: Verify adjacent plan-management behavior and docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run affected UI tests**

Run:
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.test.tsx"`
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx"`
- `npm run i18n:check`

**Step 2: Update docs**

Document the lighter consent model and simpler provider-calculated charge messaging in roadmap, PRD, and release notes.

**Step 3: Run build verification**

Run: `npm run build`

Expected: PASS
