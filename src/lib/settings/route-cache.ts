import type { ReactNode } from 'react'

import { normalizeDashboardRoutePath } from '@/design/dashboard-route-transition'

interface SettingsRouteCacheEntry {
    content: ReactNode
    updatedAt: number
}

const MAX_SETTINGS_ROUTE_CACHE_ENTRIES = 12

const settingsRouteCache = new Map<string, SettingsRouteCacheEntry>()

export function buildSettingsRouteCacheKey(options: {
    organizationId: string
    locale: string
    routePath: string
}) {
    return `${options.organizationId}::${options.locale}::${normalizeDashboardRoutePath(options.routePath)}`
}

export function getSettingsRouteCacheEntry(key: string) {
    return settingsRouteCache.get(key) ?? null
}

export function setSettingsRouteCacheEntry(key: string, content: ReactNode) {
    const nextEntry: SettingsRouteCacheEntry = {
        content,
        updatedAt: Date.now()
    }

    if (settingsRouteCache.has(key)) {
        settingsRouteCache.delete(key)
    }

    settingsRouteCache.set(key, nextEntry)

    while (settingsRouteCache.size > MAX_SETTINGS_ROUTE_CACHE_ENTRIES) {
        const oldestKey = settingsRouteCache.keys().next().value
        if (!oldestKey) break
        settingsRouteCache.delete(oldestKey)
    }
}

export function clearSettingsRouteCache() {
    settingsRouteCache.clear()
}
