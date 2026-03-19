# Instagram External Outbound Inbox Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Instagram messages sent directly from the Instagram app appear in Qualy Inbox conversations with the correct contact identity and avatar.

**Architecture:** Keep the existing inbound AI pipeline unchanged for real customer-origin inbound events. Extend Instagram webhook parsing to expose outbound `echo` events separately, then persist those events in the webhook route as operator/user messages so Inbox state updates without triggering AI or unread increments.

**Tech Stack:** Next.js App Router, Supabase, Vitest, Instagram webhook ingestion, Inbox message persistence

---

### Task 1: Lock the failing behavior with tests

**Files:**
- Modify: `src/lib/instagram/webhook.test.ts`
- Modify: `src/app/api/webhooks/instagram/route.test.ts`

**Step 1: Write the failing tests**

- Add a parser test proving Instagram `message.is_echo === true` events from the business account are extracted as outbound conversation events instead of being dropped.
- Add a route test proving those outbound events are persisted as `sender_type='user'`, update the conversation, and do not call the inbound AI pipeline.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/instagram/webhook.test.ts src/app/api/webhooks/instagram/route.test.ts`

Expected: FAIL because outbound echo events are currently ignored and the route has no external-outbound persistence path.

### Task 2: Implement the minimal webhook fix

**Files:**
- Modify: `src/lib/instagram/webhook.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`

**Step 1: Extend webhook event extraction**

- Preserve existing inbound behavior.
- Emit outbound event records for business-origin `echo` messages using the recipient contact id.

**Step 2: Persist external outbound events correctly**

- Reuse existing channel/profile lookup in the route.
- Deduplicate by `instagram_message_id`.
- Insert/update conversation state as an operator/user message, refresh contact name/avatar, keep unread count stable, and clear `instagram_request` tag after outbound acceptance.
- Skip AI automation for these external outbound events.

**Step 3: Run tests to verify they pass**

Run: `npm test -- --run src/lib/instagram/webhook.test.ts src/app/api/webhooks/instagram/route.test.ts`

Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run broader verification**

Run: `npm run build`

Expected: successful production build with no regressions.

**Step 2: Update docs**

- Add the Instagram external-outbound inbox sync rule to PRD and roadmap notes.
- Add the shipped fix to release notes.
