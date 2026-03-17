import { describe, expect, it } from 'vitest'

import {
    detectBookingIntent,
    resolveBookingAssistantAction,
    shouldOfferProactiveBookingPrompt
} from '@/lib/ai/booking'

describe('detectBookingIntent', () => {
    it('recognizes strong booking requests with service and time cues', () => {
        expect(detectBookingIntent('Cilt bakimi icin yarin bos yer var mi?')).toMatchObject({
            hasBookingIntent: true,
            requestedTimeMentioned: true
        })
    })

    it('does not force scheduling for generic informational questions', () => {
        expect(detectBookingIntent('Hizmetleriniz hakkında genel bilgi alabilir miyim?')).toMatchObject({
            hasBookingIntent: false
        })
    })
})

describe('resolveBookingAssistantAction', () => {
    it('asks to clarify the service before suggesting slots when duration is ambiguous', () => {
        expect(resolveBookingAssistantAction({
            alternativeSlotCount: 0,
            exactSlotAvailable: false,
            hasBookingIntent: true,
            serviceResolved: false,
            userConfirmedSlot: false
        })).toBe('clarify_service')
    })

    it('suggests alternatives instead of giving a dead-end unavailable reply', () => {
        expect(resolveBookingAssistantAction({
            alternativeSlotCount: 3,
            exactSlotAvailable: false,
            hasBookingIntent: true,
            serviceResolved: true,
            userConfirmedSlot: false
        })).toBe('suggest_alternatives')
    })

    it('creates the booking only after a clear confirmation', () => {
        expect(resolveBookingAssistantAction({
            alternativeSlotCount: 0,
            exactSlotAvailable: true,
            hasBookingIntent: true,
            serviceResolved: true,
            userConfirmedSlot: true
        })).toBe('create_booking')
    })

    it('falls back safely when intent exists but timing is still too unclear', () => {
        expect(resolveBookingAssistantAction({
            alternativeSlotCount: 0,
            exactSlotAvailable: false,
            hasBookingIntent: true,
            serviceResolved: true,
            userConfirmedSlot: false
        })).toBe('clarify_time')
    })
})

describe('shouldOfferProactiveBookingPrompt', () => {
    it('offers a gentle next step only when intent is strong and the booking is not yet completed', () => {
        expect(shouldOfferProactiveBookingPrompt({
            hasBookingIntent: true,
            hasResolvedService: true,
            messageCount: 4,
            bookingAlreadyCreated: false
        })).toBe(true)
    })

    it('avoids repetitive booking prompts in low-intent or already-booked threads', () => {
        expect(shouldOfferProactiveBookingPrompt({
            hasBookingIntent: false,
            hasResolvedService: true,
            messageCount: 2,
            bookingAlreadyCreated: false
        })).toBe(false)

        expect(shouldOfferProactiveBookingPrompt({
            hasBookingIntent: true,
            hasResolvedService: true,
            messageCount: 6,
            bookingAlreadyCreated: true
        })).toBe(false)
    })
})
