# Instagram Reaction UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Model Instagram reactions as reaction events instead of raw chat text, then render them in Inbox with clear, non-message UI.

**Architecture:** Keep the existing Instagram webhook/event pipeline, but persist structured reaction metadata (`action`, `emoji`, target provider message id) into message metadata. In Inbox, extend the existing Instagram event helpers so both new structured rows and legacy `[Instagram reaction] react ❤️` content can resolve to a reaction event, then render that event as a compact system-style row and use the same parsing for conversation previews.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, next-intl

---

### Task 1: Capture structured Instagram reaction metadata

**Files:**
- Modify: `src/lib/instagram/webhook.test.ts`
- Modify: `src/lib/instagram/webhook.ts`
- Modify: `src/app/api/webhooks/instagram/route.ts`

**Step 1: Write the failing test**

Add a webhook parser expectation proving Instagram reaction events expose structured reaction metadata, including emoji, action, and the target provider message id when present.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/instagram/webhook.test.ts`

Expected: FAIL because reaction metadata is not yet returned from `extractInstagramInboundEvents()`.

**Step 3: Write minimal implementation**

Extend `InstagramInboundEvent` with reaction metadata, parse the reaction payload in `src/lib/instagram/webhook.ts`, and persist the normalized fields into `inboundMessageMetadata` in `src/app/api/webhooks/instagram/route.ts`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/instagram/webhook.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/instagram/webhook.test.ts src/lib/instagram/webhook.ts src/app/api/webhooks/instagram/route.ts
git commit -m "feat(phase-2): persist instagram reaction metadata"
```

### Task 2: Teach Inbox to recognize reaction events and legacy payloads

**Files:**
- Modify: `src/components/inbox/instagramMessageEvents.test.ts`
- Modify: `src/components/inbox/instagramMessageEvents.ts`

**Step 1: Write the failing test**

Add helper tests that:
- detect reaction events from metadata
- parse legacy `[Instagram reaction] react ❤️` strings
- resolve target provider message ids from metadata

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/instagramMessageEvents.test.ts`

Expected: FAIL because the helpers only understand `seen`.

**Step 3: Write minimal implementation**

Add reaction-specific parsing helpers alongside the seen helpers, reusing the existing metadata parsing path and keeping legacy fallback support for already-persisted rows.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/inbox/instagramMessageEvents.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/inbox/instagramMessageEvents.test.ts src/components/inbox/instagramMessageEvents.ts
git commit -m "feat(phase-2): add instagram reaction event helpers"
```

### Task 3: Render Instagram reactions as compact event rows in Inbox

**Files:**
- Modify: `src/components/inbox/messageMedia.test.ts`
- Modify: `src/components/inbox/messageMedia.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

Add UI/content helper coverage proving reaction previews use human-readable copy instead of raw `[Instagram reaction] react ❤️` text, including legacy fallback behavior.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/messageMedia.test.ts`

Expected: FAIL because the preview/content helpers still return raw reaction strings.

**Step 3: Write minimal implementation**

Update Inbox rendering so reaction events:
- show human-readable preview copy in the conversation list
- render as centered compact event rows in the timeline, not normal inbound bubbles
- use target-message-aware wording when the reacted message id matches a known outbound Instagram message

Add the required TR/EN translation keys.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/inbox/messageMedia.test.ts src/components/inbox/instagramMessageEvents.test.ts src/lib/instagram/webhook.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/inbox/messageMedia.test.ts src/components/inbox/messageMedia.ts src/components/inbox/InboxContainer.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-2): improve instagram reaction inbox ui"
```

### Task 4: Verify and document

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run: `npm test -- --run src/lib/instagram/webhook.test.ts src/components/inbox/instagramMessageEvents.test.ts src/components/inbox/messageMedia.test.ts`

Expected: PASS

**Step 2: Run build verification**

Run: `npm run build`

Expected: PASS

**Step 3: Update docs**

Document the new Instagram reaction handling in PRD, Roadmap, and Release Notes, including the UI rule that reactions are rendered as reaction events instead of plain inbound text.

**Step 4: Commit**

```bash
git add docs/PRD.md docs/ROADMAP.md docs/RELEASE.md docs/plans/2026-03-28-instagram-reaction-ui-plan.md
git commit -m "docs: record instagram reaction ui behavior"
```
