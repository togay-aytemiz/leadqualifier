# Remove Renewal Resume CTA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the self-serve "undo cancellation" UI path from `Settings > Plans` so canceled-at-period-end subscriptions only show scheduled-cancellation state and users can resubscribe later if needed.

**Architecture:** Keep backend renewal helpers intact for now, but remove the exposed resume affordance from the Plans management component. Lock the behavior with a focused component test so provider-agnostic UI does not accidentally reintroduce the CTA.

**Tech Stack:** Next.js App Router, React, next-intl, Vitest, Testing Library

---

### Task 1: Lock the UI behavior with a failing test

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`

**Step 1: Write the failing test**
- Render `SubscriptionPlanManager` with `autoRenewEnabled=false`.
- Assert the scheduled-cancel notice is visible.
- Assert no `resume` button or fallback hint is rendered.

**Step 2: Run test to verify it fails**
- Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.test.tsx`

**Step 3: Write minimal implementation**
- Remove `resumeAction` / `canResumeRenewal` UI branch.
- Keep only the scheduled-cancel notice and cancel-confirmation flow.

**Step 4: Run test to verify it passes**
- Re-run the same targeted test.

### Task 2: Clean up page wiring and localized copy

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Remove unused resume wiring**
- Stop passing `resumeAction` / `canResumeRenewal` to the component.

**Step 2: Trim obsolete copy**
- Remove unused `resumeCta` / `resumeUnavailableHint` keys if no longer referenced.
- Keep cancel modal copy focused on confirmation.

**Step 3: Run verification**
- Run targeted component test.
- Run `npm run i18n:check`.
- Run `npm run build`.
