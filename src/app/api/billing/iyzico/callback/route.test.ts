import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createServiceClientMock,
    retrieveIyzicoSubscriptionCheckoutResultMock,
    retrieveIyzicoTopupCheckoutResultMock
} = vi.hoisted(() => ({
    createServiceClientMock: vi.fn(),
    retrieveIyzicoSubscriptionCheckoutResultMock: vi.fn(),
    retrieveIyzicoTopupCheckoutResultMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

vi.mock('@/lib/billing/providers/iyzico/client', () => {
    class MockIyzicoClientError extends Error {
        readonly code: string
        readonly providerErrorCode: string | null
        readonly providerErrorMessage: string | null
        readonly providerErrorGroup: string | null

        constructor(
            code: string,
            message: string,
            details?: {
                providerErrorCode?: string | null
                providerErrorMessage?: string | null
                providerErrorGroup?: string | null
            }
        ) {
            super(message)
            this.code = code
            this.providerErrorCode = details?.providerErrorCode ?? null
            this.providerErrorMessage = details?.providerErrorMessage ?? null
            this.providerErrorGroup = details?.providerErrorGroup ?? null
        }
    }

    return {
        retrieveIyzicoSubscriptionCheckoutResult: retrieveIyzicoSubscriptionCheckoutResultMock,
        retrieveIyzicoTopupCheckoutResult: retrieveIyzicoTopupCheckoutResultMock,
        IyzicoClientError: MockIyzicoClientError
    }
})

import { GET } from '@/app/api/billing/iyzico/callback/route'
import { IyzicoClientError } from '@/lib/billing/providers/iyzico/client'

function createServiceSupabaseMock(options: {
    orderRow?: Record<string, unknown> | null
    subscriptionRow?: Record<string, unknown> | null
}) {
    const orderMaybeSingleMock = vi.fn(async () => ({
        data: options.orderRow ?? null,
        error: null
    }))
    const orderLimitMock = vi.fn(() => ({
        maybeSingle: orderMaybeSingleMock
    }))
    const orderSortMock = vi.fn(() => ({
        limit: orderLimitMock
    }))
    const orderEqSecondMock = vi.fn(() => ({
        order: orderSortMock
    }))
    const orderEqFirstMock = vi.fn(() => ({
        eq: orderEqSecondMock
    }))
    const orderSelectMock = vi.fn(() => ({
        eq: orderEqFirstMock
    }))
    const orderUpdateEqMock = vi.fn(async () => ({ error: null }))
    const orderUpdateMock = vi.fn(() => ({
        eq: orderUpdateEqMock
    }))

    const subscriptionMaybeSingleMock = vi.fn(async () => ({
        data: options.subscriptionRow ?? null,
        error: null
    }))
    const subscriptionLimitMock = vi.fn(() => ({
        maybeSingle: subscriptionMaybeSingleMock
    }))
    const subscriptionSortMock = vi.fn(() => ({
        limit: subscriptionLimitMock
    }))
    const subscriptionEqSecondMock = vi.fn(() => ({
        order: subscriptionSortMock
    }))
    const subscriptionEqFirstMock = vi.fn(() => ({
        eq: subscriptionEqSecondMock
    }))
    const subscriptionSelectMock = vi.fn(() => ({
        eq: subscriptionEqFirstMock
    }))
    const subscriptionUpdateEqMock = vi.fn(async () => ({ error: null }))
    const subscriptionUpdateMock = vi.fn(() => ({
        eq: subscriptionUpdateEqMock
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'credit_purchase_orders') {
            return {
                select: orderSelectMock,
                update: orderUpdateMock
            }
        }

        if (table === 'organization_subscription_records') {
            return {
                select: subscriptionSelectMock,
                update: subscriptionUpdateMock
            }
        }

        throw new Error(`Unexpected table: ${table}`)
    })

    return {
        client: {
            from: fromMock
        },
        spies: {
            orderUpdateEqMock,
            subscriptionUpdateEqMock
        }
    }
}

describe('iyzico callback route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    it('redirects with a mapped checkout error when subscription retrieve fails', async () => {
        const { client, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                status: 'pending',
                provider_subscription_id: null,
                metadata: {
                    checkout_locale: 'tr'
                }
            }
        })
        createServiceClientMock.mockReturnValue(client)
        retrieveIyzicoSubscriptionCheckoutResultMock.mockRejectedValue(
            new IyzicoClientError('request_failed', 'Kart limiti yetersiz, yetersiz bakiye', {
                providerErrorCode: '10051',
                providerErrorMessage: 'Kart limiti yetersiz, yetersiz bakiye'
            })
        )

        const req = new NextRequest('http://localhost/api/billing/iyzico/callback?action=subscribe&locale=tr&token=tok_1')
        const res = await GET(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('checkout_action=subscribe')
        expect(res.headers.get('location')).toContain('checkout_status=failed')
        expect(res.headers.get('location')).toContain('checkout_error=insufficient_funds')
        expect(spies.subscriptionUpdateEqMock).toHaveBeenCalledWith('id', 'sub_row_1')
    })
})
