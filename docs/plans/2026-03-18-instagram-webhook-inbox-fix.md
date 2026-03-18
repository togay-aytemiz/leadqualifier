# Instagram Webhook Inbox Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore Instagram DM ingestion into Inbox by fixing webhook identifier resolution, adding regression coverage, and preventing false-ready channel state.

**Architecture:** Keep the shared inbound pipeline unchanged and fix the break at the channel-resolution boundary. Resolve and persist the best available Instagram identifiers during connect/reconcile, accept page-based webhook `entry.id` lookups, and make Instagram channel readiness depend on webhook verification instead of plain `status='active'`.

**Tech Stack:** Next.js App Router, Vitest, Supabase server/service clients, Meta Instagram Graph integration

---

### Task 1: Reproduce The Broken Webhook Lookup

**Files:**
- Create: `src/app/api/webhooks/instagram/route.test.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`

**Step 1: Write the failing test**

Add a route test that sends a valid Instagram webhook event whose `entry.id` maps to `config.page_id`, not `config.instagram_business_account_id`, and assert the event reaches `processInboundAiPipeline`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/api/webhooks/instagram/route.test.ts`
Expected: FAIL because the current lookup ignores `page_id`.

**Step 3: Write minimal implementation**

Update Instagram webhook channel lookup/reconcile logic to match `page_id` in addition to Instagram account identifiers.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/api/webhooks/instagram/route.test.ts`
Expected: PASS

### Task 2: Correct Instagram Identifier Resolution

**Files:**
- Modify: `src/lib/channels/meta-oauth.ts`
- Modify: `src/lib/channels/meta-oauth.test.ts`

**Step 1: Write the failing test**

Add/adjust tests so `resolveMetaInstagramConnectionCandidate()` prefers page discovery when available and merges app-scoped/profile metadata instead of forcing `pageId = instagramBusinessAccountId`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/channels/meta-oauth.test.ts`
Expected: FAIL on the new merged page-id expectation.

**Step 3: Write minimal implementation**

Fetch profile metadata and page metadata together, return actual `pageId/pageAccessToken` when available, and keep profile fallback when page discovery is unavailable.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/channels/meta-oauth.test.ts`
Expected: PASS

### Task 3: Prevent False-Ready Instagram State

**Files:**
- Modify: `src/lib/channels/connection-readiness.ts`
- Modify: `src/lib/channels/connection-readiness.test.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`

**Step 1: Write the failing test**

Add readiness coverage showing active Instagram channels without webhook verification stay `pending`, not `ready`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/channels/connection-readiness.test.ts`
Expected: FAIL because non-WhatsApp channels are currently always treated as ready.

**Step 3: Write minimal implementation**

Persist Instagram webhook status as pending on connect, mark verified in the Instagram GET verification route, and make Instagram readiness depend on webhook verification.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/channels/connection-readiness.test.ts`
Expected: PASS

### Task 4: Verify And Document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted verification**

Run:
- `npm test -- --run src/app/api/webhooks/instagram/route.test.ts`
- `npm test -- --run src/lib/channels/meta-oauth.test.ts`
- `npm test -- --run src/lib/channels/connection-readiness.test.ts`

Expected: PASS

**Step 2: Run broader safety checks**

Run:
- `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`
- `npm run build`

Expected: PASS

**Step 3: Update product docs**

Record the Instagram webhook reliability fix, page-id lookup hardening, and readiness-state correction in roadmap/PRD/release notes.
