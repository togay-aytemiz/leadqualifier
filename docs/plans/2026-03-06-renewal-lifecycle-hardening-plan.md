# Renewal Lifecycle Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce false premium lockouts around billing-period boundaries and make Iyzico renewal-success persistence atomic/idempotent across retries.

**Architecture:** Add a small local grace window after `current_period_end` before premium entitlement expires, but keep strict `past_due` behavior for explicit failed-renewal events. Move renewal-success state mutation into a single DB RPC so subscription period update, billing reset, and ledger grant are applied transactionally and retries remain safe.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase PostgreSQL migrations/RPC

---

### Task 1: Lock grace-window behavior with failing tests

**Files:**
- Modify: `src/lib/billing/policy.test.ts`
- Modify: `src/lib/billing/snapshot.test.ts`

**Step 1: Write the failing test**
- Add one policy test proving premium usage is still allowed shortly after `current_period_end` when membership is still `premium_active`.
- Add one snapshot test proving the account is treated as `canceled` only after the grace window fully passes.

**Step 2: Run test to verify it fails**
- Run: `npm test -- --run src/lib/billing/policy.test.ts src/lib/billing/snapshot.test.ts`

### Task 2: Lock webhook persistence strategy with a failing test

**Files:**
- Modify: `src/app/api/billing/iyzico/webhook/route.test.ts`

**Step 1: Write the failing test**
- Assert renewal success delegates to a service-role RPC instead of separate subscription/billing/ledger writes.

**Step 2: Run test to verify it fails**
- Run: `npm test -- --run src/app/api/billing/iyzico/webhook/route.test.ts`

### Task 3: Implement minimal production changes

**Files:**
- Modify: `src/lib/billing/policy.ts`
- Modify: `src/lib/billing/snapshot.ts`
- Modify: `src/app/api/billing/iyzico/webhook/route.ts`
- Create: `supabase/migrations/00086_iyzico_renewal_success_rpc_and_grace_window.sql`

**Step 1: Add grace helper**
- Centralize a fixed grace window constant in TS.
- Expire premium only after `current_period_end + grace`.

**Step 2: Add DB RPC**
- Create one transactional RPC that applies renewal success atomically and remains idempotent when the same order reference is replayed.

**Step 3: Call RPC from webhook**
- Keep provider retrieve logic in route.
- Delegate actual persistence to the new RPC.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted billing tests**
- Run: `npm test -- --run src/lib/billing/policy.test.ts src/lib/billing/snapshot.test.ts src/app/api/billing/iyzico/webhook/route.test.ts src/lib/billing/subscription-renewal.test.ts`

**Step 2: Run project verification**
- Run: `npm run i18n:check`
- Run: `npm run build`
