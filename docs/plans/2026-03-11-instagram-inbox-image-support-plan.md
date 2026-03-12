# Instagram Inbox Image Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let Inbox users view inbound Instagram DM images and send outbound Instagram images from the same composer flow used for WhatsApp attachments.

**Architecture:** Reuse the existing Inbox media metadata/rendering path instead of building an Instagram-only viewer. Extend Instagram webhook parsing so image attachments are persisted as message metadata, add an Instagram client send-image method plus server actions for upload/send, and make the composer attachment UX branch by platform (`whatsapp` full attachment set, `instagram` image-only).

**Tech Stack:** Next.js App Router, Supabase Storage + server actions, Instagram Messaging API, next-intl, Vitest.

---

### Task 1: Add failing tests for Instagram media behavior

**Files:**
- Modify: `src/lib/instagram/webhook.test.ts`
- Modify: `src/components/inbox/messageMedia.test.ts`
- Modify: `src/lib/instagram/client.test.ts`
- Modify: `src/lib/inbox/actions.test.ts`

**Step 1: Write the failing tests**
- Assert Instagram webhook parsing returns image attachment metadata instead of placeholder-only text.
- Assert Inbox media metadata extraction recognizes Instagram image metadata.
- Assert Instagram client can send image payloads.
- Assert Inbox server actions can send Instagram images and persist media metadata.

**Step 2: Run RED**
- Run: `npm test -- --run src/lib/instagram/webhook.test.ts src/components/inbox/messageMedia.test.ts src/lib/instagram/client.test.ts src/lib/inbox/actions.test.ts`

**Step 3: Confirm failures are feature gaps**
- Verify failures point to missing Instagram image metadata/send support, not broken test scaffolding.

### Task 2: Implement inbound Instagram image persistence for Inbox

**Files:**
- Modify: `src/lib/instagram/webhook.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`
- Modify: `src/components/inbox/messageMedia.ts`

**Step 1: Extend webhook normalization**
- Parse `message.attachments` into structured image metadata.
- Preserve caption text when present so media + caption render as a single message.
- Keep non-image/system events on the existing skip-automation path.

**Step 2: Persist message metadata for Inbox rendering**
- Write Instagram media metadata into inbound message payloads in the same shape the Inbox renderer can consume.
- Mark placeholder-only media turns so gallery grouping and preview rules still work.

**Step 3: Verify GREEN**
- Re-run the Task 1 test command and confirm inbound/media parsing cases pass.

### Task 3: Add outbound Instagram image transport and server actions

**Files:**
- Modify: `src/lib/instagram/client.ts`
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/inbox/outbound-media.ts`
- Modify: `src/lib/inbox/outbound-media.test.ts`

**Step 1: Add image send transport**
- Add `sendImage` in `InstagramClient` using the same `/messages` endpoint family as text sends.

**Step 2: Add Instagram upload/send action path**
- Reuse Supabase signed uploads for public image URLs.
- Validate Instagram attachments as image-only.
- Persist outbound message metadata so optimistic states and final Inbox rendering stay consistent.

**Step 3: Verify targeted server/client tests**
- Run: `npm test -- --run src/lib/instagram/client.test.ts src/lib/inbox/actions.test.ts src/lib/inbox/outbound-media.test.ts`

### Task 4: Wire Inbox composer UX for Instagram images

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Make attachment UX platform-aware**
- Allow WhatsApp to keep image+document behavior.
- Allow Instagram to pick/send image attachments only.
- Keep unsupported platforms blocked with localized errors.

**Step 2: Reuse optimistic media rendering**
- Use the same pending preview cards, modal, optimistic timeline entries, and failure states for Instagram image sends.

**Step 3: Verify UI-related tests indirectly through helper coverage**
- Ensure translation files stay mirrored and attachment error copy reflects Instagram support.

### Task 5: Update product docs and verify the full change

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**
- Mark Instagram Inbox image receive/send support in roadmap and release notes.
- Document the implementation decision in PRD tech decisions if behavior changed.

**Step 2: Required verification**
- Run: `npm test -- --run src/lib/instagram/webhook.test.ts src/components/inbox/messageMedia.test.ts src/lib/instagram/client.test.ts src/lib/inbox/actions.test.ts src/lib/inbox/outbound-media.test.ts`
- Run: `npm test -- --run src/lib/ai/followup.test.ts`
- Run: `npm test -- --run src/lib/ai/response-guards.test.ts`
- Run: `npm run build`

**Step 3: Final sanity**
- Confirm no i18n key drift and that Inbox still handles WhatsApp attachments unchanged.
