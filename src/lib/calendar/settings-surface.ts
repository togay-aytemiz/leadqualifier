import type {
    BookingAvailabilityRule,
    BookingSettings,
    CalendarConnection,
    ServiceCatalogItem
} from '@/types/database'

export type CalendarSettingsSectionId = 'general' | 'availability' | 'serviceDurations' | 'google'

export interface CalendarSettingsDraft {
    bookingEnabled: boolean
    timezone: string
    defaultDuration: string
    slotInterval: string
    minimumNotice: string
    bufferBefore: string
    bufferAfter: string
    googleBusyOverlayEnabled: boolean
    googleWriteThroughEnabled: boolean
}

export interface CalendarAvailabilityDraftRow {
    dayOfWeek: number
    enabled: boolean
    startTime: string
    endTime: string
}

export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const DAY_KEY_BY_INDEX: Record<number, string> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday'
}

export type CalendarSettingsSurface = 'settings' | 'apps'

const SURFACE_SECTION_IDS: Record<CalendarSettingsSurface, CalendarSettingsSectionId[]> = {
    settings: ['general', 'availability', 'serviceDurations'],
    apps: ['google']
}

export function getCalendarSettingsSectionIds(surface: CalendarSettingsSurface) {
    return [...SURFACE_SECTION_IDS[surface]]
}

function formatMinutesAsTime(totalMinutes: number) {
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const minutes = String(totalMinutes % 60).padStart(2, '0')
    return `${hours}:${minutes}`
}

export function buildCalendarSettingsDraft(settings: BookingSettings | null): CalendarSettingsDraft {
    return {
        bookingEnabled: settings?.booking_enabled ?? true,
        timezone: settings?.timezone ?? 'Europe/Istanbul',
        defaultDuration: String(settings?.default_booking_duration_minutes ?? 60),
        slotInterval: String(settings?.slot_interval_minutes ?? 30),
        minimumNotice: String(settings?.minimum_notice_minutes ?? 60),
        bufferBefore: String(settings?.buffer_before_minutes ?? 0),
        bufferAfter: String(settings?.buffer_after_minutes ?? 0),
        googleBusyOverlayEnabled: settings?.google_busy_overlay_enabled ?? true,
        googleWriteThroughEnabled: settings?.google_write_through_enabled ?? false
    }
}

export function buildCalendarAvailabilityDraft(rules: BookingAvailabilityRule[]): CalendarAvailabilityDraftRow[] {
    const ruleByDay = new Map<number, BookingAvailabilityRule>()

    for (const rule of rules) {
        if (!rule.active) continue
        if (!ruleByDay.has(rule.day_of_week)) {
            ruleByDay.set(rule.day_of_week, rule)
        }
    }

    return DAY_ORDER.map((dayOfWeek) => {
        const rule = ruleByDay.get(dayOfWeek)

        return {
            dayOfWeek,
            enabled: Boolean(rule),
            startTime: formatMinutesAsTime(rule?.start_minute ?? 9 * 60),
            endTime: formatMinutesAsTime(rule?.end_minute ?? 18 * 60)
        }
    })
}

export function buildCalendarServiceDurationDraft(services: ServiceCatalogItem[]) {
    return services.reduce<Record<string, string>>((result, service) => {
        result[service.id] = service.duration_minutes ? String(service.duration_minutes) : ''
        return result
    }, {})
}

export function countCustomDurationServices(services: ServiceCatalogItem[], serviceDurationDraft: Record<string, string>) {
    return services.filter((service) => Boolean(serviceDurationDraft[service.id]?.trim())).length
}

export function countEnabledAvailabilityDays(availabilityDraft: CalendarAvailabilityDraftRow[]) {
    return availabilityDraft.filter((rule) => rule.enabled).length
}

export function resolveGoogleConnectionSummary(
    connection: CalendarConnection | null,
    settingsDraft: CalendarSettingsDraft
) {
    return {
        connected: connection?.status === 'active',
        email: connection?.external_account_email ?? null,
        mode: settingsDraft.googleWriteThroughEnabled ? 'writeThrough' : 'busyOverlay'
    } as const
}
