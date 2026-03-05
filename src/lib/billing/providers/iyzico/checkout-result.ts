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
