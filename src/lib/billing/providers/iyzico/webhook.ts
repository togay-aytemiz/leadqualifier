import crypto from 'node:crypto'

interface IyzicoSubscriptionWebhookCandidate {
    merchantId?: unknown
    iyziEventType?: unknown
    iyziReferenceCode?: unknown
    iyziEventTime?: unknown
    subscriptionReferenceCode?: unknown
    orderReferenceCode?: unknown
    customerReferenceCode?: unknown
}

export interface IyzicoSubscriptionWebhookPayload {
    merchantId: string
    eventType: string
    eventReferenceCode: string | null
    eventTime: number | null
    subscriptionReferenceCode: string
    orderReferenceCode: string
    customerReferenceCode: string
}

function readString(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function readEventTime(value: unknown) {
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

export function readIyzicoSubscriptionWebhookPayload(
    payload: unknown
): IyzicoSubscriptionWebhookPayload | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null

    const candidate = payload as IyzicoSubscriptionWebhookCandidate
    const merchantId = readString(candidate.merchantId)
    const eventType = readString(candidate.iyziEventType)
    const subscriptionReferenceCode = readString(candidate.subscriptionReferenceCode)
    const orderReferenceCode = readString(candidate.orderReferenceCode)
    const customerReferenceCode = readString(candidate.customerReferenceCode)

    if (
        !merchantId
        || !eventType
        || !subscriptionReferenceCode
        || !orderReferenceCode
        || !customerReferenceCode
    ) {
        return null
    }

    return {
        merchantId,
        eventType,
        eventReferenceCode: readString(candidate.iyziReferenceCode),
        eventTime: readEventTime(candidate.iyziEventTime),
        subscriptionReferenceCode,
        orderReferenceCode,
        customerReferenceCode
    }
}

function buildIyzicoSubscriptionWebhookCanonicalString(payload: IyzicoSubscriptionWebhookPayload, secretKey: string) {
    return [
        secretKey,
        payload.merchantId,
        payload.eventType,
        payload.subscriptionReferenceCode,
        payload.orderReferenceCode,
        payload.customerReferenceCode
    ].join('')
}

export function isValidIyzicoSubscriptionWebhookSignature(input: {
    payload: unknown
    signature: string | null | undefined
    secretKey: string | null | undefined
}) {
    const payload = readIyzicoSubscriptionWebhookPayload(input.payload)
    const signature = readString(input.signature)
    const secretKey = readString(input.secretKey)

    if (!payload || !signature || !secretKey) {
        return false
    }

    const expected = crypto
        .createHmac('sha256', secretKey)
        .update(buildIyzicoSubscriptionWebhookCanonicalString(payload, secretKey))
        .digest('hex')

    if (signature.length !== expected.length) {
        return false
    }

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
