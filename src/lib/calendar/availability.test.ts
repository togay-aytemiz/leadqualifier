import { describe, expect, it } from 'vitest'

import {
    buildAvailabilitySlots,
    findAlternativeAvailabilitySlots,
    isSlotAvailable,
    isSlotWithinAvailabilityRules,
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

    it('anchors generated starts to the weekly window slot grid instead of the lookup start minute', () => {
        const slots = buildAvailabilitySlots({
            rangeEndIso: '2026-03-18T12:00:00.000Z',
            rangeStartIso: '2026-03-18T10:07:00.000Z',
            rules: [
                {
                    active: true,
                    dayOfWeek: 3,
                    endMinute: 11 * 60 + 45,
                    startMinute: 9 * 60 + 15
                }
            ],
            serviceDurationMinutes: 30,
            slotIntervalMinutes: 30,
            timezone: 'UTC'
        })

        expect(slots).toEqual([
            '2026-03-18T10:15:00.000Z',
            '2026-03-18T10:45:00.000Z',
            '2026-03-18T11:15:00.000Z'
        ])
    })
})

describe('isSlotWithinAvailabilityRules', () => {
    it('treats a booking ending exactly at local midnight as inside the starting day rule', () => {
        expect(isSlotWithinAvailabilityRules({
            bookingEndIso: '2026-03-19T00:00:00.000Z',
            bookingStartIso: '2026-03-18T23:00:00.000Z',
            rules: [
                {
                    active: true,
                    dayOfWeek: 3,
                    endMinute: 1440,
                    startMinute: 23 * 60
                }
            ],
            timezone: 'UTC'
        })).toBe(true)
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

    it('allows an internal overlap while peak existing occupancy stays below capacity', () => {
        const blockedRanges: BookingBusyRange[] = [
            {
                endIso: '2026-04-15T10:00:00.000Z',
                source: 'internal_booking',
                startIso: '2026-04-15T09:00:00.000Z'
            }
        ]

        expect(isSlotAvailable({
            blockedRanges,
            bookingEndIso: '2026-04-15T10:30:00.000Z',
            bookingStartIso: '2026-04-15T09:30:00.000Z',
            maxConcurrentBookings: 2
        })).toBe(true)
    })

    it('allows sequential existing bookings inside a candidate range when they never exceed capacity together', () => {
        const blockedRanges: BookingBusyRange[] = [
            {
                endIso: '2026-04-15T10:00:00.000Z',
                source: 'internal_booking',
                startIso: '2026-04-15T09:00:00.000Z'
            },
            {
                endIso: '2026-04-15T11:00:00.000Z',
                source: 'internal_booking',
                startIso: '2026-04-15T10:00:00.000Z'
            }
        ]

        expect(isSlotAvailable({
            blockedRanges,
            bookingEndIso: '2026-04-15T11:30:00.000Z',
            bookingStartIso: '2026-04-15T09:30:00.000Z',
            maxConcurrentBookings: 2
        })).toBe(true)
    })

    it('blocks when peak existing internal occupancy reaches the capacity limit', () => {
        const blockedRanges: BookingBusyRange[] = [
            {
                endIso: '2026-04-15T10:30:00.000Z',
                source: 'internal_booking',
                startIso: '2026-04-15T09:00:00.000Z'
            },
            {
                endIso: '2026-04-15T10:30:00.000Z',
                source: 'internal_booking',
                startIso: '2026-04-15T09:15:00.000Z'
            }
        ]

        expect(isSlotAvailable({
            blockedRanges,
            bookingEndIso: '2026-04-15T10:30:00.000Z',
            bookingStartIso: '2026-04-15T09:30:00.000Z',
            maxConcurrentBookings: 2
        })).toBe(false)
    })

    it('blocks a later existing booking that falls inside the candidate after-buffer', () => {
        const blockedRanges: BookingBusyRange[] = [
            {
                endIso: '2026-04-15T12:00:00.000Z',
                source: 'internal_booking',
                startIso: '2026-04-15T11:05:00.000Z'
            }
        ]

        expect(isSlotAvailable({
            blockedRanges,
            bufferAfterMinutes: 15,
            bookingEndIso: '2026-04-15T11:00:00.000Z',
            bookingStartIso: '2026-04-15T10:00:00.000Z',
            maxConcurrentBookings: 1
        })).toBe(false)
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
            bookingStartIso: '2026-03-18T06:30:00.000Z',
            maxConcurrentBookings: 3
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
