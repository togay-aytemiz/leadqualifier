import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    createServiceClientMock,
    getBillingProviderConfigMock,
    initializeIyzicoSubscriptionCardUpdateCheckoutMock,
    retryIyzicoSubscriptionPaymentMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceClientMock: vi.fn(),
    getBillingProviderConfigMock: vi.fn(() => ({
        provider: 'iyzico',
        mock: {
            enabled: false,
            error: null
        },
        iyzico: {
            enabled: true,
            apiKey: 'api-key',
            secretKey: 'secret-key',
            baseUrl: 'https://sandbox-api.iyzipay.com',
            webhookSecret: null,
            error: null
        }
    })),
    initializeIyzicoSubscriptionCardUpdateCheckoutMock: vi.fn(),
    retryIyzicoSubscriptionPaymentMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

vi.mock('@/lib/billing/providers/config', () => ({
    getBillingProviderConfig: getBillingProviderConfigMock
}))

vi.mock('@/lib/billing/providers/iyzico/client', () => ({
    initializeIyzicoSubscriptionCardUpdateCheckout: initializeIyzicoSubscriptionCardUpdateCheckoutMock,
    retryIyzicoSubscriptionPayment: retryIyzicoSubscriptionPaymentMock,
    IyzicoClientError: class MockIyzicoClientError extends Error {
        code: string
        constructor(code: string, message: string) {
            super(message)
            this.code = code
        }
    }
}))

import {
    beginSubscriptionPaymentMethodUpdate,
    retryFailedSubscriptionPayment
} from '@/lib/billing/subscription-payment-recovery'

function createTenantSupabaseMock(options?: {
    row?: Record<string, unknown> | null
    userId?: string | null
}) {
    const maybeSingleMock = vi.fn(async () => ({
        data: options?.row ?? null,
        error: null
    }))
    const limitMock = vi.fn(() => ({
        maybeSingle: maybeSingleMock
    }))
    const orderMock = vi.fn(() => ({
        limit: limitMock
    }))
    const inMock = vi.fn(() => ({
        order: orderMock
    }))
    const eqMock = vi.fn(() => ({
        in: inMock
    }))
    const selectMock = vi.fn(() => ({
        eq: eqMock
    }))
    const fromMock = vi.fn(() => ({
        select: selectMock
    }))
    const rpcMock = vi.fn(async () => ({ data: true, error: null }))
    const getUserMock = vi.fn(async () => ({
        data: {
            user: options?.userId === null ? null : { id: options?.userId ?? 'user_1' }
        }
    }))

    return {
        supabase: {
            from: fromMock,
            rpc: rpcMock,
            auth: {
                getUser: getUserMock
            }
        }
    }
}

function createServiceSupabaseMock() {
    const updateEqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({
        eq: updateEqMock
    }))
    const fromMock = vi.fn(() => ({
        update: updateMock
    }))

    return {
        supabase: {
            from: fromMock
        },
        spies: {
            updateMock,
            updateEqMock
        }
    }
}

describe('subscription payment recovery actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    it('starts a hosted card-update flow and persists the checkout form content', async () => {
        const { supabase } = createTenantSupabaseMock({
            row: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider: 'iyzico',
                provider_subscription_id: 'sub_ref_1',
                metadata: {
                    last_failed_order_reference_code: 'order_ref_failed_1'
                }
            }
        })
        const { supabase: serviceSupabase, spies } = createServiceSupabaseMock()
        createClientMock.mockResolvedValue(supabase)
        createServiceClientMock.mockReturnValue(serviceSupabase)
        initializeIyzicoSubscriptionCardUpdateCheckoutMock.mockResolvedValue({
            status: 'success',
            token: 'card_update_token_1',
            checkoutFormContent: '<div id=\"iyzipay-checkout-form\"></div>'
        })

        const result = await beginSubscriptionPaymentMethodUpdate({
            organizationId: 'org_1',
            locale: 'tr',
            callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback?recordId=sub_row_1&locale=tr'
        })

        expect(result).toEqual({
            ok: true,
            status: 'success',
            error: null,
            recordId: 'sub_row_1'
        })
        expect(initializeIyzicoSubscriptionCardUpdateCheckoutMock).toHaveBeenCalledWith({
            locale: 'tr',
            conversationId: 'sub_row_1',
            subscriptionReferenceCode: 'sub_ref_1',
            callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback?recordId=sub_row_1&locale=tr'
        })
        expect(spies.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                card_update_checkout_form_content: '<div id=\"iyzipay-checkout-form\"></div>'
            })
        }))
        expect(spies.updateEqMock).toHaveBeenCalledWith('id', 'sub_row_1')
    })

    it('triggers provider retry using the failed order reference', async () => {
        const { supabase } = createTenantSupabaseMock({
            row: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider: 'iyzico',
                provider_subscription_id: 'sub_ref_1',
                metadata: {
                    last_failed_order_reference_code: 'order_ref_failed_1'
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)
        createServiceClientMock.mockReturnValue(createServiceSupabaseMock().supabase)
        retryIyzicoSubscriptionPaymentMock.mockResolvedValue({
            status: 'success'
        })

        const result = await retryFailedSubscriptionPayment({
            organizationId: 'org_1',
            locale: 'tr'
        })

        expect(result).toEqual({
            ok: true,
            status: 'success',
            error: null,
            recordId: 'sub_row_1'
        })
        expect(retryIyzicoSubscriptionPaymentMock).toHaveBeenCalledWith({
            locale: 'tr',
            conversationId: 'sub_row_1',
            referenceCode: 'order_ref_failed_1'
        })
    })
})
