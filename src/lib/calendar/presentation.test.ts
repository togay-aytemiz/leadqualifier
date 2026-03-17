import { describe, expect, it } from 'vitest'
import type { CalendarBooking } from '@/types/database'
import {
  buildCalendarDataWindow,
  buildCalendarRange,
  filterCalendarBookings,
  getCalendarSummary,
  isoToLocalDateTimeParts,
  localDateTimeToIso,
  normalizeCalendarView,
  resolveDefaultCalendarView,
  shiftCalendarAnchor,
} from '@/lib/calendar/presentation'

function createBooking(overrides: Partial<CalendarBooking>): CalendarBooking {
  return {
    id: overrides.id ?? 'booking-1',
    organization_id: 'org-1',
    resource_key: 'default',
    conversation_id: null,
    lead_id: null,
    service_catalog_id: overrides.service_catalog_id ?? 'svc-1',
    service_name_snapshot: overrides.service_name_snapshot ?? 'Skin Care',
    provider: overrides.provider ?? null,
    provider_connection_id: overrides.provider_connection_id ?? null,
    provider_event_id: overrides.provider_event_id ?? null,
    status: overrides.status ?? 'confirmed',
    source: overrides.source ?? 'manual',
    channel: overrides.channel ?? 'manual',
    starts_at: overrides.starts_at ?? '2026-03-18T09:00:00.000Z',
    ends_at: overrides.ends_at ?? '2026-03-18T10:00:00.000Z',
    timezone: overrides.timezone ?? 'Europe/Istanbul',
    duration_minutes: overrides.duration_minutes ?? 60,
    duration_source: overrides.duration_source ?? 'service_catalog',
    customer_name: overrides.customer_name ?? 'Ada',
    customer_phone: overrides.customer_phone ?? null,
    notes: overrides.notes ?? null,
    sync_status: overrides.sync_status ?? 'not_synced',
    metadata: overrides.metadata ?? {},
    created_by: overrides.created_by ?? null,
    canceled_at: overrides.canceled_at ?? null,
    created_at: overrides.created_at ?? '2026-03-17T09:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-03-17T09:00:00.000Z',
  }
}

describe('calendar presentation helpers', () => {
  it('normalizes view names and resolves responsive defaults', () => {
    expect(normalizeCalendarView('month')).toBe('month')
    expect(normalizeCalendarView('unknown')).toBe('week')
    expect(resolveDefaultCalendarView(false)).toBe('week')
    expect(resolveDefaultCalendarView(true)).toBe('agenda')
  })

  it('builds timezone-aware ranges and navigation anchors', () => {
    const weekRange = buildCalendarRange({
      anchorDate: '2026-03-18',
      view: 'week',
      timeZone: 'Europe/Istanbul',
    })

    expect(weekRange.rangeStartIso).toBe('2026-03-15T21:00:00.000Z')
    expect(weekRange.rangeEndIso).toBe('2026-03-22T21:00:00.000Z')
    expect(
      shiftCalendarAnchor({
        anchorDate: '2026-03-18',
        view: 'week',
        direction: 'next',
      })
    ).toBe('2026-03-25')
    expect(
      shiftCalendarAnchor({
        anchorDate: '2026-03-18',
        view: 'month',
        direction: 'prev',
      })
    ).toBe('2026-02-18')
  })

  it('builds a buffered month-grid data window so calendar navigation can stay client-side inside the loaded window', () => {
    const dataWindow = buildCalendarDataWindow({
      anchorDate: '2026-03-18',
      timeZone: 'Europe/Istanbul',
    })

    expect(dataWindow.rangeStartIso).toBe('2026-01-25T21:00:00.000Z')
    expect(dataWindow.rangeEndIso).toBe('2026-05-03T21:00:00.000Z')
  })

  it('round-trips local date/time parts in the organization timezone', () => {
    const iso = localDateTimeToIso({
      date: '2026-03-20',
      time: '15:30',
      timeZone: 'Europe/Istanbul',
    })

    expect(iso).toBe('2026-03-20T12:30:00.000Z')
    expect(isoToLocalDateTimeParts(iso, 'Europe/Istanbul')).toEqual({
      date: '2026-03-20',
      time: '15:30',
    })
  })

  it('filters bookings across status, service, source, and channel', () => {
    const bookings = [
      createBooking({
        id: 'booking-1',
        service_catalog_id: 'svc-1',
        source: 'manual',
        channel: 'manual',
        status: 'confirmed',
      }),
      createBooking({
        id: 'booking-2',
        service_catalog_id: 'svc-2',
        source: 'ai',
        channel: 'whatsapp',
        status: 'pending',
      }),
    ]

    const filtered = filterCalendarBookings(bookings, {
      status: 'pending',
      serviceCatalogId: 'svc-2',
      source: 'ai',
      channel: 'whatsapp',
    })

    expect(filtered.map((booking) => booking.id)).toEqual(['booking-2'])
  })

  it('summarizes today, this week, and the next booking', () => {
    const bookings = [
      createBooking({
        id: 'booking-1',
        starts_at: '2099-03-17T09:00:00.000Z',
        ends_at: '2099-03-17T10:00:00.000Z',
      }),
      createBooking({
        id: 'booking-2',
        starts_at: '2099-03-18T09:00:00.000Z',
        ends_at: '2099-03-18T10:00:00.000Z',
      }),
    ]

    const summary = getCalendarSummary(bookings, 'UTC')

    expect(summary.upcomingCount).toBe(2)
    expect(summary.nextBooking?.id).toBe('booking-1')
    expect(summary.todayCount).toBeGreaterThanOrEqual(0)
    expect(summary.weekCount).toBeGreaterThanOrEqual(0)
  })
})
