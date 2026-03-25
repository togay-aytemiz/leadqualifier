export type CalendarBookingMutationErrorKey =
  | 'bookingForm.validationPastDate'
  | 'bookingForm.validationSlotUnavailable'
  | 'bookingForm.validationConflict'
  | 'messages.bookingDisabled'
  | 'messages.saveFailed'

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return ''
}

export function resolveCalendarBookingMutationErrorKey(input: {
  error: unknown
  startsAt?: string | null
  now?: Date
}): CalendarBookingMutationErrorKey {
  const message = extractErrorMessage(input.error)
  const startsAtMs = input.startsAt ? new Date(input.startsAt).getTime() : Number.NaN
  const nowMs = (input.now ?? new Date()).getTime()

  if (
    Number.isFinite(startsAtMs) &&
    startsAtMs < nowMs &&
    (message.includes('Requested slot is not available') || message.toLowerCase().includes('past'))
  ) {
    return 'bookingForm.validationPastDate'
  }

  if (message.includes('Double booking conflict')) {
    return 'bookingForm.validationConflict'
  }

  if (message.includes('Booking is disabled')) {
    return 'messages.bookingDisabled'
  }

  if (message.includes('Requested slot is not available')) {
    return 'bookingForm.validationSlotUnavailable'
  }

  return 'messages.saveFailed'
}
