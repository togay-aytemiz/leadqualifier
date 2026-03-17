# Calendar Review Fixes Implementation Plan

**Goal:** Close the remaining calendar correctness gaps found in the review across backend booking rules, AI scheduling fallback behavior, and cached calendar UI mutations.

**Architecture:** Keep the current calendar architecture and harden the existing seams instead of adding a new orchestration layer. Enforce minimum notice consistently for exact-slot lookups and booking writes, stop scheduling failures from falling through to generic AI, invalidate cached calendar windows after mutations, make Google disconnect explicitly clean up mirrored future events, and tighten booking-intent detection so generic suitability questions do not enter scheduling.

**Tech Stack:** Next.js App Router, React client state, Supabase server actions, Vitest

---

### Task 1: Add failing regression coverage

**Files:**
- Modify: `src/lib/calendar/bookings.test.ts`
- Modify: `src/lib/calendar/actions.test.ts`
- Modify: `src/lib/ai/booking-scheduling.test.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.test.ts`

**Step 1: Write the failing tests**

- Add a bookings test that rejects `exactMatchAvailable` for a requested slot inside `minimum_notice_minutes`.
- Add a bookings test that rejects direct booking creation inside `minimum_notice_minutes`.
- Add a bookings or actions test that proves Google disconnect now performs mirrored-future-event cleanup before disconnecting.
- Add an AI scheduling test that ensures a generic `Bu bana uygun mu?` message does not enter booking when the org has only one service.
- Add an inbound pipeline test that ensures a scheduling exception produces a deterministic handoff reply instead of falling through to generic AI.
- Add a calendar client source test that expects cache invalidation after create/update/cancel mutations.

**Step 2: Run the focused test set**

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/actions.test.ts src/lib/ai/booking-scheduling.test.ts src/lib/channels/inbound-ai-pipeline.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts'
```

### Task 2: Harden backend booking and disconnect rules

**Files:**
- Modify: `src/lib/calendar/bookings.ts`
- Modify: `src/lib/calendar/actions.ts`

**Step 1: Enforce minimum notice everywhere**

- Reuse one shared check so exact requested slots and booking creation/update validation cannot bypass minimum notice.

**Step 2: Make disconnect explicit and safe**

- Delete mirrored future Google events before disconnecting the connection.
- Clear mirrored booking sync metadata after successful cleanup.
- Abort disconnect when cleanup cannot be completed safely.

### Task 3: Harden AI and client behavior

**Files:**
- Modify: `src/lib/ai/booking.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/components/calendar/CalendarClient.tsx`

**Step 1: Keep scheduling failures inside scheduling**

- Convert scheduling exceptions into a deterministic human-handoff reply and escalation path.

**Step 2: Tighten intent classification**

- Require stronger scheduling cues than a standalone suitability word like `uygun`.

**Step 3: Invalidate all cached windows after mutations**

- Clear or dirty the client-side range cache after create/update/cancel so previously visited windows cannot be reused stale.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted verification**

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/actions.test.ts src/lib/ai/booking-scheduling.test.ts src/lib/channels/inbound-ai-pipeline.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts'
npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts
```

**Step 2: Run final verification**

```bash
npm run build
git diff --check
```

**Step 3: Update docs**

- Record the new calendar invariants, disconnect behavior, and scheduling fallback decision in roadmap, PRD, and release notes.
