# Credit History Explorer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Settings > Usage` credit history complete enough for operators to inspect package loads, usage debits, and large histories without overwhelming the page.

**Architecture:** Keep the first record page server-rendered for fast entry, then use server actions for lazy-loaded record pages and aggregate windows. The ledger query owns period filtering, movement filtering, row pagination, and complete-period aggregate windows; the client table owns simplified record/aggregate presentation and loaded-row aggregation.

**Tech Stack:** Next.js App Router, React client component state, Supabase/PostgREST range queries, next-intl TR/EN messages, Vitest.

---

### Task 1: Ledger Page Query

**Files:**
- Modify: `src/lib/billing/server.ts`
- Test: `src/lib/billing/server.test.ts`

**Steps:**
1. Write a failing test for `current_month` date bounds and `range(offset, offset + limit)` pagination.
2. Add `getOrganizationBillingLedgerPage` with `current_month`, `previous_month`, and `all` period support.
3. Fetch one extra row to return `hasMore` and `nextOffset`.
4. Keep the old `getOrganizationBillingLedger` behavior intact for existing callers.
5. Add `all / usage / loads` movement filtering so positive package/top-up grants can be isolated from usage debits.
6. Add aggregate window reads that load full local periods: 10 days, 3 weeks, or 3 months per request.

### Task 2: Credit History Table UX

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/billing/BillingLedgerTable.tsx`
- Test: `src/app/[locale]/(dashboard)/settings/billing/BillingLedgerTable.test.tsx`

**Steps:**
1. Write failing tests for period controls, movement controls, record/aggregate views, and monthly aggregation.
2. Add period buttons: this month, previous month, all.
3. Add movement selector: all, usage, loads.
4. Add view selector: records, daily, weekly, monthly.
5. Replace the old 3-row expand/collapse with page-based lazy loading.
6. Render record view as `Date / Movement / Delta / Balance / Detail`.
7. Render aggregate view as `Period / Usage / Added / Net / Balance / Movements`.

### Task 3: Server-to-Client Wiring

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx`

**Steps:**
1. Load the first `current_month` ledger page on the server.
2. Build formatted table rows from ledger entries and linked subscription/order metadata.
3. Pass one server action for record period/movement changes and load-more clicks.
4. Pass a separate server action for aggregate window loading so `Load more` does not split days, weeks, or months.
5. Keep purchase/package rows in the same ledger feed so top-ups and package grants are visible.

### Task 4: Localization and Docs

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Add mirrored EN/TR strings for period filters, movement filters, view modes, compact labels, loading, and aggregate labels.
2. Update Usage & Billing product requirements.
3. Mark the pilot-readiness usage-history improvement complete in the roadmap.
4. Record the change in release notes.

### Task 5: Verification

**Commands:**
- `npm test -- --run src/lib/billing/server.test.ts src/app/[locale]/(dashboard)/settings/billing/BillingLedgerTable.test.tsx`
- `npm run i18n:check`
- `npm run build`

**Expected:** Targeted tests, i18n mirror check, and production build pass.
