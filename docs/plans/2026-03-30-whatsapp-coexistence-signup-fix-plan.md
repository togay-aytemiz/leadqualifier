# WhatsApp Coexistence Signup Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the WhatsApp existing-number/coexistence embedded-signup path complete without incorrectly re-registering the phone number as if it were a new Cloud API number.

**Architecture:** Thread the embedded-signup mode from the UI into the server completion action, then branch provisioning so `new` mode keeps phone registration while `existing` mode skips it and still performs the required shared setup. Keep the change narrow, lock it with regression tests, and record the new contract in product docs.

**Tech Stack:** Next.js server actions, React client components, TypeScript, Vitest, Meta Graph API client

---

### Task 1: Lock the coexistence bug with a failing test

**Files:**
- Modify: `src/lib/channels/actions.test.ts`

**Step 1: Write the failing regression test**

Add a focused test showing that `completeWhatsAppEmbeddedSignupChannel()` in `existing` mode:
- does not call `registerPhoneNumber()`
- does call `subscribeAppToBusinessAccount()`
- does not persist a generated two-step verification PIN

**Step 2: Run the focused test to verify it fails**

Run:
- `npm test -- --run src/lib/channels/actions.test.ts`

### Task 2: Implement minimal mode-aware completion

**Files:**
- Modify: `src/lib/channels/actions.ts`
- Modify: `src/components/channels/WhatsAppOnboardingPage.tsx`
- Modify: `src/components/channels/ConnectWhatsAppModal.tsx`

**Step 1: Extend the server-action input**

Add a required embedded-signup mode field so the completion action knows whether the user came from `new` or `existing` onboarding.

**Step 2: Branch provisioning**

In `completeWhatsAppEmbeddedSignupChannel()`:
- keep `registerPhoneNumber()` and PIN generation only for `new` mode
- skip phone registration and PIN persistence for `existing` mode
- keep shared token exchange, WABA subscription, phone fetch, and channel upsert behavior

**Step 3: Update the client callsites**

Pass the active embedded-signup mode from both WhatsApp onboarding entry points into the server action.

**Step 4: Re-run the focused test**

Run:
- `npm test -- --run src/lib/channels/actions.test.ts`

### Task 3: Update product tracking docs

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the coexistence completion rule**

Record that existing-number/coexistence embedded signup must not run new-number phone registration during completion.

**Step 2: Update roadmap/release tracking**

Mark the fix and note the regression coverage.

### Task 4: Final verification and review

**Files:**
- None

**Step 1: Run targeted tests**

Run:
- `npm test -- --run src/lib/channels/actions.test.ts src/lib/whatsapp/client.test.ts`

**Step 2: Run the mandatory build**

Run:
- `npm run build`

**Step 3: Review the final diff**

Check for:
- any remaining unconditional `registerPhoneNumber()` usage in existing-number completion
- any callsites still omitting the embedded-signup mode

**Step 4: Prepare commit message**

Use:
- `fix(phase-2): branch whatsapp embedded signup provisioning by mode`
