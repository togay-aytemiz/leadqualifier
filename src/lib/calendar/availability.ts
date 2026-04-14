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
    maxConcurrentBookings?: number
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
    year: number
    month: number
    day: number
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
    return new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        timeZone: timezone,
        weekday: 'short',
        year: 'numeric'
    })
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
    const formatter = createZonedFormatter(timezone)
    const parts = formatter.formatToParts(date)
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun'
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
    const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1')
    const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1')
    const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0')

    return {
        year,
        month,
        day,
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

function addDaysToLocalDate(parts: { year: number, month: number, day: number }, offsetDays: number) {
    const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    nextDate.setUTCDate(nextDate.getUTCDate() + offsetDays)
    return {
        year: nextDate.getUTCFullYear(),
        month: nextDate.getUTCMonth() + 1,
        day: nextDate.getUTCDate()
    }
}

function compareLocalDates(
    left: { year: number, month: number, day: number },
    right: { year: number, month: number, day: number }
) {
    return Date.UTC(left.year, left.month - 1, left.day) - Date.UTC(right.year, right.month - 1, right.day)
}

function getLocalDayOfWeek(parts: { year: number, month: number, day: number }) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

function isNextLocalDate(
    startParts: { year: number, month: number, day: number },
    endParts: { year: number, month: number, day: number }
) {
    return compareLocalDates(endParts, addDaysToLocalDate(startParts, 1)) === 0
}

function buildZonedDateTimeIso(input: {
    timezone: string
    year: number
    month: number
    day: number
    hour: number
    minute: number
}) {
    let guess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute))

    for (let index = 0; index < 3; index += 1) {
        const parts = getZonedDateParts(guess, input.timezone)
        const desiredUtcDate = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute)
        const observedUtcDate = Date.UTC(parts.year, parts.month - 1, parts.day, Math.floor(parts.minuteOfDay / 60), parts.minuteOfDay % 60)
        const diffMs = desiredUtcDate - observedUtcDate
        if (diffMs === 0) break
        guess = new Date(guess.getTime() + diffMs)
    }

    return guess.toISOString()
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
    const rangeStartParts = getZonedDateParts(rangeStart, input.timezone)
    const rangeEndParts = getZonedDateParts(rangeEnd, input.timezone)
    const endLocalDate = {
        year: rangeEndParts.year,
        month: rangeEndParts.month,
        day: rangeEndParts.day
    }

    for (
        let localDate = { year: rangeStartParts.year, month: rangeStartParts.month, day: rangeStartParts.day };
        compareLocalDates(localDate, endLocalDate) <= 0;
        localDate = addDaysToLocalDate(localDate, 1)
    ) {
        const dayOfWeek = getLocalDayOfWeek(localDate)
        const matchingRules = activeRules.filter((rule) => rule.dayOfWeek === dayOfWeek)

        for (const rule of matchingRules) {
            for (
                let minuteOfDay = rule.startMinute;
                minuteOfDay + serviceDurationMinutes <= rule.endMinute;
                minuteOfDay += slotIntervalMinutes
            ) {
                const startIso = buildZonedDateTimeIso({
                    timezone: input.timezone,
                    year: localDate.year,
                    month: localDate.month,
                    day: localDate.day,
                    hour: Math.floor(minuteOfDay / 60),
                    minute: minuteOfDay % 60
                })
                const startMs = new Date(startIso).getTime()
                const endMs = startMs + serviceDurationMinutes * 60_000

                if (startMs < rangeStart.getTime()) continue
                if (startMs < minimumStartMs) continue
                if (endMs > rangeEnd.getTime()) continue
                slots.push(startIso)
            }
        }
    }

    return [...new Set(slots)].sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
}

export function isSlotAvailable(input: SlotAvailabilityInput) {
    const bookingStartMs = new Date(input.bookingStartIso).getTime()
    const bookingEndMs = new Date(input.bookingEndIso).getTime()
    const bufferBeforeMinutes = normalizePositiveMinutes(input.bufferBeforeMinutes, 0)
    const bufferAfterMinutes = normalizePositiveMinutes(input.bufferAfterMinutes, 0)
    const maxConcurrentBookings = normalizePositiveMinutes(input.maxConcurrentBookings, 1)
    const candidateOccupiedStartMs = bookingStartMs - bufferBeforeMinutes * 60_000
    const candidateOccupiedEndMs = bookingEndMs + bufferAfterMinutes * 60_000
    const internalOccupiedRanges: Array<{ startMs: number, endMs: number }> = []

    for (const range of input.blockedRanges) {
        const blockedStartMs = new Date(range.startIso).getTime() - bufferBeforeMinutes * 60_000
        const blockedEndMs = new Date(range.endIso).getTime() + bufferAfterMinutes * 60_000

        if (range.source === 'google_busy') {
            if (hasOverlap(bookingStartMs, bookingEndMs, blockedStartMs, blockedEndMs)) {
                return false
            }
            continue
        }

        if (hasOverlap(candidateOccupiedStartMs, candidateOccupiedEndMs, blockedStartMs, blockedEndMs)) {
            internalOccupiedRanges.push({
                startMs: blockedStartMs,
                endMs: blockedEndMs
            })
        }
    }

    const checkPoints = new Set<number>([candidateOccupiedStartMs])
    for (const range of internalOccupiedRanges) {
        if (range.startMs >= candidateOccupiedStartMs && range.startMs < candidateOccupiedEndMs) {
            checkPoints.add(range.startMs)
        }
    }

    let peakExistingOccupancy = 0
    for (const checkPoint of checkPoints) {
        const activeCount = internalOccupiedRanges.filter((range) => {
            return range.startMs <= checkPoint && checkPoint < range.endMs
        }).length
        peakExistingOccupancy = Math.max(peakExistingOccupancy, activeCount)
    }

    return peakExistingOccupancy < maxConcurrentBookings
}

export function isSlotWithinAvailabilityRules(input: SlotWithinRulesInput) {
    const startParts = getZonedDateParts(new Date(input.bookingStartIso), input.timezone)
    const endParts = getZonedDateParts(new Date(input.bookingEndIso), input.timezone)
    const endsAtNextLocalMidnight = endParts.minuteOfDay === 0 && isNextLocalDate(startParts, endParts)
    const endDayOfWeek = endsAtNextLocalMidnight ? startParts.dayOfWeek : endParts.dayOfWeek
    const endMinuteOfDay = endsAtNextLocalMidnight ? 1440 : endParts.minuteOfDay

    return input.rules
        .filter((rule) => rule.active)
        .some((rule) => {
            return (
                rule.dayOfWeek === startParts.dayOfWeek &&
                rule.dayOfWeek === endDayOfWeek &&
                startParts.minuteOfDay >= rule.startMinute &&
                endMinuteOfDay <= rule.endMinute
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
