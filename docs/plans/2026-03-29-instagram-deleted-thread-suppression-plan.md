# Instagram Deleted Thread Suppression Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop low-signal Instagram deleted-message events from polluting Inbox. If the only customer message in a thread is later deleted, the thread should not appear at all. If the conversation already has meaningful history, Inbox may still show that the message was deleted without promoting the thread as a new inbound item.

**Architecture:** Handle this at inbound persistence time inside the shared channel pipeline instead of patching presentation only. Special-case Instagram `message_deleted` events before the normal dedupe/create/insert flow, inspect the existing conversation history, and either suppress/delete the thread or update the existing message state in place.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Vitest

---

### Task 1: Lock the deleted-thread contract with failing pipeline tests

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

**Step 1: Write the failing test**

Add coverage for:
- ignoring Instagram `message_deleted` events when no conversation exists yet
- deleting the whole conversation when the only stored customer message is the one that was later deleted
- preserving established threads by converting the matching message into deleted state instead of inserting a new normal inbound turn

**Step 2: Run test to verify it fails**

Run:
- `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`

Expected: FAIL because the current pipeline only knows the generic dedupe/create/insert path and does not suppress deleted-only Instagram threads.

**Step 3: Commit**

```bash
git add src/lib/channels/inbound-ai-pipeline.test.ts
git commit -m "test: lock instagram deleted-thread suppression contract"
```

### Task 2: Implement deleted-event suppression in the inbound pipeline

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`

**Step 1: Write minimal implementation**

Add a dedicated Instagram deleted-event branch that:
- skips conversation creation for deleted events
- loads existing conversation history when present
- deletes the conversation when removing the deleted customer message would leave no meaningful history
- otherwise updates the matched message into deleted state without bumping unread count or recency

**Step 2: Run focused verification**

Run:
- `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`

Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/channels/inbound-ai-pipeline.ts src/lib/channels/inbound-ai-pipeline.test.ts
git commit -m "fix(phase-2): suppress first-only instagram deleted threads"
```

### Task 3: Refresh docs and full verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update product docs**

Document the new deleted-thread contract:
- first/only deleted Instagram messages should not create visible Inbox threads
- established conversations may still show deleted-state message history without treating the event like a fresh unread customer turn

**Step 2: Run final verification**

Run:
- `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`
- `npm run build`

Expected: PASS

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md docs/plans/2026-03-29-instagram-deleted-thread-suppression-plan.md
git commit -m "docs: record instagram deleted-thread suppression"
```
