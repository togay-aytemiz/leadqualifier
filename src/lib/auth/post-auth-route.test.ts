import { describe, expect, it } from 'vitest'

import { resolvePostAuthRoute } from '@/lib/auth/post-auth-route'

describe('resolvePostAuthRoute', () => {
    it('routes tenant users directly into inbox', () => {
        expect(resolvePostAuthRoute({
            isSystemAdmin: false,
            hasExplicitOrganizationSelection: false
        })).toBe('/inbox')
    })

    it('routes system admins without explicit organization selection to admin', () => {
        expect(resolvePostAuthRoute({
            isSystemAdmin: true,
            hasExplicitOrganizationSelection: false
        })).toBe('/admin')
    })

    it('routes system admins with explicit organization selection into inbox', () => {
        expect(resolvePostAuthRoute({
            isSystemAdmin: true,
            hasExplicitOrganizationSelection: true
        })).toBe('/inbox')
    })
})
