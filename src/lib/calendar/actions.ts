'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import type { BookingAvailabilityRule, BookingSettings } from '@/types/database'
import {
  cancelCalendarBookingRecord,
  createCalendarBookingRecord,
  disconnectGoogleCalendarConnection,
  getCalendarConnectionByOrganizationId,
  getCalendarPageDataByOrganizationId,
  lookupBookingAvailability,
  updateCalendarBookingRecord,
} from '@/lib/calendar/bookings'
import type {
  BookingAvailabilityLookupInput,
  CreateCalendarBookingInput,
  UpdateCalendarBookingInput,
} from '@/lib/calendar/types'

function buildDefaultCalendarRange() {
  const now = new Date()
  const rangeStart = new Date(now)
  rangeStart.setUTCDate(1)
  rangeStart.setUTCHours(0, 0, 0, 0)

  const rangeEnd = new Date(rangeStart)
  rangeEnd.setUTCMonth(rangeEnd.getUTCMonth() + 1)

  return {
    rangeStartIso: rangeStart.toISOString(),
    rangeEndIso: rangeEnd.toISOString(),
  }
}

async function requireOrganizationContext() {
  const supabase = await createClient()
  const context = await resolveActiveOrganizationContext(supabase)
  const organizationId = context?.activeOrganizationId ?? null

  if (!organizationId) {
    throw new Error('No active organization selected')
  }

  return {
    supabase,
    organizationId,
  }
}

export async function getCalendarPageData(input?: {
  rangeStartIso?: string
  rangeEndIso?: string
}) {
  const { supabase, organizationId } = await requireOrganizationContext()
  const fallbackRange = buildDefaultCalendarRange()

  return getCalendarPageDataByOrganizationId(supabase, organizationId, {
    rangeStartIso: input?.rangeStartIso ?? fallbackRange.rangeStartIso,
    rangeEndIso: input?.rangeEndIso ?? fallbackRange.rangeEndIso,
  })
}

export async function getCalendarAvailability(input: BookingAvailabilityLookupInput) {
  const { supabase, organizationId } = await requireOrganizationContext()
  return lookupBookingAvailability(supabase, organizationId, input)
}

export async function updateBookingSettingsAction(
  payload: Partial<Omit<BookingSettings, 'organization_id' | 'created_at' | 'updated_at'>>
) {
  const { supabase, organizationId } = await requireOrganizationContext()

  const connectionSyncMode =
    typeof payload.google_write_through_enabled === 'boolean'
      ? payload.google_write_through_enabled
        ? 'write_through'
        : 'busy_overlay'
      : null

  const { data, error } = await supabase
    .from('booking_settings')
    .update(payload)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error?.message?.includes('0 rows')) {
    const { data: insertedData, error: insertError } = await supabase
      .from('booking_settings')
      .insert({
        organization_id: organizationId,
        ...payload,
      })
      .select('*')
      .single()

    if (insertError) {
      throw new Error(`Failed to save booking settings: ${insertError.message}`)
    }

    if (connectionSyncMode) {
      const { error: connectionUpdateError } = await supabase
        .from('calendar_connections')
        .update({
          sync_mode: connectionSyncMode,
        })
        .eq('organization_id', organizationId)
        .eq('provider', 'google')

      if (connectionUpdateError) {
        throw new Error(`Failed to sync calendar connection mode: ${connectionUpdateError.message}`)
      }
    }

    return insertedData as BookingSettings
  }

  if (error) {
    throw new Error(`Failed to save booking settings: ${error.message}`)
  }

  if (connectionSyncMode) {
    const { error: connectionUpdateError } = await supabase
      .from('calendar_connections')
      .update({
        sync_mode: connectionSyncMode,
      })
      .eq('organization_id', organizationId)
      .eq('provider', 'google')

    if (connectionUpdateError) {
      throw new Error(`Failed to sync calendar connection mode: ${connectionUpdateError.message}`)
    }
  }

  return data as BookingSettings
}

export async function replaceAvailabilityRulesAction(
  rules: Array<
    Pick<
      BookingAvailabilityRule,
      'day_of_week' | 'start_minute' | 'end_minute' | 'label' | 'active'
    >
  >
) {
  const { supabase, organizationId } = await requireOrganizationContext()

  const { data, error } = await supabase.rpc('replace_booking_availability_rules', {
    p_organization_id: organizationId,
    p_rules: rules,
  })

  if (error) {
    throw new Error(`Failed to save availability rules: ${error.message}`)
  }

  return (data ?? []) as BookingAvailabilityRule[]
}

export async function updateServiceCatalogDurationsAction(
  entries: Array<{ serviceCatalogId: string; durationMinutes: number | null }>
) {
  const { supabase, organizationId } = await requireOrganizationContext()

  const updates = await Promise.all(
    entries.map(async (entry) => {
      const normalizedDuration =
        typeof entry.durationMinutes === 'number' && Number.isFinite(entry.durationMinutes)
          ? Math.max(0, Math.round(entry.durationMinutes))
          : null

      const { data, error } = await supabase
        .from('service_catalog')
        .update({
          duration_minutes:
            normalizedDuration && normalizedDuration > 0 ? normalizedDuration : null,
          duration_updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('id', entry.serviceCatalogId)
        .select('*')
        .single()

      if (error) {
        throw new Error(`Failed to update service duration: ${error.message}`)
      }

      return data
    })
  )

  return updates
}

export async function createCalendarBookingAction(input: CreateCalendarBookingInput) {
  const { supabase, organizationId } = await requireOrganizationContext()
  const { data: authData } = await supabase.auth.getUser()
  return createCalendarBookingRecord(supabase, organizationId, input, authData.user?.id ?? null)
}

export async function updateCalendarBookingAction(input: UpdateCalendarBookingInput) {
  const { supabase, organizationId } = await requireOrganizationContext()
  return updateCalendarBookingRecord(supabase, organizationId, input)
}

export async function cancelCalendarBookingAction(bookingId: string) {
  const { supabase, organizationId } = await requireOrganizationContext()
  return cancelCalendarBookingRecord(supabase, organizationId, bookingId)
}

export async function disconnectGoogleCalendarAction() {
  const { supabase, organizationId } = await requireOrganizationContext()
  const connection = await getCalendarConnectionByOrganizationId(supabase, organizationId)

  if (!connection) return null

  return disconnectGoogleCalendarConnection(supabase, organizationId, connection)
}
