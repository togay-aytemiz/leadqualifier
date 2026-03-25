# Dashboard Navigation and Auth Latency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make dashboard navigation feel immediate on click, reduce post-auth entry latency, and surface loading states earlier while the App Router resolves server payloads.

**Architecture:** Reuse the existing dashboard route-transition event flow, but add an optimistic path layer so desktop/mobile/settings navigation can mark the destination active before `pathname` commits. Reduce duplicated post-auth server work by deriving the first landing route from lightweight auth/profile signals instead of resolving the full organization context, and stop the dashboard layout from performing a second admin-only organization-context fetch that the sidebar can already lazy-hydrate on demand. Add a root dashboard loading boundary so auth-to-app transitions show shell feedback immediately.

**Tech Stack:** Next.js App Router, React 19 client/server components, TypeScript, Vitest, next-intl, Supabase SSR.

---

### Task 1: Lock optimistic navigation feedback with failing tests

**Files:**
- Modify: `src/design/dashboard-route-transition.test.ts`
- Modify: `src/design/navigation-performance.test.ts`

**Step 1: Write the failing test**

Add expectations for an optimistic dashboard path helper and source-guard checks proving `MainSidebar`, `MobileBottomNav`, and `SettingsResponsiveShell` use that optimistic path for active-state rendering.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/dashboard-route-transition.test.ts src/design/navigation-performance.test.ts`
Expected: FAIL because no optimistic active-path helper exists and the nav surfaces still derive active state from the committed pathname only.

**Step 3: Write minimal implementation**

Create the optimistic path helper/hook and switch the nav surfaces to consume it while keeping data-refresh effects tied to the real committed pathname.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/dashboard-route-transition.test.ts src/design/navigation-performance.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/design/dashboard-route-transition.test.ts src/design/navigation-performance.test.ts src/design/dashboard-route-transition.ts src/design/MainSidebar.tsx src/design/MobileBottomNav.tsx src/components/settings/SettingsResponsiveShell.tsx
git commit -m "fix(phase-9): make dashboard nav active state optimistic"
```

### Task 2: Reduce post-auth and dashboard shell duplicated server work

**Files:**
- Create: `src/lib/auth/post-auth-route.ts`
- Create: `src/lib/auth/post-auth-route.test.ts`
- Modify: `src/lib/auth/actions.ts`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`

**Step 1: Write the failing test**

Add unit tests for lightweight post-auth route resolution and a dashboard-layout source guard that fails if the layout still performs a second admin-only `resolveActiveOrganizationContext(...includeAccessibleOrganizations: true)` call.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/auth/post-auth-route.test.ts src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`
Expected: FAIL because the helper file does not exist and the dashboard layout still performs redundant context resolution.

**Step 3: Write minimal implementation**

Use the signed-in user id plus profile `is_system_admin` and active-org cookie presence to determine the first landing route, and let the dashboard sidebar lazy-load the full admin org list only when needed instead of fetching it eagerly on every page render.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/auth/post-auth-route.test.ts src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/auth/post-auth-route.ts src/lib/auth/post-auth-route.test.ts src/lib/auth/actions.ts src/app/[locale]/(dashboard)/layout.tsx src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts
git commit -m "fix(phase-9): trim post-auth dashboard bootstrap work"
```

### Task 3: Add an earlier dashboard loading boundary for auth-to-app entry

**Files:**
- Create: `src/app/[locale]/(dashboard)/loading.tsx`
- Modify: `src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`

**Step 1: Write the failing test**

Extend the dashboard shell source guard to require a root `(dashboard)` `loading.tsx` file that renders the shared dashboard skeleton.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`
Expected: FAIL because the group-level loading boundary does not exist.

**Step 3: Write minimal implementation**

Create a root dashboard loading boundary that renders the shared skeleton immediately during route entry, including post-auth navigation into the app shell.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/loading.tsx src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts
git commit -m "fix(phase-9): add root dashboard loading boundary"
```

### Task 4: Verify and document the performance work

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run:
```bash
npm test -- --run src/design/dashboard-route-transition.test.ts src/design/navigation-performance.test.ts src/lib/auth/post-auth-route.test.ts src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts
npm run build
```

Expected: all commands pass.

**Step 2: Update docs**

Document the optimistic nav activation, lighter post-auth/bootstrap path, and root dashboard loading boundary.

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record dashboard and auth latency hardening"
```
