# Instagram Deleted Message Identity UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Instagram deleted-message threads feel operator-friendly by hiding raw numeric IDs from the main contact label, surfacing the ID only as a secondary identifier when needed, and rendering deleted-message events as explicit inbox UI events instead of ordinary chat bubbles.

**Architecture:** Keep the transport/persistence model unchanged and improve presentation in the inbox layer. Reuse the existing Instagram metadata heuristics to resolve readable names first, then fall back to a localized generic label plus a subtle secondary ID hint when the profile cannot be resolved. Treat `message_deleted` as a first-class Instagram event in preview and timeline rendering.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Vitest

---

### Task 1: Cover unresolved Instagram identity UX with tests

**Files:**
- Modify: `src/components/inbox/instagramRequestState.test.ts`
- Modify: `src/components/inbox/conversationIdentity.test.ts`

**Step 1: Write the failing test**

Add coverage for:
- localized fallback display name when an Instagram contact only resolves to a numeric scoped ID
- secondary identifier remaining available for unresolved Instagram contacts instead of disappearing completely

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/instagramRequestState.test.ts src/components/inbox/conversationIdentity.test.ts`

Expected: FAIL because the current helpers still return the raw numeric ID as the main display label and hide the Instagram secondary identifier entirely.

**Step 3: Write minimal implementation**

Update the inbox identity helpers so unresolved Instagram contacts can render:
- a localized friendly primary label
- a subtle secondary identifier line for the stored Instagram ID

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/inbox/instagramRequestState.test.ts src/components/inbox/conversationIdentity.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/inbox/instagramRequestState.ts src/components/inbox/instagramRequestState.test.ts src/components/inbox/conversationIdentity.ts src/components/inbox/conversationIdentity.test.ts
git commit -m "fix(phase-2): improve unresolved instagram contact identity ux"
```

### Task 2: Cover deleted-message event rendering with tests

**Files:**
- Modify: `src/components/inbox/instagramMessageEvents.test.ts`
- Modify: `src/components/inbox/messageMedia.test.ts`

**Step 1: Write the failing test**

Add coverage for:
- detecting Instagram `message_deleted` events
- showing a localized deleted-message preview label instead of the raw bracketed transport placeholder

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/instagramMessageEvents.test.ts src/components/inbox/messageMedia.test.ts`

Expected: FAIL because deleted messages are currently treated like ordinary text and still surface the raw placeholder copy.

**Step 3: Write minimal implementation**

Add deleted-event detection helpers and use them in preview/timeline rendering.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/inbox/instagramMessageEvents.test.ts src/components/inbox/messageMedia.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/inbox/instagramMessageEvents.ts src/components/inbox/instagramMessageEvents.test.ts src/components/inbox/messageMedia.ts src/components/inbox/messageMedia.test.ts src/components/inbox/InboxContainer.tsx
git commit -m "fix(phase-2): polish instagram deleted message events"
```

### Task 3: Add localized copy and finish verification/docs

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add localized copy**

Add EN/TR keys for:
- unresolved Instagram contact fallback label
- Instagram ID label
- deleted-message preview/event copy

**Step 2: Run focused verification**

Run:
- `npm test -- --run src/components/inbox/instagramRequestState.test.ts src/components/inbox/conversationIdentity.test.ts src/components/inbox/instagramMessageEvents.test.ts src/components/inbox/messageMedia.test.ts`
- `npm run build`

Expected: all green

**Step 3: Update product docs**

Document the operator-facing UX improvement in roadmap, PRD, and release notes with `Last Updated` refreshed to `2026-03-29`.

**Step 4: Commit**

```bash
git add messages/en.json messages/tr.json docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record instagram inbox identity ux polish"
```
