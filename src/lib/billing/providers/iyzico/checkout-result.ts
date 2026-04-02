function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function toIsoFromEpochMs(value: unknown) {
    const timestamp = typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number(value)
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null
    return new Date(timestamp).toISOString()
}

function readString(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function extractIyzicoCheckoutPaymentConversationId(value: unknown): string | null {
    const record = asRecord(value)
    const conversationId = record.paymentConversationId
    if (typeof conversationId === 'string' && conversationId.trim().length > 0) {
        return conversationId.trim()
    }
    return null
}

export function extractIyzicoSubscriptionReferenceCode(value: unknown): string | null {
    const record = asRecord(value)
    const data = asRecord(record.data)
    const fromData = typeof data.referenceCode === 'string' ? data.referenceCode.trim() : ''
    if (fromData) return fromData
    const fromRoot = typeof record.referenceCode === 'string' ? record.referenceCode.trim() : ''
    if (fromRoot) return fromRoot
    return null
}

export function extractIyzicoSubscriptionStartEnd(value: unknown): {
    startAt: string | null
    endAt: string | null
} {
    const record = asRecord(value)
    const data = asRecord(record.data)
    return {
        startAt: toIsoFromEpochMs(data.startDate),
        endAt: toIsoFromEpochMs(data.endDate)
    }
}

export function extractIyzicoRetrievedSubscriptionItem(
    value: unknown,
    subscriptionReferenceCode: string | null = null
): {
    referenceCode: string | null
    status: string | null
    pricingPlanReferenceCode: string | null
    startAt: string | null
    endAt: string | null
} | null {
    const record = asRecord(value)
    const data = asRecord(record.data)
    const items = Array.isArray(data.items) ? data.items : []

    const match = items.find((item) => {
        const itemRecord = asRecord(item)
        const itemReferenceCode = readString(itemRecord.referenceCode)
        if (!subscriptionReferenceCode) return Boolean(itemReferenceCode)
        return itemReferenceCode === subscriptionReferenceCode
    })

    if (!match) return null

    const itemRecord = asRecord(match)
    return {
        referenceCode: readString(itemRecord.referenceCode),
        status: readString(itemRecord.status),
        pricingPlanReferenceCode: readString(itemRecord.pricingPlanReferenceCode),
        startAt: toIsoFromEpochMs(itemRecord.startDate),
        endAt: toIsoFromEpochMs(itemRecord.endDate)
    }
}

export function extractIyzicoRetrievedSubscriptionOrder(
    value: unknown,
    subscriptionReferenceCode: string | null,
    orderReferenceCode: string | null
): {
    referenceCode: string | null
    price: number | null
    currencyCode: string | null
    orderStatus: string | null
    startAt: string | null
    endAt: string | null
} | null {
    if (!orderReferenceCode) return null

    const record = asRecord(value)
    const data = asRecord(record.data)
    const items = Array.isArray(data.items) ? data.items : []

    const matchingItem = items.find((item) => {
        const itemRecord = asRecord(item)
        const itemReferenceCode = readString(itemRecord.referenceCode)
        if (!subscriptionReferenceCode) return Boolean(itemReferenceCode)
        return itemReferenceCode === subscriptionReferenceCode
    })

    if (!matchingItem) return null

    const itemRecord = asRecord(matchingItem)
    const orders = Array.isArray(itemRecord.orders) ? itemRecord.orders : []
    const matchingOrder = orders.find((order) => {
        const orderRecord = asRecord(order)
        return readString(orderRecord.referenceCode) === orderReferenceCode
    })

    if (!matchingOrder) return null

    const orderRecord = asRecord(matchingOrder)
    const parsedPrice = Number(orderRecord.price)

    return {
        referenceCode: readString(orderRecord.referenceCode),
        price: Number.isFinite(parsedPrice) ? parsedPrice : null,
        currencyCode: readString(orderRecord.currencyCode),
        orderStatus: readString(orderRecord.orderStatus),
        startAt: toIsoFromEpochMs(orderRecord.startPeriod),
        endAt: toIsoFromEpochMs(orderRecord.endPeriod)
    }
}
