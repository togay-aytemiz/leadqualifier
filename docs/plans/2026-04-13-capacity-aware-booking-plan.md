# Capacity-Aware Booking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let each workspace decide how many appointments can run at the same time while keeping the default behavior at one booking at a time for every new organization.

**Architecture:** Keep the simple org-level scheduling model. Add `booking_settings.max_concurrent_bookings` with default `1`, replace the hard no-overlap booking constraint with an atomic capacity guard, and teach availability lookup to evaluate peak concurrent occupied ranges instead of treating every overlap as a hard conflict. Service duration, business hours, buffers, minimum notice, slot-grid alignment, and Google busy overlay remain part of the same availability engine.

**Tech Stack:** Next.js App Router, React, Supabase/Postgres + RLS, PostgreSQL trigger/RPC guard, Vitest, next-intl.

---

## Product Decision

Use the simple capacity model:

- One organization-level field: `max_concurrent_bookings`.
- Default for new and missing booking settings: `1`.
- Operator-facing copy: `Aynı anda en fazla kaç randevu? / Maximum bookings at the same time`.
- No staff/resource group UI in this version.
- No per-service capacity in this version.
- Existing `service_catalog.duration_minutes` still determines how long each requested appointment occupies capacity.

This means a four-hour service can only start if it can finish inside working hours and if the peak active internal booking occupancy at every instant in that four-hour range stays below the workspace capacity.

## Behavior Contract

- Capacity `1` preserves current behavior: any overlapping pending/confirmed internal booking blocks the slot.
- Capacity `2` allows a second simultaneous pending/confirmed internal booking, but blocks a third at the same instant.
- Capacity checks must use peak point-in-time occupancy, not the raw number of bookings that touch the requested range. Sequential appointments inside a longer requested range should not over-block if they are never active at the same time.
- Canceled/completed/no-show bookings do not consume future booking capacity.
- Google busy overlay remains a hard block while enabled, because v1 treats the connected calendar as an external busy-time layer.
- Before/after buffers count as occupied time around both existing bookings and the candidate booking for capacity checks.
- Manual booking create/update, AI booking creation, and availability suggestions use the same capacity rules.
- Booking writes must re-check capacity atomically at persistence time to avoid race-condition double booking.
- AI suggested starts must be aligned to the configured slot interval from the relevant working-hours window, not to the arbitrary minute when the customer asked.
- Nearest-availability questions should search a practical forward horizon, return the closest two valid options when at least two exist, return one if only one exists, and hand off only after no valid option is found in that horizon.
- Lowering capacity or changing buffers must not retroactively cancel existing bookings. The new rule applies to new bookings and later time/status edits.

## Product Review Findings

- The simple workspace-level field is the right v1 product shape for Turkish SMBs. It answers the user's main question without introducing staff calendars, room inventory, or per-service resource groups.
- The first draft's overlap-count mental model was too coarse. Counting every booking that intersects a long requested range can falsely block valid starts when those bookings are sequential rather than simultaneous.
- Buffer handling needs to be symmetric. If only existing bookings are expanded, a later existing appointment can slip into the new booking's after-buffer when the new booking is created after that later appointment already exists.
- The current nearest-slot flow can start from `now`, which can make generated slots drift to odd minutes such as `10:07`, depending on when the customer asks. The plan must normalize suggestions to the operator's configured slot grid.
- A fixed 7-day nearest-search window is product-hostile for low-availability businesses. The plan should search a longer bounded window before telling the customer no slots were found.
- The manual booking modal still starts new bookings at `10:00` and rejects past starts even when the operator only wants to mark an old booking as completed or no-show. That is a real product follow-up, but it should stay outside this capacity implementation unless the implementation already touches manual status editing.

---

### Task 1: Red tests for capacity-aware slot math and slot-grid generation

**Files:**
- Modify: `src/lib/calendar/availability.test.ts`
- Modify: `src/lib/calendar/availability.ts`

**Step 1: Write failing tests**

Add tests that prove internal overlaps count against a point-in-time limit rather than always blocking:

```ts
expect(isSlotAvailable({
  maxConcurrentBookings: 2,
  blockedRanges: [
    { source: 'internal_booking', startIso: '2026-04-15T09:00:00.000Z', endIso: '2026-04-15T10:00:00.000Z' },
  ],
  bookingStartIso: '2026-04-15T09:30:00.000Z',
  bookingEndIso: '2026-04-15T10:30:00.000Z',
})).toBe(true)

expect(isSlotAvailable({
  maxConcurrentBookings: 2,
  blockedRanges: [
    { source: 'internal_booking', startIso: '2026-04-15T09:00:00.000Z', endIso: '2026-04-15T10:00:00.000Z' },
    { source: 'internal_booking', startIso: '2026-04-15T09:15:00.000Z', endIso: '2026-04-15T10:15:00.000Z' },
  ],
  bookingStartIso: '2026-04-15T09:30:00.000Z',
  bookingEndIso: '2026-04-15T10:30:00.000Z',
})).toBe(false)
```

Add tests for the product edge cases found in review:

- Capacity `2` should allow a candidate range that touches two existing internal bookings when those existing bookings are sequential and never simultaneously active inside the candidate's occupied range.
- Capacity `2` should block when two existing internal occupied ranges overlap at the same instant inside the candidate's occupied range.
- A future existing booking that starts inside the candidate booking's `bufferAfterMinutes` should block the candidate, proving buffers expand both the existing and candidate occupied ranges.
- A `google_busy` overlap still returns `false` even when `maxConcurrentBookings > 1`.
- `buildAvailabilitySlots` should generate starts anchored to the matching working-hours rule and slot interval, not the raw `rangeStartIso` minute. Example: a query range starting at `10:07` must not produce `10:07`, `10:37`, etc.; a business window starting at `09:15` with a `30` minute interval should offer `09:15`, `09:45`, etc. when those starts fit the service duration.

**Step 2: Run the failing tests**

```bash
npm test -- --run src/lib/calendar/availability.test.ts
```

Expected: FAIL because `isSlotAvailable` does not accept capacity yet and slot generation is still range-start anchored.

**Step 3: Implement minimal availability math**

Update `SlotAvailabilityInput` with:

```ts
maxConcurrentBookings?: number
```

Normalize it to at least `1`. Keep `google_busy` as an immediate hard block. Do not use the total number of internal bookings that touch the candidate range; use peak occupied concurrency after applying buffers.

Use occupied ranges for internal booking capacity:

```ts
occupiedStart = startsAt - bufferBeforeMinutes
occupiedEnd = endsAt + bufferAfterMinutes
```

For capacity, compute the maximum number of existing internal occupied ranges active at any instant inside the candidate occupied range. Return `true` only when that peak existing count is below `maxConcurrentBookings`.

For slot generation, iterate from each active weekly rule's local start minute and intersect those rule-anchored starts with the lookup range and minimum-notice threshold. Do not derive customer-facing suggestion minutes from the arbitrary lookup `rangeStartIso` timestamp.

**Step 4: Verify**

```bash
npm test -- --run src/lib/calendar/availability.test.ts
```

Expected: PASS.

---

### Task 2: Add database capacity setting and atomic write guard

**Files:**
- Create: `supabase/migrations/00114_calendar_booking_capacity.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the migration**

Add the new setting:

```sql
ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS max_concurrent_bookings INT NOT NULL DEFAULT 1;

ALTER TABLE public.booking_settings
  DROP CONSTRAINT IF EXISTS booking_settings_max_concurrent_bookings_check;

ALTER TABLE public.booking_settings
  ADD CONSTRAINT booking_settings_max_concurrent_bookings_check
  CHECK (max_concurrent_bookings >= 1 AND max_concurrent_bookings <= 50);
```

Backfill explicit `1` for existing rows if needed.

Define the new trigger function before dropping the old hard no-overlap constraint, and keep the drop + trigger attach in the same migration transaction:

```sql
CREATE OR REPLACE FUNCTION public.enforce_calendar_booking_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_max_concurrent INT;
  v_buffer_before INT;
  v_buffer_after INT;
  v_new_occupied_start TIMESTAMPTZ;
  v_new_occupied_end TIMESTAMPTZ;
  v_peak_existing_overlap INT;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id::text)::bigint);

  SELECT
    COALESCE(max_concurrent_bookings, 1),
    COALESCE(buffer_before_minutes, 0),
    COALESCE(buffer_after_minutes, 0)
  INTO v_max_concurrent, v_buffer_before, v_buffer_after
  FROM public.booking_settings
  WHERE organization_id = NEW.organization_id;

  v_max_concurrent := COALESCE(v_max_concurrent, 1);
  v_buffer_before := COALESCE(v_buffer_before, 0);
  v_buffer_after := COALESCE(v_buffer_after, 0);
  v_new_occupied_start := NEW.starts_at - make_interval(mins => v_buffer_before);
  v_new_occupied_end := NEW.ends_at + make_interval(mins => v_buffer_after);

  WITH existing AS (
    SELECT
      starts_at - make_interval(mins => v_buffer_before) AS occupied_start,
      ends_at + make_interval(mins => v_buffer_after) AS occupied_end
    FROM public.calendar_bookings
    WHERE organization_id = NEW.organization_id
      AND status IN ('pending', 'confirmed')
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND tstzrange(
        starts_at - make_interval(mins => v_buffer_before),
        ends_at + make_interval(mins => v_buffer_after),
        '[)'
      ) && tstzrange(v_new_occupied_start, v_new_occupied_end, '[)')
  ),
  check_points AS (
    SELECT v_new_occupied_start AS check_point
    UNION
    SELECT occupied_start
    FROM existing
    WHERE occupied_start >= v_new_occupied_start
      AND occupied_start < v_new_occupied_end
  ),
  counts AS (
    SELECT (
      SELECT COUNT(*)
      FROM existing
      WHERE occupied_start <= check_point
        AND check_point < occupied_end
    ) AS active_existing_count
    FROM check_points
  )
  SELECT COALESCE(MAX(active_existing_count), 0)
  INTO v_peak_existing_overlap
  FROM counts;

  IF v_peak_existing_overlap >= v_max_concurrent THEN
    RAISE EXCEPTION 'Booking capacity exceeded'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Then drop the old constraint and attach the trigger:

```sql
ALTER TABLE public.calendar_bookings
  DROP CONSTRAINT IF EXISTS calendar_bookings_no_overlap;

DROP TRIGGER IF EXISTS enforce_calendar_booking_capacity_trigger ON public.calendar_bookings;
CREATE TRIGGER enforce_calendar_booking_capacity_trigger
  BEFORE INSERT OR UPDATE OF organization_id, starts_at, ends_at, status
  ON public.calendar_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_calendar_booking_capacity();
```

Do not try to retroactively rewrite existing bookings when capacity is lowered. Existing overlaps can remain as historical operator decisions; new create/update attempts must respect the current setting.

**Step 2: Update types**

Add `max_concurrent_bookings: number` to `BookingSettings`.

**Step 3: Verify SQL shape locally**

```bash
supabase db reset
```

Expected: migration applies cleanly. If local Supabase is not available, note it and run the TS tests plus build.

---

### Task 3: Wire capacity through backend settings and availability lookup

**Files:**
- Modify: `src/lib/calendar/bookings.ts`
- Modify: `src/lib/calendar/types.ts`
- Modify: `src/lib/calendar/bookings.test.ts`
- Modify: `src/lib/calendar/settings-surface.ts`
- Modify: `src/lib/calendar/settings-surface.test.ts`
- Modify: `src/lib/calendar/actions.ts`
- Modify: `src/lib/calendar/actions.test.ts`

**Step 1: Write failing tests**

Add tests proving:

- `getBookingSettingsByOrganizationId` fallback returns `max_concurrent_bookings: 1`.
- `lookupBookingAvailability` passes `maxConcurrentBookings` into `isSlotAvailable`.
- `lookupBookingAvailability` treats capacity with the same peak occupied-concurrency rule as the pure availability helper.
- `lookupBookingAvailability` does not mark an exact requested start as available when it is inside business hours but off the configured slot grid.
- `createCalendarBookingRecord` maps a database `23P01` capacity error to the existing `Double booking conflict` error.
- settings draft defaults capacity to `1` and dirtiness tracks changes.

**Step 2: Run**

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/settings-surface.test.ts src/lib/calendar/actions.test.ts
```

Expected: FAIL until the new field is wired.

**Step 3: Implement backend wiring**

Update default settings:

```ts
max_concurrent_bookings: 1
```

Pass the value into availability checks:

```ts
maxConcurrentBookings: settings.max_concurrent_bookings
```

Include `max_concurrent_bookings` in `updateBookingSettingsAction` payload handling.

Do not add service-level capacity or staff/resource selectors in this task. If a business needs device-specific limits today, the recommended setting remains `1` until a resource model is designed.

**Step 4: Verify**

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/settings-surface.test.ts src/lib/calendar/actions.test.ts
```

Expected: PASS.

---

### Task 4: Add Settings > Calendar UI for the simple capacity field

**Files:**
- Modify: `src/components/settings/CalendarSettingsClient.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `src/i18n/messages.test.ts`

**Step 1: Write source/i18n checks first**

Add or extend coverage that verifies the new TR/EN keys exist and the general settings form references them.

Suggested keys:

```json
"maxConcurrentBookings": "Maximum bookings at the same time",
"maxConcurrentBookingsHelp": "Set how many appointments can run at the same time in this workspace. Leave this at 1 when one person or one resource handles bookings."
```

Turkish:

```json
"maxConcurrentBookings": "Aynı anda en fazla randevu",
"maxConcurrentBookingsHelp": "Bu çalışma alanında aynı anda kaç randevu yürütülebileceğini belirler. Randevuları tek kişi veya tek kaynak yönetiyorsa 1 olarak bırakın."
```

**Step 2: Run**

```bash
npm test -- --run src/i18n/messages.test.ts
```

Expected: FAIL until keys are added.

**Step 3: Add the field**

Add a numeric `FieldInput` in the general booking rules grid. Validate `>= 1` and preferably cap client-side input to the database maximum of `50`. Save it through `updateBookingSettingsAction`.

**Step 4: Verify**

```bash
npm test -- --run src/i18n/messages.test.ts
npm run i18n:check
```

Expected: PASS.

---

### Task 5: Update AI scheduling copy and nearest-slot behavior

**Files:**
- Modify: `src/lib/ai/booking.ts`
- Modify: `src/lib/ai/booking-scheduling.test.ts`

**Step 1: Write failing tests**

Add tests for:

- `En yakın lazer randevusu ne zaman?` returns exactly two valid suggestions when availability returns at least two slots.
- The lookup for nearest availability does not start from the raw `now` minute and does not generate off-grid suggestion minutes.
- The nearest lookup searches a bounded forward horizon of `30` days before human handoff, instead of giving up after the first `7` days.
- Exact requested times and alternatives continue to use real availability results; if an exact requested time is off the configured slot grid, the assistant should offer real alternatives instead of confirming an odd-minute slot.
- TR copy includes the two concrete formatted options and a soft “başka seçeneklere de bakabiliriz” line.
- The suggested slots still come from `lookupBookingAvailability`; no static slot text is invented.

**Step 2: Run**

```bash
npm test -- --run src/lib/ai/booking-scheduling.test.ts
```

Expected: FAIL until nearest-slot behavior uses the new copy and limit.

**Step 3: Implement**

When there is strong booking intent and no exact requested time:

- Build the lookup range from the start of the current local day to `30` local days ahead.
- Request `suggestionLimit: 2`.
- Let `buildAvailabilitySlots` and `lookupBookingAvailability` handle slot-grid alignment, minimum notice, service duration, business hours, buffers, capacity, and Google busy overlay.
- Phrase the response as:

```ts
tr: `En yakın uygun seçenekler ${suggestionText}. Hangisi uygun? Dilerseniz başka saat ve seçeneklere de bakabiliriz.`
```

For exact-slot requests, keep the existing confirmation flow but require the returned exact slot to satisfy the same availability contract. If the customer gives an off-grid exact time, use the normal alternative suggestion copy rather than confirming it.

**Step 4: Verify**

```bash
npm test -- --run src/lib/ai/booking-scheduling.test.ts
```

Expected: PASS.

---

### Product follow-ups intentionally outside Phase 9.6

These came up during product review but should not block the simple capacity release:

- Manual booking creation currently starts at `10:00` by default. A later UX pass should prefill the next valid slot for the selected day/service, or at least use the first configured working-hour start.
- Editing a past booking currently hits the same past-date guard as creating a new booking. Status-only edits such as `completed` or `no_show` should be allowed without requiring the appointment to be in the future.
- `Settings > Calendar` exposes one working-hours window per day although the schema can support multiple windows. Split shifts and lunch breaks are useful for clinics and salons, but they add UI complexity and should be handled after capacity is stable.
- If `booking_enabled` is off and a customer asks for a booking, the assistant currently exits the scheduling branch. A later product decision should choose between a clear "online booking is closed" reply and human handoff.
- Service/resource-specific constraints remain deferred. Example: one laser device plus two general staff members cannot be modeled by a single workspace-wide capacity number.

---

### Task 6: End-to-end verification and docs

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted test suite**

```bash
npm test -- --run src/lib/calendar/availability.test.ts src/lib/calendar/bookings.test.ts src/lib/calendar/settings-surface.test.ts src/lib/calendar/actions.test.ts src/lib/ai/booking-scheduling.test.ts src/i18n/messages.test.ts
```

Expected: PASS.

**Step 2: Run required project verification**

```bash
npm run i18n:check
npm run build
git diff --check
```

Expected: PASS.

**Step 3: Update documentation**

Update:

- `docs/PRD.md`: calendar scheduling model and tech decision appendix.
- `docs/ROADMAP.md`: add Phase 9.6 capacity-aware booking checklist.
- `docs/RELEASE.md`: add a release note under `[Unreleased]`.

**Step 4: Commit**

```bash
git add docs/plans/2026-04-13-capacity-aware-booking-plan.md docs/PRD.md docs/ROADMAP.md docs/RELEASE.md
git commit -m "docs(phase-9.6): refine capacity booking plan"
```
