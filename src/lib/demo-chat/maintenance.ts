export const DEMO_MAINTENANCE_MODE_ENV = 'DEMO_MAINTENANCE_MODE'

export function isDemoMaintenanceModeEnabled(
    value: string | undefined = process.env[DEMO_MAINTENANCE_MODE_ENV]
) {
    return value?.trim() === '1'
}
