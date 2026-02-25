# Conversation-Level AI Pause Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let operators pause all AI automation for a specific conversation/contact so the system does not send AI replies and does not run lead extraction for that person until resumed.

**Architecture:** Add a conversation-level flag (`ai_processing_paused`) on `conversations`. Use this flag as a hard runtime gate in inbound pipelines (WhatsApp/Instagram shared pipeline + Telegram route) before any lead extraction, skill matching, KB routing, fallback generation, or outbound AI reply. Expose a right-side Inbox details checkbox (desktop + mobile details) to toggle the flag, and block manual lead-refresh while paused.

**Tech Stack:** Supabase Postgres + RLS, Next.js App Router, server actions (`src/lib/inbox/actions.ts`), inbox client UI (`src/components/inbox/InboxContainer.tsx`), next-intl (`messages/en.json`, `messages/tr.json`), Vitest.

---

## Approach Options (Brainstorming)

### Option A: Reuse `active_agent='operator'`
- **How:** Force operator mode to silence AI.
- **Pros:** No schema change.
- **Cons:** Does not reliably disable lead extraction (depends on org toggle), overloads takeover semantics, and is easy to accidentally resume with "Leave Conversation".

### Option B (Recommended): Add one conversation-level pause flag
- **How:** `conversations.ai_processing_paused BOOLEAN NOT NULL DEFAULT FALSE`.
- **Pros:** Matches user intent exactly, low complexity, clear UX (single checkbox), minimal risk to existing escalation/takeover behavior.
- **Cons:** Adds one column + small migration/test updates.

### Option C: Add two separate flags (`pause_replies`, `pause_lead_extraction`)
- **How:** Independent switches per conversation.
- **Pros:** Maximum flexibility.
- **Cons:** Overkill for current requirement, higher UX/copy complexity, larger testing surface.

---

### Task 1: Add conversation pause schema and types

**Files:**
- Create: `supabase/migrations/00071_conversation_ai_processing_pause.sql`
- Modify: `src/types/database.ts`

**Steps:**
1. Write migration adding `ai_processing_paused BOOLEAN NOT NULL DEFAULT FALSE` to `public.conversations`.
2. Update `Conversation` type to include `ai_processing_paused`.
3. Verify no existing select/query code breaks with the new field.

### Task 2: Add server action to toggle pause

**Files:**
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/inbox/actions.test.ts`

**Steps:**
1. Add a new action: `setConversationAiProcessingPaused(conversationId: string, paused: boolean)`.
2. Enforce tenant write guard (`assertTenantWriteAllowed`) and update `conversations` row.
3. Return minimal success payload for optimistic UI updates.
4. Add tests for success/failure paths.

### Task 3: Enforce pause in runtime AI pipelines

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Add/Modify: `src/app/api/webhooks/telegram/route.test.ts` (if missing/limited)

**Steps:**
1. In shared inbound pipeline, after inbound message persistence and conversation timestamp/unread update, hard-stop if `conversation.ai_processing_paused` is true.
2. In Telegram webhook route, apply the same hard-stop check before lead extraction and reply logic.
3. Keep message persistence and unread updates intact while paused.
4. Add tests asserting:
   - inbound is stored,
   - lead extraction is skipped,
   - outbound AI reply is skipped,
   - no token-consuming stages run.

### Task 4: Block manual lead refresh while paused

**Files:**
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Steps:**
1. Extend `LeadRefreshResult` with a new reason (`paused`).
2. In `refreshConversationLead`, read `ai_processing_paused`; return `{ ok: false, reason: 'paused' }` when enabled.
3. In Inbox UI, map this reason to localized helper text.
4. Disable/hide manual refresh CTA when per-conversation pause is active.

### Task 5: Add Inbox toggle UI (desktop right panel + mobile details)

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Steps:**
1. Add a checkbox/switch under `Key Information` for selected conversation.
2. Label suggestion: “Pause AI for this contact” / “Bu kişi için AI işlemlerini durdur”.
3. Helper copy: clarify both AI reply + lead extraction are paused.
4. Support optimistic UI update and loading/disabled state.
5. Mirror the same toggle in mobile details panel for parity.
6. Add a small paused badge/chip near `Active Agent` or contact header for quick visibility.

### Task 6: Documentation and release tracking

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Add roadmap item under Inbox/AI controls.
2. Update PRD rules for conversation-level AI pause behavior.
3. Add release note entries under `[Unreleased]` (`Added` / `Changed` / `Fixed` as needed).

### Task 7: Verification

**Commands:**
- `npm run test -- src/lib/channels/inbound-ai-pipeline.test.ts src/lib/inbox/actions.test.ts src/app/api/webhooks/telegram/route.test.ts`
- `npm run i18n:check`
- `npm run build`

**Expected:**
- Runtime gates respect conversation pause.
- UI toggle state persists and rehydrates.
- TR/EN keys remain in parity.
- Build passes without type errors.

---

## Acceptance Criteria

1. When pause is enabled for a conversation, new inbound messages are still recorded but do not trigger lead extraction or AI reply.
2. Manual lead refresh is blocked for paused conversations with clear localized feedback.
3. Operators can toggle pause on/off from Inbox details (desktop + mobile details).
4. Existing operator takeover (`active_agent`) and org-level `bot_mode` behavior remain unchanged.
