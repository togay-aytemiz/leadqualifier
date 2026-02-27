# Inbox Outbound Media Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Inbox operators to send WhatsApp text + image/document attachments (up to 10 items) with pre-send preview/removal and optimistic async UI states.

**Architecture:** Keep the existing `send_operator_message` persistence flow and extend it with a media batch action. Client uploads files to Supabase Storage using signed upload URLs, then server action sends media to WhatsApp Cloud API and updates persisted message metadata to the existing `metadata.whatsapp_media` shape used by Inbox rendering.

**Tech Stack:** Next.js 14 App Router, Supabase (server + storage), WhatsApp Cloud API, next-intl, Vitest.

---

### Task 1: Add WhatsApp outbound media request support

**Files:**
- Modify: `src/lib/whatsapp/client.ts`
- Test: `src/lib/whatsapp/client.test.ts`

**Step 1: Write failing tests**
- Add tests asserting outbound payload for:
  - `sendImage` (with optional caption)
  - `sendDocument` (with optional caption + filename)

**Step 2: Run tests to verify RED**
- Run: `npm run test -- src/lib/whatsapp/client.test.ts`

**Step 3: Minimal implementation**
- Add `sendImage` and `sendDocument` methods in WhatsApp client.
- Reuse existing request helper.

**Step 4: Verify GREEN**
- Run the same test command and confirm pass.

### Task 2: Add Inbox media validation and helper logic

**Files:**
- Create: `src/lib/inbox/outbound-media.ts`
- Create: `src/lib/inbox/outbound-media.test.ts`

**Step 1: Write failing tests**
- Validate max attachment count (10).
- Validate per-file size / mime / type mapping (image vs document).
- Validate caption resolution behavior for first attachment.

**Step 2: Run RED**
- Run: `npm run test -- src/lib/inbox/outbound-media.test.ts`

**Step 3: Implement minimal helpers**
- Add constants, type mapping, and validation error codes.

**Step 4: Run GREEN**
- Re-run test file.

### Task 3: Add server actions for upload targets + batch send/persist

**Files:**
- Modify: `src/lib/inbox/actions.ts`

**Step 1: Write failing tests (targeted where practical)**
- At minimum, cover helper-level behavior in Task 2 and client payload tests in Task 1.

**Step 2: Implement server actions**
- Add action to prepare signed upload URLs (auth + tenant check + WhatsApp context checks).
- Add action to send media batch in order and persist each message row with metadata:
  - `whatsapp_media.type`
  - `storage_url`, `storage_path`, `mime_type`, `filename`, `caption`, `download_status`
  - `whatsapp_message_id`
  - optimistic status metadata (`whatsapp_outbound_status`)
- Keep existing text-only `sendMessage` path intact.

**Step 3: Verify action behavior manually via integration in UI task**

### Task 4: Implement Inbox composer attachment UX + optimistic send

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`

**Step 1: Add pre-send attachment state/UI**
- Add hidden file input + open via paperclip/image icons.
- Show pending attachment cards above composer.
- Add remove action and preview modal.

**Step 2: Add optimistic send flow**
- Insert temp messages immediately with sending status.
- Upload files via signed URLs asynchronously.
- Call batch send action.
- Replace optimistic messages via realtime/refresh; set failed state when needed.

**Step 3: Add guardrails**
- Disable send when empty (no text + no attachment) or blocked by WhatsApp reply window.
- Show localized validation/send errors.

### Task 5: Add translations and release docs

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add mirrored TR/EN keys**
- Attachment picker labels, limits, errors, preview, sending states.

**Step 2: Update product docs**
- Add implementation notes and roadmap checkboxes.

### Task 6: Verification

**Files:**
- N/A

**Step 1: Targeted tests**
- `npm run test -- src/lib/whatsapp/client.test.ts src/lib/inbox/outbound-media.test.ts`

**Step 2: Global checks**
- `npm run i18n:check`
- `npm run build`

**Step 3: Final sanity**
- Ensure no translation key drift and no TypeScript errors.
