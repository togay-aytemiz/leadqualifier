# Calendar / Booking Design

**Date:** 2026-03-17

**Context:** `Calendar / booking integration` is currently listed under `Post-MVP (Future)` in the roadmap and out of MVP in `AGENTS.md`. This iteration is a deliberate scope expansion for pilot readiness, so the product docs must explicitly move the feature into an active phase instead of silently treating it as existing MVP scope.

## Goals

- Add a first-class in-app calendar surface that works even when no external calendar is connected.
- Reuse the existing `service_catalog` as the canonical appointment-service model.
- Let AI check availability, suggest real slots, and create bookings only when service and timing are sufficiently clear.
- Support Google Calendar as the first provider without making Google the source of truth.
- Keep the v1 model expandable to future multi-staff scheduling without shipping staff complexity now.

## Recommended v1

Use **internal booking records as the source of truth**, layered with:

- org-level scheduling settings
- org-level weekly availability windows
- service-level default duration overrides on `service_catalog`
- optional Google Calendar free/busy overlay
- optional controlled Google event mirroring for bookings created/updated/canceled inside Qualy

This is the smallest correct scope because:

- the product still works without Google
- conflict rules stay deterministic inside our own database
- duplicate prevention stays under our control
- future providers can plug into the same availability boundary

## Deliberate Non-Goals for v1

- full two-way sync from Google into internal bookings
- staff-level scheduling and dispatch boards
- recurring appointment series
- drag/drop calendar board
- multi-provider integration suite
- claiming to support arbitrary external event edits safely

## Product Decisions

### Resource model

V1 is **org-level single scheduling resource**. Every booking belongs to one organization-level calendar resource (`org:primary`). The schema will include a resource key so future staff calendars can be added without breaking existing constraints.

### Source of truth

Internal `calendar_bookings` are authoritative. Google is:

- a busy overlay for availability checks
- a write-through destination for mirrored appointments when connected

We do **not** import arbitrary external Google events as editable internal bookings in v1. That would create unclear ownership and duplicate/conflict risk.

### Google sync ownership

If a booking is created in-app and Google mirroring is enabled, we create one Google event and persist its provider event id. Update/cancel flows operate only on the mirrored event we own. External Google events remain busy overlays only.

### Conflict policy

Availability is granted only when:

- the requested time fits internal working windows
- the booking does not overlap active internal bookings for the same resource
- the slot respects minimum notice and buffer rules
- Google free/busy does not mark the range busy when a Google connection is active

### Service duration policy

Each `service_catalog` item can define `duration_minutes`. When missing, availability uses org-level `default_booking_duration_minutes`. Every booking stores:

- `duration_minutes`
- `duration_source` = `service_catalog` or `organization_default`

This keeps fallback explicit and audit-friendly.

### AI safety policy

The assistant must not suggest slots using the wrong duration. If service resolution is ambiguous:

- first clarify the service against the canonical catalog when possible
- otherwise use a safe clarification/handoff response instead of promising availability

Only when service/duration is resolved can the assistant propose real slots.

## Data Model

### Extend `service_catalog`

- `duration_minutes INT NULL`
- `duration_updated_at TIMESTAMPTZ NULL`

### New public tables

1. `booking_settings`
- one row per org
- timezone
- default booking duration
- slot interval
- minimum notice
- buffer before / after
- booking enabled flag
- Google busy overlay enabled flag
- Google write-through enabled flag

2. `booking_availability_rules`
- multiple weekly windows per org
- `day_of_week`
- `start_minute`
- `end_minute`
- `label`
- `active`

3. `calendar_connections`
- public, sanitized metadata only
- provider = `google`
- status = `disconnected | pending | active | error`
- sync mode metadata
- external account email
- primary calendar id
- last sync status/time

4. `calendar_connection_secrets`
- service-role/server-only token storage
- access token, refresh token, expiry, scopes

5. `calendar_bookings`
- canonical appointment record
- `organization_id`
- `resource_key` default `org:primary`
- `conversation_id`, `lead_id`
- `service_catalog_id`, `service_name_snapshot`
- `starts_at`, `ends_at`
- `timezone`
- `duration_minutes`, `duration_source`
- `status`
- `source`
- `channel`
- `customer_name`, `customer_phone`
- Google provider metadata (`provider`, `provider_connection_id`, `provider_event_id`, `sync_status`)
- freeform metadata JSON

### Constraints

- RLS on all public tables with `organization_id`
- exclusion constraint on active `calendar_bookings` by `resource_key` and time range to prevent double booking
- unique partial index on provider-owned mirrored event ids to prevent duplicate writes

## Application Surfaces

### Main route

Add `/calendar` as a first-class dashboard route.

Desktop:
- add sidebar entry in `Workspace`
- calendar page supports day / week / month / agenda

Mobile:
- add `Calendar` as a direct bottom-nav item
- move `Leads` into the `Other` sheet to keep 4-item bottom navigation
- keep the calendar page mobile-first, not a squeezed desktop grid

### Page structure

- top summary with `Today` and `This week`
- schedule health card with availability/connect state
- filters for status, service, source, channel
- responsive main view switcher
- booking detail sheet/modal
- create / reschedule / cancel actions

### No-Google behavior

Users can fully manage:

- business hours
- slot rules
- service durations
- internal bookings
- agenda visibility

### With Google behavior

Users additionally get:

- busy overlay in availability calculation
- connect status in settings and calendar header
- mirrored Google events for internal bookings we own

## AI Integration Design

Add a scheduling-aware layer before the generic skill / KB response path for strong booking intent.

Flow:

1. detect booking intent from the latest user turn plus recent context
2. resolve candidate service against canonical `service_catalog`
3. if service ambiguous, ask for the service first
4. parse requested time window
5. compute real availability using scheduling settings + internal bookings + Google busy
6. if exact slot unavailable, suggest 2-3 nearby valid alternatives
7. if user confirms, create internal booking and optionally mirror to Google
8. if confidence is low or runtime errors occur, avoid promises and hand off safely

This logic should live in a dedicated scheduling module, not be scattered through the lead-extraction prompt.

## Testing Strategy

- unit tests for service duration resolution and fallback
- unit tests for time-window generation and availability checks
- unit tests for overlap and double-booking guards
- unit tests for timezone and minimum-notice behavior
- server-action tests for booking CRUD and Google connection edge cases
- AI-focused tests for booking intent detection, service ambiguity, slot alternatives, confirmation, and handoff
- navigation/helper tests for new desktop/mobile calendar entry points

## Runtime / Env Expectations

V1 should ship with graceful degradation when Google credentials are missing.

Expected envs:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`

If these are absent, in-app scheduling still works and Google connect UI should explain that the integration is unavailable in the current environment.
