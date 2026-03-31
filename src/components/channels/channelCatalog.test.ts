import { describe, expect, it } from 'vitest'

import {
    getChannelCatalog,
    getChannelCatalogEntry,
    getChannelSetupHref
} from '@/components/channels/channelCatalog'

describe('channelCatalog', () => {
    it('returns stable channel onboarding routes for the visible gallery order', () => {
        const catalog = getChannelCatalog()

        expect(catalog.map((entry) => entry.type)).toEqual([
            'whatsapp',
            'instagram',
            'messenger',
            'telegram'
        ])

        expect(catalog.map((entry) => entry.href)).toEqual([
            '/settings/channels/whatsapp',
            '/settings/channels/instagram',
            '/settings/channels/messenger',
            '/settings/channels/telegram'
        ])
    })

    it('exposes onboarding metadata for the primary channels', () => {
        const whatsapp = getChannelCatalogEntry('whatsapp')
        const telegram = getChannelCatalogEntry('telegram')
        const instagram = getChannelCatalogEntry('instagram')
        const messenger = getChannelCatalogEntry('messenger')

        expect(whatsapp?.badge).toBeUndefined()
        expect(whatsapp?.onboardingSurface).toBe('interactive')
        expect(whatsapp?.resources.length).toBeGreaterThan(0)
        expect(whatsapp?.resources.map((resource) => resource.labelKey)).toContain('whatsappMigration')
        expect(telegram?.onboardingSurface).toBe('interactive')
        expect(instagram?.onboardingSurface).toBe('interactive')
        expect(instagram?.badge).toBeUndefined()
        expect(messenger?.onboardingSurface).toBe('placeholder')
        expect(messenger?.badge).toBe('comingSoon')
    })

    it('builds stable detail hrefs by channel type', () => {
        expect(getChannelSetupHref('whatsapp')).toBe('/settings/channels/whatsapp')
        expect(getChannelSetupHref('telegram')).toBe('/settings/channels/telegram')
        expect(getChannelSetupHref('messenger')).toBe('/settings/channels/messenger')
        expect(getChannelSetupHref('instagram')).toBe('/settings/channels/instagram')
    })
})
