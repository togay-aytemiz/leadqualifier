# Calendar Booking Modal Override Implementation Plan

**Goal:** Let operators override booking duration in the calendar modal, capture customer email explicitly, and clean up select chevron spacing with a reusable select primitive.

**Architecture:** Keep the modal on the existing `/calendar` client surface, but extend the booking payload and persistence layer so duration overrides and customer email are first-class booking fields instead of UI-only state. Add one shared select primitive in the design layer and reuse it in the calendar workspace so chevron spacing is controlled centrally.

**Tech Stack:** Next.js App Router, React client components, Supabase/Postgres, Vitest, next-intl

---

### Task 1: Add failing regression coverage

**Files:**
- Modify: `src/lib/calendar/bookings.test.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.test.ts`

**Step 1: Write failing tests**

- Add a booking persistence test that expects manual duration override + customer email to be persisted as first-class booking data.
- Add a calendar source test that expects the modal to expose editable duration + customer email fields and use the shared select primitive.

**Step 2: Run the focused tests**

```bash
npm test -- --run src/lib/calendar/bookings.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts'
```

### Task 2: Extend booking persistence

**Files:**
- Modify: `src/lib/calendar/types.ts`
- Modify: `src/lib/calendar/bookings.ts`
- Modify: `src/types/database.ts`
- Create: `supabase/migrations/00096_calendar_booking_contact_email_and_manual_duration.sql`

**Step 1: Add schema support**

- Add `customer_email` to `calendar_bookings`.
- Extend booking duration source support so manual overrides persist explicitly.

**Step 2: Update runtime**

- Accept `customerEmail` and `durationMinutes` in booking create/update inputs.
- Persist manual duration overrides consistently and include customer email in Google event descriptions.

### Task 3: Update modal UI and shared select styling

**Files:**
- Modify: `src/design/primitives.tsx`
- Modify: `src/design/index.ts`
- Modify: `src/components/calendar/CalendarClient.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Add reusable select primitive**

- Create a shared select component with consistent right padding and a centered chevron.

**Step 2: Update booking modal**

- Replace read-only duration preview with an editable duration input seeded from the selected service/default.
- Add customer email input.
- Reuse the shared select primitive in the modal and calendar filters.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

```bash
npm test -- --run src/lib/calendar/bookings.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts'
npm run i18n:check
npm run build
git diff --check
```

**Step 2: Update docs**

- Record manual duration override, customer email capture, and select polish in roadmap, PRD, and release notes.
