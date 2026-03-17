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
})
