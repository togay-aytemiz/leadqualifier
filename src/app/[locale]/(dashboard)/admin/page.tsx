import { getLocale, getTranslations } from 'next-intl/server'
import { Badge, DataTable, PageHeader, TableBody, TableCell, TableHead, TableRow } from '@/design'
import { Link } from '@/i18n/navigation'
import { Activity, Building2, Database, Sparkles, Users } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getAdminDashboardSummary } from '@/lib/admin/read-models'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getLeads } from '@/lib/leads/list-actions'

export default async function AdminPage() {
    const locale = await getLocale()
    const t = await getTranslations('admin')
    const tLeads = await getTranslations('leads')
    const { supabase } = await requireSystemAdmin(locale)
    const [summary, orgContext] = await Promise.all([
        getAdminDashboardSummary(supabase),
        resolveActiveOrganizationContext(supabase)
    ])

    const activeOrganization = orgContext?.activeOrganization ?? null
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
    const dateFormatter = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
    const statusLabels: Record<string, string> = {
        hot: tLeads('statusHot'),
        warm: tLeads('statusWarm'),
        cold: tLeads('statusCold'),
        ignored: tLeads('statusIgnored')
    }
    const statusVariants: Record<string, 'error' | 'warning' | 'neutral' | 'info'> = {
        hot: 'error',
        warm: 'warning',
        cold: 'neutral',
        ignored: 'info'
    }
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
            value: formatter.format(summary.messageCount)
        },
        {
            key: 'tokens',
            icon: Sparkles,
            iconBgClass: 'bg-purple-50',
            iconClass: 'text-purple-500',
            title: t('stats.tokens'),
            value: formatter.format(summary.totalTokenCount)
        }
    ]

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader title={t('dashboardTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">{t('overview')}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {t('readOnlyBanner')}
                    </p>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                            {t('selectedOrganization')}
                        </p>
                        <p className="mt-2 text-base font-semibold text-gray-900">
                            {activeOrganization?.name ?? t('noOrganizationSelected')}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                            {activeOrganization?.slug ?? t('organizationSwitcherHint')}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                            {t('organizationSwitcherHint')}
                        </p>
                    </div>

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
                                </div>
                            )
                        })}
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
                                className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200 md:col-span-2"
                            >
                                <div className="p-3 rounded-lg bg-emerald-50">
                                    <Users className="text-emerald-600" size={24} />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{t('manageLeads')}</p>
                                    <p className="text-sm text-gray-500">{t('manageLeadsDesc')}</p>
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
