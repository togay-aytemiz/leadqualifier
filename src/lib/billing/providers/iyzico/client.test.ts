import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as iyzicoClient from '@/lib/billing/providers/iyzico/client'

const {
    getBillingProviderConfigMock,
    subscriptionCardUpdateWithSubscriptionReferenceCodeMock,
    subscriptionPaymentRetryMock,
    iyzipayConstructorMock
} = vi.hoisted(() => {
    const subscriptionCardUpdateWithSubscriptionReferenceCodeMock = vi.fn()
    const subscriptionPaymentRetryMock = vi.fn()
    const iyzipayConstructorMock = vi.fn(() => ({
        subscriptionCard: {
            updateWithSubscriptionReferenceCode: subscriptionCardUpdateWithSubscriptionReferenceCodeMock
        },
        subscriptionPayment: {
            retry: subscriptionPaymentRetryMock
        }
    }))

    return {
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
        subscriptionCardUpdateWithSubscriptionReferenceCodeMock,
        subscriptionPaymentRetryMock,
        iyzipayConstructorMock
    }
})

vi.mock('iyzipay', () => ({
    default: Object.assign(iyzipayConstructorMock, {
        LOCALE: {
            TR: 'tr',
            EN: 'en'
        },
        PAYMENT_GROUP: {
            PRODUCT: 'PRODUCT'
        },
        SUBSCRIPTION_INITIAL_STATUS: {
            ACTIVE: 'ACTIVE'
        }
    })
}))

vi.mock('@/lib/billing/providers/config', () => ({
    getBillingProviderConfig: getBillingProviderConfigMock
}))

describe('iyzico billing client', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('exposes a subscription card-update initializer', async () => {
        expect(typeof (iyzicoClient as Record<string, unknown>).initializeIyzicoSubscriptionCardUpdateCheckout).toBe('function')

        subscriptionCardUpdateWithSubscriptionReferenceCodeMock.mockImplementation((payload, cb) => {
            cb(null, {
                status: 'success',
                token: 'card-update-token',
                checkoutFormContent: '<div />'
            })
        })

        const result = await (iyzicoClient as typeof iyzicoClient & {
            initializeIyzicoSubscriptionCardUpdateCheckout: (input: {
                locale: 'tr' | 'en'
                callbackUrl: string
                subscriptionReferenceCode: string
                conversationId: string
            }) => Promise<unknown>
        }).initializeIyzicoSubscriptionCardUpdateCheckout({
            locale: 'tr',
            callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback',
            subscriptionReferenceCode: 'sub_ref_1',
            conversationId: 'conv_1'
        })

        expect(result).toEqual(expect.objectContaining({
            status: 'success',
            token: 'card-update-token'
        }))
        expect(subscriptionCardUpdateWithSubscriptionReferenceCodeMock).toHaveBeenCalledWith({
            locale: 'tr',
            conversationId: 'conv_1',
            subscriptionReferenceCode: 'sub_ref_1',
            callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback'
        }, expect.any(Function))
    })

    it('exposes a failed-payment retry wrapper', async () => {
        expect(typeof (iyzicoClient as Record<string, unknown>).retryIyzicoSubscriptionPayment).toBe('function')

        subscriptionPaymentRetryMock.mockImplementation((payload, cb) => {
            cb(null, {
                status: 'success'
            })
        })

        const result = await (iyzicoClient as typeof iyzicoClient & {
            retryIyzicoSubscriptionPayment: (input: {
                locale: 'tr' | 'en'
                conversationId: string
                referenceCode: string
            }) => Promise<unknown>
        }).retryIyzicoSubscriptionPayment({
            locale: 'tr',
            conversationId: 'conv_retry_1',
            referenceCode: 'order_ref_failed_1'
        })

        expect(result).toEqual(expect.objectContaining({
            status: 'success'
        }))
        expect(subscriptionPaymentRetryMock).toHaveBeenCalledWith({
            locale: 'tr',
            conversationId: 'conv_retry_1',
            referenceCode: 'order_ref_failed_1'
        }, expect.any(Function))
    })
})
