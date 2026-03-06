# Iyzico Runtime And Consent Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the hosted Iyzico checkout runtime crash and make checkout legal consent enforceable on the server, not just the client.

**Architecture:** Keep the hosted-checkout mount/reset helper isolated in `src/lib/billing/providers/iyzico/checkout-embed.ts`, but make runtime cleanup descriptor-aware so non-configurable globals do not crash the app. Move legal-consent field parsing into `src/lib/billing/checkout-legal.ts` so both subscription and top-up server actions in Plans can reject bypassed submissions consistently, while the modal form submits explicit consent fields and keeps stronger visual affordance for the final continue CTA.

**Tech Stack:** Next.js App Router server actions, React client components, Vitest, next-intl.

---

### Task 1: Lock the failing behaviors with tests

**Files:**
- Modify: `src/lib/billing/providers/iyzico/checkout-embed.test.ts`
- Modify: `src/lib/billing/checkout-legal.test.ts`

**Step 1: Write the failing test**
- Add a checkout-embed test that defines `iyziInit` as non-configurable and verifies reset does not throw.
- Add checkout-legal tests that require both `acceptedRequiredDocs` and `acceptedImmediateStart` form fields to equal the expected accepted marker.

**Step 2: Run test to verify it fails**
Run: `npm test -- --run src/lib/billing/providers/iyzico/checkout-embed.test.ts src/lib/billing/checkout-legal.test.ts`
Expected: failure because runtime reset throws or consent parser does not exist yet.

### Task 2: Implement minimal production fix

**Files:**
- Modify: `src/lib/billing/providers/iyzico/checkout-embed.ts`
- Modify: `src/lib/billing/checkout-legal.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`

**Step 1: Write minimal implementation**
- Make runtime reset attempt `delete` only when safe, otherwise fall back to assigning `undefined` without throwing.
- Export shared checkout legal field names and a server-safe consent parser/validator.
- Submit explicit consent fields from the modal form.
- Validate consent in both subscription and top-up server actions before any provider call, redirecting with an error if bypassed.
- Strengthen final CTA hover/focus styling.

**Step 2: Run targeted tests**
Run: `npm test -- --run src/lib/billing/providers/iyzico/checkout-embed.test.ts src/lib/billing/checkout-legal.test.ts`
Expected: PASS.

### Task 3: Verify end-to-end quality and update project docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**
Run: `npm run build`
Expected: PASS.

**Step 2: Document the change**
- Update roadmap/PRD/release notes to mention descriptor-safe checkout reset and server-enforced legal consent.

**Step 3: Commit**
```bash
git add docs/plans/2026-03-06-iyzico-runtime-consent-hardening-plan.md \
  src/lib/billing/providers/iyzico/checkout-embed.ts \
  src/lib/billing/providers/iyzico/checkout-embed.test.ts \
  src/lib/billing/checkout-legal.ts \
  src/lib/billing/checkout-legal.test.ts \
  src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx \
  src/app/[locale]/(dashboard)/settings/plans/page.tsx \
  docs/ROADMAP.md docs/PRD.md docs/RELEASE.md

git commit -m "fix(phase-8.5): harden iyzico checkout runtime reset and legal consent enforcement"
```
