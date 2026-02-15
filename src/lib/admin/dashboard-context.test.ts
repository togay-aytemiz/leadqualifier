import { describe, expect, it } from 'vitest'

import { resolveAdminDashboardOrganizationContext } from '@/lib/admin/dashboard-context'
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

describe('resolveAdminDashboardOrganizationContext', () => {
    it('treats system admin fallback context as no explicit selection', () => {
        const context = createContext({
            isSystemAdmin: true,
            activeOrganizationId: 'org-1',
            activeOrganization: { id: 'org-1', name: 'Org 1', slug: 'org-1' },
            source: 'fallback'
        })

        expect(resolveAdminDashboardOrganizationContext(context)).toEqual({
            hasExplicitSelection: false,
            activeOrganization: null
        })
    })

    it('treats system admin cookie context as explicit selection', () => {
        const context = createContext({
            isSystemAdmin: true,
            activeOrganizationId: 'org-2',
            activeOrganization: { id: 'org-2', name: 'Org 2', slug: 'org-2' },
            source: 'cookie'
        })

        expect(resolveAdminDashboardOrganizationContext(context)).toEqual({
            hasExplicitSelection: true,
            activeOrganization: { id: 'org-2', name: 'Org 2', slug: 'org-2' }
        })
    })

    it('treats non-system-admin active organization as explicit selection', () => {
        const context = createContext({
            isSystemAdmin: false,
            activeOrganizationId: 'org-3',
            activeOrganization: { id: 'org-3', name: 'Org 3', slug: 'org-3' },
            source: 'fallback'
        })

        expect(resolveAdminDashboardOrganizationContext(context)).toEqual({
            hasExplicitSelection: true,
            activeOrganization: { id: 'org-3', name: 'Org 3', slug: 'org-3' }
        })
    })
})
