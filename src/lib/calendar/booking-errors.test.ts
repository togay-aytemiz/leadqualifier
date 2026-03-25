import { describe, expect, it } from 'vitest'

import { resolveCalendarBookingMutationErrorKey } from '@/lib/calendar/booking-errors'

describe('resolveCalendarBookingMutationErrorKey', () => {
  it('maps past requested-slot failures to the dedicated past-date message', () => {
    expect(
      resolveCalendarBookingMutationErrorKey({
        error: new Error('Requested slot is not available'),
        startsAt: '2026-03-17T09:00:00.000Z',
        now: new Date('2026-03-17T10:00:00.000Z'),
      })
    ).toBe('bookingForm.validationPastDate')
  })

  it('maps future availability, conflict, disabled, and unknown failures to stable UI keys', () => {
    expect(
      resolveCalendarBookingMutationErrorKey({
        error: new Error('Requested slot is not available'),
        startsAt: '2026-03-17T12:00:00.000Z',
        now: new Date('2026-03-17T10:00:00.000Z'),
      })
    ).toBe('bookingForm.validationSlotUnavailable')

    expect(
      resolveCalendarBookingMutationErrorKey({
        error: new Error('Double booking conflict'),
        startsAt: '2026-03-17T12:00:00.000Z',
        now: new Date('2026-03-17T10:00:00.000Z'),
      })
    ).toBe('bookingForm.validationConflict')

    expect(
      resolveCalendarBookingMutationErrorKey({
        error: new Error('Booking is disabled'),
        startsAt: '2026-03-17T12:00:00.000Z',
        now: new Date('2026-03-17T10:00:00.000Z'),
      })
    ).toBe('messages.bookingDisabled')

    expect(
      resolveCalendarBookingMutationErrorKey({
        error: new Error('Unexpected'),
        startsAt: '2026-03-17T12:00:00.000Z',
        now: new Date('2026-03-17T10:00:00.000Z'),
      })
    ).toBe('messages.saveFailed')
  })
})
