import { describe, expect, it } from 'vitest'

import {
    normalizeDashboardRoutePath,
    resolveOptimisticDashboardPath,
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
    it('warms the primary dashboard route families', () => {
        expect(shouldPrimeDashboardRoute('/inbox')).toBe(true)
        expect(shouldPrimeDashboardRoute('/tr/leads')).toBe(true)
        expect(shouldPrimeDashboardRoute('/calendar')).toBe(true)
        expect(shouldPrimeDashboardRoute('/settings/ai')).toBe(true)
        expect(shouldPrimeDashboardRoute('/knowledge')).toBe(true)
        expect(shouldPrimeDashboardRoute('/admin/users')).toBe(true)
        expect(shouldPrimeDashboardRoute('/login')).toBe(false)
    })
})

describe('resolveDashboardRouteSkeleton', () => {
    it('maps hot routes to the matching skeleton view', () => {
        expect(resolveDashboardRouteSkeleton('/tr/inbox?conversation=123')).toBe('inbox')
        expect(resolveDashboardRouteSkeleton('/en/leads?page=3')).toBe('leads')
        expect(resolveDashboardRouteSkeleton('/calendar?view=week')).toBe('page')
        expect(resolveDashboardRouteSkeleton('/settings/ai')).toBe('page')
        expect(resolveDashboardRouteSkeleton('/settings/channels/whatsapp')).toBe('page')
        expect(resolveDashboardRouteSkeleton('/knowledge')).toBe('knowledge')
        expect(resolveDashboardRouteSkeleton('/admin/organizations')).toBe('admin')
    })

    it('returns null for routes without a dedicated fast-transition skeleton', () => {
        expect(resolveDashboardRouteSkeleton('/login')).toBeNull()
        expect(resolveDashboardRouteSkeleton(null)).toBeNull()
    })
})

describe('resolveOptimisticDashboardPath', () => {
    it('prefers a pending dashboard destination for immediate nav feedback', () => {
        expect(resolveOptimisticDashboardPath('/tr/inbox', '/settings/ai')).toBe('/settings/ai')
        expect(resolveOptimisticDashboardPath('/en/leads', '/calendar?view=week')).toBe('/calendar')
    })

    it('falls back to the committed path when there is no distinct pending dashboard route', () => {
        expect(resolveOptimisticDashboardPath('/settings/ai', '/settings/ai')).toBe('/settings/ai')
        expect(resolveOptimisticDashboardPath('/skills', null)).toBe('/skills')
        expect(resolveOptimisticDashboardPath('/inbox', '/login')).toBe('/inbox')
    })
})
