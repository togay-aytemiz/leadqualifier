import { describe, expect, it } from 'vitest'

import {
    buildAvailabilitySlots,
    findAlternativeAvailabilitySlots,
    isSlotAvailable,
    type BookingBusyRange,
    type WeeklyAvailabilityRule
} from '@/lib/calendar/availability'

const wednesdayMorningRule: WeeklyAvailabilityRule = {
    active: true,
    dayOfWeek: 3,
    endMinute: 12 * 60,
    startMinute: 9 * 60
}

describe('buildAvailabilitySlots', () => {
    it('generates bookable starts from weekly windows in the scheduling timezone', () => {
        const slots = buildAvailabilitySlots({
            rangeEndIso: '2026-03-19T00:00:00.000Z',
            rangeStartIso: '2026-03-18T00:00:00.000Z',
            rules: [wednesdayMorningRule],
            serviceDurationMinutes: 60,
            slotIntervalMinutes: 30,
            timezone: 'Europe/Istanbul'
        })

        expect(slots).toEqual([
            '2026-03-18T06:00:00.000Z',
            '2026-03-18T06:30:00.000Z',
            '2026-03-18T07:00:00.000Z',
            '2026-03-18T07:30:00.000Z',
            '2026-03-18T08:00:00.000Z'
        ])
    })

    it('respects minimum notice in the scheduling timezone', () => {
        const slots = buildAvailabilitySlots({
            minimumNoticeMinutes: 30,
            nowIso: '2026-03-18T05:50:00.000Z',
            rangeEndIso: '2026-03-19T00:00:00.000Z',
            rangeStartIso: '2026-03-18T00:00:00.000Z',
            rules: [wednesdayMorningRule],
            serviceDurationMinutes: 60,
            slotIntervalMinutes: 30,
            timezone: 'Europe/Istanbul'
        })

        expect(slots).toEqual([
            '2026-03-18T06:30:00.000Z',
            '2026-03-18T07:00:00.000Z',
            '2026-03-18T07:30:00.000Z',
            '2026-03-18T08:00:00.000Z'
        ])
    })
})

describe('isSlotAvailable', () => {
    it('blocks overlaps against internal bookings while honoring buffers', () => {
        const blockedRanges: BookingBusyRange[] = [
            {
                endIso: '2026-03-18T07:30:00.000Z',
                source: 'internal_booking',
                startIso: '2026-03-18T06:30:00.000Z'
            }
        ]

        expect(isSlotAvailable({
            blockedRanges,
            bufferAfterMinutes: 15,
            bufferBeforeMinutes: 15,
            bookingEndIso: '2026-03-18T07:00:00.000Z',
            bookingStartIso: '2026-03-18T06:00:00.000Z'
        })).toBe(false)

        expect(isSlotAvailable({
            blockedRanges,
            bufferAfterMinutes: 15,
            bufferBeforeMinutes: 15,
            bookingEndIso: '2026-03-18T09:00:00.000Z',
            bookingStartIso: '2026-03-18T08:00:00.000Z'
        })).toBe(true)
    })

    it('blocks ranges returned by Google freebusy overlays', () => {
        const blockedRanges: BookingBusyRange[] = [
            {
                endIso: '2026-03-18T08:00:00.000Z',
                source: 'google_busy',
                startIso: '2026-03-18T07:00:00.000Z'
            }
        ]

        expect(isSlotAvailable({
            blockedRanges,
            bookingEndIso: '2026-03-18T07:30:00.000Z',
            bookingStartIso: '2026-03-18T06:30:00.000Z'
        })).toBe(false)
    })
})

describe('findAlternativeAvailabilitySlots', () => {
    it('returns the next real alternatives when an exact request is not available', () => {
        const alternatives = findAlternativeAvailabilitySlots({
            candidateSlots: [
                '2026-03-18T08:00:00.000Z',
                '2026-03-18T08:30:00.000Z',
                '2026-03-19T06:00:00.000Z',
                '2026-03-19T06:30:00.000Z'
            ],
            desiredStartIso: '2026-03-18T06:30:00.000Z',
            limit: 3
        })

        expect(alternatives).toEqual([
            '2026-03-18T08:00:00.000Z',
            '2026-03-18T08:30:00.000Z',
            '2026-03-19T06:00:00.000Z'
        ])
    })
})
