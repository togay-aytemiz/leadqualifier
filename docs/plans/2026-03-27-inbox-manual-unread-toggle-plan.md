# Inbox Manual Unread Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a selected-conversation header action that toggles read/unread state, while preserving manually marked unread conversations until the operator explicitly re-reads them or re-enters the thread from another conversation.

**Architecture:** Persist one `manual_unread` flag on `conversations` so the behavior survives refreshes and realtime updates. Keep the UI change small by adding one icon action to the selected-thread header, and update the existing auto-read path to skip threads flagged as manual unread until they are revisited or manually marked read.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Tailwind CSS 4, Vitest

---

### Task 1: Define the unread-toggle contract

**Files:**
- Modify: `src/lib/inbox/actions.test.ts`
- Create: `src/components/inbox/manualUnreadState.test.ts`

**Step 1: Write the failing tests**

Add a server-action test for marking a conversation unread/read and a small pure helper test for revisiting a manual-unread thread from another conversation.

**Step 2: Run tests to verify they fail**

Run:
- `npm test -- --run src/lib/inbox/actions.test.ts`
- `npm test -- --run src/components/inbox/manualUnreadState.test.ts`

Expected: FAIL because the action/helper do not exist yet.

### Task 2: Implement persistence and UI wiring

**Files:**
- Create: `supabase/migrations/00100_conversation_manual_unread.sql`
- Modify: `src/types/database.ts`
- Modify: `src/lib/inbox/actions.ts`
- Create: `src/components/inbox/manualUnreadState.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write minimal implementation**

Persist `manual_unread`, add mark-read/mark-unread actions, update auto-read selection logic, and place the toggle icon button in the selected conversation header.

**Step 2: Run tests to verify they pass**

Run:
- `npm test -- --run src/lib/inbox/actions.test.ts src/components/inbox/manualUnreadState.test.ts`

Expected: PASS

### Task 3: Record and verify

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the new behavior**

Note the header toggle and the rule that manually unread threads stay unread until manual re-read or a later revisit.

**Step 2: Run verification**

Run:
- `npm test -- --run src/lib/inbox/actions.test.ts src/components/inbox/manualUnreadState.test.ts`
- `npm run build`

Expected: All pass.
