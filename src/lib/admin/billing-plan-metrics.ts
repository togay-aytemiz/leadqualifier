import type { Json } from '@/types/database'

function readNumericValue(input: unknown): number {
    if (typeof input === 'number' && Number.isFinite(input)) return input
    if (typeof input === 'string') {
        const parsed = Number.parseFloat(input)
        if (Number.isFinite(parsed)) return parsed
    }
    return 0
}

function readMetadataNumber(metadata: Json, key: string): number {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
        return 0
    }

    const rawValue = (metadata as Record<string, unknown>)[key]
    return readNumericValue(rawValue)
}

export function resolveMonthlySubscriptionAmountTry(metadata: Json): number {
    const requestedAmount = readMetadataNumber(metadata, 'requested_monthly_price_try')
    if (requestedAmount > 0) return requestedAmount

    return readMetadataNumber(metadata, 'monthly_price_try')
}

export function resolveMonthlyTotalPaymentAmountTry(input: {
    monthlySubscriptionAmountTry: number
    monthlyTopupAmountTry: number
}) {
    const monthlySubscriptionAmountTry = Math.max(0, readNumericValue(input.monthlySubscriptionAmountTry))
    const monthlyTopupAmountTry = Math.max(0, readNumericValue(input.monthlyTopupAmountTry))
    return monthlySubscriptionAmountTry + monthlyTopupAmountTry
}

export function resolveTopupDebitFromUsageMetadata(metadata: Json): number {
    return readMetadataNumber(metadata, 'topup_debit')
}

interface ResolveTopupUsageDebitOptions {
    metadata: Json
    creditPool: string | null
    creditsDelta: number | null
}

export function resolveTopupUsageDebit({
    metadata,
    creditPool,
    creditsDelta
}: ResolveTopupUsageDebitOptions): number {
    const fromMetadata = resolveTopupDebitFromUsageMetadata(metadata)
    if (fromMetadata > 0) return fromMetadata

    if (creditPool === 'topup_pool') {
        return Math.abs(readNumericValue(creditsDelta))
    }

    return 0
}
