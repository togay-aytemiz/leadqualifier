# Trial Credit Carryover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve unused trial credits as a persistent extra-credit balance when an organization activates its first premium package, while keeping monthly package credits non-rollover.

**Architecture:** Reuse the existing `topup_credit_balance` pool as the durable carryover bucket. On first premium activation, compute remaining trial credits, move that amount into top-up balance, mark the trial pool as fully consumed, and keep package renewal logic unchanged so only monthly package credits reset each cycle.

**Tech Stack:** Next.js server routes, Supabase Postgres functions/migrations, Vitest.

---

### Task 1: Lock carryover math with failing tests

**Files:**
- Create: `src/lib/billing/premium-activation.test.ts`
- Create: `src/lib/billing/premium-activation.ts`

**Step 1: Write the failing test**
- Add one test for `trial remaining -> topup carryover`.
- Add one test for `fully used trial -> no carryover`.

**Step 2: Run test to verify it fails**
Run: `npm test -- --run src/lib/billing/premium-activation.test.ts`
Expected: FAIL because helper does not exist yet.

### Task 2: Apply the carryover rule in premium activation paths

**Files:**
- Modify: `src/app/api/billing/iyzico/callback/route.ts`
- Create: `supabase/migrations/00084_trial_credit_carryover_on_premium_activation.sql`

**Step 1: Implement minimal production fix**
- Use the helper in live Iyzico subscription callback.
- Add a migration that updates `mock_checkout_subscribe` and `admin_assign_premium` to mirror the same rule.
- Insert an audit ledger row for carried-over trial credits in `topup_pool`.

**Step 2: Run targeted verification**
Run: `npm test -- --run src/lib/billing/premium-activation.test.ts`
Expected: PASS.

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run build**
Run: `npm run build`
Expected: PASS.

**Step 2: Document the business rule**
- Monthly package credits do not roll over.
- Unused trial credits are converted into persistent extra-credit balance on first premium activation.
