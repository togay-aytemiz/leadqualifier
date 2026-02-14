import { describe, expect, it } from 'vitest'

import { transformPendingHrefForLocale } from '@/components/settings/localeHref'

describe('transformPendingHrefForLocale', () => {
    it('keeps href unchanged when locale is not changing', () => {
        const result = transformPendingHrefForLocale({
            href: '/settings/organization?focus=offering-suggestions',
            currentLocale: 'tr',
            nextLocale: 'tr'
        })

        expect(result).toBe('/settings/organization?focus=offering-suggestions')
    })

    it('adds en locale prefix when switching from tr to en', () => {
        const result = transformPendingHrefForLocale({
            href: '/settings/ai',
            currentLocale: 'tr',
            nextLocale: 'en'
        })

        expect(result).toBe('/en/settings/ai')
    })

    it('removes en locale prefix when switching from en to tr', () => {
        const result = transformPendingHrefForLocale({
            href: '/en/settings/plans?status=ok#summary',
            currentLocale: 'en',
            nextLocale: 'tr'
        })

        expect(result).toBe('/settings/plans?status=ok#summary')
    })

    it('does not double-prefix href that already has target locale', () => {
        const result = transformPendingHrefForLocale({
            href: '/en/settings/profile',
            currentLocale: 'tr',
            nextLocale: 'en'
        })

        expect(result).toBe('/en/settings/profile')
    })
})
