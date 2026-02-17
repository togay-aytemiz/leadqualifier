import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    getBillingPricingCatalog,
    resolveBillingCurrencyByRegion,
    resolveConversationRangeForCredits,
    resolveLocalizedMoneyForRegion
} from '@/lib/billing/pricing-catalog'

interface PricingCatalogQueryResult {
    data: unknown
    error: unknown
}

function createSupabaseMock(result: PricingCatalogQueryResult) {
    const maybeSingleMock = vi.fn(async () => result)
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    const fromMock = vi.fn(() => ({ select: selectMock }))

    return {
        supabase: {
            from: fromMock
        },
        fromMock
    }
}

describe('billing pricing catalog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns fallback catalog when settings query fails', async () => {
        const { supabase } = createSupabaseMock({
            data: null,
            error: { code: '42P01' }
        })

        const result = await getBillingPricingCatalog({
            supabase: supabase as never
        })

        expect(result).toMatchObject({
            trialCredits: 200
        })
        expect(result.plans[0]).toMatchObject({
            id: 'starter',
            credits: 1000,
            priceTry: 349,
            priceUsd: 9.99,
            conversationRange: {
                min: 90,
                max: 120
            }
        })
        expect(result.plans[2]).toMatchObject({
            id: 'scale',
            credits: 4000,
            priceTry: 949,
            priceUsd: 26.99,
            conversationRange: {
                min: 360,
                max: 480
            }
        })
        expect(result.topups[2]).toMatchObject({
            id: 'topup_1000',
            credits: 1000,
            priceTry: 349,
            priceUsd: 9.99,
            conversationRange: {
                min: 90,
                max: 120
            }
        })
    })

    it('maps platform settings to localized catalog shape', async () => {
        const { supabase } = createSupabaseMock({
            data: {
                default_trial_credits: 250,
                starter_plan_credits: 1200,
                starter_plan_price_try: 399,
                starter_plan_price_usd: 11.99,
                growth_plan_credits: 2400,
                growth_plan_price_try: 749,
                growth_plan_price_usd: 21.99,
                scale_plan_credits: 5000,
                scale_plan_price_try: 1290,
                scale_plan_price_usd: 34.99,
                topup_250_price_try: 109,
                topup_250_price_usd: 3.49,
                topup_500_price_try: 209,
                topup_500_price_usd: 6.49,
                topup_1000_price_try: 389,
                topup_1000_price_usd: 11.49
            },
            error: null
        })

        const result = await getBillingPricingCatalog({
            supabase: supabase as never
        })

        expect(result).toMatchObject({
            trialCredits: 250
        })
        expect(result.plans[0]).toMatchObject({
            id: 'starter',
            credits: 1200,
            priceTry: 399,
            priceUsd: 11.99,
            conversationRange: {
                min: 108,
                max: 144
            }
        })
        expect(result.plans[2]).toMatchObject({
            id: 'scale',
            credits: 5000,
            priceTry: 1290,
            priceUsd: 34.99,
            conversationRange: {
                min: 450,
                max: 600
            }
        })
        expect(result.topups[0]).toMatchObject({
            id: 'topup_250',
            credits: 250,
            priceTry: 109,
            priceUsd: 3.49,
            conversationRange: {
                min: 22,
                max: 30
            }
        })
    })

    it('resolves region currency and localized money values', () => {
        expect(resolveBillingCurrencyByRegion('TR')).toBe('TRY')
        expect(resolveBillingCurrencyByRegion('tr')).toBe('TRY')
        expect(resolveBillingCurrencyByRegion('INTL')).toBe('USD')
        expect(resolveBillingCurrencyByRegion('US')).toBe('USD')
        expect(resolveBillingCurrencyByRegion('')).toBe('USD')

        expect(resolveLocalizedMoneyForRegion('TR', {
            priceTry: 349,
            priceUsd: 9.99
        })).toEqual({
            currency: 'TRY',
            amount: 349
        })

        expect(resolveLocalizedMoneyForRegion('INTL', {
            priceTry: 349,
            priceUsd: 9.99
        })).toEqual({
            currency: 'USD',
            amount: 9.99
        })
    })

    it('keeps conversation range calculation stable', () => {
        expect(resolveConversationRangeForCredits(1000)).toEqual({
            min: 90,
            max: 120
        })
        expect(resolveConversationRangeForCredits(250)).toEqual({
            min: 22,
            max: 30
        })
    })
})
