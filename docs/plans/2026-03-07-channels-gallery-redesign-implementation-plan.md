# Channels Gallery Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Settings > Channels into a respond.io-style channel gallery with stronger card hierarchy, better color treatment, and clearer connect actions without changing existing connect/disconnect behavior.

**Architecture:** Keep the existing channel connect modals, server actions, and card ordering logic, but move visual metadata into channel-card helpers and render cards in a responsive grid with section headings, badges, tinted gradients, and richer connected-state footers. Preserve current WhatsApp/Telegram functionality and current Instagram/Messenger placeholders.

**Tech Stack:** Next.js App Router, React client components, Tailwind utility classes, next-intl translations, Vitest.

---

### Task 1: Add failing tests for gallery metadata and grid layout

**Files:**
- Modify: `src/components/channels/channelCards.test.ts`
- Modify: `src/components/channels/channelCards.ts`

**Scope:**
- Assert the channels layout now returns responsive grid classes instead of a stacked flex list.
- Assert channel metadata exposes the gallery section and visual flags needed for the new card surface.

### Task 2: Expand channel card metadata for visual presentation

**Files:**
- Modify: `src/components/channels/channelCards.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Scope:**
- Add presentational metadata per card: section label, description key, accent treatment, optional badge.
- Add localized badge and channel description copy.

### Task 3: Rebuild `ChannelCard` into a gallery card surface

**Files:**
- Modify: `src/components/channels/ChannelCard.tsx`

**Scope:**
- Replace the current row layout with a responsive card matching the respond.io reference more closely:
  - soft tinted gradient background
  - absolute badge chip
  - top-right platform icon
  - title + description copy
  - divider
  - footer actions aligned to the right
- Preserve disconnect/template/debug actions for connected channels.

### Task 4: Update `ChannelsList` and page shell for the new gallery

**Files:**
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`

**Scope:**
- Render the business-messaging section heading above the grid.
- Widen the settings shell so the gallery can breathe on desktop.
- Keep modals and popup messaging behavior unchanged.

### Task 5: Verification and docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Commands:**
- `npm test -- --run src/components/channels/channelCards.test.ts`
- `npm run i18n:check`
- `npm run build`
