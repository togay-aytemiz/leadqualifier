# Template Picker Loading UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the false empty-state flash in the Inbox template picker by showing an explicit loading placeholder until the initial template fetch completes.

**Architecture:** Add a tiny pane-state helper in `template-picker-state.ts` that separates `loading`, `empty`, and `ready`, then drive `TemplatePickerModal` from that helper. Keep the modal opening immediately so interaction stays responsive, but render skeleton/placeholder UI before the first fetch resolves.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Tailwind CSS 4, Vitest

---

### Task 1: Define pane-state behavior

**Files:**
- Modify: `src/components/inbox/template-picker-state.test.ts`

**Step 1: Write the failing test**

Assert that a tab with zero items stays in `loading` until the initial fetch has completed, and only then can transition to `empty`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/template-picker-state.test.ts`

Expected: FAIL because the pane-state helper does not exist yet.

### Task 2: Implement the helper and modal UI

**Files:**
- Modify: `src/components/inbox/template-picker-state.ts`
- Modify: `src/components/inbox/TemplatePickerModal.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write minimal implementation**

Track first-load completion per tab, derive pane state with the helper, and render a compact skeleton/loading message instead of the empty banner while data is still in flight.

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/components/inbox/template-picker-state.test.ts`

Expected: PASS

### Task 3: Record and verify

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the UX rule**

Note that the template picker must show loading feedback before first-load empty states.

**Step 2: Run verification**

Run:
- `npm test -- --run src/components/inbox/template-picker-state.test.ts`
- `npm run build`

Expected: All pass.
