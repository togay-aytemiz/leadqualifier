# Leads Inbox Deeplink Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make clicking a lead in `/leads` open the matching conversation in `/inbox`.

**Architecture:** Keep the existing `/leads -> /inbox?conversation=...` navigation and complete the missing Inbox-side bootstrap. The inbox route should read the requested conversation id, ensure that conversation is present in the initial conversation list even when it is outside the first page, and seed the client container with the requested selected id so existing thread-loading logic can hydrate the conversation.

**Tech Stack:** Next.js App Router, React, Supabase, Vitest.

---

### Task 1: Add the failing source guard

**Files:**
- Modify: `src/components/inbox/InboxContainer.threadBootstrap.test.ts`

**Step 1: Write the failing test**

Add a guard that requires the inbox route to:
- read `searchParams`
- resolve a requested conversation list item from the query
- pass an `initialSelectedConversationId` prop into `InboxContainer`

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/InboxContainer.threadBootstrap.test.ts`
Expected: FAIL because the inbox page currently ignores the `conversation` query parameter.

### Task 2: Implement inbox deeplink bootstrap

**Files:**
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/app/[locale]/(dashboard)/inbox/page.tsx`
- Modify: `src/components/inbox/InboxContainer.tsx`

**Step 1: Write minimal implementation**

- Add a server helper to fetch one normalized `ConversationListItem` by conversation id and organization id.
- Update the inbox page to read `searchParams.conversation`, fetch that target item when needed, prepend it to the initial list if it is not already present, and pass the requested id into the container.
- Update `InboxContainer` so initial selection prefers the requested conversation id over the first item.

**Step 2: Run the focused test**

Run: `npm test -- --run src/components/inbox/InboxContainer.threadBootstrap.test.ts`
Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run:
- `npm test -- --run src/components/inbox/InboxContainer.threadBootstrap.test.ts`
- `npm run build`

Expected: PASS

**Step 2: Update docs**

- Record the new leads-to-inbox deeplink behavior in roadmap, PRD, and release notes.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-27-leads-inbox-deeplink-plan.md src/components/inbox/InboxContainer.threadBootstrap.test.ts src/lib/inbox/actions.ts src/app/[locale]/(dashboard)/inbox/page.tsx src/components/inbox/InboxContainer.tsx docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "feat(phase-9): open inbox conversations from leads"
```
