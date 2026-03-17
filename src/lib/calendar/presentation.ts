import type { CalendarBooking } from '@/types/database'

export type CalendarView = 'day' | 'week' | 'month' | 'agenda'

export interface CalendarFilters {
  status: CalendarBooking['status'] | 'all'
  serviceCatalogId: string | 'all'
  source: CalendarBooking['source'] | 'all'
  channel: CalendarBooking['channel'] | 'all'
}

export interface CalendarRangeDescriptor {
  anchorDate: string
  rangeStartIso: string
  rangeEndIso: string
  view: CalendarView
}

export interface CalendarDataWindow {
  anchorDate: string
  rangeStartIso: string
  rangeEndIso: string
}

export interface CalendarSummary {
  todayCount: number
  weekCount: number
  upcomingCount: number
  nextBooking: CalendarBooking | null
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDateKey(dateKey: string) {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`)
  }

  const parts = dateKey.split('-').map((part) => Number.parseInt(part, 10))
  const [year, month, day] = parts as [number, number, number]
  return {
    year,
    month,
    day,
  }
}

function formatDateKey(year: number, month: number, day: number) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function readTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const timeZoneName = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = timeZoneName.match(/GMT(?:(\+|-)(\d{1,2})(?::?(\d{2}))?)?/)

  if (!match || !match[1] || !match[2]) {
    return 0
  }

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number.parseInt(match[2], 10)
  const minutes = Number.parseInt(match[3] ?? '0', 10)
  return sign * (hours * 60 + minutes)
}

function getZonedParts(dateInput: Date | string, timeZone: string) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  })

  const partMap = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value] as const)
  )

  const year = Number.parseInt(partMap.get('year') ?? '0', 10)
  const month = Number.parseInt(partMap.get('month') ?? '0', 10)
  const day = Number.parseInt(partMap.get('day') ?? '0', 10)
  const hour = Number.parseInt(partMap.get('hour') ?? '0', 10)
  const minute = Number.parseInt(partMap.get('minute') ?? '0', 10)

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekdayShort: partMap.get('weekday') ?? '',
    dateKey: formatDateKey(year, month, day),
  }
}

export function normalizeCalendarView(value: string | null | undefined): CalendarView {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'agenda') {
    return value
  }

  return 'week'
}

export function resolveDefaultCalendarView(isMobile: boolean): CalendarView {
  return isMobile ? 'agenda' : 'week'
}

export function getTodayDateKey(timeZone: string) {
  return getZonedParts(new Date(), timeZone).dateKey
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey)
  const nextDate = new Date(Date.UTC(year, month - 1, day))
  nextDate.setUTCDate(nextDate.getUTCDate() + days)
  return formatDateKey(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate())
}

export function addMonthsToDateKey(dateKey: string, months: number) {
  const { year, month, day } = parseDateKey(dateKey)
  const nextDate = new Date(Date.UTC(year, month - 1, day))
  nextDate.setUTCMonth(nextDate.getUTCMonth() + months)
  return formatDateKey(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate())
}

export function getStartOfWeekDateKey(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey)
  const date = new Date(Date.UTC(year, month - 1, day))
  const mondayIndex = (date.getUTCDay() + 6) % 7
  return addDaysToDateKey(dateKey, -mondayIndex)
}

export function getStartOfMonthDateKey(dateKey: string) {
  const { year, month } = parseDateKey(dateKey)
  return formatDateKey(year, month, 1)
}

export function getEndOfMonthDateKey(dateKey: string) {
  const startOfMonth = getStartOfMonthDateKey(dateKey)
  const nextMonth = addMonthsToDateKey(startOfMonth, 1)
  return addDaysToDateKey(nextMonth, -1)
}

export function localDateTimeToIso(input: { date: string; time: string; timeZone: string }) {
  const { date, time, timeZone } = input
  const { year, month, day } = parseDateKey(date)
  const [hourPart, minutePart] = time.split(':')
  const hour = Number.parseInt(hourPart ?? '0', 10)
  const minute = Number.parseInt(minutePart ?? '0', 10)

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  const initialOffset = readTimeZoneOffsetMinutes(new Date(utcGuess), timeZone)
  let timestamp = utcGuess - initialOffset * 60_000
  const correctedOffset = readTimeZoneOffsetMinutes(new Date(timestamp), timeZone)

  if (correctedOffset !== initialOffset) {
    timestamp = utcGuess - correctedOffset * 60_000
  }

  return new Date(timestamp).toISOString()
}

export function isoToLocalDateTimeParts(iso: string, timeZone: string) {
  const parts = getZonedParts(iso, timeZone)
  return {
    date: parts.dateKey,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  }
}

export function formatDateTimeLabel(input: {
  startIso: string
  endIso?: string | null
  timeZone: string
  locale?: string
}) {
  const start = new Date(input.startIso)
  const end = input.endIso ? new Date(input.endIso) : null

  const dateLabel = new Intl.DateTimeFormat(input.locale, {
    timeZone: input.timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start)

  const timeFormatter = new Intl.DateTimeFormat(input.locale, {
    timeZone: input.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const startLabel = timeFormatter.format(start)
  const endLabel = end ? timeFormatter.format(end) : null

  return endLabel ? `${dateLabel} • ${startLabel} - ${endLabel}` : `${dateLabel} • ${startLabel}`
}

export function formatDateKeyLabel(input: {
  dateKey: string
  timeZone: string
  locale?: string
  weekday?: boolean
}) {
  const iso = localDateTimeToIso({
    date: input.dateKey,
    time: '00:00',
    timeZone: input.timeZone,
  })

  return new Intl.DateTimeFormat(input.locale, {
    timeZone: input.timeZone,
    month: 'short',
    day: 'numeric',
    ...(input.weekday ? { weekday: 'short' as const } : {}),
  }).format(new Date(iso))
}

export function buildCalendarRange(input: {
  anchorDate: string
  view: CalendarView
  timeZone: string
}): CalendarRangeDescriptor {
  const anchorDate = DATE_KEY_PATTERN.test(input.anchorDate)
    ? input.anchorDate
    : getTodayDateKey(input.timeZone)

  let rangeStartDate = anchorDate
  let rangeEndDate = addDaysToDateKey(anchorDate, 1)

  if (input.view === 'week' || input.view === 'agenda') {
    rangeStartDate = getStartOfWeekDateKey(anchorDate)
    rangeEndDate = addDaysToDateKey(rangeStartDate, 7)
  }

  if (input.view === 'month') {
    rangeStartDate = getStartOfMonthDateKey(anchorDate)
    rangeEndDate = addMonthsToDateKey(rangeStartDate, 1)
  }

  return {
    anchorDate,
    view: input.view,
    rangeStartIso: localDateTimeToIso({
      date: rangeStartDate,
      time: '00:00',
      timeZone: input.timeZone,
    }),
    rangeEndIso: localDateTimeToIso({
      date: rangeEndDate,
      time: '00:00',
      timeZone: input.timeZone,
    }),
  }
}

export function buildCalendarDataWindow(input: {
  anchorDate: string
  timeZone: string
}): CalendarDataWindow {
  const anchorDate = DATE_KEY_PATTERN.test(input.anchorDate)
    ? input.anchorDate
    : getTodayDateKey(input.timeZone)
  const previousMonthAnchor = addMonthsToDateKey(anchorDate, -1)
  const nextMonthAnchor = addMonthsToDateKey(anchorDate, 1)
  const previousMonthStart = getStartOfMonthDateKey(previousMonthAnchor)
  const nextMonthGrid = buildMonthGrid(nextMonthAnchor)
  const rangeStartDate = getStartOfWeekDateKey(previousMonthStart)
  const lastDate = nextMonthGrid[nextMonthGrid.length - 1] ?? nextMonthAnchor
  const rangeEndDate = addDaysToDateKey(lastDate, 1)

  return {
    anchorDate,
    rangeStartIso: localDateTimeToIso({
      date: rangeStartDate,
      time: '00:00',
      timeZone: input.timeZone,
    }),
    rangeEndIso: localDateTimeToIso({
      date: rangeEndDate,
      time: '00:00',
      timeZone: input.timeZone,
    }),
  }
}

export function calendarRangeContains(input: {
  outerRangeStartIso: string
  outerRangeEndIso: string
  innerRangeStartIso: string
  innerRangeEndIso: string
}) {
  return (
    input.outerRangeStartIso <= input.innerRangeStartIso &&
    input.outerRangeEndIso >= input.innerRangeEndIso
  )
}

export function shiftCalendarAnchor(input: {
  anchorDate: string
  view: CalendarView
  direction: 'prev' | 'next'
}) {
  const delta = input.direction === 'next' ? 1 : -1

  if (input.view === 'day') {
    return addDaysToDateKey(input.anchorDate, delta)
  }

  if (input.view === 'month') {
    return addMonthsToDateKey(input.anchorDate, delta)
  }

  return addDaysToDateKey(input.anchorDate, delta * 7)
}

export function filterCalendarBookings(bookings: CalendarBooking[], filters: CalendarFilters) {
  return bookings.filter((booking) => {
    if (filters.status !== 'all' && booking.status !== filters.status) {
      return false
    }

    if (
      filters.serviceCatalogId !== 'all' &&
      booking.service_catalog_id !== filters.serviceCatalogId
    ) {
      return false
    }

    if (filters.source !== 'all' && booking.source !== filters.source) {
      return false
    }

    if (filters.channel !== 'all' && booking.channel !== filters.channel) {
      return false
    }

    return true
  })
}

export function groupBookingsByDate(bookings: CalendarBooking[], timeZone: string) {
  const grouped = new Map<string, CalendarBooking[]>()

  for (const booking of bookings) {
    const dateKey = getZonedParts(booking.starts_at, timeZone).dateKey
    const current = grouped.get(dateKey) ?? []
    current.push(booking)
    grouped.set(dateKey, current)
  }

  for (const [dateKey, bucket] of grouped.entries()) {
    grouped.set(
      dateKey,
      [...bucket].sort((left, right) => {
        return new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
      })
    )
  }

  return grouped
}

export function buildMonthGrid(dateKey: string) {
  const monthStart = getStartOfMonthDateKey(dateKey)
  const monthEnd = getEndOfMonthDateKey(dateKey)
  const gridStart = getStartOfWeekDateKey(monthStart)
  const monthEndDate = parseDateKey(monthEnd)
  const monthEndAsDate = new Date(
    Date.UTC(monthEndDate.year, monthEndDate.month - 1, monthEndDate.day)
  )
  const sundayIndex = 7 - (((monthEndAsDate.getUTCDay() + 6) % 7) + 1)
  const gridEndExclusive = addDaysToDateKey(monthEnd, sundayIndex + 1)
  const days: string[] = []

  for (let cursor = gridStart; cursor < gridEndExclusive; cursor = addDaysToDateKey(cursor, 1)) {
    days.push(cursor)
  }

  return days
}

export function getCalendarSummary(bookings: CalendarBooking[], timeZone: string): CalendarSummary {
  const todayDateKey = getTodayDateKey(timeZone)
  const weekStart = getStartOfWeekDateKey(todayDateKey)
  const weekEndExclusive = addDaysToDateKey(weekStart, 7)
  const now = Date.now()

  const todayCount = bookings.filter((booking) => {
    return getZonedParts(booking.starts_at, timeZone).dateKey === todayDateKey
  }).length

  const weekCount = bookings.filter((booking) => {
    const dateKey = getZonedParts(booking.starts_at, timeZone).dateKey
    return dateKey >= weekStart && dateKey < weekEndExclusive
  }).length

  const upcomingBookings = bookings
    .filter((booking) => new Date(booking.ends_at).getTime() >= now)
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())

  return {
    todayCount,
    weekCount,
    upcomingCount: upcomingBookings.length,
    nextBooking: upcomingBookings[0] ?? null,
  }
}

export function getViewLabel(input: {
  anchorDate: string
  view: CalendarView
  timeZone: string
  locale?: string
}) {
  if (input.view === 'day') {
    return formatDateKeyLabel({
      dateKey: input.anchorDate,
      locale: input.locale,
      timeZone: input.timeZone,
      weekday: true,
    })
  }

  if (input.view === 'month') {
    const startIso = localDateTimeToIso({
      date: getStartOfMonthDateKey(input.anchorDate),
      time: '00:00',
      timeZone: input.timeZone,
    })

    return new Intl.DateTimeFormat(input.locale, {
      timeZone: input.timeZone,
      month: 'long',
      year: 'numeric',
    }).format(new Date(startIso))
  }

  const weekStart = getStartOfWeekDateKey(input.anchorDate)
  const weekEnd = addDaysToDateKey(weekStart, 6)
  return `${formatDateKeyLabel({
    dateKey: weekStart,
    locale: input.locale,
    timeZone: input.timeZone,
  })} - ${formatDateKeyLabel({
    dateKey: weekEnd,
    locale: input.locale,
    timeZone: input.timeZone,
  })}`
}

export function formatMinutesAsTime(minutes: number) {
  const safeMinutes = Math.max(0, Math.min(minutes, 24 * 60 - 1))
  const hour = Math.floor(safeMinutes / 60)
  const minute = safeMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function timeStringToMinutes(value: string) {
  const [hourPart, minutePart] = value.split(':')
  const hour = Number.parseInt(hourPart ?? '0', 10)
  const minute = Number.parseInt(minutePart ?? '0', 10)
  return Math.max(0, Math.min(hour * 60 + minute, 24 * 60 - 1))
}
