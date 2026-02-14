import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Badge, DataTable, PageHeader, TableBody, TableCell, TableHead, TableRow } from '@/design'
import { Link } from '@/i18n/navigation'
import { Activity, Building2, Database, Sparkles, Users, Wallet } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getAdminDashboardSummary } from '@/lib/admin/read-models'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getLeads } from '@/lib/leads/list-actions'
import { getPlatformBillingDefaults, updatePlatformBillingDefaults } from '@/lib/admin/billing-settings'

interface AdminPageProps {
    searchParams: Promise<{
        billing_defaults_status?: string
        billing_defaults_error?: string
    }>
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
    const search = await searchParams
    const locale = await getLocale()
    const t = await getTranslations('admin')
    const tLeads = await getTranslations('leads')
    const { supabase } = await requireSystemAdmin(locale)
    const [summary, orgContext, billingDefaults] = await Promise.all([
        getAdminDashboardSummary(supabase),
        resolveActiveOrganizationContext(supabase),
        getPlatformBillingDefaults({ supabase })
    ])
    const billingDefaultsStatus = search.billing_defaults_status === 'success'
        ? 'success'
        : search.billing_defaults_status === 'error'
            ? 'error'
            : null
    const billingDefaultsError = search.billing_defaults_error ?? null

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

    const getBillingDefaultsStatusTitle = () => {
        if (billingDefaultsStatus === 'success') return t('billingDefaults.successTitle')
        if (billingDefaultsStatus === 'error') return t('billingDefaults.errorTitle')
        return ''
    }

    const getBillingDefaultsStatusDescription = () => {
        if (billingDefaultsStatus === 'success') {
            return t('billingDefaults.successDescription')
        }

        if (billingDefaultsStatus !== 'error') return ''

        switch (billingDefaultsError) {
        case 'unauthorized':
            return t('billingDefaults.errors.unauthorized')
        case 'forbidden':
            return t('billingDefaults.errors.forbidden')
        case 'invalid_input':
            return t('billingDefaults.errors.invalidInput')
        case 'not_available':
            return t('billingDefaults.errors.notAvailable')
        default:
            return t('billingDefaults.errors.requestFailed')
        }
    }

    const handleUpdateBillingDefaults = async (formData: FormData) => {
        'use server'

        const defaultTrialDaysRaw = String(formData.get('defaultTrialDays') ?? '').trim()
        const defaultTrialCreditsRaw = String(formData.get('defaultTrialCredits') ?? '').trim()
        const defaultPackagePriceRaw = String(formData.get('defaultPackagePriceTry') ?? '').trim()
        const defaultPackageCreditsRaw = String(formData.get('defaultPackageCredits') ?? '').trim()
        const reason = String(formData.get('billingDefaultsReason') ?? '')

        const result = await updatePlatformBillingDefaults({
            defaultTrialDays: Number.parseInt(defaultTrialDaysRaw, 10),
            defaultTrialCredits: Number.parseFloat(defaultTrialCreditsRaw),
            defaultPackagePriceTry: Number.parseFloat(defaultPackagePriceRaw),
            defaultPackageCredits: Number.parseFloat(defaultPackageCreditsRaw),
            reason
        })

        revalidatePath(`/${locale}/admin`)
        const query = new URLSearchParams()
        query.set('billing_defaults_status', result.ok ? 'success' : 'error')
        if (!result.ok && result.error) {
            query.set('billing_defaults_error', result.error)
        }
        redirect(`/${locale}/admin?${query.toString()}`)
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
        },
        {
            key: 'credits',
            icon: Wallet,
            iconBgClass: 'bg-emerald-50',
            iconClass: 'text-emerald-600',
            title: t('stats.credits'),
            value: formatter.format(summary.totalCreditUsage)
        }
    ]

    return (
        <div data-testid="admin-dashboard-page" className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader title={t('dashboardTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">{t('overview')}</p>
                    <p data-testid="admin-readonly-banner" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {t('billingControlsBanner')}
                    </p>

                    {billingDefaultsStatus && (
                        <p
                            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                                billingDefaultsStatus === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : 'border-rose-200 bg-rose-50 text-rose-900'
                            }`}
                        >
                            {getBillingDefaultsStatusTitle()}
                            {' — '}
                            {getBillingDefaultsStatusDescription()}
                        </p>
                    )}

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 space-y-1">
                            <h2 className="text-base font-semibold text-gray-900">{t('billingDefaults.title')}</h2>
                            <p className="text-sm text-gray-500">{t('billingDefaults.description')}</p>
                            <p className="text-xs text-gray-500">{t('billingDefaults.scopeNote')}</p>
                        </div>

                        <form action={handleUpdateBillingDefaults} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.trialDaysLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultTrialDays"
                                        min="1"
                                        step="1"
                                        defaultValue={String(billingDefaults.defaultTrialDays)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.trialCreditsLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultTrialCredits"
                                        min="0"
                                        step="0.1"
                                        defaultValue={String(billingDefaults.defaultTrialCredits)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.packagePriceLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultPackagePriceTry"
                                        min="0"
                                        step="0.01"
                                        defaultValue={String(billingDefaults.defaultPackagePriceTry)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.packageCreditsLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultPackageCredits"
                                        min="0"
                                        step="0.1"
                                        defaultValue={String(billingDefaults.defaultPackageCredits)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600">
                                    {t('billingDefaults.reasonLabel')}
                                </label>
                                <textarea
                                    name="billingDefaultsReason"
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={t('billingDefaults.reasonPlaceholder')}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white hover:bg-[#1f2437]"
                            >
                                {t('billingDefaults.submit')}
                            </button>
                        </form>
                    </div>

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
