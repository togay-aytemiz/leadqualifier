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
import { getOrganizationBillingLedger } from '@/lib/billing/server'
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

function resolveLedgerReasonLabel(
    tBilling: Awaited<ReturnType<typeof getTranslations>>,
    reason: string | null
) {
    if (!reason) return tBilling('ledger.reasonFallback')

    const normalizedReason = reason.trim().toLowerCase()

    if (normalizedReason === 'ai usage debit') {
        return tBilling('ledger.reasonMap.aiUsageDebit')
    }

    if (normalizedReason === 'mock subscription checkout success') {
        return tBilling('ledger.reasonMap.mockSubscriptionSuccess')
    }

    if (normalizedReason === 'mock top-up checkout success' || normalizedReason === 'mock topup checkout success') {
        return tBilling('ledger.reasonMap.mockTopupSuccess')
    }

    return reason
}

export default async function BillingSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tBilling = await getTranslations('billingUsage')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const orgContext = await resolveActiveOrganizationContext(supabase)
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
            reasonLabel: resolveLedgerReasonLabel(tBilling, entry.reason),
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
