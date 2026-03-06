import { describe, expect, it } from 'vitest'
import { buildLocalizedPath, normalizeAppLocale } from './locale-path'

describe('locale path helpers', () => {
    it('keeps the default Turkish locale unprefixed', () => {
        expect(buildLocalizedPath('/settings/plans', 'tr')).toBe('/settings/plans')
    })

    it('prefixes non-default locales', () => {
        expect(buildLocalizedPath('/settings/plans', 'en')).toBe('/en/settings/plans')
    })

    it('normalizes invalid locales to the default locale', () => {
        expect(normalizeAppLocale('de')).toBe('tr')
        expect(buildLocalizedPath('/settings/plans', 'de')).toBe('/settings/plans')
    })
})
