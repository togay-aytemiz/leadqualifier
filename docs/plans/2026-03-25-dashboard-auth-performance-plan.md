# Dashboard And Auth Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make dashboard navigation feel immediate by applying optimistic active-state routing and reduce auth-entry latency by replacing redirect-heavy post-login flow with a lighter client transition.

**Architecture:** Introduce a shared dashboard route transition state helper so sidebar, settings navigation, and mobile navigation can reflect the intended destination before the App Router commits. Split post-auth redirect resolution into a lightweight helper that only reads the minimum data needed, then let auth forms drive the final client navigation while rendering an app-entry skeleton immediately after success.

**Tech Stack:** Next.js App Router, React 19, next-intl, Supabase Auth, Vitest

---

### Task 1: Capture the expected optimistic navigation behavior

**Files:**
- Create: `src/design/dashboard-route-state.test.ts`
- Modify: `src/design/dashboard-route-transition.test.ts`
- Test: `src/design/dashboard-route-state.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- a pending dashboard target overrides the committed pathname for active-state purposes
- non-dashboard targets do not replace the committed pathname
- the optimistic path clears once the committed pathname catches up

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/dashboard-route-state.test.ts src/design/dashboard-route-transition.test.ts`
Expected: FAIL because the new shared route-state helper does not exist yet.

**Step 3: Write minimal implementation**

Create a small shared helper module for normalizing dashboard paths and resolving the effective route path from committed and pending values.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/dashboard-route-state.test.ts src/design/dashboard-route-transition.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/design/dashboard-route-state.test.ts src/design/dashboard-route-transition.test.ts src/design/dashboard-route-state.ts
git commit -m "test(phase-9): cover optimistic dashboard route state"
```

### Task 2: Move dashboard navigation surfaces to optimistic active state

**Files:**
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/MobileBottomNav.tsx`
- Modify: `src/components/settings/SettingsResponsiveShell.tsx`
- Modify: `src/design/navigation-performance.test.ts`
- Modify: `src/components/settings/SettingsResponsiveShell.test.tsx`

**Step 1: Write the failing test**

Add source or helper-based tests that assert:
- main sidebar reads the shared optimistic route state
- settings shell no longer derives active state from committed pathname only
- mobile nav uses the same optimistic route-state path

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/navigation-performance.test.ts src/components/settings/SettingsResponsiveShell.test.tsx`
Expected: FAIL because the components still read only the committed pathname.

**Step 3: Write minimal implementation**

Update the three navigation surfaces to use the shared pending-route helper so the clicked destination becomes active immediately and remains active until the actual route commit arrives.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/navigation-performance.test.ts src/components/settings/SettingsResponsiveShell.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/design/MainSidebar.tsx src/design/MobileBottomNav.tsx src/components/settings/SettingsResponsiveShell.tsx src/design/navigation-performance.test.ts src/components/settings/SettingsResponsiveShell.test.tsx
git commit -m "fix(phase-9): make dashboard nav state optimistic"
```

### Task 3: Reduce post-auth latency and show immediate app-entry feedback

**Files:**
- Create: `src/lib/auth/post-auth-redirect.ts`
- Create: `src/lib/auth/post-auth-redirect.test.ts`
- Modify: `src/lib/auth/actions.ts`
- Modify: `src/lib/auth/actions.test.ts`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/components/auth/RegisterForm.tsx`
- Modify: `src/design/manual-prefetch.ts`

**Step 1: Write the failing test**

Add tests that prove:
- post-auth redirect resolution only needs admin flag plus explicit active-org cookie validity
- login/register actions return a redirect path instead of forcing a server redirect when a session is already available
- auth forms can react to a returned redirect path

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/auth/post-auth-redirect.test.ts src/lib/auth/actions.test.ts`
Expected: FAIL because the helper and new action contract do not exist yet.

**Step 3: Write minimal implementation**

Implement a lightweight redirect helper, update auth actions to return `{redirectPath}` for authenticated flows, and let the client forms show an immediate “entering app” state before calling `router.replace`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/auth/post-auth-redirect.test.ts src/lib/auth/actions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/auth/post-auth-redirect.ts src/lib/auth/post-auth-redirect.test.ts src/lib/auth/actions.ts src/lib/auth/actions.test.ts src/components/auth/LoginForm.tsx src/components/auth/RegisterForm.tsx src/design/manual-prefetch.ts
git commit -m "fix(phase-9): speed up post-auth workspace entry"
```

### Task 4: Verify end-to-end and update product docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted tests**

Run: `npm test -- --run src/design/dashboard-route-state.test.ts src/design/dashboard-route-transition.test.ts src/design/navigation-performance.test.ts src/components/settings/SettingsResponsiveShell.test.tsx src/lib/auth/post-auth-redirect.test.ts src/lib/auth/actions.test.ts`
Expected: PASS

**Step 2: Run broader regression check**

Run: `npm run build`
Expected: PASS

**Step 3: Update docs**

Record the new optimistic dashboard nav behavior and faster post-auth entry path in roadmap, PRD, and release notes with `2026-03-25` timestamps.

**Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record dashboard and auth performance fixes"
```
