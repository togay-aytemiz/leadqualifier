import { describe, expect, it } from 'vitest'
import { isDemoMaintenanceModeEnabled } from '@/lib/demo-chat/maintenance'

describe('demo chat maintenance mode', () => {
    it('enables maintenance mode only when the Netlify env flag is 1', () => {
        expect(isDemoMaintenanceModeEnabled('1')).toBe(true)
        expect(isDemoMaintenanceModeEnabled(' 1 ')).toBe(true)

        expect(isDemoMaintenanceModeEnabled('0')).toBe(false)
        expect(isDemoMaintenanceModeEnabled('true')).toBe(false)
        expect(isDemoMaintenanceModeEnabled('')).toBe(false)
        expect(isDemoMaintenanceModeEnabled(undefined)).toBe(false)
    })
})
