# Iyzico Checkout Legal Consent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a pre-Iyzico legal consent gate for subscription and top-up checkout flows, using public legal documents hosted in `Qualy-lp`.

**Architecture:** Keep Iyizco payment UI untouched and insert merchant-controlled consent UI before provider checkout starts. Centralize external legal-document URL generation so register and checkout surfaces use the same locale-aware links.

**Tech Stack:** Next.js App Router, `next-intl`, React client components, Vitest, external legal pages hosted on `https://askqualy.com`.

---

### Task 1: Centralize external legal links

**Files:**
- Create: `src/lib/legal/external-links.ts`
- Test: `src/lib/legal/external-links.test.ts`
- Modify: `src/components/auth/registerConsentLinks.ts`
- Modify: `src/components/auth/registerConsentLinks.test.ts`

### Task 2: Add checkout legal config and modal UI

**Files:**
- Create: `src/lib/billing/checkout-legal.ts`
- Test: `src/lib/billing/checkout-legal.test.ts`
- Create: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx`

### Task 3: Add localized copy and align register disclosure

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Modify: `src/components/auth/RegisterForm.tsx`

### Task 4: Verify landing legal docs coverage

**Files:**
- Inspect: `/Users/togay/Desktop/Qualy-lp/legal/*.md`
- Modify only if gaps are found, then run `npm run legal:generate` and `npm run build` in `/Users/togay/Desktop/Qualy-lp`

### Task 5: Verification and docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Run:**
- `npm test -- --run src/lib/legal/external-links.test.ts src/components/auth/registerConsentLinks.test.ts src/lib/billing/checkout-legal.test.ts`
- `npm run i18n:check`
- `npm run build`
