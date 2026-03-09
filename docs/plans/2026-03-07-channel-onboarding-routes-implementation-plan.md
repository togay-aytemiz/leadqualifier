# Channel Onboarding Routes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace modal-first channel connect flows with dedicated onboarding routes under Settings > Channels so each channel has a clearer, channel-specific setup experience.

**Architecture:** Keep the channel gallery as the discovery screen, but route `Connect` into per-channel setup pages. Use a shared channel catalog for gallery metadata and onboarding metadata so copy, resources, tone, badges, and route slugs stay in one place. Move WhatsApp and Telegram onboarding logic into dedicated client surfaces and expose placeholder onboarding pages for Instagram and Messenger.

**Tech Stack:** Next.js App Router, React client/server components, Tailwind CSS, next-intl, Vitest, existing server actions.

---

### Task 1: Lock shared onboarding catalog behavior with failing tests

**Files:**
- Create: `src/components/channels/channelCatalog.test.ts`
- Create: `src/components/channels/channelCatalog.ts`
- Modify: `src/components/channels/channelCards.ts`

**Scope:**
- Add a shared catalog for supported channel setup pages (`whatsapp`, `telegram`, `instagram`, `messenger`).
- Write tests first for ordering, slugs, onboarding availability, route hrefs, and gallery presentation metadata.
- Refactor gallery config generation to consume this catalog.

### Task 2: Build the shared channel onboarding shell

**Files:**
- Create: `src/components/channels/ChannelOnboardingShell.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Scope:**
- Create a reusable detail-page layout with:
  - back link
  - left information rail
  - icon/title/description
  - optional resource links
  - right-side onboarding content area
- Add localized copy for headings, resource labels, generic onboarding labels, and placeholder states.

### Task 3: Move WhatsApp onboarding into a dedicated page client

**Files:**
- Create: `src/components/channels/WhatsAppOnboardingPage.tsx`
- Modify: `src/components/channels/ConnectWhatsAppModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/channels/[channel]/page.tsx`

**Scope:**
- Reuse the current Meta Embedded Signup / legacy fallback logic in a page component instead of keeping it only inside a modal.
- Keep the existing current-number vs new-number vs existing-assets branching, but render it as a route page with more space and clearer selection UI.
- Change the gallery connect button to navigate to `/settings/channels/whatsapp` instead of opening the modal directly.

### Task 4: Move Telegram onboarding into a dedicated page client

**Files:**
- Create: `src/components/channels/TelegramOnboardingPage.tsx`
- Modify: `src/components/channels/ConnectTelegramModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`

**Scope:**
- Render Telegram instructions and token form directly on the route page.
- Support simple entry choices like `create a new bot` vs `connect an existing bot`, while both converge on the same token submission flow.
- Keep existing connect behavior and server action usage.

### Task 5: Add placeholder onboarding pages for Instagram and Messenger

**Files:**
- Create: `src/components/channels/InstagramOnboardingPage.tsx`
- Create: `src/components/channels/MessengerOnboardingPage.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: `src/components/channels/ChannelCard.tsx`

**Scope:**
- Make channel detail routes available even for launch-gated channels.
- Keep gallery CTA behavior reasonable:
  - active channels route to setup pages
  - launch-gated channels can open a detail page with status + guidance instead of pretending they are connectable

### Task 6: Verification and docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Commands:**
- `npm test -- --run src/components/channels/channelCatalog.test.ts`
- `npm test -- --run src/components/channels/channelCards.test.ts`
- `npm run i18n:check`
- `npm run build`
