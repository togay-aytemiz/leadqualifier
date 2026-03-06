# Plans Button Hover Tuning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove motion-based hover from Plans checkout buttons and replace it with clearer color-only hover states.

**Architecture:** Keep the change local to the Plans UI components that use the dark primary CTA style. Do not introduce a new design system abstraction for this small pass; update the existing class strings consistently and verify the app still builds.

**Tech Stack:** Next.js, React, Tailwind CSS.

---

### Task 1: Update Plans CTA hover styles

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx`

**Step 1: Implement minimal visual change**
- Remove translate/shadow hover behavior from the checkout-legal continue button.
- Use a more obvious color-only hover state for all dark primary CTA buttons in Plans flow.
- Keep disabled state behavior intact.

**Step 2: Verify**
Run: `npm run build`
Expected: PASS.

### Task 2: Document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Record the UX refinement**
- Add a short note that Plans checkout buttons now use clearer color-only hover states.
