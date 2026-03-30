# WhatsApp Disconnect Deprovision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make WhatsApp `Disconnect` stop behaving like a local-only delete by requiring a real provider-side disconnect for Cloud API numbers, while surfacing a clear coexistence-specific instruction when Meta requires the business to disconnect from the WhatsApp Business app first.

**Architecture:** Extend the WhatsApp client with the supported phone-number deregistration call and invoke it from `disconnectChannel` before deleting the local channel row. Detect the official coexistence limitation from the Meta error message, keep the local channel intact in that case, and translate the resulting UI guidance in the WhatsApp onboarding page.

**Tech Stack:** Next.js App Router, React 19, next-intl, Vitest

---

### Task 1: Add failing WhatsApp disconnect tests

**Files:**
- Modify: `src/lib/whatsapp/client.test.ts`
- Modify: `src/lib/channels/actions.test.ts`

**Step 1: Write the failing client test**

- Assert `WhatsAppClient.deregisterPhoneNumber()` calls `POST /<PHONE_NUMBER_ID>/deregister` with the expected Graph API payload.

**Step 2: Write the failing action tests**

- Assert `disconnectChannel()` deregisters a WhatsApp number before deleting the local `channels` row.
- Assert coexistence-specific deregistration failures keep the local channel intact and return a stable error signal for the UI.

**Step 3: Run tests to verify they fail**

Run: `npm test -- --run src/lib/whatsapp/client.test.ts src/lib/channels/actions.test.ts`

Expected: FAIL because deregistration/disconnect handling is not implemented yet.

### Task 2: Implement minimal provider-aware disconnect logic

**Files:**
- Modify: `src/lib/whatsapp/client.ts`
- Modify: `src/lib/channels/actions.ts`

**Step 1: Add WhatsApp deregistration helper**

- Add a client method that calls the official Cloud API phone-number deregistration endpoint.

**Step 2: Enforce provider-side disconnect before local delete**

- In `disconnectChannel()`, when the channel is WhatsApp and has the needed credentials, call the deregistration helper first.
- If Meta returns the coexistence limitation error, throw a stable app error code instead of deleting the local channel row.
- For other provider failures, keep the local channel row and bubble a normalized failure.

### Task 3: Surface coexistence guidance in the WhatsApp UI

**Files:**
- Modify: `src/components/channels/WhatsAppOnboardingPage.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Map the stable disconnect error code**

- Convert the coexistence-specific server error into localized guidance telling the operator to disconnect Cloud API from the WhatsApp Business app first.

### Task 4: Update docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Record the new disconnect contract**

- Note that WhatsApp disconnect is no longer a silent local-only delete.
- Note the coexistence limitation and the required app-side disconnect fallback.

### Task 5: Verify

**Files:**
- None

**Step 1: Run focused tests**

Run: `npm test -- --run src/lib/whatsapp/client.test.ts src/lib/channels/actions.test.ts`

Expected: PASS

**Step 2: Run production build**

Run: `npm run build`

Expected: PASS unless blocked by unrelated existing repo issues.
