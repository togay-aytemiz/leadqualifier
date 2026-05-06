import { describe, expect, it } from 'vitest'

import {
    resolvePostAuthHomeRoute,
    resolvePostAuthRedirectPath
} from '@/lib/auth/post-auth-redirect'

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

    it('routes tenant users to onboarding when onboarding should auto-open', async () => {
        const path = await resolvePostAuthRedirectPath({
            cookieOrganizationId: null,
            locale: 'tr',
            userId: 'user-1',
            supabase: {
                from: (table: string) => ({
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => {
                                if (table === 'profiles') {
                                    return {
                                        data: { is_system_admin: false },
                                        error: null
                                    }
                                }

                                if (table === 'organization_onboarding_states') {
                                    return {
                                        data: {
                                            organization_id: 'org-1',
                                            first_seen_at: null,
                                            intro_acknowledged_at: null
                                        },
                                        error: null
                                    }
                                }

                                return {
                                    data: null,
                                    error: null
                                }
                            }
                        })
                    })
                })
            },
            onboarding: {
                shouldAutoOpen: true,
                resolveOrganizationId: async () => 'org-1'
            }
        })

        expect(path).toBe('/onboarding')
    })

    it('returns internal admin route for next-intl client router instead of pre-localizing English redirects', async () => {
        const path = await resolvePostAuthRedirectPath({
            cookieOrganizationId: null,
            locale: 'en',
            userId: 'admin-1',
            supabase: {
                from: (table: string) => ({
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => {
                                if (table === 'profiles') {
                                    return {
                                        data: { is_system_admin: true },
                                        error: null
                                    }
                                }

                                if (table === 'organizations') {
                                    return {
                                        data: null,
                                        error: null
                                    }
                                }

                                return {
                                    data: null,
                                    error: null
                                }
                            }
                        })
                    })
                })
            }
        })

        expect(path).toBe('/admin')
    })
})
