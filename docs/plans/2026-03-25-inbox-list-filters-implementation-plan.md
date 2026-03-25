# Inbox List Filters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a filter icon to the right side of the Inbox title row that opens filter choices for `Unread/All` and lead temperature (`All/Hot/Warm/Cold`), while keeping the list live as realtime updates change a conversation into or out of the active filter scope.

**Architecture:** Keep filtering client-side inside `InboxContainer` so the feature reuses the existing `conversations` state and realtime subscriptions without adding new server queries. Extract the filter computation into a small pure helper and render the trigger + menu through a compact presentational component, reusing the existing dropdown primitives where possible so the UI stays consistent and mobile-safe instead of adding a second permanent filter row.

**Tech Stack:** Next.js App Router, React 19 client components, Tailwind CSS, `next-intl`, Vitest

---

### Task 1: Add failing filter-behavior tests

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/conversationListFilters.test.ts`

1. Write a failing unit test that returns all conversations when no list filter is active.
2. Write a failing unit test that keeps only `unread_count > 0` conversations when the unread filter is active.
3. Write a failing unit test that keeps only conversations whose first lead status is `hot`, `warm`, or `cold`.
4. Write a failing unit test that intersects unread and lead-status filters together.
5. Write a failing unit test that simulates a conversation array update where a conversation becomes unread or gains a matching lead status, and confirm the helper includes it without any refetch step.

### Task 2: Implement pure Inbox list filter helpers

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/conversationListFilters.ts`

1. Add small filter state types for unread scope (`all` / `unread`) and lead temperature (`all` / `hot` / `warm` / `cold`).
2. Implement a pure helper that applies the current queue-filtered list against both new filters in one pass.
3. Keep the helper tolerant of missing `leads` arrays so conversations without extracted lead status still appear when the temperature filter is `all`.

### Task 3: Add failing filter-menu tests

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxListFilterMenu.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxListFilterMenu.test.tsx`

1. Write a failing render test that shows a filter trigger button suitable for the Inbox title row.
2. Write a failing render test that shows localized sections/options for unread scope and lead temperature inside the menu.
3. Write a failing render test that confirms the menu can render in a compact mobile-safe width without requiring a second fixed row.
4. Keep the component presentational so it only receives current values, translated labels, and `onChange` callbacks.

### Task 4: Wire the filters into InboxContainer

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`

1. Add local state for unread scope and lead-temperature scope next to the existing queue-tab state.
2. Keep queue tabs as the first filter stage, then run the new list-filter helper on the queue result.
3. Add a single filter icon button to the same header row as `Inbox` / `Gelen Kutusu`, aligned to the far right.
4. Open a small filter menu from that icon; inside the menu, group the unread scope and lead-temperature options clearly.
5. Keep the header mobile-safe even with the existing bot-mode pill by using a compact icon trigger and a menu width that cannot overflow the viewport.
6. Reuse the already-derived filtered list for selection reconciliation so if the current selection drops out of scope the first visible conversation becomes selected, and if realtime updates make a conversation newly eligible it appears automatically.
7. Add an empty-filter state message so operators are not shown the generic "No messages" copy when filters are what removed the list.

### Task 5: Add TR/EN copy for the new filters

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`

1. Add mirrored `inbox` translation keys for the unread filter label and options.
2. Add mirrored `inbox` translation keys for the lead-temperature filter label and `all/hot/warm/cold` options.
3. Add mirrored empty-state copy for "no conversations match current filters".

### Task 6: Update product docs for the Inbox workflow change

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

1. Mark the Inbox filter work complete in the active roadmap area and refresh the `Last Updated` date.
2. Add the Inbox list-filter behavior to the PRD if the operator workflow section needs the new control called out.
3. Add an `[Unreleased]` note describing the unread and lead-temperature filters in Release Notes.

### Task 7: Verify before completion

**Files:**
- Modify as needed from tasks above only

1. Run `npm test -- --run src/components/inbox/conversationListFilters.test.ts`.
2. Run `npm test -- --run src/components/inbox/InboxListFilterMenu.test.tsx`.
3. Run any additional targeted Inbox tests touched by the refactor.
4. Run `npm run build`.
5. Prepare commit message: `feat(phase-2): add inbox list filters`
