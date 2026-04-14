import { describe, expect, it } from 'vitest'

import {
    areCalendarAvailabilityDraftsEqual,
    areCalendarServiceDurationDraftsEqual,
    buildCalendarSettingsDraft,
    getCalendarSettingsSectionIds,
    isCalendarAppsSettingsDirty,
    isCalendarGeneralSettingsDirty
} from '@/lib/calendar/settings-surface'

describe('getCalendarSettingsSectionIds', () => {
    it('keeps the dedicated calendar settings page focused on operational rules', () => {
        expect(getCalendarSettingsSectionIds('settings')).toEqual([
            'general',
            'availability',
            'serviceDurations'
        ])
    })

    it('keeps application management isolated to integration settings', () => {
        expect(getCalendarSettingsSectionIds('apps')).toEqual([
            'google'
        ])
    })
})

describe('calendar settings dirty helpers', () => {
    it('defaults the booking switch to disabled until a workspace explicitly enables booking', () => {
        expect(buildCalendarSettingsDraft(null).bookingEnabled).toBe(false)
    })

    it('defaults the maximum concurrent bookings setting to one', () => {
        expect(buildCalendarSettingsDraft(null).maxConcurrentBookings).toBe('1')
    })

    it('treats unchanged general settings as clean but ignores Google-only differences', () => {
        const baseline = buildCalendarSettingsDraft({
            booking_enabled: true,
            timezone: 'Europe/Istanbul',
            default_booking_duration_minutes: 60,
            slot_interval_minutes: 30,
            minimum_notice_minutes: 120,
            buffer_before_minutes: 15,
            buffer_after_minutes: 10,
            max_concurrent_bookings: 1,
            google_busy_overlay_enabled: true,
            google_write_through_enabled: false
        } as never)

        expect(isCalendarGeneralSettingsDirty(baseline, {
            ...baseline,
            googleBusyOverlayEnabled: false,
            googleWriteThroughEnabled: true
        })).toBe(false)

        expect(isCalendarGeneralSettingsDirty(baseline, {
            ...baseline,
            timezone: 'UTC'
        })).toBe(true)

        expect(isCalendarGeneralSettingsDirty(baseline, {
            ...baseline,
            maxConcurrentBookings: '2'
        })).toBe(true)
    })

    it('tracks Google app-surface setting changes independently from general calendar settings', () => {
        const baseline = buildCalendarSettingsDraft({
            booking_enabled: true,
            timezone: 'Europe/Istanbul',
            default_booking_duration_minutes: 60,
            slot_interval_minutes: 30,
            minimum_notice_minutes: 120,
            buffer_before_minutes: 15,
            buffer_after_minutes: 10,
            max_concurrent_bookings: 1,
            google_busy_overlay_enabled: true,
            google_write_through_enabled: false
        } as never)

        expect(isCalendarAppsSettingsDirty(baseline, baseline)).toBe(false)

        expect(isCalendarAppsSettingsDirty(baseline, {
            ...baseline,
            googleWriteThroughEnabled: true
        })).toBe(true)
    })

    it('compares availability drafts row by row', () => {
        const baseline = [
            { dayOfWeek: 1, enabled: true, startTime: '09:00', endTime: '18:00' },
            { dayOfWeek: 2, enabled: false, startTime: '09:00', endTime: '18:00' }
        ]

        expect(areCalendarAvailabilityDraftsEqual(baseline, baseline)).toBe(true)
        expect(areCalendarAvailabilityDraftsEqual(baseline, [
            { dayOfWeek: 1, enabled: true, startTime: '10:00', endTime: '18:00' },
            { dayOfWeek: 2, enabled: false, startTime: '09:00', endTime: '18:00' }
        ])).toBe(false)
    })

    it('compares service duration drafts by key and value', () => {
        expect(areCalendarServiceDurationDraftsEqual({
            haircut: '45',
            coloring: ''
        }, {
            haircut: '45',
            coloring: ''
        })).toBe(true)

        expect(areCalendarServiceDurationDraftsEqual({
            haircut: '45',
            coloring: ''
        }, {
            haircut: '60',
            coloring: ''
        })).toBe(false)
    })
})
