# Social Contact Avatars Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist and render customer avatars from supported social channels so Inbox shows profile photos when available and falls back to initials otherwise.

**Architecture:** Add a channel-agnostic `contact_avatar_url` field on `conversations`, populate it through inbound channel hydration, and render it through the shared Avatar primitive. Keep the behavior best-effort: Instagram and Telegram try to hydrate, WhatsApp remains initials-only unless a supported avatar source is present.

**Tech Stack:** Next.js App Router, Supabase/Postgres migrations, Vitest, Meta Instagram Graph API, Telegram Bot API.

---

### Task 1: Define schema and shared types

**Files:**
- Create: `supabase/migrations/00087_conversation_contact_avatar.sql`
- Modify: `src/types/database.ts`

**Steps:**
1. Add a nullable `contact_avatar_url` column to `conversations`.
2. Extend the shared `Conversation` type so server actions and UI receive the new field.
3. Keep inserts/updates backward-compatible by leaving the field nullable.

### Task 2: Add failing tests for avatar hydration

**Files:**
- Modify: `src/lib/instagram/client.test.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Modify: `src/lib/inbox/actions.test.ts`

**Steps:**
1. Add a failing Instagram client test that expects user profile requests to ask for avatar-capable fields and expose `profile_picture_url` when returned.
2. Add a failing inbound pipeline test that expects `contact_avatar_url` to be persisted on conversation update/create when provided.
3. Add a failing Inbox actions test that expects hydrated Instagram conversations to update both `contact_name` and `contact_avatar_url`.

### Task 3: Implement best-effort avatar hydration

**Files:**
- Modify: `src/lib/instagram/client.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`
- Modify: `src/lib/telegram/client.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/lib/inbox/actions.ts`

**Steps:**
1. Extend Instagram user profile fetching so avatar URL is requested when supported by the response.
2. Allow the inbound AI pipeline to accept and persist `contactAvatarUrl`.
3. Resolve Instagram sender avatar on webhook ingest and pass it into the pipeline.
4. Add Telegram best-effort avatar lookup using Bot API profile photo endpoints and pass the resolved URL into conversation create/update.
5. Update Inbox hydration so unresolved Instagram contacts can backfill avatar URLs together with display names.

### Task 4: Render avatars in the Inbox UI

**Files:**
- Modify: `src/design/primitives.tsx`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `src/components/inbox/ConversationList.tsx`
- Modify: `src/components/inbox/DetailsPanel.tsx`
- Modify: `src/components/inbox/ChatWindow.tsx`

**Steps:**
1. Teach the shared Avatar primitive to render `img` when a trusted URL exists and keep initials as fallback.
2. Pass `contact_avatar_url` through the active Inbox surfaces so list, header, details, and contact message bubbles stay visually consistent.
3. Preserve current initials/color behavior when no avatar is available or the image fails.

### Task 5: Verify and update project docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Run targeted tests for avatar-related behavior.
2. Run `npm run build`.
3. Update roadmap, PRD tech decisions/scope notes, and release notes to reflect social avatar support.
