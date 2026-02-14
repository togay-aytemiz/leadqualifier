import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Link } from '@/i18n/navigation'
import { getOrgAiUsageSummary } from '@/lib/ai/usage'
import { UsageBreakdownDetails } from './UsageBreakdownDetails'
import {
    calculateAiCreditsFromTokens,
    formatCreditAmount,
    formatStorageSize,
    getOrgMessageUsageSummary,
    getOrgStorageUsageSummary
} from '@/lib/billing/usage'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getOrganizationBillingLedger, getOrganizationBillingSnapshot } from '@/lib/billing/server'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'

function resolveMembershipLabel(tBilling: Awaited<ReturnType<typeof getTranslations>>, snapshot: OrganizationBillingSnapshot) {
    switch (snapshot.membershipState) {
    case 'trial_active':
        return tBilling('membership.trialActive')
    case 'trial_exhausted':
        return tBilling('membership.trialExhausted')
    case 'premium_active':
        return tBilling('membership.premiumActive')
    case 'past_due':
        return tBilling('membership.pastDue')
    case 'canceled':
        return tBilling('membership.canceled')
    case 'admin_locked':
        return tBilling('membership.adminLocked')
    default:
        return snapshot.membershipState
    }
}

function resolveLockReasonLabel(tBilling: Awaited<ReturnType<typeof getTranslations>>, snapshot: OrganizationBillingSnapshot) {
    switch (snapshot.lockReason) {
    case 'none':
        return tBilling('lockReason.none')
    case 'trial_time_expired':
        return tBilling('lockReason.trialTimeExpired')
    case 'trial_credits_exhausted':
        return tBilling('lockReason.trialCreditsExhausted')
    case 'subscription_required':
        return tBilling('lockReason.subscriptionRequired')
    case 'package_credits_exhausted':
        return tBilling('lockReason.packageCreditsExhausted')
    case 'past_due':
        return tBilling('lockReason.pastDue')
    case 'admin_locked':
        return tBilling('lockReason.adminLocked')
    default:
        return snapshot.lockReason
    }
}

function resolvePoolLabel(tBilling: Awaited<ReturnType<typeof getTranslations>>, snapshot: OrganizationBillingSnapshot) {
    switch (snapshot.activeCreditPool) {
    case 'trial_pool':
        return tBilling('pool.trial')
    case 'package_pool':
        return tBilling('pool.package')
    case 'topup_pool':
        return tBilling('pool.topup')
    case 'mixed':
        return tBilling('pool.mixed')
    default:
        return tBilling('pool.none')
    }
}

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

    const [usage, messageUsage, storageUsage, billingSnapshot, billingLedger] = await Promise.all([
        getOrgAiUsageSummary(organizationId, { supabase }),
        getOrgMessageUsageSummary(organizationId, { supabase }),
        getOrgStorageUsageSummary(organizationId, { supabase }),
        getOrganizationBillingSnapshot(organizationId, { supabase }),
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
    const monthlyMessagesTotal = messageUsage.monthly.totalMessages
    const totalMessagesTotal = messageUsage.total.totalMessages
    const storageTotalSize = formatStorageSize(storageUsage.totalBytes, locale)
    const storageSkillsSize = formatStorageSize(storageUsage.skillsBytes, locale)
    const storageKnowledgeSize = formatStorageSize(storageUsage.knowledgeBytes, locale)
    const membershipLabel = billingSnapshot ? resolveMembershipLabel(tBilling, billingSnapshot) : tBilling('membership.unavailable')
    const lockReasonLabel = billingSnapshot ? resolveLockReasonLabel(tBilling, billingSnapshot) : tBilling('lockReason.unavailable')
    const activePoolLabel = billingSnapshot ? resolvePoolLabel(tBilling, billingSnapshot) : tBilling('pool.none')

    return (
        <>
            <PageHeader title={tBilling('pageTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl space-y-6">
                    <p className="text-sm text-gray-500">{tBilling('description')}</p>
                    <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                        {tBilling('controlPanel.planActionsHint')}
                        {' '}
                        <Link href="/settings/plans" className="font-semibold underline-offset-2 hover:underline">
                            {tBilling('controlPanel.managePlansLink')}
                        </Link>
                    </p>

                    <SettingsSection
                        title={tBilling('controlPanel.title')}
                        description={tBilling('controlPanel.description')}
                    >
                        {billingSnapshot ? (
                            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-gray-400">
                                            {tBilling('controlPanel.membershipLabel')}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">{membershipLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-gray-400">
                                            {tBilling('controlPanel.lockReasonLabel')}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">{lockReasonLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-gray-400">
                                            {tBilling('controlPanel.activePoolLabel')}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">{activePoolLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-gray-400">
                                            {tBilling('controlPanel.usageStatusLabel')}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">
                                            {billingSnapshot.isUsageAllowed
                                                ? tBilling('controlPanel.usageAllowed')
                                                : tBilling('controlPanel.usageBlocked')}
                                        </p>
                                    </div>
                                </div>
                                {billingSnapshot.package.periodEnd && (
                                    <p className="mt-4 text-xs text-gray-500">
                                        {tBilling('controlPanel.packageResetAt', {
                                            date: formatDateTime.format(new Date(billingSnapshot.package.periodEnd))
                                        })}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">{tBilling('controlPanel.unavailable')}</p>
                        )}
                    </SettingsSection>

                    <SettingsSection
                        title={tBilling('ledger.title')}
                        description={tBilling('ledger.description')}
                    >
                        {billingLedger.length === 0 ? (
                            <p className="text-sm text-gray-500">{tBilling('ledger.empty')}</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">{tBilling('ledger.columns.date')}</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">{tBilling('ledger.columns.type')}</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">{tBilling('ledger.columns.pool')}</th>
                                            <th className="px-4 py-3 text-right font-medium text-gray-500">{tBilling('ledger.columns.delta')}</th>
                                            <th className="px-4 py-3 text-right font-medium text-gray-500">{tBilling('ledger.columns.balance')}</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">{tBilling('ledger.columns.reason')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {billingLedger.map((entry) => {
                                            const isDebit = entry.creditsDelta < 0
                                            return (
                                                <tr key={entry.id}>
                                                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                                                        {formatDateTime.format(new Date(entry.createdAt))}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {resolveLedgerEntryLabel(tBilling, entry.entryType)}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {resolveLedgerPoolLabel(tBilling, entry.creditPool)}
                                                    </td>
                                                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${isDebit ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {isDebit ? '-' : '+'}
                                                        {formatCreditAmount(Math.abs(entry.creditsDelta), locale)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700">
                                                        {formatCreditAmount(entry.balanceAfter, locale)}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500">
                                                        {entry.reason ?? tBilling('ledger.reasonFallback')}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SettingsSection>

                    <SettingsSection
                        title={tBilling('title')}
                        description={tBilling('utcNote')}
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
                                    {formatNumber.format(monthlyTotal)}
                                    <span className="ml-1 text-sm font-medium text-gray-400">{tBilling('tokensLabel')}</span>
                                </p>
                                <p className="mt-1 text-sm font-medium text-gray-700">
                                    {tBilling('creditsLabel')}: {formatCreditAmount(monthlyCredits, locale)}
                                    <span className="ml-1 text-xs text-gray-500">{tBilling('creditsUnit')}</span>
                                </p>
                                <p className="mt-2 text-xs text-gray-500">
                                    {tBilling('inputLabel')}: {formatNumber.format(usage.monthly.inputTokens)} · {tBilling('outputLabel')}: {formatNumber.format(usage.monthly.outputTokens)}
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
                                <p className="mt-2 text-xs text-gray-500">
                                    {tBilling('inputLabel')}: {formatNumber.format(usage.total.inputTokens)} · {tBilling('outputLabel')}: {formatNumber.format(usage.total.outputTokens)}
                                </p>
                            </div>
                        </div>

                        <p className="mt-4 text-xs text-gray-500">{tBilling('creditsFormulaNote')}</p>

                        {totalTotal === 0 && (
                            <p className="mt-4 text-sm text-gray-500">{tBilling('emptyState')}</p>
                        )}
                    </SettingsSection>

                    <SettingsSection
                        title={tBilling('messageUsageTitle')}
                        description={tBilling('messageUsageDescription')}
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <div className="flex items-center gap-2 text-xs tracking-wider text-gray-400">
                                    <span className="uppercase">{tBilling('monthLabel')}</span>
                                    <span className="text-[11px]">•</span>
                                    <span className="normal-case font-medium">{monthLabel}</span>
                                </div>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">
                                    {formatNumber.format(monthlyMessagesTotal)}
                                    <span className="ml-1 text-sm font-medium text-gray-400">{tBilling('messagesUnit')}</span>
                                </p>
                                <div className="mt-2 space-y-1 text-xs text-gray-500">
                                    <p>{tBilling('messageAiLabel')}: {formatNumber.format(messageUsage.monthly.aiGenerated)}</p>
                                    <p>{tBilling('messageOperatorLabel')}: {formatNumber.format(messageUsage.monthly.operatorSent)}</p>
                                    <p>{tBilling('messageIncomingLabel')}: {formatNumber.format(messageUsage.monthly.incoming)}</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('totalLabel')}</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">
                                    {formatNumber.format(totalMessagesTotal)}
                                    <span className="ml-1 text-sm font-medium text-gray-400">{tBilling('messagesUnit')}</span>
                                </p>
                                <div className="mt-2 space-y-1 text-xs text-gray-500">
                                    <p>{tBilling('messageAiLabel')}: {formatNumber.format(messageUsage.total.aiGenerated)}</p>
                                    <p>{tBilling('messageOperatorLabel')}: {formatNumber.format(messageUsage.total.operatorSent)}</p>
                                    <p>{tBilling('messageIncomingLabel')}: {formatNumber.format(messageUsage.total.incoming)}</p>
                                </div>
                            </div>
                        </div>

                        {totalMessagesTotal === 0 && (
                            <p className="mt-4 text-sm text-gray-500">{tBilling('messageUsageEmptyState')}</p>
                        )}
                    </SettingsSection>

                    <SettingsSection
                        title={tBilling('storageUsageTitle')}
                        description={tBilling('storageUsageDescription')}
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('totalLabel')}</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">
                                    {storageTotalSize.value}
                                    <span className="ml-1 text-sm font-medium text-gray-400">{storageTotalSize.unit}</span>
                                </p>
                                <p className="mt-2 text-xs text-gray-500">
                                    {tBilling('storageSkillsCountLabel', { count: formatNumber.format(storageUsage.skillCount) })} · {tBilling('storageKnowledgeCountLabel', { count: formatNumber.format(storageUsage.knowledgeDocumentCount) })}
                                </p>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <p className="text-xs uppercase tracking-wider text-gray-400">{tBilling('storageBreakdownLabel')}</p>
                                <div className="mt-3 space-y-3 text-sm text-gray-700">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{tBilling('storageSkillsLabel')}</span>
                                        <span>{storageSkillsSize.value} {storageSkillsSize.unit}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{tBilling('storageKnowledgeLabel')}</span>
                                        <span>{storageKnowledgeSize.value} {storageKnowledgeSize.unit}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <p className="mt-4 text-xs text-gray-500">{tBilling('storageUsageApproxNote')}</p>
                    </SettingsSection>
                </div>
            </div>
        </>
    )
}
