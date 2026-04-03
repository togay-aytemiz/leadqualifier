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

function resolvePreviousPackagePrice(input: {
    entries: BillingLedgerEntry[]
    subscriptions: Map<string, BillingHistorySubscriptionRow>
    entryIndex: number
    subscriptionId: string | null
}) {
    if (!input.subscriptionId) return null

    for (let index = input.entryIndex + 1; index < input.entries.length; index += 1) {
        const candidate = input.entries[index]
        if (!candidate) continue
        if (candidate.entryType !== 'package_grant') continue

        const candidateMetadata = toRecord(candidate.metadata)
        const candidateSubscriptionId = readString(candidateMetadata, 'subscription_id')
            ?? readString(candidateMetadata, 'subscription_record_id')

        if (candidateSubscriptionId !== input.subscriptionId) continue

        const candidateSubscriptionMetadata = candidateSubscriptionId
            ? toRecord(input.subscriptions.get(candidateSubscriptionId)?.metadata ?? null)
            : null
        const candidatePrice = readPackageHistoryPrice(candidate, candidateSubscriptionMetadata)

        if (candidatePrice !== null) return candidatePrice
    }

    return null
}

function resolvePackageHistoryAmountLabel(input: {
    entry: BillingLedgerEntry
    subscriptionMetadata: Record<string, unknown> | null
    subscriptions: Map<string, BillingHistorySubscriptionRow>
    entries: BillingLedgerEntry[]
    entryIndex: number
    kind: BillingPackageHistoryKind
    formatCurrency: (amount: number, currency: string | null) => string | null
    labels: BillingHistoryLabels
}) {
    const entryMetadata = toRecord(input.entry.metadata)
    const chargedAmount = readNumber(entryMetadata, 'charged_amount_try')
    if (chargedAmount !== null) {
        return input.formatCurrency(chargedAmount, 'TRY') ?? input.labels.amountUnavailable
    }

    const requestedPrice = readPackageHistoryPrice(input.entry, input.subscriptionMetadata)

    if (requestedPrice === null) return input.labels.amountUnavailable

    if (input.kind === 'upgrade') {
        const subscriptionId = readString(entryMetadata, 'subscription_id')
            ?? readString(entryMetadata, 'subscription_record_id')
        const previousPrice = resolvePreviousPackagePrice({
            entries: input.entries,
            subscriptions: input.subscriptions,
            entryIndex: input.entryIndex,
            subscriptionId
        })

        if (previousPrice === null) return input.labels.amountUnavailable

        return input.formatCurrency(Math.max(0, requestedPrice - previousPrice), 'TRY') ?? input.labels.amountUnavailable
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
                    subscriptions: input.subscriptions,
                    entries: input.entries,
                    entryIndex,
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
