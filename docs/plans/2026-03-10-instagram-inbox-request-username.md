# Instagram Inbox Request Badge + Username Resolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mark Instagram request-origin conversations clearly in Inbox and show Instagram username instead of numeric contact ID when available.

**Architecture:** Persist request-origin as a conversation tag (`instagram_request`) at webhook ingest time (standby events), then render a badge from conversation-level state in list/header/details/message timeline. Add best-effort contact username resolution in Instagram webhook route using Graph API so `contact_name` can be updated from numeric ID to `@username` without schema changes.

**Tech Stack:** Next.js App Router, Supabase, TypeScript, Vitest.

---

### Task 1: Add failing tests for username resolution and request tagging (webhook layer)

**Files:**
- Modify: `src/lib/instagram/client.test.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

1. Add failing test for a new Instagram client helper that fetches user profile (`id,username,name`).
2. Add failing pipeline tests asserting standby metadata sets/keeps `instagram_request` tag when creating/updating conversations.
3. Run targeted tests and confirm failures.

### Task 2: Implement webhook-side username resolution and request-origin persistence

**Files:**
- Modify: `src/lib/instagram/client.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`

1. Add `InstagramClient.getUserProfile()`.
2. In Instagram webhook route, resolve contact name from user profile when webhook sender name is missing.
3. In inbound pipeline, when platform is Instagram and metadata source is standby, persist `instagram_request` in conversation tags (for both create and update paths).

### Task 3: Render request badge consistently in Inbox UI

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

1. Add reusable helpers for conversation-level Instagram request status.
2. Show request badge in conversation list row, conversation header, details panel (mobile/desktop), and keep message-level badge where relevant.
3. Ensure no hardcoded text; use existing translation key.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

1. Run targeted tests for touched modules.
2. Run `npm run build`.
3. Update roadmap/PRD/release notes with request badge + username improvements.
