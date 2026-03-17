# Calendar Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/calendar` view/date transitions feel instant by removing full route navigations from normal calendar interactions.

**Architecture:** Keep the first page render server-driven, but move active calendar view and anchor date into client state. Seed the client with a buffered booking window, sync the URL with the History API instead of `router.push`, and fetch extra booking windows through a lightweight server action only when the local cache boundary is crossed.

**Tech Stack:** Next.js App Router, React 19 client state/hooks, Next server actions, Vitest, Supabase.

---

### Task 1: Pin The Performance Regression

**Files:**
- Modify: `src/app/[locale]/(dashboard)/calendar/page.test.ts`
- Create: `src/lib/calendar/presentation.test.ts` (extend)

**Step 1: Write the failing tests**

- Add a source-level test that fails while `/calendar` still depends on `router.push` for view/date changes.
- Add a unit test for the new buffered calendar data window helper so the server page can seed enough data for fast client navigation.

**Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/calendar/page.test.ts' 'src/lib/calendar/presentation.test.ts'`

Expected: FAIL because the current client still uses route pushes and no buffered helper exists yet.

### Task 2: Move Calendar Navigation Client-Side

**Files:**
- Modify: `src/components/calendar/CalendarClient.tsx`
- Modify: `src/lib/calendar/presentation.ts`
- Modify: `src/lib/calendar/types.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.tsx`

**Step 1: Add minimal range/window helpers**

- Add a buffered calendar data window helper in `presentation.ts`.
- Extend the calendar page payload shape only as needed to describe the seeded client window.

**Step 2: Replace route-driven navigation with local state**

- Initialize active view and anchor date from props.
- Sync the URL with the browser History API.
- Handle `popstate` so back/forward keeps the calendar state aligned.

**Step 3: Render from cached bookings**

- Seed the client with the server-provided booking window.
- Keep summary cards and visible views derived from cached data.
- Restrict agenda/week/day/month rendering to the current visible range instead of every cached booking.

### Task 3: Fetch Additional Data Only At Cache Boundaries

**Files:**
- Modify: `src/lib/calendar/actions.ts`
- Modify: `src/lib/calendar/bookings.ts` (only if a lighter lookup helper is needed)
- Modify: `src/components/calendar/CalendarClient.tsx`

**Step 1: Write the failing test**

- Add a source-level or unit-level test that pins the existence of a lightweight booking-window fetch path for client navigation.

**Step 2: Implement the minimal fetch path**

- Add a server action that returns bookings for a requested range using the existing organization context.
- In `CalendarClient`, fetch and merge bookings only when the user navigates outside the buffered window.

**Step 3: Verify targeted tests pass**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/calendar/page.test.ts' 'src/lib/calendar/presentation.test.ts'`

Expected: PASS

### Task 4: Verify And Document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/calendar/page.test.ts' 'src/lib/calendar/presentation.test.ts'`

Run: `npm run build`

**Step 2: Update docs**

- Record the `/calendar` interaction performance fix in roadmap, PRD, and release notes.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-17-calendar-performance-implementation-plan.md \
  src/app/[locale]/(dashboard)/calendar/page.tsx \
  src/app/[locale]/(dashboard)/calendar/page.test.ts \
  src/components/calendar/CalendarClient.tsx \
  src/lib/calendar/actions.ts \
  src/lib/calendar/presentation.ts \
  src/lib/calendar/presentation.test.ts \
  src/lib/calendar/types.ts \
  docs/ROADMAP.md \
  docs/PRD.md \
  docs/RELEASE.md
git commit -m "fix(phase-9.5): remove route-lag from calendar navigation"
```
