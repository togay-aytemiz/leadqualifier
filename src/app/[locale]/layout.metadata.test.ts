import { describe, expect, it } from 'vitest'

import enMessages from '../../../messages/en.json'
import trMessages from '../../../messages/tr.json'
import { metadata } from '@/app/[locale]/layout'

describe('locale layout metadata branding', () => {
    it('uses Qualy branding and icon-black favicon metadata', () => {
        expect(metadata.title).toBe('Qualy')
        expect(metadata.description).toContain('Qualy')
        expect(metadata.icons).toEqual({
            icon: '/icon-black.svg',
            shortcut: '/icon-black.svg',
            apple: '/icon-black.svg',
        })
    })

    it('keeps common EN/TR app labels free from legacy qualifier naming', () => {
        const legacyBrandingPattern = /lead\s+qualifier|qualifier/i

        expect(enMessages.common.appName).toBe('Qualy')
        expect(enMessages.common.welcome).toContain('Qualy')
        expect(enMessages.common.appName).not.toMatch(legacyBrandingPattern)
        expect(enMessages.common.welcome).not.toMatch(legacyBrandingPattern)

        expect(trMessages.common.appName).toBe('Qualy')
        expect(trMessages.common.welcome).toContain('Qualy')
        expect(trMessages.common.appName).not.toMatch(legacyBrandingPattern)
        expect(trMessages.common.welcome).not.toMatch(legacyBrandingPattern)
    })
})
