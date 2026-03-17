# Operator Send Durability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make manual operator outbound sends durable by persisting a pending message before provider delivery, marking it `sent` or `failed` afterward, and surfacing persisted delivery state in Inbox so provider/database drift is visible instead of silent.

**Architecture:** Use the existing `messages` table as the single operator-message source of truth, but add a queue-first persistence step. The first pass should avoid a separate outbox table and instead add a DB RPC that inserts a pending operator message atomically with conversation assignment/attention updates, then let server actions finalize provider metadata after the API call. The UI should read a generic persisted delivery-state contract from message metadata while remaining backward-compatible with the current WhatsApp/Instagram attachment status keys.

**Tech Stack:** Next.js App Router server actions, Supabase Postgres/RPC, React 19, Vitest, next-intl.

---

### Task 1: Lock server-side durability behavior with failing tests

**Files:**
- Modify: `src/lib/inbox/actions.test.ts`

**Steps:**
1. Using `@test-driven-development`, add a failing `sendMessage()` test that proves the server now queues a pending operator message before sending to the provider, then updates the same message metadata to `outbound_delivery_status: 'sent'` with the provider message id when delivery succeeds.
2. Add a failing `sendMessage()` test that proves provider failure does not create a fake-success message row; instead, the queued message remains in the conversation with `outbound_delivery_status: 'failed'` plus a compact failure reason in metadata.
3. Extend the existing WhatsApp template and Instagram image tests so they fail until template/media sends also use the same queue-first delivery-state flow and only clear `instagram_request` after a successful send.
4. Run `npm test -- --run src/lib/inbox/actions.test.ts`.
5. Confirm the new tests fail for the intended missing durability behavior before implementation starts.

### Task 2: Add queue-first persistence primitives

**Files:**
- Create: `src/lib/inbox/outbound-delivery.ts`
- Create: `src/lib/inbox/outbound-delivery.test.ts`
- Create: `supabase/migrations/00093_operator_message_delivery_queue.sql`

**Steps:**
1. Create a tiny delivery-metadata helper module that builds/merges a normalized contract such as `outbound_delivery_status`, `outbound_channel`, `outbound_provider_message_id`, and `outbound_error_code`, plus backward-compatible helpers for existing `whatsapp_*` and `instagram_*` metadata.
2. Add a failing helper test that proves metadata merging preserves existing media payloads while overlaying generic delivery-state fields.
3. Add a new Supabase RPC such as `queue_operator_message(p_conversation_id UUID, p_content TEXT, p_metadata JSONB DEFAULT '{}'::jsonb)` that inserts the message in `pending` state and atomically updates `active_agent`, `assignee_id`, and human-attention resolution on the conversation.
4. Run `npm test -- --run src/lib/inbox/outbound-delivery.test.ts`.
5. Confirm the helper tests pass and the migration leaves the old `send_operator_message` path untouched until the action refactor is complete.

### Task 3: Switch text, template, and media sends to queue-first delivery

**Files:**
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/inbox/actions.test.ts`

**Steps:**
1. Refactor `sendMessage()` in `src/lib/inbox/actions.ts` to call the new queue RPC first, send to the platform second, and update the queued row metadata to `sent` or `failed` afterward using one shared helper.
2. Apply the same queue/finalize flow to `sendConversationWhatsAppTemplateMessage()`, `sendConversationWhatsAppMediaBatch()`, and `sendConversationInstagramImageBatch()` so all operator-originated outbound paths share the same persisted delivery contract.
3. Ensure the server action returns the updated message row, not the pre-send pending snapshot, and only clears `instagram_request` tags when the provider call succeeds.
4. Re-run `npm test -- --run src/lib/inbox/actions.test.ts src/lib/inbox/outbound-delivery.test.ts`.
5. Keep iterating until the targeted server tests are green.

### Task 4: Surface persisted delivery state in Inbox

**Files:**
- Create: `src/components/inbox/outboundDeliveryState.ts`
- Create: `src/components/inbox/outboundDeliveryState.test.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Steps:**
1. Extract the current delivery-state parsing from `InboxContainer.tsx` into a small helper that understands both legacy attachment-only keys (`whatsapp_outbound_status`, `instagram_outbound_status`) and the new generic text/template/media keys.
2. Add a failing helper test that proves persisted operator text messages with `outbound_delivery_status: 'pending' | 'failed'` render the same status chips currently used for optimistic attachment sends.
3. Update the Inbox message rendering path to read the shared helper so failed/pending persisted user messages show accurate state after `refreshMessages()`, not only while local optimistic UI is alive.
4. Add any missing TR/EN strings needed for generic failed/pending delivery messaging without introducing hardcoded text.
5. Re-run `npm test -- --run src/components/inbox/outboundDeliveryState.test.ts`.

### Task 5: Verify, document, and leave a clean follow-up edge

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Update docs to record that operator sends are now queue-first with persisted delivery state, and note that a dedicated retry/outbox worker is still a follow-up rather than part of this pass.
2. Run `npm test -- --run src/lib/inbox/actions.test.ts src/lib/inbox/outbound-delivery.test.ts src/components/inbox/outboundDeliveryState.test.ts`.
3. Run `npm run i18n:check`.
4. Run `npm run build`.
5. Using `@verification-before-completion`, report exact command outputs and any residual ambiguity that still requires a later dedicated outbox/reconciliation design.
