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

    expect(source).toContain('const invalidateCalendarWindowCache = useEffectEvent(() => {')
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
})
