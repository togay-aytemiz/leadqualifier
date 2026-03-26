# Inbox Backend Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Inbox unread and lead-temperature list filters to backend pagination so filtered results are complete even when matching conversations live beyond the first loaded page.

**Architecture:** Keep the existing title-row filter UI and live client-side post-filtering for realtime/local state changes, but make `getConversations` accept filter params and fetch already-filtered pages from Supabase. When filters change in `InboxContainer`, reset pagination and reload from page 0 with the active backend filters.

**Tech Stack:** Next.js App Router, Supabase query builder, React client state, Vitest.

---

### Task 1: Lock the bug with failing tests

**Files:**
- Modify: `src/lib/inbox/actions.test.ts`
- Modify: `src/components/inbox/InboxContainer.filterSourceGuard.test.ts`

**Step 1: Write the failing tests**

- Add a `getConversations` test that passes unread/status filters and expects the Supabase builders to receive backend predicates instead of fetching the generic page.
- Add an `InboxContainer` source-guard test that expects filter changes to trigger a backend reload path instead of relying only on `applyInboxListFilters`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/inbox/actions.test.ts src/components/inbox/InboxContainer.filterSourceGuard.test.ts`

Expected: FAIL because `getConversations` does not accept/apply filter params and `InboxContainer` has no refetch path on filter changes.

### Task 2: Implement backend filter-aware pagination

**Files:**
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`

**Step 1: Write minimal implementation**

- Extend `getConversations` with filter params for `unreadFilter` and `leadTemperatureFilter`.
- Apply backend predicates in the primary Supabase query and fallback query path.
- Add a filter-aware reload helper in `InboxContainer` that resets pagination and replaces the conversation list when filters change.
- Make incremental `loadMoreConversations` use the current backend filters.

**Step 2: Run tests to verify they pass**

Run: `npm test -- --run src/lib/inbox/actions.test.ts src/components/inbox/InboxContainer.filterSourceGuard.test.ts`

Expected: PASS.

### Task 3: Regressions, docs, and build

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run broader relevant tests**

Run: `npm test -- --run src/lib/inbox/actions.test.ts src/components/inbox/InboxContainer.filterSourceGuard.test.ts src/components/inbox/filteredConversationBackfill.test.ts src/components/inbox/conversationListFilters.test.ts`

Expected: PASS.

**Step 2: Run full build**

Run: `npm run build`

Expected: PASS.

**Step 3: Commit**

```bash
git add src/lib/inbox/actions.ts src/lib/inbox/actions.test.ts src/components/inbox/InboxContainer.tsx src/components/inbox/InboxContainer.filterSourceGuard.test.ts docs/PRD.md docs/ROADMAP.md docs/RELEASE.md docs/plans/2026-03-26-inbox-backend-filtering-plan.md
git commit -m "fix(phase-3): move inbox list filters to backend pagination"
```
