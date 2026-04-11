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

type BillingPackageHistoryKind = 'start' | 'upgrade' | 'renewal' | 'update'

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

function resolvePackageHistoryKind(input: {
    entry: BillingLedgerEntry
    subscriptionMetadata: Record<string, unknown> | null
}): BillingPackageHistoryKind {
    const entryMetadata = toRecord(input.entry.metadata)
    const source = readString(entryMetadata, 'source')
    const entryChangeType = readString(entryMetadata, 'change_type')
    const subscriptionChangeType = readString(input.subscriptionMetadata, 'change_type')
    const normalizedReason = input.entry.reason?.trim().toLowerCase() ?? ''

    if (source === 'iyzico_subscription_webhook' || normalizedReason === 'iyzico recurring renewal success') {
        return 'renewal'
    }

    if (
        source === 'iyzico_subscription_checkout_form'
        || normalizedReason === 'iyzico subscription checkout success'
        || entryChangeType === 'start'
        || subscriptionChangeType === 'start'
    ) {
        return 'start'
    }

    if (
        source === 'iyzico_subscription_upgrade'
        || source === 'iyzico_subscription_upgrade_checkout'
        || normalizedReason === 'iyzico subscription upgrade success'
        || entryChangeType === 'upgrade'
        || subscriptionChangeType === 'upgrade'
    ) {
        return 'upgrade'
    }

    return 'update'
}

function resolvePackageHistoryDetailLabel(input: {
    kind: BillingPackageHistoryKind
    labels: BillingHistoryLabels
}) {
    switch (input.kind) {
    case 'renewal':
        return input.labels.packageRenewal
    case 'start':
        return input.labels.packageStart
    case 'upgrade':
        return input.labels.packageUpgrade
    default:
        return input.labels.packageUpdate
    }
}

function readPackageHistoryPrice(
    entry: BillingLedgerEntry,
    subscriptionMetadata: Record<string, unknown> | null
) {
    const entryMetadata = toRecord(entry.metadata)
    return readNumber(entryMetadata, 'requested_monthly_price_try')
        ?? readNumber(subscriptionMetadata, 'requested_monthly_price_try')
        ?? readNumber(subscriptionMetadata, 'monthly_price_try')
}

function resolvePackageHistoryAmountLabel(input: {
    entry: BillingLedgerEntry
    subscriptionMetadata: Record<string, unknown> | null
    orders: Map<string, BillingHistoryOrderRow>
    kind: BillingPackageHistoryKind
    formatCurrency: (amount: number, currency: string | null) => string | null
    labels: BillingHistoryLabels
}) {
    const entryMetadata = toRecord(input.entry.metadata)
    const chargedAmount = readNumber(entryMetadata, 'charged_amount_try')
    if (chargedAmount !== null) {
        const orderReferenceCode = readString(entryMetadata, 'order_reference_code')
        const orderId = readString(entryMetadata, 'order_id')
        if (input.kind === 'upgrade' && !orderReferenceCode && !orderId) {
            return input.labels.amountUnavailable
        }

        return input.formatCurrency(chargedAmount, 'TRY') ?? input.labels.amountUnavailable
    }

    const linkedOrderId = readString(entryMetadata, 'order_id')
    if (input.kind === 'upgrade' && linkedOrderId) {
        const linkedOrder = input.orders.get(linkedOrderId)
        if (linkedOrder) {
            return input.formatCurrency(linkedOrder.amountTry, linkedOrder.currency) ?? input.labels.amountUnavailable
        }
    }

    const requestedPrice = readPackageHistoryPrice(input.entry, input.subscriptionMetadata)

    if (requestedPrice === null) return input.labels.amountUnavailable

    if (input.kind === 'upgrade') {
        return input.labels.amountUnavailable
    }

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
    return input.entries.flatMap((entry, entryIndex) => {
        const entryMetadata = toRecord(entry.metadata)

        if (entry.entryType === 'package_grant') {
            const subscriptionId = readString(entryMetadata, 'subscription_id')
                ?? readString(entryMetadata, 'subscription_record_id')
            const subscriptionMetadata = subscriptionId
                ? toRecord(input.subscriptions.get(subscriptionId)?.metadata ?? null)
                : null
            const kind = resolvePackageHistoryKind({
                entry,
                subscriptionMetadata
            })

            return [{
                id: entry.id,
                dateLabel: input.formatDate(entry.createdAt),
                amountLabel: resolvePackageHistoryAmountLabel({
                    entry,
                    subscriptionMetadata,
                    orders: input.orders,
                    kind,
                    formatCurrency: input.formatCurrency,
                    labels: input.labels
                }),
                statusLabel: input.labels.statusSuccess,
                detailLabel: resolvePackageHistoryDetailLabel({
                    kind,
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
