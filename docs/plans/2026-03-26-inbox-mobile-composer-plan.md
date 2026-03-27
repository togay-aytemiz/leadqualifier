# Inbox Mobile Composer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Inbox composer mobile-friendly by collapsing template/send actions to icon-only buttons on small screens while keeping the text input as the dominant width consumer.

**Architecture:** Keep the existing composer structure in `InboxContainer` and tighten only the shared `InboxComposerActionBar` responsive classes so desktop behavior stays intact. Cover the behavior with a focused component test that verifies the mobile-only icon treatment and desktop label restoration.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS 4, Vitest

---

### Task 1: Define the mobile composer expectation

**Files:**
- Modify: `src/components/inbox/inboxComposerActionBar.test.tsx`

**Step 1: Write the failing test**

Assert that the action bar renders fixed-width mobile buttons and hides the visible labels until `sm`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/inboxComposerActionBar.test.tsx`

Expected: FAIL because the current buttons always render visible text and do not use compact mobile sizing.

### Task 2: Implement the responsive action bar

**Files:**
- Modify: `src/components/inbox/InboxComposerActionBar.tsx`

**Step 1: Write minimal implementation**

Update the shared action button classes to use square icon buttons on mobile and restore text labels from `sm` upward.

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/components/inbox/inboxComposerActionBar.test.tsx`

Expected: PASS

### Task 3: Record and verify the change

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the mobile composer improvement**

Add a short update note/entry describing icon-only template/send controls on mobile and the wider input area outcome.

**Step 2: Run verification**

Run:
- `npm test -- --run src/components/inbox/inboxComposerActionBar.test.tsx`
- `npm run build`

Expected: All pass.
