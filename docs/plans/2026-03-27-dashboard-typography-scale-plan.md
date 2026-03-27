# Dashboard Typography Scale Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the desktop dashboard content typography slightly smaller across core operator surfaces while nudging the desktop sidebar one step larger than its current size.

**Architecture:** Define centralized desktop typography variable maps that override Tailwind text tokens through CSS custom properties. Apply the smaller scale to the dashboard content shell, and a separate slightly larger scale to `MainSidebar`, so the change stays consistent and easy to tune without editing every surface by hand.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, Vitest

---

### Task 1: Add typography-scale helper tests

**Files:**
- Create: `src/design/dashboard-typography.test.ts`
- Create: `src/design/dashboard-typography.ts`

**Step 1: Write the failing test**

- Assert the content scale returns a slightly smaller desktop token set.
- Assert the sidebar scale returns a slightly larger token set than default.
- Assert both token maps include the expected Tailwind text variables.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/dashboard-typography.test.ts`

Expected: FAIL because helper module does not exist yet.

**Step 3: Write minimal implementation**

- Export a typed helper that returns CSS variable maps for `content` and `sidebar`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/dashboard-typography.test.ts`

Expected: PASS

### Task 2: Apply the scales to the dashboard shell

**Files:**
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/design/MainSidebar.tsx`

**Step 1: Apply the content scale**

- Add the desktop-only smaller token map to the dashboard content wrapper so Inbox, Details, Calendar, Leads, Skills, Knowledge, Settings, and Admin content all inherit it.

**Step 2: Apply the sidebar scale**

- Add the desktop-only slightly larger token map to `MainSidebar`.
- Keep the existing Linear-style section behavior intact.

**Step 3: Tune explicit sidebar sizes**

- Adjust any sidebar-only hardcoded text sizes that bypass the shared tokens so the one-step increase is visible but restrained.

### Task 3: Update docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Record the desktop typography decision**

- Note the dashboard-wide desktop scale reduction and sidebar-specific compensation.

### Task 4: Verify

**Files:**
- None

**Step 1: Run focused tests**

Run: `npm test -- --run src/design/dashboard-typography.test.ts src/design/main-sidebar-sections.test.ts`

Expected: PASS

**Step 2: Lint touched files**

Run: `npx eslint src/app/[locale]/(dashboard)/layout.tsx src/design/MainSidebar.tsx src/design/dashboard-typography.ts src/design/dashboard-typography.test.ts`

Expected: PASS

**Step 3: Run production build**

Run: `npm run build`

Expected: PASS unless blocked by unrelated existing repo errors.
