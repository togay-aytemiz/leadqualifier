# WhatsApp Embedded Signup Provisioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete WhatsApp Embedded Signup onboarding by running the required post-auth Meta provisioning calls before marking the channel active.

**Architecture:** Keep the existing Embedded Signup UI flow unchanged, but extend the server completion action so it exchanges the code, provisions the phone number for Cloud API use, subscribes the app to the customer WABA, and only then persists an active channel. Store the generated two-step verification PIN in channel config so retries and future operator debugging are deterministic.

**Tech Stack:** Next.js server actions, TypeScript, Vitest, Meta Graph API via existing `WhatsAppClient`

---

### Task 1: Lock the missing provisioning behavior in tests

**Files:**
- Modify: `src/lib/channels/actions.test.ts`
- Modify: `src/lib/whatsapp/client.test.ts`

**Step 1: Write the failing action test**

Add assertions that `completeWhatsAppEmbeddedSignupChannel()`:
- calls phone registration before the channel upsert
- calls WABA webhook subscription before the channel upsert
- persists the generated PIN in channel config

**Step 2: Run the focused action test to verify it fails**

Run: `npm test -- --run src/lib/channels/actions.test.ts`

**Step 3: Write the failing client tests**

Add tests for:
- `registerPhoneNumber(phoneNumberId, pin)`
- `subscribeAppToBusinessAccount(wabaId)`

**Step 4: Run the focused client test to verify it fails**

Run: `npm test -- --run src/lib/whatsapp/client.test.ts`

### Task 2: Implement minimal provisioning support

**Files:**
- Modify: `src/lib/whatsapp/client.ts`
- Modify: `src/lib/channels/actions.ts`

**Step 1: Add the minimal Graph client methods**

Implement:
- `registerPhoneNumber()` -> `POST /{phone_number_id}/register`
- `subscribeAppToBusinessAccount()` -> `POST /{waba_id}/subscribed_apps`

**Step 2: Add retry-safe pin generation/persistence**

In `completeWhatsAppEmbeddedSignupChannel()`:
- generate a 6-digit PIN
- call register + subscribe before activation
- persist the PIN into `channels.config`

**Step 3: Keep failure behavior explicit**

If provisioning fails:
- return a deterministic error from the server action
- do not silently mark the channel active

**Step 4: Re-run the focused tests**

Run:
- `npm test -- --run src/lib/channels/actions.test.ts`
- `npm test -- --run src/lib/whatsapp/client.test.ts`

### Task 3: Update product docs and release notes

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the new provisioning requirement**

Record that Embedded Signup completion now includes:
- phone-number registration for Cloud API use
- WABA webhook subscription
- stored two-step verification PIN for the managed number

**Step 2: Update roadmap/release tracking**

Mark the Embedded Signup provisioning work complete and add the release note entry under `[Unreleased]`.

### Task 4: Final verification

**Files:**
- None

**Step 1: Run all targeted tests**

Run:
- `npm test -- --run src/lib/channels/actions.test.ts`
- `npm test -- --run src/lib/whatsapp/client.test.ts`

**Step 2: Run the mandatory build**

Run: `npm run build`

**Step 3: Prepare commit message**

Use:
- `feat(phase-2): finish whatsapp embedded signup provisioning`
