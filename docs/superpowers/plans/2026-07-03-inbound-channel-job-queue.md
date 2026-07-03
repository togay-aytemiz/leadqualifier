# Inbound Channel Job Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inbound social webhooks acknowledge quickly and process AI replies through a bounded Supabase-backed job queue.

**Architecture:** Add a shared `inbound_message_jobs` table with idempotency, retry, and lease fields. WhatsApp and Instagram POST routes enqueue normalized event payloads and return `200 OK`; a protected processor endpoint leases pending jobs with a small concurrency limit and dispatches each job back through the existing channel-specific pipeline helpers. Demo/site chat already returns `202 pending` and polling, so it remains behaviorally unchanged while the job table is reusable for the future web widget.

**Tech Stack:** Next.js route handlers, Supabase/Postgres migrations, Vitest, existing WhatsApp/Instagram clients, existing `processInboundAiPipeline`.

---

### Task 1: Shared Job Model

**Files:**
- Create: `src/lib/channels/inbound-job-queue.ts`
- Create: `src/lib/channels/inbound-job-queue.test.ts`
- Create: `supabase/migrations/00125_inbound_message_jobs.sql`

- [ ] Add tests for job payload normalization, status transitions, and enqueue idempotency.
- [ ] Add migration for `inbound_message_jobs` with unique `(source, provider_message_id)` and lease indexes.
- [ ] Implement enqueue, lease, complete, and fail helpers.

### Task 2: WhatsApp Queue Adapter

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts`
- Create: `src/lib/channels/whatsapp-job-runner.ts`
- Update: `src/app/api/webhooks/whatsapp/route.test.ts`

- [ ] Add failing route test proving POST enqueues and returns before `processInboundAiPipeline` runs.
- [ ] Extract event processing into a runner that accepts a stored job payload.
- [ ] Replace deferred `after()` tasks with enqueue calls.

### Task 3: Instagram Queue Adapter

**Files:**
- Modify: `src/app/api/webhooks/instagram/route.ts`
- Create: `src/lib/channels/instagram-job-runner.ts`
- Update: `src/app/api/webhooks/instagram/route.test.ts`

- [ ] Add failing route test proving inbound events enqueue and return `200` without immediate AI processing.
- [ ] Extract event processing into a runner that accepts a stored job payload.
- [ ] Keep outbound echo persistence synchronous enough to preserve inbox visibility, but queue inbound AI replies.

### Task 4: Protected Processor Endpoint

**Files:**
- Create: `src/app/api/internal/inbound-jobs/process/route.ts`
- Create: `src/app/api/internal/inbound-jobs/process/route.test.ts`

- [ ] Add tests for missing token, leasing limit, successful completion, retryable failure, and terminal failure.
- [ ] Implement protected POST with `INBOUND_JOBS_PROCESS_TOKEN`.
- [ ] Process jobs with bounded concurrency and per-job retry accounting.

### Task 5: Docs and Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] Update docs with the operational queue decision.
- [ ] Run targeted tests and `npm run build`.
