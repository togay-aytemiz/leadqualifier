# Admin AI Latency Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add durable admin-facing latency analytics for lead extraction completion time and LLM user-response time so real load tests can be evaluated from the product.

**Architecture:** Store latency events in a dedicated table instead of overloading `organization_ai_usage`, because duration analytics and token accounting have different semantics. Instrument lead extraction and LLM-generated reply flows to emit one event per completed operation, then aggregate average/p95/sample-count metrics in the admin dashboard using the existing organization-period scoping model.

**Tech Stack:** Supabase Postgres + migration, Next.js App Router, server-side Supabase read models, Vitest, `next-intl`.

---

### Task 1: Define latency summary behavior with tests

**Files:**
- Create: `src/lib/ai/latency.test.ts`
- Create: `src/lib/admin/ai-latency-summary.test.ts`
- Create: `src/lib/ai/latency.ts`
- Create: `src/lib/admin/ai-latency-summary.ts`

**Step 1: Write the failing test**

Cover:
- percentile/average aggregation for `lead_extraction` and `llm_response`
- zero-data behavior
- admin period/org scoping helper output shape

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/ai/latency.test.ts src/lib/admin/ai-latency-summary.test.ts`

Expected: FAIL because the helpers do not exist yet.

**Step 3: Write minimal implementation**

Implement:
- latency event types + aggregation helpers
- admin summary builder that returns avg/p95/max/sample-count per metric

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/ai/latency.test.ts src/lib/admin/ai-latency-summary.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/latency.ts src/lib/ai/latency.test.ts src/lib/admin/ai-latency-summary.ts src/lib/admin/ai-latency-summary.test.ts docs/plans/2026-03-15-admin-ai-latency-analytics-plan.md
git commit -m "test(phase-9): define admin ai latency metrics"
```

### Task 2: Persist latency events and instrument runtime flows

**Files:**
- Create: `supabase/migrations/00091_organization_ai_latency_events.sql`
- Modify: `src/lib/leads/extraction.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/types/database.ts`

**Step 1: Write the failing test**

Extend helper tests to require:
- lead extraction event metadata shape
- user-response event metadata shape

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/ai/latency.test.ts`

Expected: FAIL because runtime event builders/instrumentation outputs are missing.

**Step 3: Write minimal implementation**

Add:
- dedicated latency event table + types
- `recordAiLatencyEvent`
- lead extraction timing from function entry to persisted lead + usage write
- LLM response timing from reply-flow entry to outbound send/persist for `rag` and `fallback`

**Step 4: Run targeted verification**

Run: `npm test -- --run src/lib/ai/latency.test.ts src/lib/admin/ai-latency-summary.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add supabase/migrations/00091_organization_ai_latency_events.sql src/lib/leads/extraction.ts src/lib/channels/inbound-ai-pipeline.ts src/app/api/webhooks/telegram/route.ts src/types/database.ts
git commit -m "feat(phase-9): record ai latency events"
```

### Task 3: Expose admin dashboard metrics and finish verification

**Files:**
- Modify: `src/lib/admin/read-models.ts`
- Modify: `src/app/[locale]/(dashboard)/admin/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Implement admin UI**

Add an `AI Latency` section showing:
- average lead extraction
- p95 lead extraction
- average LLM response
- p95 LLM response
- sample counts + active period label

Respect current admin organization selection + period filter.

**Step 2: Run verification commands**

Run:
- `npm test -- --run src/lib/ai/latency.test.ts src/lib/admin/ai-latency-summary.test.ts`
- `npm run build`

Expected: PASS.

**Step 3: Commit**

```bash
git add src/lib/admin/read-models.ts src/app/[locale]/(dashboard)/admin/page.tsx messages/en.json messages/tr.json docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "feat(phase-9): surface admin ai latency analytics"
```
