import { describe, expect, it } from 'vitest'
import {
    createDemoMaintenanceBypassCookieValue,
    isDemoMaintenanceBypassCookieValid,
    isDemoMaintenanceBypassTokenValid,
    isDemoMaintenanceModeEnabled,
    shouldServeDemoMaintenance,
} from '@/lib/demo-chat/maintenance'

describe('demo chat maintenance mode', () => {
    it('enables maintenance mode only when the Netlify env flag is 1', () => {
        expect(isDemoMaintenanceModeEnabled('1')).toBe(true)
        expect(isDemoMaintenanceModeEnabled(' 1 ')).toBe(true)

        expect(isDemoMaintenanceModeEnabled('0')).toBe(false)
        expect(isDemoMaintenanceModeEnabled('true')).toBe(false)
        expect(isDemoMaintenanceModeEnabled('')).toBe(false)
        expect(isDemoMaintenanceModeEnabled(undefined)).toBe(false)
    })

    it('accepts only the configured maintenance bypass token', () => {
        const envToken = 'qualy-admin-maintenance-bypass-token-123'

        expect(isDemoMaintenanceBypassTokenValid('qualy-admin-maintenance-bypass-token-123', envToken)).toBe(true)
        expect(isDemoMaintenanceBypassTokenValid(' qualy-admin-maintenance-bypass-token-123 ', envToken)).toBe(true)

        expect(isDemoMaintenanceBypassTokenValid('wrong-token', envToken)).toBe(false)
        expect(isDemoMaintenanceBypassTokenValid('', envToken)).toBe(false)
        expect(isDemoMaintenanceBypassTokenValid(undefined, envToken)).toBe(false)
        expect(isDemoMaintenanceBypassTokenValid(envToken, undefined)).toBe(false)
    })

    it('stores a hashed bypass cookie instead of the raw bypass token', () => {
        const envToken = 'qualy-admin-maintenance-bypass-token-123'
        const cookieValue = createDemoMaintenanceBypassCookieValue(envToken)

        expect(cookieValue).not.toBe(envToken)
        expect(cookieValue).toMatch(/^[a-f0-9]{64}$/)
        expect(isDemoMaintenanceBypassCookieValid(cookieValue, envToken)).toBe(true)
        expect(isDemoMaintenanceBypassCookieValid('wrong-cookie', envToken)).toBe(false)
        expect(isDemoMaintenanceBypassCookieValid(cookieValue, 'rotated-admin-token-456')).toBe(false)
    })

    it('serves maintenance only when the mode is on and no valid bypass cookie is present', () => {
        const envToken = 'qualy-admin-maintenance-bypass-token-123'
        const cookieValue = createDemoMaintenanceBypassCookieValue(envToken)

        expect(shouldServeDemoMaintenance({
            maintenanceModeValue: '1',
            bypassCookieValue: null,
            bypassTokenValue: envToken,
        })).toBe(true)

        expect(shouldServeDemoMaintenance({
            maintenanceModeValue: '1',
            bypassCookieValue: cookieValue,
            bypassTokenValue: envToken,
        })).toBe(false)

        expect(shouldServeDemoMaintenance({
            maintenanceModeValue: '0',
            channelMaintenanceEnabled: false,
            bypassCookieValue: null,
            bypassTokenValue: envToken,
        })).toBe(false)
    })

    it('serves maintenance when the demo channel has runtime maintenance enabled', () => {
        const envToken = 'qualy-admin-maintenance-bypass-token-123'
        const cookieValue = createDemoMaintenanceBypassCookieValue(envToken)

        expect(shouldServeDemoMaintenance({
            maintenanceModeValue: '0',
            channelMaintenanceEnabled: true,
            bypassCookieValue: null,
            bypassTokenValue: envToken,
        })).toBe(true)

        expect(shouldServeDemoMaintenance({
            maintenanceModeValue: '0',
            channelMaintenanceEnabled: true,
            bypassCookieValue: cookieValue,
            bypassTokenValue: envToken,
        })).toBe(false)
    })
})
