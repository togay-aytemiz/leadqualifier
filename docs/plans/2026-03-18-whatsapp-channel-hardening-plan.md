# WhatsApp Channel Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop WhatsApp connection flows from reporting success before webhook setup is actually ready, and route BSP migration through the correct guided Meta flow.

**Architecture:** Keep the existing onboarding shell, but harden the server-side WhatsApp channel provisioning contract around a single readiness model. Persist webhook provisioning metadata in `channels.config`, switch brittle UI success states to readiness-aware badges/banners, and stop the BSP migration CTA from opening the generic OAuth asset-discovery path.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, next-intl, Meta Graph API via existing `WhatsAppClient`

---

### Task 1: Lock the broken readiness behavior with failing tests

**Files:**
- Modify: `src/lib/channels/actions.test.ts`
- Modify: `src/components/channels/channelCards.test.ts`

**Step 1: Write the failing server-action tests**

Add assertions that WhatsApp channel writes:
- persist webhook readiness metadata for manual and embedded signup flows
- stop pretending a missing override token must skip webhook callback override
- include webhook verification state in debug output

**Step 2: Run the focused action test to verify it fails**

Run: `npm test -- --run src/lib/channels/actions.test.ts`

**Step 3: Write the failing UI/helper test**

Add a card/config test showing that a WhatsApp channel without verified webhook metadata is not counted as fully ready.

**Step 4: Run the focused UI test to verify it fails**

Run: `npm test -- --run src/components/channels/channelCards.test.ts`

### Task 2: Implement readiness-aware WhatsApp provisioning

**Files:**
- Create: `src/lib/channels/connection-readiness.ts`
- Modify: `src/lib/channels/actions.ts`

**Step 1: Add a small readiness helper**

Implement helper(s) that:
- read `channels.config`
- classify WhatsApp channels as `ready`, `pending`, or `error`
- expose whether a channel should count as connected in summary cards

**Step 2: Harden server action writes**

In WhatsApp connection actions:
- always persist explicit webhook provisioning metadata
- use the channel verify token for callback override instead of requiring only the global env token
- expose webhook verification/subscription state in debug output

**Step 3: Keep failures explicit**

If provisioning cannot request webhook override, store the pending/error state instead of reporting a silently ready channel.

**Step 4: Re-run focused tests**

Run:
- `npm test -- --run src/lib/channels/actions.test.ts`
- `npm test -- --run src/components/channels/channelCards.test.ts`

### Task 3: Fix onboarding surfaces and migration CTA

**Files:**
- Modify: `src/components/channels/ChannelCard.tsx`
- Modify: `src/components/channels/channelCards.ts`
- Modify: `src/components/channels/WhatsAppOnboardingPage.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Use readiness helper in cards and summary**

Update the channels gallery and summary count so WhatsApp is only shown as fully connected when webhook readiness is confirmed.

**Step 2: Surface pending/error messaging**

Show a pending or needs-attention badge/banner for WhatsApp channels that still require webhook verification or provisioning follow-up.

**Step 3: Route BSP migration to embedded signup**

Replace the BSP migration CTA so it starts the existing-number Embedded Signup flow instead of the generic WhatsApp OAuth popup.

**Step 4: Re-run targeted UI tests**

Run:
- `npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/whatsappOnboarding.test.ts`

### Task 4: Update docs and verify

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the hardened connection contract**

Record that WhatsApp onboarding now distinguishes between asset attachment and webhook-ready status, and that BSP migration uses guided Meta signup instead of generic OAuth discovery.

**Step 2: Run verification**

Run:
- `npm test -- --run src/lib/channels/actions.test.ts src/components/channels/channelCards.test.ts src/components/channels/whatsappOnboarding.test.ts src/app/api/webhooks/whatsapp/route.test.ts src/lib/channels/meta-oauth.test.ts src/lib/channels/meta-embedded-signup.test.ts src/lib/whatsapp/client.test.ts src/lib/whatsapp/webhook.test.ts`
- `npm run build`

**Step 3: Prepare commit message**

Use:
- `fix(phase-2): harden whatsapp channel readiness`
