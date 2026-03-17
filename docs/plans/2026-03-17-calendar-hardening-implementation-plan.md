# Calendar Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining calendar correctness gaps across backend booking enforcement, availability-rule writes, and AI scheduling handoff boundaries.

**Architecture:** Keep the current calendar product surface, but harden the server-side invariants. Enforce `booking_enabled` inside the booking/availability layer, move availability-rule replacement into a transactional database function, keep mirrored Google events in sync even after write-through is toggled off, and make AI scheduling return explicit human-handoff signals for both no-slot and booking-change cases.

**Tech Stack:** Next.js App Router, Supabase SQL/RPC, server actions, Vitest

---

### Task 1: Add failing regression tests

**Files:**
- Create: `src/lib/calendar/bookings.test.ts`
- Create: `src/lib/calendar/actions.test.ts`
- Modify: `src/lib/ai/booking-scheduling.test.ts`

**Step 1: Write the failing tests**

- Add a bookings test that expects `lookupBookingAvailability` to reject when `booking_enabled = false`.
- Add a bookings test that expects `createCalendarBookingRecord` to reject when `booking_enabled = false`.
- Add a bookings test that expects cancellation to attempt Google deletion for an already mirrored booking even when write-through is now disabled.
- Add an actions test that expects `replaceAvailabilityRulesAction` to use an RPC-based atomic replace instead of delete-then-insert.
- Change the no-slot AI scheduling test to expect an explicit human-handoff result, not just a handled boolean.
- Add an AI scheduling test for implied change requests after a confirmed booking context (for example `Perşembeye alabilir miyiz?`) to require human handoff instead of availability lookup.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/actions.test.ts src/lib/ai/booking-scheduling.test.ts
```

Expected:
- FAIL on the new enforcement, RPC, and AI handoff expectations.

### Task 2: Backend invariants

**Files:**
- Modify: `src/lib/calendar/bookings.ts`
- Modify: `src/lib/calendar/actions.ts`
- Create: `supabase/migrations/00095_replace_booking_availability_rules.sql`

**Step 1: Enforce booking disablement**

- Reject availability lookup and booking creation when `booking_enabled = false`.
- Keep update/cancel behavior unchanged unless a stronger product decision requires full lockout.

**Step 2: Make availability-rule replacement atomic**

- Add a Supabase SQL function that replaces booking availability rules in one transaction.
- Call that RPC from `replaceAvailabilityRulesAction`.

**Step 3: Prevent Google drift**

- Continue updating/deleting an existing mirrored Google event when `provider_event_id` already exists, even if `google_write_through_enabled` was later disabled.
- Do not create new Google events while write-through is disabled.

### Task 3: AI scheduling boundaries

**Files:**
- Modify: `src/lib/ai/booking.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts` only if needed by the return-shape change

**Step 1: Escalate no-slot handoff explicitly**

- Return a structured scheduling result with `requiresHumanHandover: true` for the “no valid slots” path.

**Step 2: Block implied reschedule flows**

- Detect change-like follow-ups when there is a confirmed booking context and route them to the same human-handoff path.
- Keep new-booking continuation intact for suggestion-confirmation flows.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted verification**

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/actions.test.ts src/lib/ai/booking-scheduling.test.ts src/lib/channels/inbound-ai-pipeline.test.ts
```

**Step 2: Run build verification**

```bash
npm run build
git diff --check
```

**Step 3: Update docs**

- Record the hardening changes and invariant decisions in roadmap, PRD, and release notes.

**Step 4: Commit**

```bash
git add src/lib/calendar/bookings.ts src/lib/calendar/actions.ts src/lib/calendar/bookings.test.ts src/lib/calendar/actions.test.ts src/lib/ai/booking.ts src/lib/ai/booking-scheduling.test.ts src/lib/channels/inbound-ai-pipeline.test.ts supabase/migrations/00095_replace_booking_availability_rules.sql docs/ROADMAP.md docs/PRD.md docs/RELEASE.md docs/plans/2026-03-17-calendar-hardening-implementation-plan.md
git commit -m "fix(phase-9.5): harden calendar booking invariants and scheduling handoff"
```
