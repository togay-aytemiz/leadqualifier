import { describe, expect, it } from 'vitest'

import {
    buildSettingsRouteCacheKey,
    clearSettingsRouteCache,
    getSettingsRouteCacheEntry,
    setSettingsRouteCacheEntry
} from '@/lib/settings/route-cache'

describe('settings route cache', () => {
    it('builds a stable cache key from organization, locale, and normalized route path', () => {
        expect(buildSettingsRouteCacheKey({
            organizationId: 'org_123',
            locale: 'tr',
            routePath: '/settings/organization?focus=details'
        })).toBe('org_123::tr::/settings/organization')
    })

    it('stores and retrieves warmed route snapshots', () => {
        const key = buildSettingsRouteCacheKey({
            organizationId: 'org_123',
            locale: 'tr',
            routePath: '/settings/ai'
        })

        clearSettingsRouteCache()
        setSettingsRouteCacheEntry(key, 'cached-settings-ai')

        const entry = getSettingsRouteCacheEntry(key)
        expect(entry?.content).toBe('cached-settings-ai')
        expect(typeof entry?.updatedAt).toBe('number')
    })

    it('evicts the oldest warmed snapshot when the cache exceeds the session cap', () => {
        clearSettingsRouteCache()

        for (let index = 0; index < 13; index += 1) {
            const key = buildSettingsRouteCacheKey({
                organizationId: `org_${index}`,
                locale: 'tr',
                routePath: `/settings/ai/${index}`
            })
            setSettingsRouteCacheEntry(key, `snapshot_${index}`)
        }

        expect(getSettingsRouteCacheEntry('org_0::tr::/settings/ai/0')).toBeNull()
        expect(getSettingsRouteCacheEntry('org_12::tr::/settings/ai/12')?.content).toBe('snapshot_12')
    })
})
