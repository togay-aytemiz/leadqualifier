import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as iyzicoClient from '@/lib/billing/providers/iyzico/client'

const {
    getBillingProviderConfigMock
} = vi.hoisted(() => {
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
        }))
    }
})

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

        const fetchMock = vi.fn(async () => ({
            json: async () => ({
                status: 'success',
                token: 'card-update-token',
                checkoutFormContent: '<div />'
            })
        }))
        vi.stubGlobal('fetch', fetchMock)

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
        expect(fetchMock).toHaveBeenCalledWith(
            'https://sandbox-api.iyzipay.com/v2/subscription/card-update/checkoutform/initialize/with-subscription',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    locale: 'tr',
                    conversationId: 'conv_1',
                    subscriptionReferenceCode: 'sub_ref_1',
                    callbackUrl: 'https://app.test/api/billing/iyzico/card-update/callback'
                })
            })
        )
    })

    it('exposes a failed-payment retry wrapper', async () => {
        expect(typeof (iyzicoClient as Record<string, unknown>).retryIyzicoSubscriptionPayment).toBe('function')

        const fetchMock = vi.fn(async () => ({
            json: async () => ({
                status: 'success'
            })
        }))
        vi.stubGlobal('fetch', fetchMock)

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
        expect(fetchMock).toHaveBeenCalledWith(
            'https://sandbox-api.iyzipay.com/v2/subscription/operation/retry',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    locale: 'tr',
                    conversationId: 'conv_retry_1',
                    referenceCode: 'order_ref_failed_1'
                })
            })
        )
    })

    it('retrieves payment detail by payment id for subscription order settlement amounts', async () => {
        expect(typeof (iyzicoClient as Record<string, unknown>).retrieveIyzicoPayment).toBe('function')

        const fetchMock = vi.fn(async () => ({
            json: async () => ({
                status: 'success',
                paymentId: '29512645',
                paidPrice: 649,
                paymentStatus: 'SUCCESS'
            })
        }))
        vi.stubGlobal('fetch', fetchMock)

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
        expect(fetchMock).toHaveBeenCalledWith(
            'https://sandbox-api.iyzipay.com/payment/detail',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    locale: 'tr',
                    paymentId: '29512645'
                })
            })
        )
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
