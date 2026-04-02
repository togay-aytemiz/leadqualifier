# Settings Auth Redirect Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent a blank white screen on settings routes when the active organization context cannot be resolved after external redirects such as Iyzico checkout callbacks.

**Architecture:** Keep the fix at the shared settings layout boundary so every settings subpage inherits the same fallback. Replace the `null` render path with a login redirect, and cover it with a focused regression test so future refactors do not reintroduce the blank state.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, next/navigation

---

### Task 1: Add a failing regression test for missing settings auth context

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/layout.redirect.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/layout.tsx`

**Step 1: Write the failing test**

Add a test that mocks `resolveActiveOrganizationContext()` to return `null` and expects the settings layout to call `redirect('/login')` instead of returning `null`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/layout.redirect.test.tsx"`

Expected: FAIL because the layout currently returns `null`.

**Step 3: Write minimal implementation**

Import `redirect` from `next/navigation` in the settings layout and redirect to `/login` when `resolveActiveOrganizationContext()` returns `null`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/layout.redirect.test.tsx"`

Expected: PASS

### Task 2: Verify the billing/plans regression path and update docs

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/layout.test.ts`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add or adjust source guard only if needed**

Keep the existing layout source guard compatible with the new redirect flow.

**Step 2: Run focused verification**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/layout.redirect.test.tsx" "src/app/[locale]/(dashboard)/settings/layout.test.ts" "src/app/[locale]/(dashboard)/settings/plans/page.source.test.ts" src/app/api/billing/iyzico/callback/route.test.ts`

Expected: PASS

**Step 3: Run full build verification**

Run: `npm run build`

Expected: PASS

**Step 4: Update project docs**

Record the redirect safeguard and Iyzico failed-checkout white-screen fix in roadmap, PRD tech decisions, and release notes.
