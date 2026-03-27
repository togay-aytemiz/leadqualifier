import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  buildAvailabilitySlots,
  findAlternativeAvailabilitySlots,
  isSlotAvailable,
  isSlotWithinAvailabilityRules,
  type BookingBusyRange,
  type WeeklyAvailabilityRule,
} from '@/lib/calendar/availability'
import { resolveBookingDuration } from '@/lib/calendar/service-duration'
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  fetchGooglePrimaryCalendar,
  queryGoogleFreeBusy,
  refreshGoogleAccessToken,
  updateGoogleCalendarEvent,
} from '@/lib/calendar/google'
import { resolveGoogleCalendarCredentials } from '@/lib/calendar/google-oauth'
import type {
  BookingAvailabilityLookupInput,
  CalendarAvailabilitySuggestion,
  CalendarPageData,
  CreateCalendarBookingInput,
  GoogleTokenPayload,
  UpdateCalendarBookingInput,
} from '@/lib/calendar/types'
import type {
  BookingAvailabilityRule,
  BookingSettings,
  CalendarBooking,
  CalendarConnection,
  ServiceCatalogItem,
} from '@/types/database'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

interface CalendarConnectionSecretRow {
  connection_id: string
  provider: 'google'
  access_token: string | null
  refresh_token: string | null
  token_type: string | null
  expires_at: string | null
  scopes: string[]
}

function ensureNoError(error: { message?: string } | null, context: string) {
  if (!error) return
  throw new Error(`${context}: ${error.message ?? 'Unknown Supabase error'}`)
}

function buildDefaultBookingSettings(organizationId: string): BookingSettings {
  const now = new Date().toISOString()
  return {
    organization_id: organizationId,
    booking_enabled: true,
    timezone: 'Europe/Istanbul',
    default_booking_duration_minutes: 60,
    slot_interval_minutes: 30,
    minimum_notice_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    google_busy_overlay_enabled: true,
    google_write_through_enabled: false,
    created_at: now,
    updated_at: now,
  }
}

function toWeeklyAvailabilityRule(rule: BookingAvailabilityRule): WeeklyAvailabilityRule {
  return {
    active: rule.active,
    dayOfWeek: rule.day_of_week,
    endMinute: rule.end_minute,
    startMinute: rule.start_minute,
  }
}

function addMinutesToIso(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function shouldTreatAsOverlapError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '23P01' || error.code === '23505'
}

function buildGoogleEventSummary(input: {
  serviceNameSnapshot: string | null
  customerName: string | null
}) {
  const serviceLabel = input.serviceNameSnapshot?.trim() || 'Booking'
  const customerLabel = input.customerName?.trim()
  return customerLabel ? `${serviceLabel} · ${customerLabel}` : serviceLabel
}

function buildGoogleEventDescription(input: {
  channel: CalendarBooking['channel']
  customerEmail: string | null
  customerPhone: string | null
  notes: string | null
}) {
  const lines = [
    input.channel ? `Channel: ${input.channel}` : null,
    input.customerEmail ? `Email: ${input.customerEmail}` : null,
    input.customerPhone ? `Customer: ${input.customerPhone}` : null,
    input.notes?.trim() ? input.notes.trim() : null,
  ].filter(Boolean)

  return lines.length > 0 ? lines.join('\n') : null
}

function getActiveGoogleCalendarId(connection: CalendarConnection | null) {
  if (!connection || connection.provider !== 'google' || connection.status !== 'active') {
    return null
  }

  return connection.primary_calendar_id?.trim() || 'primary'
}

function shouldMirrorToGoogle(connection: CalendarConnection | null, settings: BookingSettings) {
  if (!settings.google_write_through_enabled) return false
  return Boolean(getActiveGoogleCalendarId(connection))
}

function assertBookingEnabled(settings: BookingSettings) {
  if (!settings.booking_enabled) {
    throw new Error('Booking is disabled')
  }
}

function normalizePositiveMinuteValue(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0
  const normalized = Math.floor(Number(value))
  return normalized > 0 ? normalized : 0
}

function resolveRequestedBookingDuration(input: {
  organizationDefaultDurationMinutes: number
  serviceDurationMinutes: number | null | undefined
  requestedDurationMinutes?: number | null
  startsAt: string
  endsAt?: string | null
}) {
  const requestedDurationMinutes = normalizePositiveMinuteValue(input.requestedDurationMinutes)
  if (requestedDurationMinutes > 0) {
    return {
      durationMinutes: requestedDurationMinutes,
      source: 'manual_override' as const,
    }
  }

  if (input.endsAt) {
    const startsAtMs = new Date(input.startsAt).getTime()
    const endsAtMs = new Date(input.endsAt).getTime()
    const derivedDurationMinutes = Math.round((endsAtMs - startsAtMs) / 60_000)

    if (derivedDurationMinutes > 0) {
      return {
        durationMinutes: derivedDurationMinutes,
        source: 'manual_override' as const,
      }
    }
  }

  return resolveBookingDuration({
    organizationDefaultDurationMinutes: input.organizationDefaultDurationMinutes,
    serviceDurationMinutes: input.serviceDurationMinutes,
  })
}

function satisfiesMinimumNotice(
  settings: BookingSettings,
  bookingStartIso: string,
  now = new Date()
) {
  const minimumNoticeMinutes = normalizePositiveMinuteValue(settings.minimum_notice_minutes)
  if (minimumNoticeMinutes === 0) return true

  const minimumStartMs = now.getTime() + minimumNoticeMinutes * 60_000
  return new Date(bookingStartIso).getTime() >= minimumStartMs
}

function canSyncExistingGoogleMirror(
  connection: CalendarConnection | null,
  booking: Pick<CalendarBooking, 'provider' | 'provider_connection_id' | 'provider_event_id'>
) {
  if (!booking.provider_event_id) {
    return false
  }

  if (booking.provider && booking.provider !== 'google') {
    return false
  }

  if (!connection || connection.provider !== 'google') {
    return false
  }

  if (booking.provider_connection_id && booking.provider_connection_id !== connection.id) {
    return false
  }

  return Boolean(getActiveGoogleCalendarId(connection))
}

async function readCalendarConnectionSecrets(
  connectionId: string
): Promise<CalendarConnectionSecretRow | null> {
  const serviceSupabase = createServiceRoleClient()
  if (!serviceSupabase) return null

  const { data, error } = await serviceSupabase
    .schema('private')
    .from('calendar_connection_secrets')
    .select('connection_id, provider, access_token, refresh_token, token_type, expires_at, scopes')
    .eq('connection_id', connectionId)
    .maybeSingle()

  ensureNoError(error, 'Failed to read calendar connection secrets')
  return (data as CalendarConnectionSecretRow | null) ?? null
}

export async function upsertCalendarConnectionSecrets(
  connectionId: string,
  tokenPayload: GoogleTokenPayload
) {
  const serviceSupabase = createServiceRoleClient()
  if (!serviceSupabase) {
    throw new Error('Missing service-role configuration for calendar secrets')
  }

  const existing = await readCalendarConnectionSecrets(connectionId)
  const refreshToken = tokenPayload.refreshToken ?? existing?.refresh_token ?? null
  const scopes = tokenPayload.scopes.length > 0 ? tokenPayload.scopes : (existing?.scopes ?? [])

  const { error } = await serviceSupabase
    .schema('private')
    .from('calendar_connection_secrets')
    .upsert(
      {
        connection_id: connectionId,
        provider: 'google',
        access_token: tokenPayload.accessToken,
        refresh_token: refreshToken,
        token_type: tokenPayload.tokenType,
        expires_at: tokenPayload.expiresAt,
        scopes,
      },
      {
        onConflict: 'connection_id',
      }
    )

  ensureNoError(error, 'Failed to upsert calendar connection secrets')
}

export async function deleteCalendarConnectionSecrets(connectionId: string) {
  const serviceSupabase = createServiceRoleClient()
  if (!serviceSupabase) return

  const { error } = await serviceSupabase
    .schema('private')
    .from('calendar_connection_secrets')
    .delete()
    .eq('connection_id', connectionId)

  ensureNoError(error, 'Failed to delete calendar connection secrets')
}

async function ensureGoogleAccessToken(connection: CalendarConnection | null) {
  const connectionId = connection?.id ?? null
  if (!connectionId || connection?.provider !== 'google' || connection.status !== 'active') {
    return null
  }

  const secrets = await readCalendarConnectionSecrets(connectionId)
  if (!secrets) return null

  const now = Date.now()
  const expiresAtMs = secrets.expires_at
    ? new Date(secrets.expires_at).getTime()
    : Number.POSITIVE_INFINITY
  if (secrets.access_token && expiresAtMs > now + 60_000) {
    return {
      accessToken: secrets.access_token,
      scopes: secrets.scopes,
    }
  }

  const refreshToken = secrets.refresh_token
  const credentials = resolveGoogleCalendarCredentials()
  if (!refreshToken || !credentials.clientId || !credentials.clientSecret) {
    return secrets.access_token
      ? {
          accessToken: secrets.access_token,
          scopes: secrets.scopes,
        }
      : null
  }

  const refreshedToken = await refreshGoogleAccessToken({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken,
  })

  await upsertCalendarConnectionSecrets(connectionId, refreshedToken)

  return {
    accessToken: refreshedToken.accessToken,
    scopes: refreshedToken.scopes,
  }
}

export async function getBookingSettingsByOrganizationId(
  supabase: SupabaseClientLike,
  organizationId: string
) {
  const { data, error } = await supabase
    .from('booking_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  ensureNoError(error, 'Failed to load booking settings')
  return (data as BookingSettings | null) ?? buildDefaultBookingSettings(organizationId)
}

export async function getBookingAvailabilityRulesByOrganizationId(
  supabase: SupabaseClientLike,
  organizationId: string
) {
  const { data, error } = await supabase
    .from('booking_availability_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .order('day_of_week', { ascending: true })
    .order('start_minute', { ascending: true })

  ensureNoError(error, 'Failed to load booking availability rules')
  return (data ?? []) as BookingAvailabilityRule[]
}

export async function getCalendarConnectionByOrganizationId(
  supabase: SupabaseClientLike,
  organizationId: string
) {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('provider', 'google')
    .maybeSingle()

  ensureNoError(error, 'Failed to load calendar connection')
  return (data as CalendarConnection | null) ?? null
}

export async function getBookableServiceCatalogItemsByOrganizationId(
  supabase: SupabaseClientLike,
  organizationId: string
) {
  const { data, error } = await supabase
    .from('service_catalog')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name', { ascending: true })

  ensureNoError(error, 'Failed to load service catalog for booking')
  return (data ?? []) as ServiceCatalogItem[]
}

export async function listCalendarBookingsByRange(
  supabase: SupabaseClientLike,
  organizationId: string,
  input: {
    rangeStartIso: string
    rangeEndIso: string
  }
) {
  const { data, error } = await supabase
    .from('calendar_bookings')
    .select('*')
    .eq('organization_id', organizationId)
    .lt('starts_at', input.rangeEndIso)
    .gt('ends_at', input.rangeStartIso)
    .order('starts_at', { ascending: true })

  ensureNoError(error, 'Failed to load calendar bookings')
  return (data ?? []) as CalendarBooking[]
}

async function resolveServiceCatalogItem(
  supabase: SupabaseClientLike,
  organizationId: string,
  serviceCatalogId: string | null
) {
  if (!serviceCatalogId) return null

  const { data, error } = await supabase
    .from('service_catalog')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', serviceCatalogId)
    .eq('active', true)
    .maybeSingle()

  ensureNoError(error, 'Failed to load booking service catalog item')
  return (data as ServiceCatalogItem | null) ?? null
}

async function getBlockedRangesForLookup(
  supabase: SupabaseClientLike,
  organizationId: string,
  input: {
    rangeStartIso: string
    rangeEndIso: string
    settings: BookingSettings
    connection: CalendarConnection | null
    excludeBookingId?: string | null
  }
) {
  let query = supabase
    .from('calendar_bookings')
    .select('id, starts_at, ends_at')
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', input.rangeEndIso)
    .gt('ends_at', input.rangeStartIso)

  if (input.excludeBookingId) {
    query = query.neq('id', input.excludeBookingId)
  }

  const { data, error } = await query
  ensureNoError(error, 'Failed to load blocking calendar bookings')

  const blockedRanges: BookingBusyRange[] = (data ?? []).map((booking) => ({
    startIso: booking.starts_at,
    endIso: booking.ends_at,
    source: 'internal_booking',
  }))

  const googleCalendarId = getActiveGoogleCalendarId(input.connection)
  if (!googleCalendarId || !input.settings.google_busy_overlay_enabled) {
    return blockedRanges
  }

  const token = await ensureGoogleAccessToken(input.connection)
  if (!token?.accessToken) {
    return blockedRanges
  }

  try {
    const busyRanges = await queryGoogleFreeBusy({
      accessToken: token.accessToken,
      calendarId: googleCalendarId,
      timeMin: input.rangeStartIso,
      timeMax: input.rangeEndIso,
      timeZone: input.settings.timezone,
    })

    return blockedRanges.concat(
      busyRanges.map((range) => ({
        ...range,
        source: 'google_busy' as const,
      }))
    )
  } catch (error) {
    console.error('Failed to query Google Calendar freebusy', error)
    return blockedRanges
  }
}

export async function lookupBookingAvailability(
  supabase: SupabaseClientLike,
  organizationId: string,
  input: BookingAvailabilityLookupInput
): Promise<CalendarAvailabilitySuggestion> {
  const settings = await getBookingSettingsByOrganizationId(supabase, organizationId)
  assertBookingEnabled(settings)

  const [rules, connection, serviceCatalogItem] = await Promise.all([
    getBookingAvailabilityRulesByOrganizationId(supabase, organizationId),
    getCalendarConnectionByOrganizationId(supabase, organizationId),
    resolveServiceCatalogItem(supabase, organizationId, input.serviceCatalogId),
  ])

  const { durationMinutes, source } = resolveBookingDuration({
    organizationDefaultDurationMinutes: settings.default_booking_duration_minutes,
    serviceDurationMinutes: serviceCatalogItem?.duration_minutes,
  })

  const candidateSlots = buildAvailabilitySlots({
    minimumNoticeMinutes: settings.minimum_notice_minutes,
    nowIso: new Date().toISOString(),
    rangeEndIso: input.rangeEndIso,
    rangeStartIso: input.rangeStartIso,
    rules: rules.map(toWeeklyAvailabilityRule),
    serviceDurationMinutes: durationMinutes,
    slotIntervalMinutes: settings.slot_interval_minutes,
    timezone: settings.timezone,
  })

  const blockedRanges = await getBlockedRangesForLookup(supabase, organizationId, {
    rangeEndIso: input.rangeEndIso,
    rangeStartIso: input.rangeStartIso,
    settings,
    connection,
  })

  const availableSlots = candidateSlots.filter((slot) => {
    return isSlotAvailable({
      blockedRanges,
      bookingEndIso: addMinutesToIso(slot, durationMinutes),
      bookingStartIso: slot,
      bufferAfterMinutes: settings.buffer_after_minutes,
      bufferBeforeMinutes: settings.buffer_before_minutes,
    })
  })

  const requestedStartIso = input.requestedStartIso?.trim() || null
  const exactMatchAvailable = requestedStartIso
    ? satisfiesMinimumNotice(settings, requestedStartIso) &&
      isSlotWithinAvailabilityRules({
        bookingEndIso: addMinutesToIso(requestedStartIso, durationMinutes),
        bookingStartIso: requestedStartIso,
        rules: rules.map(toWeeklyAvailabilityRule),
        timezone: settings.timezone,
      }) &&
      isSlotAvailable({
        blockedRanges,
        bookingEndIso: addMinutesToIso(requestedStartIso, durationMinutes),
        bookingStartIso: requestedStartIso,
        bufferAfterMinutes: settings.buffer_after_minutes,
        bufferBeforeMinutes: settings.buffer_before_minutes,
      })
    : false

  const alternativeSlots = requestedStartIso
    ? findAlternativeAvailabilitySlots({
        candidateSlots: availableSlots,
        desiredStartIso: requestedStartIso,
        limit: input.suggestionLimit ?? 3,
      })
    : availableSlots.slice(0, input.suggestionLimit ?? 3)

  return {
    requestedStartIso,
    exactMatchAvailable,
    slotDurationMinutes: durationMinutes,
    durationSource: source,
    availableSlots,
    alternativeSlots,
  }
}

async function mirrorBookingToGoogle(
  supabase: SupabaseClientLike,
  booking: CalendarBooking,
  settings: BookingSettings,
  connection: CalendarConnection | null
) {
  const calendarId = getActiveGoogleCalendarId(connection)
  const shouldCreateOrMirror = shouldMirrorToGoogle(connection, settings)
  const shouldSyncExistingMirror = canSyncExistingGoogleMirror(connection, booking)

  if (!calendarId || (!shouldCreateOrMirror && !shouldSyncExistingMirror)) {
    return booking
  }

  const token = await ensureGoogleAccessToken(connection)
  if (!token?.accessToken || !connection) {
    return booking
  }

  const eventInput = {
    accessToken: token.accessToken,
    calendarId,
    description: buildGoogleEventDescription({
      channel: booking.channel,
      customerEmail: booking.customer_email ?? null,
      customerPhone: booking.customer_phone ?? null,
      notes: booking.notes ?? null,
    }),
    endIso: booking.ends_at,
    startIso: booking.starts_at,
    summary: buildGoogleEventSummary({
      customerName: booking.customer_name ?? null,
      serviceNameSnapshot: booking.service_name_snapshot ?? null,
    }),
    timezone: booking.timezone,
  }

  try {
    if (booking.provider_event_id) {
      await updateGoogleCalendarEvent({
        ...eventInput,
        eventId: booking.provider_event_id,
      })

      const { data, error } = await supabase
        .from('calendar_bookings')
        .update({
          provider: 'google',
          provider_connection_id: connection.id,
          sync_status: 'synced',
        })
        .eq('id', booking.id)
        .eq('organization_id', booking.organization_id)
        .select('*')
        .single()

      ensureNoError(error, 'Failed to update mirrored booking sync state')
      return data as CalendarBooking
    }

    const providerEventId = await createGoogleCalendarEvent(eventInput)
    const { data, error } = await supabase
      .from('calendar_bookings')
      .update({
        provider: 'google',
        provider_connection_id: connection.id,
        provider_event_id: providerEventId,
        sync_status: 'synced',
      })
      .eq('id', booking.id)
      .eq('organization_id', booking.organization_id)
      .select('*')
      .single()

    ensureNoError(error, 'Failed to persist mirrored booking event id')
    return data as CalendarBooking
  } catch (error) {
    console.error('Failed to mirror booking to Google Calendar', error)

    const { data, error: updateError } = await supabase
      .from('calendar_bookings')
      .update({
        provider: 'google',
        provider_connection_id: connection.id,
        sync_status: 'error',
      })
      .eq('id', booking.id)
      .eq('organization_id', booking.organization_id)
      .select('*')
      .single()

    ensureNoError(updateError, 'Failed to persist booking sync error state')
    return data as CalendarBooking
  }
}

function buildBookingInsertRecord(input: {
  organizationId: string
  booking: CreateCalendarBookingInput
  serviceCatalogItem: ServiceCatalogItem | null
  settings: BookingSettings
  createdBy: string | null
}) {
  const startsAt = new Date(input.booking.startsAt).toISOString()
  const resolvedDuration = resolveRequestedBookingDuration({
    organizationDefaultDurationMinutes: input.settings.default_booking_duration_minutes,
    requestedDurationMinutes: input.booking.durationMinutes,
    serviceDurationMinutes: input.serviceCatalogItem?.duration_minutes,
    startsAt,
    endsAt: input.booking.endsAt ?? null,
  })
  const endsAt = input.booking.durationMinutes
    ? addMinutesToIso(startsAt, resolvedDuration.durationMinutes)
    : input.booking.endsAt
      ? new Date(input.booking.endsAt).toISOString()
      : addMinutesToIso(startsAt, resolvedDuration.durationMinutes)

  return {
    record: {
      organization_id: input.organizationId,
      conversation_id: input.booking.conversationId ?? null,
      lead_id: input.booking.leadId ?? null,
      service_catalog_id: input.serviceCatalogItem?.id ?? input.booking.serviceCatalogId ?? null,
      service_name_snapshot:
        input.booking.serviceNameSnapshot ?? input.serviceCatalogItem?.name ?? null,
      status: 'confirmed' as const,
      source: input.booking.source ?? 'manual',
      channel: input.booking.channel ?? 'manual',
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: input.settings.timezone,
      duration_minutes: resolvedDuration.durationMinutes,
      duration_source: resolvedDuration.source,
      customer_name: input.booking.customerName ?? null,
      customer_email: input.booking.customerEmail ?? null,
      customer_phone: input.booking.customerPhone ?? null,
      notes: input.booking.notes ?? null,
      metadata: input.booking.metadata ?? {},
      created_by: input.createdBy,
      sync_status: shouldMirrorToGoogle(null, input.settings) ? 'pending' : 'not_synced',
    },
    resolvedDuration,
  }
}

async function assertRequestedBookingSlotAvailable(
  supabase: SupabaseClientLike,
  organizationId: string,
  input: {
    startsAt: string
    endsAt: string
    settings: BookingSettings
    rules: BookingAvailabilityRule[]
    connection: CalendarConnection | null
    excludeBookingId?: string | null
  }
) {
  if (!satisfiesMinimumNotice(input.settings, input.startsAt)) {
    throw new Error('Requested slot is not available')
  }

  const blockedRanges = await getBlockedRangesForLookup(supabase, organizationId, {
    rangeEndIso: input.endsAt,
    rangeStartIso: input.startsAt,
    settings: input.settings,
    connection: input.connection,
    excludeBookingId: input.excludeBookingId,
  })

  const withinRules = isSlotWithinAvailabilityRules({
    bookingEndIso: input.endsAt,
    bookingStartIso: input.startsAt,
    rules: input.rules.map(toWeeklyAvailabilityRule),
    timezone: input.settings.timezone,
  })

  const available = isSlotAvailable({
    blockedRanges,
    bookingEndIso: input.endsAt,
    bookingStartIso: input.startsAt,
    bufferAfterMinutes: input.settings.buffer_after_minutes,
    bufferBeforeMinutes: input.settings.buffer_before_minutes,
  })

  if (!withinRules || !available) {
    throw new Error('Requested slot is not available')
  }
}

async function listFutureMirroredBookingsByConnection(
  supabase: SupabaseClientLike,
  organizationId: string,
  connectionId: string
) {
  const { data, error } = await supabase
    .from('calendar_bookings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('provider_connection_id', connectionId)
    .in('status', ['pending', 'confirmed'])
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  ensureNoError(error, 'Failed to load mirrored bookings for disconnect')
  return ((data ?? []) as CalendarBooking[]).filter((booking) => Boolean(booking.provider_event_id))
}

export async function disconnectGoogleCalendarConnection(
  supabase: SupabaseClientLike,
  organizationId: string,
  connection: CalendarConnection
) {
  const mirroredFutureBookings = await listFutureMirroredBookingsByConnection(
    supabase,
    organizationId,
    connection.id
  )

  if (mirroredFutureBookings.length > 0) {
    const calendarId = getActiveGoogleCalendarId(connection)
    const token = await ensureGoogleAccessToken(connection)

    if (!calendarId || !token?.accessToken) {
      throw new Error(
        'Cannot disconnect Google Calendar while mirrored future bookings still need cleanup'
      )
    }

    for (const booking of mirroredFutureBookings) {
      if (!booking.provider_event_id) continue

      await deleteGoogleCalendarEvent({
        accessToken: token.accessToken,
        calendarId,
        eventId: booking.provider_event_id,
      })
    }

    const { error: cleanupError } = await supabase
      .from('calendar_bookings')
      .update({
        provider: null,
        provider_connection_id: null,
        provider_event_id: null,
        sync_status: 'not_synced',
      })
      .eq('organization_id', organizationId)
      .in(
        'id',
        mirroredFutureBookings.map((booking) => booking.id)
      )

    ensureNoError(cleanupError, 'Failed to clear mirrored booking metadata during disconnect')
  }

  const { data, error } = await supabase
    .from('calendar_connections')
    .update({
      disconnected_at: new Date().toISOString(),
      external_account_email: null,
      external_account_id: null,
      last_sync_error: null,
      last_sync_status: null,
      primary_calendar_id: null,
      scopes: [],
      status: 'disconnected',
      sync_mode: 'busy_overlay',
    })
    .eq('organization_id', organizationId)
    .eq('id', connection.id)
    .select('*')
    .single()

  ensureNoError(error, 'Failed to disconnect Google Calendar')
  await deleteCalendarConnectionSecrets(connection.id)
  return data as CalendarConnection
}

export async function createCalendarBookingRecord(
  supabase: SupabaseClientLike,
  organizationId: string,
  input: CreateCalendarBookingInput,
  createdBy: string | null
) {
  const settings = await getBookingSettingsByOrganizationId(supabase, organizationId)
  assertBookingEnabled(settings)

  const [rules, connection, serviceCatalogItem] = await Promise.all([
    getBookingAvailabilityRulesByOrganizationId(supabase, organizationId),
    getCalendarConnectionByOrganizationId(supabase, organizationId),
    resolveServiceCatalogItem(supabase, organizationId, input.serviceCatalogId),
  ])
  const { record } = buildBookingInsertRecord({
    organizationId,
    booking: input,
    serviceCatalogItem,
    settings,
    createdBy,
  })

  await assertRequestedBookingSlotAvailable(supabase, organizationId, {
    startsAt: record.starts_at,
    endsAt: record.ends_at,
    settings,
    rules,
    connection,
  })

  const { data, error } = await supabase
    .from('calendar_bookings')
    .insert({
      ...record,
      sync_status: shouldMirrorToGoogle(connection, settings) ? 'pending' : 'not_synced',
    })
    .select('*')
    .single()

  if (shouldTreatAsOverlapError(error)) {
    throw new Error('Double booking conflict')
  }

  ensureNoError(error, 'Failed to create calendar booking')
  return mirrorBookingToGoogle(supabase, data as CalendarBooking, settings, connection)
}

export async function updateCalendarBookingRecord(
  supabase: SupabaseClientLike,
  organizationId: string,
  input: UpdateCalendarBookingInput
) {
  const { data: existingBooking, error: existingBookingError } = await supabase
    .from('calendar_bookings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', input.bookingId)
    .single()

  ensureNoError(existingBookingError, 'Failed to load calendar booking for update')

  const settings = await getBookingSettingsByOrganizationId(supabase, organizationId)
  const rules = await getBookingAvailabilityRulesByOrganizationId(supabase, organizationId)
  const connection = await getCalendarConnectionByOrganizationId(supabase, organizationId)
  const nextServiceCatalogId =
    input.serviceCatalogId ?? (existingBooking.service_catalog_id as string | null)
  const serviceCatalogItem = await resolveServiceCatalogItem(
    supabase,
    organizationId,
    nextServiceCatalogId
  )

  const startsAt = new Date(input.startsAt).toISOString()
  const duration = resolveRequestedBookingDuration({
    organizationDefaultDurationMinutes: settings.default_booking_duration_minutes,
    requestedDurationMinutes: input.durationMinutes,
    serviceDurationMinutes: serviceCatalogItem?.duration_minutes,
    startsAt,
    endsAt: input.endsAt ?? null,
  })
  const endsAt = input.durationMinutes
    ? addMinutesToIso(startsAt, duration.durationMinutes)
    : input.endsAt
      ? new Date(input.endsAt).toISOString()
      : addMinutesToIso(startsAt, duration.durationMinutes)

  await assertRequestedBookingSlotAvailable(supabase, organizationId, {
    startsAt,
    endsAt,
    settings,
    rules,
    connection,
    excludeBookingId: input.bookingId,
  })

  const { data, error } = await supabase
    .from('calendar_bookings')
    .update({
      conversation_id: input.conversationId ?? existingBooking.conversation_id,
      lead_id: input.leadId ?? existingBooking.lead_id,
      service_catalog_id: serviceCatalogItem?.id ?? nextServiceCatalogId,
      service_name_snapshot:
        input.serviceNameSnapshot ??
        serviceCatalogItem?.name ??
        existingBooking.service_name_snapshot,
      starts_at: startsAt,
      ends_at: endsAt,
      duration_minutes: duration.durationMinutes,
      duration_source: duration.source,
      customer_name: input.customerName ?? existingBooking.customer_name,
      customer_email: input.customerEmail ?? existingBooking.customer_email,
      customer_phone: input.customerPhone ?? existingBooking.customer_phone,
      channel: input.channel ?? existingBooking.channel,
      notes: input.notes ?? existingBooking.notes,
      source: input.source ?? existingBooking.source,
      status: input.status ?? existingBooking.status,
      sync_status:
        shouldMirrorToGoogle(connection, settings) ||
        canSyncExistingGoogleMirror(connection, existingBooking as CalendarBooking)
          ? 'pending'
          : existingBooking.sync_status,
      metadata: input.metadata ?? existingBooking.metadata,
    })
    .eq('organization_id', organizationId)
    .eq('id', input.bookingId)
    .select('*')
    .single()

  if (shouldTreatAsOverlapError(error)) {
    throw new Error('Double booking conflict')
  }

  ensureNoError(error, 'Failed to update calendar booking')
  return mirrorBookingToGoogle(supabase, data as CalendarBooking, settings, connection)
}

export async function cancelCalendarBookingRecord(
  supabase: SupabaseClientLike,
  organizationId: string,
  bookingId: string
) {
  const { data: existingBooking, error: existingBookingError } = await supabase
    .from('calendar_bookings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', bookingId)
    .single()

  ensureNoError(existingBookingError, 'Failed to load calendar booking for cancellation')

  const settings = await getBookingSettingsByOrganizationId(supabase, organizationId)
  const connection = await getCalendarConnectionByOrganizationId(supabase, organizationId)

  const { data, error } = await supabase
    .from('calendar_bookings')
    .update({
      canceled_at: new Date().toISOString(),
      status: 'canceled',
      sync_status:
        shouldMirrorToGoogle(connection, settings) ||
        canSyncExistingGoogleMirror(connection, existingBooking as CalendarBooking)
          ? 'pending'
          : existingBooking.sync_status,
    })
    .eq('organization_id', organizationId)
    .eq('id', bookingId)
    .select('*')
    .single()

  ensureNoError(error, 'Failed to cancel calendar booking')
  const canceledBooking = data as CalendarBooking

  const calendarId = getActiveGoogleCalendarId(connection)
  if (
    !calendarId ||
    !canSyncExistingGoogleMirror(connection, canceledBooking) ||
    !canceledBooking.provider_event_id ||
    !connection
  ) {
    return canceledBooking
  }

  const token = await ensureGoogleAccessToken(connection)
  if (!token?.accessToken) {
    return canceledBooking
  }

  try {
    await deleteGoogleCalendarEvent({
      accessToken: token.accessToken,
      calendarId,
      eventId: canceledBooking.provider_event_id,
    })

    const { data: syncedBooking, error: syncError } = await supabase
      .from('calendar_bookings')
      .update({
        sync_status: 'synced',
      })
      .eq('organization_id', organizationId)
      .eq('id', bookingId)
      .select('*')
      .single()

    ensureNoError(syncError, 'Failed to update canceled booking sync status')
    return syncedBooking as CalendarBooking
  } catch (mirrorError) {
    console.error('Failed to delete Google Calendar event for canceled booking', mirrorError)

    const { data: erroredBooking, error: syncError } = await supabase
      .from('calendar_bookings')
      .update({
        sync_status: 'error',
      })
      .eq('organization_id', organizationId)
      .eq('id', bookingId)
      .select('*')
      .single()

    ensureNoError(syncError, 'Failed to persist canceled booking sync error')
    return erroredBooking as CalendarBooking
  }
}

export async function getCalendarPageDataByOrganizationId(
  supabase: SupabaseClientLike,
  organizationId: string,
  input: {
    rangeStartIso: string
    rangeEndIso: string
    settings?: BookingSettings | null
  }
): Promise<CalendarPageData> {
  const settingsPromise = input.settings
    ? Promise.resolve(input.settings)
    : getBookingSettingsByOrganizationId(supabase, organizationId)

  const [settings, availabilityRules, services, connection, bookings] = await Promise.all([
    settingsPromise,
    getBookingAvailabilityRulesByOrganizationId(supabase, organizationId),
    getBookableServiceCatalogItemsByOrganizationId(supabase, organizationId),
    getCalendarConnectionByOrganizationId(supabase, organizationId),
    listCalendarBookingsByRange(supabase, organizationId, input),
  ])

  return {
    organizationId,
    rangeStartIso: input.rangeStartIso,
    rangeEndIso: input.rangeEndIso,
    settings,
    availabilityRules,
    services,
    connection,
    bookings,
  }
}

export async function resolveGoogleCalendarConnectionDetails(accessToken: string) {
  try {
    const calendar = await fetchGooglePrimaryCalendar({ accessToken })
    return {
      externalAccountEmail: calendar.id ?? null,
      primaryCalendarId: calendar.id ?? 'primary',
    }
  } catch (error) {
    console.warn('Failed to resolve Google primary calendar details, using safe defaults', error)
    return {
      externalAccountEmail: null,
      primaryCalendarId: 'primary',
    }
  }
}
