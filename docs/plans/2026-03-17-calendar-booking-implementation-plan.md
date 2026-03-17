# Calendar / Booking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an org-level in-app calendar and booking system that reuses the canonical service catalog, computes real availability, supports optional Google Calendar overlay/write-through, and lets the AI suggest and confirm real appointment slots.

**Architecture:** Internal `calendar_bookings` stay authoritative, while `booking_settings` and `booking_availability_rules` define local scheduling logic. Google Calendar is an optional provider behind a clean `calendar_connections` boundary for busy overlay and controlled event mirroring only. The dashboard gets a first-class `/calendar` route with desktop/mobile navigation, while AI runtime calls a dedicated scheduling module instead of inventing slots inside generic reply generation.

**Tech Stack:** Next.js App Router, React 19, Supabase/Postgres + RLS, Next server actions, Google Calendar REST API, Vitest, next-intl.

---

### Task 1: Lock the scheduling domain with failing tests

**Files:**
- Create: `src/lib/calendar/service-duration.test.ts`
- Create: `src/lib/calendar/availability.test.ts`
- Create: `src/lib/calendar/booking-intent.test.ts`
- Modify: `src/design/mobile-navigation.test.ts`

**Steps:**
1. Add failing tests for service duration resolution (`service_catalog` duration vs org fallback).
2. Add failing tests for slot generation, minimum notice, buffer rules, timezone handling, and overlap rejection.
3. Add failing tests for booking-intent/service-ambiguity/alternative-suggestion behavior.
4. Add failing navigation tests for `/calendar` desktop/mobile active-state behavior.

### Task 2: Add database foundation

**Files:**
- Create: `supabase/migrations/00094_calendar_booking_foundation.sql`
- Modify: `src/types/database.ts`

**Steps:**
1. Extend `service_catalog` with duration fields.
2. Create `booking_settings`, `booking_availability_rules`, `calendar_connections`, `calendar_connection_secrets`, and `calendar_bookings`.
3. Add RLS policies, indexes, booking overlap guard, and org bootstrap defaults.
4. Update generated database types manually to reflect the new tables/columns.

### Task 3: Implement backend scheduling logic

**Files:**
- Create: `src/lib/calendar/types.ts`
- Create: `src/lib/calendar/service-duration.ts`
- Create: `src/lib/calendar/time.ts`
- Create: `src/lib/calendar/availability.ts`
- Create: `src/lib/calendar/bookings.ts`
- Create: `src/lib/calendar/google.ts`
- Create: `src/lib/calendar/google-oauth.ts`
- Create: `src/lib/supabase/service-role.ts`

**Steps:**
1. Implement duration resolution with explicit fallback source.
2. Implement time helpers and slot generation over weekly availability windows.
3. Implement booking overlap checks against internal bookings and Google busy overlays.
4. Implement booking CRUD plus mirror metadata handling.
5. Implement Google OAuth/token helpers plus free/busy and event create/update/delete wrappers.

### Task 4: Expose server actions and routes

**Files:**
- Create: `src/lib/calendar/actions.ts`
- Create: `src/app/api/calendar/google/start/route.ts`
- Create: `src/app/api/calendar/google/callback/route.ts`

**Steps:**
1. Add server actions to read settings, rules, events, filters, create/update/cancel bookings, and update scheduling settings.
2. Add Google connect start/callback routes with graceful missing-env handling.
3. Keep returned connection payloads sanitized; secrets stay service-role only.

### Task 5: Integrate scheduling into AI runtime

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Create: `src/lib/ai/booking.ts`

**Steps:**
1. Add a scheduling-aware assistant branch for strong booking intent.
2. Resolve service against canonical catalog before suggesting slots.
3. Use real availability lookup for exact-slot checks and alternative proposals.
4. Create bookings only after clear confirmation and safe service/time resolution.
5. Fall back to non-pushy clarification or handoff when confidence is low.

### Task 6: Build the calendar product surface

**Files:**
- Create: `src/app/[locale]/(dashboard)/calendar/page.tsx`
- Create: `src/components/calendar/CalendarPageClient.tsx`
- Create: `src/components/calendar/calendar-view-model.ts`
- Create: `src/components/calendar/calendar-view-model.test.ts`
- Create: `src/components/calendar/BookingDetailsSheet.tsx`
- Create: `src/components/calendar/BookingEditorSheet.tsx`
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/MobileBottomNav.tsx`
- Modify: `src/design/mobile-navigation.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Steps:**
1. Add the `/calendar` route and load settings, rules, events, services, and connection state.
2. Build responsive day/week/month/agenda surfaces plus `Today` and `This week` summaries.
3. Add filters, detail sheet, and create/reschedule/cancel flows.
4. Wire desktop sidebar and mobile navigation entry points.
5. Add TR/EN copy for every new user-visible string.

### Task 7: Document the scope expansion and verify

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Update PRD scope and tech decisions to document the internal-source-of-truth calendar strategy and Google boundary.
2. Move calendar/booking out of silent future scope and into an explicit active/implemented roadmap phase.
3. Add release-note entries for booking foundation, AI scheduling, and the calendar UI.
4. Run targeted tests, required AI regression guards, i18n check, and `npm run build`.
