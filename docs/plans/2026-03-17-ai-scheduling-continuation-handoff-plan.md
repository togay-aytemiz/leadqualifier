# AI Scheduling Continuation And Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI scheduling continue naturally across follow-up availability questions and route booking-change requests to human handoff instead of attempting automatic rescheduling.

**Architecture:** Keep the current hybrid design: deterministic scheduling logic runs before the general LLM pipeline, and we extend it with lightweight conversation-context reuse instead of introducing a long agentic chain. Scheduling continuation will reuse the last booking-response metadata for service/date context, while reschedule/change intent will return a structured handoff signal that the inbound pipeline can escalate through the existing operator-handoff path.

**Tech Stack:** Next.js App Router, Supabase, Vitest, existing `src/lib/ai/booking.ts` scheduling branch, existing inbound AI pipeline escalation flow.

---

### Task 1: Lock the missing behaviors with failing tests

**Files:**
- Modify: `src/lib/ai/booking-scheduling.test.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

**Step 1: Write the failing continuation test**

Add a test proving that after a booking-response message already established the service, a follow-up message like `Cuma var mı?` still triggers availability lookup and alternative suggestions without requiring the user to repeat `randevu` or the service name.

**Step 2: Run the targeted booking scheduling tests to verify failure**

Run: `npm test -- --run src/lib/ai/booking-scheduling.test.ts`
Expected: FAIL because follow-up scheduling continuity is not currently recognized.

**Step 3: Write the failing handoff-escalation test**

Add a pipeline test proving that when scheduling returns a `requiresHumanHandover` result, the existing escalation path marks the conversation for operator attention.

**Step 4: Run the targeted inbound pipeline test to verify failure**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`
Expected: FAIL because the scheduling branch currently returns only a boolean and does not drive escalation.

### Task 2: Implement scheduling continuity in the deterministic booking branch

**Files:**
- Modify: `src/lib/ai/booking.ts`
- Test: `src/lib/ai/booking-scheduling.test.ts`

**Step 1: Add lightweight booking-context reading**

Read the latest booking-response metadata from recent bot messages so the branch can reuse:
- `booking_service_catalog_id`
- `booking_service_name`
- `booking_requested_slot`
- `booking_suggestion_slots`

**Step 2: Add continuation detection**

Recognize follow-up scheduling questions when a recent booking context exists and the latest user turn contains timing/availability cues such as:
- weekday/day references
- `var mı / uygun mu / available / free`
- same-day references like `o gün / aynı gün / that day`

**Step 3: Reuse prior service/date context**

If the user does not repeat the service, fall back to the prior booking-response service context. If the user says `o gün`, reuse the prior requested-slot date as the lookup day.

**Step 4: Run the focused booking scheduling tests**

Run: `npm test -- --run src/lib/ai/booking-scheduling.test.ts`
Expected: PASS.

### Task 3: Route booking-change requests into existing human handoff

**Files:**
- Modify: `src/lib/ai/booking.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Test: `src/lib/ai/booking-scheduling.test.ts`
- Test: `src/lib/channels/inbound-ai-pipeline.test.ts`

**Step 1: Detect booking-management intent**

Add narrow patterns for requests like:
- `randevumu değiştirmek istiyorum`
- `başka güne almak istiyorum`
- `reschedule my appointment`

Do not treat generic policy questions like `iptal politikanız nedir?` as management intent.

**Step 2: Return a structured scheduling result**

Allow the scheduling branch to return:
- `false`
- or `{ handled: true, requiresHumanHandover?: boolean }`

Use `requiresHumanHandover: true` for booking-change requests.

**Step 3: Reuse inbound pipeline escalation**

When the scheduling branch reports `requiresHumanHandover`, call the existing escalation helper so the conversation can switch to operator attention instead of staying fully AI-owned.

**Step 4: Run focused tests**

Run: `npm test -- --run src/lib/ai/booking-scheduling.test.ts src/lib/channels/inbound-ai-pipeline.test.ts`
Expected: PASS.

### Task 4: Verify, review, and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted AI regression coverage**

Run:
- `npm test -- --run src/lib/ai/booking-scheduling.test.ts`
- `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts`
- `npm test -- --run src/lib/ai/followup.test.ts`
- `npm test -- --run src/lib/ai/response-guards.test.ts`

**Step 2: Run build verification**

Run: `npm run build`
Expected: PASS.

**Step 3: Update product docs**

Document that:
- AI scheduling now continues across follow-up availability questions inside the same booking thread.
- Booking change/reschedule requests are intentionally handed to humans in v1 instead of being auto-applied.

**Step 4: Review**

Do a findings-first code review pass for bugs/regressions, especially around false-positive scheduling interception and escalation side effects.
