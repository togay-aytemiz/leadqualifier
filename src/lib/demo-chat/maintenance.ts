import { createHash, timingSafeEqual } from 'node:crypto'

export const DEMO_MAINTENANCE_MODE_ENV = 'DEMO_MAINTENANCE_MODE'
export const DEMO_MAINTENANCE_BYPASS_TOKEN_ENV = 'DEMO_MAINTENANCE_BYPASS_TOKEN'
export const DEMO_MAINTENANCE_BYPASS_COOKIE = 'qualy_demo_maintenance_bypass'
export const DEMO_MAINTENANCE_BYPASS_PARAM = 'maintenance_bypass'
export const DEMO_MAINTENANCE_BYPASS_CLEAR_VALUE = 'off'
export const DEMO_MAINTENANCE_BYPASS_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60

const MIN_BYPASS_TOKEN_CHARS = 16

export function isDemoMaintenanceModeEnabled(
    value: string | undefined = process.env[DEMO_MAINTENANCE_MODE_ENV]
) {
    return value?.trim() === '1'
}

function normalizeBypassToken(value: string | undefined | null) {
    const normalized = value?.trim() ?? ''
    if (normalized.length < MIN_BYPASS_TOKEN_CHARS) return ''
    return normalized
}

function constantTimeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    if (leftBuffer.length !== rightBuffer.length) return false
    return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isDemoMaintenanceBypassTokenValid(
    value: string | undefined | null,
    bypassTokenValue: string | undefined = process.env[DEMO_MAINTENANCE_BYPASS_TOKEN_ENV]
) {
    const providedToken = normalizeBypassToken(value)
    const expectedToken = normalizeBypassToken(bypassTokenValue)
    if (!providedToken || !expectedToken) return false

    return constantTimeEqual(providedToken, expectedToken)
}

export function createDemoMaintenanceBypassCookieValue(
    bypassTokenValue: string | undefined = process.env[DEMO_MAINTENANCE_BYPASS_TOKEN_ENV]
) {
    const token = normalizeBypassToken(bypassTokenValue)
    if (!token) return ''

    return createHash('sha256')
        .update(`qualy-demo-maintenance-bypass:${token}`)
        .digest('hex')
}

export function isDemoMaintenanceBypassCookieValid(
    value: string | undefined | null,
    bypassTokenValue: string | undefined = process.env[DEMO_MAINTENANCE_BYPASS_TOKEN_ENV]
) {
    const cookieValue = value?.trim() ?? ''
    const expectedValue = createDemoMaintenanceBypassCookieValue(bypassTokenValue)
    if (!cookieValue || !expectedValue) return false

    return constantTimeEqual(cookieValue, expectedValue)
}

export function shouldServeDemoMaintenance(input: {
    maintenanceModeValue?: string | undefined
    channelMaintenanceEnabled?: boolean | undefined
    bypassCookieValue?: string | undefined | null
    bypassTokenValue?: string | undefined
} = {}) {
    const maintenanceEnabled = isDemoMaintenanceModeEnabled(input.maintenanceModeValue)
        || input.channelMaintenanceEnabled === true
    if (!maintenanceEnabled) return false

    return !isDemoMaintenanceBypassCookieValid(
        input.bypassCookieValue,
        input.bypassTokenValue
    )
}
