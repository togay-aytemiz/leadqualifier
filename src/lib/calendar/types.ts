import type {
    BookingAvailabilityRule,
    BookingSettings,
    CalendarBooking,
    CalendarConnection,
    ServiceCatalogItem
} from '@/types/database'

export interface CalendarRangeInput {
    rangeStartIso: string
    rangeEndIso: string
}

export interface CalendarPageData extends CalendarRangeInput {
    organizationId: string | null
    settings: BookingSettings | null
    availabilityRules: BookingAvailabilityRule[]
    services: ServiceCatalogItem[]
    connection: CalendarConnection | null
    bookings: CalendarBooking[]
}

export interface CalendarAvailabilitySuggestion {
    requestedStartIso: string | null
    exactMatchAvailable: boolean
    slotDurationMinutes: number
    durationSource: 'service_catalog' | 'organization_default'
    availableSlots: string[]
    alternativeSlots: string[]
}

export interface CreateCalendarBookingInput {
    serviceCatalogId: string | null
    serviceNameSnapshot?: string | null
    startsAt: string
    durationMinutes?: number | null
    endsAt?: string | null
    conversationId?: string | null
    leadId?: string | null
    channel?: CalendarBooking['channel']
    customerName?: string | null
    customerEmail?: string | null
    customerPhone?: string | null
    notes?: string | null
    source?: CalendarBooking['source']
    metadata?: CalendarBooking['metadata']
}

export interface UpdateCalendarBookingInput extends CreateCalendarBookingInput {
    bookingId: string
    status?: CalendarBooking['status']
}

export interface BookingAvailabilityLookupInput extends CalendarRangeInput {
    serviceCatalogId: string | null
    requestedStartIso?: string | null
    suggestionLimit?: number
}

export interface GoogleTokenPayload {
    accessToken: string
    refreshToken: string | null
    tokenType: string | null
    expiresAt: string | null
    scopes: string[]
}
