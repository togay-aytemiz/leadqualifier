# WhatsApp Gallery And Existing API Flow Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the channels gallery to a calmer 3-column layout and refine WhatsApp onboarding so the existing-account path matches the respond-style branch structure.

**Architecture:** Keep the gallery changes inside the existing channel card/list layer and remove the settings-style left column wrapper from the channels page. For WhatsApp onboarding, extend the helper-driven state machine so `existing account` has its own decision and migration requirement screens instead of jumping straight into the legacy Meta connect flow.

**Tech Stack:** Next.js App Router, React 19, next-intl, Vitest, Tailwind CSS

---

### Task 1: Lock the new gallery and onboarding rules with tests

**Files:**
- Modify: `src/components/channels/channelCards.test.ts`
- Modify: `src/components/channels/whatsappOnboarding.test.ts`

**Step 1: Write the failing tests**

- Assert gallery layout classes do not exceed `xl:grid-cols-3`.
- Assert WhatsApp `existingApi` no longer maps to direct legacy connect.
- Assert existing-account choices branch into `metaAssets` vs `otherBsp`.
- Assert `otherBsp` lands on a migration requirements screen.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/whatsappOnboarding.test.ts`

**Step 3: Implement the minimal helper changes**

- Extend WhatsApp onboarding helper types and transition functions.
- Adjust gallery layout helper output.

**Step 4: Re-run the targeted tests**

Run: `npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/whatsappOnboarding.test.ts`

**Step 5: Commit**

```bash
git add src/components/channels/channelCards.test.ts src/components/channels/whatsappOnboarding.test.ts src/components/channels/whatsappOnboarding.ts src/components/channels/channelCards.ts
git commit -m "test: lock channel gallery and whatsapp existing-api flows"
```

### Task 2: Simplify the channels gallery surface

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: `src/components/channels/ChannelCard.tsx`
- Modify: `src/components/channels/channelCards.ts`

**Step 1: Remove the left descriptive settings panel**

- Stop wrapping the gallery in `SettingsSection`.
- Render the summary and the card grid directly in the page body.

**Step 2: Calm the card styling**

- Reduce saturation and gradient intensity.
- Keep card proportions closer to the respond reference.
- Limit the grid to `1 / 2 / 3` columns.

**Step 3: Speed up route transitions**

- Prefetch channel onboarding routes from the gallery client layer before click.

**Step 4: Re-run gallery tests**

Run: `npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/channelCatalog.test.ts`

### Task 3: Refine the WhatsApp onboarding surface

**Files:**
- Modify: `src/components/channels/WhatsAppOnboardingPage.tsx`
- Modify: `src/components/channels/whatsappOnboarding.ts`
- Modify: `src/components/channels/ChannelOnboardingShell.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Remove extra resource/sidebar chrome**

- Flatten the onboarding shell to a content-first layout without the left resources panel.

**Step 2: Fix the landing radio controls**

- Replace the current ad-hoc selected markers with a more stable radio-card pattern.

**Step 3: Implement the missing existing-account branch**

- `existingApi` should open a second choice screen.
- `metaAssets` should continue to a direct legacy Meta connect screen.
- `otherBsp` should continue to a migration requirements screen with a Facebook CTA.

**Step 4: Re-run WhatsApp tests**

Run: `npm test -- --run src/components/channels/whatsappOnboarding.test.ts src/components/channels/channelCatalog.test.ts`

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run:
- `npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/channelCatalog.test.ts src/components/channels/whatsappOnboarding.test.ts`
- `npm run i18n:check`
- `npm run build`

**Step 2: Update docs**

- Note the calmer 3-column gallery and direct grid layout.
- Note the new existing-account migration branch in WhatsApp onboarding.

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "feat(phase-2): polish channels gallery and whatsapp onboarding"
```
