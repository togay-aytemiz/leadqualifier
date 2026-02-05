import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { Sidebar, SidebarGroup, SidebarItem, PageHeader } from '@/design'
import { Zap, CreditCard, Receipt, Settings, Sparkles, User, Building2 } from 'lucide-react'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { getOrgAiUsageSummary } from '@/lib/ai/usage'
import { UsageBreakdownDetails } from './UsageBreakdownDetails'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'

export default async function BillingSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const tBilling = await getTranslations('billingUsage')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    const organizationId = membership?.organization_id

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

    const [usage, pendingCount] = await Promise.all([
        getOrgAiUsageSummary(organizationId, { supabase }),
        getPendingOfferingProfileSuggestionCount(organizationId, locale)
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

    return (
        <>
            <Sidebar title={tSidebar('settings')}>
                <SidebarGroup title={tSidebar('preferences')}>
                    <SidebarItem
                        icon={<User size={18} />}
                        label={tSidebar('profile')}
                        href={locale === 'tr' ? '/settings/profile' : `/${locale}/settings/profile`}
                    />
                    <SidebarItem
                        icon={<Building2 size={18} />}
                        label={tSidebar('organization')}
                        href={locale === 'tr' ? '/settings/organization' : `/${locale}/settings/organization`}
                        indicator={pendingCount > 0}
                    />
                    <SidebarItem
                        icon={<Settings size={18} />}
                        label={tSidebar('general')}
                        href={locale === 'tr' ? '/settings/general' : `/${locale}/settings/general`}
                    />
                    <SidebarItem
                        icon={<Sparkles size={18} />}
                        label={tSidebar('ai')}
                        href={locale === 'tr' ? '/settings/ai' : `/${locale}/settings/ai`}
                    />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('integrations')}>
                    <SidebarItem
                        icon={<Zap size={18} />}
                        label={tSidebar('channels')}
                        href={locale === 'tr' ? '/settings/channels' : `/${locale}/settings/channels`}
                    />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('billing')}>
                    <SidebarItem
                        icon={<CreditCard size={18} />}
                        label={tSidebar('plans')}
                        href="#"
                    />
                    <SidebarItem
                        icon={<Receipt size={18} />}
                        label={tSidebar('receipts')}
                        active
                        href={locale === 'tr' ? '/settings/billing' : `/${locale}/settings/billing`}
                    />
                </SidebarGroup>
            </Sidebar>

            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
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
                    </div>
                </div>
            </div>
        </>
    )
}
