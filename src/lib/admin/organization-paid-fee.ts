import { resolveBillingCurrencyByRegion, type BillingCurrency } from '@/lib/billing/pricing-catalog'
import type { Json } from '@/types/database'

export interface AdminOrganizationPaidFee {
    amount: number | null
    currency: BillingCurrency | null
}

const EMPTY_PAID_FEE: AdminOrganizationPaidFee = {
    amount: null,
    currency: null
}

function readNumericValue(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return 0
}

function normalizeCurrency(value: unknown): BillingCurrency | null {
    if (typeof value !== 'string') return null

    const normalized = value.trim().toUpperCase()
    if (normalized === 'TRY' || normalized === 'USD') return normalized
    return null
}

function readMetadataNumber(metadata: Json, key: string): number {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
        return 0
    }

    const rawValue = (metadata as Record<string, unknown>)[key]
    return readNumericValue(rawValue)
}

function readMetadataCurrency(metadata: Json, key: string): BillingCurrency | null {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
        return null
    }

    const rawValue = (metadata as Record<string, unknown>)[key]
    return normalizeCurrency(rawValue)
}

function resolveFirstPositiveAmount(metadata: Json, keys: string[]) {
    for (const key of keys) {
        const value = readMetadataNumber(metadata, key)
        if (value > 0) return value
    }
    return 0
}

function resolveFirstKnownCurrency(metadata: Json, keys: string[]) {
    for (const key of keys) {
        const currency = readMetadataCurrency(metadata, key)
        if (currency) return currency
    }
    return null
}

export function resolveAdminOrganizationPaidFee(input: {
    metadata: Json
    organizationBillingRegion: string | null | undefined
}): AdminOrganizationPaidFee {
    const tryAmount = resolveFirstPositiveAmount(input.metadata, ['requested_monthly_price_try', 'monthly_price_try'])
    if (tryAmount > 0) {
        return {
            amount: tryAmount,
            currency: 'TRY'
        }
    }

    const usdAmount = resolveFirstPositiveAmount(input.metadata, ['requested_monthly_price_usd', 'monthly_price_usd'])
    if (usdAmount > 0) {
        return {
            amount: usdAmount,
            currency: 'USD'
        }
    }

    const genericAmount = resolveFirstPositiveAmount(input.metadata, [
        'requested_monthly_price',
        'requested_monthly_amount',
        'monthly_price'
    ])
    if (genericAmount <= 0) return EMPTY_PAID_FEE

    const metadataCurrency = resolveFirstKnownCurrency(input.metadata, [
        'requested_monthly_price_currency',
        'requested_currency',
        'currency',
        'monthly_price_currency'
    ])

    return {
        amount: genericAmount,
        currency: metadataCurrency ?? resolveBillingCurrencyByRegion(input.organizationBillingRegion)
    }
}
