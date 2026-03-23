import { describe, expect, it } from 'vitest'

import {
    normalizeDashboardRoutePath,
    resolveDashboardRouteSkeleton,
    shouldPrimeDashboardRoute
} from '@/design/dashboard-route-transition'

describe('normalizeDashboardRoutePath', () => {
    it('strips locale prefixes, trailing slashes, and query strings', () => {
        expect(normalizeDashboardRoutePath('/tr/inbox?conversation=123')).toBe('/inbox')
        expect(normalizeDashboardRoutePath('/en/leads/')).toBe('/leads')
    })

    it('normalizes full URLs into dashboard-relative paths', () => {
        expect(normalizeDashboardRoutePath('https://qualy.app/tr/leads?page=2')).toBe('/leads')
    })
})

describe('shouldPrimeDashboardRoute', () => {
    it('warms only the inbox and leads routes', () => {
        expect(shouldPrimeDashboardRoute('/inbox')).toBe(true)
        expect(shouldPrimeDashboardRoute('/tr/leads')).toBe(true)
        expect(shouldPrimeDashboardRoute('/calendar')).toBe(false)
        expect(shouldPrimeDashboardRoute('/settings/ai')).toBe(false)
    })
})

describe('resolveDashboardRouteSkeleton', () => {
    it('maps hot routes to the matching skeleton view', () => {
        expect(resolveDashboardRouteSkeleton('/tr/inbox?conversation=123')).toBe('inbox')
        expect(resolveDashboardRouteSkeleton('/en/leads?page=3')).toBe('leads')
    })

    it('returns null for routes without a dedicated fast-transition skeleton', () => {
        expect(resolveDashboardRouteSkeleton('/calendar')).toBeNull()
        expect(resolveDashboardRouteSkeleton(null)).toBeNull()
    })
})
