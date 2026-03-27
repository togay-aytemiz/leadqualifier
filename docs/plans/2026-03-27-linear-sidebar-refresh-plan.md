# Linear Sidebar Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh the desktop main sidebar so it feels closer to Linear with collapsible category groups, more breathing room between groups, and smaller desktop navigation typography.

**Architecture:** Keep the existing `MainSidebar` structure and routing behavior, but extract the section expansion state into a small pure helper that can be test-driven in isolation. Persist section expansion in `localStorage`, apply the new UI only to the expanded desktop sidebar, and keep the collapsed rail behavior stable.

**Tech Stack:** Next.js App Router, React 19, next-intl, Tailwind CSS, Vitest

---

### Task 1: Add section-state helper tests

**Files:**
- Create: `src/design/main-sidebar-sections.test.ts`
- Create: `src/design/main-sidebar-sections.ts`

**Step 1: Write the failing test**

- Cover default expansion for all known sections.
- Cover stored collapsed state hydration for known sections only.
- Cover syncing state when the available section list changes.
- Cover toggle behavior for a single section.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/main-sidebar-sections.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

- Add a pure helper that hydrates, syncs, and toggles sidebar section expansion state.
- Export the storage key needed by `MainSidebar`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/design/main-sidebar-sections.test.ts`

Expected: PASS

### Task 2: Apply the Linear-style sidebar adjustments

**Files:**
- Modify: `src/design/MainSidebar.tsx`

**Step 1: Wire section state into the sidebar**

- Load persisted section state from `localStorage`.
- Keep desktop expanded sidebar sections collapsible with chevron toggles.
- Preserve current collapsed-rail behavior.

**Step 2: Refresh the nav presentation**

- Increase spacing between section groups.
- Reduce desktop nav label sizing and tighten row height slightly.
- Soften the active state to a lighter, more minimal pill treatment.

**Step 3: Keep existing indicators and locks intact**

- Unread/pending dots must still render correctly.
- Billing-locked items must still stay non-interactive.

### Task 3: Update copy and project docs

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add any new TR/EN sidebar labels**

- Add section toggle labels if needed.
- Keep translation keys mirrored.

**Step 2: Record the UX change**

- Add a roadmap update note and mark the relevant item complete.
- Add a PRD update note / tech decision for the sidebar behavior.
- Add a release note entry under `[Unreleased]`.

### Task 4: Verify

**Files:**
- None

**Step 1: Run focused tests**

Run: `npm test -- --run src/design/main-sidebar-sections.test.ts`

Expected: PASS

**Step 2: Run the production build**

Run: `npm run build`

Expected: PASS
