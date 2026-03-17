import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  deleteGoogleCalendarEventMock,
  updateGoogleCalendarEventMock,
  queryGoogleFreeBusyMock,
  createGoogleCalendarEventMock,
  fetchGooglePrimaryCalendarMock,
  refreshGoogleAccessTokenMock,
} = vi.hoisted(() => ({
  deleteGoogleCalendarEventMock: vi.fn(),
  updateGoogleCalendarEventMock: vi.fn(),
  queryGoogleFreeBusyMock: vi.fn(),
  createGoogleCalendarEventMock: vi.fn(),
  fetchGooglePrimaryCalendarMock: vi.fn(),
  refreshGoogleAccessTokenMock: vi.fn(),
}))

const { createServiceRoleClientMock } = vi.hoisted(() => ({
  createServiceRoleClientMock: vi.fn(),
}))

vi.mock('@/lib/calendar/google', () => ({
  createGoogleCalendarEvent: createGoogleCalendarEventMock,
  deleteGoogleCalendarEvent: deleteGoogleCalendarEventMock,
  fetchGooglePrimaryCalendar: fetchGooglePrimaryCalendarMock,
  queryGoogleFreeBusy: queryGoogleFreeBusyMock,
  refreshGoogleAccessToken: refreshGoogleAccessTokenMock,
  updateGoogleCalendarEvent: updateGoogleCalendarEventMock,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

import {
  cancelCalendarBookingRecord,
  createCalendarBookingRecord,
  disconnectGoogleCalendarConnection,
  lookupBookingAvailability,
} from '@/lib/calendar/bookings'

function createMaybeSingleBuilder(result: unknown, error: { message?: string } | null = null) {
  const maybeSingleMock = vi.fn(async () => ({ data: result, error }))
  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.maybeSingle = maybeSingleMock

  return {
    builder,
    maybeSingleMock,
  }
}

function createSingleSelectBuilder(result: unknown, error: { message?: string } | null = null) {
  const singleMock = vi.fn(async () => ({ data: result, error }))
  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.single = singleMock

  return {
    builder,
    singleMock,
  }
}

function createUpdateSelectBuilder(result: unknown, error: { message?: string } | null = null) {
  const singleMock = vi.fn(async () => ({ data: result, error }))
  const selectMock = vi.fn(() => ({ single: singleMock }))
  const eqIdMock = vi.fn(() => ({ select: selectMock }))
  const eqOrgMock = vi.fn(() => ({ eq: eqIdMock }))
  const updateMock = vi.fn(() => ({ eq: eqOrgMock }))

  return {
    builder: {
      update: updateMock,
    },
    updateMock,
    singleMock,
  }
}

function createInsertSelectBuilder(result: unknown, error: { message?: string } | null = null) {
  const singleMock = vi.fn(async () => ({ data: result, error }))
  const selectMock = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectMock }))

  return {
    builder: {
      insert: insertMock,
    },
    insertMock,
    singleMock,
  }
}

function createOrderedListBuilder(result: unknown, error: { message?: string } | null = null) {
  const secondOrderMock = vi.fn(async () => ({ data: result, error }))
  const firstOrderMock = vi.fn(() => ({ order: secondOrderMock }))
  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.order = firstOrderMock

  return {
    builder,
    orderMock: secondOrderMock,
  }
}

function createBlockedRangesBuilder(result: unknown, error: { message?: string } | null = null) {
  const gtMock = vi.fn(async () => ({ data: result, error }))
  const ltMock = vi.fn(() => ({ gt: gtMock }))
  const inMock = vi.fn(() => ({ lt: ltMock }))
  const neqMock = vi.fn(() => ({ in: inMock, lt: ltMock }))
  const eqMock = vi.fn(() => ({
    in: inMock,
    lt: ltMock,
    neq: neqMock,
  }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))

  return {
    builder: {
      select: selectMock,
    },
    gtMock,
  }
}

function createFutureMirroredBookingsBuilder(
  result: unknown,
  error: { message?: string } | null = null
) {
  const orderMock = vi.fn(async () => ({ data: result, error }))
  const gteMock = vi.fn(() => ({ order: orderMock }))
  const inMock = vi.fn(() => ({ gte: gteMock }))
  const eqProviderConnectionMock = vi.fn(() => ({ in: inMock }))
  const eqOrganizationMock = vi.fn(() => ({ eq: eqProviderConnectionMock }))
  const selectMock = vi.fn(() => ({ eq: eqOrganizationMock }))

  return {
    builder: {
      select: selectMock,
    },
    orderMock,
  }
}

function createUpdateInBuilder(error: { message?: string } | null = null) {
  const inMock = vi.fn(async () => ({ error }))
  const eqMock = vi.fn(() => ({ in: inMock }))
  const updateMock = vi.fn(() => ({ eq: eqMock }))

  return {
    builder: {
      update: updateMock,
    },
    updateMock,
    inMock,
  }
}

function createSupabaseMock(plan: Record<string, Array<Record<string, unknown>>>) {
  return {
    from: vi.fn((table: string) => {
      const queue = plan[table]
      if (!queue || queue.length === 0) {
        throw new Error(`Unexpected query for table: ${table}`)
      }

      const next = queue.shift()
      if (!next) {
        throw new Error(`Missing query builder for table: ${table}`)
      }

      return next
    }),
  }
}

function createServiceRoleSecretsClient(secrets: unknown) {
  const maybeSingleMock = vi.fn(async () => ({ data: secrets, error: null }))
  const deleteEqMock = vi.fn(async () => ({ error: null }))
  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.maybeSingle = maybeSingleMock
  builder.delete = vi.fn(() => ({ eq: deleteEqMock }))

  return {
    schema: vi.fn(() => ({
      from: vi.fn(() => builder),
    })),
  }
}

describe('calendar bookings hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    createServiceRoleClientMock.mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects availability lookup when booking is disabled', async () => {
    const disabledSettings = createMaybeSingleBuilder({
      organization_id: 'org-1',
      booking_enabled: false,
      timezone: 'Europe/Istanbul',
      default_booking_duration_minutes: 60,
      slot_interval_minutes: 30,
      minimum_notice_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      google_busy_overlay_enabled: true,
      google_write_through_enabled: false,
      created_at: '2026-03-17T10:00:00.000Z',
      updated_at: '2026-03-17T10:00:00.000Z',
    })

    const supabase = createSupabaseMock({
      booking_settings: [disabledSettings.builder],
    })

    await expect(
      lookupBookingAvailability(supabase as never, 'org-1', {
        rangeStartIso: '2026-03-18T09:00:00.000Z',
        rangeEndIso: '2026-03-18T18:00:00.000Z',
        serviceCatalogId: 'svc-1',
      })
    ).rejects.toThrow('Booking is disabled')
  })

  it('rejects manual booking creation when booking is disabled', async () => {
    const disabledSettings = createMaybeSingleBuilder({
      organization_id: 'org-1',
      booking_enabled: false,
      timezone: 'Europe/Istanbul',
      default_booking_duration_minutes: 60,
      slot_interval_minutes: 30,
      minimum_notice_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      google_busy_overlay_enabled: true,
      google_write_through_enabled: false,
      created_at: '2026-03-17T10:00:00.000Z',
      updated_at: '2026-03-17T10:00:00.000Z',
    })

    const supabase = createSupabaseMock({
      booking_settings: [disabledSettings.builder],
    })

    await expect(
      createCalendarBookingRecord(
        supabase as never,
        'org-1',
        {
          serviceCatalogId: null,
          startsAt: '2026-03-18T10:00:00.000Z',
          source: 'manual',
          channel: 'manual',
        },
        'user-1'
      )
    ).rejects.toThrow('Booking is disabled')
  })

  it('does not mark an exact requested slot as available when it falls inside minimum notice', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T10:00:00.000Z'))

    const settingsLookup = createMaybeSingleBuilder({
      organization_id: 'org-1',
      booking_enabled: true,
      timezone: 'UTC',
      default_booking_duration_minutes: 60,
      slot_interval_minutes: 30,
      minimum_notice_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      google_busy_overlay_enabled: false,
      google_write_through_enabled: false,
      created_at: '2026-03-17T10:00:00.000Z',
      updated_at: '2026-03-17T10:00:00.000Z',
    })
    const rulesLookup = createOrderedListBuilder([
      {
        id: 'rule-1',
        organization_id: 'org-1',
        day_of_week: 2,
        start_minute: 0,
        end_minute: 1440,
        label: 'Tuesday',
        active: true,
        created_at: '2026-03-17T10:00:00.000Z',
        updated_at: '2026-03-17T10:00:00.000Z',
      },
    ])
    const connectionLookup = createMaybeSingleBuilder(null)
    const blockedRangesLookup = createBlockedRangesBuilder([])

    const supabase = createSupabaseMock({
      booking_settings: [settingsLookup.builder],
      booking_availability_rules: [rulesLookup.builder],
      calendar_connections: [connectionLookup.builder],
      calendar_bookings: [blockedRangesLookup.builder],
    })

    const result = await lookupBookingAvailability(supabase as never, 'org-1', {
      rangeStartIso: '2026-03-17T10:00:00.000Z',
      rangeEndIso: '2026-03-17T18:00:00.000Z',
      requestedStartIso: '2026-03-17T10:30:00.000Z',
      serviceCatalogId: null,
    })

    expect(result.exactMatchAvailable).toBe(false)
    expect(result.availableSlots[0]).toBe('2026-03-17T11:00:00.000Z')
  })

  it('rejects booking creation inside minimum notice instead of bypassing the rule on direct writes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T10:00:00.000Z'))

    const settingsLookup = createMaybeSingleBuilder({
      organization_id: 'org-1',
      booking_enabled: true,
      timezone: 'UTC',
      default_booking_duration_minutes: 60,
      slot_interval_minutes: 30,
      minimum_notice_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      google_busy_overlay_enabled: false,
      google_write_through_enabled: false,
      created_at: '2026-03-17T10:00:00.000Z',
      updated_at: '2026-03-17T10:00:00.000Z',
    })
    const rulesLookup = createOrderedListBuilder([
      {
        id: 'rule-1',
        organization_id: 'org-1',
        day_of_week: 3,
        start_minute: 0,
        end_minute: 1440,
        label: 'Wednesday',
        active: true,
        created_at: '2026-03-17T10:00:00.000Z',
        updated_at: '2026-03-17T10:00:00.000Z',
      },
    ])
    const connectionLookup = createMaybeSingleBuilder(null)
    const blockedRangesLookup = createBlockedRangesBuilder([])

    const supabase = createSupabaseMock({
      booking_settings: [settingsLookup.builder],
      booking_availability_rules: [rulesLookup.builder],
      calendar_connections: [connectionLookup.builder],
      calendar_bookings: [blockedRangesLookup.builder],
    })

    await expect(
      createCalendarBookingRecord(
        supabase as never,
        'org-1',
        {
          serviceCatalogId: null,
          startsAt: '2026-03-17T10:30:00.000Z',
          source: 'manual',
          channel: 'manual',
        },
        'user-1'
      )
    ).rejects.toThrow('Requested slot is not available')
  })

  it('persists manual duration override and customer email as first-class booking data', async () => {
    const settingsLookup = createMaybeSingleBuilder({
      organization_id: 'org-1',
      booking_enabled: true,
      timezone: 'Europe/Istanbul',
      default_booking_duration_minutes: 60,
      slot_interval_minutes: 30,
      minimum_notice_minutes: 0,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      google_busy_overlay_enabled: false,
      google_write_through_enabled: false,
      created_at: '2026-03-17T10:00:00.000Z',
      updated_at: '2026-03-17T10:00:00.000Z',
    })
    const rulesLookup = createOrderedListBuilder([
      {
        id: 'rule-1',
        organization_id: 'org-1',
        day_of_week: 3,
        start_minute: 0,
        end_minute: 1440,
        label: 'Wednesday',
        active: true,
        created_at: '2026-03-17T10:00:00.000Z',
        updated_at: '2026-03-17T10:00:00.000Z',
      },
    ])
    const connectionLookup = createMaybeSingleBuilder(null)
    const blockedRangesLookup = createBlockedRangesBuilder([])
    const insertBooking = createInsertSelectBuilder({
      id: 'booking-override-1',
      organization_id: 'org-1',
      starts_at: '2026-03-18T10:00:00.000Z',
      ends_at: '2026-03-18T11:30:00.000Z',
      duration_minutes: 90,
      duration_source: 'manual_override',
      customer_email: 'ada@example.com',
      sync_status: 'not_synced',
    })

    const supabase = createSupabaseMock({
      booking_settings: [settingsLookup.builder],
      booking_availability_rules: [rulesLookup.builder],
      calendar_connections: [connectionLookup.builder],
      calendar_bookings: [blockedRangesLookup.builder, insertBooking.builder],
    })

    await createCalendarBookingRecord(
      supabase as never,
      'org-1',
      {
        serviceCatalogId: null,
        startsAt: '2026-03-18T10:00:00.000Z',
        durationMinutes: 90,
        customerEmail: 'ada@example.com',
        source: 'manual',
        channel: 'manual',
      },
      'user-1'
    )

    expect(insertBooking.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: 'ada@example.com',
        duration_minutes: 90,
        duration_source: 'manual_override',
        ends_at: '2026-03-18T11:30:00.000Z',
      })
    )
  })

  it('deletes an already mirrored Google event on cancel even after write-through is disabled', async () => {
    const existingBookingLookup = createSingleSelectBuilder({
      id: 'booking-1',
      organization_id: 'org-1',
      provider_event_id: 'google-event-1',
      status: 'confirmed',
      sync_status: 'synced',
    })
    const canceledBookingUpdate = createUpdateSelectBuilder({
      id: 'booking-1',
      organization_id: 'org-1',
      provider_event_id: 'google-event-1',
      status: 'canceled',
      sync_status: 'pending',
      canceled_at: '2026-03-17T12:00:00.000Z',
    })
    const syncedBookingUpdate = createUpdateSelectBuilder({
      id: 'booking-1',
      organization_id: 'org-1',
      provider_event_id: 'google-event-1',
      status: 'canceled',
      sync_status: 'synced',
      canceled_at: '2026-03-17T12:00:00.000Z',
    })
    const settingsLookup = createMaybeSingleBuilder({
      organization_id: 'org-1',
      booking_enabled: true,
      timezone: 'Europe/Istanbul',
      default_booking_duration_minutes: 60,
      slot_interval_minutes: 30,
      minimum_notice_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      google_busy_overlay_enabled: true,
      google_write_through_enabled: false,
      created_at: '2026-03-17T10:00:00.000Z',
      updated_at: '2026-03-17T10:00:00.000Z',
    })
    const connectionLookup = createMaybeSingleBuilder({
      id: 'connection-1',
      organization_id: 'org-1',
      provider: 'google',
      status: 'active',
      primary_calendar_id: 'primary',
    })

    createServiceRoleClientMock.mockReturnValue(
      createServiceRoleSecretsClient({
        connection_id: 'connection-1',
        provider: 'google',
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_at: '2099-03-17T12:00:00.000Z',
        scopes: ['calendar'],
      })
    )

    const supabase = createSupabaseMock({
      calendar_bookings: [
        existingBookingLookup.builder,
        canceledBookingUpdate.builder,
        syncedBookingUpdate.builder,
      ],
      booking_settings: [settingsLookup.builder],
      calendar_connections: [connectionLookup.builder],
    })

    await cancelCalendarBookingRecord(supabase as never, 'org-1', 'booking-1')

    expect(deleteGoogleCalendarEventMock).toHaveBeenCalledWith({
      accessToken: 'access-token',
      calendarId: 'primary',
      eventId: 'google-event-1',
    })
  })

  it('cleans up mirrored future Google events before disconnecting the connection', async () => {
    const connection = {
      id: 'connection-1',
      organization_id: 'org-1',
      provider: 'google' as const,
      status: 'active' as const,
      sync_mode: 'write_through' as const,
      external_account_id: 'acct-1',
      external_account_email: 'calendar@example.com',
      primary_calendar_id: 'primary',
      scopes: ['calendar'],
      last_sync_at: null,
      last_sync_status: null,
      last_sync_error: null,
      connected_by: 'user-1',
      connected_at: '2026-03-17T09:00:00.000Z',
      disconnected_at: null,
      created_at: '2026-03-17T09:00:00.000Z',
      updated_at: '2026-03-17T09:00:00.000Z',
    }
    const mirroredBookingsLookup = createFutureMirroredBookingsBuilder([
      {
        id: 'booking-1',
        organization_id: 'org-1',
        provider: 'google',
        provider_connection_id: 'connection-1',
        provider_event_id: 'google-event-1',
        status: 'confirmed',
        ends_at: '2026-03-18T12:00:00.000Z',
      },
    ])
    const mirroredBookingsCleanup = createUpdateInBuilder()
    const disconnectedConnectionUpdate = createUpdateSelectBuilder({
      ...connection,
      status: 'disconnected',
      sync_mode: 'busy_overlay',
      disconnected_at: '2026-03-17T12:00:00.000Z',
    })

    createServiceRoleClientMock.mockReturnValue(
      createServiceRoleSecretsClient({
        connection_id: 'connection-1',
        provider: 'google',
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_at: '2099-03-17T12:00:00.000Z',
        scopes: ['calendar'],
      })
    )

    const supabase = createSupabaseMock({
      calendar_bookings: [mirroredBookingsLookup.builder, mirroredBookingsCleanup.builder],
      calendar_connections: [disconnectedConnectionUpdate.builder],
    })

    await disconnectGoogleCalendarConnection(supabase as never, 'org-1', connection)

    expect(deleteGoogleCalendarEventMock).toHaveBeenCalledWith({
      accessToken: 'access-token',
      calendarId: 'primary',
      eventId: 'google-event-1',
    })
    expect(mirroredBookingsCleanup.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: null,
        provider_connection_id: null,
        provider_event_id: null,
        sync_status: 'not_synced',
      })
    )
    expect(disconnectedConnectionUpdate.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'disconnected',
        sync_mode: 'busy_overlay',
      })
    )
  })
})
