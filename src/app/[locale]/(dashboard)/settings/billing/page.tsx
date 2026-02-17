import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { getOrgAiUsageSummary } from '@/lib/ai/usage'
import {
    calculateAiCreditsFromTokens,
    formatCreditAmount,
} from '@/lib/billing/usage'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getOrganizationBillingLedger, type BillingLedgerEntry } from '@/lib/billing/server'
import { BillingLedgerTable } from './BillingLedgerTable'

function resolveLedgerEntryLabel(tBilling: Awaited<ReturnType<typeof getTranslations>>, value: string) {
    switch (value) {
    case 'trial_grant':
        return tBilling('ledger.entryType.trialGrant')
    case 'package_grant':
        return tBilling('ledger.entryType.packageGrant')
    case 'usage_debit':
        return tBilling('ledger.entryType.usageDebit')
    case 'purchase_credit':
        return tBilling('ledger.entryType.purchaseCredit')
    case 'adjustment':
        return tBilling('ledger.entryType.adjustment')
    case 'refund':
        return tBilling('ledger.entryType.refund')
    case 'reversal':
        return tBilling('ledger.entryType.reversal')
    default:
        return value
    }
}

function resolveLedgerPoolLabel(tBilling: Awaited<ReturnType<typeof getTranslations>>, value: string) {
    switch (value) {
    case 'trial_pool':
        return tBilling('pool.trial')
    case 'package_pool':
        return tBilling('pool.package')
    case 'topup_pool':
        return tBilling('pool.topup')
    case 'mixed':
        return tBilling('pool.mixed')
    default:
        return value
    }
}

interface LedgerSubscriptionLookupRow {
    metadata: unknown
}

interface LedgerOrderLookupRow {
    credits: number
    amountTry: number
    currency: string | null
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

function formatLedgerCurrency(locale: string, amount: number, currency: string | null) {
    if (!Number.isFinite(amount)) return null
    const normalizedCurrency = currency && currency.trim().length > 0 ? currency.trim().toUpperCase() : 'TRY'
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: normalizedCurrency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount)
    } catch {
        return null
    }
}

function resolveLedgerReasonLabel(
    tBilling: Awaited<ReturnType<typeof getTranslations>>,
    locale: string,
    entry: BillingLedgerEntry,
    subscriptions: Map<string, LedgerSubscriptionLookupRow>,
    orders: Map<string, LedgerOrderLookupRow>
) {
    const metadata = toRecord(entry.metadata)
    const source = readString(metadata, 'source')
    const subscriptionId = readString(metadata, 'subscription_id')
    const orderId = readString(metadata, 'order_id')
    const reason = entry.reason
    const normalizedReason = reason?.trim().toLowerCase() ?? ''

    if (normalizedReason === 'ai usage debit') {
        return tBilling('ledger.reasonMap.aiUsageDebit')
    }

    if (entry.entryType === 'package_grant') {
        const subscriptionMetadata = subscriptionId
            ? toRecord(subscriptions.get(subscriptionId)?.metadata ?? null)
            : null

        const changeType = readString(subscriptionMetadata, 'change_type')
        const monthlyCredits = readNumber(subscriptionMetadata, 'requested_monthly_credits')
            ?? readNumber(subscriptionMetadata, 'monthly_credits')
            ?? Math.max(0, entry.creditsDelta)
        const monthlyPriceTry = readNumber(subscriptionMetadata, 'requested_monthly_price_try')
            ?? readNumber(subscriptionMetadata, 'monthly_price_try')
        const creditsLabel = formatCreditAmount(monthlyCredits, locale)
        const priceLabel = formatLedgerCurrency(locale, monthlyPriceTry ?? Number.NaN, 'TRY') ?? '—'

        if (changeType === 'upgrade') {
            return tBilling('ledger.reasonMap.packageUpgradeDetailed', {
                credits: creditsLabel,
                price: priceLabel
            })
        }

        if (changeType === 'start') {
            return tBilling('ledger.reasonMap.packageStartDetailed', {
                credits: creditsLabel,
                price: priceLabel
            })
        }

        if (source === 'admin_assign_premium') {
            return tBilling('ledger.reasonMap.packageAssignedDetailed', {
                credits: creditsLabel,
                price: priceLabel
            })
        }

        if (normalizedReason === 'mock subscription checkout success') {
            return tBilling('ledger.reasonMap.packageUpdatedDetailed', {
                credits: creditsLabel,
                price: priceLabel
            })
        }
    }

    if (entry.entryType === 'purchase_credit') {
        const order = orderId ? orders.get(orderId) : null
        const creditsLabel = formatCreditAmount(
            Number.isFinite(order?.credits ?? Number.NaN) ? (order?.credits as number) : Math.max(0, entry.creditsDelta),
            locale
        )
        const amountLabel = order
            ? formatLedgerCurrency(locale, order.amountTry, order.currency)
            : null

        if (amountLabel) {
            return tBilling('ledger.reasonMap.topupAddedDetailed', {
                credits: creditsLabel,
                amount: amountLabel
            })
        }
    }

    if (normalizedReason === 'mock subscription checkout success') {
        return tBilling('ledger.reasonMap.mockSubscriptionSuccess')
    }

    if (normalizedReason === 'mock top-up checkout success' || normalizedReason === 'mock topup checkout success') {
        return tBilling('ledger.reasonMap.mockTopupSuccess')
    }

    if (reason) return reason
    return tBilling('ledger.reasonFallback')
}

export default async function BillingSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tBilling = await getTranslations('billingUsage')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tBilling('noOrganization')}</h2>
                    <p>{tBilling('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    const [usage, billingLedger] = await Promise.all([
        getOrgAiUsageSummary(organizationId, { supabase }),
        getOrganizationBillingLedger(organizationId, { supabase, limit: 20 })
    ])
    const formatNumber = new Intl.NumberFormat(locale)
    const formatDateTime = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    const [year, month] = usage.month.split('-').map(Number)
    const safeYear = Number.isFinite(year ?? Number.NaN) ? (year as number) : new Date().getUTCFullYear()
    const safeMonth = Number.isFinite(month ?? Number.NaN) ? (month as number) : new Date().getUTCMonth() + 1
    const monthDate = new Date(Date.UTC(safeYear, safeMonth - 1, 1))
    const monthLabel = new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(monthDate)
    const relatedSubscriptionIds: string[] = []
    const relatedOrderIds: string[] = []

    for (const entry of billingLedger) {
        const metadata = toRecord(entry.metadata)
        const subscriptionId = readString(metadata, 'subscription_id')
        const orderId = readString(metadata, 'order_id')

        if (subscriptionId && !relatedSubscriptionIds.includes(subscriptionId)) {
            relatedSubscriptionIds.push(subscriptionId)
        }
        if (orderId && !relatedOrderIds.includes(orderId)) {
            relatedOrderIds.push(orderId)
        }
    }

    const subscriptionsById = new Map<string, LedgerSubscriptionLookupRow>()
    const ordersById = new Map<string, LedgerOrderLookupRow>()

    if (relatedSubscriptionIds.length > 0) {
        const { data, error } = await supabase
            .from('organization_subscription_records')
            .select('id, metadata')
            .eq('organization_id', organizationId)
            .in('id', relatedSubscriptionIds)

        if (error) {
            console.error('Failed to load billing subscription lookup rows:', error)
        } else {
            for (const row of data ?? []) {
                subscriptionsById.set(row.id, {
                    metadata: row.metadata
                })
            }
        }
    }

    if (relatedOrderIds.length > 0) {
        const { data, error } = await supabase
            .from('credit_purchase_orders')
            .select('id, credits, amount_try, currency')
            .eq('organization_id', organizationId)
            .in('id', relatedOrderIds)

        if (error) {
            console.error('Failed to load billing order lookup rows:', error)
        } else {
            for (const row of data ?? []) {
                ordersById.set(row.id, {
                    credits: Number(row.credits ?? 0),
                    amountTry: Number(row.amount_try ?? 0),
                    currency: row.currency
                })
            }
        }
    }

    const monthlyTotal = usage.monthly.totalTokens
    const totalTotal = usage.total.totalTokens
    const monthlyCredits = calculateAiCreditsFromTokens(usage.monthly)
    const totalCredits = calculateAiCreditsFromTokens(usage.total)
    const ledgerRows = billingLedger.map((entry) => {
        const isDebit = entry.creditsDelta < 0
        return {
            id: entry.id,
            dateLabel: formatDateTime.format(new Date(entry.createdAt)),
            typeLabel: resolveLedgerEntryLabel(tBilling, entry.entryType),
            poolLabel: resolveLedgerPoolLabel(tBilling, entry.creditPool),
            deltaLabel: `${isDebit ? '-' : '+'}${formatCreditAmount(Math.abs(entry.creditsDelta), locale)}`,
            balanceLabel: formatCreditAmount(entry.balanceAfter, locale),
            reasonLabel: resolveLedgerReasonLabel(
                tBilling,
                locale,
                entry,
                subscriptionsById,
                ordersById
            ),
            isDebit
        }
    })

    return (
        <>
            <PageHeader title={tBilling('pageTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl space-y-6">
                    <SettingsSection
                        title={tBilling('title')}
                        description={tBilling('utcNote')}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <div className="flex items-center gap-2 text-xs tracking-wider text-gray-400">
                                    <span className="uppercase">{tBilling('monthLabel')}</span>
                                    <span className="text-[11px]">•</span>
                                    <span className="normal-case font-medium">{monthLabel}</span>
                                </div>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">
                                    {formatNumber.format(monthlyTotal)}
                                    <span className="ml-1 text-sm font-medium text-gray-400">{tBilling('tokensLabel')}</span>
                                </p>
                                <p className="mt-1 text-sm font-medium text-gray-700">
                                    {tBilling('creditsLabel')}: {formatCreditAmount(monthlyCredits, locale)}
                                    <span className="ml-1 text-xs text-gray-500">{tBilling('creditsUnit')}</span>
                                </p>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('totalLabel')}</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">
                                    {formatNumber.format(totalTotal)}
                                    <span className="ml-1 text-sm font-medium text-gray-400">{tBilling('tokensLabel')}</span>
                                </p>
                                <p className="mt-1 text-sm font-medium text-gray-700">
                                    {tBilling('creditsLabel')}: {formatCreditAmount(totalCredits, locale)}
                                    <span className="ml-1 text-xs text-gray-500">{tBilling('creditsUnit')}</span>
                                </p>
                            </div>
                        </div>

                        {totalTotal === 0 && (
                            <p className="mt-4 text-sm text-gray-500">{tBilling('emptyState')}</p>
                        )}
                    </SettingsSection>

                    <SettingsSection
                        title={tBilling('ledger.title')}
                        description={tBilling('ledger.description')}
                    >
                        <BillingLedgerTable
                            rows={ledgerRows}
                            columns={{
                                date: tBilling('ledger.columns.date'),
                                type: tBilling('ledger.columns.type'),
                                pool: tBilling('ledger.columns.pool'),
                                delta: tBilling('ledger.columns.delta'),
                                balance: tBilling('ledger.columns.balance'),
                                reason: tBilling('ledger.columns.reason')
                            }}
                            emptyText={tBilling('ledger.empty')}
                            showMoreLabel={tBilling('ledger.showMore')}
                            showLessLabel={tBilling('ledger.showLess')}
                        />
                    </SettingsSection>
                </div>
            </div>
        </>
    )
}
