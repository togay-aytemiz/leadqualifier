import { describe, expect, it } from 'vitest'
import {
    extractIyzicoCheckoutPaymentConversationId,
    extractIyzicoRetrievedSubscriptionItem,
    extractIyzicoSubscriptionReferenceCode,
    extractIyzicoSubscriptionStartEnd
} from '@/lib/billing/providers/iyzico/checkout-result'

describe('iyzico checkout result helpers', () => {
    it('extracts payment conversation id from top-up retrieve payload', () => {
        const result = extractIyzicoCheckoutPaymentConversationId({
            paymentConversationId: 'order_123'
        })

        expect(result).toBe('order_123')
    })

    it('extracts subscription reference code from nested data payload', () => {
        const result = extractIyzicoSubscriptionReferenceCode({
            data: {
                referenceCode: 'sub_ref_123'
            }
        })

        expect(result).toBe('sub_ref_123')
    })

    it('converts epoch start/end values into iso strings', () => {
        const startDate = Date.UTC(2026, 0, 1, 0, 0, 0)
        const endDate = Date.UTC(2026, 1, 1, 0, 0, 0)

        const result = extractIyzicoSubscriptionStartEnd({
            data: {
                startDate,
                endDate
            }
        })

        expect(result).toEqual({
            startAt: '2026-01-01T00:00:00.000Z',
            endAt: '2026-02-01T00:00:00.000Z'
        })
    })

    it('extracts a matching subscription detail item from retrieve payload', () => {
        const result = extractIyzicoRetrievedSubscriptionItem({
            data: {
                items: [
                    {
                        referenceCode: 'sub_ref_1',
                        status: 'ACTIVE',
                        pricingPlanReferenceCode: 'plan_ref_1',
                        startDate: Date.UTC(2026, 2, 1, 0, 0, 0),
                        endDate: Date.UTC(2026, 3, 1, 0, 0, 0)
                    }
                ]
            }
        }, 'sub_ref_1')

        expect(result).toEqual({
            referenceCode: 'sub_ref_1',
            status: 'ACTIVE',
            pricingPlanReferenceCode: 'plan_ref_1',
            startAt: '2026-03-01T00:00:00.000Z',
            endAt: '2026-04-01T00:00:00.000Z'
        })
    })
})
