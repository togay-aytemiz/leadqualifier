import { describe, expect, it } from 'vitest'

import { shouldEnableManualRoutePrefetch } from '@/design/manual-prefetch'

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
