import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CALENDAR_PAGE_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/calendar/page.tsx'
)
const CALENDAR_CLIENT_PATH = path.resolve(
  process.cwd(),
  'src/components/calendar/CalendarClient.tsx'
)

describe('calendar page source', () => {
  it('uses a neutral page component name to avoid the Turbopack negative timestamp overlay', () => {
    const source = fs.readFileSync(CALENDAR_PAGE_PATH, 'utf8')

    expect(source).not.toContain('export default async function CalendarPage')
    expect(source).toContain('export default async function CalendarWorkspacePage')
  })

  it('uses a dedicated calendar settings action and full-width workspace layout', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).toContain('href="/settings/calendar"')
    expect(source.match(/t\('actions\.openSettings'\)/g)).toHaveLength(1)
    expect(source).not.toContain('max-w-7xl')
    expect(source).not.toContain('isSettingsModalOpen')
  })

  it('keeps calendar navigation client-side instead of pushing the whole route on every click', () => {
    const pageSource = fs.readFileSync(CALENDAR_PAGE_PATH, 'utf8')
    const clientSource = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(pageSource).toContain('buildCalendarDataWindow')
    expect(clientSource).toContain('window.history.replaceState')
    expect(clientSource).toContain('getCalendarPageData(')
    expect(clientSource).not.toContain('router.push(`${pathname}?${params.toString()}`)')
  })

  it('guards cached-window reuse and stale async loads inside the client workspace', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).toContain('rangeCacheRef')
    expect(source).toContain('desiredRangeCacheKeyRef')
    expect(source).toContain('latestCalendarLoadIdRef')
    expect(source).toContain('const cachedWindow = rangeCacheRef.current.get(cacheKey)')
    expect(source).toContain('latestCalendarLoadIdRef.current !== requestId')
    expect(source).toContain('desiredRangeCacheKeyRef.current !== cacheKey')
  })

  it('invalidates cached calendar windows after create, update, and cancel mutations', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).toContain('const invalidateCalendarWindowCache = useCallback(() => {')
    expect(source).toContain('isCalendarCacheDirtyRef')
    expect(source).toContain('latestCalendarLoadIdRef.current += 1')
    expect(source.match(/invalidateCalendarWindowCache\(\)/g)).toHaveLength(2)
    expect(source.match(/rangeCacheRef\.current\.clear\(\)/g)).toHaveLength(1)
  })

  it('keeps booking duration editable, captures customer email, and uses the shared select primitive in the modal', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).toContain('durationMinutes')
    expect(source).toContain("t('bookingForm.customerEmail')")
    expect(source).toContain('<Select')
    expect(source).not.toContain("t('bookingForm.durationPreview')")
  })

  it('keeps header actions aligned with the knowledge workspace sizing and dark primary CTA styling', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).toContain(
      'className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"'
    )
    expect(source).not.toContain(
      'className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"'
    )
    expect(source).toContain('className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"')
    expect(source).not.toContain('<Button\n              size="sm"\n              onClick={openCreateBooking}')
  })

  it('keeps manual booking validation and save errors inside the booking modal', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).toContain("const [bookingFormError, setBookingFormError] = useState<string | null>(null)")
    expect(source).toContain("setBookingFormError(t('bookingForm.validationPastDate'))")
    expect(source).toContain('setBookingFormError(t(resolveCalendarBookingMutationErrorKey({ error, startsAt })))')
    expect(source).toContain('{bookingFormError && <Alert variant="error">{bookingFormError}</Alert>}')
  })

  it('keeps modal footer actions at the standard page button size and dark primary styling', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).toContain("variant=\"secondary\"")
    expect(source).toContain("{isPending ? t('actions.saving') : t('actions.saveBooking')}")
    expect(source).toContain('className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"')
    expect(source).not.toContain('<Button size="sm" onClick={submitBooking}')
  })

  it('drops the week-view status chip and uses a modal instead of the desktop detail sidebar', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).not.toContain('<Badge variant={resolveStatusVariant(booking.status)}>')
    expect(source).not.toContain('xl:grid-cols-[minmax(0,1fr)_20rem]')
    expect(source).not.toContain('{!isMobile && <div className="space-y-4">{renderDetailPanel(selectedBooking)}</div>}')
    expect(source).toContain('const openDetailBooking = (bookingId: string) => {')
    expect(source).toContain('isOpen={isDetailModalOpen}')
  })

  it('keeps detail modal footer actions at the standard size', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')

    expect(source).not.toContain('<Button\n            variant="secondary"\n            size="sm"\n            onClick={() => openEditBooking(booking)}')
    expect(source).not.toContain('<Button\n            variant="danger"\n            size="sm"\n            onClick={() => cancelSelectedBooking(booking.id)}')
  })

  it('opens booking details in the shared modal across day, week, month, and agenda views', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')
    const agendaViewSource =
      source.split('const renderAgendaView = () => {')[1]?.split('const renderDayView = () => {')[0] ??
      ''
    const dayViewSource =
      source.split('const renderDayView = () => {')[1]?.split('const renderWeekView = () => {')[0] ??
      ''
    const weekViewSource =
      source.split('const renderWeekView = () => {')[1]?.split('const renderMonthView = () => {')[0] ??
      ''
    const monthViewSource =
      source.split('const renderMonthView = () => {')[1]?.split('const renderDetailPanel =')[0] ?? ''

    expect(agendaViewSource).toContain('.map((booking) => renderBookingCard(booking))')
    expect(dayViewSource).toContain('dayBookings.map((booking) => renderBookingCard(booking))')
    expect(weekViewSource).toContain('renderBookingCard(booking')
    expect(monthViewSource).toContain('onClick={() => openDetailBooking(booking.id)}')
    expect(monthViewSource).not.toContain('if (isMobile) {')
  })

  it('shows customer name and end time in month-view booking cards', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')
    const monthViewSource =
      source.split('const renderMonthView = () => {')[1]?.split('const renderDetailPanel =')[0] ?? ''

    expect(monthViewSource).toMatch(
      /booking\.customer_name[\s\S]*booking\.customer_phone[\s\S]*emptyStates\.customerPending/
    )
    expect(monthViewSource).toMatch(
      /bookingEndTime[\s\S]*isoToLocalDateTimeParts\([\s\S]*booking\.ends_at[\s\S]*currentTimeZone[\s\S]*\.time/
    )
  })

  it('uses background-only booking cards in day, week, and agenda views to match month styling', () => {
    const source = fs.readFileSync(CALENDAR_CLIENT_PATH, 'utf8')
    const bookingCardSource =
      source.split('const renderBookingCard =')[1]?.split('const renderAgendaView = () => {')[0] ?? ''
    const weekViewSource =
      source.split('const renderWeekView = () => {')[1]?.split('const renderMonthView = () => {')[0] ??
      ''

    expect(bookingCardSource).not.toContain('border border-slate-200')
    expect(bookingCardSource).toContain('bg-slate-50 text-slate-700 hover:bg-slate-100')
    expect(bookingCardSource).toContain('bg-white/10 text-white hover:bg-white/15')
    expect(weekViewSource).toContain("renderBookingCard(booking, { tone: isToday ? 'inverse' : 'default' })")
  })
})
