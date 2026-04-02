import type { BillingLedgerEntry } from '@/lib/billing/server'

interface BillingHistorySubscriptionRow {
    metadata: unknown
}

interface BillingHistoryOrderRow {
    credits: number
    amountTry: number
    currency: string | null
}

export interface BillingHistoryRow {
    id: string
    dateLabel: string
    amountLabel: string
    statusLabel: string
    detailLabel: string
}

interface BillingHistoryLabels {
    statusSuccess: string
    amountUnavailable: string
    packageStart: string
    packageUpgrade: string
    packageRenewal: string
    packageUpdate: string
    topupPurchase: string
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
    const value = record?.[key]
    return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
    const value = record?.[key]
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function resolvePackageHistoryDetailLabel(input: {
    entry: BillingLedgerEntry
    subscriptionMetadata: Record<string, unknown> | null
    labels: BillingHistoryLabels
}) {
    const entryMetadata = toRecord(input.entry.metadata)
    const source = readString(entryMetadata, 'source')
    const changeType = readString(input.subscriptionMetadata, 'change_type')
    const normalizedReason = input.entry.reason?.trim().toLowerCase() ?? ''

    if (source === 'iyzico_subscription_webhook' || normalizedReason === 'iyzico recurring renewal success') {
        return input.labels.packageRenewal
    }

    if (changeType === 'upgrade' || normalizedReason === 'iyzico subscription upgrade success') {
        return input.labels.packageUpgrade
    }

    if (changeType === 'start' || normalizedReason === 'iyzico subscription checkout success') {
        return input.labels.packageStart
    }

    return input.labels.packageUpdate
}

function resolvePackageHistoryAmountLabel(input: {
    entry: BillingLedgerEntry
    subscriptionMetadata: Record<string, unknown> | null
    formatCurrency: (amount: number, currency: string | null) => string | null
    labels: BillingHistoryLabels
}) {
    const entryMetadata = toRecord(input.entry.metadata)
    const chargedAmount = readNumber(entryMetadata, 'charged_amount_try')
    if (chargedAmount !== null) {
        return input.formatCurrency(chargedAmount, 'TRY') ?? input.labels.amountUnavailable
    }

    const requestedPrice = readNumber(entryMetadata, 'requested_monthly_price_try')
        ?? readNumber(input.subscriptionMetadata, 'requested_monthly_price_try')
        ?? readNumber(input.subscriptionMetadata, 'monthly_price_try')

    if (requestedPrice === null) return input.labels.amountUnavailable
    return input.formatCurrency(requestedPrice, 'TRY') ?? input.labels.amountUnavailable
}

export function buildBillingHistoryRows(input: {
    entries: BillingLedgerEntry[]
    subscriptions: Map<string, BillingHistorySubscriptionRow>
    orders: Map<string, BillingHistoryOrderRow>
    formatDate: (value: string) => string
    formatCurrency: (amount: number, currency: string | null) => string | null
    labels: BillingHistoryLabels
}): BillingHistoryRow[] {
    return input.entries.flatMap((entry) => {
        const entryMetadata = toRecord(entry.metadata)

        if (entry.entryType === 'package_grant') {
            const subscriptionId = readString(entryMetadata, 'subscription_id')
                ?? readString(entryMetadata, 'subscription_record_id')
            const subscriptionMetadata = subscriptionId
                ? toRecord(input.subscriptions.get(subscriptionId)?.metadata ?? null)
                : null

            return [{
                id: entry.id,
                dateLabel: input.formatDate(entry.createdAt),
                amountLabel: resolvePackageHistoryAmountLabel({
                    entry,
                    subscriptionMetadata,
                    formatCurrency: input.formatCurrency,
                    labels: input.labels
                }),
                statusLabel: input.labels.statusSuccess,
                detailLabel: resolvePackageHistoryDetailLabel({
                    entry,
                    subscriptionMetadata,
                    labels: input.labels
                })
            }]
        }

        if (entry.entryType === 'purchase_credit') {
            const orderId = readString(entryMetadata, 'order_id')
            const order = orderId ? input.orders.get(orderId) : null

            return [{
                id: entry.id,
                dateLabel: input.formatDate(entry.createdAt),
                amountLabel: order
                    ? (input.formatCurrency(order.amountTry, order.currency) ?? input.labels.amountUnavailable)
                    : input.labels.amountUnavailable,
                statusLabel: input.labels.statusSuccess,
                detailLabel: input.labels.topupPurchase
            }]
        }

        return []
    })
}
