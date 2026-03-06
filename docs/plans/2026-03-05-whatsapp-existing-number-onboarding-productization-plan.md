# WhatsApp Existing-Number Onboarding Productization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let WhatsApp Business users connect their real business number to the product without requiring pre-existing Cloud API assets, while preserving a fallback path for users who already completed Meta asset setup.

**Architecture:** Keep Meta Cloud API as the runtime, but replace the current blind asset-discovery OAuth entry with a guided WhatsApp connect modal that supports two real onboarding modes: Meta Embedded Signup for new/existing numbers, and legacy OAuth asset discovery only for users who already have a ready WABA + phone number in Meta. Concierge remains a fallback, not the primary implementation.

**Tech Stack:** Next.js App Router, React client components, Supabase Postgres + RLS, next-intl TR/EN, existing channel settings surfaces, Meta OAuth routes.

---

### Task 1: Lock the revised product decision in docs before code changes

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`
- Create: `docs/plans/2026-03-05-whatsapp-existing-number-onboarding-productization-plan.md`

**Notes:**
- Record the MVP decision as `embedded-signup first`.
- State explicitly that current server OAuth is only an asset-discovery fallback, not the primary onboarding path.
- Keep concierge as fallback for blocked/unready users, not the main happy path.

### Task 2: Replace the current WhatsApp connect CTA with a three-path onboarding modal

**Files:**
- Modify: `src/components/channels/ConnectWhatsAppModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: `src/components/channels/ChannelCard.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: `src/components/channels/channelCards.test.ts`

**Scope:**
- Replace the current blind connect button with explicit paths:
  - `Use my current WhatsApp Business number`
  - `Use a new number`
  - `I already have Meta Cloud API assets`
- Route the first two paths to Embedded Signup when config is available.
- Route the third path to the current server OAuth asset-discovery flow.
- Show an existing-number prep checklist:
  - WhatsApp Business app is active on the main phone
  - latest app version is installed
  - QR-capable primary device is available during setup
  - user can create/select a Meta business portfolio during signup

### Task 3: Add Embedded Signup client parsing and launch support

**Files:**
- Create: `src/lib/channels/meta-embedded-signup.ts`
- Create: `src/lib/channels/meta-embedded-signup.test.ts`
- Modify: `src/components/channels/ConnectWhatsAppModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`

**Scope:**
- Load the Meta JavaScript SDK only for WhatsApp connect.
- Start Facebook Login for Business / Embedded Signup using app-level configuration id.
- Parse Meta `postMessage` events safely and capture:
  - `FINISH` with `phone_number_id` + `waba_id`
  - `CANCEL`
  - `ERROR`
- Distinguish trusted Meta origins from untrusted window messages.

### Task 4: Add backend completion action for Embedded Signup

**Files:**
- Modify: `src/lib/channels/actions.ts`
- Modify: `src/lib/channels/actions.test.ts`
- Modify: `src/types/database.ts`

**Scope:**
- Accept the Embedded Signup auth code plus returned `waba_id` and `phone_number_id`.
- Exchange the auth code for a long-lived access token.
- Fetch phone details and upsert the WhatsApp channel directly from embedded-signup output.
- Reuse existing trial fingerprint enforcement and channel naming behavior.

### Task 5: Keep current OAuth flow as explicit fallback for asset-ready users

**Files:**
- Modify: `src/app/api/channels/meta/start/route.ts`
- Modify: `src/app/api/channels/meta/callback/route.ts`
- Modify: `src/lib/channels/meta-oauth.ts`
- Modify: `src/lib/channels/meta-oauth.test.ts`

**Scope:**
- Keep the current discovery flow intact for users who already have accessible WABA assets.
- Rename its UI copy so users understand it is for pre-existing Meta Cloud API setups.
- Avoid treating this fallback as the default path for ordinary SMBs.

### Task 6: Add customer-facing guidance and config gating

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Scope:**
- Add precise statuses for:
  - embedded signup unavailable
  - embedded signup cancelled
  - embedded signup failed
  - embedded signup completed
  - legacy asset connect
- Document required env/config:
  - `META_APP_ID`
  - `META_APP_SECRET`
  - `NEXT_PUBLIC_META_APP_ID`
  - `NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
- Document the operator-side Meta setup needed before rollout.

### Task 7: Concierge fallback for blocked/unready users

**Files:**
- Modify: `src/components/channels/ConnectWhatsAppModal.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Scope:**
- If Embedded Signup config is unavailable or the user is not ready, show deterministic next-step guidance instead of a dead-end Meta redirect.
- Concierge can remain copy-only in this iteration; do not block self-serve implementation on a full onboarding queue.

### Task 8: Verification

**Commands:**
- `npm test -- --run src/lib/channels/meta-embedded-signup.test.ts`
- `npm test -- --run src/lib/channels/actions.test.ts`
- `npm test -- --run src/lib/channels/meta-oauth.test.ts`
- `npm run build`

### Recommended commit sequence

**Commits:**
- `docs(phase-2): revise whatsapp onboarding strategy around embedded signup`
- `feat(phase-2): add whatsapp embedded signup connect flow`
- `feat(phase-2): add embedded signup completion route`
- `feat(phase-2): clarify legacy meta asset connect fallback`
