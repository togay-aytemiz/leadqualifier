import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { SettingsSection } from '@/components/settings/SettingsSection'
import {
    formatCreditAmount,
    formatStorageSize,
    getOrgCreditUsageSummary,
    getOrgStorageUsageSummary,
} from '@/lib/billing/usage'
import {
    getOrganizationBillingLedgerWindow,
    getOrganizationBillingLedgerPage,
    type BillingLedgerEntry,
    type BillingLedgerAggregateView,
    type BillingLedgerMovementFilter,
    type BillingLedgerPeriodFilter
} from '@/lib/billing/server'
import { BillingLedgerTable } from './BillingLedgerTable'
import { UsageBreakdownDetails } from './UsageBreakdownDetails'

const BILLING_LEDGER_PAGE_SIZE = 25

function resolveCompactLedgerEntryLabel(tBilling: Awaited<ReturnType<typeof getTranslations>>, value: string) {
    switch (value) {
    case 'trial_grant':
        return tBilling('ledger.entryTypeCompact.trialGrant')
    case 'package_grant':
        return tBilling('ledger.entryTypeCompact.packageGrant')
    case 'usage_debit':
        return tBilling('ledger.entryTypeCompact.usageDebit')
    case 'purchase_credit':
        return tBilling('ledger.entryTypeCompact.purchaseCredit')
    case 'adjustment':
        return tBilling('ledger.entryTypeCompact.adjustment')
    case 'refund':
        return tBilling('ledger.entryTypeCompact.refund')
    case 'reversal':
        return tBilling('ledger.entryTypeCompact.reversal')
    default:
        return value
    }
}

function resolveCompactLedgerPoolLabel(tBilling: Awaited<ReturnType<typeof getTranslations>>, value: string) {
    switch (value) {
    case 'trial_pool':
        return tBilling('ledger.poolCompact.trial')
    case 'package_pool':
        return tBilling('ledger.poolCompact.package')
    case 'topup_pool':
        return tBilling('ledger.poolCompact.topup')
    case 'mixed':
        return tBilling('ledger.poolCompact.mixed')
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

function readLedgerSubscriptionId(metadata: Record<string, unknown> | null) {
    return readString(metadata, 'subscription_id') ?? readString(metadata, 'subscription_record_id')
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
    const subscriptionId = readLedgerSubscriptionId(metadata)
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

function resolveCompactLedgerReasonLabel(
    tBilling: Awaited<ReturnType<typeof getTranslations>>,
    entry: BillingLedgerEntry
) {
    const normalizedReason = entry.reason?.trim().toLowerCase() ?? ''

    if (entry.entryType === 'usage_debit' || normalizedReason === 'ai usage debit') {
        return tBilling('ledger.reasonCompact.ai')
    }

    if (entry.entryType === 'package_grant') {
        return tBilling('ledger.reasonCompact.package')
    }

    if (entry.entryType === 'purchase_credit') {
        return tBilling('ledger.reasonCompact.topup')
    }

    if (entry.entryType === 'adjustment') {
        return tBilling('ledger.reasonCompact.adjustment')
    }

    if (entry.entryType === 'refund') {
        return tBilling('ledger.reasonCompact.refund')
    }

    if (entry.entryType === 'reversal') {
        return tBilling('ledger.reasonCompact.reversal')
    }

    if (entry.reason) return entry.reason
    return tBilling('ledger.reasonFallback')
}

async function buildLedgerTableRows(input: {
    supabase: Awaited<ReturnType<typeof createClient>>
    organizationId: string
    locale: string
    entries: BillingLedgerEntry[]
    tBilling: Awaited<ReturnType<typeof getTranslations>>
}) {
    const relatedSubscriptionIds: string[] = []
    const relatedOrderIds: string[] = []

    for (const entry of input.entries) {
        const metadata = toRecord(entry.metadata)
        const subscriptionId = readLedgerSubscriptionId(metadata)
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
        const { data, error } = await input.supabase
            .from('organization_subscription_records')
            .select('id, metadata')
            .eq('organization_id', input.organizationId)
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
        const { data, error } = await input.supabase
            .from('credit_purchase_orders')
            .select('id, credits, amount_try, currency')
            .eq('organization_id', input.organizationId)
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

    const formatDateTime = new Intl.DateTimeFormat(input.locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })

    return input.entries.map((entry) => {
        const isDebit = entry.creditsDelta < 0
        const reasonDetailLabel = resolveLedgerReasonLabel(
            input.tBilling,
            input.locale,
            entry,
            subscriptionsById,
            ordersById
        )

        return {
            id: entry.id,
            createdAt: entry.createdAt,
            dateLabel: formatDateTime.format(new Date(entry.createdAt)),
            typeLabel: resolveCompactLedgerEntryLabel(input.tBilling, entry.entryType),
            poolLabel: resolveCompactLedgerPoolLabel(input.tBilling, entry.creditPool),
            deltaLabel: `${isDebit ? '-' : '+'}${formatCreditAmount(Math.abs(entry.creditsDelta), input.locale)}`,
            balanceLabel: formatCreditAmount(entry.balanceAfter, input.locale),
            reasonLabel: resolveCompactLedgerReasonLabel(input.tBilling, entry),
            reasonDetailLabel,
            creditsDelta: entry.creditsDelta,
            balanceAfter: entry.balanceAfter,
            isDebit
        }
    })
}

interface BillingSettingsPageContentProps {
    organizationId: string
    locale: string
}

export default async function BillingSettingsPageContent({
    organizationId,
    locale
}: BillingSettingsPageContentProps) {
    const supabase = await createClient()
    const tBilling = await getTranslations('billingUsage')
    const [usage, storageUsage, billingLedger] = await Promise.all([
        getOrgCreditUsageSummary(organizationId, { supabase }),
        getOrgStorageUsageSummary(organizationId, { supabase }),
        getOrganizationBillingLedgerPage(organizationId, {
            supabase,
            limit: BILLING_LEDGER_PAGE_SIZE,
            offset: 0,
            period: 'current_month'
        })
    ])
    const [year, month] = usage.month.split('-').map(Number)
    const safeYear = Number.isFinite(year ?? Number.NaN) ? (year as number) : new Date().getFullYear()
    const safeMonth = Number.isFinite(month ?? Number.NaN) ? (month as number) : new Date().getMonth() + 1
    const monthDate = new Date(Date.UTC(safeYear, safeMonth - 1, 1))
    const monthLabel = new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: usage.timezone
    }).format(monthDate)
    const monthlyCredits = usage.monthly.credits
    const totalCredits = usage.total.credits
    const formatStorageLabel = (bytes: number) => {
        const formatted = formatStorageSize(bytes, locale)
        return `${formatted.value} ${formatted.unit}`
    }
    const storageTotalLabel = formatStorageLabel(storageUsage.totalBytes)
    const storageSkillsLabel = formatStorageLabel(storageUsage.skillsBytes)
    const storageKnowledgeLabel = formatStorageLabel(storageUsage.knowledgeBytes)
    const storageWhatsAppMediaLabel = formatStorageLabel(storageUsage.whatsappMediaBytes)
    const ledgerRows = await buildLedgerTableRows({
        supabase,
        organizationId,
        locale,
        entries: billingLedger.entries,
        tBilling
    })

    async function loadLedgerRows(input: {
        period: BillingLedgerPeriodFilter
        movement: BillingLedgerMovementFilter
        offset: number
    }) {
        'use server'

        const nextSupabase = await createClient()
        const nextTBilling = await getTranslations('billingUsage')
        const page = await getOrganizationBillingLedgerPage(organizationId, {
            supabase: nextSupabase,
            limit: BILLING_LEDGER_PAGE_SIZE,
            offset: input.offset,
            period: input.period,
            movement: input.movement
        })
        const rows = await buildLedgerTableRows({
            supabase: nextSupabase,
            organizationId,
            locale,
            entries: page.entries,
            tBilling: nextTBilling
        })

        return {
            rows,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset
        }
    }

    async function loadAggregateLedgerRows(input: {
        period: BillingLedgerPeriodFilter
        movement: BillingLedgerMovementFilter
        view: BillingLedgerAggregateView
        offset: number
    }) {
        'use server'

        const nextSupabase = await createClient()
        const nextTBilling = await getTranslations('billingUsage')
        const page = await getOrganizationBillingLedgerWindow(organizationId, {
            supabase: nextSupabase,
            period: input.period,
            movement: input.movement,
            view: input.view,
            offset: input.offset
        })
        const rows = await buildLedgerTableRows({
            supabase: nextSupabase,
            organizationId,
            locale,
            entries: page.entries,
            tBilling: nextTBilling
        })

        return {
            rows,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset
        }
    }

    return (
        <div className="flex-1 overflow-auto p-8">
            <div className="max-w-5xl space-y-6">
                <SettingsSection
                    title={tBilling('title')}
                    description={tBilling('calendarNote')}
                    descriptionAddon={<UsageBreakdownDetails usage={usage} />}
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <div className="flex items-center gap-2 text-xs tracking-wider text-gray-400">
                                <span className="uppercase">{tBilling('monthLabel')}</span>
                                <span className="text-[11px]">•</span>
                                <span className="normal-case font-medium">{monthLabel}</span>
                            </div>
                            <p className="mt-2 text-2xl font-semibold text-gray-900">
                                {formatCreditAmount(monthlyCredits, locale)}
                                <span className="ml-1 text-sm font-medium text-gray-400">{tBilling('creditsUnit')}</span>
                            </p>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('totalLabel')}</p>
                            <p className="mt-2 text-2xl font-semibold text-gray-900">
                                {formatCreditAmount(totalCredits, locale)}
                                <span className="ml-1 text-sm font-medium text-gray-400">{tBilling('creditsUnit')}</span>
                            </p>
                        </div>
                    </div>

                    {totalCredits === 0 && (
                        <p className="mt-4 text-sm text-gray-500">{tBilling('emptyState')}</p>
                    )}
                </SettingsSection>

                <SettingsSection
                    title={tBilling('storageUsageTitle')}
                    description={tBilling('storageUsageDescription')}
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('totalLabel')}</p>
                            <p className="mt-2 text-2xl font-semibold text-gray-900">{storageTotalLabel}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('storageWhatsAppMediaLabel')}</p>
                            <p className="mt-2 text-2xl font-semibold text-gray-900">{storageWhatsAppMediaLabel}</p>
                            <p className="mt-1 text-xs text-gray-500">
                                {tBilling('storageWhatsAppMediaCountLabel', {
                                    count: storageUsage.whatsappMediaObjectCount
                                })}
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('storageSkillsLabel')}</p>
                            <p className="mt-2 text-lg font-semibold text-gray-900">{storageSkillsLabel}</p>
                            <p className="mt-1 text-xs text-gray-500">
                                {tBilling('storageSkillsCountLabel', {
                                    count: storageUsage.skillCount
                                })}
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('storageKnowledgeLabel')}</p>
                            <p className="mt-2 text-lg font-semibold text-gray-900">{storageKnowledgeLabel}</p>
                            <p className="mt-1 text-xs text-gray-500">
                                {tBilling('storageKnowledgeCountLabel', {
                                    count: storageUsage.knowledgeDocumentCount
                                })}
                            </p>
                        </div>
                    </div>
                </SettingsSection>

                <SettingsSection
                    title={tBilling('ledger.title')}
                    description={tBilling('ledger.description')}
                >
                    <BillingLedgerTable
                        rows={ledgerRows}
                        columns={{
                            date: tBilling('ledger.columns.date'),
                            movement: tBilling('ledger.columns.movement'),
                            delta: tBilling('ledger.columns.delta'),
                            balance: tBilling('ledger.columns.balance'),
                            detail: tBilling('ledger.columns.detail'),
                            period: tBilling('ledger.columns.period'),
                            usage: tBilling('ledger.columns.usage'),
                            added: tBilling('ledger.columns.added'),
                            net: tBilling('ledger.columns.net'),
                            movements: tBilling('ledger.columns.movements')
                        }}
                        emptyText={tBilling('ledger.empty')}
                        showMoreLabel={tBilling('ledger.showMore')}
                        showLessLabel={tBilling('ledger.showLess')}
                        loadMoreLabel={tBilling('ledger.loadMore')}
                        loadingLabel={tBilling('ledger.loading')}
                        filterLabel={tBilling('ledger.periodLabel')}
                        viewLabel={tBilling('ledger.viewLabel')}
                        movementLabel={tBilling('ledger.movementLabel')}
                        selectedPeriod="current_month"
                        selectedView="entries"
                        selectedMovement="all"
                        periodOptions={[
                            { value: 'current_month', label: tBilling('ledger.period.currentMonth') },
                            { value: 'previous_month', label: tBilling('ledger.period.previousMonth') },
                            { value: 'all', label: tBilling('ledger.period.all') }
                        ]}
                        viewOptions={[
                            { value: 'entries', label: tBilling('ledger.view.entries') },
                            { value: 'day', label: tBilling('ledger.view.day') },
                            { value: 'week', label: tBilling('ledger.view.week') },
                            { value: 'month', label: tBilling('ledger.view.month') }
                        ]}
                        movementOptions={[
                            { value: 'all', label: tBilling('ledger.movement.all') },
                            { value: 'usage', label: tBilling('ledger.movement.usage') },
                            { value: 'loads', label: tBilling('ledger.movement.loads') }
                        ]}
                        hasMoreRows={billingLedger.hasMore}
                        nextOffset={billingLedger.nextOffset}
                        locale={locale}
                        loadRows={loadLedgerRows}
                        loadAggregateRows={loadAggregateLedgerRows}
                    />
                </SettingsSection>
            </div>
        </div>
    )
}
