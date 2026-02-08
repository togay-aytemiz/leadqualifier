import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { getOrgAiUsageSummary } from '@/lib/ai/usage'
import { UsageBreakdownDetails } from './UsageBreakdownDetails'
import { formatStorageSize, getOrgMessageUsageSummary, getOrgStorageUsageSummary } from '@/lib/billing/usage'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

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

    const [usage, messageUsage, storageUsage] = await Promise.all([
        getOrgAiUsageSummary(organizationId, { supabase }),
        getOrgMessageUsageSummary(organizationId, { supabase }),
        getOrgStorageUsageSummary(organizationId, { supabase })
    ])
    const formatNumber = new Intl.NumberFormat(locale)
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
    const monthlyMessagesTotal = messageUsage.monthly.totalMessages
    const totalMessagesTotal = messageUsage.total.totalMessages
    const storageTotalSize = formatStorageSize(storageUsage.totalBytes, locale)
    const storageSkillsSize = formatStorageSize(storageUsage.skillsBytes, locale)
    const storageKnowledgeSize = formatStorageSize(storageUsage.knowledgeBytes, locale)

    return (
        <>
            <PageHeader title={tBilling('pageTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl space-y-6">
                    <p className="text-sm text-gray-500">{tBilling('description')}</p>

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
                                <p className="mt-2 text-xs text-gray-500">
                                    {tBilling('inputLabel')}: {formatNumber.format(usage.total.inputTokens)} · {tBilling('outputLabel')}: {formatNumber.format(usage.total.outputTokens)}
                                </p>
                            </div>
                        </div>

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
