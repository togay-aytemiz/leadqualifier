# Admin Billing Credit Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin manual premium/top-up billing state read consistently with tenant billing screens and show pending feedback on admin billing action buttons.

**Architecture:** Keep `organization_billing_accounts` as the source of truth for remaining package/top-up credits. Reassert the manual-admin premium RPC so a catalog package activation always grants monthly package credits, then adjust the admin detail UI to present remaining credits as the primary number, matching tenant-facing screens.

**Tech Stack:** Next.js App Router server actions, Supabase SQL migrations/RPCs, next-intl, Vitest source/behavior guards.

---

### Task 1: Guard Manual Premium Credit Writes

**Files:**
- Create: `supabase/migrations/00119_reassert_manual_admin_premium_assignment.sql`
- Create: `supabase/migrations/00119_reassert_manual_admin_premium_assignment.test.ts`
- Modify: `src/lib/admin/billing-manual.ts`
- Modify: `src/lib/admin/billing-manual.test.ts`

- [x] **Step 1: Write failing tests**

Add assertions that manual premium assignment rejects zero monthly credits and that the SQL RPC sets `monthly_package_credit_limit`, resets `monthly_package_credit_used`, writes a `package_grant`, and stores manual renewal metadata.

- [x] **Step 2: Verify red**

Run: `npm test -- --run src/lib/admin/billing-manual.test.ts supabase/migrations/00119_reassert_manual_admin_premium_assignment.test.ts`

Expected: fail because the new migration does not exist and the action still accepts zero credits.

- [x] **Step 3: Implement minimal fix**

Add the reasserting migration and tighten TypeScript validation to require `monthlyCredits > 0`.

- [x] **Step 4: Verify green**

Run the same targeted test command and confirm it passes.

### Task 2: Make Admin Credit Cards Match Tenant Meaning

**Files:**
- Modify: `src/app/[locale]/(dashboard)/admin/organizations/[id]/page.tsx`
- Create: `src/app/[locale]/(dashboard)/admin/organizations/[id]/page.source.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

- [x] **Step 1: Write failing source guard**

Assert the admin organization detail page renders package/trial remaining credits as the primary value and uses a localized used/limit helper for the secondary row.

- [x] **Step 2: Verify red**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/admin/organizations/[id]/page.source.test.ts'`

Expected: fail while the page still renders `used / limit` as the main package/trial number.

- [x] **Step 3: Implement minimal UI change**

Swap package/trial card primary values to remaining credits and add EN/TR admin copy for the secondary `used / limit` row.

- [x] **Step 4: Verify green**

Run the same targeted source test.

### Task 3: Add Pending State To Admin Billing Actions

**Files:**
- Create: `src/app/[locale]/(dashboard)/admin/organizations/[id]/AdminBillingSubmitButton.tsx`
- Create: `src/app/[locale]/(dashboard)/admin/organizations/[id]/AdminBillingSubmitButton.source.test.ts`
- Modify: `src/app/[locale]/(dashboard)/admin/organizations/[id]/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

- [x] **Step 1: Write failing source guard**

Assert the admin billing submit button uses `useFormStatus`, disables while pending, shows a spinner, and reads a localized submitting label.

- [x] **Step 2: Verify red**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/admin/organizations/[id]/AdminBillingSubmitButton.source.test.ts'`

Expected: fail because the component does not exist.

- [x] **Step 3: Implement minimal component and replace buttons**

Create a client submit button and replace all manual billing action submit buttons with it.

- [x] **Step 4: Verify green**

Run targeted admin page/button tests.

### Task 4: Docs And Full Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Update project docs**

Add 2026-05-15 notes for admin billing credit clarity, manual premium grant hardening, and loading feedback.

- [x] **Step 2: Verify required commands**

Run:

```bash
npm test -- --run src/lib/admin/billing-manual.test.ts 'src/app/[locale]/(dashboard)/admin/organizations/[id]/page.source.test.ts' 'src/app/[locale]/(dashboard)/admin/organizations/[id]/AdminBillingSubmitButton.source.test.ts' supabase/migrations/00119_reassert_manual_admin_premium_assignment.test.ts src/i18n/messages.test.ts
npm run build
```

Expected: all pass.
