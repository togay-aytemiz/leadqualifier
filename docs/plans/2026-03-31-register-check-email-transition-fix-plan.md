# Register Check-Email Transition Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make successful sign-up without an active session land on the dedicated `register/check-email` checkpoint instead of leaving the user on the register form.

**Architecture:** Keep the existing dedicated checkpoint page and auth success transition UI. Change the register server action to return a client-consumable redirect path for the no-session signup case, then let the existing auth transition component perform the route change consistently.

**Tech Stack:** Next.js App Router, React 19 `useActionState`, next-intl, Supabase Auth, Vitest

---

### Task 1: Lock the expected register success behavior

**Files:**
- Modify: `src/lib/auth/actions.test.ts`
- Test: `src/lib/auth/actions.test.ts`

**Step 1: Write the failing test**

Assert that register resolves with `redirectPath: '/register/check-email?email=...'` when Supabase sign-up succeeds but no session is returned.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/auth/actions.test.ts`

Expected: FAIL because the current implementation throws `NEXT_REDIRECT` instead of returning redirect state.

### Task 2: Return redirect state instead of throwing redirect

**Files:**
- Modify: `src/lib/auth/actions.ts`
- Modify: `src/components/auth/RegisterForm.tsx` (only if needed)

**Step 1: Write minimal implementation**

Return a `redirectPath` for the no-session signup branch, matching the existing `AuthSuccessTransition` pattern already used by the login flow.

**Step 2: Run the targeted auth test**

Run: `npm test -- --run src/lib/auth/actions.test.ts`

Expected: PASS.

### Task 3: Update product docs and release notes

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Record the fix**

Add a short update note / unreleased fix describing that successful signup now transitions to the check-email checkpoint through client redirect state.

### Task 4: Verify the full change

**Files:**
- Verify only

**Step 1: Run focused tests**

Run: `npm test -- --run src/lib/auth/actions.test.ts`

**Step 2: Run build verification**

Run: `npm run build`

Expected: PASS.
