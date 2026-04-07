'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Clock3,
  Link2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { Alert, Button, Modal, PageHeader, Select } from '@/design'
import { WorkspaceIntroModal } from '@/components/common/WorkspaceIntroModal'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type {
  CalendarPageData,
  CreateCalendarBookingInput,
  UpdateCalendarBookingInput,
} from '@/lib/calendar/types'
import type {
  CalendarBooking,
  CalendarBookingStatus,
  CalendarBookingSource,
} from '@/types/database'
import {
  addDaysToDateKey,
  buildCalendarRange,
  buildCalendarDataWindow,
  buildMonthGrid,
  calendarRangeContains,
  filterCalendarBookings,
  formatDateKeyLabel,
  formatDateTimeLabel,
  getCalendarSummary,
  getStartOfWeekDateKey,
  getTodayDateKey,
  getViewLabel,
  isoToLocalDateTimeParts,
  localDateTimeToIso,
  resolveDefaultCalendarView,
  shiftCalendarAnchor,
  type CalendarFilters,
  type CalendarView,
} from '@/lib/calendar/presentation'
import { resolveCalendarBookingMutationErrorKey } from '@/lib/calendar/booking-errors'
import {
  cancelCalendarBookingAction,
  createCalendarBookingAction,
  getCalendarPageData,
  updateCalendarBookingAction,
} from '@/lib/calendar/actions'

interface CalendarClientProps {
  data: CalendarPageData
  initialAnchorDate: string
  initialHasExplicitView: boolean
  initialView: CalendarView
  locale: string
  userId: string
  readOnlyTenantMode?: boolean
}

interface BookingFormDraft {
  bookingId: string | null
  serviceCatalogId: string
  durationMinutes: string
  customerName: string
  customerEmail: string
  customerPhone: string
  notes: string
  date: string
  time: string
  source: CalendarBookingSource
  channel: CalendarBooking['channel']
  status: CalendarBookingStatus
}

function resolveDraftDurationMinutes(data: CalendarPageData, serviceCatalogId: string | null) {
  const serviceDuration =
    data.services.find((service) => service.id === serviceCatalogId)?.duration_minutes ?? null

  return String(serviceDuration ?? data.settings?.default_booking_duration_minutes ?? 60)
}

function createEmptyBookingDraft(data: CalendarPageData, anchorDate: string): BookingFormDraft {
  const serviceCatalogId = data.services[0]?.id ?? ''

  return {
    bookingId: null,
    serviceCatalogId,
    durationMinutes: resolveDraftDurationMinutes(data, serviceCatalogId),
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
    date: anchorDate,
    time: '10:00',
    source: 'manual',
    channel: 'manual',
    status: 'confirmed',
  }
}

function createBookingDraftFromRecord(
  booking: CalendarBooking,
  timeZone: string
): BookingFormDraft {
  const localDateTime = isoToLocalDateTimeParts(booking.starts_at, timeZone)

  return {
    bookingId: booking.id,
    serviceCatalogId: booking.service_catalog_id ?? '',
    durationMinutes: String(booking.duration_minutes),
    customerName: booking.customer_name ?? '',
    customerEmail: booking.customer_email ?? '',
    customerPhone: booking.customer_phone ?? '',
    notes: booking.notes ?? '',
    date: localDateTime.date,
    time: localDateTime.time,
    source: booking.source,
    channel: booking.channel,
    status: booking.status,
  }
}

function buildRangeCacheKey(rangeStartIso: string, rangeEndIso: string) {
  return `${rangeStartIso}:${rangeEndIso}`
}

export function CalendarClient({
  data,
  initialAnchorDate,
  initialHasExplicitView,
  initialView,
  locale,
  userId,
  readOnlyTenantMode = false,
}: CalendarClientProps) {
  const t = useTranslations('calendar')
  const tIntro = useTranslations('calendar.introModal')
  const router = useRouter()
  const pathname = usePathname()
  const [isMobile, setIsMobile] = useState(false)
  const [calendarData, setCalendarData] = useState(data)
  const [anchorDate, setAnchorDate] = useState(initialAnchorDate)
  const [viewOverride, setViewOverride] = useState<CalendarView | null>(
    initialHasExplicitView ? initialView : null
  )
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    data.bookings[0]?.id ?? null
  )
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [bookingDraft, setBookingDraft] = useState<BookingFormDraft>(() =>
    createEmptyBookingDraft(data, initialAnchorDate)
  )
  const [bookingFormError, setBookingFormError] = useState<string | null>(null)
  const [filters, setFilters] = useState<CalendarFilters>({
    status: 'all',
    serviceCatalogId: 'all',
    source: 'all',
    channel: 'all',
  })
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)
  const [isCalendarLoading, setIsCalendarLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const rangeCacheRef = useRef(
    new Map<string, CalendarPageData>([
      [buildRangeCacheKey(data.rangeStartIso, data.rangeEndIso), data],
    ])
  )
  const isCalendarCacheDirtyRef = useRef(false)
  const latestCalendarLoadIdRef = useRef(0)
  const desiredRangeCacheKeyRef = useRef(buildRangeCacheKey(data.rangeStartIso, data.rangeEndIso))

  const settings = calendarData.settings
  const isBookingEnabled = Boolean(settings?.booking_enabled)
  const bookingStatusLabel = isBookingEnabled
    ? t('bookingStatus.active')
    : t('bookingStatus.closed')
  const currentTimeZone = settings?.timezone ?? 'Europe/Istanbul'
  const activeView = viewOverride ?? resolveDefaultCalendarView(isMobile)

  useEffect(() => {
    const updateBreakpoint = () => {
      setIsMobile(window.innerWidth < 1024)
    }

    updateBreakpoint()
    window.addEventListener('resize', updateBreakpoint)
    return () => window.removeEventListener('resize', updateBreakpoint)
  }, [])

  useEffect(() => {
    setCalendarData(data)
    const cacheKey = buildRangeCacheKey(data.rangeStartIso, data.rangeEndIso)
    rangeCacheRef.current.set(cacheKey, data)
    desiredRangeCacheKeyRef.current = cacheKey
    isCalendarCacheDirtyRef.current = false
  }, [data])

  const filteredBookings = useMemo(() => {
    return filterCalendarBookings(calendarData.bookings, filters)
  }, [calendarData.bookings, filters])

  const groupedBookings = useMemo(() => {
    const grouped = new Map<string, CalendarBooking[]>()

    for (const booking of filteredBookings) {
      const key = isoToLocalDateTimeParts(booking.starts_at, currentTimeZone).date
      const currentBucket = grouped.get(key) ?? []
      currentBucket.push(booking)
      grouped.set(key, currentBucket)
    }

    for (const [key, bucket] of grouped.entries()) {
      grouped.set(
        key,
        [...bucket].sort((left, right) => {
          return new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
        })
      )
    }

    return grouped
  }, [currentTimeZone, filteredBookings])

  const summary = useMemo(() => {
    return getCalendarSummary(filteredBookings, currentTimeZone)
  }, [currentTimeZone, filteredBookings])

  const weekDays = useMemo(() => {
    const start = getStartOfWeekDateKey(anchorDate)
    return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(start, index))
  }, [anchorDate])

  const monthDateKeys = useMemo(() => buildMonthGrid(anchorDate), [anchorDate])
  const todayDateKey = useMemo(() => getTodayDateKey(currentTimeZone), [currentTimeZone])
  const visibleRange = useMemo(() => {
    return {
      ...buildCalendarRange({
        anchorDate,
        view: activeView,
        timeZone: currentTimeZone,
      }),
      anchorDate,
      view: activeView,
    }
  }, [activeView, anchorDate, currentTimeZone])
  const agendaDateKeys = useMemo(() => {
    return weekDays.filter((dateKey) => (groupedBookings.get(dateKey) ?? []).length > 0)
  }, [groupedBookings, weekDays])
  const visibleBookings = useMemo(() => {
    if (activeView === 'day') {
      return groupedBookings.get(anchorDate) ?? []
    }

    if (activeView === 'month') {
      return monthDateKeys.flatMap((dateKey) => groupedBookings.get(dateKey) ?? [])
    }

    return weekDays.flatMap((dateKey) => groupedBookings.get(dateKey) ?? [])
  }, [activeView, anchorDate, groupedBookings, monthDateKeys, weekDays])

  useEffect(() => {
    if (visibleBookings.some((booking) => booking.id === selectedBookingId)) return
    setSelectedBookingId(visibleBookings[0]?.id ?? null)
  }, [selectedBookingId, visibleBookings])

  const selectedBooking = useMemo(() => {
    return visibleBookings.find((booking) => booking.id === selectedBookingId) ?? null
  }, [selectedBookingId, visibleBookings])

  const availableServices = calendarData.services
  const selectedService =
    availableServices.find((service) => service.id === bookingDraft.serviceCatalogId) ?? null

  const syncCalendarUrl = useCallback(
    (nextDate: string, nextView: CalendarView) => {
      if (typeof window === 'undefined') return

      const params = new URLSearchParams(window.location.search)
      params.set('date', nextDate)
      params.set('view', nextView)
      const query = params.toString()

      window.history.replaceState(
        window.history.state,
        '',
        query ? `${pathname}?${query}` : pathname
      )
    },
    [pathname]
  )

  const invalidateCalendarWindowCache = useCallback(() => {
    isCalendarCacheDirtyRef.current = true
    latestCalendarLoadIdRef.current += 1
    rangeCacheRef.current.clear()
  }, [])

  const ensureCalendarWindow = useCallback(
    async (nextAnchorDate: string, nextView: CalendarView, timeZone: string) => {
      const nextVisibleRange = buildCalendarRange({
        anchorDate: nextAnchorDate,
        view: nextView,
        timeZone,
      })
      const currentCacheKey = buildRangeCacheKey(
        calendarData.rangeStartIso,
        calendarData.rangeEndIso
      )

      if (
        !isCalendarCacheDirtyRef.current &&
        calendarRangeContains({
          outerRangeStartIso: calendarData.rangeStartIso,
          outerRangeEndIso: calendarData.rangeEndIso,
          innerRangeStartIso: nextVisibleRange.rangeStartIso,
          innerRangeEndIso: nextVisibleRange.rangeEndIso,
        })
      ) {
        desiredRangeCacheKeyRef.current = currentCacheKey
        setIsCalendarLoading(false)
        return
      }

      const nextWindow = buildCalendarDataWindow({
        anchorDate: nextAnchorDate,
        timeZone,
      })
      const cacheKey = buildRangeCacheKey(nextWindow.rangeStartIso, nextWindow.rangeEndIso)
      desiredRangeCacheKeyRef.current = cacheKey
      const cachedWindow = rangeCacheRef.current.get(cacheKey)

      if (cachedWindow) {
        setCalendarData(cachedWindow)
        setIsCalendarLoading(false)
        return
      }

      const requestId = latestCalendarLoadIdRef.current + 1
      latestCalendarLoadIdRef.current = requestId
      setIsCalendarLoading(true)

      try {
        const nextData = await getCalendarPageData({
          rangeStartIso: nextWindow.rangeStartIso,
          rangeEndIso: nextWindow.rangeEndIso,
        })

        if (
          latestCalendarLoadIdRef.current !== requestId ||
          desiredRangeCacheKeyRef.current !== cacheKey
        ) {
          return
        }

        rangeCacheRef.current.set(cacheKey, nextData)
        setCalendarData(nextData)
      } catch (error) {
        if (
          latestCalendarLoadIdRef.current !== requestId ||
          desiredRangeCacheKeyRef.current !== cacheKey
        ) {
          return
        }

        setFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : t('messages.saveFailed'),
        })
      } finally {
        if (
          latestCalendarLoadIdRef.current === requestId &&
          desiredRangeCacheKeyRef.current === cacheKey
        ) {
          setIsCalendarLoading(false)
        }
      }
    },
    [calendarData.rangeEndIso, calendarData.rangeStartIso, t]
  )

  useEffect(() => {
    syncCalendarUrl(anchorDate, activeView)
  }, [activeView, anchorDate, syncCalendarUrl])

  useEffect(() => {
    void ensureCalendarWindow(anchorDate, activeView, currentTimeZone)
  }, [activeView, anchorDate, currentTimeZone, ensureCalendarWindow])

  const navigateCalendar = (nextView: CalendarView, nextDate: string) => {
    setAnchorDate(nextDate)
    setViewOverride(nextView)
    syncCalendarUrl(nextDate, nextView)
  }

  const openCreateBooking = () => {
    setBookingFormError(null)
    setBookingDraft(createEmptyBookingDraft(calendarData, anchorDate))
    setIsBookingModalOpen(true)
  }

  const openEditBooking = (booking: CalendarBooking) => {
    setIsDetailModalOpen(false)
    setBookingFormError(null)
    setBookingDraft(createBookingDraftFromRecord(booking, currentTimeZone))
    setIsBookingModalOpen(true)
  }

  const openDetailBooking = (bookingId: string) => {
    setSelectedBookingId(bookingId)
    setIsDetailModalOpen(true)
  }

  const submitBooking = () => {
    setBookingFormError(null)

    if (readOnlyTenantMode) {
      setBookingFormError(t('readOnlyBanner'))
      return
    }

    if (!bookingDraft.date || !bookingDraft.time) {
      setBookingFormError(t('bookingForm.validationDateTime'))
      return
    }

    const startsAt = localDateTimeToIso({
      date: bookingDraft.date,
      time: bookingDraft.time,
      timeZone: currentTimeZone,
    })
    const parsedDuration = Number.parseInt(bookingDraft.durationMinutes, 10)
    const startsAtMs = new Date(startsAt).getTime()

    if (!Number.isFinite(startsAtMs)) {
      setBookingFormError(t('bookingForm.validationDateTime'))
      return
    }

    if (startsAtMs < Date.now()) {
      setBookingFormError(t('bookingForm.validationPastDate'))
      return
    }

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      setBookingFormError(t('bookingForm.validationDuration'))
      return
    }

    const payload: CreateCalendarBookingInput = {
      serviceCatalogId: bookingDraft.serviceCatalogId || null,
      durationMinutes: parsedDuration,
      customerName: bookingDraft.customerName.trim() || null,
      customerEmail: bookingDraft.customerEmail.trim() || null,
      customerPhone: bookingDraft.customerPhone.trim() || null,
      notes: bookingDraft.notes.trim() || null,
      startsAt,
      source: bookingDraft.source,
      channel: bookingDraft.channel,
    }

    startTransition(() => {
      void (async () => {
        try {
          if (bookingDraft.bookingId) {
            const updatePayload: UpdateCalendarBookingInput = {
              ...payload,
              bookingId: bookingDraft.bookingId,
              status: bookingDraft.status,
            }
            await updateCalendarBookingAction(updatePayload)
          } else {
            await createCalendarBookingAction(payload)
          }

          setFeedback({
            type: 'success',
            message: bookingDraft.bookingId
              ? t('messages.bookingUpdated')
              : t('messages.bookingCreated'),
          })
          setBookingFormError(null)
          setIsBookingModalOpen(false)
          setIsDetailModalOpen(false)
          invalidateCalendarWindowCache()
          router.refresh()
        } catch (error) {
          setBookingFormError(t(resolveCalendarBookingMutationErrorKey({ error, startsAt })))
        }
      })()
    })
  }

  const cancelSelectedBooking = (bookingId: string) => {
    if (readOnlyTenantMode) {
      setFeedback({ type: 'error', message: t('readOnlyBanner') })
      return
    }

    startTransition(() => {
      void (async () => {
        try {
          await cancelCalendarBookingAction(bookingId)
          setFeedback({ type: 'success', message: t('messages.bookingCanceled') })
          setIsDetailModalOpen(false)
          invalidateCalendarWindowCache()
          router.refresh()
        } catch (error) {
          setFeedback({
            type: 'error',
            message: error instanceof Error ? error.message : t('messages.saveFailed'),
          })
        }
      })()
    })
  }

  const renderBookingCard = (
    booking: CalendarBooking,
    options: { tone?: 'default' | 'inverse' } = {}
  ) => {
    const tone = options.tone ?? 'default'
    const isInverse = tone === 'inverse'

    return (
      <button
        key={booking.id}
        type="button"
        onClick={() => openDetailBooking(booking.id)}
        className={cn(
          'w-full rounded-2xl p-3 text-left transition-colors',
          isInverse
            ? 'bg-white/10 text-white hover:bg-white/15'
            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                'truncate text-sm font-semibold',
                isInverse ? 'text-white' : 'text-slate-900'
              )}
            >
              {booking.service_name_snapshot ?? t('emptyStates.untitledBooking')}
            </p>
            <p className={cn('mt-1 text-xs', isInverse ? 'text-slate-300' : 'text-slate-500')}>
              {booking.customer_name ?? booking.customer_phone ?? t('emptyStates.customerPending')}
            </p>
          </div>
        </div>
        <p className={cn('mt-3 text-sm', isInverse ? 'text-slate-100' : 'text-slate-700')}>
          {formatDateTimeLabel({
            startIso: booking.starts_at,
            endIso: booking.ends_at,
            timeZone: currentTimeZone,
            locale,
          })}
        </p>
        <div
          className={cn(
            'mt-3 flex flex-wrap gap-2 text-[11px]',
            isInverse ? 'text-slate-300' : 'text-slate-500'
          )}
        >
          <span>{t(`sources.${booking.source}`)}</span>
          <span>•</span>
          <span>{t(`channels.${booking.channel ?? 'manual'}`)}</span>
          <span>•</span>
          <span>
            {booking.duration_minutes} {t('minutesShort')}
          </span>
        </div>
      </button>
    )
  }

  const renderAgendaView = () => {
    const orderedDates = agendaDateKeys

    if (orderedDates.length === 0) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('emptyStates.noBookingsInRange')}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {orderedDates.map((dateKey) => (
          <section
            key={dateKey}
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {formatDateKeyLabel({
                  dateKey,
                  timeZone: currentTimeZone,
                  locale,
                  weekday: true,
                })}
              </h3>
              <span className="text-xs text-slate-500">
                {(groupedBookings.get(dateKey) ?? []).length} {t('labels.bookingsCount')}
              </span>
            </div>
            <div className="space-y-3">
              {(groupedBookings.get(dateKey) ?? []).map((booking) => renderBookingCard(booking))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  const renderDayView = () => {
    const dayBookings = groupedBookings.get(anchorDate) ?? []

    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {formatDateKeyLabel({
              dateKey: anchorDate,
              timeZone: currentTimeZone,
              locale,
              weekday: true,
            })}
          </h3>
          <span className="text-xs text-slate-500">
            {dayBookings.length} {t('labels.bookingsCount')}
          </span>
        </div>
        {dayBookings.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {t('emptyStates.noBookingsOnDay')}
          </p>
        ) : (
          <div className="space-y-3">
            {dayBookings.map((booking) => renderBookingCard(booking))}
          </div>
        )}
      </section>
    )
  }

  const renderWeekView = () => {
    return (
      <div className="grid gap-4 xl:grid-cols-7 md:grid-cols-2">
        {weekDays.map((dateKey) => {
          const dayBookings = groupedBookings.get(dateKey) ?? []
          const isToday = dateKey === todayDateKey

          return (
            <section
              key={dateKey}
              className={cn(
                'rounded-3xl border p-4 shadow-sm',
                isToday ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  className={cn('text-sm font-semibold', isToday ? 'text-white' : 'text-slate-900')}
                >
                  {formatDateKeyLabel({
                    dateKey,
                    timeZone: currentTimeZone,
                    locale,
                    weekday: true,
                  })}
                </h3>
                <span className={cn('text-xs', isToday ? 'text-slate-300' : 'text-slate-500')}>
                  {dayBookings.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {dayBookings.length === 0 ? (
                  <p
                    className={cn(
                      'rounded-2xl border border-dashed px-3 py-5 text-xs text-center',
                      isToday
                        ? 'border-slate-700 text-slate-300'
                        : 'border-slate-300 text-slate-500'
                    )}
                  >
                    {t('emptyStates.noBookingsShort')}
                  </p>
                ) : (
                  dayBookings.map((booking) =>
                    renderBookingCard(booking, { tone: isToday ? 'inverse' : 'default' })
                  )
                )}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  const renderMonthView = () => {
    const activeMonthKey = anchorDate.slice(0, 7)

    return (
      <div className="grid gap-3 md:grid-cols-7 sm:grid-cols-2">
        {monthDateKeys.map((dateKey) => {
          const dayBookings = groupedBookings.get(dateKey) ?? []
          const isCurrentMonth = dateKey.slice(0, 7) === activeMonthKey
          const isToday = dateKey === todayDateKey

          return (
            <section
              key={dateKey}
              className={cn(
                'min-h-36 rounded-3xl border p-3 shadow-sm',
                isToday
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : isCurrentMonth
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-200 bg-slate-100'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={cn(
                    'text-sm font-semibold',
                    isToday ? 'text-white' : isCurrentMonth ? 'text-slate-900' : 'text-slate-500'
                  )}
                >
                  {formatDateKeyLabel({
                    dateKey,
                    timeZone: currentTimeZone,
                    locale,
                  })}
                </h3>
                <span className={cn('text-xs', isToday ? 'text-slate-300' : 'text-slate-400')}>
                  {dayBookings.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {dayBookings.slice(0, 3).map((booking) => {
                  const bookingStartTime = isoToLocalDateTimeParts(
                    booking.starts_at,
                    currentTimeZone
                  ).time
                  const bookingEndTime = isoToLocalDateTimeParts(
                    booking.ends_at,
                    currentTimeZone
                  ).time

                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => openDetailBooking(booking.id)}
                      className={cn(
                        'block w-full rounded-2xl px-2 py-2 text-left text-xs transition-colors',
                        isToday
                          ? 'bg-white/10 text-white hover:bg-white/15'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      )}
                    >
                      <p className="truncate font-medium">
                        {booking.service_name_snapshot ?? t('emptyStates.untitledBooking')}
                      </p>
                      <p
                        className={cn(
                          'mt-1 truncate text-[11px]',
                          isToday ? 'text-slate-300' : 'text-slate-500'
                        )}
                      >
                        {booking.customer_name ??
                          booking.customer_phone ??
                          t('emptyStates.customerPending')}
                      </p>
                      <p
                        className={cn(
                          'mt-1 truncate text-[11px] font-medium',
                          isToday ? 'text-white' : 'text-slate-600'
                        )}
                      >
                        {bookingStartTime} - {bookingEndTime}
                      </p>
                    </button>
                  )
                })}
                {dayBookings.length > 3 && (
                  <p className={cn('text-xs', isToday ? 'text-slate-300' : 'text-slate-500')}>
                    +{dayBookings.length - 3} {t('labels.moreBookings')}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  const renderDetailPanel = (booking: CalendarBooking | null) => {
    if (!booking) return null

    const detailContent = (
      <>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">
            {booking.service_name_snapshot ?? t('emptyStates.untitledBooking')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {booking.customer_name ?? booking.customer_phone ?? t('emptyStates.customerPending')}
          </p>
        </div>
        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-start gap-3 text-slate-600">
            <CalendarClock size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-900">{t('detail.when')}</p>
              <p>
                {formatDateTimeLabel({
                  startIso: booking.starts_at,
                  endIso: booking.ends_at,
                  timeZone: currentTimeZone,
                  locale,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-slate-600">
            <Clock3 size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-900">{t('detail.duration')}</p>
              <p>
                {booking.duration_minutes} {t('minutesLabel')}
              </p>
              <p className="text-xs text-slate-500">
                {t(`durationSource.${booking.duration_source}`)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-slate-600">
            <Link2 size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-900">{t('detail.origin')}</p>
              <p>
                {t(`sources.${booking.source}`)} • {t(`channels.${booking.channel ?? 'manual'}`)}
              </p>
              <p className="text-xs text-slate-500">{t(`syncStatus.${booking.sync_status}`)}</p>
            </div>
          </div>
          {booking.notes && (
            <div>
              <p className="font-medium text-slate-900">{t('detail.notes')}</p>
              <p className="mt-1 text-slate-600">{booking.notes}</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <Button
            variant="secondary"
            onClick={() => openEditBooking(booking)}
            disabled={isPending || readOnlyTenantMode}
          >
            {t('actions.editBooking')}
          </Button>
          <Button
            variant="danger"
            onClick={() => cancelSelectedBooking(booking.id)}
            disabled={isPending || readOnlyTenantMode}
          >
            {t('actions.cancelBooking')}
          </Button>
        </div>
      </>
    )

    return (
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={t('detail.title')}
      >
        {detailContent}
      </Modal>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      {data.organizationId ? (
        <WorkspaceIntroModal
          storageScope="calendar"
          userId={userId}
          organizationId={data.organizationId}
          title={tIntro('title')}
          description={tIntro('description')}
          primaryCta={tIntro('primaryCta')}
          secondaryCta={tIntro('secondaryCta')}
          secondaryHref="/settings/calendar"
          items={[
            {
              id: 'working-hours',
              icon: <CalendarClock size={18} />,
              title: tIntro('items.workingHours.title'),
              body: tIntro('items.workingHours.body'),
            },
            {
              id: 'ai-suggestions',
              icon: <Sparkles size={18} />,
              title: tIntro('items.aiSuggestions.title'),
              body: tIntro('items.aiSuggestions.body'),
            },
            {
              id: 'google-soon',
              icon: <Clock3 size={18} />,
              title: tIntro('items.googleSoon.title'),
              body: tIntro('items.googleSoon.body'),
            },
          ]}
        />
      ) : null}

      <PageHeader
        title={t('title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold shadow-sm',
                isBookingEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-100 text-slate-600'
              )}
            >
              <span
                className={cn(
                  'mr-2 h-2 w-2 rounded-full',
                  isBookingEnabled ? 'bg-emerald-500' : 'bg-slate-400'
                )}
              />
              {bookingStatusLabel}
            </span>
            <Link
              href="/settings/calendar"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <SlidersHorizontal size={16} className="mr-2" />
              {t('actions.openSettings')}
            </Link>
            <Button
              onClick={openCreateBooking}
              disabled={isPending || readOnlyTenantMode || !isBookingEnabled}
              className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"
            >
              {t('actions.newBooking')}
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-3 md:p-6">
        <div className="flex w-full min-w-0 flex-col gap-4" aria-busy={isCalendarLoading}>
          {feedback && (
            <Alert
              variant={
                feedback.type === 'success'
                  ? 'success'
                  : feedback.type === 'info'
                    ? 'info'
                    : 'error'
              }
            >
              {feedback.message}
            </Alert>
          )}

          {readOnlyTenantMode && <Alert variant="warning">{t('readOnlyBanner')}</Alert>}

          <section className="grid gap-3 xl:grid-cols-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('summary.today')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{summary.todayCount}</p>
              <p className="mt-2 text-sm text-slate-500">{t('summary.todayHint')}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('summary.thisWeek')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{summary.weekCount}</p>
              <p className="mt-2 text-sm text-slate-500">{t('summary.weekHint')}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('summary.upcoming')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{summary.upcomingCount}</p>
              <p className="mt-2 text-sm text-slate-500">
                {summary.nextBooking
                  ? formatDateTimeLabel({
                      startIso: summary.nextBooking.starts_at,
                      endIso: summary.nextBooking.ends_at,
                      timeZone: currentTimeZone,
                      locale,
                    })
                  : t('summary.noUpcoming')}
              </p>
            </div>
          </section>

          <section className="sticky top-3 z-[5] rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {(['day', 'week', 'month', 'agenda'] as CalendarView[]).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => navigateCalendar(view, anchorDate)}
                      className={cn(
                        'rounded-2xl px-3 py-2 text-sm font-medium transition-colors',
                        activeView === view
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      )}
                    >
                      {t(`views.${view}`)}
                    </button>
                  ))}
                </div>
                <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigateCalendar(
                        activeView,
                        shiftCalendarAnchor({
                          anchorDate,
                          view: activeView,
                          direction: 'prev',
                        })
                      )
                    }
                    className="rounded-xl p-2 text-slate-600 hover:bg-white hover:text-slate-900"
                    aria-label={t('actions.previousRange')}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="min-w-40 px-2 text-center text-sm font-medium text-slate-900">
                    {getViewLabel({
                      anchorDate: visibleRange.anchorDate,
                      view: visibleRange.view,
                      timeZone: currentTimeZone,
                      locale,
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigateCalendar(
                        activeView,
                        shiftCalendarAnchor({
                          anchorDate,
                          view: activeView,
                          direction: 'next',
                        })
                      )
                    }
                    className="rounded-xl p-2 text-slate-600 hover:bg-white hover:text-slate-900"
                    aria-label={t('actions.nextRange')}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigateCalendar(activeView, todayDateKey)}
                >
                  {t('actions.goToday')}
                </Button>
              </div>

              <div className="grid gap-2 md:grid-cols-4 xl:w-[34rem]">
                <Select
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      status: event.target.value as CalendarFilters['status'],
                    }))
                  }
                  className="h-10 border-slate-200 text-slate-700"
                >
                  <option value="all">{t('filters.allStatuses')}</option>
                  <option value="pending">{t('statuses.pending')}</option>
                  <option value="confirmed">{t('statuses.confirmed')}</option>
                  <option value="completed">{t('statuses.completed')}</option>
                  <option value="no_show">{t('statuses.no_show')}</option>
                  <option value="canceled">{t('statuses.canceled')}</option>
                </Select>
                <Select
                  value={filters.serviceCatalogId}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, serviceCatalogId: event.target.value }))
                  }
                  className="h-10 border-slate-200 text-slate-700"
                >
                  <option value="all">{t('filters.allServices')}</option>
                  {availableServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={filters.source}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      source: event.target.value as CalendarFilters['source'],
                    }))
                  }
                  className="h-10 border-slate-200 text-slate-700"
                >
                  <option value="all">{t('filters.allSources')}</option>
                  <option value="manual">{t('sources.manual')}</option>
                  <option value="operator">{t('sources.operator')}</option>
                  <option value="ai">{t('sources.ai')}</option>
                </Select>
                <Select
                  value={filters.channel ?? ''}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      channel: event.target.value as CalendarFilters['channel'],
                    }))
                  }
                  className="h-10 border-slate-200 text-slate-700"
                >
                  <option value="all">{t('filters.allChannels')}</option>
                  <option value="manual">{t('channels.manual')}</option>
                  <option value="whatsapp">{t('channels.whatsapp')}</option>
                  <option value="instagram">{t('channels.instagram')}</option>
                  <option value="telegram">{t('channels.telegram')}</option>
                  <option value="simulator">{t('channels.simulator')}</option>
                </Select>
              </div>
            </div>
          </section>

          <div className="space-y-4">
            {activeView === 'agenda' && renderAgendaView()}
            {activeView === 'day' && renderDayView()}
            {activeView === 'week' && renderWeekView()}
            {activeView === 'month' && renderMonthView()}
          </div>
        </div>
      </div>

      <Modal
        isOpen={isBookingModalOpen}
        onClose={() => {
          setBookingFormError(null)
          setIsBookingModalOpen(false)
        }}
        title={bookingDraft.bookingId ? t('actions.editBooking') : t('actions.newBooking')}
      >
        <div className="space-y-4">
          {bookingFormError && <Alert variant="error">{bookingFormError}</Alert>}
          <label className="block text-sm text-slate-700">
            <span>{t('bookingForm.service')}</span>
            <Select
              value={bookingDraft.serviceCatalogId}
              onChange={(event) =>
                setBookingDraft((current) => ({
                  ...current,
                  serviceCatalogId: event.target.value,
                  durationMinutes: resolveDraftDurationMinutes(calendarData, event.target.value),
                }))
              }
              className="mt-1 h-10 border-slate-200"
            >
              <option value="">{t('bookingForm.serviceOptional')}</option>
              {availableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-slate-700">
              <span>{t('bookingForm.date')}</span>
              <input
                type="date"
                value={bookingDraft.date}
                onChange={(event) =>
                  setBookingDraft((current) => ({ ...current, date: event.target.value }))
                }
                className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span>{t('bookingForm.time')}</span>
              <input
                type="time"
                value={bookingDraft.time}
                onChange={(event) =>
                  setBookingDraft((current) => ({ ...current, time: event.target.value }))
                }
                className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3"
              />
            </label>
          </div>
          <label className="block text-sm text-slate-700">
            <span>{t('bookingForm.durationMinutes')}</span>
            <input
              type="number"
              min={1}
              step={5}
              inputMode="numeric"
              value={bookingDraft.durationMinutes}
              onChange={(event) =>
                setBookingDraft((current) => ({ ...current, durationMinutes: event.target.value }))
              }
              className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3"
            />
            <p className="mt-2 text-xs text-slate-500">
              {t('bookingForm.durationDefaultHint', {
                minutes:
                  selectedService?.duration_minutes ??
                  settings?.default_booking_duration_minutes ??
                  60,
              })}
            </p>
          </label>
          <label className="block text-sm text-slate-700">
            <span>{t('bookingForm.customerName')}</span>
            <input
              value={bookingDraft.customerName}
              onChange={(event) =>
                setBookingDraft((current) => ({ ...current, customerName: event.target.value }))
              }
              className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3"
            />
          </label>
          <label className="block text-sm text-slate-700">
            <span>{t('bookingForm.customerEmail')}</span>
            <input
              type="email"
              value={bookingDraft.customerEmail}
              onChange={(event) =>
                setBookingDraft((current) => ({ ...current, customerEmail: event.target.value }))
              }
              className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3"
            />
          </label>
          <label className="block text-sm text-slate-700">
            <span>{t('bookingForm.customerPhone')}</span>
            <input
              value={bookingDraft.customerPhone}
              onChange={(event) =>
                setBookingDraft((current) => ({ ...current, customerPhone: event.target.value }))
              }
              className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-slate-700">
              <span>{t('bookingForm.source')}</span>
              <Select
                value={bookingDraft.source}
                onChange={(event) =>
                  setBookingDraft((current) => ({
                    ...current,
                    source: event.target.value as CalendarBookingSource,
                  }))
                }
                className="mt-1 h-10 border-slate-200"
              >
                <option value="manual">{t('sources.manual')}</option>
                <option value="operator">{t('sources.operator')}</option>
                <option value="ai">{t('sources.ai')}</option>
              </Select>
            </label>
            <label className="block text-sm text-slate-700">
              <span>{t('bookingForm.channel')}</span>
              <Select
                value={bookingDraft.channel ?? 'manual'}
                onChange={(event) =>
                  setBookingDraft((current) => ({
                    ...current,
                    channel: event.target.value as CalendarBooking['channel'],
                  }))
                }
                className="mt-1 h-10 border-slate-200"
              >
                <option value="manual">{t('channels.manual')}</option>
                <option value="whatsapp">{t('channels.whatsapp')}</option>
                <option value="instagram">{t('channels.instagram')}</option>
                <option value="telegram">{t('channels.telegram')}</option>
                <option value="simulator">{t('channels.simulator')}</option>
              </Select>
            </label>
          </div>
          {bookingDraft.bookingId && (
            <label className="block text-sm text-slate-700">
              <span>{t('bookingForm.status')}</span>
              <Select
                value={bookingDraft.status}
                onChange={(event) =>
                  setBookingDraft((current) => ({
                    ...current,
                    status: event.target.value as CalendarBookingStatus,
                  }))
                }
                className="mt-1 h-10 border-slate-200"
              >
                <option value="pending">{t('statuses.pending')}</option>
                <option value="confirmed">{t('statuses.confirmed')}</option>
                <option value="completed">{t('statuses.completed')}</option>
                <option value="no_show">{t('statuses.no_show')}</option>
              </Select>
            </label>
          )}
          <label className="block text-sm text-slate-700">
            <span>{t('bookingForm.notes')}</span>
            <textarea
              value={bookingDraft.notes}
              onChange={(event) =>
                setBookingDraft((current) => ({ ...current, notes: event.target.value }))
              }
              className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-2"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setBookingFormError(null)
                setIsBookingModalOpen(false)
              }}
            >
              {t('actions.close')}
            </Button>
            <Button
              onClick={submitBooking}
              disabled={isPending || readOnlyTenantMode}
              className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"
            >
              {isPending ? t('actions.saving') : t('actions.saveBooking')}
            </Button>
          </div>
        </div>
      </Modal>

      {renderDetailPanel(selectedBooking)}
    </div>
  )
}
