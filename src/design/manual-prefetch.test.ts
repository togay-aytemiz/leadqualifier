import { describe, expect, it } from 'vitest'

import { shouldEnableManualRoutePrefetch } from '@/design/manual-prefetch'

describe('shouldEnableManualRoutePrefetch', () => {
    it('enables manual prefetch in production', () => {
        expect(shouldEnableManualRoutePrefetch('production')).toBe(true)
    })

    it('disables manual prefetch in development', () => {
        expect(shouldEnableManualRoutePrefetch('development')).toBe(false)
    })

    it('disables manual prefetch in test', () => {
        expect(shouldEnableManualRoutePrefetch('test')).toBe(false)
    })
})
