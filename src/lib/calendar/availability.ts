export interface WeeklyAvailabilityRule {
    active: boolean
    dayOfWeek: number
    startMinute: number
    endMinute: number
}

export interface BookingBusyRange {
    startIso: string
    endIso: string
    source: 'internal_booking' | 'google_busy'
}

interface BuildAvailabilitySlotsInput {
    rangeStartIso: string
    rangeEndIso: string
    rules: WeeklyAvailabilityRule[]
    serviceDurationMinutes: number
    slotIntervalMinutes: number
    timezone: string
    minimumNoticeMinutes?: number
    nowIso?: string
}

interface SlotAvailabilityInput {
    bookingStartIso: string
    bookingEndIso: string
    blockedRanges: BookingBusyRange[]
    bufferBeforeMinutes?: number
    bufferAfterMinutes?: number
}

interface SlotWithinRulesInput {
    bookingStartIso: string
    bookingEndIso: string
    rules: WeeklyAvailabilityRule[]
    timezone: string
}

interface FindAlternativeAvailabilitySlotsInput {
    desiredStartIso: string
    candidateSlots: string[]
    limit?: number
}

interface ZonedDateParts {
    dayOfWeek: number
    minuteOfDay: number
}

const WEEKDAY_LOOKUP = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
} as const

function createZonedFormatter(timezone: string) {
    return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        timeZone: timezone,
        weekday: 'short'
    })
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
    const formatter = createZonedFormatter(timezone)
    const parts = formatter.formatToParts(date)
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun'
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

    return {
        dayOfWeek: WEEKDAY_LOOKUP[weekday as keyof typeof WEEKDAY_LOOKUP] ?? 0,
        minuteOfDay: hour * 60 + minute
    }
}

function normalizePositiveMinutes(value: number | undefined, fallback: number) {
    if (!Number.isFinite(value)) return fallback
    const normalized = Math.floor(Number(value))
    return normalized > 0 ? normalized : fallback
}

function hasOverlap(startA: number, endA: number, startB: number, endB: number) {
    return startA < endB && startB < endA
}

export function buildAvailabilitySlots(input: BuildAvailabilitySlotsInput) {
    const serviceDurationMinutes = normalizePositiveMinutes(input.serviceDurationMinutes, 30)
    const slotIntervalMinutes = normalizePositiveMinutes(input.slotIntervalMinutes, 30)
    const minimumNoticeMinutes = normalizePositiveMinutes(input.minimumNoticeMinutes, 0)
    const rangeStart = new Date(input.rangeStartIso)
    const rangeEnd = new Date(input.rangeEndIso)
    const now = input.nowIso ? new Date(input.nowIso) : null
    const minimumStartMs = now
        ? now.getTime() + minimumNoticeMinutes * 60_000
        : Number.NEGATIVE_INFINITY
    const activeRules = input.rules.filter((rule) => rule.active)
    const slots: string[] = []

    for (let cursor = rangeStart.getTime(); cursor < rangeEnd.getTime(); cursor += slotIntervalMinutes * 60_000) {
        if (cursor < minimumStartMs) continue

        const startDate = new Date(cursor)
        const endDate = new Date(cursor + serviceDurationMinutes * 60_000)
        if (endDate.getTime() > rangeEnd.getTime()) continue

        const startParts = getZonedDateParts(startDate, input.timezone)
        const endParts = getZonedDateParts(endDate, input.timezone)

        const matchesRule = activeRules.some((rule) => {
            return (
                rule.dayOfWeek === startParts.dayOfWeek &&
                rule.dayOfWeek === endParts.dayOfWeek &&
                startParts.minuteOfDay >= rule.startMinute &&
                endParts.minuteOfDay <= rule.endMinute
            )
        })

        if (!matchesRule) continue
        slots.push(startDate.toISOString())
    }

    return slots
}

export function isSlotAvailable(input: SlotAvailabilityInput) {
    const bookingStartMs = new Date(input.bookingStartIso).getTime()
    const bookingEndMs = new Date(input.bookingEndIso).getTime()
    const bufferBeforeMinutes = normalizePositiveMinutes(input.bufferBeforeMinutes, 0)
    const bufferAfterMinutes = normalizePositiveMinutes(input.bufferAfterMinutes, 0)

    return !input.blockedRanges.some((range) => {
        const blockedStartMs = new Date(range.startIso).getTime() - bufferBeforeMinutes * 60_000
        const blockedEndMs = new Date(range.endIso).getTime() + bufferAfterMinutes * 60_000

        return hasOverlap(bookingStartMs, bookingEndMs, blockedStartMs, blockedEndMs)
    })
}

export function isSlotWithinAvailabilityRules(input: SlotWithinRulesInput) {
    const startParts = getZonedDateParts(new Date(input.bookingStartIso), input.timezone)
    const endParts = getZonedDateParts(new Date(input.bookingEndIso), input.timezone)

    return input.rules
        .filter((rule) => rule.active)
        .some((rule) => {
            return (
                rule.dayOfWeek === startParts.dayOfWeek &&
                rule.dayOfWeek === endParts.dayOfWeek &&
                startParts.minuteOfDay >= rule.startMinute &&
                endParts.minuteOfDay <= rule.endMinute
            )
        })
}

export function findAlternativeAvailabilitySlots(input: FindAlternativeAvailabilitySlotsInput) {
    const desiredStartMs = new Date(input.desiredStartIso).getTime()
    const limit = normalizePositiveMinutes(input.limit, 3)

    return [...input.candidateSlots]
        .filter((slot) => new Date(slot).getTime() >= desiredStartMs)
        .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
        .slice(0, limit)
}
