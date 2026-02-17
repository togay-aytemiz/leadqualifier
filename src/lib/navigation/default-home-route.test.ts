import { describe, expect, it } from 'vitest'

import { resolveDefaultHomeRoute } from '@/lib/navigation/default-home-route'
import type { ActiveOrganizationContext } from '@/lib/organizations/active-context'

function createContext(overrides: Partial<ActiveOrganizationContext>): ActiveOrganizationContext {
    return {
        userId: 'user-1',
        isSystemAdmin: true,
        accessibleOrganizations: [],
        activeOrganizationId: null,
        activeOrganization: null,
        source: 'none',
        readOnlyTenantMode: true,
        ...overrides
    }
}

describe('resolveDefaultHomeRoute', () => {
    it('returns login when user context is missing', () => {
        expect(resolveDefaultHomeRoute(null)).toBe('/login')
    })

    it('routes system admin without explicit org selection to admin dashboard', () => {
        const context = createContext({
            isSystemAdmin: true,
            activeOrganizationId: 'org-1',
            activeOrganization: { id: 'org-1', name: 'Org 1', slug: 'org-1' },
            source: 'fallback'
        })

        expect(resolveDefaultHomeRoute(context)).toBe('/admin')
    })

    it('routes system admin with explicit org selection to inbox', () => {
        const context = createContext({
            isSystemAdmin: true,
            activeOrganizationId: 'org-2',
            activeOrganization: { id: 'org-2', name: 'Org 2', slug: 'org-2' },
            source: 'cookie'
        })

        expect(resolveDefaultHomeRoute(context)).toBe('/inbox')
    })

    it('routes tenant users to inbox', () => {
        const context = createContext({
            isSystemAdmin: false,
            activeOrganizationId: 'org-3',
            activeOrganization: { id: 'org-3', name: 'Org 3', slug: 'org-3' },
            source: 'fallback',
            readOnlyTenantMode: false
        })

        expect(resolveDefaultHomeRoute(context)).toBe('/inbox')
    })
})
