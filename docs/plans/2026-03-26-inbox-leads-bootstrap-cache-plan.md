# Inbox And Leads Bootstrap Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Inbox` thread opens and `Leads` table interactions feel immediate by moving hot data loads onto initial payload bootstrap plus client-side cache instead of repeated route-level reloads.

**Architecture:** Keep the current Next.js App Router shell, but introduce combined server data actions for the hottest dashboard payloads. `Inbox` will fetch thread messages + lead details in one request, seed the first selected conversation from the page, and keep a per-conversation client cache. `Leads` will hydrate from server-rendered initial data, then switch sort/search/pagination onto a client cache backed by one server action for paginated lead data.

**Tech Stack:** Next.js 16 App Router, React 19 client state, Supabase SSR client, Vitest, next-intl

---

### Task 1: Inbox Thread Bootstrap

**Files:**
- Create: `src/lib/inbox/thread-actions.ts`
- Create: `src/lib/inbox/thread-actions.test.ts`
- Modify: `src/app/[locale]/(dashboard)/inbox/page.tsx`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Create: `src/components/inbox/InboxContainer.threadBootstrap.test.ts`

**Step 1: Write the failing tests**

- Add a unit test proving the new thread payload action returns the first page of messages plus lead details while reusing the provided organization id.
- Add a source guard proving `InboxContainer` keeps a per-conversation cache and hydrates from `initialThreadPayload` before requesting again.

**Step 2: Run tests to verify they fail**

Run:
- `npm test -- --run src/lib/inbox/thread-actions.test.ts`
- `npm test -- --run src/components/inbox/InboxContainer.threadBootstrap.test.ts`

Expected: FAIL because the combined payload action and bootstrap cache wiring do not exist yet.

**Step 3: Write the minimal implementation**

- Add a combined `getConversationThreadPayload` server action with one billing check and parallel DB reads for messages + lead.
- Fetch the first selected conversation payload in the Inbox page and pass it into the client.
- Add a client-side thread payload cache in `InboxContainer` and reuse cached payloads immediately on re-open, with background warming for the hottest conversations only if needed.

**Step 4: Run tests to verify they pass**

Run:
- `npm test -- --run src/lib/inbox/thread-actions.test.ts`
- `npm test -- --run src/components/inbox/InboxContainer.threadBootstrap.test.ts`

Expected: PASS

### Task 2: Leads Page Client Cache

**Files:**
- Create: `src/lib/leads/page-data.ts`
- Create: `src/lib/leads/page-data.test.ts`
- Create: `src/components/leads/LeadsClient.tsx`
- Create: `src/components/leads/LeadsClient.test.ts`
- Modify: `src/app/[locale]/(dashboard)/leads/page.tsx`
- Modify: `src/components/leads/LeadSearch.tsx`
- Modify: `src/components/leads/LeadsTable.tsx`

**Step 1: Write the failing tests**

- Add a unit test proving the new combined leads page-data action returns both paginated leads and required fields for a provided organization id.
- Add a source guard proving the page now renders `LeadsClient`, and the client keeps an in-memory query cache instead of navigating for every sort/search/page change.

**Step 2: Run tests to verify they fail**

Run:
- `npm test -- --run src/lib/leads/page-data.test.ts`
- `npm test -- --run src/components/leads/LeadsClient.test.ts`

Expected: FAIL because the combined action and client cache flow do not exist yet.

**Step 3: Write the minimal implementation**

- Add `getLeadsPageData` as the single data contract for paginated leads UI.
- Move leads sort/search/pagination state into a client wrapper with cache keyed by normalized query params.
- Keep the URL in sync without route navigation, and seed the cache from the server-rendered initial payload.

**Step 4: Run tests to verify they pass**

Run:
- `npm test -- --run src/lib/leads/page-data.test.ts`
- `npm test -- --run src/components/leads/LeadsClient.test.ts`

Expected: PASS

### Task 3: Verification And Docs

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run:
- `npm test -- --run src/lib/inbox/thread-actions.test.ts`
- `npm test -- --run src/components/inbox/InboxContainer.threadBootstrap.test.ts`
- `npm test -- --run src/lib/leads/page-data.test.ts`
- `npm test -- --run src/components/leads/LeadsClient.test.ts`

Expected: PASS

**Step 2: Run full build verification**

Run: `npm run build`

Expected: PASS

**Step 3: Update product docs**

- Add a PRD update note explaining the inbox thread bootstrap and client-cached leads interactions.
- Mark the roadmap performance slice complete.
- Record the change in release notes.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-26-inbox-leads-bootstrap-cache-plan.md src/lib/inbox/thread-actions.ts src/lib/inbox/thread-actions.test.ts src/components/inbox/InboxContainer.tsx src/components/inbox/InboxContainer.threadBootstrap.test.ts src/lib/leads/page-data.ts src/lib/leads/page-data.test.ts src/components/leads/LeadsClient.tsx src/components/leads/LeadsClient.test.ts src/components/leads/LeadSearch.tsx src/components/leads/LeadsTable.tsx src/app/[locale]/(dashboard)/inbox/page.tsx src/app/[locale]/(dashboard)/leads/page.tsx docs/PRD.md docs/ROADMAP.md docs/RELEASE.md
git commit -m "feat(phase-9): add inbox and leads bootstrap caches"
```
