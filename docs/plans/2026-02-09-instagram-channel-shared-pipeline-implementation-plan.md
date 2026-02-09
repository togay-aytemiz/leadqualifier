# Instagram Channel + Shared Inbound Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Instagram as an independent channel (like Telegram/WhatsApp), with separate webhook endpoint and shared AI reply pipeline logic.

**Architecture:** Keep channel webhook routes separate (`/api/webhooks/telegram`, `/api/webhooks/whatsapp`, `/api/webhooks/instagram`) and extract inbound AI processing into a shared channel-agnostic function. WhatsApp and Instagram will use the shared pipeline; Telegram remains behavior-compatible and can migrate later.

**Tech Stack:** Next.js App Router, Supabase, OpenAI GPT-4o-mini, Vitest, next-intl.

---

### Task 1: Add failing tests for Instagram webhook parsing and client behavior

**Files:**
- Create: `src/lib/instagram/webhook.test.ts`
- Create: `src/lib/instagram/client.test.ts`

**Step 1: Write failing parser tests**
- Add tests for: signature validation, text-message extraction, and echo/non-text filtering.

**Step 2: Run tests to verify RED**
- Run: `npx vitest run src/lib/instagram/webhook.test.ts src/lib/instagram/client.test.ts`
- Expected: FAIL (modules/functions not implemented yet).

### Task 2: Implement Instagram client + webhook utilities to make tests pass

**Files:**
- Create: `src/lib/instagram/client.ts`
- Create: `src/lib/instagram/webhook.ts`

**Step 1: Implement minimal parser/signature/client**
- Add `extractInstagramTextMessages`, `buildMetaSignature`, `isValidMetaSignature`.
- Add `InstagramClient` with `sendText` and lightweight account/profile fetch for channel debug.

**Step 2: Run tests to verify GREEN**
- Run: `npx vitest run src/lib/instagram/webhook.test.ts src/lib/instagram/client.test.ts`
- Expected: PASS.

### Task 3: Extract shared inbound AI pipeline and adopt for WhatsApp

**Files:**
- Create: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts`

**Step 1: Move duplicated AI flow into shared function**
- Include: conversation upsert, inbound save, lead extraction gating, skill/KB/fallback reply, escalation.

**Step 2: Wire WhatsApp route to shared pipeline**
- Keep WhatsApp-specific parsing/signature + channel lookup in route.

**Step 3: Run focused checks**
- Run: `npx vitest run src/lib/whatsapp/webhook.test.ts src/lib/whatsapp/client.test.ts`
- Expected: PASS (no behavior regression in utility layer).

### Task 4: Add Instagram channel route + channel settings actions/UI

**Files:**
- Create: `src/app/api/webhooks/instagram/route.ts`
- Modify: `src/lib/channels/actions.ts`
- Create: `src/components/channels/ConnectInstagramModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: `src/components/channels/ChannelCard.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`

**Step 1: Channel action support**
- Add connect/debug support for `instagram` channel type.

**Step 2: Settings UI support**
- Add Instagram channel card + connect modal.
- Increase channel summary total from 2 to 3.

**Step 3: Instagram webhook route**
- Parse/verify events, resolve channel by Instagram business account id, call shared pipeline.

### Task 5: Extend platform/channel types, outbound inbox support, and DB constraints

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `src/components/leads/LeadsTable.tsx`
- Create: `supabase/migrations/00055_add_instagram_channel_support.sql`

**Step 1: Add `instagram` to TS unions and runtime branches**
- `ConversationPlatform`, `Channel.type`, lead extraction source, sendMessage platform branch.

**Step 2: UI platform icon updates**
- Add Instagram icon in Inbox + Leads tables.

**Step 3: DB migration**
- Expand `channels.type` and `conversations.platform` CHECK constraints to include Instagram.

### Task 6: i18n + documentation + verification

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add all new TR/EN keys**
- Channels UI, Instagram modal labels, errors, and type labels.

**Step 2: Update product docs**
- Mark roadmap items, PRD scope/decisions, release notes entries.

**Step 3: Full verification**
- Run: `npm run build`
- Expected: build succeeds with no regressions.

**Step 4: Commit**
- Suggested commit message: `feat(phase-2): add instagram channel with shared inbound ai pipeline`
