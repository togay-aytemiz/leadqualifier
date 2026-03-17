import { describe, expect, it } from 'vitest'

import { resolveBookingDuration } from '@/lib/calendar/service-duration'

describe('resolveBookingDuration', () => {
    it('prefers the canonical service duration when present', () => {
        expect(resolveBookingDuration({
            organizationDefaultDurationMinutes: 60,
            serviceDurationMinutes: 180
        })).toEqual({
            durationMinutes: 180,
            source: 'service_catalog'
        })
    })

    it('falls back to the organization default when service duration is missing', () => {
        expect(resolveBookingDuration({
            organizationDefaultDurationMinutes: 45,
            serviceDurationMinutes: null
        })).toEqual({
            durationMinutes: 45,
            source: 'organization_default'
        })
    })

    it('treats invalid service durations as missing and still uses the safe fallback', () => {
        expect(resolveBookingDuration({
            organizationDefaultDurationMinutes: 30,
            serviceDurationMinutes: 0
        })).toEqual({
            durationMinutes: 30,
            source: 'organization_default'
        })
    })
})
