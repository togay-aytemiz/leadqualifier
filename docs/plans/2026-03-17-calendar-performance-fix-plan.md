# Calendar Interaction Performance Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/calendar` view/date navigation feel immediate by removing full App Router navigations from calendar interactions.

**Architecture:** Keep the initial page load on the server, but move view/date switching into client-local state. Load a wider calendar data window that covers the active month grid, cache loaded windows in the client, and fetch additional windows through the existing server action only when navigation moves outside the current window.

**Tech Stack:** Next.js App Router, React client state, Next server actions, Vitest

---

### Task 1: Add failing coverage for the new navigation model

**Files:**

- Modify: `src/lib/calendar/presentation.test.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.test.ts`

**Step 1: Write the failing test**

- Add a presentation test that expects a month-grid-sized calendar data window for a week anchor date.
- Add a calendar page/client source test that expects the client to stop using `router.push` for view/date switching and the page to stop fetching the narrow view range on first load.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/calendar/presentation.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts'
```

Expected:

- FAIL because the new helper and source expectations do not exist yet.

### Task 2: Implement client-local calendar navigation and cached windows

**Files:**

- Modify: `src/lib/calendar/presentation.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.tsx`
- Modify: `src/components/calendar/CalendarClient.tsx`
- Modify: `src/lib/calendar/actions.ts`

**Step 1: Add the minimal helper layer**

- Add a helper that builds a calendar data window from the month grid around an anchor date.
- Add a helper that checks whether the current loaded range already covers the next required window.

**Step 2: Change the server page to preload the navigation window**

- Keep auth/org/billing checks in the server page.
- Replace the view-scoped initial query with the wider navigation window query so initial client interactions do not need an immediate refetch.

**Step 3: Move interaction state to the client**

- Replace `router.push`-driven date/view updates with local state in `CalendarClient`.
- Sync the URL using `window.history.replaceState` without triggering an App Router navigation.
- Keep `router.refresh()` only for create/update/cancel mutations.

**Step 4: Fetch new windows only when needed**

- Reuse `getCalendarPageData` from the existing server action file.
- Cache previously loaded windows by range key in the client.
- Only fetch when the next anchor date falls outside the currently loaded window.

### Task 3: Verify and document

**Files:**

- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run:

```bash
npm test -- --run src/lib/calendar/presentation.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts'
```

**Step 2: Run broader regression checks**

Run:

```bash
npm test -- --run 'src/app/[locale]/(dashboard)/calendar/page.test.ts' 'src/lib/calendar/presentation.test.ts'
npm run build
```

**Step 3: Update docs**

- Mark the performance fix in roadmap/release notes.
- Record the client-local navigation decision in the PRD tech decisions area if needed.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-17-calendar-performance-fix-plan.md src/lib/calendar/presentation.ts src/lib/calendar/presentation.test.ts src/components/calendar/CalendarClient.tsx src/app/[locale]/(dashboard)/calendar/page.tsx src/app/[locale]/(dashboard)/calendar/page.test.ts docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "fix(phase-9.5): make calendar navigation client-side and instant"
```
