import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as iyzicoClient from '@/lib/billing/providers/iyzico/client'

const {
    getBillingProviderConfigMock,
    subscriptionCardUpdateWithSubscriptionReferenceCodeMock,
    subscriptionPaymentRetryMock,
    subscriptionUpgradeMock,
    paymentRetrieveMock,
    iyzipayConstructorMock
} = vi.hoisted(() => {
    const subscriptionCardUpdateWithSubscriptionReferenceCodeMock = vi.fn()
    const subscriptionPaymentRetryMock = vi.fn()
    const subscriptionUpgradeMock = vi.fn()
    const paymentRetrieveMock = vi.fn()
    const iyzipayConstructorMock = vi.fn(() => ({
        subscriptionCard: {
            updateWithSubscriptionReferenceCode: subscriptionCardUpdateWithSubscriptionReferenceCodeMock
        },
        subscriptionPayment: {
            retry: subscriptionPaymentRetryMock
        },
        subscription: {
            upgrade: subscriptionUpgradeMock
        },
        payment: {
            retrieve: paymentRetrieveMock
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
        subscriptionUpgradeMock,
        paymentRetrieveMock,
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

    afterEach(() => {
        vi.unstubAllGlobals()
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

    it('retrieves payment detail by payment id for subscription order settlement amounts', async () => {
        expect(typeof (iyzicoClient as Record<string, unknown>).retrieveIyzicoPayment).toBe('function')

        paymentRetrieveMock.mockImplementation((payload, cb) => {
            cb(null, {
                status: 'success',
                paymentId: '29512645',
                paidPrice: 649,
                paymentStatus: 'SUCCESS'
            })
        })

        const result = await (iyzicoClient as typeof iyzicoClient & {
            retrieveIyzicoPayment: (input: {
                locale: 'tr' | 'en'
                paymentId: string
            }) => Promise<unknown>
        }).retrieveIyzicoPayment({
            locale: 'tr',
            paymentId: '29512645'
        })

        expect(result).toEqual(expect.objectContaining({
            status: 'success',
            paymentId: '29512645',
            paidPrice: 649
        }))
        expect(paymentRetrieveMock).toHaveBeenCalledWith({
            locale: 'tr',
            paymentId: '29512645'
        }, expect.any(Function))
    })

    it('sends documented recurrence fields to subscription upgrades', async () => {
        const fetchMock = vi.fn(async () => ({
            json: async () => ({
                status: 'success',
                data: {
                    referenceCode: 'sub_ref_growth'
                }
            })
        }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await iyzicoClient.upgradeIyzicoSubscription({
            subscriptionReferenceCode: 'sub_ref_starter',
            newPricingPlanReferenceCode: 'plan_ref_growth',
            upgradePeriod: 'NOW',
            resetRecurrenceCount: false,
            conversationId: 'subscription_change_sub_row_1_growth'
        })

        expect(result).toEqual(expect.objectContaining({
            status: 'success'
        }))
        expect(fetchMock).toHaveBeenCalledWith(
            'https://sandbox-api.iyzipay.com/v2/subscription/subscriptions/sub_ref_starter/upgrade',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    locale: 'tr',
                    conversationId: 'subscription_change_sub_row_1_growth',
                    newPricingPlanReferenceCode: 'plan_ref_growth',
                    upgradePeriod: 'NOW',
                    useTrial: false,
                    resetRecurrenceCount: false
                })
            })
        )
        const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
        expect(headers.Authorization).toMatch(/^IYZWSv2 /)
        expect(headers['Content-Type']).toBe('application/json')
        expect(headers['x-iyzi-rnd']).toBeTruthy()
        const decodedAuthorization = Buffer
            .from(headers.Authorization.replace('IYZWSv2 ', ''), 'base64')
            .toString('utf8')
        const expectedSignature = crypto
            .createHmac('sha256', 'secret-key')
            .update(`${headers['x-iyzi-rnd']}/v2/subscription/subscriptions/sub_ref_starter/upgrade${JSON.stringify({
                locale: 'tr',
                conversationId: 'subscription_change_sub_row_1_growth',
                newPricingPlanReferenceCode: 'plan_ref_growth',
                upgradePeriod: 'NOW',
                useTrial: false,
                resetRecurrenceCount: false
            })}`)
            .digest('hex')
        expect(decodedAuthorization).toBe(`apiKey:api-key&randomKey:${headers['x-iyzi-rnd']}&signature:${expectedSignature}`)
    })
})
