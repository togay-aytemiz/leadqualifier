import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentBillingPackageOffer } from '@/lib/billing/package-offer'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

interface PackageVersionsResult {
    data: unknown
    error: unknown
}

function createSupabaseMock(result: PackageVersionsResult) {
    const limitMock = vi.fn(async () => result)
    const orderMock = vi.fn(() => ({ limit: limitMock }))
    const selectMock = vi.fn(() => ({ order: orderMock }))
    const fromMock = vi.fn(() => ({ select: selectMock }))

    return {
        supabase: {
            from: fromMock
        },
        fromMock
    }
}

describe('getCurrentBillingPackageOffer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns active package version when an effective version exists', async () => {
        const { supabase } = createSupabaseMock({
            data: [
                {
                    monthly_price_try: 99,
                    monthly_credits: 2500,
                    effective_from: '2026-03-01T00:00:00.000Z',
                    effective_to: null
                },
                {
                    monthly_price_try: 79,
                    monthly_credits: 1800,
                    effective_from: '2026-01-01T00:00:00.000Z',
                    effective_to: null
                }
            ],
            error: null
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await getCurrentBillingPackageOffer({
            nowIso: '2026-02-14T12:00:00.000Z'
        })

        expect(result).toEqual({
            monthlyPriceTry: 79,
            monthlyCredits: 1800,
            source: 'package_version'
        })
    })

    it('falls back to billing-account credits when no package version is active', async () => {
        const { supabase } = createSupabaseMock({
            data: [
                {
                    monthly_price_try: 99,
                    monthly_credits: 2500,
                    effective_from: '2026-03-01T00:00:00.000Z',
                    effective_to: null
                }
            ],
            error: null
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await getCurrentBillingPackageOffer({
            nowIso: '2026-02-14T12:00:00.000Z',
            fallbackMonthlyCredits: 1200
        })

        expect(result).toEqual({
            monthlyPriceTry: 0,
            monthlyCredits: 1200,
            source: 'billing_account'
        })
    })

    it('falls back to zero values when query fails and no fallback credits exist', async () => {
        const { supabase } = createSupabaseMock({
            data: null,
            error: { code: '42P01' }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await getCurrentBillingPackageOffer()

        expect(result).toEqual({
            monthlyPriceTry: 0,
            monthlyCredits: 0,
            source: 'fallback'
        })
    })
})
