import { describe, expect, it } from 'vitest'

import { resolvePostAuthHomeRoute } from '@/lib/auth/post-auth-redirect'

describe('resolvePostAuthHomeRoute', () => {
    it('routes tenant users directly to inbox', () => {
        expect(resolvePostAuthHomeRoute({
            isSystemAdmin: false,
            hasExplicitOrganizationSelection: false
        })).toBe('/inbox')
    })

    it('routes system admin without an explicit organization selection to admin', () => {
        expect(resolvePostAuthHomeRoute({
            isSystemAdmin: true,
            hasExplicitOrganizationSelection: false
        })).toBe('/admin')
    })

    it('routes system admin with an explicit organization selection to inbox', () => {
        expect(resolvePostAuthHomeRoute({
            isSystemAdmin: true,
            hasExplicitOrganizationSelection: true
        })).toBe('/inbox')
    })
})
