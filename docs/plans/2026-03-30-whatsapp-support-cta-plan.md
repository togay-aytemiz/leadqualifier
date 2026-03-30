# WhatsApp Support CTA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change the WhatsApp onboarding support banner to open the team WhatsApp chat, and clarify that the `new API account` path also covers numbers currently tied to WhatsApp Personal.

**Architecture:** Keep the support destination in a small onboarding helper so the banner link stays testable and centrally editable. Update mirrored TR/EN copy for the CTA and landing-option description, then record the UX contract in roadmap/PRD/release notes.

**Tech Stack:** Next.js App Router, React 19, next-intl, Vitest

---

### Task 1: Add failing onboarding tests

**Files:**
- Modify: `src/components/channels/whatsappOnboarding.test.ts`
- Modify: `src/components/channels/whatsappOnboarding.ts`

**Step 1: Write the failing tests**

- Expect a dedicated helper to return the WhatsApp support chat URL.
- Expect the `new API` copy to mention `WhatsApp Personal`, while the business-app path stays reserved for `WhatsApp Business app`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/channels/whatsappOnboarding.test.ts`

Expected: FAIL because the helper/export and updated copy do not exist yet.

**Step 3: Write minimal implementation**

- Export a small support-chat URL helper from `src/components/channels/whatsappOnboarding.ts`.
- Update the WhatsApp onboarding page to use that helper for the banner CTA.
- Update mirrored TR/EN copy for the CTA label and the `new API` option description.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/channels/whatsappOnboarding.test.ts`

Expected: PASS

### Task 2: Update product docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Record the onboarding UX decision**

- Note that the support banner now opens the team WhatsApp chat instead of email.
- Note that personal-account users should start from the `new API account` path on the landing screen.

### Task 3: Verify

**Files:**
- None

**Step 1: Run focused test**

Run: `npm test -- --run src/components/channels/whatsappOnboarding.test.ts`

Expected: PASS

**Step 2: Run production build**

Run: `npm run build`

Expected: PASS unless blocked by unrelated existing repo issues.
