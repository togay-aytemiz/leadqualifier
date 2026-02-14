import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { DataTable, TableHead, TableBody, TableRow, TableCell, PageHeader, Badge } from '@/design'
import { ArrowLeft, Building2 } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getAdminOrganizationListResult, type AdminBillingSnapshot } from '@/lib/admin/read-models'

interface AdminOrganizationsPageProps {
    searchParams: Promise<{ search?: string; page?: string }>
}

function resolveMembershipBadgeVariant(state: AdminBillingSnapshot['membershipState']) {
    if (state === 'premium_active') return 'purple' as const
    if (state === 'trial_active') return 'info' as const
    if (state === 'trial_exhausted' || state === 'past_due') return 'warning' as const
    if (state === 'admin_locked' || state === 'canceled') return 'error' as const
    return 'neutral' as const
}

function resolveMembershipLabel(tAdmin: Awaited<ReturnType<typeof getTranslations>>, billing: AdminBillingSnapshot) {
    switch (billing.membershipState) {
    case 'trial_active':
        return tAdmin('status.membership.trialActive')
    case 'trial_exhausted':
        return tAdmin('status.membership.trialExhausted')
    case 'premium_active':
        return tAdmin('status.membership.premiumActive')
    case 'past_due':
        return tAdmin('status.membership.pastDue')
    case 'canceled':
        return tAdmin('status.membership.canceled')
    case 'admin_locked':
        return tAdmin('status.membership.adminLocked')
    default:
        return tAdmin('status.notAvailable')
    }
}

export default async function AdminOrganizationsPage({ searchParams }: AdminOrganizationsPageProps) {
    const locale = await getLocale()
    const { supabase } = await requireSystemAdmin(locale)
    const tAdmin = await getTranslations('admin')
    const tCommon = await getTranslations('common')
    const params = await searchParams
    const search = params.search?.trim() ?? ''
    const parsedPage = Number.parseInt(params.page ?? '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

    const result = await getAdminOrganizationListResult(
        {
            search,
            page,
            pageSize: 10
        },
        supabase
    )

    const organizations = result.items
    const formatNumber = new Intl.NumberFormat(locale)
    const formatDate = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })

    const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
    const to = result.total === 0 ? 0 : from + organizations.length - 1
    const hasPrev = result.page > 1
    const hasNext = result.page < result.totalPages

    const buildPageHref = (nextPage: number) => {
        const nextSearchParams = new URLSearchParams()
        if (search) nextSearchParams.set('search', search)
        if (nextPage > 1) nextSearchParams.set('page', String(nextPage))
        const query = nextSearchParams.toString()
        return query ? `/admin/organizations?${query}` : '/admin/organizations'
    }

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={tAdmin('organizations.title')}
                breadcrumb={
                    <Link href="/admin" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="w-full space-y-8">
                    <p className="text-gray-500">{tAdmin('organizations.description')}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {tAdmin('readOnlyBanner')}
                    </p>

                    <form method="get" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <input
                                type="text"
                                name="search"
                                defaultValue={search}
                                placeholder={tAdmin('organizations.searchPlaceholder')}
                                className="h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 transition focus:ring-2"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                                >
                                    {tAdmin('organizations.searchAction')}
                                </button>
                                {search && (
                                    <Link
                                        href="/admin/organizations"
                                        className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center"
                                    >
                                        {tAdmin('organizations.clearSearch')}
                                    </Link>
                                )}
                            </div>
                        </div>
                    </form>

                    <DataTable>
                        {organizations.length === 0 ? (
                            <tbody>
                                <tr>
                                    <td colSpan={12} className="px-6 py-12 text-center">
                                        <div className="mx-auto flex max-w-md flex-col items-center">
                                            <Building2 className="mb-3 text-gray-300" size={40} />
                                            <p className="text-lg font-medium text-gray-900">
                                                {search ? tAdmin('organizations.emptySearchTitle') : tAdmin('organizations.emptyTitle')}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-500">
                                                {search ? tAdmin('organizations.emptySearchDesc') : tAdmin('organizations.emptyDesc')}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        ) : (
                            <>
                                <TableHead columns={[
                                    tAdmin('organizations.columns.name'),
                                    tAdmin('organizations.columns.slug'),
                                    tAdmin('organizations.columns.profiles'),
                                    tAdmin('organizations.columns.usage'),
                                    tAdmin('organizations.columns.tokens'),
                                    tAdmin('organizations.columns.skills'),
                                    tAdmin('organizations.columns.knowledge'),
                                    tAdmin('organizations.columns.premium'),
                                    tAdmin('organizations.columns.plan'),
                                    tAdmin('organizations.columns.trial'),
                                    tAdmin('organizations.columns.created'),
                                    tAdmin('organizations.columns.details')
                                ]} />
                                <TableBody>
                                    {organizations.map((org) => (
                                        <TableRow key={org.id}>
                                            <TableCell>
                                                <span className="font-medium text-gray-900">{org.name}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">{org.slug}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(org.profileCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(org.totalMessageCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(org.totalTokenCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(org.skillCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(org.knowledgeDocumentCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={resolveMembershipBadgeVariant(org.billing.membershipState)}>
                                                    {resolveMembershipLabel(tAdmin, org.billing)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1 text-right">
                                                    <p className="text-sm font-medium text-gray-700">
                                                        {formatNumber.format(org.billing.packageCreditsUsed)} / {formatNumber.format(org.billing.packageCreditsLimit)}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {tAdmin('status.remainingLabel', {
                                                            value: formatNumber.format(org.billing.packageCreditsRemaining)
                                                        })}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1 text-right">
                                                    <p className="text-sm font-medium text-gray-700">
                                                        {formatNumber.format(org.billing.trialCreditsUsed)} / {formatNumber.format(org.billing.trialCreditsLimit)}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {tAdmin('status.remainingLabel', {
                                                            value: formatNumber.format(org.billing.trialCreditsRemaining)
                                                        })}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">
                                                    {formatDate.format(new Date(org.createdAt))}
                                                </span>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Link
                                                    href={`/admin/organizations/${org.id}`}
                                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    {tAdmin('organizations.viewDetails')}
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </>
                        )}
                    </DataTable>

                    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm md:flex-row md:items-center md:justify-between">
                        <p>
                            {tAdmin('organizations.showing', {
                                from: formatNumber.format(from),
                                to: formatNumber.format(to),
                                total: formatNumber.format(result.total)
                            })}
                        </p>
                        <div className="flex items-center gap-2">
                            <Link
                                href={buildPageHref(result.page - 1)}
                                aria-disabled={!hasPrev}
                                className={`rounded-lg border px-3 py-1.5 transition-colors ${hasPrev ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'pointer-events-none border-gray-100 text-gray-300'}`}
                            >
                                {tAdmin('organizations.pagination.prev')}
                            </Link>
                            <span className="text-xs text-gray-500">
                                {tAdmin('organizations.page', {
                                    current: formatNumber.format(result.page),
                                    total: formatNumber.format(result.totalPages)
                                })}
                            </span>
                            <Link
                                href={buildPageHref(result.page + 1)}
                                aria-disabled={!hasNext}
                                className={`rounded-lg border px-3 py-1.5 transition-colors ${hasNext ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'pointer-events-none border-gray-100 text-gray-300'}`}
                            >
                                {tAdmin('organizations.pagination.next')}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
