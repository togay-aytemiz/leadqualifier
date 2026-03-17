import { describe, expect, it } from 'vitest'

import { resolveCalendarReturnPath } from '@/lib/calendar/google-oauth'

describe('resolveCalendarReturnPath', () => {
    it('allows returning to dedicated calendar settings routes', () => {
        expect(resolveCalendarReturnPath('tr', '/settings/calendar')).toBe('/settings/calendar')
        expect(resolveCalendarReturnPath('tr', '/settings/apps')).toBe('/settings/apps')
        expect(resolveCalendarReturnPath('en', '/en/settings/apps')).toBe('/en/settings/apps')
    })

    it('rejects unrelated settings routes and unsafe paths', () => {
        expect(resolveCalendarReturnPath('tr', '/settings/profile')).toBe('/calendar')
        expect(resolveCalendarReturnPath('en', '//evil.example')).toBe('/en/calendar')
    })
})
