import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createCalendarBookingRecordMock,
    getBookableServiceCatalogItemsByOrganizationIdMock,
    getBookingSettingsByOrganizationIdMock,
    lookupBookingAvailabilityMock
} = vi.hoisted(() => ({
    createCalendarBookingRecordMock: vi.fn(),
    getBookableServiceCatalogItemsByOrganizationIdMock: vi.fn(),
    getBookingSettingsByOrganizationIdMock: vi.fn(),
    lookupBookingAvailabilityMock: vi.fn()
}))

vi.mock('@/lib/calendar/bookings', () => ({
    createCalendarBookingRecord: createCalendarBookingRecordMock,
    getBookableServiceCatalogItemsByOrganizationId: getBookableServiceCatalogItemsByOrganizationIdMock,
    getBookingSettingsByOrganizationId: getBookingSettingsByOrganizationIdMock,
    lookupBookingAvailability: lookupBookingAvailabilityMock
}))

import { maybeHandleSchedulingRequest } from '@/lib/ai/booking'

function createMessagesHistoryBuilder(messages: Array<Record<string, unknown>>) {
    const limitMock = vi.fn(async () => ({ data: messages, error: null }))
    const orderMock = vi.fn(() => ({ limit: limitMock }))
    const eqMock = vi.fn(() => ({ order: orderMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        }
    }
}

function createLeadSnapshotBuilder(leadSnapshot: Record<string, unknown> | null) {
    const maybeSingleMock = vi.fn(async () => ({ data: leadSnapshot, error: null }))
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        }
    }
}

function createSupabaseMock(plan: Record<string, Array<Record<string, unknown>>>) {
    return {
        from: vi.fn((table: string) => {
            const builders = plan[table]
            if (!builders || builders.length === 0) {
                throw new Error(`Unexpected query for table: ${table}`)
            }

            const next = builders.shift()
            if (!next) {
                throw new Error(`Missing query builder for table: ${table}`)
            }

            return next
        })
    }
}

describe('maybeHandleSchedulingRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        getBookingSettingsByOrganizationIdMock.mockResolvedValue({
            booking_enabled: true,
            timezone: 'Europe/Istanbul'
        })

        getBookableServiceCatalogItemsByOrganizationIdMock.mockResolvedValue([
            {
                id: 'svc-skin',
                name: 'Cilt Bakımı',
                aliases: ['cilt bakimi'],
                duration_minutes: 60
            },
            {
                id: 'svc-laser',
                name: 'Lazer Epilasyon',
                aliases: ['lazer']
            }
        ])

        lookupBookingAvailabilityMock.mockResolvedValue({
            requestedStartIso: '2026-03-18T12:00:00.000Z',
            exactMatchAvailable: false,
            slotDurationMinutes: 60,
            durationSource: 'service_catalog',
            availableSlots: [
                '2026-03-18T13:00:00.000Z',
                '2026-03-18T14:00:00.000Z'
            ],
            alternativeSlots: [
                '2026-03-18T13:00:00.000Z',
                '2026-03-18T14:00:00.000Z'
            ]
        })

        createCalendarBookingRecordMock.mockResolvedValue({
            id: 'booking-1',
            service_catalog_id: 'svc-skin',
            status: 'confirmed',
            starts_at: '2026-03-18T13:00:00.000Z',
            timezone: 'Europe/Istanbul'
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('asks to clarify the service when booking intent exists but the service is unresolved', async () => {
        getBookableServiceCatalogItemsByOrganizationIdMock.mockResolvedValue([
            {
                id: 'svc-skin',
                name: 'Cilt Bakımı',
                aliases: [],
                duration_minutes: 60
            },
            {
                id: 'svc-laser',
                name: 'Lazer Epilasyon',
                aliases: [],
                duration_minutes: 45
            }
        ])

        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Yarın randevu almak istiyorum.',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toBe(true)
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('hangi hizmet')
        )
        expect(lookupBookingAvailabilityMock).not.toHaveBeenCalled()
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_action: 'clarify_service',
                is_booking_response: true
            })
        )
    })

    it('suggests real alternative slots when the exact request is unavailable', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Cilt bakımı için yarın 15:00 uygun mu?',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toBe(true)
        expect(lookupBookingAvailabilityMock).toHaveBeenCalledWith(
            expect.anything(),
            'org-1',
            expect.objectContaining({
                serviceCatalogId: 'svc-skin'
            })
        )
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('uygun görünen seçenekler')
        )
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_action: 'suggest_alternatives',
                booking_service_catalog_id: 'svc-skin',
                booking_suggestion_slots: [
                    '2026-03-18T13:00:00.000Z',
                    '2026-03-18T14:00:00.000Z'
                ],
                is_booking_response: true
            })
        )
    })

    it('suggests the nearest two service slots across the next 30 local days when no date is requested', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-03-18T07:07:00.000Z'))

        lookupBookingAvailabilityMock.mockResolvedValue({
            requestedStartIso: null,
            exactMatchAvailable: false,
            slotDurationMinutes: 60,
            durationSource: 'default',
            availableSlots: [
                '2026-03-18T14:00:00.000Z',
                '2026-03-19T08:00:00.000Z'
            ],
            alternativeSlots: [
                '2026-03-18T14:00:00.000Z',
                '2026-03-19T08:00:00.000Z'
            ]
        })

        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'En yakın lazer randevusu ne zaman?',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toBe(true)
        expect(lookupBookingAvailabilityMock).toHaveBeenCalledWith(
            expect.anything(),
            'org-1',
            expect.objectContaining({
                rangeStartIso: '2026-03-17T21:00:00.000Z',
                rangeEndIso: '2026-04-16T21:00:00.000Z',
                requestedStartIso: null,
                serviceCatalogId: 'svc-laser',
                suggestionLimit: 2
            })
        )
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('En yakın uygun seçenekler')
        )
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('başka saat ve seçeneklere de bakabiliriz')
        )
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_action: 'suggest_alternatives',
                booking_service_catalog_id: 'svc-laser',
                booking_suggestion_slots: [
                    '2026-03-18T14:00:00.000Z',
                    '2026-03-19T08:00:00.000Z'
                ],
                is_booking_response: true
            })
        )
    })

    it('creates the booking when the user confirms one of the previously suggested slots', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([
                {
                    sender_type: 'bot',
                    content: 'Uygun seçenekler: Çarşamba 16:00',
                    metadata: {
                        is_booking_response: true,
                        booking_service_catalog_id: 'svc-skin',
                        booking_service_name: 'Cilt Bakımı',
                        booking_suggestion_slots: ['2026-03-18T13:00:00.000Z']
                    }
                }
            ]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Evet, 16:00 olur.',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toBe(true)
        expect(createCalendarBookingRecordMock).toHaveBeenCalledWith(
            expect.anything(),
            'org-1',
            expect.objectContaining({
                conversationId: 'conv-1',
                customerName: 'Ayse',
                customerPhone: '+905551112233',
                serviceCatalogId: 'svc-skin',
                startsAt: '2026-03-18T13:00:00.000Z'
            }),
            null
        )
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('Randevunuzu oluşturdum')
        )
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_id: 'booking-1',
                is_booking_confirmation: true,
                is_booking_response: true
            })
        )
    })

    it('continues scheduling when the user asks about another day without repeating the service', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([
                {
                    sender_type: 'bot',
                    content: 'İstediğiniz saat dolu görünüyor. Şu seçenekler uygun: Çarşamba 16:00.',
                    metadata: {
                        is_booking_response: true,
                        booking_action: 'suggest_alternatives',
                        booking_service_catalog_id: 'svc-skin',
                        booking_service_name: 'Cilt Bakımı',
                        booking_requested_slot: '2026-03-18T12:00:00.000Z',
                        booking_suggestion_slots: ['2026-03-18T13:00:00.000Z']
                    }
                }
            ]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Cuma var mı?',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toBe(true)
        expect(lookupBookingAvailabilityMock).toHaveBeenCalledWith(
            expect.anything(),
            'org-1',
            expect.objectContaining({
                serviceCatalogId: 'svc-skin'
            })
        )
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('uygun görünen seçenekler')
        )
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_action: 'suggest_alternatives',
                booking_service_catalog_id: 'svc-skin',
                is_booking_response: true
            })
        )
    })

    it('falls back to a safe human handoff when no valid slots are available', async () => {
        lookupBookingAvailabilityMock.mockResolvedValue({
            requestedStartIso: '2026-03-18T12:00:00.000Z',
            exactMatchAvailable: false,
            slotDurationMinutes: 60,
            durationSource: 'service_catalog',
            availableSlots: [],
            alternativeSlots: []
        })

        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Cilt bakımı için yarın 15:00 uygun mu?',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toEqual({
            handled: true,
            requiresHumanHandover: true
        })
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('uygun slot bulamadım')
        )
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_action: 'handoff',
                is_booking_response: true
            })
        )
    })

    it('hands off implied booking change requests after a confirmed booking instead of reopening availability flow', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([
                {
                    sender_type: 'bot',
                    content: 'Randevunuzu oluşturdum: Çarşamba 16:00.',
                    metadata: {
                        is_booking_response: true,
                        is_booking_confirmation: true,
                        booking_id: 'booking-1',
                        booking_service_catalog_id: 'svc-skin',
                        booking_service_name: 'Cilt Bakımı'
                    }
                }
            ]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Perşembeye alabilir miyiz?',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toEqual({
            handled: true,
            requiresHumanHandover: true
        })
        expect(lookupBookingAvailabilityMock).not.toHaveBeenCalled()
        expect(createCalendarBookingRecordMock).not.toHaveBeenCalled()
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_action: 'handoff_management',
                is_booking_response: true
            })
        )
    })

    it('hands off booking change requests instead of attempting automatic rescheduling', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Randevumu değiştirmek istiyorum.',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toEqual({
            handled: true,
            requiresHumanHandover: true
        })
        expect(lookupBookingAvailabilityMock).not.toHaveBeenCalled()
        expect(createCalendarBookingRecordMock).not.toHaveBeenCalled()
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('Randevu değişikliği')
        )
        expect(persistBotMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                booking_action: 'handoff_management',
                is_booking_response: true
            })
        )
    })

    it('does not treat a generic suitability question as a scheduling request', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const persistBotMessage = vi.fn(async () => undefined)
        const supabase = createSupabaseMock({
            messages: [createMessagesHistoryBuilder([]).builder],
            leads: [createLeadSnapshotBuilder(null).builder]
        })

        const handled = await maybeHandleSchedulingRequest({
            supabase: supabase as never,
            organizationId: 'org-1',
            conversationId: 'conv-1',
            message: 'Bu bana uygun mu?',
            platform: 'whatsapp',
            customerName: 'Ayse',
            customerPhone: '+905551112233',
            responseLanguage: 'tr',
            formatOutboundBotMessage: (content) => content,
            sendOutbound,
            persistBotMessage
        })

        expect(handled).toBe(false)
        expect(lookupBookingAvailabilityMock).not.toHaveBeenCalled()
        expect(createCalendarBookingRecordMock).not.toHaveBeenCalled()
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(persistBotMessage).not.toHaveBeenCalled()
    })
})
