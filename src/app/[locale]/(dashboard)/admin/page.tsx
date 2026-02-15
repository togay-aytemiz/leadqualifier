import { getLocale, getTranslations } from 'next-intl/server'
import { Badge, DataTable, PageHeader, TableBody, TableCell, TableHead, TableRow } from '@/design'
import { Link } from '@/i18n/navigation'
import { Activity, Building2, Database, Sparkles, Users, Wallet } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import {
    getAdminBillingPlanMetricsSummary,
    getAdminDashboardSummary,
    getAdminUsageMetricsSummary
} from '@/lib/admin/read-models'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getLeads } from '@/lib/leads/list-actions'
import { resolveAdminDashboardOrganizationContext } from '@/lib/admin/dashboard-context'
import {
    ADMIN_METRIC_PERIOD_ALL,
    buildRecentAdminMetricMonthKeys,
    resolveAdminMetricPeriodKey
} from '@/lib/admin/dashboard-metric-period'

interface AdminPageProps {
    searchParams: Promise<{
        usagePeriod?: string
    }>
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
    const locale = await getLocale()
    const t = await getTranslations('admin')
    const tLeads = await getTranslations('leads')
    const { supabase } = await requireSystemAdmin(locale)
    const [summary, orgContext, search] = await Promise.all([
        getAdminDashboardSummary(supabase),
        resolveActiveOrganizationContext(supabase),
        searchParams
    ])

    const dashboardOrgContext = resolveAdminDashboardOrganizationContext(orgContext)
    const activeOrganization = dashboardOrgContext.activeOrganization
    const scopedOrganizationId = dashboardOrgContext.hasExplicitSelection
        ? (activeOrganization?.id ?? null)
        : null
    const requestedUsagePeriod = resolveAdminMetricPeriodKey(search.usagePeriod)
    const [usageMetrics, billingPlanMetrics] = await Promise.all([
        getAdminUsageMetricsSummary({
            organizationId: scopedOrganizationId,
            periodKey: requestedUsagePeriod
        }, supabase),
        getAdminBillingPlanMetricsSummary(scopedOrganizationId, supabase)
    ])
    const recentLeadsResult = activeOrganization
        ? await getLeads(
            {
                page: 1,
                pageSize: 5,
                sortBy: 'updated_at',
                sortOrder: 'desc'
            },
            activeOrganization.id
        )
        : {
            leads: [],
            total: 0,
            page: 1,
            pageSize: 5,
            totalPages: 0
        }

    const formatter = new Intl.NumberFormat(locale)
    const monthFormatter = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        timeZone: 'UTC'
    })
    const dateFormatter = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
    const currencyFormatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 2
    })
    const creditFormatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1
    })
    const statusLabels: Record<string, string> = {
        hot: tLeads('statusHot'),
        warm: tLeads('statusWarm'),
        cold: tLeads('statusCold'),
        ignored: tLeads('statusIgnored'),
        undetermined: tLeads('statusUndetermined')
    }
    const statusVariants: Record<string, 'error' | 'warning' | 'neutral' | 'info' | 'purple'> = {
        hot: 'error',
        warm: 'warning',
        cold: 'neutral',
        ignored: 'info',
        undetermined: 'purple'
    }
    const formatPeriodLabel = (periodKey: string) => {
        if (periodKey === ADMIN_METRIC_PERIOD_ALL) return t('stats.period.allTime')
        const [yearText, monthText] = periodKey.split('-')
        const year = Number.parseInt(yearText ?? '', 10)
        const monthIndex = Number.parseInt(monthText ?? '', 10) - 1

        if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
            return t('stats.period.allTime')
        }

        return monthFormatter.format(new Date(Date.UTC(year, monthIndex, 1)))
    }
    const selectedPeriodLabel = formatPeriodLabel(usageMetrics.periodKey)
    const periodKeyCandidates = buildRecentAdminMetricMonthKeys({ months: 12 })
    if (
        usageMetrics.periodKey !== ADMIN_METRIC_PERIOD_ALL
        && !periodKeyCandidates.some((periodKey) => periodKey === usageMetrics.periodKey)
    ) {
        periodKeyCandidates.unshift(usageMetrics.periodKey)
    }
    const usagePeriodOptions = [
        {
            value: ADMIN_METRIC_PERIOD_ALL,
            label: t('stats.period.allTime')
        },
        ...periodKeyCandidates.map((periodKey) => ({
            value: periodKey,
            label: formatPeriodLabel(periodKey)
        }))
    ]

    const statCards = [
        {
            key: 'organizations',
            icon: Building2,
            iconBgClass: 'bg-purple-50',
            iconClass: 'text-purple-500',
            title: t('stats.organizations'),
            value: formatter.format(summary.organizationCount)
        },
        {
            key: 'users',
            icon: Users,
            iconBgClass: 'bg-blue-50',
            iconClass: 'text-blue-500',
            title: t('stats.users'),
            value: formatter.format(summary.userCount)
        },
        {
            key: 'skills',
            icon: Sparkles,
            iconBgClass: 'bg-green-50',
            iconClass: 'text-green-500',
            title: t('stats.skills'),
            value: formatter.format(summary.skillCount)
        },
        {
            key: 'knowledge',
            icon: Database,
            iconBgClass: 'bg-orange-50',
            iconClass: 'text-orange-500',
            title: t('stats.knowledge'),
            value: formatter.format(summary.knowledgeDocumentCount)
        },
        {
            key: 'messages',
            icon: Activity,
            iconBgClass: 'bg-red-50',
            iconClass: 'text-red-500',
            title: t('stats.messages'),
            value: formatter.format(usageMetrics.messageCount),
            periodLabel: selectedPeriodLabel
        },
        {
            key: 'tokens',
            icon: Sparkles,
            iconBgClass: 'bg-purple-50',
            iconClass: 'text-purple-500',
            title: t('stats.tokens'),
            value: formatter.format(usageMetrics.totalTokenCount),
            periodLabel: selectedPeriodLabel
        },
        {
            key: 'credits',
            icon: Wallet,
            iconBgClass: 'bg-emerald-50',
            iconClass: 'text-emerald-600',
            title: dashboardOrgContext.hasExplicitSelection ? t('stats.creditsActiveOrganization') : t('stats.credits'),
            value: formatter.format(usageMetrics.totalCreditUsage),
            periodLabel: selectedPeriodLabel
        }
    ]
    const billingDetailCards = [
        {
            key: 'monthlySubscriptionAmountTry',
            title: t('planMetrics.monthlySubscriptionAmount'),
            value: currencyFormatter.format(billingPlanMetrics.monthlySubscriptionAmountTry)
        },
        {
            key: 'monthlySubscriptionCount',
            title: t('planMetrics.monthlySubscriptionCount'),
            value: formatter.format(billingPlanMetrics.monthlySubscriptionCount)
        },
        {
            key: 'monthlyTopupAmountTry',
            title: t('planMetrics.monthlyTopupAmount'),
            value: currencyFormatter.format(billingPlanMetrics.monthlyTopupAmountTry)
        },
        {
            key: 'monthlyTopupCreditsUsed',
            title: t('planMetrics.monthlyTopupCreditsUsed'),
            value: creditFormatter.format(billingPlanMetrics.monthlyTopupCreditsUsed)
        },
        {
            key: 'monthlyTopupCreditsPurchased',
            title: t('planMetrics.monthlyTopupCreditsPurchased'),
            value: creditFormatter.format(billingPlanMetrics.monthlyTopupCreditsPurchased)
        }
    ]
    const billingScopeText = dashboardOrgContext.hasExplicitSelection
        ? t('planMetrics.scopeActiveOrganization', { organization: activeOrganization?.name ?? '-' })
        : t('planMetrics.scopePlatform')

    return (
        <div data-testid="admin-dashboard-page" className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader title={t('dashboardTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="w-full space-y-8">
                    <form method="get" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                            <label htmlFor="usagePeriod" className="text-sm font-medium text-gray-700">
                                {t('stats.period.label')}
                            </label>
                            <select
                                id="usagePeriod"
                                name="usagePeriod"
                                defaultValue={usageMetrics.periodKey}
                                className="h-10 min-w-[220px] rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 transition focus:ring-2"
                            >
                                {usagePeriodOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                                {t('stats.period.apply')}
                            </button>
                        </div>
                    </form>

                    <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-6">
                        {statCards.map((stat) => {
                            const Icon = stat.icon

                            return (
                                <div key={stat.key} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.iconBgClass}`}>
                                            <Icon className={stat.iconClass} size={20} />
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-medium text-gray-500 mb-1">{stat.title}</h3>
                                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                                    {stat.periodLabel ? (
                                        <p className="mt-1 text-xs text-gray-400">
                                            {t('stats.period.current', { period: stat.periodLabel })}
                                        </p>
                                    ) : null}
                                </div>
                            )
                        })}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <div className="mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">{t('planMetrics.title')}</h2>
                            <p className="text-sm text-gray-500">{t('planMetrics.description')}</p>
                            <p className="mt-1 text-xs text-gray-500">{billingScopeText}</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                            {billingDetailCards.map((card) => (
                                <div key={card.key} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-medium text-gray-500">{card.title}</p>
                                    <p className="mt-2 text-2xl font-semibold text-gray-900">{card.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickActions')}</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Link
                                href="/admin/organizations"
                                className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200"
                            >
                                <div className="p-3 rounded-lg bg-purple-50">
                                    <Building2 className="text-purple-500" size={24} />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{t('manageOrganizations')}</p>
                                    <p className="text-sm text-gray-500">{t('manageOrganizationsDesc')}</p>
                                </div>
                            </Link>

                            <Link
                                href="/admin/users"
                                className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200"
                            >
                                <div className="p-3 rounded-lg bg-blue-50">
                                    <Users className="text-blue-500" size={24} />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{t('manageUsers')}</p>
                                    <p className="text-sm text-gray-500">{t('manageUsersDesc')}</p>
                                </div>
                            </Link>

                            <Link
                                href="/admin/leads"
                                className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200"
                            >
                                <div className="p-3 rounded-lg bg-emerald-50">
                                    <Users className="text-emerald-600" size={24} />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{t('manageLeads')}</p>
                                    <p className="text-sm text-gray-500">{t('manageLeadsDesc')}</p>
                                </div>
                            </Link>

                            <Link
                                href="/admin/billing"
                                className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200"
                            >
                                <div className="p-3 rounded-lg bg-amber-50">
                                    <Wallet className="text-amber-600" size={24} />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{t('manageBilling')}</p>
                                    <p className="text-sm text-gray-500">{t('manageBillingDesc')}</p>
                                </div>
                            </Link>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">{t('recentLeadsTitle')}</h2>
                                <p className="text-sm text-gray-500">{t('recentLeadsDesc')}</p>
                            </div>
                            <Link href="/admin/leads" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                                {t('manageLeads')}
                            </Link>
                        </div>

                        {!activeOrganization ? (
                            <p className="text-sm text-gray-500">{t('recentLeadsNoOrganization')}</p>
                        ) : recentLeadsResult.leads.length === 0 ? (
                            <p className="text-sm text-gray-500">{t('recentLeadsEmpty')}</p>
                        ) : (
                            <DataTable>
                                <TableHead columns={[
                                    t('recentLeadsColumns.name'),
                                    t('recentLeadsColumns.status'),
                                    t('recentLeadsColumns.score'),
                                    t('recentLeadsColumns.updated')
                                ]} />
                                <TableBody>
                                    {recentLeadsResult.leads.map((lead) => (
                                        <TableRow key={lead.id}>
                                            <TableCell>
                                                <span className="font-medium text-gray-900">
                                                    {lead.conversation.contact_name}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariants[lead.status] ?? 'neutral'}>
                                                    {statusLabels[lead.status] ?? lead.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm font-semibold text-gray-900">
                                                    {lead.total_score}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">
                                                    {dateFormatter.format(new Date(lead.updated_at))}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </DataTable>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
