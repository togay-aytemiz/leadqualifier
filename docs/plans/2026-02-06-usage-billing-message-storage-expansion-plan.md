# Usage & Billing Message + Storage Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Usage & Billing page with message usage (monthly UTC + all-time) and storage usage (skills + knowledge base bytes), keeping existing AI usage card style.

**Architecture:** Add a new server utility module that computes message and storage summaries from Supabase. Keep UI changes localized to the billing page and reuse existing card styling. Add unit tests for calculation/format helpers first, then implement query and rendering logic.

**Tech Stack:** Next.js App Router, Supabase SSR client, TypeScript, next-intl, Vitest.

---

### Task 1: Add failing tests for new billing usage helpers

**Files:**
- Create: `src/lib/billing/usage.test.ts`

**Step 1: Write failing tests**
- Cover message totals aggregation helper.
- Cover UTF-8 byte accounting for skills/knowledge records.
- Cover storage size formatter (B/KB/MB).

**Step 2: Run test to verify it fails**
Run: `npm run test -- src/lib/billing/usage.test.ts`
Expected: FAIL (module/functions missing).

### Task 2: Implement billing usage helper module

**Files:**
- Create: `src/lib/billing/usage.ts`

**Step 1: Implement calculation helpers used by tests**
- `buildMessageUsageTotals`
- `calculateSkillStorageBytes`
- `calculateKnowledgeStorageBytes`
- `formatStorageSize`

**Step 2: Implement server-side summary fetchers**
- `getOrgMessageUsageSummary`
- `getOrgStorageUsageSummary`

**Step 3: Run tests**
Run: `npm run test -- src/lib/billing/usage.test.ts`
Expected: PASS.

### Task 3: Extend billing UI with new sections

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/billing/page.tsx`

**Step 1: Load new summaries in parallel with existing AI usage query**
- Add `getOrgMessageUsageSummary` and `getOrgStorageUsageSummary` to the existing `Promise.all`.

**Step 2: Render new sections with current card design language**
- Add “Message Usage” section with monthly and all-time cards.
- Add “Storage Usage” section with total card and skills/knowledge breakdown.

### Task 4: Add EN/TR translations

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add new keys under `billingUsage`**
- Message usage labels (title, description, breakdown labels, message unit).
- Storage usage labels (title, description, total/skills/knowledge labels, items/docs labels).

### Task 5: Verify and update product docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**
- `npm run test -- src/lib/billing/usage.test.ts`
- `npm run build`

**Step 2: Update docs**
- Roadmap: mark usage/billing expansion item complete and update date.
- PRD: reflect message + storage visibility in Usage & Billing feature section and append a tech decision entry.
- Release: add Added/Changed/Fixed notes under Unreleased.
