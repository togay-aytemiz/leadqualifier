import { describe, expect, it } from 'vitest'

import {
    getAuthManualPrefetchRoutes,
    shouldEnableManualRoutePrefetch
} from '@/design/manual-prefetch'

describe('shouldEnableManualRoutePrefetch', () => {
    it('enables manual prefetch in production', () => {
        expect(shouldEnableManualRoutePrefetch('production')).toBe(true)
    })

    it('enables manual prefetch in development', () => {
        expect(shouldEnableManualRoutePrefetch('development')).toBe(true)
    })

    it('disables manual prefetch in test', () => {
        expect(shouldEnableManualRoutePrefetch('test')).toBe(false)
    })

    it('disables manual prefetch when disable flag is set', () => {
        expect(shouldEnableManualRoutePrefetch('production', '1')).toBe(false)
        expect(shouldEnableManualRoutePrefetch('development', 'true')).toBe(false)
    })
})

describe('getAuthManualPrefetchRoutes', () => {
    it('limits login prefetches to auth-safe routes', () => {
        expect(getAuthManualPrefetchRoutes('login')).toEqual(['/register', '/forgot-password'])
    })

    it('limits register prefetches to auth-safe routes', () => {
        expect(getAuthManualPrefetchRoutes('register')).toEqual([
            '/login',
            '/forgot-password',
            '/register/check-email'
        ])
    })

    it('never prefetches protected dashboard routes from auth pages', () => {
        const authRoutes = [
            ...getAuthManualPrefetchRoutes('login'),
            ...getAuthManualPrefetchRoutes('register')
        ]

        expect(authRoutes).not.toContain('/inbox')
        expect(authRoutes).not.toContain('/skills')
        expect(authRoutes).not.toContain('/settings/ai')
    })
})
