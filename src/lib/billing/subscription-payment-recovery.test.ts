import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    createServiceClientMock,
    initializeIyzicoSubscriptionCardUpdateCheckoutMock,
    retryIyzicoSubscriptionPaymentMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceClientMock: vi.fn(),
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
    getBillingProviderConfig: () => ({
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
    })
}))

vi.mock('@/lib/billing/providers/iyzico/client', async () => {
    const actual = await vi.importActual('@/lib/billing/providers/iyzico/client')
    return {
        ...actual,
        initializeIyzicoSubscriptionCardUpdateCheckout: initializeIyzicoSubscriptionCardUpdateCheckoutMock,
        retryIyzicoSubscriptionPayment: retryIyzicoSubscriptionPaymentMock
    }
})

function createSupabaseMock(options?: {
    userId?: string | null
    subscriptionRow?: Record<string, unknown> | null
}) {
    const authGetUserMock = vi.fn(async () => ({
        data: {
            user: options?.userId === null
                ? null
                : { id: options?.userId ?? 'user_1' }
        }
    }))
    const maybeSingleMock = vi.fn(async () => ({
        data: options?.subscriptionRow ?? null,
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
    const rpcMock = vi.fn(async () => ({ data: true, error: null }))
    const fromMock = vi.fn(() => ({
        select: selectMock
    }))

    return {
        supabase: {
            auth: {
                getUser: authGetUserMock
            },
            from: fromMock,
            rpc: rpcMock
        }
    }
}

function createServiceSupabaseMock() {
    const subscriptionUpdateEqMock = vi.fn(async () => ({ error: null }))
    const subscriptionUpdateMock = vi.fn(() => ({
        eq: subscriptionUpdateEqMock
    }))
    const fromMock = vi.fn(() => ({
        update: subscriptionUpdateMock
    }))

    return {
        client: {
            from: fromMock
        },
        spies: {
            subscriptionUpdateMock,
            subscriptionUpdateEqMock
        }
    }
}

describe('subscription payment recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    it('exports helpers for loading recovery state and starting provider actions', async () => {
        const recoveryModule = await import('./subscription-payment-recovery')

        expect(typeof recoveryModule.getSubscriptionPaymentRecoveryState).toBe('function')
        expect(typeof recoveryModule.beginSubscriptionPaymentMethodUpdate).toBe('function')
        expect(typeof recoveryModule.retryFailedSubscriptionPayment).toBe('function')
    })

    it('loads retry and card-update affordances for a past-due iyzico subscription', async () => {
        const recoveryModule = await import('./subscription-payment-recovery')
        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        in: () => ({
                            order: () => ({
                                limit: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            provider: 'iyzico',
                                            provider_subscription_id: 'sub_ref_1',
                                            metadata: {
                                                customer_reference_code: 'customer_ref_1',
                                                last_failed_order_reference_code: 'order_ref_failed_1'
                                            }
                                        },
                                        error: null
                                    })
                                })
                            })
                        })
                    })
                })
            })
        }

        const result = await recoveryModule.getSubscriptionPaymentRecoveryState({
            organizationId: 'org_1',
            supabase: supabase as never
        })

        expect(result).toEqual({
            canRetry: true,
            canUpdateCard: true,
            failedOrderReferenceCode: 'order_ref_failed_1',
            customerReferenceCode: 'customer_ref_1',
            subscriptionReferenceCode: 'sub_ref_1'
        })
    })

    it('starts a payment-method update and persists hosted checkout HTML on the subscription row', async () => {
        const recoveryModule = await import('./subscription-payment-recovery')
        const { supabase } = createSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider: 'iyzico',
                provider_subscription_id: 'sub_ref_1',
                metadata: {
                    customer_reference_code: 'customer_ref_1',
                    last_failed_order_reference_code: 'order_ref_failed_1'
                }
            }
        })
        const { client: serviceClient, spies } = createServiceSupabaseMock()
        createClientMock.mockResolvedValue(supabase)
        createServiceClientMock.mockReturnValue(serviceClient)
        initializeIyzicoSubscriptionCardUpdateCheckoutMock.mockResolvedValue({
            status: 'success',
            token: 'card_update_token',
            checkoutFormContent: '<div id=\"iyzipay-checkout-form\"></div>'
        })

        const result = await recoveryModule.beginSubscriptionPaymentMethodUpdate({
            organizationId: 'org_1',
            locale: 'tr',
            callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback?locale=tr'
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
            callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback?locale=tr&recordId=sub_row_1'
        })
        expect(spies.subscriptionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                card_update_checkout_form_content: '<div id=\"iyzipay-checkout-form\"></div>'
            })
        }))
        expect(spies.subscriptionUpdateEqMock).toHaveBeenCalledWith('id', 'sub_row_1')
    })
})
