# Inbox Details And Composer Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Inbox Details sections collapsible, keep the leave-conversation action visually fixed, and tighten the composer so actions are aligned and visible.

**Architecture:** Extract small presentational components for collapsible details sections and composer action buttons, then wire them into `InboxContainer` with minimal new state. Keep behavior session-local, avoid persistence, and preserve current server actions.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS, `next-intl`, Vitest

---

### Task 1: Add failing presentation tests

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/inboxDetailsSection.test.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/inboxComposerActionBar.test.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/conversationDetailsEditors.test.tsx`

1. Write a failing test for a collapsible details section that hides body content when collapsed and keeps header actions visible.
2. Write a failing test for a composer action bar that renders `Templates` and `Send` actions with matching height classes.
3. Extend the private-note editor test to keep empty state collapsed behind the add action.

### Task 2: Implement reusable UI pieces

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxDetailsSection.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxComposerActionBar.tsx`

1. Add a small disclosure section component with shared heading, chevron, optional header action, and collapsed body handling.
2. Add a composer action bar component for secondary and primary actions with consistent height and label visibility.

### Task 3: Wire the Inbox details layout

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`

1. Add local disclosure state for `lead`, `important_info`, `tags`, and `private_note`.
2. Move mobile and desktop detail sections onto the shared disclosure component.
3. Make the leave action sit in a dedicated sticky footer region, visually separated from section content.

### Task 4: Tighten composer layout

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`

1. Align textarea shell and action buttons to the same control height.
2. Move the template action out of the inner input rail so its label can stay visible.
3. Keep attachment affordances inside the input shell and preserve current disabled/error behavior.

### Task 5: Update docs and verify

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

1. Document the new disclosure behavior and sticky leave action.
2. Run targeted tests for the inbox UI files.
3. Run `npm run build`.
