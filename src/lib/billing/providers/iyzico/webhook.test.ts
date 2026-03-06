import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
    isValidIyzicoSubscriptionWebhookSignature,
    readIyzicoSubscriptionWebhookPayload
} from '@/lib/billing/providers/iyzico/webhook'

function buildSignature(input: {
    secretKey: string
    merchantId: string
    eventType: string
    subscriptionReferenceCode: string
    orderReferenceCode: string
    customerReferenceCode: string
}) {
    const payload = [
        input.secretKey,
        input.merchantId,
        input.eventType,
        input.subscriptionReferenceCode,
        input.orderReferenceCode,
        input.customerReferenceCode
    ].join('')

    return crypto.createHmac('sha256', input.secretKey).update(payload).digest('hex')
}

describe('iyzico subscription webhook helpers', () => {
    it('validates subscription webhook signatures with the documented field order', () => {
        const payload = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.success',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: payload.merchantId,
            eventType: payload.iyziEventType,
            subscriptionReferenceCode: payload.subscriptionReferenceCode,
            orderReferenceCode: payload.orderReferenceCode,
            customerReferenceCode: payload.customerReferenceCode
        })

        expect(isValidIyzicoSubscriptionWebhookSignature({
            payload,
            signature,
            secretKey: 'secret-key'
        })).toBe(true)
    })

    it('rejects invalid subscription webhook signatures', () => {
        expect(isValidIyzicoSubscriptionWebhookSignature({
            payload: {
                merchantId: 'merchant_1',
                iyziEventType: 'subscription.order.failure',
                subscriptionReferenceCode: 'sub_ref_1',
                orderReferenceCode: 'order_ref_1',
                customerReferenceCode: 'customer_ref_1'
            },
            signature: 'not-valid',
            secretKey: 'secret-key'
        })).toBe(false)
    })

    it('normalizes subscription webhook payload fields', () => {
        expect(readIyzicoSubscriptionWebhookPayload({
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.failure',
            iyziReferenceCode: 'iyzi_ref_1',
            iyziEventTime: 1753190040185,
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_1',
            customerReferenceCode: 'customer_ref_1'
        })).toEqual({
            merchantId: 'merchant_1',
            eventType: 'subscription.order.failure',
            eventReferenceCode: 'iyzi_ref_1',
            eventTime: 1753190040185,
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_1',
            customerReferenceCode: 'customer_ref_1'
        })
    })
})
