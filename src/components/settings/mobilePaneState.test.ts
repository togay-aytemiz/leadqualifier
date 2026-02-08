import { describe, expect, it } from 'vitest'

import {
    getSettingsMobileDetailPaneClasses,
    getSettingsMobileListPaneClasses,
    getSettingsNavItemFromPath,
    isSettingsDetailPath
} from '@/components/settings/mobilePaneState'

describe('settings mobile pane state helpers', () => {
    it('keeps list pane visible when detail is closed', () => {
        const classes = getSettingsMobileListPaneClasses(false)

        expect(classes).toContain('translate-x-0')
        expect(classes).toContain('pointer-events-auto')
    })

    it('slides list pane left when detail is open', () => {
        const classes = getSettingsMobileListPaneClasses(true)

        expect(classes).toContain('-translate-x-full')
        expect(classes).toContain('pointer-events-none')
    })

    it('keeps detail pane hidden on the right when detail is closed', () => {
        const classes = getSettingsMobileDetailPaneClasses(false)

        expect(classes).toContain('translate-x-full')
        expect(classes).toContain('pointer-events-none')
    })

    it('slides detail pane in when detail is open', () => {
        const classes = getSettingsMobileDetailPaneClasses(true)

        expect(classes).toContain('translate-x-0')
        expect(classes).toContain('pointer-events-auto')
    })

    it('detects settings detail routes with and without locale prefixes', () => {
        expect(isSettingsDetailPath('/settings')).toBe(false)
        expect(isSettingsDetailPath('/en/settings')).toBe(false)
        expect(isSettingsDetailPath('/settings/profile')).toBe(true)
        expect(isSettingsDetailPath('/en/settings/organization')).toBe(true)
    })

    it('resolves active settings item from pathname', () => {
        expect(getSettingsNavItemFromPath('/settings')).toBeNull()
        expect(getSettingsNavItemFromPath('/en/settings')).toBeNull()
        expect(getSettingsNavItemFromPath('/settings/profile')).toBe('profile')
        expect(getSettingsNavItemFromPath('/en/settings/organization')).toBe('organization')
        expect(getSettingsNavItemFromPath('/tr/settings/general')).toBe('general')
        expect(getSettingsNavItemFromPath('/settings/ai')).toBe('ai')
        expect(getSettingsNavItemFromPath('/settings/channels')).toBe('channels')
        expect(getSettingsNavItemFromPath('/settings/billing')).toBe('billing')
        expect(getSettingsNavItemFromPath('/settings/unknown')).toBeNull()
    })
})
