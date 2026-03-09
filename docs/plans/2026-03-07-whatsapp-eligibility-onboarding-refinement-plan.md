# WhatsApp Eligibility Onboarding Refinement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine the dedicated WhatsApp onboarding page so it matches the respond.io-style information architecture: two top-level API choices, a separate Business App link, and an eligibility/migration flow behind the new-account path.

**Architecture:** Keep the existing dedicated `/settings/channels/whatsapp` route and Meta popup integration, but simplify the main decision screen. Model the new-account flow as a small client-side state machine inside the WhatsApp onboarding page so we can branch into eligibility checks and migration guidance without introducing extra routes yet.

**Tech Stack:** Next.js App Router, React client components, Tailwind CSS, next-intl, Vitest, existing Meta embedded-signup helpers.

---

### Task 1: Lock the new WhatsApp onboarding IA with failing tests

**Files:**
- Modify: `src/components/channels/whatsappOnboarding.test.ts`
- Modify: `src/components/channels/whatsappOnboarding.ts`

**Scope:**
- Replace the old three-option taxonomy with a two-option main selector.
- Add explicit helper coverage for the eligibility choices and migration branch.
- Keep the tests focused on behavior, not presentational details.

### Task 2: Rebuild the WhatsApp onboarding page flow

**Files:**
- Modify: `src/components/channels/WhatsAppOnboardingPage.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Scope:**
- Render the main page with only:
  - create/connect a new API account
  - connect an existing API account
  - a separate Business App link
- Add the eligibility screen for the new-account flow.
- Add the migration warning screen when the user has no fresh number.
- Reuse the existing Meta embedded-signup / legacy OAuth actions behind the correct CTAs.

### Task 3: Update product docs and verify

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Commands:**
- `npm test -- --run src/components/channels/whatsappOnboarding.test.ts src/components/channels/channelCatalog.test.ts src/components/channels/channelCards.test.ts`
- `npm run i18n:check`
- `npm run build`
