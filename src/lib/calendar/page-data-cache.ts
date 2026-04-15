import { createDashboardClientCache } from '@/lib/dashboard/client-cache'
import type { CalendarPageData } from '@/lib/calendar/types'

const CALENDAR_PAGE_DATA_CACHE_TTL_MS = 2 * 60 * 1000
const CALENDAR_PAGE_DATA_CACHE_MAX_ENTRIES = 12

export const calendarPageDataCache = createDashboardClientCache<CalendarPageData>({
  maxEntries: CALENDAR_PAGE_DATA_CACHE_MAX_ENTRIES,
  ttlMs: CALENDAR_PAGE_DATA_CACHE_TTL_MS,
})

export function buildCalendarPageDataCacheKey(options: {
  organizationId: string | null
  rangeEndIso: string
  rangeStartIso: string
  timeZone: string
}) {
  return [
    options.organizationId ?? 'no-organization',
    options.timeZone,
    options.rangeStartIso,
    options.rangeEndIso,
  ].join('::')
}

export function clearCalendarPageDataCache() {
  calendarPageDataCache.clear()
}

export function getCachedCalendarPageData(key: string) {
  return calendarPageDataCache.get(key)
}

export function loadCalendarPageDataWithCache(
  key: string,
  loader: () => Promise<CalendarPageData>,
  options: {
    onError?: (error: unknown) => void
    onUpdate?: (value: CalendarPageData) => void
  } = {}
) {
  return calendarPageDataCache.getOrLoad(key, loader, {
    allowStale: true,
    onError: options.onError,
    onUpdate: options.onUpdate,
  })
}

export function prefetchCalendarPageData(key: string, loader: () => Promise<CalendarPageData>) {
  return calendarPageDataCache.getOrLoad(key, loader, { allowStale: true })
}

export function primeCalendarPageDataCache(key: string, data: CalendarPageData) {
  calendarPageDataCache.set(key, data)
}
