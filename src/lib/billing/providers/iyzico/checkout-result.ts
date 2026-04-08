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

function readStringLike(value: unknown) {
    if (typeof value === 'string') return readString(value)
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    return null
}

function readTimestamp(value: unknown) {
    const timestamp = typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number(value)
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

function getRetrievedSubscriptionItems(value: unknown): Record<string, unknown>[] {
    const record = asRecord(value)
    const data = asRecord(record.data)
    const itemRecords = Array.isArray(data.items)
        ? data.items
            .map((item) => asRecord(item))
            .filter((item) => Boolean(readString(item.referenceCode)))
        : []

    if (readString(data.referenceCode)) {
        return [...itemRecords, data]
    }

    return itemRecords
}

function findRetrievedSubscriptionItem(
    value: unknown,
    subscriptionReferenceCode: string | null
) {
    return getRetrievedSubscriptionItems(value).find((itemRecord) => {
        const itemReferenceCode = readString(itemRecord.referenceCode)
        if (!subscriptionReferenceCode) return Boolean(itemReferenceCode)
        return itemReferenceCode === subscriptionReferenceCode
    }) ?? null
}

function findSuccessfulPaymentAttempt(orderRecord: Record<string, unknown>) {
    const paymentAttempts = Array.isArray(orderRecord.paymentAttempts)
        ? orderRecord.paymentAttempts.map((attempt) => asRecord(attempt))
        : []

    return paymentAttempts.find((attemptRecord) => (
        readString(attemptRecord.paymentStatus)?.toUpperCase() === 'SUCCESS'
            && Boolean(readStringLike(attemptRecord.paymentId))
    )) ?? paymentAttempts.find((attemptRecord) => Boolean(readStringLike(attemptRecord.paymentId))) ?? null
}

function buildRetrievedSubscriptionOrder(orderRecord: Record<string, unknown>) {
    const successfulPaymentAttempt = findSuccessfulPaymentAttempt(orderRecord)
    const parsedPrice = Number(orderRecord.price)

    return {
        referenceCode: readString(orderRecord.referenceCode),
        price: Number.isFinite(parsedPrice) ? parsedPrice : null,
        currencyCode: readString(orderRecord.currencyCode),
        orderStatus: readString(orderRecord.orderStatus),
        paymentId: successfulPaymentAttempt ? readStringLike(successfulPaymentAttempt.paymentId) : null,
        paymentConversationId: successfulPaymentAttempt
            ? readStringLike(successfulPaymentAttempt.conversationId)
            : null,
        startAt: toIsoFromEpochMs(orderRecord.startPeriod),
        endAt: toIsoFromEpochMs(orderRecord.endPeriod)
    }
}

function getRetrievedSubscriptionOrderSortValue(orderRecord: Record<string, unknown>) {
    const successfulPaymentAttempt = findSuccessfulPaymentAttempt(orderRecord)
    return readTimestamp(successfulPaymentAttempt?.createdDate)
        ?? readTimestamp(orderRecord.startPeriod)
        ?? readTimestamp(orderRecord.endPeriod)
        ?? readTimestamp(orderRecord.createdDate)
        ?? 0
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
    const match = findRetrievedSubscriptionItem(value, subscriptionReferenceCode)

    if (!match) return null

    return {
        referenceCode: readString(match.referenceCode),
        status: readString(match.status) ?? readString(match.subscriptionStatus),
        pricingPlanReferenceCode: readString(match.pricingPlanReferenceCode),
        startAt: toIsoFromEpochMs(match.startDate),
        endAt: toIsoFromEpochMs(match.endDate)
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
    paymentId: string | null
    paymentConversationId: string | null
    startAt: string | null
    endAt: string | null
} | null {
    if (!orderReferenceCode) return null

    const matchingItem = findRetrievedSubscriptionItem(value, subscriptionReferenceCode)

    if (!matchingItem) return null

    const orders = Array.isArray(matchingItem.orders) ? matchingItem.orders : []
    const matchingOrder = orders.find((order) => {
        const orderRecord = asRecord(order)
        return readString(orderRecord.referenceCode) === orderReferenceCode
    })

    if (!matchingOrder) return null

    const orderRecord = asRecord(matchingOrder)
    return buildRetrievedSubscriptionOrder(orderRecord)
}

export function extractIyzicoLatestSuccessfulSubscriptionOrder(
    value: unknown,
    subscriptionReferenceCode: string | null
): {
    referenceCode: string | null
    price: number | null
    currencyCode: string | null
    orderStatus: string | null
    paymentId: string | null
    paymentConversationId: string | null
    startAt: string | null
    endAt: string | null
} | null {
    const matchingItem = findRetrievedSubscriptionItem(value, subscriptionReferenceCode)

    if (!matchingItem) return null

    const successfulOrders = (Array.isArray(matchingItem.orders) ? matchingItem.orders : [])
        .map((order) => asRecord(order))
        .filter((orderRecord) => (
            readString(orderRecord.orderStatus)?.toUpperCase() === 'SUCCESS'
                || readString(findSuccessfulPaymentAttempt(orderRecord)?.paymentStatus)?.toUpperCase() === 'SUCCESS'
        ))
        .sort((left, right) => getRetrievedSubscriptionOrderSortValue(right) - getRetrievedSubscriptionOrderSortValue(left))

    const latestOrder = successfulOrders[0]
    return latestOrder ? buildRetrievedSubscriptionOrder(latestOrder) : null
}
