# Knowledge Process Billing Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh sidebar/mobile billing UI when async knowledge-document processing finishes and consumes credits.

**Architecture:** Add a small client-side knowledge-processing helper that awaits `/api/knowledge/process` completion and emits browser events after success. Keep the navigation shells simple by listening for a shared `billing-updated` event and reusing existing snapshot refresh callbacks.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest

---

### Task 1: Lock the async completion gap with a failing test

**Files:**
- Create: `src/lib/knowledge-base/process-client.test.ts`
- Create: `src/lib/knowledge-base/process-client.ts`

**Step 1: Write the failing test**

Add tests that verify:
- successful background knowledge processing dispatches `knowledge-updated`, `pending-suggestions-updated`, and `billing-updated`
- failed processing does not dispatch events and throws

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/knowledge-base/process-client.test.ts`

Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

Implement a client helper that posts to `/api/knowledge/process` and dispatches completion events only after a successful response.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/knowledge-base/process-client.test.ts`

Expected: PASS

### Task 2: Wire the helper and billing listeners

**Files:**
- Modify: `src/app/[locale]/(dashboard)/knowledge/create/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/[id]/EditContentForm.tsx`
- Create: `src/lib/billing/events.ts`
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/MobileBottomNav.tsx`

**Step 1: Replace fire-and-forget process calls**

Use the new helper in create/edit flows so async completion emits the shared billing refresh event.

**Step 2: Listen for shared billing refresh event**

Subscribe desktop/mobile billing shells to `billing-updated` and reuse `refreshBillingSnapshot`.

**Step 3: Run focused regression tests**

Run:
- `npm test -- --run src/lib/knowledge-base/process-client.test.ts`
- `npm test -- --run src/lib/billing/usage.test.ts src/lib/billing/refresh-signal.test.ts`

Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run build**

Run: `npm run build`

Expected: PASS

**Step 2: Update docs**

Document the explicit billing-refresh event on async knowledge processing completion.
