# Dashboard Data Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove hidden read-path work from the hottest dashboard data loads so `Skills` and `Knowledge` feel faster before the larger client-cache phase.

**Architecture:** Keep Next.js App Router intact, but make server reads cheaper. For `Skills`, convert the page load to a pure read unless the workspace is truly empty. For `Knowledge`, replace collection-count payload scanning with an aggregate RPC so the page no longer loads every document id just to compute folder counts.

**Tech Stack:** Next.js 16 App Router, Supabase SSR client, PostgreSQL RPC, Vitest, next-intl

---

### Task 1: Skills Read Path

**Files:**
- Modify: `src/lib/skills/actions.ts`
- Create: `src/lib/skills/actions.test.ts`

**Step 1: Write the failing test**

- Assert `getSkills()` performs a single skills read when rows already exist.
- Assert `getSkills()` seeds defaults only when the unfiltered workspace is empty.
- Assert search requests never seed defaults.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/skills/actions.test.ts`

Expected: FAIL because current implementation performs pre-read maintenance and does not follow the new single-read contract.

**Step 3: Write minimal implementation**

- Remove request-path embedding maintenance.
- Read skills first.
- If `search` is empty and the first read returns zero rows, seed defaults and re-read once.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/skills/actions.test.ts`

Expected: PASS

### Task 2: Knowledge Collection Counts

**Files:**
- Modify: `src/lib/knowledge-base/actions.ts`
- Create: `src/lib/knowledge-base/actions.test.ts`
- Create: `supabase/migrations/00099_knowledge_collection_count_rpc.sql`

**Step 1: Write the failing test**

- Assert `getCollections()` uses an aggregate RPC for counts instead of loading all document rows.
- Assert returned collection counts still match the aggregated payload.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/knowledge-base/actions.test.ts`

Expected: FAIL because current implementation scans `knowledge_documents` rows directly.

**Step 3: Write minimal implementation**

- Add a SQL RPC that returns `{ collection_id, document_count }` rows for an organization.
- Update `getCollections()` to call the RPC and build its count map from aggregated results.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/knowledge-base/actions.test.ts`

Expected: PASS

### Task 3: Verification And Docs

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run:
- `npm test -- --run src/lib/skills/actions.test.ts`
- `npm test -- --run src/lib/knowledge-base/actions.test.ts`

Expected: PASS

**Step 2: Run full build verification**

Run: `npm run build`

Expected: PASS

**Step 3: Update product docs**

- Add the read-path optimization decision to PRD tech decisions / update note.
- Mark roadmap performance slice complete.
- Add release-note entries under `Changed`.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-26-dashboard-data-performance-plan.md src/lib/skills/actions.ts src/lib/skills/actions.test.ts src/lib/knowledge-base/actions.ts src/lib/knowledge-base/actions.test.ts supabase/migrations/00099_knowledge_collection_count_rpc.sql docs/PRD.md docs/ROADMAP.md docs/RELEASE.md
git commit -m "feat(phase-9): optimize dashboard data read paths"
```
