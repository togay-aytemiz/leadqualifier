# Skill Image Delivery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional single-image support to skills so matched skills send text first and image second across supported channels, with loading states in the editor and simulator parity.

**Architecture:** Persist one image metadata payload directly on `skills`, store normalized `WebP` files in Supabase Storage, and extend the shared inbound AI pipeline to send a second outbound media message after the existing skill text. Reuse the existing signed-upload and media-preview patterns already used for profile avatars and outbound Inbox attachments, while preserving human handover semantics.

**Tech Stack:** Next.js App Router, React 19, next-intl, Supabase Postgres + Storage, Vitest

---

### Task 1: Plan the database and shared types

**Files:**
- Create: `supabase/migrations/00110_skill_images.sql`
- Modify: `src/types/database.ts`
- Test: `src/lib/skills/actions.test.ts`

**Step 1: Write the failing test**

Add a server-actions test that expects skill rows to include image metadata fields and verifies save/update helpers persist them.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/skills/actions.test.ts`

Expected: FAIL because skill image fields and save helpers do not exist yet.

**Step 3: Write minimal implementation**

- Add nullable image metadata columns to `skills`
- Extend `Skill`, `SkillInsert`, and `SkillUpdate`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/skills/actions.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/00110_skill_images.sql src/types/database.ts src/lib/skills/actions.test.ts
git commit -m "feat(phase-3): add skill image schema support"
```

### Task 2: Add client-side validation and WebP conversion helpers

**Files:**
- Create: `src/lib/skills/image.ts`
- Create: `src/lib/skills/image-client.ts`
- Create: `src/lib/skills/image-client.test.ts`

**Step 1: Write the failing test**

Cover:
- allowed mime types
- `5 MB` max original size
- output mime type `image/webp`
- resize without upscaling
- quality floor configuration exposed as constants

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/skills/image-client.test.ts`

Expected: FAIL because helpers do not exist.

**Step 3: Write minimal implementation**

- Shared constants for size/format/path naming
- Browser conversion helper using canvas
- Validation helper for accepted file types and max bytes

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/skills/image-client.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/skills/image.ts src/lib/skills/image-client.ts src/lib/skills/image-client.test.ts
git commit -m "feat(phase-3): add skill image upload helpers"
```

### Task 3: Add signed upload preparation and asset persistence helpers

**Files:**
- Modify: `src/lib/skills/actions.ts`
- Create: `src/lib/skills/actions.image.test.ts`

**Step 1: Write the failing test**

Cover:
- signed upload preparation returns `.webp` storage path and public URL
- save helper persists metadata
- replace removes old object after successful save
- failed persistence cleans up the new object

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/skills/actions.image.test.ts`

Expected: FAIL because upload preparation and persistence helpers do not exist.

**Step 3: Write minimal implementation**

- add `prepareSkillImageUpload`
- add `saveSkillImageUpload`
- add cleanup helpers for replacement/delete

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/skills/actions.image.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/skills/actions.ts src/lib/skills/actions.image.test.ts
git commit -m "feat(phase-3): persist skill image assets"
```

### Task 4: Add Skills editor UI, preview, remove, and loading states

**Files:**
- Modify: `src/components/skills/SkillsContainer.tsx`
- Create: `src/components/skills/SkillImageCard.tsx`
- Create: `src/components/skills/SkillsContainer.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

Cover:
- upload UI renders helper copy
- loading state is shown while image is processing/uploading
- remove/replace controls render correctly
- save payload includes image metadata

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/skills/SkillsContainer.test.tsx`

Expected: FAIL because the image UI and loading state do not exist.

**Step 3: Write minimal implementation**

- add single-image preview card
- wire file selection -> validation -> conversion -> signed upload -> persistence
- expose localized loading strings and disable conflicting actions while processing

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/skills/SkillsContainer.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/skills/SkillsContainer.tsx src/components/skills/SkillImageCard.tsx src/components/skills/SkillsContainer.test.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-3): add skill image editor with loading state"
```

### Task 5: Extend outbound contract and shared AI pipeline

**Files:**
- Modify: `src/lib/channels/outbound-message.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

**Step 1: Write the failing test**

Cover:
- matched skill sends text first and image second
- image failure does not suppress text persistence
- `requires_human_handover=true` still escalates after media attempt

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`

Expected: FAIL because outbound media and sequencing are not supported.

**Step 3: Write minimal implementation**

- extend outbound message contract for images
- send/persist text first, then image
- add safe failure handling and preserve handover order

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/channels/outbound-message.ts src/lib/channels/inbound-ai-pipeline.ts src/lib/channels/inbound-ai-pipeline.test.ts
git commit -m "feat(phase-3): add sequential skill image delivery"
```

### Task 6: Extend channel adapters and Inbox media parsing

**Files:**
- Modify: `src/lib/whatsapp/client.ts`
- Modify: `src/lib/instagram/client.ts`
- Modify: `src/lib/telegram/client.ts`
- Modify: `src/components/inbox/messageMedia.ts`
- Modify: `src/components/inbox/messageMedia.test.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`

**Step 1: Write the failing test**

Cover:
- telegram can send images
- instagram/whatsapp outbound adapter accepts media payloads
- inbox media parser recognizes telegram media metadata

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/messageMedia.test.ts src/lib/whatsapp/client.test.ts src/lib/instagram/client.test.ts`

Expected: FAIL because shared outbound image handling is incomplete.

**Step 3: Write minimal implementation**

- add `sendImage` to Telegram client
- teach route adapters to handle text and image payloads
- parse `telegram_media` metadata for preview surfaces

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/inbox/messageMedia.test.ts src/lib/whatsapp/client.test.ts src/lib/instagram/client.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/telegram/client.ts src/components/inbox/messageMedia.ts src/components/inbox/messageMedia.test.ts src/app/api/webhooks/instagram/route.ts
git commit -m "feat(phase-3): support skill image delivery across channels"
```

### Task 7: Add simulator text-then-image rendering

**Files:**
- Modify: `src/lib/chat/actions.ts`
- Modify: `src/components/chat/ChatBubble.tsx`
- Modify: `src/components/chat/ChatSimulator.tsx`
- Modify: `src/components/chat/ChatSimulator.test.ts`

**Step 1: Write the failing test**

Cover:
- simulation response exposes image metadata
- simulator renders a text bubble followed by an image bubble
- typing/loading state remains coherent while the extra message is inserted

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/chat/ChatSimulator.test.ts`

Expected: FAIL because simulator only supports text bubbles.

**Step 3: Write minimal implementation**

- extend simulation response with optional skill image payload
- append a second system message when the matched skill has an image
- render image bubble content cleanly

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/chat/ChatSimulator.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/chat/actions.ts src/components/chat/ChatBubble.tsx src/components/chat/ChatSimulator.tsx src/components/chat/ChatSimulator.test.ts
git commit -m "feat(phase-3): mirror skill image replies in simulator"
```

### Task 8: Verify, document, and release

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run:

```bash
npm test -- --run src/lib/skills/actions.test.ts src/lib/skills/actions.image.test.ts src/lib/skills/image-client.test.ts src/lib/channels/inbound-ai-pipeline.test.ts src/components/inbox/messageMedia.test.ts src/components/chat/ChatSimulator.test.ts
```

Expected: PASS

**Step 2: Run build verification**

Run:

```bash
npm run build
```

Expected: PASS

**Step 3: Update docs**

- mark roadmap items done
- add PRD update note + tech decision
- add release notes under `[Unreleased]`

**Step 4: Commit**

```bash
git add docs/PRD.md docs/ROADMAP.md docs/RELEASE.md
git commit -m "docs: record skill image delivery release notes"
```
