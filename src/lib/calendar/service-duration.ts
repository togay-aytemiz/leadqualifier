export type BookingDurationSource = 'service_catalog' | 'organization_default'

export interface ResolveBookingDurationInput {
    organizationDefaultDurationMinutes: number
    serviceDurationMinutes?: number | null
}

export interface ResolvedBookingDuration {
    durationMinutes: number
    source: BookingDurationSource
}

function normalizeDurationMinutes(value: number | null | undefined) {
    if (!Number.isFinite(value)) return null
    const rounded = Math.floor(Number(value))
    return rounded > 0 ? rounded : null
}

export function resolveBookingDuration(
    input: ResolveBookingDurationInput
): ResolvedBookingDuration {
    const serviceDurationMinutes = normalizeDurationMinutes(input.serviceDurationMinutes)
    if (serviceDurationMinutes) {
        return {
            durationMinutes: serviceDurationMinutes,
            source: 'service_catalog'
        }
    }

    const fallbackDuration = normalizeDurationMinutes(input.organizationDefaultDurationMinutes) ?? 30
    return {
        durationMinutes: fallbackDuration,
        source: 'organization_default'
    }
}
