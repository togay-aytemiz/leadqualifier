# Inbox Attention Tabs + Operator Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make human-handover-demanding conversations instantly visible in Inbox with a 3-tab queue (`Me`, `Unassigned`, `All`), red alert badges, and an operator visibility strip.

**Architecture:** Persist explicit attention state on conversations (`human_attention_required` + reason/timestamps) when escalation decisions happen (skill handover or hot-lead policy). Render Inbox list with deterministic filters and counters backed by server-side aggregate queries. Resolve attention when an operator takes ownership/sends a reply.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Server Actions, Realtime subscriptions, next-intl.

---

## Approach Options

1. **Client-only heuristics (fast, weak):** derive attention from `active_agent='operator' && assignee_id IS NULL` and/or `lead.status='hot'` in loaded page only.
2. **Persisted attention state (recommended):** add explicit attention columns and update them in escalation/runtime flows; use real counts and stable tabs.
3. **Full queue board:** separate operator dashboard with assignment workflows and SLA timers (out of current scope).

**Recommendation:** Option 2. It solves your exact visibility problem without false negatives from pagination/heuristics.

---

## Scope Definition

### Tab behavior (3 tabs)
- `Me`: conversations assigned to current user (`assignee_id = current_user_id`), regardless of platform.
- `Unassigned`: `active_agent = 'operator' AND assignee_id IS NULL`.
- `All`: current full list behavior.

### Red badge behavior
- Show red badge on `Me` tab with exact count of `human_attention_required = true` items assigned to current user.
- Show red badge on `Unassigned` tab with exact count of `human_attention_required = true` + unassigned operator items.
- Show badge in conversation row when `human_attention_required = true`.
- Optional reason chip in row: `Skill Handover` or `Hot Lead`.

### Enterprise-style UX notes
- Keep tabs sticky at top of the list, with compact numeric badges (similar to Linear/Zendesk/Intercom queue tabs).
- `Me` tab is the default landing tab for operator users.
- Keep row metadata dense but readable: contact, last preview, relative time, lead chip, attention chip.
- Use color hierarchy: red only for attention-required, neutral for non-critical states.

### Operator visibility
- Add “Operators” strip under tabs with workspace users and active conversation load.
- Show each operator: `name + assigned_open_count`.
- Show `Unassigned queue` count next to strip title.

---

## Task 1: DB Attention State

**Files:**
- Create: `supabase/migrations/00075_conversation_attention_queue.sql`

**Step 1: Add migration (schema)**
- Add columns on `public.conversations`:
  - `human_attention_required BOOLEAN NOT NULL DEFAULT FALSE`
  - `human_attention_reason TEXT NULL CHECK (human_attention_reason IN ('skill_handover','hot_lead'))`
  - `human_attention_requested_at TIMESTAMPTZ NULL`
  - `human_attention_resolved_at TIMESTAMPTZ NULL`

**Step 2: Add indexes**
- `conversations_org_attention_idx` on `(organization_id, human_attention_required, last_message_at DESC)`
- `conversations_org_unassigned_operator_idx` on `(organization_id, active_agent, assignee_id, last_message_at DESC)`

**Step 3: Backfill baseline state**
- For existing rows where `active_agent='operator' AND assignee_id IS NULL`, set:
  - `human_attention_required = TRUE`
  - `human_attention_requested_at = COALESCE(updated_at, now())`

**Step 4: Verify migration compiles**
- Run: `npm run build`
- Expected: build passes.

---

## Task 2: Runtime Escalation Writes Attention State

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Test: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Test: `src/app/api/webhooks/telegram/route.test.ts`

**Step 1: Write failing tests**
- Add expectations that when escalation triggers (`skill_handover` or `hot_lead`), conversation update payload sets:
  - `human_attention_required: true`
  - `human_attention_reason`
  - `human_attention_requested_at`
  - `human_attention_resolved_at: null`

**Step 2: Run focused tests (expect fail)**
- Run: `npx vitest run src/lib/channels/inbound-ai-pipeline.test.ts src/app/api/webhooks/telegram/route.test.ts`

**Step 3: Implement minimal code**
- In both runtime paths, after `decideHumanEscalation(...)` returns `shouldEscalate=true`, persist attention fields.
- Keep current `switch_to_operator` logic unchanged.

**Step 4: Run focused tests (expect pass)**
- Same command as step 2.

---

## Task 3: Resolve Attention on Operator Ownership

**Files:**
- Create: `supabase/migrations/00076_send_operator_message_resolves_attention.sql`
- Modify: `src/lib/inbox/actions.ts`
- Test: `src/lib/inbox/actions.test.ts`

**Step 1: Update RPC function in migration**
- Replace `send_operator_message(...)` so conversation update also sets:
  - `human_attention_required = FALSE`
  - `human_attention_resolved_at = NOW()`
  - `human_attention_reason = NULL`

**Step 2: Update manual agent switch handling**
- In `setConversationAgent(conversationId, 'bot')`, also clear attention fields.

**Step 3: Add/extend tests**
- Validate returned `conversation` shape includes resolved attention fields after operator send.

**Step 4: Run focused tests**
- Run: `npx vitest run src/lib/inbox/actions.test.ts`

---

## Task 4: Inbox Data Model + Query Layer

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/inbox/actions.ts`
- Create: `src/lib/inbox/operator-roster.ts`
- Test: `src/lib/inbox/operator-roster.test.ts`

**Step 1: Extend `Conversation` type**
- Add new attention fields to conversation interface.

**Step 2: Include fields in `getConversations(...)`**
- Ensure both nested and fallback paths carry attention fields.

**Step 3: Add server action helper for operator roster**
- Build helper that returns:
  - workspace operators (`organization_members` + `profiles`)
  - active assignment counts per operator
  - unassigned operator queue count

**Step 4: Add tests**
- Unit test roster aggregation logic.

---

## Task 5: Inbox UI (3 Tabs + Attention Badges + Operator Strip)

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Create: `src/components/inbox/conversationQueueFilters.ts`
- Test: `src/components/inbox/conversationQueueFilters.test.ts`
- Modify: `src/app/[locale]/(dashboard)/inbox/page.tsx`

**Step 1: Add filter helper + tests (TDD)**
- Filters for `me`, `unassigned`, `all`.
- Sorting rule unchanged (latest message first).

**Step 2: Add tab state + badges in list header**
- Add 3 top tabs.
- `Me` tab uses count badge (+ red variant for attention-required subset).
- `Unassigned` tab shows count badge (+ red variant for attention-required subset).

**Step 3: Render conversation row attention indicator**
- If `human_attention_required`, show red badge/chip and optional reason label.

**Step 4: Render operator strip**
- Show operator chips (`name`, `assigned_open_count`), plus unassigned queue summary.

**Step 5: Keep mobile behavior stable**
- Tabs + strip should fit mobile width (horizontal scroll if needed).

---

## Task 6: i18n + Copy

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add keys**
- Tab labels: `queueAttention`, `queueUnassigned`, `queueAll`
- Badge text: `attentionRequired`, `attentionReasonSkill`, `attentionReasonHotLead`
- Operator strip: `operatorsTitle`, `unassignedQueue`, `noOperators`

**Step 2: Validate i18n parity**
- Run: `node scripts/i18n/check-i18n.mjs`

---

## Task 7: Verification + Docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run full verification**
- `npx vitest run src/lib/channels/inbound-ai-pipeline.test.ts src/app/api/webhooks/telegram/route.test.ts src/lib/inbox/actions.test.ts src/components/inbox/conversationQueueFilters.test.ts src/lib/inbox/operator-roster.test.ts`
- `node scripts/i18n/check-i18n.mjs`
- `npm run build`

**Step 2: Update docs**
- ROADMAP: add completed queue visibility items.
- PRD: document tab rules + attention semantics.
- RELEASE: Added/Changed/Fixed entries.

---

## Acceptance Criteria
- Human-handover-needed conversations are visible via row-level red markers in all tabs and badge counters in `Me`/`Unassigned`.
- `Unassigned` tab reliably lists operator-active conversations without assignee.
- Hot-lead based escalations appear in attention queue when policy triggers.
- Operator roster is visible in Inbox with assignment load.
- No regression in realtime updates and current Inbox flows.

## Commit Sequence (recommended)
1. `feat(phase-6): add conversation attention state for handover queue`
2. `feat(phase-6): persist escalation attention flags in inbound runtimes`
3. `feat(phase-6): add inbox attention/unassigned/all tabs with badges`
4. `feat(phase-6): add operator roster strip for assignment visibility`
5. `docs: update roadmap prd and release for inbox attention queue`
