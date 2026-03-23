# Dashboard-Wide Route Transition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all primary dashboard route transitions feel immediate by warming routes on user intent and showing a matching skeleton overlay before server payloads finish.

**Architecture:** Extend the existing dashboard transition helper from route-specific hot paths (`/inbox`, `/leads`) to all major dashboard route families (`/calendar`, `/skills`, `/knowledge`, `/settings`, `/admin`, etc.). Reuse existing route `loading.tsx` surfaces where possible, add missing ones, and wire desktop/mobile/settings navigation to trigger both `prefetch` and an immediate transition overlay on hover/focus/touch/click.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest, next-intl.

---

### Task 1: Lock the expanded route contract with tests

**Files:**
- Modify: `src/design/dashboard-route-transition.test.ts`
- Test: `src/design/navigation-performance.test.ts`

**Step 1: Write the failing test**

Add expectations that `/calendar`, `/skills`, `/knowledge`, `/settings`, and `/admin` resolve to a skeleton/primeable route family.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/dashboard-route-transition.test.ts`
Expected: FAIL because only inbox/leads are currently treated as hot/skeleton routes.

**Step 3: Write minimal implementation**

Update route-family helper/mapping to normalize broader dashboard paths and resolve skeleton families.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/dashboard-route-transition.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/design/dashboard-route-transition.test.ts src/design/dashboard-route-transition.ts
git commit -m "test(phase-9): expand dashboard route transition coverage"
```

### Task 2: Add/reuse skeleton views for every major route family

**Files:**
- Modify: `src/components/common/DashboardRouteSkeleton.tsx`
- Create: `src/app/[locale]/(dashboard)/calendar/loading.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/loading.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/loading.tsx`
- Modify: `src/app/[locale]/(dashboard)/skills/loading.tsx`
- Modify: `src/app/[locale]/(dashboard)/simulator/loading.tsx`

**Step 1: Write the failing test**

Extend `src/design/dashboard-route-transition.test.ts` to expect skeleton keys for route families like `calendar`, `settings`, `knowledge`, `admin`, and `generic`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/dashboard-route-transition.test.ts`
Expected: FAIL because those route keys/components do not exist yet.

**Step 3: Write minimal implementation**

Implement shared skeleton variants and point route `loading.tsx` files to the shared component where it reduces duplication.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/dashboard-route-transition.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/common/DashboardRouteSkeleton.tsx src/app/[locale]/(dashboard)/calendar/loading.tsx src/app/[locale]/(dashboard)/knowledge/loading.tsx src/app/[locale]/(dashboard)/settings/loading.tsx src/app/[locale]/(dashboard)/skills/loading.tsx src/app/[locale]/(dashboard)/simulator/loading.tsx
git commit -m "feat(phase-9): add shared dashboard route skeletons"
```

### Task 3: Wire all main navigation surfaces to intent-based warming

**Files:**
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/MobileBottomNav.tsx`
- Modify: `src/components/settings/SettingsResponsiveShell.tsx`
- Test: `src/design/navigation-performance.test.ts`
- Test: `src/components/settings/SettingsResponsiveShell.test.tsx`

**Step 1: Write the failing test**

Add source-guard expectations for generalized route warming hooks in sidebar/mobile/settings navigation.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/navigation-performance.test.ts src/components/settings/SettingsResponsiveShell.test.tsx`
Expected: FAIL because the settings shell does not currently trigger the transition helper and current tests only cover inbox/leads paths.

**Step 3: Write minimal implementation**

Attach `onMouseEnter`, `onFocus`, `onTouchStart`, and click transition dispatch to all non-locked route links.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/navigation-performance.test.ts src/components/settings/SettingsResponsiveShell.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/design/MainSidebar.tsx src/design/MobileBottomNav.tsx src/components/settings/SettingsResponsiveShell.tsx src/design/navigation-performance.test.ts src/components/settings/SettingsResponsiveShell.test.tsx
git commit -m "fix(phase-9): warm dashboard routes on navigation intent"
```

### Task 4: Verify end-to-end and update docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run:
```bash
npm test -- --run src/design/dashboard-route-transition.test.ts
npm test -- --run src/design/navigation-performance.test.ts
npm test -- --run src/components/settings/SettingsResponsiveShell.test.tsx
npm run build
```

Expected: all commands pass.

**Step 2: Update docs**

Document that dashboard-wide route transitions now use intent-based warming and immediate skeleton bridging.

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record dashboard-wide route transition improvements"
```
