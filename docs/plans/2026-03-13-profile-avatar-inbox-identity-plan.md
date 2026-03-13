# Profile Avatar + Inbox Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let each user upload a profile avatar from Settings, convert it to WebP before upload, show it in the sidebar, use it for operator-authored Inbox messages, and give Kualia bot messages a branded visual identity.

**Architecture:** Reuse the existing `profiles.avatar_url` field for per-user avatars instead of adding a new profile column. Store converted avatar files in a dedicated public storage bucket, keep the upload path/versioning server-controlled, and persist only the final public URL in `profiles`. For Inbox, add message-level author attribution so historical operator messages can render the correct sender avatar instead of the current viewer’s identity.

**Tech Stack:** Next.js App Router, Supabase Storage, Supabase Postgres migrations/RPCs, next-intl, Vitest, client-side image conversion with Canvas/Web APIs.

---

## Product assumptions

- Avatar scope is **per user**, not per organization.
- Avatar upload in v1 is **replace-only**; explicit “remove avatar” can wait unless implementation is already trivial.
- Images are converted on the client to a **square WebP** asset before upload.
- Recommended output target: **512x512 WebP**, center-cropped, quality around `0.82`.
- If no avatar exists, fallback stays **initials from full name**; if name is missing, fallback to email-local-part initials.
- Kualia branding change is scoped to **bot message identity in Inbox**, not a full app-wide rebrand.

## Why this approach

### Recommended approach

Persist a real message author (`created_by`) for operator messages, then render that author’s avatar/name in the timeline. This is the only approach that stays correct in multi-operator conversations and on historical messages.

### Faster but weaker alternative

Use the current viewer’s avatar for every `sender_type = 'user'` bubble. This is simpler, but it becomes incorrect as soon as more than one operator writes in the same thread. I do **not** recommend this.

---

### Task 1: Define storage and shared avatar rules

**Files:**
- Create: `supabase/migrations/00088_profile_avatar_bucket.sql`
- Create: `src/lib/profile/avatar.ts`
- Create: `src/lib/profile/avatar.test.ts`

**Steps:**
1. Add a dedicated public storage bucket for profile avatars, e.g. `profile-avatars`, with `image/webp` as the allowed MIME type and a small file-size limit suitable for avatars.
2. Add a shared helper for avatar rules:
   - accepted source MIME types before conversion
   - max original upload size
   - target output size
   - output MIME type (`image/webp`)
   - versioned storage path generation
3. Keep the helper server-safe and unit testable so the upload flow does not spread ad-hoc constants across UI and actions.

### Task 2: Add failing tests for profile avatar plumbing

**Files:**
- Modify: `src/lib/organizations/active-context.test.ts`
- Create: `src/app/[locale]/(dashboard)/settings/profile/ProfileSettingsClient.test.tsx`
- Create: `src/lib/profile/actions.test.ts`

**Steps:**
1. Add a failing `active-context` test expecting the profile query to include `avatar_url` and expose it in the returned context.
2. Add a failing profile-settings client test expecting:
   - current avatar preview to render when `avatar_url` exists
   - initials fallback to render when it does not
   - upload-state copy to be present
3. Add a failing server-action test for the avatar persistence flow:
   - signed upload preparation returns bucket path + upload token
   - successful save updates `profiles.avatar_url`
   - replacing an avatar attempts cleanup of the previous storage object when possible

### Task 3: Implement Settings > Profile avatar upload flow

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/profile/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/profile/ProfileSettingsClient.tsx`
- Modify: `src/lib/profile/actions.ts`
- Create: `src/lib/profile/avatar-client.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Steps:**
1. Update the profile page loader to fetch `avatar_url` together with `full_name` and `email`.
2. Add client-side image preparation:
   - read selected file
   - center-crop to square
   - resize to the target dimension
   - export as WebP blob
3. Use the existing signed-upload pattern:
   - server action prepares upload target
   - client uploads converted blob directly to Supabase Storage
   - server action finalizes by writing the resulting public URL to `profiles.avatar_url`
4. Add UI states for preview, replacing, validation errors, and saving feedback.
5. Add all new copy in TR and EN only through `messages/*.json`.

### Task 4: Feed the user avatar into dashboard identity surfaces

**Files:**
- Modify: `src/lib/organizations/active-context.ts`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/primitives.tsx`

**Steps:**
1. Extend `ActiveOrganizationContext` to expose `userAvatarUrl`.
2. Pass `userAvatarUrl` from dashboard layout into `MainSidebar`.
3. Replace the sidebar footer’s one-letter circle with the shared `Avatar` component so initials and uploaded avatars behave consistently.
4. Ensure sidebar fallback uses two-letter initials, not only the first character.
5. Keep the collapsed sidebar behavior unchanged except for the improved avatar rendering.

### Task 5: Add real operator attribution to messages

**Files:**
- Create: `supabase/migrations/00089_messages_created_by.sql`
- Create: `supabase/migrations/00090_send_operator_message_with_created_by.sql`
- Modify: `src/types/database.ts`
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/inbox/actions.test.ts`

**Steps:**
1. Add a nullable `created_by UUID REFERENCES profiles(id) ON DELETE SET NULL` column to `messages`.
2. Replace/override the `send_operator_message` RPC so it writes `created_by = auth.uid()` for operator-authored messages.
3. Extend shared message typing to include `created_by` and an optional normalized sender preview for UI use.
4. Update message fetch paths (`getMessages`, `getMessagesPage`, and any nested preview query that needs sender identity) so operator messages can resolve `full_name` and `avatar_url`.
5. Add failing then passing tests proving operator messages keep the correct author identity and do not regress existing contact/bot/system handling.

### Task 6: Render operator avatars correctly in Inbox

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `src/components/inbox/ChatWindow.tsx`
- Create: `src/components/inbox/message-sender.ts`
- Create: `src/components/inbox/message-sender.test.ts`

**Steps:**
1. Add a small sender-identity helper that resolves:
   - contact avatar/name
   - operator avatar/name
   - bot identity
   - initials fallback rules
2. Render an avatar for right-aligned operator messages the same way contact messages already show one on the left.
3. Keep the footer label localized:
   - current user can still read as `You`
   - other operators should render their name
4. Handle realtime inserts carefully:
   - optimistic outgoing messages should use the current profile immediately
   - realtime messages from other operators should hydrate sender profile from cache or a lightweight lookup
5. Preserve current behavior for system events and delivery-state indicators.

### Task 7: Add Kualia bot visual identity

**Files:**
- Create: `src/components/inbox/KualiaAvatar.tsx`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `src/components/inbox/ChatWindow.tsx`
- Reuse asset: `public/icon-white.svg`

**Steps:**
1. Create a compact bot avatar component using the existing icon asset inside a dark circular treatment.
2. Style it with a subtle black/graphite gradient and a restrained glow/ring so it reads branded without looking noisy.
3. Use that avatar for `sender_type = 'bot'` bubbles instead of the current plain text badge.
4. Do not introduce purple-specific branding into the new bot identity.

### Task 8: Verify, document, and ship

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Run targeted tests:
   - `npm test -- --run src/lib/profile/avatar.test.ts`
   - `npm test -- --run src/lib/profile/actions.test.ts`
   - `npm test -- --run src/lib/organizations/active-context.test.ts`
   - `npm test -- --run src/lib/inbox/actions.test.ts`
   - `npm test -- --run src/components/inbox/message-sender.test.ts`
2. Run `npm run build`.
3. Update roadmap items under the Inbox/settings area and refresh the `Last Updated` date.
4. Update PRD notes for:
   - per-user profile avatars
   - operator message identity in Inbox
   - Kualia branded bot avatar treatment
5. Add release notes under `[Unreleased]`.

---

## Implementation notes for the engineer

- Converting to WebP reduces **storage and transfer size**, not meaningfully the `profiles` table size; the DB still stores only a URL.
- Avoid storing raw `File` blobs in server actions. Keep the upload path signed server-side, upload client-side.
- Do not make avatar rendering depend on the current viewer for historical user messages.
- Prefer a dedicated `KualiaAvatar` component over sprinkling bot-specific classes inline across multiple chat render branches.
- Keep all new strings translatable and mirrored in `messages/en.json` and `messages/tr.json`.

## Suggested commits

1. `test(phase-3.6): add failing profile avatar and inbox identity coverage`
2. `feat(phase-3.6): add profile avatar upload and sidebar identity`
3. `feat(phase-3.6): attribute operator messages and brand Kualia bubbles`
4. `docs: update avatar identity scope in PRD roadmap and release notes`
