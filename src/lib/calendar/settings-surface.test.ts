import { describe, expect, it } from 'vitest'

import { getCalendarSettingsSectionIds } from '@/lib/calendar/settings-surface'

describe('getCalendarSettingsSectionIds', () => {
    it('keeps the dedicated calendar settings page focused on operational rules', () => {
        expect(getCalendarSettingsSectionIds('settings')).toEqual([
            'general',
            'availability',
            'serviceDurations'
        ])
    })

    it('keeps application management isolated to integration settings', () => {
        expect(getCalendarSettingsSectionIds('apps')).toEqual([
            'google'
        ])
    })
})
