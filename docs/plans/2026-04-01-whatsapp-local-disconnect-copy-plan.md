# WhatsApp Local-Only Disconnect Copy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the WhatsApp channel disconnect UX explicitly state that it only removes the Qualy-side channel relationship and does not disconnect the customer's WhatsApp Business app or Meta/WABA setup.

**Architecture:** Keep server behavior unchanged because `disconnectChannel()` already performs a local channel-row delete for WhatsApp. Add a focused source/messages regression test, switch the WhatsApp onboarding confirm dialog to dedicated local-only copy keys, and update product docs/release notes so the UI language matches the existing contract.

**Tech Stack:** Next.js App Router, next-intl JSON message catalogs, Vitest source tests

---

### Task 1: Lock the requirement in tests

**Files:**
- Modify: `src/components/channels/whatsappOnboarding.test.ts`

**Step 1: Write the failing test**

Add a source/messages test that asserts:
- `WhatsAppOnboardingPage.tsx` uses WhatsApp-specific disconnect confirm translation keys
- TR/EN messages explicitly say the action removes only the Qualy connection and does not disconnect WhatsApp Business / Meta setup

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/channels/whatsappOnboarding.test.ts`
Expected: FAIL because the page still uses generic disconnect copy.

**Step 3: Write minimal implementation**

Update the WhatsApp onboarding page to use dedicated disconnect confirm translation keys and add the new TR/EN copy.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/channels/whatsappOnboarding.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/channels/WhatsAppOnboardingPage.tsx src/components/channels/whatsappOnboarding.test.ts messages/en.json messages/tr.json
git commit -m "fix(phase-2): clarify whatsapp local disconnect copy"
```

### Task 2: Update product docs and verify

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

Add the operator-facing copy clarification to the existing WhatsApp disconnect notes / unreleased release notes.

**Step 2: Run verification**

Run:
- `npm test -- --run src/components/channels/whatsappOnboarding.test.ts src/lib/channels/actions.test.ts`
- `npm run build`

Expected:
- Tests PASS
- Build succeeds

**Step 3: Commit**

```bash
git add docs/PRD.md docs/ROADMAP.md docs/RELEASE.md
git commit -m "docs: record whatsapp local disconnect copy clarification"
```
